// === ECHTE on-chain Supply Chain Darkpool — Persistent SupplyBook via Phantom + Arcium MPC ===
const SUPPLY_CLUSTER = 456;
const SUPPLY_PROGRAM_ID_STR = "2ZSujxXU6y1yZVwP6bG72GsnL5cXF3LCwkTKz2JPDhqt";
const SUPPLY_RPC = "https://solana-devnet.core.chainstack.com/82e99e28fb99448c56b313e55d740497";

function supReadUInt32LE(bytes) {
  return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

async function getSupplyProgram() {
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;
  const PROGRAM_ID = new SDK.PublicKey(SUPPLY_PROGRAM_ID_STR);
  const conn = new SDK.Connection(SUPPLY_RPC, { commitment: "confirmed" });
  const ownerPubkey = new SDK.PublicKey(wPub);
  const wallet = {
    publicKey: ownerPubkey,
    signTransaction: (t) => phantomProvider.signTransaction(t),
    signAllTransactions: (ts) => phantomProvider.signAllTransactions(ts),
  };
  const provider = new SDK.anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const idlResp = await fetch('supply_chain_darkpool.json');
  const IDL = await idlResp.json();
  IDL.address = PROGRAM_ID.toBase58();
  const prog = new SDK.anchor.Program(IDL, provider);
  return { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider };
}

function supplyLog(label, msg, cls) {
  const el = document.getElementById('supply-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('nl-NL');
  const div = document.createElement('div');
  div.className = 'elog-entry ' + (cls || '');
  div.innerHTML = '<span class="ets">' + ts + '</span> <b>' + label + '</b> ' + msg;
  el.prepend(div);
}

function getSupplyBookPDA(SDK, PROGRAM_ID) {
  return SDK.PublicKey.findProgramAddressSync([Buffer.from("supply_book")], PROGRAM_ID)[0];
}

// === REGISTER SUPPLY (aanbod of vraag) ===
async function submitRegisterSupply() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  supplyLog('register_supply', 'aanbieding voorbereiden...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getSupplyProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const material = +document.getElementById('s-material').value;
    const quantity = +document.getElementById('s-quantity').value;
    const price    = +document.getElementById('s-price').value;
    const isSupply = document.getElementById('s-is-supply').checked ? 1 : 0;
    const expiresAt = +(document.getElementById('s-expires') ? document.getElementById('s-expires').value : 0) || 0;

    const vals = [material, quantity, price, isSupply, expiresAt].map(BigInt);
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getSupplyBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(SUPPLY_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(SUPPLY_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(SUPPLY_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(SUPPLY_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        supReadUInt32LE(SDK.getCompDefAccOffset('register_supply'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      supplyBookState: bookPDA,
    };

    supplyLog('register_supply', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.registerSupply(
      off, cts[0], cts[1], cts[2], cts[3], cts[4], pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    supplyLog('register_supply INGEDIEND', `mat=${material} qty=${quantity} supply=${isSupply} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    supplyLog('Fout bij register_supply', e.message || String(e), 'err');
  }
}

// === MATCH SUPPLY ===
async function submitMatchSupply() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  supplyLog('match_supply', 'matching starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getSupplyProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const material = +document.getElementById('s-match-material').value;
    const currentTime = Math.floor(Date.now() / 1000);

    const vals = [BigInt(material)];
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getSupplyBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(SUPPLY_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(SUPPLY_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(SUPPLY_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(SUPPLY_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        supReadUInt32LE(SDK.getCompDefAccOffset('match_supply'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      supplyBookState: bookPDA,
    };

    supplyLog('match_supply', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.matchSupply(
      off, cts[0], new SDK.BN(currentTime), pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    supplyLog('match_supply INGEDIEND', `mat=${material} | Tx: ${sig.slice(0,12)}... (indices volgen via SupplyMatchEvent)`, 'ok');
  } catch (e) {
    console.error(e);
    supplyLog('Fout bij match_supply', e.message || String(e), 'err');
  }
}

// === SETTLE SUPPLY ===
async function submitSettleSupply() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  supplyLog('settle_supply', 'settlement starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getSupplyProgram();
    const supplyIdx = +document.getElementById('s-settle-supply').value;
    const demandIdx = +document.getElementById('s-settle-demand').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getSupplyBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(SUPPLY_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(SUPPLY_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(SUPPLY_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(SUPPLY_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        supReadUInt32LE(SDK.getCompDefAccOffset('settle_supply'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      supplyBookState: bookPDA,
    };

    supplyLog('settle_supply', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.settleSupply(
      off, new SDK.BN(supplyIdx), new SDK.BN(demandIdx)
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    supplyLog('settle_supply GESLAAGD', `supply_idx=${supplyIdx} demand_idx=${demandIdx} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    supplyLog('Fout bij settle_supply', e.message || String(e), 'err');
  }
}

// === CANCEL SUPPLY ===
async function submitCancelSupply() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  supplyLog('cancel_supply', 'annuleren...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getSupplyProgram();
    const index = +document.getElementById('s-cancel-idx').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getSupplyBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(SUPPLY_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(SUPPLY_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(SUPPLY_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(SUPPLY_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        supReadUInt32LE(SDK.getCompDefAccOffset('cancel_supply'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      supplyBookState: bookPDA,
    };

    supplyLog('cancel_supply', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.cancelSupply(
      off, new SDK.BN(index)
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    supplyLog('cancel_supply GESLAAGD', `index=${index} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    supplyLog('Fout bij cancel_supply', e.message || String(e), 'err');
  }
}

// === ECHTE on-chain Chip Darkpool — Persistent ChipBook via Phantom + Arcium MPC ===
const CHIP_CLUSTER = 456;
const CHIP_PROGRAM_ID_STR = "GN6yjobt8ygSs5KAUnAwtPKcTTzx6596yQ2zkbMt7qde";
const CHIP_RPC = "https://solana-devnet.core.chainstack.com/82e99e28fb99448c56b313e55d740497";

function chipReadUInt32LE(bytes) {
  return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

async function getChipProgram() {
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;
  const PROGRAM_ID = new SDK.PublicKey(CHIP_PROGRAM_ID_STR);
  const conn = new SDK.Connection(CHIP_RPC, { commitment: "confirmed" });
  const ownerPubkey = new SDK.PublicKey(wPub);
  const wallet = {
    publicKey: ownerPubkey,
    signTransaction: (t) => phantomProvider.signTransaction(t),
    signAllTransactions: (ts) => phantomProvider.signAllTransactions(ts),
  };
  const provider = new SDK.anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const idlResp = await fetch('chip_darkpool.json');
  const IDL = await idlResp.json();
  IDL.address = PROGRAM_ID.toBase58();
  const prog = new SDK.anchor.Program(IDL, provider);
  return { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider };
}

function chipLog(label, msg, cls) {
  const el = document.getElementById('chip-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('nl-NL');
  const div = document.createElement('div');
  div.className = 'elog-entry ' + (cls || '');
  div.innerHTML = '<span class="ets">' + ts + '</span> <b>' + label + '</b> ' + msg;
  el.prepend(div);
}

function getChipBookPDA(SDK, PROGRAM_ID) {
  return SDK.PublicKey.findProgramAddressSync([Buffer.from("chip_book")], PROGRAM_ID)[0];
}

// === REGISTER CHIP (aanbod of vraag) ===
async function submitRegisterChip() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  chipLog('register_chip', 'aanbod voorbereiden...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getChipProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const chipType = +document.getElementById('c-chip-type').value;
    const volume   = +document.getElementById('c-volume').value;
    const price    = +document.getElementById('c-price').value;
    const isSupply = document.getElementById('c-is-supply').checked ? 1 : 0;
    const expiresAt = +(document.getElementById('c-expires') ? document.getElementById('c-expires').value : 0) || 0;

    const vals = [chipType, volume, price, isSupply, expiresAt].map(BigInt);
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getChipBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(CHIP_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CHIP_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CHIP_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CHIP_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        chipReadUInt32LE(SDK.getCompDefAccOffset('register_chip'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      chipBookState: bookPDA,
    };

    chipLog('register_chip', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.registerChip(
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
    chipLog('register_chip INGEDIEND', `type=${chipType} vol=${volume} supply=${isSupply} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    chipLog('Fout bij register_chip', e.message || String(e), 'err');
  }
}

// === MATCH CHIP ===
async function submitMatchChip() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  chipLog('match_chip', 'matching starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getChipProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const chipType = +document.getElementById('c-match-type').value;
    const currentTime = Math.floor(Date.now() / 1000);

    const vals = [BigInt(chipType)];
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getChipBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(CHIP_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CHIP_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CHIP_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CHIP_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        chipReadUInt32LE(SDK.getCompDefAccOffset('match_chip'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      chipBookState: bookPDA,
    };

    chipLog('match_chip', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.matchChip(
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
    chipLog('match_chip INGEDIEND', `type=${chipType} | Tx: ${sig.slice(0,12)}... (indices volgen via ChipMatchEvent)`, 'ok');
  } catch (e) {
    console.error(e);
    chipLog('Fout bij match_chip', e.message || String(e), 'err');
  }
}

// === SETTLE CHIP ===
async function submitSettleChip() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  chipLog('settle_chip', 'settlement starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getChipProgram();
    const supplyIdx = +document.getElementById('c-settle-supply').value;
    const demandIdx = +document.getElementById('c-settle-demand').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getChipBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(CHIP_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CHIP_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CHIP_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CHIP_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        chipReadUInt32LE(SDK.getCompDefAccOffset('settle_chip'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      chipBookState: bookPDA,
    };

    chipLog('settle_chip', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.settleChip(
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
    chipLog('settle_chip GESLAAGD', `supply_idx=${supplyIdx} demand_idx=${demandIdx} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    chipLog('Fout bij settle_chip', e.message || String(e), 'err');
  }
}

// === CANCEL CHIP ===
async function submitCancelChip() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  chipLog('cancel_chip', 'annuleren...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getChipProgram();
    const index = +document.getElementById('c-cancel-idx').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const bookPDA = getChipBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(CHIP_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CHIP_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CHIP_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CHIP_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        chipReadUInt32LE(SDK.getCompDefAccOffset('cancel_chip'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      chipBookState: bookPDA,
    };

    chipLog('cancel_chip', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.cancelChip(
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
    chipLog('cancel_chip GESLAAGD', `index=${index} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    chipLog('Fout bij cancel_chip', e.message || String(e), 'err');
  }
}

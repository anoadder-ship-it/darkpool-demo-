// === ECHTE on-chain supply-match via Phantom + Arcium MPC ===
// Hergebruikt pollForResult() en showResult() uit trading-real-app.js
async function submitRealSupplyMatch() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;

  const btn = document.getElementById('bs');
  btn.disabled = true;
  const statusEl = document.getElementById('rs-status') || (function(){
    const d = document.createElement('div');
    d.id = 'rs-status';
    d.style.cssText = 'font-size:12px;color:var(--text2);margin-top:8px';
    document.getElementById('rs').parentNode.appendChild(d);
    return d;
  })();
  statusEl.textContent = 'Transactie opbouwen...';

  try {
    const HELIUS = "https://devnet.helius-rpc.com/?api-key=a17d9b5b-f33c-4c56-ad16-84bb71b13779";
    const CLUSTER = 456;
    const PROGRAM_ID = new SDK.PublicKey("3HQHpSBSgYkx81E25bSJZVz4mGoW6nQFJWDtZL9fmMR4");
    const conn = new SDK.Connection(HELIUS, { commitment: "confirmed" });

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

    statusEl.textContent = 'MXE-sleutel ophalen...';
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const material = +document.getElementById('sm').value;
    const qty = +document.getElementById('sq').value;
    const quality = +document.getElementById('sql').value;
    const price = +document.getElementById('sp').value;
    const delivery = +document.getElementById('sd').value;
    const region = +document.getElementById('sr').value;

    const qMaterial = +document.getElementById('sqm').value;
    const qMinQty = +document.getElementById('sqn').value;
    const qMinQuality = +document.getElementById('sqql').value;
    const qMaxPrice = +document.getElementById('sqp').value;
    // UI toont geen 'max delivery' en 'regio' voor de vraagzijde -- zinnige defaults.
    const qMaxDelivery = 30;
    const qRegion = region; // default: zelfde regio als aanbod (niet in UI)

    const vals = [
      material, qty, quality, price, delivery, region,
      qMaterial, qMinQty, qMinQuality, qMaxPrice, qMaxDelivery, qRegion,
    ].map(BigInt);

    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    function readUInt32LE(bytes) {
      return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    }
    const accs = {
      computationAccount: SDK.getComputationAccAddress(CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('match_supply'))
      ),
    };

    statusEl.textContent = 'Wachten op Phantom-ondertekening...';
    const tx = await prog.methods.matchSupply(
      off, cts[0], cts[1], cts[2], cts[3], cts[4], cts[5],
      cts[6], cts[7], cts[8], cts[9], cts[10], cts[11],
      pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;

    const signedTx = await phantomProvider.signTransaction(tx);
    statusEl.textContent = 'Transactie versturen...';
    const sig = await conn.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
    statusEl.innerHTML = 'Ingediend: <a href="https://explorer.solana.com/tx/' + sig + '?cluster=devnet" target="_blank">' + sig.slice(0, 12) + '...</a>';

    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    statusEl.textContent = 'Bevestigd. Wachten op Arcium MPC-resultaat (kan ~30-60s duren)...';

    const compAccBase58 = accs.computationAccount.toBase58();
    const baseline = new Set((await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 20 })).map(s => s.signature));
    baseline.delete(sig);

    const result = await pollForResult(conn, prog, cipher, compAccBase58, baseline, 180000, 'supplyMatchedEvent');

    if (!result) {
      statusEl.textContent = 'Nog geen MPC-resultaat na 180s. De transactie zelf is wel geslaagd on-chain -- de Arcium MPC-cluster op devnet kan soms langer nodig hebben. Probeer het later opnieuw.';
      btn.disabled = false;
      return;
    }

    const matched = result[0] === 1n;
    const score = result[1];
    if (matched) {
      show('s', 'matched = 1', 'Score: ' + score + '/96 — ECHT on-chain resultaat', 'ok');
    } else {
      show('s', 'matched = 0', 'Score: ' + score + '/96 — ECHT on-chain resultaat', '');
    }
    statusEl.textContent = 'Klaar — resultaat rechtstreeks van Arcium MPC-callback.';
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Fout: ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

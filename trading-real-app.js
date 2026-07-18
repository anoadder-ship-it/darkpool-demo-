// === ECHTE on-chain trading-match via Phantom + Arcium MPC ===
async function submitRealTradingMatch() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;

  const btn = document.getElementById('bt');
  btn.disabled = true;
  const statusEl = document.getElementById('rt-status') || (function(){
    const d = document.createElement('div');
    d.id = 'rt-status';
    d.style.cssText = 'font-size:12px;color:var(--text2);margin-top:8px';
    document.getElementById('rt').parentNode.appendChild(d);
    return d;
  })();
  statusEl.textContent = 'Transactie opbouwen...';

  try {
    const HELIUS = "https://devnet.helius-rpc.com/?api-key=a17d9b5b-f33c-4c56-ad16-84bb71b13779";
    const CLUSTER = 456;
    const PROGRAM_ID = new SDK.PublicKey("h6zsnHt28NpeS94Ek3fQP1YEiu1WrpGT2pKynWZzKVX");
    const conn = new SDK.Connection(HELIUS, { commitment: "confirmed" });

    const ownerPubkey = new SDK.PublicKey(wPub);
    const wallet = {
      publicKey: ownerPubkey,
      signTransaction: (t) => phantomProvider.signTransaction(t),
      signAllTransactions: (ts) => phantomProvider.signAllTransactions(ts),
    };
    const provider = new SDK.anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });

    const idlResp = await fetch('solana_darkpool.json');
    const IDL = await idlResp.json();
    IDL.address = PROGRAM_ID.toBase58();
    const prog = new SDK.anchor.Program(IDL, provider);

    statusEl.textContent = 'MXE-sleutel ophalen...';
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const buyBid = +document.getElementById('t-bb').value;
    const sellBid = +document.getElementById('t-sb').value;

    const vals = [buyBid, sellBid].map(BigInt);
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
        readUInt32LE(SDK.getCompDefAccOffset('match_orders'))
      ),
    };

    statusEl.textContent = 'Wachten op Phantom-ondertekening...';
    const tx = await prog.methods.matchOrders(
      off, cts[0], cts[1], pubArr, nonce
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

    const result = await pollForResult(conn, prog, cipher, compAccBase58, baseline, 180000, 'matchEvent');

    if (!result) {
      statusEl.textContent = 'Nog geen MPC-resultaat na 180s. De transactie zelf is wel geslaagd on-chain -- de Arcium MPC-cluster op devnet kan soms langer nodig hebben. Probeer het later opnieuw.';
      btn.disabled = false;
      return;
    }

    const matched = result[0] === 1n;
    if (matched) {
      show('t', 'matched = 1', 'ECHT on-chain resultaat', 'ok');
    } else {
      show('t', 'matched = 0', 'ECHT on-chain resultaat', '');
    }
    statusEl.textContent = 'Klaar — resultaat rechtstreeks van Arcium MPC-callback.';
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Fout: ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}


async function pollForResult(conn, prog, cipher, computationAccountBase58, seenSet, timeoutMs, eventName) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let sigs;
    try {
      sigs = await conn.getSignaturesForAddress(prog.programId, { limit: 20 });
    } catch (e) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
    for (const s of sigs) {
      if (seenSet.has(s.signature)) continue;
      seenSet.add(s.signature);
      if (s.err) continue;
      let tx;
      try {
        tx = await conn.getTransaction(s.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      } catch (e) { continue; }
      if (!tx) continue;
      const msg = tx.transaction.message;
      const keys = msg.staticAccountKeys ? msg.staticAccountKeys : msg.accountKeys;
      const bevatAccount = keys.some(k => k.toBase58() === computationAccountBase58);
      if (!bevatAccount) continue;
      const logs = tx.meta && tx.meta.logMessages || [];
      for (const log of logs) {
        if (!log.startsWith('Program data: ')) continue;
        let decoded;
        try { decoded = prog.coder.events.decode(log.slice('Program data: '.length)); }
        catch (e) { continue; }
        if (!decoded || decoded.name !== eventName) continue;
        try {
          const nonce = new Uint8Array(decoded.data.nonce);
          if (decoded.data.result) {
            return cipher.decrypt([Array.from(decoded.data.result)], nonce);
          } else if (decoded.data.compatible !== undefined) {
            return cipher.decrypt([Array.from(decoded.data.compatible), Array.from(decoded.data.score)], nonce);
          } else if (decoded.data.matched !== undefined) {
            return cipher.decrypt([Array.from(decoded.data.matched), Array.from(decoded.data.score)], nonce);
          }
        } catch (e) { return null; }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

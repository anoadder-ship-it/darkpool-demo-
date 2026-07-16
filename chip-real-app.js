// === ECHTE on-chain chip-match via Phantom + Arcium MPC ===
// Vervangt de client-side simulatie door een echte matchChip-transactie.

function readUInt32LE(bytes) {
  return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

async function submitRealChipMatch() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;

  const btn = document.getElementById('bc');
  btn.disabled = true;
  const statusEl = document.getElementById('rc-status') || (function(){
    const d = document.createElement('div');
    d.id = 'rc-status';
    d.style.cssText = 'font-size:12px;color:var(--text2);margin-top:8px';
    document.getElementById('rc').parentNode.appendChild(d);
    return d;
  })();
  statusEl.textContent = 'Transactie opbouwen...';

  try {
    const HELIUS = "https://devnet.helius-rpc.com/?api-key=06f90068-d382-48f2-a4ce-733f4e36cd79";
    const CLUSTER = 456;
    const PROGRAM_ID = new SDK.PublicKey("6xLjbo4yfc5j2CMu69DkycTJrGZttHzeqieXf2NPvu8o");
    const conn = new SDK.Connection(HELIUS, { commitment: "confirmed" });

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

    statusEl.textContent = 'MXE-sleutel ophalen...';
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    // Waarden uit de UI (met zinnige defaults voor velden die de UI niet toont)
    const chip = +document.getElementById('c-chip').value;
    const qty = +document.getElementById('c-qty').value;
    const cond = +document.getElementById('c-cond').value;
    const price = +document.getElementById('c-price').value;
    const del = +document.getElementById('c-del').value;
    const region = +document.getElementById('c-reg').value;
    const cert = 1; // datacenter (default, niet in UI)

    const qchip = +document.getElementById('c-qchip').value;
    const qmin = +document.getElementById('c-qmin').value;
    const qprice = +document.getElementById('c-qprice').value;
    const qdel = +document.getElementById('c-qdel').value;
    const qmaxcond = 3;   // accepteert tot Used (default, niet in UI)
    const qregion = 4;    // Global — accepteert elke regio (default)
    const qmincert = 1;   // minimaal datacenter (default)

    const vals = [
      chip, qty, cond, price, del, region, cert,
      qchip, qmin, qmaxcond, qprice, qdel, qregion, qmincert,
    ].map(BigInt);

    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const accs = {
      computationAccount: SDK.getComputationAccAddress(CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('match_chip'))
      ),
    };

    statusEl.textContent = 'Wachten op Phantom-ondertekening...';
    const tx = await prog.methods.matchChip(
      off, cts[0], cts[1], cts[2], cts[3], cts[4], cts[5], cts[6],
      cts[7], cts[8], cts[9], cts[10], cts[11], cts[12], cts[13],
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

    const result = await pollForResult(conn, prog, cipher, compAccBase58, baseline, 90000);

    if (!result) {
      statusEl.textContent = 'Geen resultaat ontvangen binnen 90s. Probeer opnieuw.';
      btn.disabled = false;
      return;
    }

    const matched = result[0] === 1n;
    const score = result[1];
    document.getElementById('fc-chip').textContent = (window.cn && window.cn[chip] || chip) + ' (' + chip + ')';
    const v = document.getElementById('rc-v');
    if (matched) {
      show('c', 'matched = 1', 'Score: ' + score + '/98 — ECHT on-chain resultaat', 'ok');
      v.className = 'rv g';
    } else {
      show('c', 'matched = 0', 'Score: ' + score + '/98 — ECHT on-chain resultaat', '');
      v.className = 'rv';
    }
    statusEl.textContent = 'Klaar — resultaat rechtstreeks van Arcium MPC-callback.';
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Fout: ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

// Poll op transactie-signatures i.p.v. WebSocket (WebSocket faalt op Helius devnet).
// Match op het computationAccount van deze specifieke order.
async function pollForResult(conn, prog, cipher, computationAccountBase58, seenSet, timeoutMs) {
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
        if (!decoded || decoded.name !== 'chipMatchedEvent') continue;
        try {
          const nonce = new Uint8Array(decoded.data.nonce);
          return cipher.decrypt(
            [Array.from(decoded.data.matched), Array.from(decoded.data.score)],
            nonce
          );
        } catch (e) { return null; }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

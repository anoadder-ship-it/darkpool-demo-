// === ECHTE on-chain Trading Darkpool — Multi-Asset Orderboek via Phantom + Arcium MPC ===
// Vijf operaties: place_order, match_orders, settle_match, cancel_trade_order, get_stats
// Orderboek: 1000 slots, versleuteld via Enc<Mxe,OrderBook>, pass-by-reference
// Eigenaarschap: plaintext owners[] array on-chain (niet versleuteld)

const TRADING_CLUSTER = 456;
const TRADING_PROGRAM_ID_STR = "4wDeY6ypAMhrGA2PbBuwThZZL4xw4aBhDEBn85VqPCeB";
const TRADING_RPC = "https://solana-devnet.core.chainstack.com/82e99e28fb99448c56b313e55d740497";

function readUInt32LE(bytes) {
  return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

async function getTradingProgram() {
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;
  const PROGRAM_ID = new SDK.PublicKey(TRADING_PROGRAM_ID_STR);
  const conn = new SDK.Connection(TRADING_RPC, { commitment: "confirmed" });
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
  return { SDK, prog, PROGRAM_ID, conn, ownerPubkey, phantomProvider, provider };
}

function tradingLog(label, msg, cls) {
  const el = document.getElementById('trading-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('nl-NL');
  const div = document.createElement('div');
  div.className = 'elog-entry ' + (cls || '');
  div.innerHTML = '<span class="ets">' + ts + '</span> <b>' + label + '</b> ' + msg;
  el.prepend(div);
}

function getOrderBookPDA(SDK, PROGRAM_ID) {
  return SDK.PublicKey.findProgramAddressSync([Buffer.from("order_book")], PROGRAM_ID)[0];
}

// === PLACE ORDER ===
async function submitPlaceOrder() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  tradingLog('place_order', 'order voorbereiden...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getTradingProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const assetId = +document.getElementById('t-asset-id').value;
    const bid    = +document.getElementById('t-bid').value;
    const size   = +document.getElementById('t-size').value;
    const isBuy  = document.getElementById('t-is-buy').checked ? 1 : 0;

    const vals = [assetId, bid, size, isBuy].map(BigInt);
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const orderBookPDA = getOrderBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(TRADING_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(TRADING_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(TRADING_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(TRADING_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('place_order'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      orderBookState: orderBookPDA,
    };

    tradingLog('place_order', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.placeOrder(
      off, cts[0], cts[1], cts[2], cts[3], pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    tradingLog('place_order INGEDIEND', `asset=${assetId} bid=${bid} size=${size} buy=${isBuy} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    tradingLog('Fout bij place_order', e.message || String(e), 'err');
  }
}

// === MATCH ORDERS ===
async function submitMatchOrders() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  tradingLog('match_orders', 'matching starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getTradingProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const assetId = +document.getElementById('t-match-asset').value;
    const vals = [BigInt(assetId)];
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const orderBookPDA = getOrderBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(TRADING_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(TRADING_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(TRADING_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(TRADING_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('match_orders'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      orderBookState: orderBookPDA,
    };

    tradingLog('match_orders', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.matchOrders(
      off, cts[0], pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    tradingLog('match_orders INGEDIEND', `asset=${assetId} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    tradingLog('Fout bij match_orders', e.message || String(e), 'err');
  }
}

// === SETTLE MATCH ===
async function submitSettleMatch() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  tradingLog('settle_match', 'settlement starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getTradingProgram();
    const buyIdx  = +document.getElementById('t-settle-buy').value;
    const sellIdx = +document.getElementById('t-settle-sell').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const orderBookPDA = getOrderBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(TRADING_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(TRADING_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(TRADING_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(TRADING_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('settle_match'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      orderBookState: orderBookPDA,
    };

    tradingLog('settle_match', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.settleMatch(
      off, new SDK.BN(buyIdx), new SDK.BN(sellIdx)
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    tradingLog('settle_match GESLAAGD', `buy_idx=${buyIdx} sell_idx=${sellIdx} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    tradingLog('Fout bij settle_match', e.message || String(e), 'err');
  }
}

// === CANCEL TRADE ORDER ===
async function submitCancelTradeOrder() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  tradingLog('cancel_trade_order', 'annuleren...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getTradingProgram();
    const index = +document.getElementById('t-cancel-idx').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const orderBookPDA = getOrderBookPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(TRADING_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(TRADING_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(TRADING_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(TRADING_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        readUInt32LE(SDK.getCompDefAccOffset('cancel_trade_order'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      orderBookState: orderBookPDA,
    };

    tradingLog('cancel_trade_order', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.cancelTradeOrder(
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
    tradingLog('cancel_trade_order GESLAAGD', `index=${index} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    tradingLog('Fout bij cancel_trade_order', e.message || String(e), 'err');
  }
}

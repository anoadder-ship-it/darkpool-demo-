// === ECHTE on-chain Medical Darkpool — Persistent DatasetRegistry via Phantom + Arcium MPC ===
const MEDICAL_CLUSTER = 456;
const MEDICAL_PROGRAM_ID_STR = "8dZeCyioGvs5Lq9n32ZP9jM97MiSRTXBKjkiCRqwPWmb";
const MEDICAL_RPC = "https://solana-devnet.core.chainstack.com/82e99e28fb99448c56b313e55d740497";

function medReadUInt32LE(bytes) {
  return ((bytes[0]) | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

async function getMedicalProgram() {
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;
  const PROGRAM_ID = new SDK.PublicKey(MEDICAL_PROGRAM_ID_STR);
  const conn = new SDK.Connection(MEDICAL_RPC, { commitment: "confirmed" });
  const ownerPubkey = new SDK.PublicKey(wPub);
  const wallet = {
    publicKey: ownerPubkey,
    signTransaction: (t) => phantomProvider.signTransaction(t),
    signAllTransactions: (ts) => phantomProvider.signAllTransactions(ts),
  };
  const provider = new SDK.anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const idlResp = await fetch('medical_darkpool.json');
  const IDL = await idlResp.json();
  IDL.address = PROGRAM_ID.toBase58();
  const prog = new SDK.anchor.Program(IDL, provider);
  return { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider };
}

function medicalLog(label, msg, cls) {
  const el = document.getElementById('medical-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('nl-NL');
  const div = document.createElement('div');
  div.className = 'elog-entry ' + (cls || '');
  div.innerHTML = '<span class="ets">' + ts + '</span> <b>' + label + '</b> ' + msg;
  el.prepend(div);
}

function getRegistryPDA(SDK, PROGRAM_ID) {
  return SDK.PublicKey.findProgramAddressSync([Buffer.from("registry")], PROGRAM_ID)[0];
}

// === REGISTER DATASET ===
async function submitRegisterDataset() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  medicalLog('register_dataset', 'dataset voorbereiden...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getMedicalProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const disease  = +document.getElementById('m-disease').value;
    const samples  = +document.getElementById('m-samples').value;
    const age      = +document.getElementById('m-age').value;
    const gender   = +document.getElementById('m-gender').value;
    const modality = +document.getElementById('m-modality').value;
    const expiresAt = +(document.getElementById('m-expires') ? document.getElementById('m-expires').value : 0) || 0;

    const vals = [disease, samples, age, gender, modality, expiresAt].map(BigInt);
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const registryPDA = getRegistryPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(MEDICAL_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(MEDICAL_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(MEDICAL_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(MEDICAL_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        medReadUInt32LE(SDK.getCompDefAccOffset('register_dataset'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      registryState: registryPDA,
    };

    medicalLog('register_dataset', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.registerDataset(
      off, cts[0], cts[1], cts[2], cts[3], cts[4], cts[5], pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    medicalLog('register_dataset INGEDIEND', `disease=${disease} samples=${samples} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    medicalLog('Fout bij register_dataset', e.message || String(e), 'err');
  }
}

// === SEARCH DATASETS ===
async function submitSearchDatasets() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  medicalLog('search_datasets', 'zoeken starten...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getMedicalProgram();
    const mxeKey = await SDK.getMXEPublicKey(provider, PROGRAM_ID);
    if (!mxeKey) throw new Error('MXE-sleutel niet gevonden');
    const priv = SDK.x25519.utils.randomSecretKey();
    const cipher = new SDK.RescueCipher(SDK.x25519.getSharedSecret(priv, mxeKey));
    const pubArr = Array.from(SDK.x25519.getPublicKey(priv));

    const qDisease  = +document.getElementById('m-q-disease').value;
    const qSamples  = +document.getElementById('m-q-samples').value;
    const qAgeMin   = +document.getElementById('m-q-agemin').value;
    const qAgeMax   = +document.getElementById('m-q-agemax').value;
    const qModality = +document.getElementById('m-q-modality').value;
    const currentTime = Math.floor(Date.now() / 1000);

    const vals = [qDisease, qSamples, qAgeMin, qAgeMax, qModality].map(BigInt);
    const nb = SDK.randomBytes(16);
    const cts = cipher.encrypt(vals, nb).map(ct => Array.from(ct));
    const nonce = new SDK.BN(SDK.deserializeLE(nb).toString());
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const registryPDA = getRegistryPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(MEDICAL_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(MEDICAL_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(MEDICAL_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(MEDICAL_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        medReadUInt32LE(SDK.getCompDefAccOffset('search_datasets'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      registryState: registryPDA,
    };

    medicalLog('search_datasets', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.searchDatasets(
      off, cts[0], cts[1], cts[2], cts[3], cts[4], new SDK.BN(currentTime), pubArr, nonce
    ).accountsPartial(accs)
     .preInstructions([SDK.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
     .transaction();
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPubkey;
    const signed = await provider.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    medicalLog('search_datasets INGEDIEND', `Tx: ${sig.slice(0,12)}... (resultaat volgt via DatasetSearchEvent)`, 'ok');
  } catch (e) {
    console.error(e);
    medicalLog('Fout bij search_datasets', e.message || String(e), 'err');
  }
}

// === REMOVE DATASET ===
async function submitRemoveDataset() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  medicalLog('remove_dataset', 'verwijderen...', '');
  try {
    const { SDK, prog, PROGRAM_ID, conn, ownerPubkey, provider } = await getMedicalProgram();
    const index = +document.getElementById('m-remove-idx').value;
    const off = new SDK.BN(SDK.randomBytes(8), 'hex');

    const registryPDA = getRegistryPDA(SDK, PROGRAM_ID);
    const accs = {
      computationAccount: SDK.getComputationAccAddress(MEDICAL_CLUSTER, off),
      clusterAccount: SDK.getClusterAccAddress(MEDICAL_CLUSTER),
      mxeAccount: SDK.getMXEAccAddress(PROGRAM_ID),
      mempoolAccount: SDK.getMempoolAccAddress(MEDICAL_CLUSTER),
      executingPool: SDK.getExecutingPoolAccAddress(MEDICAL_CLUSTER),
      compDefAccount: SDK.getCompDefAccAddress(
        PROGRAM_ID,
        medReadUInt32LE(SDK.getCompDefAccOffset('remove_dataset'))
      ),
      moerasPool: new SDK.PublicKey('Hp9jftCAo9UWE6tGmkYYqT8ChybJMnwi8uTFHg2fu2fq'),
      registryState: registryPDA,
    };

    medicalLog('remove_dataset', 'wachten op Phantom-ondertekening...', '');
    const tx = await prog.methods.removeDataset(
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
    medicalLog('remove_dataset GESLAAGD', `index=${index} | Tx: ${sig.slice(0,12)}...`, 'ok');
  } catch (e) {
    console.error(e);
    medicalLog('Fout bij remove_dataset', e.message || String(e), 'err');
  }
}

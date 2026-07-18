// === Escrow-demo: create_escrow / release_escrow / dispute_escrow ===
// resolve_dispute is bewust NIET opgenomen in de publieke demo: dat vereist
// de 2-of-3 Squads-multisig-sleutels van het Dark Matter Labs-team.

const ESCROW_PROGRAM_IDS = {
  trading: 'h6zsnHt28NpeS94Ek3fQP1YEiu1WrpGT2pKynWZzKVX',
  medical: 'CZQBaJFJnGA2pyEnrfxCmsUewcHJLDGHgzrcVjomzDD4',
  supply: '3HQHpSBSgYkx81E25bSJZVz4mGoW6nQFJWDtZL9fmMR4',
  chip: '6xLjbo4yfc5j2CMu69DkycTJrGZttHzeqieXf2NPvu8o',
};

const ESCROW_IDL_FILES = {
  trading: 'solana_darkpool.json',
  medical: 'medical_darkpool.json',
  supply: 'supply_chain_darkpool.json',
  chip: 'chip_darkpool.json',
};

let escrowLog = [];
let lastEscrowPda = null;
let lastEscrowSeed = null;

function escrowLogAction(label, msg, cls) {
  const ts = new Date().toLocaleTimeString('nl-NL');
  escrowLog.unshift({ ts, label, msg, cls });
  renderEscrowLog();
}

function renderEscrowLog() {
  const el = document.getElementById('escrow-log');
  if (!el) return;
  el.innerHTML = escrowLog.map(entry =>
    `<div class="log-entry ${entry.cls || ''}"><span class="log-ts">[${entry.ts}]</span> <b>${entry.label}</b>: ${entry.msg}</div>`
  ).join('');
}

function getEscrowProgramId() {
  const sel = document.getElementById('e-darkpool');
  return ESCROW_PROGRAM_IDS[sel.value];
}

function getEscrowIdlFile() {
  const sel = document.getElementById('e-darkpool');
  return ESCROW_IDL_FILES[sel.value];
}

async function getEscrowProgram() {
  const SDK = window.DarkpoolSDK;
  const phantomProvider = window.phantom && window.phantom.solana || window.solana;
  const HELIUS = 'https://devnet.helius-rpc.com/?api-key=a17d9b5b-f33c-4c56-ad16-84bb71b13779';
  const PROGRAM_ID = new SDK.PublicKey(getEscrowProgramId());
  const conn = new SDK.Connection(HELIUS, { commitment: 'confirmed' });
  const ownerPubkey = new SDK.PublicKey(wPub);
  const wallet = {
    publicKey: ownerPubkey,
    signTransaction: (t) => phantomProvider.signTransaction(t),
    signAllTransactions: (ts) => phantomProvider.signAllTransactions(ts),
  };
  const provider = new SDK.anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  const idlResp = await fetch(getEscrowIdlFile());
  const IDL = await idlResp.json();
  IDL.address = PROGRAM_ID.toBase58();
  const prog = new SDK.anchor.Program(IDL, provider);
  return { SDK, prog, conn, PROGRAM_ID, ownerPubkey };
}

async function submitCreateEscrow() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  const btn = document.getElementById('e-btn-create');
  btn.disabled = true;
  escrowLogAction('create_escrow', 'bezig...', '');
  try {
    const { SDK, prog, PROGRAM_ID, ownerPubkey } = await getEscrowProgram();
    const sellerStr = document.getElementById('e-seller').value.trim();
    if (!sellerStr) throw new Error('Vul een verkoper-adres in (of gebruik het voorbeeldadres)');
    const seller = new SDK.PublicKey(sellerStr);
    const amountSol = parseFloat(document.getElementById('e-amount').value) || 0.01;
    const amount = new SDK.anchor.BN(amountSol * SDK.anchor.web3.LAMPORTS_PER_SOL);
    const seedId = new SDK.anchor.BN(Date.now());

    const [escrowPda] = SDK.PublicKey.findProgramAddressSync(
      [
        new TextEncoder().encode('escrow'),
        ownerPubkey.toBytes(),
        seller.toBytes(),
        seedId.toArrayLike(Uint8Array, 'le', 8),
      ],
      PROGRAM_ID
    );

    const sig = await prog.methods
      .createEscrow(amount, seller, seedId)
      .accounts({
        buyer: ownerPubkey,
        escrowAccount: escrowPda,
        systemProgram: SDK.anchor.web3.SystemProgram.programId,
      })
      .rpc();

    lastEscrowPda = escrowPda.toString();
    lastEscrowSeed = seedId.toString();
    document.getElementById('e-escrow-pda').textContent = lastEscrowPda;
    escrowLogAction('create_escrow GESLAAGD', `Escrow ${lastEscrowPda} aangemaakt met ${amountSol} SOL | Tx: ${sig}`, 'ok');
  } catch (e) {
    console.error(e);
    escrowLogAction('Fout bij create_escrow', e.message || String(e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function submitReleaseEscrow() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  if (!lastEscrowPda) { alert('Maak eerst een escrow aan met "1. Create escrow".'); return; }
  const btn = document.getElementById('e-btn-release');
  btn.disabled = true;
  escrowLogAction('release_escrow', 'bezig...', '');
  try {
    const { SDK, prog, ownerPubkey } = await getEscrowProgram();
    const seller = new SDK.PublicKey(document.getElementById('e-seller').value.trim());
    const escrowPda = new SDK.PublicKey(lastEscrowPda);

    const sig = await prog.methods
      .releaseEscrow()
      .accounts({ buyer: ownerPubkey, escrowAccount: escrowPda, seller })
      .rpc();

    escrowLogAction('release_escrow GESLAAGD', `Escrow ${lastEscrowPda} vrijgegeven aan verkoper | Tx: ${sig}`, 'ok');
  } catch (e) {
    console.error(e);
    escrowLogAction('Fout bij release_escrow', e.message || String(e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function submitDisputeEscrow() {
  if (!wPub) { alert('Verbind eerst je Phantom wallet.'); return; }
  if (!lastEscrowPda) { alert('Maak eerst een escrow aan met "1. Create escrow".'); return; }
  const btn = document.getElementById('e-btn-dispute');
  btn.disabled = true;
  escrowLogAction('dispute_escrow', 'bezig...', '');
  try {
    const { SDK, prog, ownerPubkey } = await getEscrowProgram();
    const escrowPda = new SDK.PublicKey(lastEscrowPda);

    const sig = await prog.methods
      .disputeEscrow()
      .accounts({ disputer: ownerPubkey, escrowAccount: escrowPda })
      .rpc();

    escrowLogAction('dispute_escrow GESLAAGD', `Escrow ${lastEscrowPda} gedisput — bevroren tot arbitrage via de 2-of-3 multisig | Tx: ${sig}`, 'ok');
  } catch (e) {
    console.error(e);
    escrowLogAction('Fout bij dispute_escrow', e.message || String(e), 'err');
  } finally {
    btn.disabled = false;
  }
}

/**
 * READ-ONLY finder for demo/seed messages that were auto-written into the live `messages` collection.
 * This script only reads. It never writes, changes or removes any document.
 *
 * It looks for four kinds of leftovers (see getDefaultMessages / seedDefaultMessages in js/firebase.js):
 *   1. Document ids starting with "msg_init_"  (invented "Practice engagement file active for ..." welcome messages)
 *   2. The known demo seed ids: msg_whitfield_001, msg_whitfield_002, msg_brennan_001, msg_bennett_001, msg_okonjo_001
 *   3. senderId == "staff_denise_cpa" AND text starting with "Practice engagement file active for"
 * For every match it prints docId, clientId, senderName, createdAt, readByClient and the first 60 characters
 * of the text, plus how many OTHER messages exist in the same client thread (so genuine traffic is visible).
 *
 * Usage (from the "firm" folder):
 *   node scripts/find-seed-messages.js
 *   node scripts/find-seed-messages.js --out "C:\\Users\\you\\Documents\\seed-messages-report.json"
 *
 * --out writes a JSON report to a path OUTSIDE this repository (it contains message text and client ids,
 * so it must never be committed). The script refuses an --out path inside the repo or an existing file.
 *
 * Credentials: Application Default Credentials (gcloud auth application-default login) or
 *              GOOGLE_APPLICATION_CREDENTIALS pointing to a key file kept OUTSIDE this repository.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SEED_IDS = ['msg_whitfield_001', 'msg_whitfield_002', 'msg_brennan_001', 'msg_bennett_001', 'msg_okonjo_001'];
const INIT_PREFIX = 'msg_init_';
const SEEDED_SENDER_ID = 'staff_denise_cpa';
const INIT_TEXT_PREFIX = 'Practice engagement file active for';
const REPO_ROOT = path.resolve(__dirname, '..');

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return String(value);
}

function describe(snap, reasons) {
  const d = snap.data() || {};
  return {
    docId: snap.id,
    clientId: d.clientId || d.clientUid || d.uid || null,
    senderName: d.senderName || null,
    senderId: d.senderId || null,
    senderRole: d.senderRole || null,
    createdAt: toIso(d.createdAt) || toIso(d._isoTime),
    readByClient: d.readByClient === undefined ? null : d.readByClient,
    text: String(d.text || ''),
    matchedBy: reasons
  };
}

/**
 * @param {{ db: FirebaseFirestore.Firestore, FieldPath: typeof FirebaseFirestore.FieldPath }} deps
 * Only get() / getAll() style reads are used here.
 */
async function findSeedMessages({ db, FieldPath }) {
  const found = {};   // docId -> { snap, reasons: [] }
  const record = (snap, reason) => {
    if (!found[snap.id]) found[snap.id] = { snap: snap, reasons: [] };
    if (!found[snap.id].reasons.includes(reason)) found[snap.id].reasons.push(reason);
  };
  const messages = db.collection('messages');

  // 1. id prefix "msg_init_" (range query on the document id)
  const prefixEnd = INIT_PREFIX + String.fromCharCode(0xf8ff);
  const prefixSnap = await messages
    .where(FieldPath.documentId(), '>=', INIT_PREFIX)
    .where(FieldPath.documentId(), '<', prefixEnd)
    .get();
  prefixSnap.forEach(s => record(s, 'id prefix ' + INIT_PREFIX));

  // 2. the known demo seed ids
  const exactSnaps = await db.getAll(...SEED_IDS.map(id => messages.doc(id)));
  exactSnaps.forEach(s => { if (s.exists) record(s, 'known seed id'); });

  // 3. sender staff_denise_cpa with the invented welcome text
  const senderSnap = await messages.where('senderId', '==', SEEDED_SENDER_ID).get();
  senderSnap.forEach(s => {
    const text = String((s.data() || {}).text || '');
    if (text.startsWith(INIT_TEXT_PREFIX)) record(s, SEEDED_SENDER_ID + ' + welcome text');
  });

  const matches = Object.keys(found).sort().map(id => describe(found[id].snap, found[id].reasons));

  // Context: how much other (non-matching) traffic exists in each affected thread
  const clientIds = Array.from(new Set(matches.map(m => m.clientId).filter(Boolean)));
  const threads = [];
  for (const cid of clientIds) {
    const threadSnap = await messages.where('clientId', '==', cid).get();
    let others = 0;
    let clientAuthored = 0;
    threadSnap.forEach(s => {
      if (found[s.id]) return;
      others += 1;
      const d = s.data() || {};
      if (d.senderRole === 'client' || (d.senderId && d.senderId === cid)) clientAuthored += 1;
    });
    threads.push({
      clientId: cid,
      matchedMessages: matches.filter(m => m.clientId === cid).length,
      otherMessages: others,
      clientAuthoredMessages: clientAuthored
    });
  }
  return { matches, threads };
}

module.exports = { findSeedMessages, SEED_IDS, INIT_PREFIX, SEEDED_SENDER_ID, INIT_TEXT_PREFIX };

function parseArgs(argv) {
  const args = { out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') { args.out = argv[i + 1] || ''; i++; }
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function assertSafeOutPath(outArg) {
  if (!outArg) throw new Error('--out needs a file path.');
  const resolved = path.resolve(outArg);
  const insideRepo = resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep);
  if (insideRepo) throw new Error('Refusing --out inside the repository (' + REPO_ROOT + '). Choose a path outside it.');
  if (fs.existsSync(resolved)) throw new Error('Refusing to overwrite an existing file: ' + resolved);
  return resolved;
}

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node scripts/find-seed-messages.js [--out <path-outside-repo.json>]');
      process.exit(0);
    }
    // Validate --out before touching the network.
    const outPath = args.out === null ? null : assertSafeOutPath(args.out);

    const admin = require('../functions/node_modules/firebase-admin');
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'uk-client-d90d5' });
    const projectId = process.env.GCLOUD_PROJECT || 'uk-client-d90d5';
    console.log('READ-ONLY scan of /messages in project "' + projectId + '". Nothing will be modified.\n');

    const result = await findSeedMessages({ db: admin.firestore(), FieldPath: admin.firestore.FieldPath });

    if (result.matches.length === 0) {
      console.log('No seed or demo messages found.');
    } else {
      console.log('Found ' + result.matches.length + ' matching message(s):\n');
      result.matches.forEach((m, i) => {
        const preview = m.text.replace(/\s+/g, ' ').slice(0, 60);
        console.log((i + 1) + '. docId:        ' + m.docId);
        console.log('   clientId:     ' + m.clientId);
        console.log('   senderName:   ' + m.senderName);
        console.log('   createdAt:    ' + m.createdAt);
        console.log('   readByClient: ' + m.readByClient);
        console.log('   text:         ' + preview + (m.text.length > 60 ? '...' : ''));
        console.log('   matched by:   ' + m.matchedBy.join('; '));
        console.log('');
      });
      console.log('Affected client threads (other = messages in the thread that did NOT match):');
      result.threads.forEach(t => {
        console.log('  ' + t.clientId + ': ' + t.matchedMessages + ' matched, ' + t.otherMessages + ' other, ' +
          t.clientAuthoredMessages + ' written by the client');
      });
    }

    if (outPath) {
      const report = { generatedAt: new Date().toISOString(), projectId: projectId, readOnly: true, matches: result.matches, threads: result.threads };
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), { flag: 'wx' });
      console.log('\nJSON report written to ' + outPath + ' (contains message text; keep it outside the repo).');
    }
  })().catch(err => {
    console.error('Failed:', err.message);
    if (/credential|authenticat|permission|PERMISSION_DENIED/i.test(String(err.message))) {
      console.error('Hint: run "gcloud auth application-default login" or set GOOGLE_APPLICATION_CREDENTIALS to a key file outside this repo.');
    }
    process.exit(1);
  });
}

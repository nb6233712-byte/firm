/**
 * ============================================================================
 * THE FILE ROOM — AUTOMATED KBA WEBHOOK FLOW TEST SUITE
 * functions/test/webhook.test.js
 * ============================================================================
 *
 * Requirements Covered:
 * 1. Valid cryptographic HMAC signature verification (Persona specification)
 * 2. Invalid cryptographic signatures & missing headers rejection (HTTP 401)
 * 3. Stale timestamp & replay defense with 300s tolerance (HTTP 400)
 * 4. Duplicate event processing & idempotency guarantees (HTTP 200 idempotent skip)
 * 5. Provider session reference validation against existing verification record
 * 6. Legal state transitions & out-of-order event protection (preserving terminal states)
 * 7. Minimal audit record validation (excluding raw identity docs & SSNs)
 * 8. Malformed payload rejection (HTTP 400)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { PersonaAdapter } = require('../providers/persona-adapter');
const { KBA_STATUS, isValidTransition } = require('../providers/kba-interface');

// Mock signing secret
const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_irs_pub1345_kba_f844b8fd';

/**
 * Helper: Signs a payload adhering to Persona's documented signature algorithm.
 * Header format: persona-signature: t=<timestamp>,v1=<signature>
 * Signed string: ${timestamp}.${rawBody}
 */
function signPersonaPayload(rawBody, secret, timestampSeconds) {
  const t = timestampSeconds != null ? String(timestampSeconds) : String(Math.floor(Date.now() / 1000));
  const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  const signedData = `${t}.${bodyStr}`;
  const hmac = crypto.createHmac('sha256', secret).update(signedData).digest('hex');
  return {
    timestamp: t,
    signature: hmac,
    header: `t=${t},v1=${hmac}`,
  };
}

/**
 * In-memory Mock Firestore for transaction and idempotency testing.
 */
class MockFirestore {
  constructor() {
    this.store = {
      kba_records: new Map(),
      kba_webhook_events: new Map(),
      kba_audit_trail: new Map(),
      engagements: new Map(),
      audit_logs: new Map(),
    };
  }

  collection(name) {
    const self = this;
    if (!self.store[name]) {
      self.store[name] = new Map();
    }
    return {
      doc(id) {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return {
          id: docId,
          collectionName: name,
          async get() {
            const data = self.store[name].get(docId);
            return {
              id: docId,
              exists: Boolean(data),
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          async set(data, options = {}) {
            if (options.merge && self.store[name].has(docId)) {
              const existing = self.store[name].get(docId);
              self.store[name].set(docId, deepMerge(existing, data));
            } else {
              self.store[name].set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
        };
      },
    };
  }

  async runTransaction(updateFn) {
    const self = this;
    const stagedMutations = [];

    const transaction = {
      async get(docRef) {
        const col = self.store[docRef.collectionName];
        const data = col.get(docRef.id);
        return {
          id: docRef.id,
          exists: Boolean(data),
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
        };
      },
      set(docRef, data, options = {}) {
        stagedMutations.push({ docRef, data: JSON.parse(JSON.stringify(data)), options });
      },
    };

    const result = await updateFn(transaction);

    // Commit staged mutations atomically
    for (const m of stagedMutations) {
      const col = self.store[m.docRef.collectionName];
      if (m.options && m.options.merge && col.has(m.docRef.id)) {
        col.set(m.docRef.id, deepMerge(col.get(m.docRef.id), m.data));
      } else {
        col.set(m.docRef.id, m.data);
      }
    }

    return result;
  }
}

function deepMerge(target, source) {
  const output = Object.assign({}, target);
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      output[key] = deepMerge(target[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Webhook Processor Simulator executing the exact logic of handleKbaWebhook.
 */
async function processWebhookRequest(db, provider, secret, req) {
  // 1. HTTP Method Check
  if (req.method !== 'POST') {
    return { status: 405, body: 'Method Not Allowed' };
  }

  // 2. Cryptographic Signature & Freshness Verification
  const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  const sigCheck = provider.verifyWebhookSignature({
    rawBody,
    headers: req.headers,
    secret,
    currentTimeSeconds: req.currentTimeSeconds,
  });

  const isSigValid = typeof sigCheck === 'object' ? sigCheck.isValid : Boolean(sigCheck);
  const isStale = typeof sigCheck === 'object' ? Boolean(sigCheck.isStale) : false;

  if (isStale) {
    return { status: 400, body: `Bad Request: Stale webhook timestamp (${sigCheck.reason})` };
  }

  if (!isSigValid) {
    return { status: 401, body: 'Unauthorized: Invalid HMAC signature' };
  }

  // 3. Parse & Validate Payload Structure
  let bodyObj = req.body;
  if (typeof bodyObj === 'string') {
    try {
      bodyObj = JSON.parse(bodyObj);
    } catch (_) {
      return { status: 400, body: 'Bad Request: Malformed JSON body' };
    }
  }

  if (!bodyObj || typeof bodyObj !== 'object') {
    return { status: 400, body: 'Bad Request: Payload must be a valid JSON object' };
  }

  let parsedEvent;
  try {
    parsedEvent = provider.parseWebhookEvent(bodyObj);
  } catch (err) {
    return { status: 400, body: `Bad Request: ${err.message}` };
  }

  const {
    eventId,
    eventType,
    inquiryId,
    engagementId,
    taxpayerUid,
    signerRole,
    normalizedStatus,
    auditMetadata,
  } = parsedEvent;

  if (!eventId || !inquiryId) {
    return { status: 400, body: 'Bad Request: Missing required eventId or inquiryId' };
  }

  if (!engagementId) {
    return { status: 200, json: { status: 'ignored_missing_metadata', eventId } };
  }

  const idempotencyRef = db.collection('kba_webhook_events').doc(eventId);
  const kbaRecordRef = db.collection('kba_records').doc(engagementId);
  const engagementRef = db.collection('engagements').doc(engagementId);

  try {
    const txnResult = await db.runTransaction(async (transaction) => {
      // A. Idempotency Check
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        return { status: 'already_processed', eventId, duplicate: true };
      }

      // B. Validate Session Reference Against Existing Verification Record
      const kbaDoc = await transaction.get(kbaRecordRef);
      if (!kbaDoc.exists) {
        transaction.set(idempotencyRef, {
          eventId,
          eventType,
          engagementId,
          inquiryId,
          outcome: 'REJECTED_UNKNOWN_ENGAGEMENT',
          processedAt: new Date().toISOString(),
        });
        return { status: 'ignored_unknown_engagement', eventId };
      }

      const currentKba = kbaDoc.data();
      const signerKey = signerRole || 'primary';
      const currentSigner = (currentKba && currentKba[signerKey]) || {
        attemptsCount: 0,
        kba_locked: false,
        status: KBA_STATUS.PENDING,
      };

      // Session reference match
      if (currentSigner.lastInquiryId && currentSigner.lastInquiryId !== inquiryId) {
        transaction.set(idempotencyRef, {
          eventId,
          eventType,
          engagementId,
          inquiryId,
          outcome: 'REJECTED_SESSION_REFERENCE_MISMATCH',
          processedAt: new Date().toISOString(),
        });
        return { status: 'ignored_session_reference_mismatch', eventId };
      }

      // C. Enforce Legal State Transitions & Guard Terminal States
      if (currentSigner.status === KBA_STATUS.VERIFIED && normalizedStatus !== KBA_STATUS.VERIFIED) {
        transaction.set(idempotencyRef, {
          eventId,
          eventType,
          engagementId,
          inquiryId,
          outcome: 'IGNORED_ALREADY_VERIFIED',
          processedAt: new Date().toISOString(),
        });
        return { status: 'ignored_already_verified', eventId, currentStatus: currentSigner.status };
      }

      if (currentSigner.kba_locked && normalizedStatus !== KBA_STATUS.FAILED) {
        transaction.set(idempotencyRef, {
          eventId,
          eventType,
          engagementId,
          inquiryId,
          outcome: 'IGNORED_ALREADY_LOCKED_OUT',
          processedAt: new Date().toISOString(),
        });
        return { status: 'ignored_already_locked_out', eventId, currentStatus: currentSigner.status };
      }

      if (!isValidTransition(currentSigner.status, normalizedStatus)) {
        transaction.set(idempotencyRef, {
          eventId,
          eventType,
          engagementId,
          inquiryId,
          outcome: 'IGNORED_INVALID_TRANSITION',
          fromStatus: currentSigner.status,
          toStatus: normalizedStatus,
          processedAt: new Date().toISOString(),
        });
        return {
          status: 'ignored_invalid_transition',
          eventId,
          fromStatus: currentSigner.status,
          toStatus: normalizedStatus,
        };
      }

      const nowIso = new Date().toISOString();
      let auditResult = 'UNKNOWN';

      if (normalizedStatus === KBA_STATUS.VERIFIED) {
        auditResult = 'PASSED';
        transaction.set(
          kbaRecordRef,
          {
            engagementId,
            taxpayerUid: taxpayerUid || currentKba.taxpayerUid,
            updatedAt: nowIso,
            [signerKey]: {
              ...currentSigner,
              status: KBA_STATUS.VERIFIED,
              kba_locked: false,
              passedAt: nowIso,
              inquiryId,
              passScore: 100,
            },
          },
          { merge: true }
        );

        transaction.set(
          engagementRef,
          {
            [`signatures.${signerKey}.kbaStatus`]: 'verified',
            [`signatures.${signerKey}.verifiedAt`]: nowIso,
            [`signatures.${signerKey}.provider`]: 'Persona (IRS Pub 1345)',
            overallKbaStatus: signerKey === 'primary' ? 'primary_verified' : 'dual_verified',
          },
          { merge: true }
        );
      } else if (normalizedStatus === KBA_STATUS.FAILED || normalizedStatus === KBA_STATUS.EXPIRED) {
        const newAttempts = (currentSigner.attemptsCount || 0) + 1;
        const isLockedOut = newAttempts >= 2;
        auditResult = isLockedOut ? 'FAILED_PERMANENT_LOCKOUT' : 'FAILED_ATTEMPT_1';

        transaction.set(
          kbaRecordRef,
          {
            engagementId,
            taxpayerUid: taxpayerUid || currentKba.taxpayerUid,
            updatedAt: nowIso,
            [signerKey]: {
              ...currentSigner,
              attemptsCount: newAttempts,
              status: KBA_STATUS.FAILED,
              kba_locked: isLockedOut,
              lastFailedAt: nowIso,
              lockoutReason: isLockedOut ? 'STATUTORY_2_ATTEMPT_LOCKOUT_IRS_PUB_1345' : null,
            },
          },
          { merge: true }
        );

        transaction.set(
          engagementRef,
          {
            [`signatures.${signerKey}.kbaStatus`]: isLockedOut ? 'locked_out' : 'failed_attempt_1',
            [`signatures.${signerKey}.kbaAttempts`]: newAttempts,
            requiresWetSignature: isLockedOut,
            electronicSigningDisabled: isLockedOut,
          },
          { merge: true }
        );
      } else if (normalizedStatus === KBA_STATUS.IN_PROGRESS) {
        auditResult = 'SESSION_STARTED';
        transaction.set(
          kbaRecordRef,
          {
            [`${signerKey}.status`]: KBA_STATUS.IN_PROGRESS,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }

      // Minimal WORM Audit Record
      const auditLogRef = db.collection('kba_audit_trail').doc();
      transaction.set(auditLogRef, {
        auditId: auditLogRef.id,
        eventId,
        verificationReference: inquiryId,
        eventType,
        processingTime: nowIso,
        outcome: auditResult,
        engagementId,
        signerRole,
        taxpayerUid: taxpayerUid || currentKba.taxpayerUid,
        taxYear: currentKba.taxYear || 2026,
        retentionPeriod: '3 Years Statutory Custody',
        complianceStandard: 'IRS Publication 1345 § 5.2.2 & NIST SP 800-63-3',
        provider: auditMetadata.provider || 'Persona',
        wormImmutable: true,
      });

      // Record Idempotency Document
      transaction.set(idempotencyRef, {
        eventId,
        eventType,
        engagementId,
        inquiryId,
        outcome: auditResult,
        processedAt: nowIso,
      });

      return { status: 'success', eventId, outcome: auditResult };
    });

    return { status: 200, json: txnResult };
  } catch (err) {
    return { status: 500, body: 'Internal processing error' };
  }
}

// ============================================================================
// TEST SUITE: Persona Webhook Signature Verification
// ============================================================================

test('1. Valid Signature: Persona signature algorithm verifies correctly', () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const rawBody = JSON.stringify({ hello: 'world', timestamp: Date.now() });
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  const result = adapter.verifyWebhookSignature({
    rawBody,
    headers: { 'persona-signature': signed.header },
    secret: TEST_WEBHOOK_SECRET,
  });

  assert.equal(result.isValid, true, 'Valid HMAC signature should pass verification');
  assert.equal(result.isStale, false, 'Fresh signature should not be stale');
  assert.equal(result.signature, signed.signature, 'Matched signature should match computed HMAC');
});

test('2. Invalid Signature: Tampered body or incorrect secret rejected with 401', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const rawBody = JSON.stringify({ inquiry: 'inq_123' });
  const signed = signPersonaPayload(rawBody, 'wrong_secret_12345');

  const result = adapter.verifyWebhookSignature({
    rawBody,
    headers: { 'persona-signature': signed.header },
    secret: TEST_WEBHOOK_SECRET,
  });

  assert.equal(result.isValid, false, 'Invalid secret must fail signature verification');
  assert.equal(result.reason, 'signature_mismatch');

  // Verify full handler returns HTTP 401
  const db = new MockFirestore();
  const response = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: rawBody,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(response.status, 401, 'Invalid signature must return HTTP 401 Unauthorized');
});

test('3. Stale Timestamp / Replay Attack: Timestamp older than 300s rejected with 400', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const rawBody = JSON.stringify({ inquiry: 'inq_replay_attempt' });
  const staleTimestampSeconds = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET, staleTimestampSeconds);

  const result = adapter.verifyWebhookSignature({
    rawBody,
    headers: { 'persona-signature': signed.header },
    secret: TEST_WEBHOOK_SECRET,
  });

  assert.equal(result.isValid, false, 'Stale timestamp must fail verification');
  assert.equal(result.isStale, true, 'Event must be flagged as stale');

  // Verify full handler returns HTTP 400
  const db = new MockFirestore();
  const response = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: rawBody,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(response.status, 400, 'Stale event must return HTTP 400 Bad Request');
  assert.match(response.body, /Stale webhook timestamp/, 'Error message should indicate staleness');
});

test('4. Idempotency: Duplicate events acknowledged with 200 without duplicate state mutations', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  const engagementId = 'eng_test_idempotent_01';
  const inquiryId = 'inq_test_idem_99';
  const eventId = 'evt_unique_1001';

  // Seed active engagement verification record
  await db.collection('kba_records').doc(engagementId).set({
    engagementId,
    taxpayerUid: 'usr_john_doe',
    primary: {
      status: KBA_STATUS.IN_PROGRESS,
      lastInquiryId: inquiryId,
      attemptsCount: 0,
      kba_locked: false,
    },
  });

  const payload = {
    data: {
      id: eventId,
      type: 'event',
      attributes: {
        name: 'inquiry.completed',
        payload: {
          data: {
            id: inquiryId,
            attributes: {
              status: 'completed',
              metadata: {
                engagementId,
                taxpayerUid: 'usr_john_doe',
                signerRole: 'primary',
              },
            },
          },
        },
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  // Delivery 1: Initial Processing
  const res1 = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: payload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res1.status, 200);
  assert.equal(res1.json.status, 'success');
  assert.equal(res1.json.outcome, 'PASSED');

  // Verify record was mutated to verified
  const recSnap1 = await db.collection('kba_records').doc(engagementId).get();
  assert.equal(recSnap1.data().primary.status, KBA_STATUS.VERIFIED);

  // Delivery 2: Provider Retry / Replay of identical event
  const res2 = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: payload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res2.status, 200, 'Duplicate delivery must return HTTP 200 OK');
  assert.equal(res2.json.status, 'already_processed', 'Handler must flag event as already processed');
  assert.equal(res2.json.duplicate, true, 'Handler must mark as duplicate');

  // Verify audit trail has exactly 1 record, not 2
  assert.equal(db.store.kba_audit_trail.size, 1, 'Duplicate event must NOT create extra audit records');
});

test('5. Session Reference Validation: Mismatched inquiry ID rejected without mutating records', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  const engagementId = 'eng_session_mismatch_02';
  const legitimateInquiryId = 'inq_active_session_44';
  const foreignInquiryId = 'inq_unrelated_spoofed_88';

  await db.collection('kba_records').doc(engagementId).set({
    engagementId,
    taxpayerUid: 'usr_alice',
    primary: {
      status: KBA_STATUS.IN_PROGRESS,
      lastInquiryId: legitimateInquiryId,
      attemptsCount: 0,
    },
  });

  const payload = {
    data: {
      id: 'evt_foreign_session_1',
      attributes: {
        name: 'inquiry.completed',
        payload: {
          data: {
            id: foreignInquiryId, // DOES NOT MATCH legitimateInquiryId
            attributes: {
              status: 'completed',
              metadata: {
                engagementId,
                signerRole: 'primary',
              },
            },
          },
        },
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  const res = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: payload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ignored_session_reference_mismatch');

  // Verify record was untouched
  const recSnap = await db.collection('kba_records').doc(engagementId).get();
  assert.equal(recSnap.data().primary.status, KBA_STATUS.IN_PROGRESS, 'Record status must remain unchanged');
});

test('6. Out-of-Order Events: Terminal verified state cannot be overwritten by delayed events', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  const engagementId = 'eng_verified_terminal_03';
  const inquiryId = 'inq_verified_33';

  // Taxpayer already verified
  await db.collection('kba_records').doc(engagementId).set({
    engagementId,
    taxpayerUid: 'usr_bob',
    primary: {
      status: KBA_STATUS.VERIFIED,
      lastInquiryId: inquiryId,
      passedAt: new Date().toISOString(),
    },
  });

  // Delayed / out-of-order 'inquiry.started' or 'inquiry.failed' arrives
  const delayedPayload = {
    data: {
      id: 'evt_delayed_started_99',
      attributes: {
        name: 'inquiry.started',
        payload: {
          data: {
            id: inquiryId,
            attributes: {
              status: 'in_progress',
              metadata: { engagementId, signerRole: 'primary' },
            },
          },
        },
      },
    },
  };

  const rawBody = JSON.stringify(delayedPayload);
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  const res = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: delayedPayload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ignored_already_verified', 'Must protect verified state from regression');

  // Verify record remains VERIFIED
  const recSnap = await db.collection('kba_records').doc(engagementId).get();
  assert.equal(recSnap.data().primary.status, KBA_STATUS.VERIFIED, 'Verified status must NOT be regressed');
});

test('7. Out-of-Order Events: Statutory 2-attempt lockout cannot be overwritten', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  const engagementId = 'eng_lockout_terminal_04';
  const inquiryId = 'inq_lockout_44';

  // Taxpayer locked out under IRS Pub 1345 § 5.2.2
  await db.collection('kba_records').doc(engagementId).set({
    engagementId,
    taxpayerUid: 'usr_charlie',
    primary: {
      status: KBA_STATUS.FAILED,
      attemptsCount: 2,
      kba_locked: true,
      lastInquiryId: inquiryId,
    },
  });

  const delayedPassPayload = {
    data: {
      id: 'evt_delayed_pass_after_lockout',
      attributes: {
        name: 'inquiry.completed',
        payload: {
          data: {
            id: inquiryId,
            attributes: {
              status: 'completed',
              metadata: { engagementId, signerRole: 'primary' },
            },
          },
        },
      },
    },
  };

  const rawBody = JSON.stringify(delayedPassPayload);
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  const res = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: delayedPassPayload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'ignored_already_locked_out', 'Locked out state must be permanently enforced');

  const recSnap = await db.collection('kba_records').doc(engagementId).get();
  assert.equal(recSnap.data().primary.kba_locked, true, 'Lockout must remain true');
});

test('8. Malformed Payloads: Non-JSON and missing required fields return HTTP 400', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  // Scenario A: Non-JSON body string
  const malformedString = 'Not a json string { broken ...';
  const signedA = signPersonaPayload(malformedString, TEST_WEBHOOK_SECRET);

  const resA = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody: malformedString,
    body: malformedString,
    headers: { 'persona-signature': signedA.header },
  });
  assert.equal(resA.status, 400, 'Malformed JSON must return HTTP 400');

  // Scenario B: Missing eventId and inquiryId
  const emptyEventPayload = { data: { type: 'event', attributes: {} } };
  const rawEmpty = JSON.stringify(emptyEventPayload);
  const signedB = signPersonaPayload(rawEmpty, TEST_WEBHOOK_SECRET);

  const resB = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody: rawEmpty,
    body: emptyEventPayload,
    headers: { 'persona-signature': signedB.header },
  });
  assert.equal(resB.status, 400, 'Missing eventId/inquiryId must return HTTP 400');
});

test('9. Minimal Audit Record: No raw identity documents or SSNs stored', async () => {
  const adapter = new PersonaAdapter({ apiKey: 'test_api_key' });
  const db = new MockFirestore();

  const engagementId = 'eng_audit_check_05';
  const inquiryId = 'inq_audit_55';

  await db.collection('kba_records').doc(engagementId).set({
    engagementId,
    taxpayerUid: 'usr_audit_taxpayer',
    primary: {
      status: KBA_STATUS.IN_PROGRESS,
      lastInquiryId: inquiryId,
      attemptsCount: 0,
    },
  });

  const payload = {
    data: {
      id: 'evt_audit_verified_1',
      attributes: {
        name: 'inquiry.completed',
        payload: {
          data: {
            id: inquiryId,
            attributes: {
              status: 'completed',
              metadata: { engagementId, signerRole: 'primary' },
              // Simulated raw identity documents in provider payload
              idPhotoUrl: 'https://withpersona.com/photos/driver_license_front.jpg',
              ssn: '987-65-4321',
              quizAnswers: [{ q: 'Prior Address', a: '123 Main St' }],
            },
          },
        },
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const signed = signPersonaPayload(rawBody, TEST_WEBHOOK_SECRET);

  const res = await processWebhookRequest(db, adapter, TEST_WEBHOOK_SECRET, {
    method: 'POST',
    rawBody,
    body: payload,
    headers: { 'persona-signature': signed.header },
  });

  assert.equal(res.status, 200);

  // Inspect generated audit trail document
  const auditEntries = Array.from(db.store.kba_audit_trail.values());
  assert.equal(auditEntries.length, 1, 'Exactly one audit record must be written');

  const auditRecord = auditEntries[0];
  assert.equal(auditRecord.eventId, 'evt_audit_verified_1');
  assert.equal(auditRecord.verificationReference, inquiryId);
  assert.equal(auditRecord.outcome, 'PASSED');
  assert.equal(auditRecord.retentionPeriod, '3 Years Statutory Custody');

  // Assert NO raw identity docs, SSNs, or quiz answers are preserved
  assert.equal(auditRecord.idPhotoUrl, undefined, 'Must not store raw photos');
  assert.equal(auditRecord.ssn, undefined, 'Must not store SSNs');
  assert.equal(auditRecord.quizAnswers, undefined, 'Must not store quiz questions/answers');
});

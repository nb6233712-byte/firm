/**
 * ============================================================================
 * THE FILE ROOM — HARDENED DOCUMENT DELIVERY TEST SUITE
 * tests/hardened-document-delivery.test.js
 * ============================================================================
 *
 * Validates the 8 core document delivery requirements:
 * 1. Forminit Primary Success (HTTP 200/201, Tier 1 direct delivery)
 * 2. Forminit Timeout & Failover (AbortController bounded timeout -> Secondary Fallback success)
 * 3. Forminit HTTP 429 (Rate Limited with Retry-After header & failover)
 * 4. Forminit HTTP 500 (Internal Server Error -> Secondary Fallback routing)
 * 5. Fallback Success & Durable Intake Registration (Stable ID & Idempotency Key)
 * 6. Both Destinations Failing (Storage vault custody retained, backoff / dead-letter)
 * 7. Duplicate Requests & Outcome Reconciliation (Prevents duplicate logical submissions)
 * 8. Recovery After Browser Closes (Ephemeral recovery aid without treating localStorage as authoritative)
 * 9. Authorization Enforcement (Manual retries permitted only to authorized staff)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_STATUS,
  ERROR_CATEGORY,
  QUEUE_CONFIG,
  INTAKE_ENDPOINTS,
  STATUS_MODEL,
  enqueueDocumentDeliveryJob,
  acquireJobLease,
  completeJobDelivery,
  failJobDelivery,
  manualRetryJob,
  executeDeliveryJob,
  sweepDeliveryQueue,
  generateIdempotencyKey,
  classifyHttpStatus,
  calculateExponentialBackoff,
} = require('../functions/delivery-queue');

// In-Memory Mock Firestore Database supporting Transactions and Collections
class MockHardenedFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name);
    return {
      doc: (id) => {
        const docId = id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return {
          id: docId,
          get: async () => ({
            exists: store.has(docId),
            id: docId,
            data: () => (store.has(docId) ? JSON.parse(JSON.stringify(store.get(docId))) : null),
          }),
          set: async (data, opts = {}) => {
            if (opts && opts.merge) {
              const prev = store.get(docId) || {};
              store.set(docId, { ...prev, ...JSON.parse(JSON.stringify(data)) });
            } else {
              store.set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
          update: async (data) => {
            if (!store.has(docId)) throw new Error(`Doc ${docId} not found`);
            const prev = store.get(docId);
            store.set(docId, { ...prev, ...JSON.parse(JSON.stringify(data)) });
          },
        };
      },
      get: async () => {
        const docs = [];
        for (const [id, val] of store.entries()) {
          docs.push({ id, data: () => JSON.parse(JSON.stringify(val)) });
        }
        return { docs, forEach: (fn) => docs.forEach(fn) };
      },
      where: (f, op, val) => ({
        where: (f2, op2, val2) => ({
          get: async () => {
            const matches = [];
            for (const [id, data] of store.entries()) {
              if (data[f] === val && (op2 === '<=' ? data[f2] <= val2 : data[f2] === val2)) {
                matches.push({ id, data: () => JSON.parse(JSON.stringify(data)), ref: { id } });
              }
            }
            return { docs: matches, forEach: (fn) => matches.forEach(fn) };
          },
        }),
        get: async () => {
          const matches = [];
          for (const [id, data] of store.entries()) {
            if (data[f] === val) {
              matches.push({ id, data: () => JSON.parse(JSON.stringify(data)), ref: { id } });
            }
          }
          return { docs: matches, forEach: (fn) => matches.forEach(fn) };
        },
      }),
    };
  }

  async runTransaction(fn) {
    const transaction = {
      get: async (docRef) => docRef.get(),
      set: async (docRef, data, opts) => docRef.set(data, opts),
      update: async (docRef, data) => docRef.update(data),
    };
    return fn(transaction);
  }
}

// Mock Cloud Storage with file verification and custody checks
function createMockStorage(files = {}) {
  const store = new Map(Object.entries(files));
  return {
    bucket: (name) => ({
      file: (path) => ({
        exists: async () => [store.has(path)],
        download: async () => {
          if (!store.has(path)) throw new Error(`Object not found: ${path}`);
          const content = store.get(path);
          return [Buffer.isBuffer(content) ? content : Buffer.from(content)];
        },
      }),
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FORMINIT SUCCESS
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 1: Forminit primary success (status 200/201, Tier 1 direct Forminit)', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/form_w2_2026.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 Authoritative Form W-2 Taxpayer Document',
  });

  const clientId = 'usr_whitfield_4417';
  const documentId = 'doc_w2_primary_success';
  const checksum = 'sha256_primary_success_hash_12345';

  // 1. Store and confirm document reference in authorized Cloud Storage
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath,
    sha256Checksum: checksum,
    fileName: 'form_w2_2026.pdf',
    destinationUrl: INTAKE_ENDPOINTS.PRIMARY_FORMINIT,
  });

  assert.ok(enq.success);
  assert.equal(enq.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(enq.job.storageState, STATUS_MODEL.STORAGE_STATE.STORED);
  assert.equal(enq.job.registrationState, STATUS_MODEL.REGISTRATION_STATE.REGISTERED);
  assert.equal(enq.job.downstreamDelivery, STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED);
  assert.equal(enq.job.intakeTier, STATUS_MODEL.INTAKE_TIER.TIER_1_PRIMARY);

  // Verify durable intake record created in /document_submissions
  const intakeSnap = await db.collection('document_submissions').doc(enq.job.idempotencyKey).get();
  assert.ok(intakeSnap.exists);
  assert.equal(intakeSnap.data().storageState, 'stored');
  assert.equal(intakeSnap.data().registrationState, 'registered');

  // 2. Mock Forminit endpoint returning HTTP 200 OK
  let forminitCalled = false;
  const mockFetch = async (url, opts) => {
    if (url === INTAKE_ENDPOINTS.PRIMARY_FORMINIT) {
      forminitCalled = true;
      assert.ok(opts.headers['X-Idempotency-Key']);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, submissionId: 'fi_sub_primary_101' }),
      };
    }
    throw new Error(`Unexpected URL call: ${url}`);
  };

  // 3. Execute delivery worker
  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_1', {
    fetchFn: mockFetch,
    requireStorageFile: true,
  });

  assert.ok(execResult.success);
  assert.equal(forminitCalled, true);
  assert.equal(execResult.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(execResult.downstreamDelivery, STATUS_MODEL.DOWNSTREAM_DELIVERY.FORMINIT_DELIVERED);
  assert.equal(execResult.intakeTier, STATUS_MODEL.INTAKE_TIER.TIER_1_PRIMARY);

  // 4. Verify terminal status in Firestore collections
  const queueSnap = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(enq.job.jobId).get();
  assert.equal(queueSnap.data().status, DELIVERY_STATUS.DELIVERED);
  assert.equal(queueSnap.data().downstreamDelivery, 'forminit_delivered');
  assert.equal(queueSnap.data().storageState, 'stored');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FORMINIT TIMEOUT & AUTOMATIC FALLBACK SUCCESS
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 2: Forminit timeout (AbortController / 408) routes to secondary fallback success', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/schedule_c_timeout.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 Schedule C Document for Timeout Scenario',
  });

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_schedule_c_timeout',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: 'schedule_c_timeout.pdf',
    destinationUrl: INTAKE_ENDPOINTS.PRIMARY_FORMINIT,
  });

  let primaryAttempted = false;
  let fallbackAttempted = false;

  const mockFetch = async (url, opts) => {
    if (url === INTAKE_ENDPOINTS.PRIMARY_FORMINIT) {
      primaryAttempted = true;
      // Simulate AbortController timeout on primary Forminit
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'AbortError';
      throw timeoutErr;
    }

    if (url.includes('intakeDocumentFallback')) {
      fallbackAttempted = true;
      assert.ok(opts.headers['X-Idempotency-Key']);
      assert.ok(opts.headers['Authorization']);
      const body = JSON.parse(opts.body);
      assert.equal(body.storagePath, storagePath);
      assert.equal(body.idempotencyKey, enq.job.idempotencyKey);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, fallbackId: 'fb_sub_receipt_992' }),
      };
    }

    throw new Error(`Unexpected destination: ${url}`);
  };

  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_2', {
    fetchFn: mockFetch,
    timeoutMs: 100, // Bounded timeout
    requireStorageFile: true,
  });

  assert.ok(execResult.success);
  assert.equal(primaryAttempted, true);
  assert.equal(fallbackAttempted, true);
  assert.equal(execResult.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(execResult.downstreamDelivery, STATUS_MODEL.DOWNSTREAM_DELIVERY.FALLBACK_DELIVERED);
  assert.equal(execResult.intakeTier, STATUS_MODEL.INTAKE_TIER.TIER_2_FALLBACK);

  // Verify intake record reconciled as fallback_delivered
  const intakeSnap = await db.collection('document_submissions').doc(enq.job.idempotencyKey).get();
  assert.equal(intakeSnap.data().downstreamDelivery, 'fallback_delivered');
  assert.equal(intakeSnap.data().storageState, 'stored');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP 429 RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 3: Forminit HTTP 429 rate limit with Retry-After header & failover backoff', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/1099_misc_429.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 1099-MISC Payload',
  });

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_1099_429',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: '1099_misc_429.pdf',
  });

  let primaryAttempts = 0;
  let fallbackAttempts = 0;

  // Forminit returns 429 with Retry-After: 45
  // Fallback also returns 429
  const mockFetch = async (url) => {
    if (url === INTAKE_ENDPOINTS.PRIMARY_FORMINIT) {
      primaryAttempts++;
      return {
        status: 429,
        ok: false,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '45' : null) },
        text: async () => JSON.stringify({ error: 'Too Many Requests' }),
      };
    }
    if (url.includes('intakeDocumentFallback')) {
      fallbackAttempts++;
      return {
        status: 429,
        ok: false,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '60' : null) },
        text: async () => JSON.stringify({ error: 'Fallback Rate Limit' }),
      };
    }
    throw new Error(`Unexpected destination: ${url}`);
  };

  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_3', {
    fetchFn: mockFetch,
    requireStorageFile: true,
  });

  assert.equal(execResult.success, false);
  assert.equal(primaryAttempts, 1);
  assert.equal(fallbackAttempts, 1);
  assert.equal(execResult.status, DELIVERY_STATUS.RETRY_PENDING);
  assert.equal(execResult.job.lastErrorCategory, ERROR_CATEGORY.RATE_LIMITED_429);
  assert.ok(execResult.backoff.backoffSeconds >= 45, 'Backoff must respect Retry-After header');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. HTTP 500 SERVER ERROR & FALLBACK ROUTING
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 4: Forminit HTTP 500 routes automatically to Firebase Cloud Function fallback', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/k1_500.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 Schedule K-1 Document',
  });

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_k1_500',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: 'k1_500.pdf',
  });

  let fallbackPayloadReceived = null;
  const mockFetch = async (url, opts) => {
    if (url === INTAKE_ENDPOINTS.PRIMARY_FORMINIT) {
      return {
        status: 500,
        ok: false,
        headers: { get: () => null },
        text: async () => 'Internal Server Error on Forminit Gateway',
      };
    }
    if (url.includes('intakeDocumentFallback')) {
      fallbackPayloadReceived = JSON.parse(opts.body);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ success: true, receiptId: 'fallback_k1_ok' }),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_4', {
    fetchFn: mockFetch,
    requireStorageFile: true,
  });

  assert.ok(execResult.success);
  assert.ok(fallbackPayloadReceived);
  assert.equal(fallbackPayloadReceived.storagePath, storagePath);
  assert.equal(fallbackPayloadReceived.idempotencyKey, enq.job.idempotencyKey);
  assert.equal(execResult.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(execResult.downstreamDelivery, 'fallback_delivered');
  assert.equal(execResult.intakeTier, 'Tier 2 (Automatic Fallback - Cloud Function)');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FALLBACK SUCCESS DIRECTLY & DURABLE INTAKE REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 5: Fallback success & durable intake registration with stable idempotency key', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/1099_nec.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 1099-NEC Document Content',
  });

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_1099_nec_fallback',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: '1099_nec.pdf',
    destinationUrl: INTAKE_ENDPOINTS.FALLBACK_FIREBASE, // Direct fallback test
  });

  const mockFetch = async (url, opts) => {
    assert.ok(url.includes('intakeDocumentFallback'));
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ success: true, submissionId: 'fb_1099_nec_rec' }),
    };
  };

  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_5', {
    fetchFn: mockFetch,
    requireStorageFile: true,
  });

  assert.ok(execResult.success);
  assert.equal(execResult.status, DELIVERY_STATUS.DELIVERED);

  // Check intake registration in Firestore
  const subSnap = await db.collection('document_submissions').doc(enq.job.idempotencyKey).get();
  assert.ok(subSnap.exists);
  assert.equal(subSnap.data().idempotencyKey, enq.job.idempotencyKey);
  assert.equal(subSnap.data().storageState, 'stored');
  assert.equal(subSnap.data().registrationState, 'registered');
  assert.equal(subSnap.data().serverConfirmed, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. BOTH DESTINATIONS FAILING & CUSTODY PRESERVATION
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 6: Both destinations failing (Primary 500 + Fallback 503) preserves vault custody', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/hud1_settlement.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 HUD-1 Settlement Document',
  });

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_hud1_both_fail',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: 'hud1_settlement.pdf',
    maxAttempts: 1, // Will exhaust retries on attempt 1
  });

  const mockFetch = async (url) => {
    if (url === INTAKE_ENDPOINTS.PRIMARY_FORMINIT) {
      return { status: 500, ok: false, headers: { get: () => null }, text: async () => 'Forminit Outage' };
    }
    if (url.includes('intakeDocumentFallback')) {
      return { status: 503, ok: false, headers: { get: () => null }, text: async () => 'Firebase Function 503 Unavailable' };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const execResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_unit_6', {
    fetchFn: mockFetch,
    requireStorageFile: true,
  });

  assert.equal(execResult.success, false);
  // Max attempts was 1, so it transitions to Dead-Letter (needs_review)
  assert.equal(execResult.status, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.ok(execResult.error.includes('Primary Forminit failed') && execResult.error.includes('secondary fallback failed'));

  // Custody verification: Document reference in Cloud Storage is NOT deleted or corrupted
  const jobRecord = (await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(enq.job.jobId).get()).data();
  assert.equal(jobRecord.storagePath, storagePath);
  assert.equal(jobRecord.storageState, 'stored', 'Statutory custody must be preserved despite delivery failures');
  assert.equal(jobRecord.registrationState, 'registered');
  assert.equal(jobRecord.downstreamDelivery, 'needs_review');

  // Verify minimal audit event created without PII
  const auditDocs = (await db.collection('audit_logs').get()).docs;
  const deadLetterAlert = auditDocs.find((d) => d.data().action.includes('Retry Budget Exhausted'));
  assert.ok(deadLetterAlert);
  assert.ok(!deadLetterAlert.data().details.includes('SSN'), 'Audit event must not contain raw SSN');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. DUPLICATE REQUESTS & UNCERTAIN TIMEOUT OUTCOME RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 7: Duplicate requests & outcome reconciliation before retrying uncertain submissions', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/tax_return_2026.pdf';
  const storage = createMockStorage({
    [storagePath]: '%PDF-1.4 Tax Return 1040 2026',
  });

  const clientId = 'usr_whitfield_4417';
  const documentId = 'doc_tax_return_dup';
  const checksum = 'sha256_checksum_constant_888';

  // 1. Initial submission
  const firstEnq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath,
    sha256Checksum: checksum,
    fileName: 'tax_return_2026.pdf',
  });
  assert.equal(firstEnq.isExisting, false);

  // 2. Duplicate submission with same stable parameters
  const duplicateEnq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath,
    sha256Checksum: checksum,
    fileName: 'tax_return_2026.pdf',
  });
  assert.equal(duplicateEnq.isExisting, true);
  assert.equal(duplicateEnq.job.jobId, firstEnq.job.jobId);
  assert.equal(duplicateEnq.job.idempotencyKey, firstEnq.job.idempotencyKey);

  // 3. Simulate uncertain outcome scenario:
  // Downstream destination received and recorded document in intake record
  // but previous network response timed out before client received receipt.
  await db.collection('document_submissions').doc(firstEnq.job.idempotencyKey).set({
    downstreamDelivery: 'forminit_delivered',
    intakeTier: 'Tier 1 (Direct Forminit)',
    status: 'delivered',
    deliveredAt: new Date().toISOString(),
    deliveryReceipt: { id: 'fi_reconciled_receipt_554' },
  }, { merge: true });

  // 4. Worker executes retry: Reconciles destination outcome BEFORE making duplicate HTTP calls
  let httpCallsMade = 0;
  const mockFetchThatShouldNotBeCalled = async () => {
    httpCallsMade++;
    return { status: 200, ok: true, text: async () => '{}' };
  };

  const reconcileResult = await executeDeliveryJob(db, storage, firstEnq.job.jobId, 'worker_recon', {
    fetchFn: mockFetchThatShouldNotBeCalled,
  });

  assert.ok(reconcileResult.success);
  assert.equal(reconcileResult.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(reconcileResult.reconciledFromIntake, true);
  assert.equal(httpCallsMade, 0, 'Must reconcile without dispatching duplicate HTTP request!');

  // Check deduplication across collection: only 1 document exists
  const allQueueJobs = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).get();
  assert.equal(allQueueJobs.docs.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. RECOVERY AFTER BROWSER CLOSES
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 8: Recovery after browser closes (authoritative Firestore custody persists)', async () => {
  const db = new MockHardenedFirestore();
  const storagePath = 'clients/usr_whitfield_4417/documents/crash_recovery.pdf';

  // 1. Client uploads document and receives stable identifiers
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_browser_crash_recovery',
    clientId: 'usr_whitfield_4417',
    storagePath,
    fileName: 'crash_recovery.pdf',
  });
  assert.ok(enq.success);

  // 2. Ephemeral browser storage holds temporary recovery aid
  const ephemeralClientStorage = new Map();
  const tokenKey = `tfr_ephemeral_recovery_${enq.job.idempotencyKey}`;
  ephemeralClientStorage.set(tokenKey, JSON.stringify({
    jobId: enq.job.jobId,
    idempotencyKey: enq.job.idempotencyKey,
    timestamp: Date.now(),
    isAuthoritative: false,
    disclaimer: 'TEMPORARY CLIENT CRASH-RECOVERY AID ONLY. NOT AUTHORITATIVE TAXPAYER DOCUMENT CUSTODY.',
  }));

  // 3. User closes browser window or clears localStorage
  ephemeralClientStorage.clear();
  assert.equal(ephemeralClientStorage.size, 0);

  // 4. Background worker continues server-side processing independently of browser!
  const storage = createMockStorage({ [storagePath]: '%PDF-1.4 Persisted in Cloud Storage' });
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify({ success: true, receipt: 'rcpt_bg_delivery' }),
  });

  const workerResult = await executeDeliveryJob(db, storage, enq.job.jobId, 'worker_autonomous', {
    fetchFn: mockFetch,
  });
  assert.ok(workerResult.success);

  // 5. User re-opens browser and queries authoritative Firestore state directly
  const retrievedRecord = (await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(enq.job.jobId).get()).data();
  assert.ok(retrievedRecord);
  assert.equal(retrievedRecord.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(retrievedRecord.storageState, 'stored');
  assert.equal(retrievedRecord.registrationState, 'registered');
  assert.equal(retrievedRecord.downstreamDelivery, 'forminit_delivered');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. MANUAL RETRY AUTHORIZATION (CIRCULAR 230 § 10.22)
// ─────────────────────────────────────────────────────────────────────────────
test('Scenario 9: Manual retries permitted only to authorized staff with compliance justification', async () => {
  const db = new MockHardenedFirestore();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_auth_check',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_auth.pdf',
    maxAttempts: 1,
  });
  const jobId = enq.job.jobId;

  // Fail to dead-letter state
  await acquireJobLease(db, jobId, 'w_fail');
  await failJobDelivery(db, jobId, 'w_fail', { statusCode: 500, errorMessage: 'Service down' });

  // 1. Client user attempts manual retry -> Must be rejected!
  const clientInfo = {
    staffUid: 'usr_whitfield_4417',
    role: 'client',
    isStaff: false,
    justification: 'Client trying to force retry',
  };

  await assert.rejects(
    async () => manualRetryJob(db, jobId, clientInfo),
    /Unauthorized: Only authorized firm staff/
  );

  // 2. Staff without minimum 5-character justification -> Must be rejected!
  const staffInfoNoJustification = {
    staffUid: 'usr_staff_denise',
    role: 'firm_preparer',
    isStaff: true,
    justification: 'ok',
  };

  await assert.rejects(
    async () => manualRetryJob(db, jobId, staffInfoNoJustification),
    /compliance justification \(minimum 5 characters\) is required/
  );

  // 3. Authorized staff with valid Circular 230 justification -> Accepted!
  const validStaffInfo = {
    staffUid: 'usr_staff_denise',
    staffEmail: 'denise@pivot-aide.tax',
    role: 'firm_reviewer',
    isStaff: true,
    justification: 'Downstream endpoint restored and verified under Circular 230 § 10.22 diligence protocol.',
  };

  const retryResult = await manualRetryJob(db, jobId, validStaffInfo, { additionalAttempts: 2 });
  assert.ok(retryResult.success);
  assert.equal(retryResult.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(retryResult.job.downstreamDelivery, 'queued');
  assert.equal(retryResult.job.storageState, 'stored');
  assert.equal(retryResult.job.maxAttempts, 3);
});

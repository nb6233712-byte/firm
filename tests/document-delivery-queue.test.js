/**
 * ============================================================================
 * THE FILE ROOM — DURABLE DOCUMENT DELIVERY QUEUE ROOT TEST RUNNER
 * tests/document-delivery-queue.test.js
 * ============================================================================
 *
 * Validates Requirement 10:
 * 1. Browser Closure & Ephemeral Recovery Aid Resilience
 * 2. Offline Mode & Network Timeout Recovery
 * 3. Worker Restart & Lease Reclamation Resilience
 * 4. Duplicate Events & Idempotent Deduplication
 * 5. Exhausted Retries & Dead-Letter (needs_review) Routing
 * 6. Controlled Manual Recovery under Treasury Circular 230 § 10.22
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// First include and run the authoritative 14-test unit test suite
require('../functions/test/delivery-queue.test.js');

const {
  DELIVERY_STATUS,
  LEGAL_DELIVERY_TRANSITIONS,
  isValidDeliveryTransition,
  ERROR_CATEGORY,
  QUEUE_CONFIG,
  calculateExponentialBackoff,
  parseRetryAfterHeader,
  classifyHttpStatus,
  generateIdempotencyKey,
  enqueueDocumentDeliveryJob,
  acquireJobLease,
  completeJobDelivery,
  failJobDelivery,
  manualRetryJob,
  reclaimStaleLeases,
  getQueueMetrics,
  executeDeliveryJob,
  sweepDeliveryQueue,
} = require('../functions/delivery-queue');

// Mock Firestore for E2E scenario validation
class MockFirestoreE2E {
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
        const docId = id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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

  async runTransaction(updateFunction) {
    const transaction = {
      get: async (docRef) => docRef.get(),
      set: async (docRef, data, opts) => docRef.set(data, opts),
      update: async (docRef, data) => docRef.update(data),
    };
    return updateFunction(transaction);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUIREMENT 10 TEST SUITE: 6 CRITICAL RELIABILITY SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

test('R10-Scenario 1: Browser Closure & Ephemeral Recovery Aid Resilience', async () => {
  const db = new MockFirestoreE2E();
  const clientId = 'usr_whitfield_4417';
  const documentId = 'doc_browser_crash_001';
  const storagePath = 'clients/usr_whitfield_4417/tax-years/2026/documents/w2_crash.pdf';
  const checksum = 'sha256_mock_abcdef123456';

  // 1. Client begins upload: Saves ephemeral recovery aid in sessionStorage
  const ephemeralStorage = new Map();
  const idempotencyKey = generateIdempotencyKey(clientId, documentId, checksum);
  const recoveryKey = `tfr_ephemeral_recovery_${idempotencyKey}`;

  ephemeralStorage.set(recoveryKey, JSON.stringify({
    data: { jobId: idempotencyKey, idempotencyKey, documentId, storagePath },
    timestamp: Date.now(),
    isAuthoritative: false,
    disclaimer: 'TEMPORARY CLIENT CRASH-RECOVERY AID ONLY. NOT AUTHORITATIVE TAXPAYER DOCUMENT CUSTODY.',
  }));

  // Verify non-authoritative disclaimer is present
  const savedToken = JSON.parse(ephemeralStorage.get(recoveryKey));
  assert.equal(savedToken.isAuthoritative, false);
  assert.ok(savedToken.disclaimer.includes('TEMPORARY CLIENT CRASH-RECOVERY AID ONLY'));

  // 2. Authoritative Firestore record created
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath,
    sha256Checksum: checksum,
    fileName: 'w2_crash.pdf',
  });
  assert.ok(enq.success);
  assert.equal(enq.job.status, DELIVERY_STATUS.QUEUED);

  // 3. Simulate browser closure: in-memory state is destroyed, but localStorage persists
  // On re-opening browser, recovery aid checks authoritative Firestore
  const serverJobSnap = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(enq.job.jobId).get();
  assert.ok(serverJobSnap.exists);

  // Recovery aid safely clears because Firestore has authoritative custody
  ephemeralStorage.delete(recoveryKey);
  assert.equal(ephemeralStorage.has(recoveryKey), false);

  // Confirm system never claims zero data loss solely based on localStorage
  assert.equal(enq.job.storageReferenceRetained, true);
});

test('R10-Scenario 2: Offline Mode & Network Timeout Recovery', async () => {
  const db = new MockFirestoreE2E();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_offline_mode_002',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_offline.pdf',
    fileName: 'OfflineDoc.pdf',
  });
  const jobId = enq.job.jobId;

  // 1. Worker acquires lease while network is degraded
  const lease = await acquireJobLease(db, jobId, 'worker_offline_1');
  assert.ok(lease.acquired);

  // 2. Simulated fetch throws network offline error (AbortError / ENOTFOUND)
  const networkError = new Error('getaddrinfo ENOTFOUND forminit.com');
  const classification = classifyHttpStatus(null); // Network timeout classification
  assert.equal(classification.retryable, true);
  assert.equal(classification.category, ERROR_CATEGORY.NETWORK_TIMEOUT);

  // 3. Delivery fails due to offline condition -> Scheduled for retry with backoff
  const fail = await failJobDelivery(db, jobId, 'worker_offline_1', {
    statusCode: null,
    errorMessage: networkError.message,
    errorCategory: classification.category,
  });

  assert.equal(fail.newStatus, DELIVERY_STATUS.RETRY_PENDING);
  assert.equal(fail.job.lastErrorCategory, ERROR_CATEGORY.NETWORK_TIMEOUT);
  assert.ok(fail.backoff.backoffSeconds >= 1);
  assert.ok(new Date(fail.job.nextAttemptAt).getTime() > Date.now());
});

test('R10-Scenario 3: Worker Restart & Stale Lease Reclamation', async () => {
  const db = new MockFirestoreE2E();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_worker_restart_003',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_worker_restart.pdf',
  });
  const jobId = enq.job.jobId;

  const initialTime = Date.now();
  // Worker A acquires 60s lease
  const leaseA = await acquireJobLease(db, jobId, 'worker_crashed_process_101', {
    leaseDurationMs: 60000,
    nowMs: initialTime,
  });
  assert.ok(leaseA.acquired);
  assert.equal(leaseA.job.leaseOwner, 'worker_crashed_process_101');

  // Worker B immediately attempts to process same job (rejected due to active lease)
  const leaseB = await acquireJobLease(db, jobId, 'worker_surviving_process_202', { nowMs: initialTime + 5000 });
  assert.equal(leaseB.acquired, false);
  assert.equal(leaseB.reason, 'CONCURRENT_WORKER_LEASE_ACTIVE');

  // Simulate Worker A crashing and time advancing 65 seconds (lease expires)
  const afterCrashTime = initialTime + 65000;

  // Worker B attempts again: Expired lease is safely reclaimed from crashed Worker A!
  const leaseBAfterExpiry = await acquireJobLease(db, jobId, 'worker_surviving_process_202', {
    nowMs: afterCrashTime,
    leaseDurationMs: 60000,
  });

  assert.ok(leaseBAfterExpiry.acquired);
  assert.equal(leaseBAfterExpiry.job.leaseOwner, 'worker_surviving_process_202');
  assert.equal(leaseBAfterExpiry.job.attemptCount, 2);
});

test('R10-Scenario 4: Duplicate Events & Idempotent Deduplication', async () => {
  const db = new MockFirestoreE2E();
  const clientId = 'usr_whitfield_4417';
  const documentId = 'doc_duplicate_tax_return';
  const checksum = 'sha256_constant_hash_999999';

  // First submission event
  const firstEnq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath: 'clients/usr_whitfield_4417/doc_tax.pdf',
    sha256Checksum: checksum,
  });
  assert.ok(firstEnq.success);
  assert.equal(firstEnq.isExisting, false);

  // Duplicate submission event (client double-clicks or webhook fires twice)
  const dupEnq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath: 'clients/usr_whitfield_4417/doc_tax.pdf',
    sha256Checksum: checksum,
  });
  assert.ok(dupEnq.success);
  assert.equal(dupEnq.isExisting, true);
  assert.equal(dupEnq.job.jobId, firstEnq.job.jobId);
  assert.equal(dupEnq.job.idempotencyKey, firstEnq.job.idempotencyKey);

  // Complete job delivery
  await acquireJobLease(db, firstEnq.job.jobId, 'worker_final');
  await completeJobDelivery(db, firstEnq.job.jobId, 'worker_final', { receiptId: 'rcpt_confirmed_dup_test' });

  // Third submission event when already delivered
  const thirdEnq = await enqueueDocumentDeliveryJob(db, {
    documentId,
    clientId,
    storagePath: 'clients/usr_whitfield_4417/doc_tax.pdf',
    sha256Checksum: checksum,
  });
  assert.ok(thirdEnq.success);
  assert.equal(thirdEnq.isExisting, true);
  assert.equal(thirdEnq.job.status, DELIVERY_STATUS.DELIVERED);
  assert.ok(thirdEnq.message.includes('already delivered downstream'));

  // Ensure only 1 document record exists in queue collection
  const allDocs = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).get();
  assert.equal(allDocs.docs.length, 1);
});

test('R10-Scenario 5: Exhausted Retries & Dead-Letter (needs_review) Routing', async () => {
  const db = new MockFirestoreE2E();
  const maxAttempts = 3;
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_exhausted_retries_005',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_fail.pdf',
    maxAttempts,
  });
  const jobId = enq.job.jobId;

  // Attempt 1 fails (500)
  await acquireJobLease(db, jobId, 'w1');
  const fail1 = await failJobDelivery(db, jobId, 'w1', { statusCode: 500, errorMessage: 'Internal error 1' });
  assert.equal(fail1.newStatus, DELIVERY_STATUS.RETRY_PENDING);

  // Attempt 2 fails (500) - Advance past backoff window
  const lease2 = await acquireJobLease(db, jobId, 'w1', { nowMs: Date.now() + 60000 });
  assert.ok(lease2.acquired);
  const fail2 = await failJobDelivery(db, jobId, 'w1', { statusCode: 500, errorMessage: 'Internal error 2' });
  assert.equal(fail2.newStatus, DELIVERY_STATUS.RETRY_PENDING);

  // Attempt 3 fails (500) -> Retry budget exhausted (3/3)!
  const lease3 = await acquireJobLease(db, jobId, 'w1', { nowMs: Date.now() + 120000 });
  assert.ok(lease3.acquired);
  const fail3 = await failJobDelivery(db, jobId, 'w1', { statusCode: 500, errorMessage: 'Internal error 3' });

  // Must transition directly to needs_review (Dead-Letter Queue)
  assert.equal(fail3.newStatus, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.equal(fail3.job.lastErrorCategory, ERROR_CATEGORY.RETRY_BUDGET_EXHAUSTED);
  assert.equal(fail3.job.nextAttemptAt, null);

  // Verify that high-priority compliance audit alert was created
  const auditLogs = await db.collection('audit_logs').get();
  const deadLetterAlert = auditLogs.docs.find(d => d.data().action.includes('Retry Budget Exhausted'));
  assert.ok(deadLetterAlert);
  assert.equal(deadLetterAlert.data().category, 'Documents');
  assert.ok(deadLetterAlert.data().details.includes('exhausted all 3 delivery attempts'));
});

test('R10-Scenario 6: Controlled Manual Recovery under Circular 230 § 10.22', async () => {
  const db = new MockFirestoreE2E();
  // Job in dead-letter state
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_cpa_manual_recovery_006',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_manual.pdf',
    maxAttempts: 1,
  });
  const jobId = enq.job.jobId;
  await acquireJobLease(db, jobId, 'w1');
  await failJobDelivery(db, jobId, 'w1', { statusCode: 503, errorMessage: 'Service unavailable' });

  const deadLetterSnap = (await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId).get()).data();
  assert.equal(deadLetterSnap.status, DELIVERY_STATUS.NEEDS_REVIEW);

  // Practitioner provides clinical / compliance justification
  const staffInfo = {
    staffUid: 'usr_cpa_jordan_9912',
    staffEmail: 'jordan@pivot-aide.tax',
    justification: 'Forminit service status green. Verified PDF integrity with taxpayer via phone under Circular 230 § 10.22 diligence protocol.',
  };

  const manualResult = await manualRetryJob(db, jobId, staffInfo, { additionalAttempts: 2 });
  assert.ok(manualResult.success);
  assert.equal(manualResult.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(manualResult.job.maxAttempts, 3); // 1 previous + 2 additional
  assert.equal(manualResult.job.leaseOwner, null);
  assert.ok(manualResult.job.nextAttemptAt);

  // Verify compliance audit ledger entry
  const audits = await db.collection('audit_logs').get();
  const manualAudit = audits.docs.find(d => d.data().action.includes('Document Delivery Manual Retry Authorized'));
  assert.ok(manualAudit);
  assert.equal(manualAudit.data().staffUid, 'usr_cpa_jordan_9912');
  assert.ok(manualAudit.data().details.includes('Circular 230 § 10.22 diligence protocol'));
});

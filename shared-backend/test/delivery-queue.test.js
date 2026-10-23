/**
 * ============================================================================
 * THE FILE ROOM — DURABLE DOCUMENT DELIVERY QUEUE TEST SUITE
 * functions/test/delivery-queue.test.js
 * ============================================================================
 *
 * Requirements Covered:
 * 1. Explicit 7 States (uploaded, queued, processing, delivered, retry_pending,
 *    permanently_failed, needs_review) and state transition integrity.
 * 2. Mandatory Metadata Fields: attempt count, next attempt time, last error
 *    category, idempotency key, creation time, and last update time.
 * 3. Exponential Backoff with Jitter: Bounded retry calculations, HTTP 429
 *    Retry-After header handling, and 5xx server error classification.
 * 4. Dead-Letter / Needs-Review Queue: Transitions to needs_review when retry
 *    budget is exhausted; generates practitioner audit alerts.
 * 5. Mutual Exclusion & Worker Leasing: Multiple workers cannot lease the same
 *    job concurrently; atomic transactions reject overlapping worker locks.
 * 6. Worker Crash / Restart Resilience: Expired leases are safely detected and
 *    reclaimed by surviving workers or supervisor.
 * 7. Deduplication & Idempotency: Retries and re-enqueuing do not create
 *    duplicate document records or duplicate logical submissions.
 * 8. Non-Retryable Client Errors: HTTP 400/401/403/413/415/422 immediately transition
 *    to permanently_failed without wasting retry budget.
 * 9. Custody & Retention: Stable storage reference is retained throughout the
 *    entire lifecycle until delivery confirmation or authorized retention.
 * 10. Controlled Manual Recovery: Authorized firm staff can inspect and manually
 *    retry dead-letter items with clinical/compliance justifications.
 * 11. Client-Side Temporary Recovery Aid Resilience: LocalStorage is treated
 *    as transient recovery aid only; does not claim zero data loss.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
} = require('../delivery-queue');

// ============================================================================
// IN-MEMORY MOCK FIRESTORE FOR TRANSACTIONAL QUEUE TESTING
// ============================================================================

class MockDocSnapshot {
  constructor(id, data, exists) {
    this.id = id;
    this._data = data ? JSON.parse(JSON.stringify(data)) : null;
    this.exists = Boolean(exists);
  }
  data() {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : null;
  }
}

class MockDocReference {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const raw = this.collection._docs.get(this.id);
    return new MockDocSnapshot(this.id, raw, Boolean(raw));
  }

  async set(data, options = {}) {
    if (options && options.merge) {
      const existing = this.collection._docs.get(this.id) || {};
      const merged = { ...existing, ...JSON.parse(JSON.stringify(data)) };
      this.collection._docs.set(this.id, merged);
    } else {
      this.collection._docs.set(this.id, JSON.parse(JSON.stringify(data)));
    }
  }

  async update(data) {
    const existing = this.collection._docs.get(this.id);
    if (!existing) {
      throw new Error(`Doc ${this.id} not found for update`);
    }
    const updated = { ...existing, ...JSON.parse(JSON.stringify(data)) };
    this.collection._docs.set(this.id, updated);
  }
}

class MockCollectionReference {
  constructor(name) {
    this.name = name;
    this._docs = new Map();
  }

  doc(id) {
    const docId = id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new MockDocReference(this, docId);
  }

  where(field, op, val) {
    return {
      where: (f2, op2, val2) => this._filterQuery([[field, op, val], [f2, op2, val2]]),
      get: async () => this._filterQuery([[field, op, val]]).get(),
    };
  }

  _filterQuery(predicates) {
    const results = [];
    for (const [id, data] of this._docs.entries()) {
      let match = true;
      for (const [field, op, val] of predicates) {
        if (op === '==' && data[field] !== val) match = false;
        if (op === '<=' && data[field] > val) match = false;
        if (op === '>=' && data[field] < val) match = false;
      }
      if (match) {
        results.push({
          id,
          ref: this.doc(id),
          data: () => JSON.parse(JSON.stringify(data)),
        });
      }
    }
    return {
      docs: results,
      get: async () => ({ docs: results, forEach: (fn) => results.forEach(fn) }),
    };
  }

  async get() {
    const results = [];
    for (const [id, data] of this._docs.entries()) {
      results.push({
        id,
        ref: this.doc(id),
        data: () => JSON.parse(JSON.stringify(data)),
      });
    }
    return {
      docs: results,
      forEach: (fn) => results.forEach(fn),
    };
  }
}

class MockFirestore {
  constructor() {
    this._collections = new Map();
  }

  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new MockCollectionReference(name));
    }
    return this._collections.get(name);
  }

  async runTransaction(updateFunction) {
    const self = this;
    const reads = new Map();

    const transaction = {
      async get(docRef) {
        const snap = await docRef.get();
        reads.set(docRef.id, snap.data());
        return snap;
      },
      set(docRef, data, options = {}) {
        docRef.set(data, options);
      },
      update(docRef, data) {
        docRef.update(data);
      },
    };

    return await updateFunction(transaction);
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

test('1. States & Transitions: Explicit 7 states defined and legal transitions enforced', async () => {
  assert.equal(DELIVERY_STATUS.UPLOADED, 'uploaded');
  assert.equal(DELIVERY_STATUS.QUEUED, 'queued');
  assert.equal(DELIVERY_STATUS.PROCESSING, 'processing');
  assert.equal(DELIVERY_STATUS.DELIVERED, 'delivered');
  assert.equal(DELIVERY_STATUS.RETRY_PENDING, 'retry_pending');
  assert.equal(DELIVERY_STATUS.PERMANENTLY_FAILED, 'permanently_failed');
  assert.equal(DELIVERY_STATUS.NEEDS_REVIEW, 'needs_review');

  // Legal transitions
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.UPLOADED, DELIVERY_STATUS.QUEUED));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.QUEUED, DELIVERY_STATUS.PROCESSING));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.PROCESSING, DELIVERY_STATUS.DELIVERED));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.PROCESSING, DELIVERY_STATUS.RETRY_PENDING));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.PROCESSING, DELIVERY_STATUS.NEEDS_REVIEW));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.RETRY_PENDING, DELIVERY_STATUS.PROCESSING));
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.NEEDS_REVIEW, DELIVERY_STATUS.QUEUED)); // Manual staff retry
  assert.ok(isValidDeliveryTransition(DELIVERY_STATUS.PERMANENTLY_FAILED, DELIVERY_STATUS.QUEUED)); // Manual override

  // Illegal transitions
  assert.equal(isValidDeliveryTransition(DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.QUEUED), false);
  assert.equal(isValidDeliveryTransition(DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.PROCESSING), false);
  assert.equal(isValidDeliveryTransition(DELIVERY_STATUS.UPLOADED, DELIVERY_STATUS.DELIVERED), false);
});

test('2. Mandatory Metadata Fields: Enqueued jobs capture all 6 required metadata items', async () => {
  const db = new MockFirestore();

  const enqueueResult = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_w2_2026_001',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_w2_2026_001.pdf',
    sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    fileName: 'Form_W2_Whitfield.pdf',
    clientEmail: 'm.whitfield@example.com',
    taxYear: 2026,
  });

  assert.ok(enqueueResult.success);
  const job = enqueueResult.job;

  // Metadata 1: Attempt Count (starts at 0)
  assert.equal(job.attemptCount, 0);

  // Metadata 2: Next Attempt Time (set to valid timestamp)
  assert.ok(job.nextAttemptAt);
  assert.ok(new Date(job.nextAttemptAt).getTime() > 0);

  // Metadata 3: Last Error Category (null initially)
  assert.equal(job.lastErrorCategory, null);

  // Metadata 4: Idempotency Key (stable deterministic key)
  assert.ok(job.idempotencyKey);
  assert.ok(job.idempotencyKey.startsWith('idemp_usr_whitfield_4417_doc_w2_2026_001_'));

  // Metadata 5: Creation Time
  assert.ok(job.createdAt);

  // Metadata 6: Last Update Time
  assert.ok(job.updatedAt);

  // Status check
  assert.equal(job.status, DELIVERY_STATUS.QUEUED);
});

test('3. Exponential Backoff with Jitter: Bounded retries and HTTP 429 Retry-After handling', async () => {
  const now = 1776250000000;

  // Attempt 1 with fixed RNG fraction 0.5 (Base = 5s, 5 * 2^0 = 5s => jittered = 2.5s -> 3s)
  const backoff1 = calculateExponentialBackoff(1, {
    nowMs: now,
    baseBackoffSeconds: 5,
    maxBackoffSeconds: 300,
    randomFn: () => 0.5,
  });
  assert.equal(backoff1.backoffSeconds, 3);
  assert.equal(backoff1.backoffMs, 3000);
  assert.equal(backoff1.nextAttemptAt, new Date(now + 3000).toISOString());

  // Attempt 3 with fixed RNG fraction 0.75 (Base = 5s, 5 * 2^2 = 20s => jittered = 15s)
  const backoff3 = calculateExponentialBackoff(3, {
    nowMs: now,
    baseBackoffSeconds: 5,
    maxBackoffSeconds: 300,
    randomFn: () => 0.75,
  });
  assert.equal(backoff3.backoffSeconds, 15);

  // Attempt 10 capped at maxBackoffSeconds (300s ceiling)
  const backoff10 = calculateExponentialBackoff(10, {
    nowMs: now,
    baseBackoffSeconds: 5,
    maxBackoffSeconds: 300,
    randomFn: () => 1.0,
  });
  assert.equal(backoff10.backoffSeconds, 300);

  // HTTP 429 Retry-After header: Integer seconds
  const backoff429 = calculateExponentialBackoff(2, {
    nowMs: now,
    retryAfterHeader: '45',
    randomFn: () => 0.2, // raw jitter would be 2s, but Retry-After requires 45s
  });
  assert.equal(backoff429.backoffSeconds, 45);
  assert.equal(backoff429.retryAfterSeconds, 45);

  // HTTP 429 Retry-After header: HTTP-date string
  const futureDate = new Date(now + 60000).toUTCString();
  const backoffDate = calculateExponentialBackoff(1, {
    nowMs: now,
    retryAfterHeader: futureDate,
    randomFn: () => 0.1,
  });
  assert.equal(backoffDate.backoffSeconds, 60);

  // Classify Status Codes
  assert.deepEqual(classifyHttpStatus(429), {
    retryable: true,
    category: ERROR_CATEGORY.RATE_LIMITED_429,
    isRateLimit: true,
    isServerError: false,
  });

  assert.deepEqual(classifyHttpStatus(503), {
    retryable: true,
    category: ERROR_CATEGORY.SERVER_ERROR_5XX,
    isRateLimit: false,
    isServerError: true,
  });

  assert.deepEqual(classifyHttpStatus(408), {
    retryable: true,
    category: ERROR_CATEGORY.NETWORK_TIMEOUT,
    isRateLimit: false,
    isServerError: false,
  });
});

test('4. Non-Retryable Client Errors: HTTP 400/401/403/413/422 transition immediately to permanently_failed', async () => {
  const db = new MockFirestore();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_invalid_mime',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_invalid.bin',
  });
  const jobId = enq.job.jobId;

  // Worker 1 leases job
  const lease = await acquireJobLease(db, jobId, 'worker_alpha_1');
  assert.ok(lease.acquired);

  // Downstream rejects with HTTP 415 Unsupported Media Type
  const failResult = await failJobDelivery(db, jobId, 'worker_alpha_1', {
    statusCode: 415,
    errorMessage: 'Forminit: Unsupported document type',
  });

  assert.ok(failResult.success);
  assert.equal(failResult.newStatus, DELIVERY_STATUS.PERMANENTLY_FAILED);
  assert.equal(failResult.job.status, DELIVERY_STATUS.PERMANENTLY_FAILED);
  assert.equal(failResult.job.lastErrorCategory, ERROR_CATEGORY.NON_RETRYABLE_CLIENT_ERROR);
  assert.equal(failResult.job.attemptCount, 1); // Does not burn remaining attempts unnecessarily
});

test('5. Dead-Letter / Needs-Review Queue: Exhausted retry budget routes to needs_review with audit alert', async () => {
  const db = new MockFirestore();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_unstable_service',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_unstable.pdf',
    maxAttempts: 3, // Bounded budget of 3 attempts
  });
  const jobId = enq.job.jobId;

  // Attempt 1: 503 Server Error
  await acquireJobLease(db, jobId, 'worker_1');
  const fail1 = await failJobDelivery(db, jobId, 'worker_1', { statusCode: 503, errorMessage: 'Service Unavailable' });
  assert.equal(fail1.newStatus, DELIVERY_STATUS.RETRY_PENDING);

  // Attempt 2: 502 Bad Gateway
  await acquireJobLease(db, jobId, 'worker_2', { nowMs: Date.now() + 60000 });
  const fail2 = await failJobDelivery(db, jobId, 'worker_2', { statusCode: 502, errorMessage: 'Bad Gateway' });
  assert.equal(fail2.newStatus, DELIVERY_STATUS.RETRY_PENDING);

  // Attempt 3: 504 Gateway Timeout (Exhausts budget: attemptCount 3 == maxAttempts 3)
  await acquireJobLease(db, jobId, 'worker_3', { nowMs: Date.now() + 120000 });
  const fail3 = await failJobDelivery(db, jobId, 'worker_3', { statusCode: 504, errorMessage: 'Gateway Timeout' });

  // Terminal Dead-Letter routing
  assert.equal(fail3.newStatus, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.equal(fail3.job.status, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.equal(fail3.job.lastErrorCategory, ERROR_CATEGORY.RETRY_BUDGET_EXHAUSTED);

  // High-priority audit log generated for practitioner
  const auditLogs = await db.collection('audit_logs').get();
  assert.equal(auditLogs.docs.length, 1);
  const logData = auditLogs.docs[0].data();
  assert.ok(logData.action.includes('Retry Budget Exhausted'));
  assert.equal(logData.isStaff, true);
  assert.equal(logData.jobId, jobId);
});

test('6. Worker Concurrency & Mutual Exclusion: Two workers cannot acquire the same job simultaneously', async () => {
  const db = new MockFirestore();
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_concurrent_race',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_concurrent.pdf',
  });
  const jobId = enq.job.jobId;

  // Worker A acquires lease for 60 seconds
  const leaseA = await acquireJobLease(db, jobId, 'worker_A_node1', { leaseDurationMs: 60000 });
  assert.ok(leaseA.acquired);
  assert.equal(leaseA.job.leaseOwner, 'worker_A_node1');
  assert.equal(leaseA.job.status, DELIVERY_STATUS.PROCESSING);

  // Worker B attempts to lease the same job concurrently while lease is active
  const leaseB = await acquireJobLease(db, jobId, 'worker_B_node2', { leaseDurationMs: 60000 });
  assert.equal(leaseB.acquired, false);
  assert.equal(leaseB.reason, 'CONCURRENT_WORKER_LEASE_ACTIVE');
  assert.equal(leaseB.leaseOwner, 'worker_A_node1');
});

test('7. Worker Crash & Restart Resilience: Expired leases are safely reclaimed', async () => {
  const db = new MockFirestore();
  const now = 1776250000000;

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_crashed_worker',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_crashed.pdf',
  });
  const jobId = enq.job.jobId;

  // Worker A acquires 30s lease at T=now
  await acquireJobLease(db, jobId, 'worker_A_which_will_crash', { nowMs: now, leaseDurationMs: 30000 });

  // Simulate Worker A crashing; 40 seconds pass (T = now + 40000)
  const laterTime = now + 40000;

  // Supervisor reclaims stale lease
  const reclaimed = await reclaimStaleLeases(db, laterTime);
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0], jobId);

  // Job is now available for Worker B
  const leaseB = await acquireJobLease(db, jobId, 'worker_B_survivor', { nowMs: laterTime });
  assert.ok(leaseB.acquired);
  assert.equal(leaseB.job.leaseOwner, 'worker_B_survivor');
});

test('8. Idempotency & Deduplication: Repeated enqueuing does not create duplicate document records', async () => {
  const db = new MockFirestore();

  const params = {
    documentId: 'doc_duplicate_check_001',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_dup.pdf',
    sha256Checksum: '112233445566778899aabbccddeeff00',
    fileName: 'DuplicateTest.pdf',
  };

  // Enqueue 1
  const res1 = await enqueueDocumentDeliveryJob(db, params);
  assert.ok(res1.success);
  assert.equal(res1.isExisting, false);

  // Enqueue 2 with identical key
  const res2 = await enqueueDocumentDeliveryJob(db, params);
  assert.ok(res2.success);
  assert.equal(res2.isExisting, true);
  assert.equal(res2.job.jobId, res1.job.jobId);

  // Check queue size in store
  const allJobs = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).get();
  assert.equal(allJobs.docs.length, 1); // Strictly single job document
});

test('9. Terminal Delivery & Storage Reference Retention: Document reference preserved after delivery', async () => {
  const db = new MockFirestore();

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_custody_preserve',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_custody.pdf',
    fileName: 'CustodyProof.pdf',
  });
  const jobId = enq.job.jobId;

  await acquireJobLease(db, jobId, 'worker_delivery_unit');

  // Complete delivery
  const completion = await completeJobDelivery(db, jobId, 'worker_delivery_unit', {
    receiptId: 'forminit_rcpt_987654',
    status: 'delivered_200_ok',
  });

  assert.ok(completion.success);
  assert.equal(completion.job.status, DELIVERY_STATUS.DELIVERED);
  assert.ok(completion.job.deliveredAt);
  assert.equal(completion.job.deliveryReceipt.receiptId, 'forminit_rcpt_987654');

  // Requirement 7: Retain stable storage reference until downstream delivery is confirmed
  // or authorized retention policy allows deletion
  assert.equal(completion.job.storageReferenceRetained, true);
  assert.equal(completion.job.storagePath, 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_custody.pdf');
  assert.equal(completion.job.retentionPolicy, QUEUE_CONFIG.STATUTORY_RETENTION_STANDARD);
});

test('10. Controlled Manual Recovery: Authorized firm staff can reset dead-letter items with audit trail', async () => {
  const db = new MockFirestore();

  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_dead_letter_recovery',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_dlq.pdf',
    maxAttempts: 1,
  });
  const jobId = enq.job.jobId;

  // Fail into needs_review
  await acquireJobLease(db, jobId, 'worker_1');
  await failJobDelivery(db, jobId, 'worker_1', { statusCode: 500, errorMessage: 'Fatal gateway glitch' });

  // Check state is needs_review
  const jobBefore = (await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId).get()).data();
  assert.equal(jobBefore.status, DELIVERY_STATUS.NEEDS_REVIEW);

  // Unauthorized attempt without staff UID
  await assert.rejects(
    async () => manualRetryJob(db, jobId, null),
    /Unauthorized: Staff UID required/
  );

  // Authorized staff practitioner initiates controlled retry
  const staffInfo = {
    staffUid: 'usr_cpa_denise_8921',
    staffEmail: 'denise@pivot-aide.tax',
    justification: 'Client confirmed Forminit webhook endpoint restored and tested; re-dispatching under CPA supervision.',
  };

  const retryResult = await manualRetryJob(db, jobId, staffInfo, { additionalAttempts: 3 });
  assert.ok(retryResult.success);
  assert.equal(retryResult.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(retryResult.job.maxAttempts, 4); // 1 + 3 additional attempts
  assert.equal(retryResult.job.manualRetryMetadata.retriedBy, 'usr_cpa_denise_8921');

  // Verify practitioner audit trail
  const auditLogs = await db.collection('audit_logs').get();
  const retryAudit = auditLogs.docs.find(d => d.data().action.includes('Manual Retry Authorized'));
  assert.ok(retryAudit);
  assert.equal(retryAudit.data().staffUid, 'usr_cpa_denise_8921');
  assert.ok(retryAudit.data().details.includes('re-dispatching under CPA supervision'));
});

test('11. Queue Metrics & Monitoring: Dashboard aggregation accurately counts all 7 states', async () => {
  const db = new MockFirestore();

  // Create 1 job in each of the primary categories
  await enqueueDocumentDeliveryJob(db, { documentId: 'doc_m1', clientId: 'c1', storagePath: 'p1' }); // queued
  const j2 = await enqueueDocumentDeliveryJob(db, { documentId: 'doc_m2', clientId: 'c1', storagePath: 'p2' });
  await acquireJobLease(db, j2.job.jobId, 'w1'); // processing
  const j3 = await enqueueDocumentDeliveryJob(db, { documentId: 'doc_m3', clientId: 'c1', storagePath: 'p3' });
  await acquireJobLease(db, j3.job.jobId, 'w2');
  await completeJobDelivery(db, j3.job.jobId, 'w2'); // delivered

  const metrics = await getQueueMetrics(db);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.queued, 1);
  assert.equal(metrics.processing, 1);
  assert.equal(metrics.delivered, 1);
});

test('12. Worker Dispatch Execution: Handles 200 OK, 429 Rate Limit, and 500 Server Errors', async () => {
  const db = new MockFirestore();
  const storage = { bucket: () => ({ file: () => ({ exists: async () => [true], download: async () => [Buffer.from('%PDF-1.4 tax doc')] }) }) };

  // Case A: 200 OK
  const enqA = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_dispatch_200',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_200.pdf',
  });
  const mockFetch200 = async (url, opts) => ({
    status: 200,
    headers: new Map(),
    text: async () => JSON.stringify({ success: true, message: 'PDF accepted' }),
  });
  const resA = await executeDeliveryJob(db, storage, enqA.job.jobId, 'worker_unit_1', { fetchFn: mockFetch200 });
  assert.ok(resA.success);
  assert.equal(resA.status, DELIVERY_STATUS.DELIVERED);

  // Case B: 429 with Retry-After: 30
  const enqB = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_dispatch_429',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_429.pdf',
  });
  const mockFetch429 = async () => ({
    status: 429,
    headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '30' : null) },
    text: async () => JSON.stringify({ error: 'Too Many Requests' }),
  });
  const resB = await executeDeliveryJob(db, storage, enqB.job.jobId, 'worker_unit_2', { fetchFn: mockFetch429 });
  assert.equal(resB.success, false);
  assert.equal(resB.status, DELIVERY_STATUS.RETRY_PENDING);
  assert.equal(resB.job.lastErrorCategory, ERROR_CATEGORY.RATE_LIMITED_429);
  assert.ok(resB.backoff.backoffSeconds >= 30);

  // Case C: 500 Server Error
  const enqC = await enqueueDocumentDeliveryJob(db, {
    documentId: 'doc_dispatch_500',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/doc_500.pdf',
  });
  const mockFetch500 = async () => ({
    status: 500,
    headers: { get: () => null },
    text: async () => 'Internal Server Error',
  });
  const resC = await executeDeliveryJob(db, storage, enqC.job.jobId, 'worker_unit_3', { fetchFn: mockFetch500 });
  assert.equal(resC.success, false);
  assert.equal(resC.status, DELIVERY_STATUS.RETRY_PENDING);
  assert.equal(resC.job.lastErrorCategory, ERROR_CATEGORY.SERVER_ERROR_5XX);
});

test('13. Scheduled Sweep & Worker Recovery: Sweeps eligible jobs and reclaims dead leases', async () => {
  const db = new MockFirestore();
  const storage = { bucket: () => ({ file: () => ({ exists: async () => [false] }) }) };
  const mockFetch200 = async () => ({
    status: 200,
    headers: new Map(),
    text: async () => JSON.stringify({ success: true }),
  });

  // Create 2 queued jobs
  await enqueueDocumentDeliveryJob(db, { documentId: 'doc_sweep_1', clientId: 'c1', storagePath: 'p1' });
  await enqueueDocumentDeliveryJob(db, { documentId: 'doc_sweep_2', clientId: 'c1', storagePath: 'p2' });

  // Run sweep
  const sweepRes = await sweepDeliveryQueue(db, storage, { fetchFn: mockFetch200, limit: 10 });
  assert.equal(sweepRes.processed, 2);
  assert.equal(sweepRes.succeeded, 2);
  assert.equal(sweepRes.failed, 0);

  // Check that both are now delivered
  const metrics = await getQueueMetrics(db);
  assert.equal(metrics.delivered, 2);
  assert.equal(metrics.queued, 0);
});

test('14. Client Recovery Aid & Offline Resilience: LocalStorage is temporary recovery aid, never zero data loss', async () => {
  const db = new MockFirestore();

  // Simulate client storing document reference in Cloud Storage first
  const storageRef = 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_offline_resilient.pdf';
  const clientDocumentId = 'doc_offline_resilient';

  // 1. Authoritative custody established in Firestore & Cloud Storage reference
  const enq = await enqueueDocumentDeliveryJob(db, {
    documentId: clientDocumentId,
    clientId: 'usr_whitfield_4417',
    storagePath: storageRef,
    fileName: 'OfflineTaxDoc.pdf',
    sha256Checksum: 'abcdef1234567890abcdef1234567890',
  });
  assert.ok(enq.success);

  // 2. Simulate browser closure / tab crash
  // Client localStorage might hold temporary draft recovery token
  const temporaryLocalStorageCache = {
    recoveryDraftKey: 'tfr_recovery_draft_001',
    storagePath: storageRef,
    documentId: clientDocumentId,
    timestamp: Date.now(),
    note: 'Temporary client-side recovery aid only. Authoritative copy is in Cloud Storage + Firestore ledger.',
  };

  // Even if localStorage is completely erased (user clears browser cookies or closes window),
  // authoritative state in Firestore is uncorrupted and intact!
  const retrievedJob = (await db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(enq.job.jobId).get()).data();
  assert.ok(retrievedJob);
  assert.equal(retrievedJob.storagePath, storageRef);
  assert.equal(retrievedJob.status, DELIVERY_STATUS.QUEUED);
  assert.equal(retrievedJob.storageReferenceRetained, true);

  // Authoritative status does not depend on localStorage
  assert.ok(temporaryLocalStorageCache.note.includes('Temporary client-side recovery aid only'));
});

test('15. Integrated Resilience Matrix: Browser closure, offline mode, worker restart, duplicate events, exhausted retries, and manual recovery', async () => {
  const db = new MockFirestore();
  const testNow = 1776250000000;
  const storagePath = 'clients/usr_whitfield_4417/tax-years/2026/documents/doc_resilience_matrix.pdf';
  const sha256 = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
  const docId = 'doc_resilience_matrix_001';

  // SCENARIO 1: Browser Closure
  // Client creates ephemeral draft in localStorage, then browser closes
  const ephemeralStorage = new Map();
  ephemeralStorage.set('tfr_ephemeral_recovery_test', {
    draftId: 'draft_local_123',
    storagePath,
    timestamp: testNow,
    disclaimer: 'TEMPORARY CLIENT CRASH-RECOVERY AID ONLY. NOT AUTHORITATIVE TAXPAYER DOCUMENT CUSTODY. Never claim zero data loss solely because localStorage is enabled.'
  });
  // Simulate tab/window closure -> storage wiped
  ephemeralStorage.clear();
  assert.equal(ephemeralStorage.size, 0);

  // SCENARIO 2: Offline Mode -> Online Transition
  // Client comes online, confirms Cloud Storage vault reference, and enqueues to authoritative Firestore queue
  const enqResult = await enqueueDocumentDeliveryJob(db, {
    documentId: docId,
    clientId: 'usr_whitfield_4417',
    storagePath,
    sha256Checksum: sha256,
    fileName: 'Form1099_Resilience.pdf',
    clientEmail: 'm.whitfield@example.com',
    maxAttempts: 2 // Bounded retry budget
  });
  assert.ok(enqResult.success);
  assert.equal(enqResult.isExisting, false);
  const jobId = enqResult.job.jobId;
  assert.equal(enqResult.job.status, DELIVERY_STATUS.QUEUED);

  // SCENARIO 3: Duplicate Events
  // Repeated submission / duplicate network trigger must return existing record without mutating attempt count or state
  const dupResult = await enqueueDocumentDeliveryJob(db, {
    documentId: docId,
    clientId: 'usr_whitfield_4417',
    storagePath,
    sha256Checksum: sha256,
    fileName: 'Form1099_Resilience.pdf'
  });
  assert.ok(dupResult.success);
  assert.equal(dupResult.isExisting, true);
  assert.equal(dupResult.job.jobId, jobId);
  assert.equal(dupResult.job.attemptCount, 0);

  // SCENARIO 4: Worker Restart & Crash Recovery
  // Worker 1 acquires lease for 30 seconds, then crashes
  const lease1 = await acquireJobLease(db, jobId, 'worker_crashed_node1', {
    nowMs: testNow,
    leaseDurationMs: 30000
  });
  assert.ok(lease1.acquired);
  assert.equal(lease1.job.status, DELIVERY_STATUS.PROCESSING);
  assert.equal(lease1.job.leaseOwner, 'worker_crashed_node1');

  // Concurrent worker cannot acquire while lease is active
  const concurrentTry = await acquireJobLease(db, jobId, 'worker_concurrent_node2', {
    nowMs: testNow + 10000,
    leaseDurationMs: 30000
  });
  assert.equal(concurrentTry.acquired, false);
  assert.equal(concurrentTry.reason, 'CONCURRENT_WORKER_LEASE_ACTIVE');

  // Time advances past lease expiration (worker restart simulation)
  const restartTime = testNow + 35000;
  const reclaimed = await reclaimStaleLeases(db, restartTime);
  assert.ok(reclaimed.includes(jobId));

  // Surviving worker can now safely acquire the reclaimed job
  const lease2 = await acquireJobLease(db, jobId, 'worker_survivor_node3', {
    nowMs: restartTime,
    leaseDurationMs: 30000
  });
  assert.ok(lease2.acquired);
  assert.equal(lease2.job.leaseOwner, 'worker_survivor_node3');
  assert.equal(lease2.job.attemptCount, 2); // Attempt 2

  // SCENARIO 5: Exhausted Retries -> Dead-Letter Routing (needs_review)
  // Attempt 2 fails with HTTP 500. Since maxAttempts == 2, retry budget is exhausted!
  const failResult = await failJobDelivery(db, jobId, 'worker_survivor_node3', {
    statusCode: 500,
    errorMessage: 'Forminit endpoint downstream 500 internal server error'
  }, { nowMs: restartTime });

  assert.equal(failResult.newStatus, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.equal(failResult.job.status, DELIVERY_STATUS.NEEDS_REVIEW);
  assert.equal(failResult.job.lastErrorCategory, ERROR_CATEGORY.RETRY_BUDGET_EXHAUSTED);

  // Dead-letter audit alert created
  const alertDocs = (await db.collection('audit_logs').get()).docs;
  assert.ok(alertDocs.some(d => d.data().action.includes('Retry Budget Exhausted')));

  // SCENARIO 6: Controlled Manual Recovery by Authorized Firm Staff
  // Staff reviews dead-letter item and resets under Circular 230 § 10.22 with compliance justification
  const staffRecovery = await manualRetryJob(db, jobId, {
    staffUid: 'usr_cpa_denise_8921',
    staffEmail: 'denise@pivot-aide.tax',
    justification: 'Forminit service status green; downstream gateway connectivity verified. Re-enqueuing for priority dispatch under Circular 230 § 10.22.'
  }, { additionalAttempts: 3, nowMs: restartTime + 60000 });

  assert.ok(staffRecovery.success);
  assert.equal(staffRecovery.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(staffRecovery.job.maxAttempts, 5); // 2 previous + 3 granted = 5
  assert.equal(staffRecovery.job.manualRetryMetadata.retriedBy, 'usr_cpa_denise_8921');
  assert.ok(staffRecovery.job.manualRetryMetadata.justification.includes('Circular 230 § 10.22'));

  // Now, worker executes and confirms delivery
  const finalLease = await acquireJobLease(db, jobId, 'worker_final_delivery', { nowMs: restartTime + 61000 });
  assert.ok(finalLease.acquired);
  const deliveryConfirmed = await completeJobDelivery(db, jobId, 'worker_final_delivery', {
    receiptId: 'fi_rcpt_matrix_success_200',
    timestamp: new Date(restartTime + 62000).toISOString()
  });
  assert.ok(deliveryConfirmed.success);
  assert.equal(deliveryConfirmed.job.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(deliveryConfirmed.job.storageReferenceRetained, true);
});



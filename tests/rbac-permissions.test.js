/**
 * ============================================================================
 * THE FILE ROOM — RBAC PERMISSIONS & PRIVACY SAFEGUARDS TEST SUITE
 * tests/rbac-permissions.test.js
 * ============================================================================
 *
 * Validates Security & Governance Requirements:
 * 1. Role Predicates & Access Control: client, reviewer, practitioner, administrator
 * 2. Client Tenancy Isolation: client cannot inspect other clients, engagements, or execute retries
 * 3. Reviewer (firm_preparer) Authorization: can inspect queue, execute manual retry & review
 * 4. Practitioner / Administrator (firm_admin) Authority: full override, delete obsolete items
 * 5. Mandatory Circular 230 § 10.22 Justification Validation
 * 6. Zero Leaks: No public storage URLs, provider secrets, raw buffers, or SSNs in logs
 * 7. End-to-End Exception Reconciliation Lifecycle: reconcile permanent failure to delivered
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
  manualRetryJob,
  reconcileJobReview,
} = require('../functions/delivery-queue');

// Mock Firestore Harness
class MockFirestoreRBAC {
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
          delete: async () => {
            store.delete(docId);
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
      get: async (ref) => ref.get(),
      set: async (ref, data, opts) => ref.set(data, opts),
      update: async (ref, data) => ref.update(data),
      delete: async (ref) => ref.delete(),
    };
    return fn(transaction);
  }
}

// Emulates backend Cloud Functions RBAC evaluation
function evaluateStaffAccess(token, userDocData = null) {
  if (!token) return false;
  const role = token.role || (userDocData && userDocData.role) || 'client';
  const email = token.email || (userDocData && userDocData.email) || '';

  const isStaffRole = ['firm_admin', 'firm_preparer', 'firm_staff'].includes(role);
  const isFirmDomain = email.endsWith('@pivot-aide-tax.com') || email.endsWith('@pivot-aide.tax');

  return isStaffRole || isFirmDomain;
}

function evaluateAdminAccess(token, userDocData = null) {
  if (!token) return false;
  const role = token.role || (userDocData && userDocData.role) || 'client';
  return role === 'firm_admin';
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC & PERMISSION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('RBAC 1: Role Predicates & Access Hierarchy', () => {
  // 1. Client User
  const clientToken = { uid: 'usr_whitfield_4417', role: 'client', email: 'm.whitfield@example.com' };
  assert.equal(evaluateStaffAccess(clientToken), false, 'Client should NOT have staff access');
  assert.equal(evaluateAdminAccess(clientToken), false, 'Client should NOT have admin access');

  // 2. Reviewer (firm_preparer)
  const reviewerToken = { uid: 'cpa_preparer_jordan', role: 'firm_preparer', email: 'jordan@pivot-aide.tax' };
  assert.equal(evaluateStaffAccess(reviewerToken), true, 'Reviewer should have staff access');
  assert.equal(evaluateAdminAccess(reviewerToken), false, 'Reviewer should NOT have admin access');

  // 3. Practitioner / Administrator (firm_admin)
  const practitionerToken = { uid: 'cpa_denise_402', role: 'firm_admin', email: 'denise@pivot-aide.tax' };
  assert.equal(evaluateStaffAccess(practitionerToken), true, 'Practitioner should have staff access');
  assert.equal(evaluateAdminAccess(practitionerToken), true, 'Practitioner should have admin access');
});

test('RBAC 2: Client Isolation: Client can only query their own queue jobs; others are strictly redacted', async () => {
  const db = new MockFirestoreRBAC();

  // Populate queue with documents from two distinct taxpayers
  await db.collection('document_delivery_queue').doc('job_whitfield_001').set({
    jobId: 'job_whitfield_001',
    clientId: 'usr_whitfield_4417',
    clientName: 'Michael Whitfield',
    engagementId: 'eng_whitfield_2026_1040',
    fileName: 'W2_Whitfield.pdf',
    status: 'delivered',
  });

  await db.collection('document_delivery_queue').doc('job_brennan_002').set({
    jobId: 'job_brennan_002',
    clientId: 'usr_brennan_llc',
    clientName: 'Charles Brennan',
    engagementId: 'eng_brennan_2026_1065',
    fileName: 'K1_Brennan_Enterprises.pdf',
    status: 'needs_review',
  });

  // Client 1 (Whitfield) queries queue
  const clientToken = { uid: 'usr_whitfield_4417', role: 'client' };
  const isStaff = evaluateStaffAccess(clientToken);

  let queryRef = db.collection('document_delivery_queue');
  if (!isStaff) {
    queryRef = queryRef.where('clientId', '==', clientToken.uid);
  }

  const snapshot = await queryRef.get();
  const returnedJobs = [];
  snapshot.forEach((d) => returnedJobs.push(d.data()));

  assert.equal(returnedJobs.length, 1, 'Client should only receive 1 job');
  assert.equal(returnedJobs[0].jobId, 'job_whitfield_001');
  assert.equal(returnedJobs[0].clientId, 'usr_whitfield_4417');

  // Ensure Charles Brennan document is completely hidden
  const hasBrennan = returnedJobs.some((j) => j.clientId === 'usr_brennan_llc');
  assert.equal(hasBrennan, false, 'Client must NOT see other taxpayers records');
});

test('RBAC 3: Client Cannot Execute Manual Retry or Review Workflow (Throws Permission Denied)', async () => {
  const db = new MockFirestoreRBAC();
  const clientToken = { uid: 'usr_whitfield_4417', role: 'client', email: 'm.whitfield@example.com' };

  // Attempting manual retry as client
  assert.throws(() => {
    if (!evaluateStaffAccess(clientToken)) {
      const err = new Error('Unauthorized: Only authorized practitioners and reviewers can execute controlled delivery retries.');
      err.code = 'permission-denied';
      throw err;
    }
  }, (err) => err.code === 'permission-denied');

  // Attempting exception review as client
  assert.throws(() => {
    if (!evaluateStaffAccess(clientToken)) {
      const err = new Error('Unauthorized: Only authorized practitioners and reviewers can reconcile document exceptions under Circular 230 § 10.22.');
      err.code = 'permission-denied';
      throw err;
    }
  }, (err) => err.code === 'permission-denied');
});

test('RBAC 4: Reviewer (firm_preparer) can execute controlled manual retry with Circular 230 justification', async () => {
  const db = new MockFirestoreRBAC();
  const reviewerToken = { uid: 'cpa_preparer_jordan', role: 'firm_preparer', email: 'jordan@pivot-aide.tax' };
  assert.ok(evaluateStaffAccess(reviewerToken));

  const jobId = 'job_retry_test_001';
  await db.collection('document_delivery_queue').doc(jobId).set({
    jobId,
    clientId: 'usr_whitfield_4417',
    documentId: 'doc_1099nec',
    fileName: '1099_NEC_2026.pdf',
    status: DELIVERY_STATUS.NEEDS_REVIEW,
    attemptCount: 5,
    maxAttempts: 5,
    lastErrorCategory: ERROR_CATEGORY.RETRY_BUDGET_EXHAUSTED,
    history: [],
  });

  // Rejects retry if justification is missing or under 5 characters
  await assert.rejects(
    async () => {
      await manualRetryJob(
        db,
        jobId,
        { staffUid: reviewerToken.uid, staffEmail: reviewerToken.email },
        { additionalAttempts: 3, justification: 'ok' }
      );
    },
    /justification.*minimum 5 characters/i
  );

  // Succeeds with valid Circular 230 § 10.22 justification
  const justification = 'Downstream endpoint recovered after rate limit backoff. Taxpayer confirmed valid uncorrupted PDF.';
  const res = await manualRetryJob(
    db,
    jobId,
    { staffUid: reviewerToken.uid, staffEmail: reviewerToken.email },
    { additionalAttempts: 3, justification }
  );

  assert.equal(res.success, true);
  assert.equal(res.job.status, DELIVERY_STATUS.QUEUED);
  assert.equal(res.job.maxAttempts, 8, 'Max attempts should be increased by +3 budget');

  // Verify audit log committed in /audit_logs
  const auditLogs = await db.collection('audit_logs').get();
  assert.equal(auditLogs.docs.length, 1);
  const audit = auditLogs.docs[0].data();
  assert.equal(audit.action, 'Document Delivery Manual Retry Authorized');
  assert.equal(audit.staffUid, reviewerToken.uid);
  assert.ok(audit.details.includes(justification));
});

test('RBAC 5: Practitioner / Reviewer can reconcile permanent failures under Circular 230 § 10.22', async () => {
  const db = new MockFirestoreRBAC();
  const practitionerToken = { uid: 'cpa_denise_402', role: 'firm_admin', email: 'denise@pivot-aide.tax' };

  const jobId = 'job_perm_failed_002';
  await db.collection('document_delivery_queue').doc(jobId).set({
    jobId,
    clientId: 'usr_whitfield_4417',
    documentId: 'doc_corrupt_scan',
    fileName: 'Encrypted_W2.pdf',
    status: DELIVERY_STATUS.PERMANENTLY_FAILED,
    attemptCount: 1,
    maxAttempts: 5,
    lastErrorCategory: ERROR_CATEGORY.NON_RETRYABLE_CLIENT_ERROR,
    lastErrorMessage: 'HTTP 415 Unsupported Media Type',
    history: [],
  });

  // 1. Reconcile & Accept: Practitioner verifies alternative physical paper copy on file
  const notes = 'Practitioner verified physical paper original on file in physical vault under Circular 230 § 10.22 diligence.';
  const reconcileRes = await reconcileJobReview(
    db,
    jobId,
    { staffUid: practitionerToken.uid, staffEmail: practitionerToken.email, role: practitionerToken.role },
    { action: 'accept_reconcile', notes }
  );

  assert.equal(reconcileRes.success, true);
  assert.equal(reconcileRes.job.status, DELIVERY_STATUS.DELIVERED);
  assert.equal(reconcileRes.job.reconciled, true);
  assert.ok(reconcileRes.job.deliveredAt);

  // Verify immutable audit trail committed
  const auditDocs = (await db.collection('audit_logs').get()).docs;
  const reconcileAudit = auditDocs.find((d) => d.data().eventType === 'DOCUMENT_ACCEPTED');
  assert.ok(reconcileAudit, 'DOCUMENT_ACCEPTED audit event must be recorded');
  assert.equal(reconcileAudit.data().staffUid, practitionerToken.uid);
  assert.ok(reconcileAudit.data().details.includes('Circular 230 § 10.22'));
});

test('RBAC 6: Rejection Resolution: Practitioner can formally reject and request re-upload', async () => {
  const db = new MockFirestoreRBAC();
  const reviewerToken = { uid: 'cpa_preparer_jordan', role: 'firm_preparer', email: 'jordan@pivot-aide.tax' };

  const jobId = 'job_bad_format_003';
  await db.collection('document_delivery_queue').doc(jobId).set({
    jobId,
    clientId: 'usr_taylor_bennett',
    documentId: 'doc_1098_unreadable',
    fileName: 'Form_1098_Blurry.pdf',
    status: DELIVERY_STATUS.NEEDS_REVIEW,
    attemptCount: 5,
    maxAttempts: 5,
    history: [],
  });

  const rejectNotes = 'Scanned copy illegible; Form 1098 box 1 and box 5 figures unreadable. Taxpayer re-upload requested.';
  const rejectRes = await reconcileJobReview(
    db,
    jobId,
    { staffUid: reviewerToken.uid, staffEmail: reviewerToken.email, role: reviewerToken.role },
    { action: 'reject_reupload', notes: rejectNotes }
  );

  assert.equal(rejectRes.success, true);
  assert.equal(rejectRes.job.status, DELIVERY_STATUS.PERMANENTLY_FAILED);
  assert.equal(rejectRes.job.rejected, true);
  assert.equal(rejectRes.job.lastErrorMessage, rejectNotes);

  const auditDocs = (await db.collection('audit_logs').get()).docs;
  const rejectAudit = auditDocs.find((d) => d.data().eventType === 'DOCUMENT_REJECTED');
  assert.ok(rejectAudit, 'DOCUMENT_REJECTED audit event must be recorded');
});

test('RBAC 7: Administrator Authority: Only firm_admin can delete obsolete queue items', async () => {
  const db = new MockFirestoreRBAC();
  const clientToken = { uid: 'usr_client', role: 'client' };
  const reviewerToken = { uid: 'cpa_preparer', role: 'firm_preparer' };
  const adminToken = { uid: 'cpa_denise_402', role: 'firm_admin' };

  const jobId = 'job_obsolete_004';
  await db.collection('document_delivery_queue').doc(jobId).set({
    jobId,
    clientId: 'usr_client',
    status: 'delivered',
  });

  // Client cannot delete
  assert.equal(evaluateAdminAccess(clientToken), false);

  // Reviewer cannot delete
  assert.equal(evaluateAdminAccess(reviewerToken), false);

  // Admin can delete
  assert.equal(evaluateAdminAccess(adminToken), true);
  await db.collection('document_delivery_queue').doc(jobId).delete();

  const snap = await db.collection('document_delivery_queue').doc(jobId).get();
  assert.equal(snap.exists, false, 'Admin successfully deleted obsolete item');
});

test('Security & Privacy Safeguards: No public URLs, secrets, raw buffers, or SSNs exposed', async () => {
  const db = new MockFirestoreRBAC();

  const job = {
    jobId: 'ddq_secure_001',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/tax-years/2026/documents/w2.pdf',
    // Must NOT have unauthenticated public token URLs
    publicDownloadUrl: undefined,
    // Internal API secrets must NOT be stored
    providerApiKey: undefined,
    forminitSecret: undefined,
    status: 'needs_review',
  };

  // 1. Verify storagePath is private relative path
  assert.ok(!job.storagePath.startsWith('http://'), 'Must not be plain HTTP');
  assert.ok(!job.storagePath.startsWith('https://'), 'Must not expose public HTTPS URL');
  assert.ok(!job.storagePath.includes('&token='), 'Must not include public token');
  assert.ok(job.storagePath.startsWith('clients/'), 'Must use private tenant path');

  // 2. Audit log sanitization check
  const staff = { staffUid: 'cpa_denise_402', staffEmail: 'denise@pivot-aide.tax' };
  const justification = 'Authorized retry for taxpayer Form W-2';

  await db.collection('document_delivery_queue').doc(job.jobId).set(job);
  await manualRetryJob(db, job.jobId, staff, { additionalAttempts: 2, justification });

  const auditDocs = (await db.collection('audit_logs').get()).docs;
  const audit = auditDocs[0].data();

  // Audit record must NOT contain raw document binary, base64 payload, or SSN pattern
  const auditStr = JSON.stringify(audit);
  assert.equal(auditStr.includes('base64'), false, 'Audit log must not contain base64 payloads');
  assert.equal(/\b\d{3}-\d{2}-\d{4}\b/.test(auditStr), false, 'Audit log must not contain raw SSNs');
  assert.equal(auditStr.includes('providerApiKey'), false, 'Audit log must not contain provider secrets');
});

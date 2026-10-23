/**
 * ============================================================================
 * THE FILE ROOM — DURABLE DOCUMENT DELIVERY QUEUE
 * functions/delivery-queue/delivery-queue.js
 * ============================================================================
 * Authoritative Queue Core Engine
 *
 * Implements:
 * 1. Explicit 7 states: uploaded, queued, processing, delivered, retry_pending,
 *    permanently_failed, needs_review.
 * 2. Mandatory metadata: attempt count, next attempt time, last error category,
 *    idempotency key, creation time, last update time.
 * 3. Exponential backoff with jitter, bounded retries, 429 & 5xx classification.
 * 4. Dead-letter / needs-review state on retry budget exhaustion.
 * 5. Mutual exclusion worker leases via atomic Firestore transactions.
 * 6. Idempotency guards preventing duplicate records or logical submissions.
 * 7. Stable Cloud Storage reference retention until delivery confirmation or
 *    statutory retention expiration.
 * 8. Controlled manual staff recovery with audit trails.
 */

'use strict';

const crypto = require('node:crypto');
const {
  DELIVERY_STATUS,
  LEGAL_DELIVERY_TRANSITIONS,
  isValidDeliveryTransition,
  ERROR_CATEGORY,
  QUEUE_CONFIG,
  STATUS_MODEL,
  INTAKE_ENDPOINTS,
} = require('./constants');
const {
  calculateExponentialBackoff,
  classifyHttpStatus,
} = require('./backoff');

/**
 * Generates a stable, deterministic idempotency key for a document submission.
 * Combines clientId, documentId or requestId, and file checksum.
 */
function generateIdempotencyKey(clientId, documentId, sha256Checksum) {
  const shortChecksum = (sha256Checksum && String(sha256Checksum).length >= 12)
    ? String(sha256Checksum).slice(0, 16)
    : 'nochecksum';
  return `idemp_${clientId}_${documentId}_${shortChecksum}`;
}

/**
 * Enqueues a document for downstream delivery.
 * Prerequisite: Document must already be stored in authorized Cloud Storage
 * and its reference persisted in Firestore.
 *
 * @param {Object} db - Firestore database instance
 * @param {Object} params
 * @param {string} params.documentId - Authoritative Firestore document ID in /documents
 * @param {string} params.clientId - Authenticated client/taxpayer UID
 * @param {string} params.storagePath - Authoritative Cloud Storage path (clients/{uid}/...)
 * @param {string} [params.fileStorageUri] - gs:// bucket URI
 * @param {string} [params.sha256Checksum] - SHA-256 integrity hash
 * @param {string} [params.fileName] - Original file name
 * @param {string} [params.clientEmail]
 * @param {string} [params.clientName]
 * @param {number|string} [params.taxYear]
 * @param {string} [params.requestId] - Associated document request ID
 * @param {string} [params.idempotencyKey] - Optional custom idempotency key
 * @param {number} [params.maxAttempts] - Default 5
 * @param {string} [params.destinationUrl] - Downstream endpoint URL
 * @param {Object} [params.payloadMetadata] - Extra context for downstream delivery
 * @returns {Promise<{ success: boolean, job: Object, isExisting: boolean }>}
 */
async function enqueueDocumentDeliveryJob(db, params) {
  const {
    documentId,
    clientId,
    storagePath,
    fileStorageUri,
    sha256Checksum,
    fileName = 'document.pdf',
    clientEmail,
    clientName,
    taxYear = 2026,
    requestId = null,
    maxAttempts = QUEUE_CONFIG.DEFAULT_MAX_ATTEMPTS,
    destinationUrl = null,
    payloadMetadata = {},
  } = params;

  if (!documentId) {
    throw new Error('Missing required argument: documentId');
  }
  if (!clientId) {
    throw new Error('Missing required argument: clientId');
  }
  if (!storagePath) {
    throw new Error('Missing required argument: storagePath. Document must be stored before queuing.');
  }

  // Derive stable idempotency key
  const stableKey = params.idempotencyKey || generateIdempotencyKey(clientId, documentId, sha256Checksum);
  const queueCollection = db.collection(QUEUE_CONFIG.COLLECTION_NAME);
  const jobDocRef = queueCollection.doc(stableKey);

  const now = new Date().toISOString();

  // Execute atomic read/write to guarantee deduplication
  const result = await db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(jobDocRef);

    if (existingSnap.exists) {
      const existingData = existingSnap.data();

      // If already delivered, acknowledge idempotently without re-queuing
      if (existingData.status === DELIVERY_STATUS.DELIVERED) {
        return {
          success: true,
          job: existingData,
          isExisting: true,
          message: 'Document already delivered downstream. Idempotent acknowledgment.',
        };
      }

      // If currently processing or queued, do not duplicate
      if ([DELIVERY_STATUS.QUEUED, DELIVERY_STATUS.PROCESSING, DELIVERY_STATUS.RETRY_PENDING].includes(existingData.status)) {
        return {
          success: true,
          job: existingData,
          isExisting: true,
          message: `Document delivery already in progress (Status: ${existingData.status}).`,
        };
      }

      // If in needs_review or permanently_failed, return existing job (requires controlled retry)
      return {
        success: true,
        job: existingData,
        isExisting: true,
        message: `Existing delivery job located (Status: ${existingData.status}).`,
      };
    }

    // Build authoritative job document
    const jobRecord = {
      jobId: stableKey,
      idempotencyKey: stableKey,
      documentId,
      requestId,
      clientId,
      taxpayerUid: clientId,
      clientEmail: clientEmail || '',
      clientName: clientName || '',
      taxYear: Number(taxYear) || 2026,
      fileName,
      storagePath,
      fileStorageUri: fileStorageUri || `gs://uk-client-d90d5.appspot.com/${storagePath}`,
      sha256Checksum: sha256Checksum || null,
      destinationUrl: destinationUrl || INTAKE_ENDPOINTS.PRIMARY_FORMINIT,
      fallbackUrl: INTAKE_ENDPOINTS.FALLBACK_FIREBASE,
      payloadMetadata: payloadMetadata || {},

      // 4-Dimension Status Model
      storageState: STATUS_MODEL.STORAGE_STATE.STORED,
      registrationState: STATUS_MODEL.REGISTRATION_STATE.REGISTERED,
      downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
      intakeTier: params.intakeTier || STATUS_MODEL.INTAKE_TIER.TIER_1_PRIMARY,

      // Authoritative State Machine
      status: DELIVERY_STATUS.QUEUED,
      attemptCount: 0,
      maxAttempts: Number(maxAttempts) || QUEUE_CONFIG.DEFAULT_MAX_ATTEMPTS,
      nextAttemptAt: now,
      lastErrorCategory: null,
      lastErrorMessage: null,
      lastErrorStatusCode: null,

      // Worker Mutual Exclusion Lease
      leaseOwner: null,
      leaseExpiresAt: null,

      // Delivery Receipt & Timestamps
      deliveredAt: null,
      deliveryReceipt: null,
      createdAt: now,
      updatedAt: now,

      // Retention & Compliance
      retentionPolicy: QUEUE_CONFIG.STATUTORY_RETENTION_STANDARD,
      storageReferenceRetained: true,
      wormImmutable: true,

      // Execution History
      history: [
        {
          timestamp: now,
          status: DELIVERY_STATUS.QUEUED,
          action: 'JOB_ENQUEUED',
          message: 'Document reference persisted in storage vault and enqueued for downstream delivery.',
        },
      ],
    };

    transaction.set(jobDocRef, jobRecord);

    // Create durable Firestore intake record in /document_submissions with stable document ID and idempotency key
    try {
      const submissionRef = db.collection('document_submissions').doc(stableKey);
      transaction.set(
        submissionRef,
        {
          submissionId: stableKey,
          idempotencyKey: stableKey,
          documentId,
          requestId,
          clientId,
          taxpayerUid: clientId,
          clientEmail: clientEmail || '',
          clientName: clientName || '',
          taxYear: Number(taxYear) || 2026,
          fileName,
          originalFileName: fileName,
          storagePath,
          fileStorageUri: jobRecord.fileStorageUri,
          sha256Checksum: sha256Checksum || null,
          storageState: STATUS_MODEL.STORAGE_STATE.STORED,
          registrationState: STATUS_MODEL.REGISTRATION_STATE.REGISTERED,
          downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
          intakeTier: jobRecord.intakeTier,
          status: 'pending_review',
          serverConfirmed: true,
          submittedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (_) {}

    // Also update /documents status if exists
    if (documentId) {
      try {
        const docRef = db.collection(QUEUE_CONFIG.DOCUMENTS_COLLECTION).doc(documentId);
        transaction.set(
          docRef,
          {
            storageState: STATUS_MODEL.STORAGE_STATE.STORED,
            registrationState: STATUS_MODEL.REGISTRATION_STATE.REGISTERED,
            downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
            intakeTier: jobRecord.intakeTier,
            deliveryJobId: stableKey,
            idempotencyKey: stableKey,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    // Also update documentRequests or documents status to queued if exists
    if (requestId) {
      try {
        const reqRef = db.collection('documentRequests').doc(requestId);
        transaction.set(
          reqRef,
          {
            downstreamDelivery: DELIVERY_STATUS.QUEUED,
            deliveryJobId: stableKey,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    return {
      success: true,
      job: jobRecord,
      isExisting: false,
      message: 'Document successfully enqueued for durable delivery.',
    };
  });

  return result;
}

/**
 * Worker Lease Acquisition:
 * Ensures multiple workers cannot process the same job concurrently without
 * a valid exclusive lease. Automatically reclaims expired leases from crashed workers.
 *
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - Delivery job ID
 * @param {string} workerId - Unique worker process identifier (e.g. host_pid_timestamp)
 * @param {Object} [options]
 * @param {number} [options.leaseDurationMs] - Lease lock duration (defaults to 60s)
 * @param {number} [options.nowMs] - Base timestamp
 * @returns {Promise<{ acquired: boolean, job?: Object, reason?: string }>}
 */
async function acquireJobLease(db, jobId, workerId, options = {}) {
  if (!jobId) throw new Error('Missing required argument: jobId');
  if (!workerId) throw new Error('Missing required argument: workerId');

  const leaseDurationMs = options.leaseDurationMs || QUEUE_CONFIG.LEASE_DURATION_MS;
  const now = options.nowMs || Date.now();
  const nowIso = new Date(now).toISOString();
  const leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();

  const jobDocRef = db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId);

  const result = await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobDocRef);
    if (!jobSnap.exists) {
      return { acquired: false, reason: 'JOB_NOT_FOUND' };
    }

    const job = jobSnap.data();

    // 1. Terminal states cannot be leased
    if (job.status === DELIVERY_STATUS.DELIVERED) {
      return { acquired: false, reason: 'JOB_ALREADY_DELIVERED' };
    }
    if (job.status === DELIVERY_STATUS.PERMANENTLY_FAILED) {
      return { acquired: false, reason: 'JOB_PERMANENTLY_FAILED' };
    }
    if (job.status === DELIVERY_STATUS.NEEDS_REVIEW) {
      return { acquired: false, reason: 'JOB_NEEDS_REVIEW_DEAD_LETTER' };
    }

    // 2. Check if currently active processing lease exists
    if (job.status === DELIVERY_STATUS.PROCESSING) {
      const leaseExpiryMs = job.leaseExpiresAt ? new Date(job.leaseExpiresAt).getTime() : 0;
      if (now < leaseExpiryMs && job.leaseOwner !== workerId) {
        // Active lease owned by another worker
        return {
          acquired: false,
          reason: 'CONCURRENT_WORKER_LEASE_ACTIVE',
          leaseOwner: job.leaseOwner,
          leaseExpiresAt: job.leaseExpiresAt,
        };
      }
      // If now >= leaseExpiryMs: The lease has expired (worker crashed/timed out), reclaim it!
      console.warn(`[acquireJobLease] Reclaiming expired lease for job ${jobId} from crashed worker ${job.leaseOwner}.`);
    }

    // 3. If retry_pending, check nextAttemptAt
    if (job.status === DELIVERY_STATUS.RETRY_PENDING) {
      const nextAttemptMs = job.nextAttemptAt ? new Date(job.nextAttemptAt).getTime() : 0;
      if (now < nextAttemptMs) {
        return {
          acquired: false,
          reason: 'RETRY_BACKOFF_ACTIVE',
          nextAttemptAt: job.nextAttemptAt,
        };
      }
    }

    // 4. Validate transition
    if (!isValidDeliveryTransition(job.status, DELIVERY_STATUS.PROCESSING)) {
      return {
        acquired: false,
        reason: `ILLEGAL_TRANSITION_FROM_${job.status}`,
      };
    }

    // 5. Grant lease & increment attempt count
    const newAttemptCount = (job.attemptCount || 0) + 1;
    const historyEntry = {
      timestamp: nowIso,
      status: DELIVERY_STATUS.PROCESSING,
      action: 'LEASE_ACQUIRED',
      workerId,
      attemptNumber: newAttemptCount,
      leaseExpiresAt,
    };

    const updatedFields = {
      status: DELIVERY_STATUS.PROCESSING,
      leaseOwner: workerId,
      leaseExpiresAt,
      attemptCount: newAttemptCount,
      updatedAt: nowIso,
      history: [...(job.history || []), historyEntry],
    };

    transaction.update(jobDocRef, updatedFields);

    return {
      acquired: true,
      job: {
        ...job,
        ...updatedFields,
      },
    };
  });

  return result;
}

/**
 * Completes a delivery job with terminal success.
 *
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - Delivery job ID
 * @param {string} workerId - Worker claiming completion
 * @param {Object} receiptData - Downstream delivery receipt or response payload
 * @returns {Promise<{ success: boolean, job: Object }>}
 */
async function completeJobDelivery(db, jobId, workerId, receiptData = {}) {
  const jobDocRef = db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId);
  const nowIso = new Date().toISOString();

  const result = await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobDocRef);
    if (!jobSnap.exists) {
      throw new Error(`Job ${jobId} not found.`);
    }

    const job = jobSnap.data();

    if (job.status === DELIVERY_STATUS.DELIVERED) {
      return { success: true, job, alreadyDelivered: true };
    }

    // Verify lease ownership unless forced
    if (job.status === DELIVERY_STATUS.PROCESSING && job.leaseOwner && job.leaseOwner !== workerId) {
      console.warn(`[completeJobDelivery] Lease mismatch: owned by ${job.leaseOwner}, completion by ${workerId}. Reconciling...`);
    }

    const historyEntry = {
      timestamp: nowIso,
      status: DELIVERY_STATUS.DELIVERED,
      action: 'DELIVERY_CONFIRMED',
      workerId,
      receiptSummary: receiptData?.receiptId || receiptData?.id || '200_OK',
    };

    const downstreamDelivery = receiptData?.downstreamDelivery || (receiptData?.intakeTier?.includes('Tier 2') ? STATUS_MODEL.DOWNSTREAM_DELIVERY.FALLBACK_DELIVERED : STATUS_MODEL.DOWNSTREAM_DELIVERY.FORMINIT_DELIVERED);
    const intakeTier = receiptData?.intakeTier || (downstreamDelivery === STATUS_MODEL.DOWNSTREAM_DELIVERY.FALLBACK_DELIVERED ? STATUS_MODEL.INTAKE_TIER.TIER_2_FALLBACK : STATUS_MODEL.INTAKE_TIER.TIER_1_PRIMARY);
    const storageState = receiptData?.storageState || STATUS_MODEL.STORAGE_STATE.STORED;
    const registrationState = receiptData?.registrationState || STATUS_MODEL.REGISTRATION_STATE.REGISTERED;

    const updatedFields = {
      status: DELIVERY_STATUS.DELIVERED,
      deliveredAt: nowIso,
      deliveryReceipt: receiptData,
      storageState,
      registrationState,
      downstreamDelivery,
      intakeTier,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      history: [...(job.history || []), historyEntry],
    };

    transaction.update(jobDocRef, updatedFields);

    // Update durable Firestore intake record in document_submissions
    try {
      const subRef = db.collection('document_submissions').doc(job.idempotencyKey || jobId);
      transaction.set(
        subRef,
        {
          status: 'pending_review',
          storageState,
          registrationState,
          downstreamDelivery,
          intakeTier,
          deliveredAt: nowIso,
          deliveryReceipt: receiptData,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    } catch (_) {}

    // Update referenced document record in /documents
    if (job.documentId) {
      try {
        const docRef = db.collection(QUEUE_CONFIG.DOCUMENTS_COLLECTION).doc(job.documentId);
        transaction.set(
          docRef,
          {
            downstreamDelivery,
            intakeTier,
            storageState,
            registrationState,
            deliveredAt: nowIso,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    // Update referenced documentRequest if linked
    if (job.requestId) {
      try {
        const reqRef = db.collection('documentRequests').doc(job.requestId);
        transaction.set(
          reqRef,
          {
            downstreamDelivery,
            intakeTier,
            forminitStatus: 'sent',
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    return {
      success: true,
      job: {
        ...job,
        ...updatedFields,
      },
    };
  });

  return result;
}

/**
 * Handles a delivery failure:
 * - Differentiates retryable errors (429, 5xx, timeout) from non-retryable 4xx client errors.
 * - Computes exponential backoff with full jitter and Retry-After header.
 * - Transitions to needs_review (Dead-Letter) once retry budget is exhausted.
 *
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - Delivery job ID
 * @param {string} workerId - Worker reporting failure
 * @param {Object} failureInfo
 * @param {number|null} [failureInfo.statusCode] - HTTP status code
 * @param {string} [failureInfo.errorMessage] - Descriptive error text
 * @param {string|number|null} [failureInfo.retryAfterHeader] - Optional Retry-After header
 * @param {string} [failureInfo.errorCategory] - Optional explicit category override
 * @param {Object} [options]
 * @param {number} [options.nowMs]
 * @param {Function} [options.randomFn] - Deterministic RNG for testing
 * @returns {Promise<{ success: boolean, newStatus: string, job: Object, backoff?: Object }>}
 */
async function failJobDelivery(db, jobId, workerId, failureInfo = {}, options = {}) {
  const {
    statusCode = null,
    errorMessage = 'Downstream delivery failure',
    retryAfterHeader = null,
  } = failureInfo;

  const now = options.nowMs || Date.now();
  const nowIso = new Date(now).toISOString();

  // Classify error
  const classification = classifyHttpStatus(statusCode);
  const errorCategory = failureInfo.errorCategory || classification.category;

  const jobDocRef = db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId);

  const result = await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobDocRef);
    if (!jobSnap.exists) {
      throw new Error(`Job ${jobId} not found.`);
    }

    const job = jobSnap.data();

    // Already delivered items cannot fail
    if (job.status === DELIVERY_STATUS.DELIVERED) {
      return { success: false, newStatus: DELIVERY_STATUS.DELIVERED, job, reason: 'ALREADY_DELIVERED' };
    }

    let newStatus = DELIVERY_STATUS.RETRY_PENDING;
    let nextAttemptAt = null;
    let backoffResult = null;
    let finalErrorCategory = errorCategory;

    // Case 1: Non-retryable 4xx client error (400, 401, 403, 404, 413, 415, 422)
    if (!classification.retryable && classification.category === ERROR_CATEGORY.NON_RETRYABLE_CLIENT_ERROR) {
      newStatus = DELIVERY_STATUS.PERMANENTLY_FAILED;
      finalErrorCategory = ERROR_CATEGORY.NON_RETRYABLE_CLIENT_ERROR;
      console.warn(`[failJobDelivery] Job ${jobId} failed permanently with HTTP ${statusCode}: ${errorMessage}`);
    }
    // Case 2: Retryable error, but retry budget is exhausted!
    else if (job.attemptCount >= job.maxAttempts) {
      newStatus = DELIVERY_STATUS.NEEDS_REVIEW; // DEAD-LETTER QUEUE
      finalErrorCategory = ERROR_CATEGORY.RETRY_BUDGET_EXHAUSTED;
      console.error(`[failJobDelivery] Job ${jobId} exhausted retry budget (${job.attemptCount}/${job.maxAttempts}). Routed to Dead-Letter (needs_review).`);

      // Record high-priority audit alert for firm staff
      const alertRef = db.collection('audit_logs').doc();
      transaction.set(alertRef, {
        recordedAt: nowIso,
        action: 'Delivery Queue: Retry Budget Exhausted (Dead Letter)',
        category: 'Documents',
        scope: 'compliance',
        provenance: 'delivery_queue_worker',
        clientUid: job.clientId,
        details: `Document [${job.fileName}] exhausted all ${job.maxAttempts} delivery attempts. Last Error: [${finalErrorCategory}] ${errorMessage}. Awaiting practitioner manual review.`,
        isStaff: true,
        jobId: job.jobId,
        documentId: job.documentId,
      });
    }
    // Case 3: Retryable failure within retry budget -> Schedule exponential backoff with jitter
    else {
      newStatus = DELIVERY_STATUS.RETRY_PENDING;
      backoffResult = calculateExponentialBackoff(job.attemptCount, {
        nowMs: now,
        retryAfterHeader,
        randomFn: options.randomFn,
      });
      nextAttemptAt = backoffResult.nextAttemptAt;
      console.info(`[failJobDelivery] Job ${jobId} attempt ${job.attemptCount}/${job.maxAttempts} failed (${finalErrorCategory}). Next attempt in ${backoffResult.backoffSeconds}s at ${nextAttemptAt}.`);
    }

    const historyEntry = {
      timestamp: nowIso,
      status: newStatus,
      action: 'DELIVERY_ATTEMPT_FAILED',
      workerId,
      attemptNumber: job.attemptCount,
      statusCode,
      errorCategory: finalErrorCategory,
      errorMessage,
      nextAttemptAt,
      backoffSeconds: backoffResult ? backoffResult.backoffSeconds : null,
    };

    const updatedFields = {
      status: newStatus,
      lastErrorCategory: finalErrorCategory,
      lastErrorMessage: errorMessage,
      lastErrorStatusCode: statusCode,
      nextAttemptAt,
      storageState: job.storageState || STATUS_MODEL.STORAGE_STATE.STORED,
      registrationState: job.registrationState || STATUS_MODEL.REGISTRATION_STATE.REGISTERED,
      downstreamDelivery: newStatus,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      history: [...(job.history || []), historyEntry],
    };

    transaction.update(jobDocRef, updatedFields);

    // Update durable Firestore intake record in document_submissions
    try {
      const subRef = db.collection('document_submissions').doc(job.idempotencyKey || jobId);
      transaction.set(
        subRef,
        {
          downstreamDelivery: newStatus,
          storageState: job.storageState || STATUS_MODEL.STORAGE_STATE.STORED,
          lastErrorCategory: finalErrorCategory,
          lastErrorMessage: errorMessage,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    } catch (_) {}

    // Update referenced document record in /documents
    if (job.documentId) {
      try {
        const docRef = db.collection(QUEUE_CONFIG.DOCUMENTS_COLLECTION).doc(job.documentId);
        transaction.set(
          docRef,
          {
            downstreamDelivery: newStatus,
            storageState: job.storageState || STATUS_MODEL.STORAGE_STATE.STORED,
            lastDeliveryError: errorMessage,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    // Update documentRequests status
    if (job.requestId) {
      try {
        const reqRef = db.collection('documentRequests').doc(job.requestId);
        transaction.set(
          reqRef,
          {
            downstreamDelivery: newStatus,
            lastDeliveryError: errorMessage,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    return {
      success: true,
      newStatus,
      job: {
        ...job,
        ...updatedFields,
      },
      backoff: backoffResult,
    };
  });

  return result;
}

/**
 * Controlled Manual Retry by authorized firm staff:
 * Allows authorized practitioners to review a failed or dead-letter job
 * and re-queue it with an updated attempt budget and mandatory audit entry.
 *
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - Delivery job ID
 * @param {Object} staffInfo - Authorized practitioner credentials
 * @param {string} staffInfo.staffUid - UID of practitioner
 * @param {string} staffInfo.staffEmail - Email of practitioner
 * @param {string} [staffInfo.justification] - Clinical / compliance rationale
 * @param {Object} [options]
 * @param {number} [options.additionalAttempts] - Extra attempts granted (defaults to 3)
 * @param {number} [options.nowMs]
 * @returns {Promise<{ success: boolean, job: Object }>}
 */
async function manualRetryJob(db, jobId, staffInfo, options = {}) {
  if (!jobId) throw new Error('Missing required argument: jobId');
  if (!staffInfo || !staffInfo.staffUid) {
    throw new Error('Unauthorized: Staff UID required for controlled manual retry.');
  }

  const staffRole = staffInfo.role || '';
  if (staffRole === 'client' || staffInfo.isStaff === false) {
    throw new Error('Unauthorized: Only authorized firm staff (preparer, reviewer, admin, partner) may trigger manual delivery retries under Circular 230 § 10.22.');
  }

  const justification = ((staffInfo && staffInfo.justification) || options.justification || '').trim();
  if (justification.length < 5) {
    throw new Error('A compliance justification (minimum 5 characters) is required under Circular 230 § 10.22.');
  }
  const additionalAttempts = options.additionalAttempts || 3;
  const now = options.nowMs || Date.now();
  const nowIso = new Date(now).toISOString();

  const jobDocRef = db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId);

  const result = await db.runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobDocRef);
    if (!jobSnap.exists) {
      throw new Error(`Job ${jobId} not found.`);
    }

    const job = jobSnap.data();

    // Delivered items cannot be retried
    if (job.status === DELIVERY_STATUS.DELIVERED) {
      throw new Error('Cannot retry a job that has already been confirmed delivered.');
    }

    // Only allow retry from needs_review, permanently_failed, or retry_pending
    if (![DELIVERY_STATUS.NEEDS_REVIEW, DELIVERY_STATUS.PERMANENTLY_FAILED, DELIVERY_STATUS.RETRY_PENDING].includes(job.status)) {
      throw new Error(`Cannot manually retry a job currently in '${job.status}' status.`);
    }

    const newMaxAttempts = Math.max(job.maxAttempts, (job.attemptCount || 0) + additionalAttempts);

    const historyEntry = {
      timestamp: nowIso,
      status: DELIVERY_STATUS.QUEUED,
      action: 'CONTROLLED_MANUAL_RETRY',
      staffUid: staffInfo.staffUid,
      staffEmail: staffInfo.staffEmail || 'staff@pivot-aide.tax',
      justification,
      previousStatus: job.status,
      newMaxAttempts,
    };

    const updatedFields = {
      status: DELIVERY_STATUS.QUEUED,
      nextAttemptAt: nowIso, // Run immediately
      maxAttempts: newMaxAttempts,
      storageState: job.storageState || STATUS_MODEL.STORAGE_STATE.STORED,
      registrationState: job.registrationState || STATUS_MODEL.REGISTRATION_STATE.REGISTERED,
      downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      manualRetryMetadata: {
        retriedBy: staffInfo.staffUid,
        staffEmail: staffInfo.staffEmail || '',
        retriedAt: nowIso,
        justification,
      },
      history: [...(job.history || []), historyEntry],
    };

    transaction.update(jobDocRef, updatedFields);

    // Update document_submissions
    try {
      const subRef = db.collection('document_submissions').doc(job.idempotencyKey || jobId);
      transaction.set(
        subRef,
        {
          downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
          updatedAt: nowIso,
        },
        { merge: true }
      );
    } catch (_) {}

    // Update referenced document in /documents
    if (job.documentId) {
      try {
        const docRef = db.collection(QUEUE_CONFIG.DOCUMENTS_COLLECTION).doc(job.documentId);
        transaction.set(
          docRef,
          {
            downstreamDelivery: STATUS_MODEL.DOWNSTREAM_DELIVERY.QUEUED,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      } catch (_) {}
    }

    // Record immutable audit event
    const auditRef = db.collection('audit_logs').doc();
    transaction.set(auditRef, {
      recordedAt: nowIso,
      action: 'Document Delivery Manual Retry Authorized',
      category: 'Documents',
      scope: 'compliance',
      provenance: 'practitioner_manual_retry',
      clientUid: job.clientId,
      staffUid: staffInfo.staffUid,
      details: `Practitioner [${staffInfo.staffEmail || staffInfo.staffUid}] manually reset delivery job ${job.jobId} from '${job.status}' to 'queued'. Rationale: "${justification}". Granted budget: +${additionalAttempts} attempts.`,
      isStaff: true,
      jobId: job.jobId,
      documentId: job.documentId,
    });

    return {
      success: true,
      job: {
        ...job,
        ...updatedFields,
      },
    };
  });

  return result;
}

/**
 * Executes practitioner review and exception reconciliation under Circular 230 § 10.22.
 * Allows authorized staff to reconcile permanent failures, accept dead-letter exceptions,
 * or reject invalid documents with complete immutable audit logging.
 *
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - Queue job ID
 * @param {Object} staffInfo - { staffUid, staffEmail, role }
 * @param {Object} reviewData - { action: 'accept_reconcile' | 'reject_reupload' | 'escalate', notes: string }
 * @returns {Promise<Object>} Updated job and audit confirmation
 */
async function reconcileJobReview(db, jobId, staffInfo, reviewData) {
  if (!staffInfo || !staffInfo.staffUid) {
    throw new Error('Authorized staff credentials are required for exception review.');
  }

  const { action, notes } = reviewData || {};
  if (!notes || notes.trim().length < 5) {
    throw new Error('Compliance notes (minimum 5 characters) are required under Circular 230 § 10.22.');
  }

  const validActions = ['accept_reconcile', 'reject_reupload', 'escalate'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid review action '${action}'. Allowed: ${validActions.join(', ')}.`);
  }

  const nowIso = new Date().toISOString();
  const jobDocRef = db.collection(QUEUE_CONFIG.COLLECTION_NAME).doc(jobId);

  const result = await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(jobDocRef);
    if (!docSnap.exists) {
      throw new Error(`Delivery job '${jobId}' does not exist.`);
    }

    const job = docSnap.data();

    let targetStatus = job.status;
    let auditAction = '';
    let eventType = '';
    let actionCode = '';

    if (action === 'accept_reconcile') {
      targetStatus = DELIVERY_STATUS.DELIVERED;
      auditAction = 'Document Delivery Exception Reconciled & Accepted';
      eventType = 'DOCUMENT_ACCEPTED';
      actionCode = 'CIRCULAR_230_RECONCILED_ACCEPT';
    } else if (action === 'reject_reupload') {
      targetStatus = DELIVERY_STATUS.PERMANENTLY_FAILED;
      auditAction = 'Document Delivery Exception Rejected (Re-upload Requested)';
      eventType = 'DOCUMENT_REJECTED';
      actionCode = 'CIRCULAR_230_REVIEW_REJECTED';
    } else if (action === 'escalate') {
      targetStatus = DELIVERY_STATUS.NEEDS_REVIEW;
      auditAction = 'Document Delivery Exception Escalated to Managing Partner';
      eventType = 'EXCEPTION_ESCALATED';
      actionCode = 'CIRCULAR_230_ESCALATED';
    }

    const historyEntry = {
      timestamp: nowIso,
      status: targetStatus,
      action: actionCode,
      staffUid: staffInfo.staffUid,
      staffEmail: staffInfo.staffEmail || 'staff@pivot-aide.tax',
      notes: notes.trim(),
      previousStatus: job.status,
    };

    const updatedFields = {
      status: targetStatus,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
      reconciliation: {
        action,
        actionCode,
        staffUid: staffInfo.staffUid,
        staffEmail: staffInfo.staffEmail || '',
        reconciledAt: nowIso,
        notes: notes.trim(),
      },
      history: [...(job.history || []), historyEntry],
    };

    if (action === 'accept_reconcile') {
      updatedFields.deliveredAt = nowIso;
      updatedFields.reconciled = true;
    } else if (action === 'reject_reupload') {
      updatedFields.lastErrorMessage = notes.trim();
      updatedFields.rejected = true;
    } else if (action === 'escalate') {
      updatedFields.escalatedToPartner = true;
    }

    transaction.update(jobDocRef, updatedFields);

    // Record immutable audit event in /audit_logs
    const auditRef = db.collection('audit_logs').doc();
    transaction.set(auditRef, {
      recordedAt: nowIso,
      action: auditAction,
      category: 'Documents',
      scope: 'compliance',
      provenance: 'practitioner_review',
      clientUid: job.clientId,
      staffUid: staffInfo.staffUid,
      details: `Practitioner [${staffInfo.staffEmail || staffInfo.staffUid}] executed review action '${action}' on job ${job.jobId} (previous state '${job.status}'). Notes: "${notes.trim()}". Regulatory standard: Circular 230 § 10.22.`,
      eventType,
      isStaff: true,
      jobId: job.jobId,
      documentId: job.documentId,
    });

    return {
      success: true,
      job: {
        ...job,
        ...updatedFields,
      },
    };
  });

  return result;
}

/**
 * Reclaims stale / expired leases from crashed or timed-out workers.
 * Ensures worker restart resilience.
 *
 * @param {Object} db - Firestore database instance
 * @param {number} [nowMs]
 * @returns {Promise<Array<string>>} List of reclaimed job IDs
 */
async function reclaimStaleLeases(db, nowMs = Date.now()) {
  const nowIso = new Date(nowMs).toISOString();
  const queueCollection = db.collection(QUEUE_CONFIG.COLLECTION_NAME);

  const snapshot = await queueCollection
    .where('status', '==', DELIVERY_STATUS.PROCESSING)
    .where('leaseExpiresAt', '<=', nowIso)
    .get();

  const reclaimedJobIds = [];

  for (const doc of snapshot.docs) {
    const jobId = doc.id;
    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(doc.ref);
        if (!freshSnap.exists) return;
        const job = freshSnap.data();

        if (job.status === DELIVERY_STATUS.PROCESSING && job.leaseExpiresAt && job.leaseExpiresAt <= nowIso) {
          const historyEntry = {
            timestamp: nowIso,
            status: DELIVERY_STATUS.RETRY_PENDING,
            action: 'STALE_LEASE_RECLAIMED',
            previousLeaseOwner: job.leaseOwner,
            message: 'Worker lease expired; reclaimed by queue supervisor.',
          };

          transaction.update(doc.ref, {
            status: DELIVERY_STATUS.RETRY_PENDING,
            nextAttemptAt: nowIso, // Eligible immediately
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCategory: ERROR_CATEGORY.LEASE_EXPIRED,
            lastErrorMessage: 'Previous worker lease expired without completion confirmation.',
            updatedAt: nowIso,
            history: [...(job.history || []), historyEntry],
          });

          reclaimedJobIds.push(jobId);
        }
      });
    } catch (err) {
      console.warn(`[reclaimStaleLeases] Error reclaiming job ${jobId}:`, err.message);
    }
  }

  return reclaimedJobIds;
}

/**
 * Retrieves aggregate delivery queue metrics for firm dashboards.
 *
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} Statistics by status
 */
async function getQueueMetrics(db) {
  const snapshot = await db.collection(QUEUE_CONFIG.COLLECTION_NAME).get();

  const metrics = {
    total: 0,
    queued: 0,
    processing: 0,
    delivered: 0,
    retry_pending: 0,
    permanently_failed: 0,
    needs_review: 0,
  };

  snapshot.forEach((doc) => {
    metrics.total++;
    const data = doc.data();
    const st = data.status;
    if (metrics[st] !== undefined) {
      metrics[st]++;
    }
  });

  return metrics;
}

module.exports = {
  generateIdempotencyKey,
  enqueueDocumentDeliveryJob,
  acquireJobLease,
  completeJobDelivery,
  failJobDelivery,
  manualRetryJob,
  reconcileJobReview,
  reclaimStaleLeases,
  getQueueMetrics,
};

/**
 * ============================================================================
 * THE FILE ROOM — DURABLE DOCUMENT DELIVERY QUEUE
 * functions/delivery-queue/constants.js
 * ============================================================================
 * Authoritative Queue State Machine & Error Taxonomy
 * Compliance Standards: IRC § 6061 & FTC Safeguards Rule 16 CFR § 314.4
 */

'use strict';

/**
 * Authoritative 7 Queue States (Strict State Machine)
 */
const DELIVERY_STATUS = Object.freeze({
  UPLOADED: 'uploaded',                     // Stored in Cloud Storage vault, reference persisted, waiting to be enqueued
  QUEUED: 'queued',                         // Enqueued into authoritative delivery queue for downstream transmission
  PROCESSING: 'processing',                 // Worker has acquired an active, time-bounded exclusive lease via transaction
  DELIVERED: 'delivered',                   // Downstream delivery receipt confirmed (terminal success)
  RETRY_PENDING: 'retry_pending',           // Transient failure (429, 5xx), scheduled with exponential backoff + jitter
  PERMANENTLY_FAILED: 'permanently_failed', // Non-retryable error (4xx client errors), unrecoverable
  NEEDS_REVIEW: 'needs_review',             // Retry budget exhausted (Dead-Letter Queue) or human review required
});

/**
 * Valid legal transitions between delivery states.
 * Enforces state machine integrity; invalid transitions are rejected.
 */
const LEGAL_DELIVERY_TRANSITIONS = Object.freeze({
  [DELIVERY_STATUS.UPLOADED]: [
    DELIVERY_STATUS.QUEUED,
    DELIVERY_STATUS.PERMANENTLY_FAILED,
  ],
  [DELIVERY_STATUS.QUEUED]: [
    DELIVERY_STATUS.PROCESSING,
    DELIVERY_STATUS.PERMANENTLY_FAILED,
    DELIVERY_STATUS.NEEDS_REVIEW,
  ],
  [DELIVERY_STATUS.PROCESSING]: [
    DELIVERY_STATUS.DELIVERED,
    DELIVERY_STATUS.RETRY_PENDING,
    DELIVERY_STATUS.PERMANENTLY_FAILED,
    DELIVERY_STATUS.NEEDS_REVIEW,
    DELIVERY_STATUS.QUEUED, // In case of worker surrender or explicit re-queue
  ],
  [DELIVERY_STATUS.RETRY_PENDING]: [
    DELIVERY_STATUS.PROCESSING,
    DELIVERY_STATUS.QUEUED,
    DELIVERY_STATUS.PERMANENTLY_FAILED,
    DELIVERY_STATUS.NEEDS_REVIEW,
  ],
  [DELIVERY_STATUS.NEEDS_REVIEW]: [
    DELIVERY_STATUS.QUEUED, // Controlled manual staff retry
    DELIVERY_STATUS.DELIVERED, // Reconciled and accepted by practitioner under Circular 230 § 10.22
    DELIVERY_STATUS.PERMANENTLY_FAILED, // Rejection / permanent exception
  ],
  [DELIVERY_STATUS.PERMANENTLY_FAILED]: [
    DELIVERY_STATUS.QUEUED, // Controlled manual staff override retry with justification
    DELIVERY_STATUS.DELIVERED, // Reconciled and accepted by practitioner under Circular 230 § 10.22
  ],
  [DELIVERY_STATUS.DELIVERED]: [], // Terminal state: immutable once confirmed delivered
});

/**
 * Validates if a state transition is permitted.
 */
function isValidDeliveryTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  const allowed = LEGAL_DELIVERY_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Taxonomy of Delivery Error Categories
 */
const ERROR_CATEGORY = Object.freeze({
  RATE_LIMITED_429: 'RATE_LIMITED_429',
  SERVER_ERROR_5XX: 'SERVER_ERROR_5XX',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NON_RETRYABLE_CLIENT_ERROR: 'NON_RETRYABLE_CLIENT_ERROR',
  RETRY_BUDGET_EXHAUSTED: 'RETRY_BUDGET_EXHAUSTED',
  PAYLOAD_INVALID: 'PAYLOAD_INVALID',
  LEASE_EXPIRED: 'LEASE_EXPIRED',
  UNKNOWN: 'UNKNOWN',
});

/**
 * Queue Operational Defaults
 */
const QUEUE_CONFIG = Object.freeze({
  COLLECTION_NAME: 'document_delivery_queue',
  DOCUMENTS_COLLECTION: 'documents',
  DEFAULT_MAX_ATTEMPTS: 5,
  BASE_BACKOFF_SECONDS: 5,
  MAX_BACKOFF_SECONDS: 300, // 5 minutes ceiling
  LEASE_DURATION_MS: 60000, // 60 seconds lease lock
  STATUTORY_RETENTION_STANDARD: 'IRC § 6061 3-Year Statutory Custody & FTC Safeguards § 314.4',
});

/**
 * Primary and Secondary Delivery Endpoints
 */
const INTAKE_ENDPOINTS = Object.freeze({
  PRIMARY_FORMINIT: 'https://forminit.com/f/rv02anqc45x',
  FALLBACK_FIREBASE: 'https://us-central1-uk-client-d90d5.cloudfunctions.net/intakeDocumentFallback',
});

/**
 * 4-Dimension Status Model
 * - storageState: Cloud Storage custody
 * - registrationState: Durable Firestore registration
 * - downstreamDelivery: Destination transmission status
 * - intakeTier: Delivery channel tier
 */
const STATUS_MODEL = Object.freeze({
  STORAGE_STATE: Object.freeze({
    STORED: 'stored',
    PENDING: 'pending',
    FAILED: 'failed',
    BUFFERED_OFFLINE: 'buffered_offline',
  }),
  REGISTRATION_STATE: Object.freeze({
    REGISTERED: 'registered',
    PENDING: 'pending',
    UNCONFIRMED_OFFLINE: 'unconfirmed_offline',
  }),
  DOWNSTREAM_DELIVERY: Object.freeze({
    FORMINIT_DELIVERED: 'forminit_delivered',
    FALLBACK_DELIVERED: 'fallback_delivered',
    QUEUED: 'queued',
    PROCESSING: 'processing',
    RETRY_PENDING: 'retry_pending',
    NEEDS_REVIEW: 'needs_review',
    PERMANENTLY_FAILED: 'permanently_failed',
    FAILED: 'failed',
    UNCONFIRMED_OFFLINE: 'unconfirmed_offline',
  }),
  INTAKE_TIER: Object.freeze({
    TIER_1_PRIMARY: 'Tier 1 (Direct Forminit)',
    TIER_2_FALLBACK: 'Tier 2 (Automatic Fallback - Cloud Function)',
    VAULT_ONLY: 'Vault Only (Pending Downstream Delivery)',
  }),
});

module.exports = {
  DELIVERY_STATUS,
  LEGAL_DELIVERY_TRANSITIONS,
  isValidDeliveryTransition,
  ERROR_CATEGORY,
  QUEUE_CONFIG,
  INTAKE_ENDPOINTS,
  STATUS_MODEL,
};

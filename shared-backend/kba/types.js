/**
 * ============================================================================
 * THE FILE ROOM — KBA TYPES & STATUTORY STATE MACHINE (IRS Pub 1345 § 5.2.2)
 * ============================================================================
 * Standardized status allowlist, statutory limits, and transition validators.
 */

'use strict';

/**
 * Normalized Identity Verification Status Allowlist
 */
const KbaStatus = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  VERIFIED: 'verified',
  FAILED: 'failed',
  EXPIRED: 'expired',
  MANUAL_REVIEW: 'manual_review'
});

/**
 * IRS Publication 1345 § 5.2.2 Statutory Constants
 */
const StatutoryLimits = Object.freeze({
  MAX_ATTEMPTS: 2,               // 2 consecutive failures permanently revoke remote e-signature
  MAX_DURATION_SECONDS: 120,     // 2-minute statutory expiration for dynamic quiz completion
  MIN_PASS_PERCENTAGE: 80,       // Minimum 80% passing threshold
  QUESTION_COUNT_MIN: 3,         // Minimum 3 dynamic out-of-wallet questions
  QUESTION_COUNT_MAX: 5,         // Maximum 5 dynamic questions
  WORM_RETENTION_YEARS: 3        // IRC § 6061 mandatory custody period
});

/**
 * Explicit State Transition Matrix
 * Direct mutations outside this matrix are rejected to ensure WORM tamper-evidence.
 */
const StateTransitions = Object.freeze({
  [KbaStatus.PENDING]: [KbaStatus.IN_PROGRESS, KbaStatus.EXPIRED],
  [KbaStatus.IN_PROGRESS]: [KbaStatus.VERIFIED, KbaStatus.FAILED, KbaStatus.EXPIRED, KbaStatus.MANUAL_REVIEW],
  [KbaStatus.MANUAL_REVIEW]: [KbaStatus.VERIFIED, KbaStatus.FAILED, KbaStatus.EXPIRED],
  [KbaStatus.FAILED]: [],       // Terminal for this attempt session
  [KbaStatus.VERIFIED]: [],     // Terminal: verified state is immutable
  [KbaStatus.EXPIRED]: []       // Terminal for this attempt session
});

/**
 * Validates whether a state transition is permitted.
 * @param {string} currentStatus 
 * @param {string} nextStatus 
 * @returns {boolean}
 */
function isValidTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return false;
  if (currentStatus === nextStatus) return true; // Idempotent updates permitted
  const allowed = StateTransitions[currentStatus];
  return Array.isArray(allowed) && allowed.includes(nextStatus);
}

module.exports = {
  KbaStatus,
  StatutoryLimits,
  StateTransitions,
  isValidTransition
};

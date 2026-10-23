/**
 * ============================================================================
 * THE FILE ROOM — PROVIDER-NEUTRAL KBA INTERFACE
 * functions/providers/kba-interface.js
 * ============================================================================
 * 
 * Statutory Mandates: IRS Publication 1345 § 5.2.2 & NIST SP 800-63-3 AAL2
 * 
 * Strict Status Allowlist:
 * - pending: Session initialized, awaiting taxpayer action
 * - in_progress: Taxpayer has opened the verification session
 * - verified: Dynamic identity proofing passed (>= 80% threshold)
 * - failed: Identity proofing failed (< 80% threshold or mismatched tokens)
 * - expired: Session exceeded statutory timeout (120s limit)
 * - manual_review: Provider flagged session for exception/manual review
 */

'use strict';

/**
 * Normalized provider status allowlist.
 * @readonly
 * @enum {string}
 */
const KBA_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  VERIFIED: 'verified',
  FAILED: 'failed',
  EXPIRED: 'expired',
  MANUAL_REVIEW: 'manual_review',
  MANUAL_OVERRIDE_APPROVED: 'manual_override_approved',
});

/**
 * Valid state transitions for IRS Pub 1345 identity verification.
 */
const VALID_TRANSITIONS = Object.freeze({
  [KBA_STATUS.PENDING]: [KBA_STATUS.IN_PROGRESS, KBA_STATUS.FAILED, KBA_STATUS.EXPIRED],
  [KBA_STATUS.IN_PROGRESS]: [KBA_STATUS.VERIFIED, KBA_STATUS.FAILED, KBA_STATUS.EXPIRED, KBA_STATUS.MANUAL_REVIEW],
  [KBA_STATUS.MANUAL_REVIEW]: [KBA_STATUS.VERIFIED, KBA_STATUS.FAILED, KBA_STATUS.EXPIRED, KBA_STATUS.MANUAL_OVERRIDE_APPROVED],
  [KBA_STATUS.FAILED]: [KBA_STATUS.PENDING], // Only valid if attemptsCount < 2
  [KBA_STATUS.EXPIRED]: [KBA_STATUS.PENDING], // Only valid if attemptsCount < 2
  [KBA_STATUS.VERIFIED]: [], // Terminal verified state
  [KBA_STATUS.MANUAL_OVERRIDE_APPROVED]: [], // Terminal practitioner exception state
});

/**
 * Validates whether a state transition is permitted by the statutory state machine.
 * @param {string} fromStatus Current normalized status
 * @param {string} toStatus Target normalized status
 * @returns {boolean}
 */
function isValidTransition(fromStatus, toStatus) {
  if (!fromStatus) return toStatus === KBA_STATUS.PENDING || toStatus === KBA_STATUS.IN_PROGRESS;
  if (fromStatus === toStatus) return true;
  const allowed = VALID_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Abstract Provider-Neutral Interface for KBA Identity Verification.
 */
class KbaProviderAdapter {
  constructor(providerName) {
    if (new.target === KbaProviderAdapter) {
      throw new TypeError('Cannot construct abstract KbaProviderAdapter directly.');
    }
    this.providerName = providerName;
  }

  /**
   * Creates a dynamic verification session with the provider.
   * @param {Object} params
   * @param {string} params.taxpayerUid - Unique taxpayer identifier
   * @param {string} params.engagementId - Associated engagement ID
   * @param {string} params.signerRole - 'primary' or 'spouse'
   * @param {number} params.taxYear - Tax filing year
   * @param {Object} [params.demographicTokens] - Pre-validated demographic tokens (masked)
   * @returns {Promise<{ inquiryId: string, sessionToken: string, verificationUrl: string, expiresAt: string }>}
   */
  async createVerificationSession(params) {
    throw new Error('createVerificationSession must be implemented by adapter subclass.');
  }

  /**
   * Retrieves the normalized status of an active verification inquiry.
   * @param {string} inquiryId - Provider inquiry identifier
   * @returns {Promise<{ status: string, inquiryId: string, rawStatus: string, riskScore?: number, completedAt?: string }>}
   */
  async getVerificationStatus(inquiryId) {
    throw new Error('getVerificationStatus must be implemented by adapter subclass.');
  }

  /**
   * Verifies the cryptographic HMAC signature of incoming webhooks.
   * @param {Object} params
   * @param {Buffer|string} params.rawBody - Exact unparsed request body
   * @param {Object} params.headers - Incoming HTTP headers
   * @param {string} params.secret - Secret Manager webhook signing secret
   * @returns {boolean}
   */
  verifyWebhookSignature(params) {
    throw new Error('verifyWebhookSignature must be implemented by adapter subclass.');
  }

  /**
   * Parses and normalizes incoming provider webhook event payloads.
   * @param {Object} payload - Parsed JSON body
   * @returns {{ eventId: string, eventType: string, inquiryId: string, normalizedStatus: string, engagementId: string, taxpayerUid: string, signerRole: string, auditMetadata: Object }}
   */
  parseWebhookEvent(payload) {
    throw new Error('parseWebhookEvent must be implemented by adapter subclass.');
  }
}

module.exports = {
  KBA_STATUS,
  VALID_TRANSITIONS,
  isValidTransition,
  KbaProviderAdapter,
};

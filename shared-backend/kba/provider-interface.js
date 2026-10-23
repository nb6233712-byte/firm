/**
 * ============================================================================
 * THE FILE ROOM — IDENTITY VERIFICATION PROVIDER INTERFACE
 * ============================================================================
 * Defines the vendor-neutral contract for Identity Verification & KBA Adapters.
 * Implementations (Persona, LexisNexis, Experian, Mock) must conform to this interface.
 */

'use strict';

class IdentityVerificationProvider {
  /**
   * @param {string} providerName - Unique identifier for the provider (e.g. 'persona', 'lexisnexis')
   */
  constructor(providerName) {
    if (new.target === IdentityVerificationProvider) {
      throw new TypeError('Cannot construct IdentityVerificationProvider directly; instantiate a subclass adapter.');
    }
    this.providerName = providerName;
  }

  /**
   * Initiates a dynamic identity verification session with the provider.
   * 
   * @param {Object} params
   * @param {Object} params.taxpayer - Demographic tokens (Legal name, DOB, address, masked/full SSN)
   * @param {Object} params.context - Engagement, signer role, attempt number, and callback URLs
   * @returns {Promise<{
   *   providerSessionId: string,
   *   sessionToken: string,
   *   clientLaunchUrl: string,
   *   expiresAt: string,
   *   rawStatus: string
   * }>}
   */
  async createSession(params) {
    throw new Error(`createSession() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Retrieves the current verification status for an ongoing session from the provider.
   * 
   * @param {string} providerSessionId
   * @returns {Promise<{
   *   providerSessionId: string,
   *   normalizedStatus: string, // One of KbaStatus (pending, in_progress, verified, failed, expired, manual_review)
   *   score: number|null,
   *   completedAt: string|null,
   *   rawStatus: string
   * }>}
   */
  async getSessionStatus(providerSessionId) {
    throw new Error(`getSessionStatus() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Verifies the cryptographic signature of an incoming webhook from the provider.
   * 
   * @param {string|Buffer} rawBody - The unparsed request body string or buffer
   * @param {Object} headers - HTTP request headers
   * @param {string} secret - Signing secret from Google Cloud Secret Manager
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, headers, secret) {
    throw new Error(`verifyWebhookSignature() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Parses an authenticated webhook payload and maps it to normalized KbaStatus and metadata.
   * 
   * @param {Object} parsedBody - JSON parsed webhook body
   * @param {Object} headers - HTTP request headers
   * @returns {{
   *   eventType: string,
   *   providerSessionId: string,
   *   referenceId: string|null,
   *   normalizedStatus: string,
   *   score: number|null,
   *   completedAt: string|null,
   *   rawPayload: Object
   * }}
   */
  parseWebhookEvent(parsedBody, headers) {
    throw new Error(`parseWebhookEvent() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = IdentityVerificationProvider;

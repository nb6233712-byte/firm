/**
 * ============================================================================
 * THE FILE ROOM — EXPERIAN PRECISE ID / KNOWLEDGEIQ ADAPTER SPECIFICATION
 * ============================================================================
 * IRS Publication 1345 § 5.2.2 Provider Adapter.
 * 
 * Contract & Architecture Prerequisites (Verified Requirements):
 * 1. Product: Experian CrossCore Platform / Precise ID KnowledgeIQ (KBV).
 * 2. Protocol & Transport:
 *    - OAuth 2.0 Bearer Token (Client Credentials grant: client_id & client_secret).
 *    - CrossCore RESTful JSON APIs.
 * 3. Contractual Credentials:
 *    - Experian Subcode / Preamble Code.
 *    - CrossCore Tenant ID and Client Application Credentials.
 * 4. Regulatory Parameters:
 *    - 3–5 out-of-wallet questions sourced from credit file & public records.
 *    - Timed 120-second session expiration; 80% passing threshold.
 */

'use strict';

const IdentityVerificationProvider = require('../provider-interface');

class ExperianAdapter extends IdentityVerificationProvider {
  constructor(options = {}) {
    super('experian');
    this.clientId = options.clientId || process.env.EXPERIAN_CLIENT_ID;
    this.clientSecret = options.clientSecret || options.apiKey;
    this.subcode = options.subcode || process.env.EXPERIAN_SUBCODE;
    this.isConfigured = Boolean(this.clientId && this.clientSecret && this.subcode);
  }

  async createSession(params) {
    if (!this.isConfigured) {
      throw new Error(
        'Experian Precise ID adapter is not fully configured. ' +
        'IRS Pub 1345 deployment requires verified Experian CrossCore tenant credentials (ClientId, ClientSecret, and Subcode).'
      );
    }
    throw new Error('Experian Precise ID live endpoint integration awaiting enterprise tenant provisioning.');
  }

  async getSessionStatus(providerSessionId) {
    if (!this.isConfigured) {
      throw new Error('Experian Precise ID adapter requires active contract credentials.');
    }
    throw new Error('Experian Precise ID status query awaiting enterprise tenant provisioning.');
  }

  verifyWebhookSignature(rawBody, headers, secret) {
    return false;
  }

  parseWebhookEvent(parsedBody, headers) {
    throw new Error('Experian webhook parser awaiting enterprise tenant provisioning.');
  }
}

module.exports = ExperianAdapter;

/**
 * ============================================================================
 * THE FILE ROOM — ISOLATED MOCK KBA ADAPTER (TESTING & CI ONLY)
 * functions/providers/mock-adapter.js
 * ============================================================================
 * 
 * Requirement 9:
 * "Remove the simulated quiz and demo success mechanism from production routes.
 * Keep mock-provider behavior isolated to automated tests or a clearly separated development environment."
 * 
 * Strictly forbidden in production: Throws immediately if NODE_ENV === 'production'.
 */

'use strict';

const crypto = require('node:crypto');
const { KbaProviderAdapter, KBA_STATUS } = require('./kba-interface');

class MockKbaAdapter extends KbaProviderAdapter {
  constructor() {
    super('mock');
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY FATAL] MockKbaAdapter is strictly prohibited in production environment.');
    }
  }

  async createVerificationSession(params) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY FATAL] Mock verification session attempted in production.');
    }

    const { taxpayerUid, engagementId, signerRole, taxYear } = params;
    const inquiryId = `inq_mock_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const sessionToken = `tok_mock_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString();

    return {
      inquiryId,
      sessionToken,
      verificationUrl: `http://localhost:5501/client/test-mock-kba.html?inquiry=${inquiryId}`,
      expiresAt,
    };
  }

  async getVerificationStatus(inquiryId) {
    return {
      inquiryId,
      rawStatus: 'completed',
      status: KBA_STATUS.VERIFIED,
      riskScore: 0,
      completedAt: new Date().toISOString(),
    };
  }

  verifyWebhookSignature(params) {
    const { secret, headers = {} } = params;
    const isValid = headers['x-mock-test-secret'] === secret || Boolean(headers['persona-signature']);
    return {
      isValid,
      isStale: false,
      reason: isValid ? null : 'mock_signature_mismatch',
      timestamp: Math.floor(Date.now() / 1000),
      signature: headers['persona-signature'] || null,
    };
  }

  parseWebhookEvent(payload) {
    return {
      eventId: payload.id || `evt_mock_${Date.now()}`,
      eventType: payload.type || 'verification.passed',
      inquiryId: payload.inquiryId || 'inq_mock',
      engagementId: payload.engagementId || 'eng_mock_2026',
      taxpayerUid: payload.taxpayerUid || 'usr_mock',
      signerRole: payload.signerRole || 'primary',
      normalizedStatus: payload.forceStatus || KBA_STATUS.VERIFIED,
      auditMetadata: {
        provider: 'Mock KBA Adapter (Test Environment)',
        isMock: true,
      },
    };
  }
}

module.exports = {
  MockKbaAdapter,
};

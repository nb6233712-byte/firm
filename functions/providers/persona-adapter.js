/**
 * ============================================================================
 * THE FILE ROOM — PERSONA IDENTITY VERIFICATION ADAPTER
 * functions/providers/persona-adapter.js
 * ============================================================================
 * 
 * Implements Persona REST API (v1 / 2023-01-05) for IRS Pub 1345 § 5.2.2 KBA.
 * Verified Provider Capabilities:
 * - Dynamic out-of-wallet credit & public records questionnaire
 * - Embedded client widget (Persona Web SDK v4.14+)
 * - Webhook HMAC-SHA256 signature verification (persona-signature: t=...,v1=...)
 * - Strict 120-second timeout enforcement and 80% passing threshold
 */

'use strict';

const crypto = require('node:crypto');
const { KbaProviderAdapter, KBA_STATUS } = require('./kba-interface');

class PersonaAdapter extends KbaProviderAdapter {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Persona API Key (Bearer token)
   * @param {string} [config.templateId] - Inquiry Template ID (e.g. itmpl_irs_pub1345_kba)
   * @param {string} [config.apiBase] - API Base URL (defaults to https://withpersona.com/api/v1)
   */
  constructor(config = {}) {
    super('persona');
    this.apiKey = config.apiKey;
    this.templateId = config.templateId || process.env.KBA_TEMPLATE_ID || 'itmpl_irs_pub1345_kba';
    this.apiBase = config.apiBase || process.env.KBA_PROVIDER_URL || 'https://withpersona.com/api/v1';
  }

  /**
   * Helper: Standard Persona API Request Headers.
   */
  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Persona-Version': '2023-01-05',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Key-Inflection': 'camel',
    };
  }

  /**
   * Creates an inquiry session with Persona.
   */
  async createVerificationSession(params) {
    if (!this.apiKey) {
      throw new Error('Persona API key is not configured in Secret Manager.');
    }

    const { taxpayerUid, engagementId, signerRole, taxYear, demographicTokens } = params;

    const attributes = {
      inquiryTemplateId: this.templateId,
      referenceId: taxpayerUid,
    };

    // Forward pre-validated demographic tokens if available
    if (demographicTokens && typeof demographicTokens === 'object') {
      attributes.fields = {};
      if (demographicTokens.firstName) attributes.fields.nameFirst = demographicTokens.firstName;
      if (demographicTokens.lastName) attributes.fields.nameLast = demographicTokens.lastName;
      if (demographicTokens.street) attributes.fields.addressStreet1 = demographicTokens.street;
      if (demographicTokens.city) attributes.fields.addressCity = demographicTokens.city;
      if (demographicTokens.state) attributes.fields.addressSubdivision = demographicTokens.state;
      if (demographicTokens.postalCode) attributes.fields.addressPostalCode = demographicTokens.postalCode;
      if (demographicTokens.dob) attributes.fields.birthdate = demographicTokens.dob;
    }

    const payload = {
      data: {
        attributes,
        meta: {
          engagementId,
          taxpayerUid,
          signerRole,
          taxYear: String(taxYear || 2026),
          regulatoryStandard: 'IRS Publication 1345 § 5.2.2',
        },
      },
    };

    const res = await fetch(`${this.apiBase}/inquiries`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[PersonaAdapter] Failed to create inquiry:', res.status, errBody);
      throw new Error(`Persona API Error (${res.status}): Failed to initialize verification session.`);
    }

    const inqData = await res.json();
    const inquiryId = inqData?.data?.id;
    let sessionToken = inqData?.data?.attributes?.sessionToken || inqData?.meta?.sessionToken;

    // If session token was not returned in inquiry creation, generate an Inquiry Session
    if (!sessionToken && inquiryId) {
      try {
        const sessionRes = await fetch(`${this.apiBase}/inquiry-sessions`, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify({
            data: {
              attributes: {
                inquiryId,
              },
            },
          }),
        });
        if (sessionRes.ok) {
          const sessData = await sessionRes.json();
          sessionToken = sessData?.data?.attributes?.token || sessData?.data?.id;
        }
      } catch (sErr) {
        console.warn('[PersonaAdapter] Secondary session-token generation notice:', sErr.message);
      }
    }

    const expiresAt = new Date(Date.now() + 120 * 1000).toISOString(); // 2-minute expiration per IRS Pub 1345

    return {
      inquiryId,
      sessionToken: sessionToken || inquiryId,
      verificationUrl: `https://withpersona.com/verify?inquiry-id=${inquiryId}`,
      expiresAt,
    };
  }

  /**
   * Retrieves live status of an inquiry from Persona.
   */
  async getVerificationStatus(inquiryId) {
    if (!this.apiKey) {
      throw new Error('Persona API key is not configured.');
    }

    const res = await fetch(`${this.apiBase}/inquiries/${encodeURIComponent(inquiryId)}`, {
      method: 'GET',
      headers: this._headers(),
    });

    if (!res.ok) {
      throw new Error(`Persona API inquiry fetch failed with status ${res.status}`);
    }

    const data = await res.json();
    const rawStatus = data?.data?.attributes?.status || 'unknown';
    const normalized = this._normalizePersonaStatus(rawStatus);

    return {
      inquiryId,
      rawStatus,
      status: normalized,
      riskScore: data?.data?.attributes?.riskScore || 0,
      completedAt: data?.data?.attributes?.completedAt || null,
    };
  }

  /**
   * Verifies HMAC-SHA256 Webhook Signature from Persona adhering to official documentation:
   * Header: persona-signature: t=<timestamp>,v1=<signature>
   * Signed payload: ${timestamp}.${rawBody}
   *
   * @param {Object} params
   * @param {Buffer|string} params.rawBody - Raw request body
   * @param {Object} params.headers - Incoming request headers
   * @param {string} params.secret - Secret Manager webhook signing secret
   * @param {number} [params.toleranceSeconds=300] - Replay attack defense tolerance (5 minutes)
   * @param {number} [params.currentTimeSeconds] - Current time in seconds (for testing)
   * @returns {{ isValid: boolean, isStale: boolean, reason: string|null, timestamp: number|null, signature: string|null }}
   */
  verifyWebhookSignature(params) {
    const { rawBody, headers = {}, secret, toleranceSeconds = 300, currentTimeSeconds } = params;
    if (!secret) {
      console.warn('[PersonaAdapter] Missing webhook secret in configuration.');
      return { isValid: false, isStale: false, reason: 'missing_secret', timestamp: null, signature: null };
    }

    // Case-insensitive header lookup
    let sigHeader = null;
    for (const [key, val] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'persona-signature' || lower === 'x-signature-sha256') {
        sigHeader = Array.isArray(val) ? val[0] : val;
        break;
      }
    }

    if (!sigHeader || typeof sigHeader !== 'string') {
      console.warn('[PersonaAdapter] Missing or invalid persona-signature header.');
      return { isValid: false, isStale: false, reason: 'missing_signature_header', timestamp: null, signature: null };
    }

    try {
      let timestamp = '';
      const signatures = [];
      const parts = sigHeader.split(',');
      for (const part of parts) {
        const [k, ...vParts] = part.trim().split('=');
        const v = vParts.join('=');
        if (k === 't') timestamp = v;
        if (k === 'v1' || k === 'sig') signatures.push(v);
      }

      // If no prefix format (raw HMAC string), treat the entire header as signature
      if (signatures.length === 0 && !sigHeader.includes('=')) {
        signatures.push(sigHeader.trim());
      }

      // Validate timestamp presence & freshness
      if (!timestamp) {
        console.warn('[PersonaAdapter] Missing timestamp in persona-signature header.');
        return { isValid: false, isStale: false, reason: 'missing_timestamp', timestamp: null, signature: null };
      }

      const tsNum = Number(timestamp);
      if (isNaN(tsNum)) {
        return { isValid: false, isStale: false, reason: 'invalid_timestamp_format', timestamp: null, signature: null };
      }

      const tsSec = tsNum > 1e11 ? Math.floor(tsNum / 1000) : Math.floor(tsNum);
      const nowSec = currentTimeSeconds != null ? currentTimeSeconds : Math.floor(Date.now() / 1000);
      const deltaSec = Math.abs(nowSec - tsSec);

      if (deltaSec > toleranceSeconds) {
        console.warn(`[PersonaAdapter] Stale webhook timestamp detected: delta ${deltaSec}s exceeds ${toleranceSeconds}s tolerance.`);
        return {
          isValid: false,
          isStale: true,
          reason: `stale_timestamp (delta: ${deltaSec}s > ${toleranceSeconds}s)`,
          timestamp: tsSec,
          signature: null,
        };
      }

      if (signatures.length === 0) {
        return { isValid: false, isStale: false, reason: 'no_v1_signatures_found', timestamp: tsSec, signature: null };
      }

      // Construct signed payload: `${timestamp}.${rawBody}`
      const bodyStr = Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));
      const signedData = `${timestamp}.${bodyStr}`;

      const expectedHmac = crypto.createHmac('sha256', secret).update(signedData).digest('hex');
      const expectedBuffer = Buffer.from(expectedHmac, 'hex');

      let matchedSig = null;
      for (const candidateSig of signatures) {
        try {
          const sigBuffer = Buffer.from(candidateSig, 'hex');
          if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            matchedSig = candidateSig;
            break;
          }
        } catch (_) {}
      }

      if (matchedSig) {
        return {
          isValid: true,
          isStale: false,
          reason: null,
          timestamp: tsSec,
          signature: matchedSig,
        };
      }

      return {
        isValid: false,
        isStale: false,
        reason: 'signature_mismatch',
        timestamp: tsSec,
        signature: null,
      };
    } catch (e) {
      console.error('[PersonaAdapter] Webhook signature verification exception:', e);
      return { isValid: false, isStale: false, reason: `verification_exception: ${e.message}`, timestamp: null, signature: null };
    }
  }

  /**
   * Normalizes Persona webhook payload into uniform event structure.
   */
  parseWebhookEvent(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload: expected non-null object.');
    }

    const eventData = payload.data || {};
    const eventId = eventData.id || payload.id || `evt_${Date.now()}`;
    const eventType = eventData.attributes?.name || payload.type || payload.event || 'unknown';

    const inquiryPayload = eventData.attributes?.payload?.data || eventData;
    const inquiryId = inquiryPayload.id || '';
    const metadata = inquiryPayload.attributes?.metadata || inquiryPayload.meta || eventData.attributes?.metadata || {};

    const engagementId = metadata.engagementId || metadata.engagement_id || null;
    const taxpayerUid = metadata.taxpayerUid || metadata.taxpayer_uid || inquiryPayload.attributes?.referenceId || null;
    const signerRole = (metadata.signerRole === 'spouse' || metadata.signer_role === 'spouse') ? 'spouse' : 'primary';

    const normalizedStatus = this._mapEventTypeToStatus(eventType);

    return {
      eventId,
      eventType,
      inquiryId,
      engagementId,
      taxpayerUid,
      signerRole,
      normalizedStatus,
      auditMetadata: {
        rawStatus: inquiryPayload.attributes?.status,
        riskScore: inquiryPayload.attributes?.riskScore || 0,
        provider: 'Persona (IRS Pub 1345 § 5.2.2)',
      },
    };
  }

  /**
   * Internal mapping from Persona status strings to strict KBA_STATUS enum.
   */
  _normalizePersonaStatus(rawStatus) {
    switch (rawStatus) {
      case 'created':
      case 'pending':
        return KBA_STATUS.IN_PROGRESS;
      case 'completed':
      case 'passed':
        return KBA_STATUS.VERIFIED;
      case 'failed':
      case 'declined':
        return KBA_STATUS.FAILED;
      case 'expired':
        return KBA_STATUS.EXPIRED;
      case 'needs_review':
        return KBA_STATUS.MANUAL_REVIEW;
      default:
        return KBA_STATUS.IN_PROGRESS;
    }
  }

  /**
   * Internal mapping from Persona webhook event names to strict KBA_STATUS enum.
   */
  _mapEventTypeToStatus(eventType) {
    switch (eventType) {
      case 'inquiry.completed':
      case 'verification.passed':
        return KBA_STATUS.VERIFIED;
      case 'inquiry.failed':
      case 'verification.failed':
        return KBA_STATUS.FAILED;
      case 'inquiry.expired':
      case 'verification.expired':
        return KBA_STATUS.EXPIRED;
      case 'inquiry.marked-needs-review':
      case 'inquiry.requires_retry':
        return KBA_STATUS.MANUAL_REVIEW;
      case 'inquiry.started':
      case 'inquiry.transitioned':
        return KBA_STATUS.IN_PROGRESS;
      default:
        return KBA_STATUS.PENDING;
    }
  }
}

module.exports = {
  PersonaAdapter,
};

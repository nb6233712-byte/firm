/**
 * ============================================================================
 * THE FILE ROOM — PERSONA IDENTITY VERIFICATION ADAPTER
 * ============================================================================
 * Production implementation of IdentityVerificationProvider targeting
 * Persona Inquiries API (v2023-01-05) under IRS Publication 1345 § 5.2.2.
 */

'use strict';

const crypto = require('node:crypto');
const IdentityVerificationProvider = require('../provider-interface');
const { KbaStatus, StatutoryLimits } = require('../types');

class PersonaAdapter extends IdentityVerificationProvider {
  /**
   * @param {Object} options
   * @param {string} options.apiKey - Persona API key (from Secret Manager)
   * @param {string} [options.templateId] - Inquiry template ID (starts with 'itmpl_')
   * @param {string} [options.apiBase] - API Base URL (defaults to https://withpersona.com/api/v1)
   */
  constructor(options = {}) {
    super('persona');
    this.apiKey = options.apiKey;
    this.templateId = options.templateId || process.env.KBA_TEMPLATE_ID || 'itmpl_irs_pub1345_kba_prod';
    this.apiBase = options.apiBase || process.env.KBA_PROVIDER_URL || 'https://withpersona.com/api/v1';
  }

  /**
   * Dispatches inquiry creation to Persona API.
   */
  async createSession(params) {
    if (!this.apiKey) {
      throw new Error('PersonaAdapter requires an API key.');
    }

    const { taxpayer, context } = params;
    const referenceId = `${context.engagementId}_${context.signerRole}_att${context.attemptNumber}_${Date.now().toString(36)}`;
    
    // Prepare field prefill conforming to Persona schema
    const fields = {};
    if (taxpayer.firstName) fields['name-first'] = { value: taxpayer.firstName };
    if (taxpayer.lastName) fields['name-last'] = { value: taxpayer.lastName };
    if (taxpayer.dob) fields['birthdate'] = { value: taxpayer.dob };
    if (taxpayer.address) {
      if (taxpayer.address.street) fields['address-street-1'] = { value: taxpayer.address.street };
      if (taxpayer.address.city) fields['address-city'] = { value: taxpayer.address.city };
      if (taxpayer.address.state) fields['address-subdivision'] = { value: taxpayer.address.state };
      if (taxpayer.address.zip) fields['address-postal-code'] = { value: taxpayer.address.zip };
    }
    if (taxpayer.ssnFull) {
      fields['identification-number'] = { value: taxpayer.ssnFull };
    }

    const payload = {
      data: {
        type: 'inquiry',
        attributes: {
          'inquiry-template-id': this.templateId,
          'reference-id': referenceId,
          'redirect-url': context.returnUrl || null,
          fields: fields
        },
        meta: {
          irs_pub_1345_compliant: true,
          max_duration_seconds: StatutoryLimits.MAX_DURATION_SECONDS,
          pass_threshold_percentage: StatutoryLimits.MIN_PASS_PERCENTAGE,
          engagement_id: context.engagementId,
          signer_role: context.signerRole,
          attempt_number: context.attemptNumber,
          tax_year: context.taxYear || 2026
        }
      }
    };

    const res = await fetch(`${this.apiBase}/inquiries`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Persona-Version': '2023-01-05',
        'Key-Inflection': 'camel'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[PersonaAdapter] Create inquiry error:', res.status, errText);
      throw new Error(`Persona API responded with status ${res.status}`);
    }

    const data = await res.json();
    const inquiry = data.data || {};
    const inquiryId = inquiry.id;
    const sessionToken = (inquiry.meta && inquiry.meta.sessionToken) || inquiry.attributes?.sessionToken || inquiryId;
    const hostedUrl = inquiry.attributes?.hostedUrl || `https://withpersona.com/verify?inquiry-id=${inquiryId}`;
    const expiresAt = new Date(Date.now() + StatutoryLimits.MAX_DURATION_SECONDS * 1000).toISOString();

    return {
      providerSessionId: inquiryId,
      sessionToken: sessionToken,
      clientLaunchUrl: hostedUrl,
      expiresAt: expiresAt,
      rawStatus: inquiry.attributes?.status || 'created'
    };
  }

  /**
   * Retrieves status of an Inquiry by ID.
   */
  async getSessionStatus(providerSessionId) {
    if (!this.apiKey) {
      throw new Error('PersonaAdapter requires an API key.');
    }

    const res = await fetch(`${this.apiBase}/inquiries/${encodeURIComponent(providerSessionId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Persona-Version': '2023-01-05',
        'Key-Inflection': 'camel'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[PersonaAdapter] Get inquiry error:', res.status, errText);
      throw new Error(`Persona API responded with status ${res.status}`);
    }

    const data = await res.json();
    const inquiry = data.data || {};
    const rawStatus = inquiry.attributes?.status || 'unknown';
    const normalized = this._normalizePersonaStatus(rawStatus);

    return {
      providerSessionId: inquiry.id || providerSessionId,
      normalizedStatus: normalized,
      score: null, // Persona manages question scoring internally against the configured 80% threshold
      completedAt: inquiry.attributes?.completedAt || null,
      rawStatus: rawStatus
    };
  }

  /**
   * Verifies Persona HMAC-SHA256 signature using timing-safe comparison.
   * Conforms strictly to Persona webhook documentation:
   * - Inspects Persona-Signature header (t=...,v1=...)
   * - Supports multiple space-separated pairs for key rotation
   * - Enforces 300-second maximum timestamp drift to prevent replay attacks
   * - Message = `${t}.${rawBody}`
   * 
   * @param {string|Buffer} rawBody
   * @param {Object} headers
   * @param {string} secret
   * @param {number} [toleranceSeconds=300]
   * @returns {{ valid: boolean, reason?: string, timestamp?: number }}
   */
  verifyWebhookSignature(rawBody, headers, secret, toleranceSeconds = 300) {
    if (!secret) {
      return { valid: false, reason: 'MISSING_SECRET' };
    }
    const signatureHeader = headers['persona-signature'] || headers['Persona-Signature'];
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      return { valid: false, reason: 'MISSING_SIGNATURE_HEADER' };
    }

    const rawString = typeof rawBody === 'string' ? rawBody : (rawBody ? rawBody.toString('utf8') : '');
    if (!rawString) {
      return { valid: false, reason: 'EMPTY_RAW_BODY' };
    }

    // Handle space-separated signature pairs (Persona secret rotation support)
    const pairs = signatureHeader.trim().split(/\s+/);
    let matchedValid = false;
    let latestTimestamp = null;
    let timestampExpired = false;

    for (const pair of pairs) {
      const parts = pair.split(',');
      let t = null;
      let v1 = null;

      for (const p of parts) {
        if (p.startsWith('t=')) t = p.slice(2);
        if (p.startsWith('v1=')) v1 = p.slice(3);
      }

      if (!t || !v1) continue;

      const parsedTime = parseInt(t, 10);
      if (isNaN(parsedTime)) continue;
      latestTimestamp = parsedTime;

      // Check timestamp freshness against tolerance
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - parsedTime) > toleranceSeconds) {
        timestampExpired = true;
        continue;
      }

      // Compute expected HMAC-SHA256
      const signedPayload = `${t}.${rawString}`;
      const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

      try {
        const sigBuffer = Buffer.from(v1, 'hex');
        const expBuffer = Buffer.from(expected, 'hex');
        if (sigBuffer.length === expBuffer.length && crypto.timingSafeEqual(sigBuffer, expBuffer)) {
          matchedValid = true;
          break;
        }
      } catch (_) {}
    }

    if (matchedValid) {
      return { valid: true, timestamp: latestTimestamp };
    }
    if (timestampExpired) {
      return { valid: false, reason: 'TIMESTAMP_EXPIRED', timestamp: latestTimestamp };
    }
    return { valid: false, reason: 'SIGNATURE_MISMATCH' };
  }

  /**
   * Parses webhook event payload adhering to Persona Event schema.
   */
  parseWebhookEvent(parsedBody, headers) {
    if (!parsedBody || typeof parsedBody !== 'object') {
      throw new Error('Malformed webhook payload: body must be a valid JSON object.');
    }

    const eventData = parsedBody.data || parsedBody;
    const eventId = eventData.id || parsedBody.id;
    if (!eventId) {
      throw new Error('Malformed webhook payload: missing event ID.');
    }

    const eventType = eventData.attributes?.name || eventData.type || parsedBody.type || 'inquiry.event';
    const payload = eventData.attributes?.payload?.data || eventData.attributes?.payload || eventData;
    const inquiryAttributes = payload.attributes || {};

    const providerSessionId = payload.id || inquiryAttributes.inquiryId || eventData.id;
    const rawStatus = inquiryAttributes.status || 'unknown';
    const referenceId = inquiryAttributes.referenceId || null;
    const normalizedStatus = this._normalizePersonaStatus(rawStatus);
    const completedAt = inquiryAttributes.completedAt || eventData.attributes?.createdAt || new Date().toISOString();

    return {
      eventId: String(eventId),
      eventType: String(eventType),
      providerSessionId: String(providerSessionId),
      referenceId: referenceId ? String(referenceId) : null,
      normalizedStatus: normalizedStatus,
      completedAt: completedAt,
      rawStatus: rawStatus
    };
  }

  /**
   * Maps Persona inquiry statuses to normalized KbaStatus allowlist.
   * @private
   */
  _normalizePersonaStatus(personaStatus) {
    switch (String(personaStatus).toLowerCase()) {
      case 'created':
        return KbaStatus.PENDING;
      case 'pending':
        return KbaStatus.IN_PROGRESS;
      case 'completed':
      case 'passed':
        return KbaStatus.VERIFIED;
      case 'failed':
      case 'declined':
        return KbaStatus.FAILED;
      case 'expired':
      case 'canceled':
        return KbaStatus.EXPIRED;
      case 'needs_review':
        return KbaStatus.MANUAL_REVIEW;
      default:
        return KbaStatus.IN_PROGRESS;
    }
  }
}

module.exports = PersonaAdapter;

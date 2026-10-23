/**
 * ============================================================================
 * THE FILE ROOM — KBA SESSION MANAGER & STATUTORY STATE MACHINE
 * ============================================================================
 * Implements IRS Publication 1345 § 5.2.2 requirements:
 * 1. Engagement ownership validation & role-based access.
 * 2. Rate limiting & anti-abuse guards.
 * 3. Statutory 2-attempt lockout rule.
 * 4. Explicit state transitions across normalized KbaStatus allowlist.
 * 5. Privacy safeguards: Zero retention of questions, answers, or full SSNs.
 */

'use strict';

const admin = require('firebase-admin');
const { KbaStatus, StatutoryLimits, isValidTransition } = require('./types');
const { createProvider } = require('./provider-factory');

class KbaSessionManager {
  /**
   * @param {admin.firestore.Firestore} db
   * @param {Object} [options]
   */
  constructor(db, options = {}) {
    this.db = db || admin.firestore();
    this.provider = createProvider(options);
  }

  /**
   * Initiates an identity verification session with strict ownership, rate limits, and lockout checks.
   * 
   * @param {Object} params
   * @param {string} params.authUid - Authenticated Firebase user UID
   * @param {string} params.engagementId - Target engagement identifier
   * @param {string} [params.signerRole] - 'primary' or 'spouse'
   * @param {string} [params.returnUrl] - Optional client return URL
   * @returns {Promise<Object>} Minimal client payload (no credentials or sensitive PII)
   */
  async initiateSession(params) {
    const { authUid, engagementId, signerRole = 'primary', returnUrl } = params;

    if (!authUid) {
      const err = new Error('Authentication required.');
      err.code = 'unauthenticated';
      throw err;
    }
    if (!engagementId) {
      const err = new Error('Missing engagementId.');
      err.code = 'invalid-argument';
      throw err;
    }
    if (!['primary', 'spouse'].includes(signerRole)) {
      const err = new Error("Invalid signerRole. Must be 'primary' or 'spouse'.");
      err.code = 'invalid-argument';
      throw err;
    }

    // 1. Verify Engagement Ownership / Authorization
    const engDoc = await this.db.collection('engagements').doc(engagementId).get();
    if (engDoc.exists) {
      const engData = engDoc.data();
      if (engData.clientUid && engData.clientUid !== authUid) {
        // Check if caller has staff role
        const staffDoc = await this.db.collection('firm_staff').doc(authUid).get();
        if (!staffDoc.exists) {
          const err = new Error('Access denied: You do not own this engagement record.');
          err.code = 'permission-denied';
          throw err;
        }
      }
    }

    // 2. Lockout Guard & Rate Limiting Check
    const kbaRecordRef = this.db.collection('kba_records').doc(engagementId);
    const kbaSnap = await kbaRecordRef.get();
    const kbaData = kbaSnap.exists ? kbaSnap.data() : {};
    const signerKey = signerRole === 'spouse' ? 'spouse' : 'primary';
    const signerState = (kbaData && kbaData[signerKey]) || {
      attemptsCount: 0,
      kba_locked: false,
      status: KbaStatus.PENDING
    };

    // Statutory 2-Attempt Lockout Enforcement (IRS Pub 1345 § 5.2.2)
    if (signerState.kba_locked || signerState.attemptsCount >= StatutoryLimits.MAX_ATTEMPTS) {
      const err = new Error(
        'IRS Statutory Lockout Enforced: 2 consecutive verification failures exceeded for this taxpayer. ' +
        'Remote electronic Form 8879 execution is permanently revoked. A physical wet-ink signature is required.'
      );
      err.code = 'failed-precondition';
      throw err;
    }

    // Rate Limit: Prevent rapid re-triggering (30s cooldown between attempts)
    if (signerState.lastSessionInitiatedAt) {
      const lastInitiated = signerState.lastSessionInitiatedAt.toDate
        ? signerState.lastSessionInitiatedAt.toDate().getTime()
        : new Date(signerState.lastSessionInitiatedAt).getTime();
      const timeSince = Date.now() - lastInitiated;
      if (timeSince < 30 * 1000) {
        const remainingSeconds = Math.ceil((30 * 1000 - timeSince) / 1000);
        const err = new Error(`Rate limit exceeded. Please wait ${remainingSeconds} seconds before requesting a new identity quiz.`);
        err.code = 'resource-exhausted';
        throw err;
      }
    }

    // 3. Retrieve Private Demographics from users/{uid}
    const userDoc = await this.db.collection('users').doc(authUid).get();
    if (!userDoc.exists) {
      const err = new Error('Taxpayer identity profile not found in secure vault. Contact your practitioner.');
      err.code = 'not-found';
      throw err;
    }
    const userData = userDoc.data();
    let profile = userData;
    if (signerRole === 'spouse') {
      if (!userData.spouse) {
        const err = new Error('Secondary spouse demographic record not found.');
        err.code = 'not-found';
        throw err;
      }
      profile = userData.spouse;
    }

    const firstName = profile.firstName || profile.legalFirstName;
    const lastName = profile.lastName || profile.legalLastName;
    const dob = profile.dob || profile.dateOfBirth;
    const address = profile.address || {};

    if (!firstName || !lastName || !dob || !address.street || !address.zip) {
      const err = new Error(
        'Incomplete demographic profile. Legal name, date of birth, and address history ' +
        'are mandatory for IRS Pub 1345 dynamic identity proofing.'
      );
      err.code = 'failed-precondition';
      throw err;
    }

    const currentAttempt = (signerState.attemptsCount || 0) + 1;

    // 4. Dispatch to Provider Adapter
    const sessionRes = await this.provider.createSession({
      taxpayer: {
        firstName,
        lastName,
        dob,
        address,
        ssnFull: profile.ssnFull || null
      },
      context: {
        engagementId,
        signerRole,
        attemptNumber: currentAttempt,
        taxYear: kbaData.taxYear || 2026,
        returnUrl
      }
    });

    // 5. Atomic Firestore Persistence
    // Crucial: Only store reference IDs and statuses. NEVER store full SSNs, questions, or answers.
    const now = admin.firestore.FieldValue.serverTimestamp();
    await kbaRecordRef.set({
      engagementId,
      taxpayerUid: authUid,
      taxYear: kbaData.taxYear || 2026,
      updatedAt: now,
      [signerKey]: {
        ...signerState,
        status: KbaStatus.IN_PROGRESS,
        lastProviderSessionId: sessionRes.providerSessionId,
        lastSessionInitiatedAt: now,
        sessionExpiresAt: sessionRes.expiresAt,
        attemptsCount: currentAttempt,
        kba_locked: false,
        provider: this.provider.providerName
      }
    }, { merge: true });

    // 6. Return Minimal Safe Payload to Client
    return {
      success: true,
      providerSessionId: sessionRes.providerSessionId,
      sessionToken: sessionRes.sessionToken,
      clientLaunchUrl: sessionRes.clientLaunchUrl,
      expiresAt: sessionRes.expiresAt,
      maxDurationSeconds: StatutoryLimits.MAX_DURATION_SECONDS,
      attemptNumber: currentAttempt,
      attemptsRemaining: StatutoryLimits.MAX_ATTEMPTS - currentAttempt,
      signerRole
    };
  }

  /**
   * Processes a verified webhook event from an identity provider.
   * Enforces:
   * 1. Idempotent deduplication (stores event ID in kba_webhook_events)
   * 2. Verification session reference validation against existing engagement records
   * 3. Terminal state and out-of-order event protection (verified is never downgraded)
   * 4. State transition allowlist & statutory 2-attempt lockout
   * 5. Minimal audit logging (zero SSNs, questions, or identity documents)
   * 
   * @param {Object} eventData - Parsed event from provider.parseWebhookEvent()
   * @returns {Promise<{ success: boolean, httpStatus: number, status: string, message: string }>}
   */
  async processWebhookEvent(eventData) {
    const { eventId, eventType, providerSessionId, referenceId, normalizedStatus, completedAt } = eventData;

    if (!eventId) {
      return {
        success: false,
        httpStatus: 400,
        status: 'BAD_REQUEST',
        message: 'Missing required event identifier.'
      };
    }

    // 1. Idempotency Check: Prevent duplicate transitions or replay attacks
    const eventDocRef = this.db.collection('kba_webhook_events').doc(eventId);
    const eventDocSnap = await eventDocRef.get();
    if (eventDocSnap.exists) {
      const prevData = eventDocSnap.data();
      console.info(`[KbaSessionManager] Duplicate/replayed event ${eventId} already processed at ${prevData.processedAt}. Halting duplicate execution.`);
      return {
        success: true,
        httpStatus: 200,
        status: 'ALREADY_PROCESSED',
        eventId: eventId,
        message: 'Event was already processed idempotently.'
      };
    }

    // 2. Validate Session Reference Against Existing kba_records
    let querySnap = await this.db.collection('kba_records')
      .where('primary.lastProviderSessionId', '==', providerSessionId)
      .limit(1)
      .get();

    let signerRole = 'primary';
    if (querySnap.empty) {
      querySnap = await this.db.collection('kba_records')
        .where('spouse.lastProviderSessionId', '==', providerSessionId)
        .limit(1)
        .get();
      signerRole = 'spouse';
    }

    if (querySnap.empty && referenceId) {
      const parts = referenceId.split('_');
      const engagementId = parts[0];
      const directDoc = await this.db.collection('kba_records').doc(engagementId).get();
      if (directDoc.exists) {
        querySnap = { empty: false, docs: [directDoc] };
        signerRole = parts[1] === 'spouse' ? 'spouse' : 'primary';
      }
    }

    // Session reference must match an existing engagement
    if (querySnap.empty) {
      console.warn(`[KbaSessionManager] Unmatched session reference: providerSessionId ${providerSessionId} has no record in kba_records.`);
      return {
        success: false,
        httpStatus: 404,
        status: 'UNMATCHED_SESSION_REFERENCE',
        message: `No active engagement matches verification session ${providerSessionId}.`
      };
    }

    const docSnap = querySnap.docs[0];
    const engagementId = docSnap.id;
    const kbaData = docSnap.data();
    const signerState = kbaData[signerRole] || {};
    const currentStatus = signerState.status || KbaStatus.PENDING;

    const now = admin.firestore.FieldValue.serverTimestamp();

    // 3. Terminal State Guard: An existing VERIFIED state is immutable and can NEVER be overwritten
    if (currentStatus === KbaStatus.VERIFIED) {
      console.warn(`[KbaSessionManager] Stale/delayed event ${eventId} received for already verified engagement ${engagementId} (${signerRole}). Ignoring.`);
      await eventDocRef.set({
        eventId,
        providerSessionId,
        engagementId,
        eventType,
        processingTime: now,
        outcome: 'IGNORED_ALREADY_VERIFIED'
      });
      return {
        success: true,
        httpStatus: 200,
        status: 'IGNORED_ALREADY_VERIFIED',
        message: 'Signer is already verified. State is immutable.'
      };
    }

    // 4. Lockout Guard: An existing 2-attempt hard lockout cannot be downgraded to pending/in_progress
    if (signerState.kba_locked && [KbaStatus.PENDING, KbaStatus.IN_PROGRESS].includes(normalizedStatus)) {
      console.warn(`[KbaSessionManager] Stale event received for locked-out taxpayer ${engagementId}. Ignoring downgrade.`);
      await eventDocRef.set({
        eventId,
        providerSessionId,
        engagementId,
        eventType,
        processingTime: now,
        outcome: 'IGNORED_ALREADY_LOCKED_OUT'
      });
      return {
        success: true,
        httpStatus: 200,
        status: 'IGNORED_ALREADY_LOCKED_OUT',
        message: 'Statutory lockout is permanently enforced.'
      };
    }

    // 5. Out-of-Order Timestamp Guard
    if (signerState.lastCompletedAt && completedAt) {
      const lastTime = new Date(signerState.lastCompletedAt).getTime();
      const incomingTime = new Date(completedAt).getTime();
      if (!isNaN(lastTime) && !isNaN(incomingTime) && incomingTime < lastTime) {
        console.warn(`[KbaSessionManager] Out-of-order event rejected: incoming ${completedAt} is older than recorded ${signerState.lastCompletedAt}`);
        await eventDocRef.set({
          eventId,
          providerSessionId,
          engagementId,
          eventType,
          processingTime: now,
          outcome: 'IGNORED_OUT_OF_ORDER'
        });
        return {
          success: true,
          httpStatus: 200,
          status: 'IGNORED_OUT_OF_ORDER',
          message: 'Incoming event is older than existing state.'
        };
      }
    }

    // 6. Explicit State Transition Validation
    if (!isValidTransition(currentStatus, normalizedStatus)) {
      console.warn(
        `[KbaSessionManager] Illegal transition rejected: ${currentStatus} -> ${normalizedStatus} ` +
        `for engagement ${engagementId} (${signerRole})`
      );
      return {
        success: false,
        httpStatus: 422,
        status: 'INVALID_TRANSITION',
        message: `State transition from ${currentStatus} to ${normalizedStatus} is not permitted.`
      };
    }

    // 7. Atomic Mutation & Statutory 2-Attempt Enforcement
    const isVerified = normalizedStatus === KbaStatus.VERIFIED;
    const isFailed = normalizedStatus === KbaStatus.FAILED;
    const attemptsCount = signerState.attemptsCount || 1;
    const isLockout = isFailed && attemptsCount >= StatutoryLimits.MAX_ATTEMPTS;

    const updatePayload = {
      updatedAt: now,
      [`${signerRole}.status`]: normalizedStatus,
      [`${signerRole}.lastCompletedAt`]: completedAt || new Date().toISOString()
    };

    if (isVerified) {
      updatePayload[`${signerRole}.kba_locked`] = false;
      updatePayload[`${signerRole}.auditToken`] = providerSessionId;
      updatePayload[`${signerRole}.verifiedAt`] = now;
    } else if (isLockout) {
      updatePayload[`${signerRole}.kba_locked`] = true;
      updatePayload[`${signerRole}.lockoutReason`] = 'STATUTORY_2_ATTEMPT_LOCKOUT_IRS_PUB_1345';
      updatePayload[`${signerRole}.lockoutAt`] = now;
    }

    // Persist to Firestore atomically
    const batch = this.db.batch();
    batch.update(docSnap.ref, updatePayload);

    // Record Event in kba_webhook_events for Idempotency
    batch.set(eventDocRef, {
      eventId,
      verificationReference: providerSessionId,
      engagementId,
      signerRole,
      eventType,
      outcome: normalizedStatus,
      lockoutEnforced: isLockout,
      processingTime: now
    });

    // Record Immutable Statutory Audit Log Entry (3-Year WORM Custody under IRC § 6061)
    const auditRetentionExpiry = new Date(Date.UTC(Number(kbaData.taxYear || 2026) + 3, 9, 15, 23, 59, 59)).toISOString();
    const auditLogRef = this.db.collection('audit_logs').doc();
    batch.set(auditLogRef, {
      eventId,
      verificationReference: providerSessionId,
      eventType: isVerified ? 'KBA_VERIFIED' : (isLockout ? 'KBA_LOCKOUT_ENFORCED' : 'KBA_ATTEMPT_FAILED'),
      category: 'Identity Verification (IRS Pub 1345 § 5.2.2)',
      engagementId: engagementId,
      taxpayerUid: kbaData.taxpayerUid,
      signerRole: signerRole,
      status: normalizedStatus,
      attemptsCount: attemptsCount,
      kbaLocked: isLockout,
      provenance: 'authoritative_webhook',
      retentionExpiry: auditRetentionExpiry,
      processingTime: now
    });

    await batch.commit();

    console.info(
      `[KbaSessionManager] Webhook processed successfully: ${engagementId} (${signerRole}) -> ${normalizedStatus} ` +
      `(Lockout: ${isLockout})`
    );

    return {
      success: true,
      httpStatus: 200,
      status: normalizedStatus,
      lockoutEnforced: isLockout,
      message: 'State transition successfully recorded.'
    };
  }
}

module.exports = KbaSessionManager;

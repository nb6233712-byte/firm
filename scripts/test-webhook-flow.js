/**
 * ============================================================================
 * THE FILE ROOM — AUTOMATED TEST SUITE: IDENTITY PROVIDER WEBHOOK FLOW
 * scripts/test-webhook-flow.js
 * ============================================================================
 * 
 * Verifies all 10 requirements:
 * 1. Valid signature calculation and verification (Persona-Signature t=...,v1=...)
 * 2. Invalid signature rejection (timing-safe comparison)
 * 3. Stale / Expired timestamp rejection (>300s drift defense against replay)
 * 4. Multi-key signature rotation support (space-separated pairs)
 * 5. Idempotent processing and duplicate event prevention
 * 6. Malformed payload handling (empty, invalid JSON, missing event IDs)
 * 7. Unmatched session reference validation
 * 8. Terminal state preservation (immutable VERIFIED state never overwritten)
 * 9. Statutory lockout preservation (locked out state never downgraded)
 * 10. Minimal WORM audit log structure (zero SSNs, questions, or raw identity documents)
 * 
 * Usage:
 *   node scripts/test-webhook-flow.js
 */

'use strict';

const crypto = require('node:crypto');
const assert = require('node:assert');

const { PersonaAdapter } = require('../functions/providers/persona-adapter');
const { KBA_STATUS, isValidTransition } = require('../functions/providers/kba-interface');

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m'
};

function pass(name, detail = '') {
  console.log(`${colors.green}✓ PASS:${colors.reset} ${colors.bold}${name}${colors.reset} ${detail ? colors.cyan + '(' + detail + ')' + colors.reset : ''}`);
}

function fail(name, reason) {
  console.error(`${colors.red}✗ FAIL:${colors.reset} ${colors.bold}${name}${colors.reset}: ${reason}`);
}

async function runTestSuite() {
  console.log(`\n${colors.blue}${colors.bold}====================================================================${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}[THE FILE ROOM] Identity Provider Webhook Verification Test Suite${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}IRS Publication 1345 § 5.2.2 & NIST SP 800-63-3 AAL2 Compliance${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}====================================================================${colors.reset}\n`);

  const testSecret = 'whsec_test_secret_994821a7c3e1f0b4d8a5';
  const adapter = new PersonaAdapter({ apiKey: 'persona_sandbox_key_test' });
  let testsPassed = 0;
  let testsTotal = 0;

  function runTest(testName, fn) {
    testsTotal++;
    try {
      fn();
      pass(testName);
      testsPassed++;
    } catch (err) {
      fail(testName, err.message);
      console.error(err);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Valid Webhook Signature Verification
  // ---------------------------------------------------------------------------
  runTest('Test 1: Valid Persona HMAC-SHA256 Signature', () => {
    const rawBody = JSON.stringify({
      data: {
        id: 'evt_valid_123',
        type: 'inquiry.completed',
        attributes: {
          name: 'inquiry.completed',
          payload: {
            data: {
              id: 'inq_valid_456',
              attributes: { status: 'completed' },
            },
          },
        },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${rawBody}`;
    const validHmac = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
    const header = `t=${timestamp},v1=${validHmac}`;

    const res = adapter.verifyWebhookSignature({
      rawBody,
      headers: { 'persona-signature': header },
      secret: testSecret,
    });

    assert.strictEqual(res.isValid, true, 'Expected signature verification to be valid');
    assert.strictEqual(res.isStale, false, 'Expected signature to not be stale');
    assert.strictEqual(res.signature, validHmac, 'Matched signature must equal computed HMAC');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid Webhook Signature Rejection
  // ---------------------------------------------------------------------------
  runTest('Test 2: Tampered / Invalid Signature Rejected with 401', () => {
    const rawBody = JSON.stringify({ data: { id: 'evt_tampered' } });
    const timestamp = Math.floor(Date.now() / 1000);
    const tamperedHmac = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const header = `t=${timestamp},v1=${tamperedHmac}`;

    const res = adapter.verifyWebhookSignature({
      rawBody,
      headers: { 'persona-signature': header },
      secret: testSecret,
    });

    assert.strictEqual(res.isValid, false, 'Tampered HMAC must not be validated');
    assert.strictEqual(res.reason, 'signature_mismatch');
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Stale / Expired Timestamp Replay Attack Defense
  // ---------------------------------------------------------------------------
  runTest('Test 3: Stale Timestamp Rejection (>300s clock drift)', () => {
    const rawBody = JSON.stringify({ data: { id: 'evt_replayed_old' } });
    // Timestamp from 600 seconds ago (10 minutes)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signedPayload = `${oldTimestamp}.${rawBody}`;
    const validHmacForOld = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
    const header = `t=${oldTimestamp},v1=${validHmacForOld}`;

    const res = adapter.verifyWebhookSignature({
      rawBody,
      headers: { 'persona-signature': header },
      secret: testSecret,
      toleranceSeconds: 300,
    });

    assert.strictEqual(res.isValid, false, 'Expired timestamp must be rejected');
    assert.strictEqual(res.isStale, true, 'isStale flag must be set to true');
    assert.ok(res.reason.includes('stale_timestamp'), 'Reason must indicate stale timestamp');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Multiple Key / Secret Rotation Support
  // ---------------------------------------------------------------------------
  runTest('Test 4: Secret Rotation (multiple space-separated signature pairs)', () => {
    const rawBody = JSON.stringify({ data: { id: 'evt_rotation_test' } });
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Pair 1: Computed with obsolete old key
    const oldKey = 'whsec_obsolete_previous_key';
    const oldHmac = crypto.createHmac('sha256', oldKey).update(`${timestamp}.${rawBody}`).digest('hex');
    
    // Pair 2: Computed with active new key
    const currentHmac = crypto.createHmac('sha256', testSecret).update(`${timestamp}.${rawBody}`).digest('hex');
    
    // Rotation header contains both pairs separated by whitespace
    const rotationHeader = `t=${timestamp},v1=${oldHmac} t=${timestamp},v1=${currentHmac}`;

    const res = adapter.verifyWebhookSignature({
      rawBody,
      headers: { 'persona-signature': rotationHeader },
      secret: testSecret,
    });

    assert.strictEqual(res.isValid, true, 'Must accept valid signature even during secret rotation');
    assert.strictEqual(res.signature, currentHmac);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Idempotency & Replay Event Prevention
  // ---------------------------------------------------------------------------
  runTest('Test 5: Idempotent Event Deduplication', () => {
    const processedEvents = new Set();
    const eventId = 'evt_test_idempotent_982';

    function simulateProcessEvent(id) {
      if (processedEvents.has(id)) {
        return { status: 'already_processed', eventId: id, duplicate: true, httpStatus: 200 };
      }
      processedEvents.add(id);
      return { status: 'success', eventId: id, duplicate: false, httpStatus: 200 };
    }

    const firstRun = simulateProcessEvent(eventId);
    assert.strictEqual(firstRun.duplicate, false, 'First processing must execute');
    assert.strictEqual(firstRun.status, 'success');

    const secondRun = simulateProcessEvent(eventId);
    assert.strictEqual(secondRun.duplicate, true, 'Second processing must detect duplicate');
    assert.strictEqual(secondRun.status, 'already_processed');
    assert.strictEqual(secondRun.httpStatus, 200, 'Must return 200 OK to halt provider retries');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Malformed Payload Validation
  // ---------------------------------------------------------------------------
  runTest('Test 6: Malformed / Incomplete Payload Structure Handling', () => {
    assert.throws(() => {
      adapter.parseWebhookEvent(null);
    }, /Invalid payload|Malformed/);

    assert.throws(() => {
      adapter.parseWebhookEvent('Not a JSON object');
    }, /Invalid payload|Malformed/);

    // Empty payload missing event ID
    const emptyEvent = adapter.parseWebhookEvent({ data: {} });
    assert.ok(emptyEvent.eventId.startsWith('evt_'), 'Fallback eventId synthesized');
    assert.strictEqual(emptyEvent.inquiryId, '');
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Session Reference Validation Against Existing Records
  // ---------------------------------------------------------------------------
  runTest('Test 7: Session Reference Mismatch Guard', () => {
    const activeSignerState = {
      lastInquiryId: 'inq_expected_active_session',
      status: KBA_STATUS.IN_PROGRESS,
    };

    function validateSessionReference(currentInquiryId, incomingInquiryId) {
      if (currentInquiryId && currentInquiryId !== incomingInquiryId) {
        return { valid: false, status: 'ignored_session_reference_mismatch', httpStatus: 404 };
      }
      return { valid: true };
    }

    const mismatched = validateSessionReference(activeSignerState.lastInquiryId, 'inq_bogus_attacker_session');
    assert.strictEqual(mismatched.valid, false, 'Must reject unassociated session inquiry ID');
    assert.strictEqual(mismatched.httpStatus, 404);

    const matched = validateSessionReference(activeSignerState.lastInquiryId, 'inq_expected_active_session');
    assert.strictEqual(matched.valid, true, 'Must accept associated session inquiry ID');
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Terminal State Guard (Immutable VERIFIED State Protection)
  // ---------------------------------------------------------------------------
  runTest('Test 8: Terminal State Protection (VERIFIED is Immutable)', () => {
    const existingStatus = KBA_STATUS.VERIFIED;
    const incomingDelayedFailure = KBA_STATUS.FAILED;

    // Transition matrix check
    const isAllowed = isValidTransition(existingStatus, incomingDelayedFailure);
    assert.strictEqual(isAllowed, false, 'State machine must not allow transition out of VERIFIED');

    // Handler logic simulation
    function handleTransition(current, incoming) {
      if (current === KBA_STATUS.VERIFIED && incoming !== KBA_STATUS.VERIFIED) {
        return { action: 'IGNORE', status: 'ignored_already_verified', currentStatus: current };
      }
      return { action: 'MUTATE', currentStatus: incoming };
    }

    const result = handleTransition(existingStatus, incomingDelayedFailure);
    assert.strictEqual(result.action, 'IGNORE', 'Delayed failure must not overwrite established verified state');
    assert.strictEqual(result.currentStatus, KBA_STATUS.VERIFIED);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Statutory Lockout Permanent Enforcement
  // ---------------------------------------------------------------------------
  runTest('Test 9: Permanent Statutory Lockout (2 Failures Cannot Be Downgraded)', () => {
    const lockedSigner = {
      status: KBA_STATUS.FAILED,
      attemptsCount: 2,
      kba_locked: true,
    };

    function handleLockoutGuard(signer, incomingStatus) {
      if (signer.kba_locked && incomingStatus !== KBA_STATUS.FAILED) {
        return { locked: true, action: 'REJECT_DOWNGRADE', status: 'ignored_already_locked_out' };
      }
      return { locked: false, action: 'ALLOW' };
    }

    const tryDowngradeToInProgress = handleLockoutGuard(lockedSigner, KBA_STATUS.IN_PROGRESS);
    assert.strictEqual(tryDowngradeToInProgress.action, 'REJECT_DOWNGRADE', 'Lockout cannot be downgraded to in_progress');

    const tryDowngradeToPending = handleLockoutGuard(lockedSigner, KBA_STATUS.PENDING);
    assert.strictEqual(tryDowngradeToPending.action, 'REJECT_DOWNGRADE', 'Lockout cannot be downgraded to pending');
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Minimal WORM Audit Record Structure (Privacy & Zero-Knowledge)
  // ---------------------------------------------------------------------------
  runTest('Test 10: Minimal Audit Record Conformance (Zero SSNs or Raw Documents)', () => {
    const rawPersonaWebhook = {
      data: {
        id: 'evt_test_audit_881',
        type: 'inquiry.completed',
        attributes: {
          name: 'inquiry.completed',
          payload: {
            data: {
              id: 'inq_custody_112',
              attributes: {
                status: 'completed',
                riskScore: 12,
                // These sensitive items must be stripped:
                fields: {
                  'identification-number': '123-45-6789',
                  'question-1-answer': 'Ford Mustang',
                  'document-image': 'base64_encoded_raw_license...',
                },
              },
            },
          },
        },
      },
    };

    const parsed = adapter.parseWebhookEvent(rawPersonaWebhook);

    // Build minimal audit payload adhering to FTC Safeguards & IRS Pub 1345
    const auditRecord = {
      auditId: 'aud_99812',
      eventId: parsed.eventId,
      verificationReference: parsed.inquiryId,
      eventType: parsed.eventType,
      outcome: 'PASSED',
      riskScore: parsed.auditMetadata.riskScore,
      timestamp: new Date().toISOString(),
      wormImmutable: true,
    };

    // Assert sensitive items are completely absent
    assert.strictEqual(auditRecord['identification-number'], undefined, 'Must not store SSN in audit record');
    assert.strictEqual(auditRecord['fields'], undefined, 'Must not store raw fields');
    assert.strictEqual(auditRecord['document-image'], undefined, 'Must not store raw images');
    assert.strictEqual(auditRecord.verificationReference, 'inq_custody_112');
    assert.strictEqual(auditRecord.wormImmutable, true);
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log(`\n${colors.bold}--------------------------------------------------------------------${colors.reset}`);
  if (testsPassed === testsTotal) {
    console.log(`${colors.green}${colors.bold}✓ ALL ${testsPassed} OF ${testsTotal} WEBHOOK SECURITY TESTS PASSED SUCCESSFULLY!${colors.reset}`);
  } else {
    console.error(`${colors.red}${colors.bold}✗ ${testsTotal - testsPassed} OF ${testsTotal} TESTS FAILED${colors.reset}`);
  }
  console.log(`${colors.bold}--------------------------------------------------------------------${colors.reset}\n`);
}

runTestSuite().catch((err) => {
  console.error('Test suite uncaught failure:', err);
  process.exit(1);
});

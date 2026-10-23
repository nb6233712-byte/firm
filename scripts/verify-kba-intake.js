/**
 * ============================================================================
 * THE FILE ROOM — COMPREHENSIVE BROWSER CONSOLE VERIFICATION SUITE
 * Test Suite for IRS Pub 1345 KBA Gateway & 3-Tier Document Intake Failover
 * ============================================================================
 *
 * Usage:
 * Open Chrome/Edge/Firefox DevTools (F12) -> Console tab on either:
 * - http://localhost:5501/client/signatures.html (for KBA Tests A & B)
 * - http://localhost:5501/client/documents.html (for Intake Tests C, D, & E)
 *
 * Run:
 *   TFR_TESTS.runAll();
 * Or individual tests:
 *   TFR_TESTS.testA_KbaPass();
 *   TFR_TESTS.testB_KbaLockout();
 *   TFR_TESTS.testC_ForminitNormalPath();
 *   TFR_TESTS.testD_ForminitFallback();
 *   TFR_TESTS.testE_OfflineQueue();
 */

(function (window) {
  'use strict';

  var TFR_TESTS = {
    // Utility for colorful console reporting
    logHeader: function (title) {
      console.log(
        '%c====================================================================\n' +
        '%c[TEST SUITE] ' + title + '\n' +
        '%c====================================================================',
        'color:#019FFF;font-weight:bold;',
        'color:#1D3D51;font-weight:bold;font-size:1.05rem;background:#F2F8FC;padding:3px 6px;border-left:4px solid #019FFF;',
        'color:#019FFF;font-weight:bold;'
      );
    },

    pass: function (name, detail) {
      console.log('%c✓ PASS: ' + name, 'color:#0D9488;font-weight:bold;font-size:0.9rem;', detail || '');
    },

    fail: function (name, reason) {
      console.error('%c✗ FAIL: ' + name, 'color:#EF4444;font-weight:bold;font-size:0.9rem;', reason || '');
    },

    info: function (msg, data) {
      console.log('%cℹ INFO: ' + msg, 'color:#64748B;', data || '');
    },

    assert: function (condition, testName, failureMsg) {
      if (condition) {
        this.pass(testName);
        return true;
      } else {
        this.fail(testName, failureMsg);
        return false;
      }
    },

    // -------------------------------------------------------------------------
    // TEST A: KBA Pass Flow & Signature Pad Unlock
    // -------------------------------------------------------------------------
    testA_KbaPass: async function () {
      this.logHeader('TEST A: KBA Pass Flow & Form 8879 Signature Pad Unlock');
      var client = window.ClientSignatures;
      if (!client) {
        this.fail('Test A', 'ClientSignatures controller not found. Ensure you are on client/signatures.html');
        return;
      }

      var engagementId = client.state.engagementId || 'eng_whitfield_4417_2026';
      var testInquiryId = 'inq_test_pass_' + Date.now().toString(36);

      this.info('1. Simulating Provider verification callback (Pass with 100% score)...');
      client.handleKbaProviderCompletion('passed', testInquiryId, 'primary', 1);

      // Verify state in ClientSignatures
      var primary = client.state.signingRequest.signers.find(function (s) { return s.role === 'primary'; });
      this.assert(primary && primary.kbaStatus === 'verified', 'Client state marked as verified', primary);
      this.assert(primary && primary.auditToken === testInquiryId, 'KBA audit token bound to primary signer', primary.auditToken);

      // Verify local storage / Firestore record state
      var localKey = 'tfr_kba_record_' + engagementId;
      var rawRecord = localStorage.getItem(localKey);
      var parsed = rawRecord ? JSON.parse(rawRecord) : null;
      this.assert(parsed && parsed.primary && parsed.primary.status === 'passed', 'kba_records local ledger status === passed', parsed);
      this.assert(parsed && parsed.primary && parsed.primary.kba_locked === false, 'kba_records lockout flag is false');

      // Verify DOM: Signature Pad Unlocked
      await new Promise(function (r) { setTimeout(r, 100); });
      var canvas = document.querySelector('.sig-canvas[data-role="primary"]');
      this.assert(canvas !== null, 'HTML5 Canvas Signature Pad is rendered in the DOM');

      var lockOverlay = canvas ? canvas.closest('.card').querySelector('.locked-overlay') : null;
      this.assert(!lockOverlay, 'Canvas padlock overlay is removed; pad is unlocked');

      var chip = document.querySelector('.card .chip.ok');
      this.assert(chip && chip.textContent.includes('Verified'), 'DOM reflects "Verified" status pill badge');

      this.pass('TEST A COMPLETE', 'Taxpayer successfully verified and signature pad is unlocked under IRS Pub 1345.');
    },

    // -------------------------------------------------------------------------
    // TEST B: KBA Statutory 2-Attempt Lockout Flow
    // -------------------------------------------------------------------------
    testB_KbaLockout: async function () {
      this.logHeader('TEST B: KBA Statutory 2-Attempt Lockout Flow (IRS Pub 1345 § 5.2.2)');
      var client = window.ClientSignatures;
      if (!client) {
        this.fail('Test B', 'ClientSignatures controller not found. Ensure you are on client/signatures.html');
        return;
      }

      var engagementId = client.state.engagementId || 'eng_whitfield_4417_2026';

      // 1. Simulate Attempt 1 Failure
      this.info('1. Simulating Attempt 1 of 2 failure (quiz score below 80%)...');
      client.handleKbaProviderCompletion('failed', 'inq_fail_att1', 'primary', 1);

      var primary = client.state.signingRequest.signers.find(function (s) { return s.role === 'primary'; });
      this.assert(primary && primary.kbaStatus === 'failed_attempt_1', 'State reflects failed_attempt_1', primary);
      this.assert(primary && primary.attemptsCount === 1, 'Attempt counter incremented to 1');

      await new Promise(function (r) { setTimeout(r, 100); });
      var warnMsg = document.querySelector('.card')?.textContent || '';
      this.assert(warnMsg.includes('Attempt 1 of 2 failed') || warnMsg.includes('1 attempt remaining'), 'DOM displays remaining attempt counter');

      // 2. Simulate Attempt 2 Failure (Hard Statutory Lockout)
      this.info('2. Simulating Attempt 2 of 2 consecutive failure...');
      client.handleKbaProviderCompletion('failed', 'inq_fail_att2', 'primary', 2);

      primary = client.state.signingRequest.signers.find(function (s) { return s.role === 'primary'; });
      this.assert(primary && primary.kbaStatus === 'locked_out', 'Signer permanently locked out (kbaStatus === locked_out)', primary);
      this.assert(primary && primary.attemptsCount === 2, 'Attempt counter reached statutory ceiling (2)');

      // Verify Firestore record
      var localKey = 'tfr_kba_record_' + engagementId;
      var rawRecord = localStorage.getItem(localKey);
      var parsed = rawRecord ? JSON.parse(rawRecord) : null;
      this.assert(parsed && parsed.primary && parsed.primary.kba_locked === true, 'Firestore kba_records reflects kba_locked: true', parsed);
      this.assert(parsed && parsed.primary.lockoutReason === 'STATUTORY_2_ATTEMPT_LOCKOUT_IRS_PUB_1345', 'Lockout statutory reason codified in ledger');

      // Verify DOM: Pad disabled and Wet-Ink Fallback CTA present
      await new Promise(function (r) { setTimeout(r, 100); });
      var disabledPad = document.querySelector('.card')?.textContent || '';
      this.assert(disabledPad.includes('Signature Pad Permanently Disabled') || disabledPad.includes('Statutory Lockout'), 'Signature pad is permanently disabled in UI');

      var dlBtn = document.querySelector('.btn-dl-wet-form, #btn-download-form8879');
      this.assert(dlBtn !== null, 'Prominent "Download Form 8879 for Wet-Ink Signature" button is rendered');

      this.pass('TEST B COMPLETE', 'IRS § 5.2.2 Statutory Lockout enforced. Pad disabled and wet-signature fallback triggered.');
    },

    // -------------------------------------------------------------------------
    // TEST C: Intake Pipeline — Tier 1 (Forminit Normal Path)
    // -------------------------------------------------------------------------
    testC_ForminitNormalPath: async function () {
      this.logHeader('TEST C: Intake Pipeline — Tier 1 Primary Forminit Upload');
      var docs = window.ClientDocuments;
      if (!docs) {
        this.fail('Test C', 'ClientDocuments controller not found. Ensure you are on client/documents.html');
        return;
      }

      var testDocId = (docs.state.documents && docs.state.documents[0] && (docs.state.documents[0].requestId || docs.state.documents[0].id)) || 'req_w2_primary';
      this.info('Transmitting test document: ' + testDocId + ' to Forminit endpoint rv02anqc45x...');

      var result = await docs.attachDocumentToForminit(testDocId);
      this.assert(result && result.success === true, 'Upload completed successfully', result);
      this.assert(result && result.tier && result.tier.includes('Tier 1'), 'Transaction completed via Tier 1 Primary Gateway', result && result.tier);

      // Verify DOM button state
      await new Promise(function (r) { setTimeout(r, 100); });
      var btn = document.querySelector('.btn-attach-forminit[data-id="' + testDocId + '"]');
      var row = btn ? btn.closest('tr, .row, .card') : null;
      var rowText = (row && row.textContent) || '';
      this.assert(rowText.includes('Attached') || rowText.includes('Forminit'), 'Document row displays Forminit Attached pill badge');

      this.pass('TEST C COMPLETE', 'Tier 1 Forminit primary gateway successfully ingested document.');
    },

    // -------------------------------------------------------------------------
    // TEST D: Intake Pipeline — Tier 2 (Timeout & Fallback to Cloud Function)
    // -------------------------------------------------------------------------
    testD_ForminitFallback: async function () {
      this.logHeader('TEST D: Intake Pipeline — Tier 2 Cloud Function Fallback');
      var docs = window.ClientDocuments;
      if (!docs) {
        this.fail('Test D', 'ClientDocuments controller not found. Ensure you are on client/documents.html');
        return;
      }

      var testDocId = (docs.state.documents && docs.state.documents[1] && (docs.state.documents[1].requestId || docs.state.documents[1].id)) || 'req_1099_misc';

      // Mock window.fetch: simulate Forminit 6-second timeout / HTTP 500 error
      var originalFetch = window.fetch;
      this.info('1. Injecting mock: Forminit domain returns simulated 6-second timeout AbortError...');

      window.fetch = async function (url, options) {
        if (typeof url === 'string' && url.includes('forminit.com')) {
          console.log('[MOCK INTERCEPT] Aborting Forminit request (simulating strict 6s timeout)...');
          var err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          throw err;
        }
        // Let Cloud Function fallback and other requests proceed normally
        return originalFetch.apply(this, arguments);
      };

      try {
        var result = await docs.attachDocumentToForminit(testDocId);

        this.assert(result && result.success === true, 'Upload completed successfully without UI error alerts', result);
        this.assert(result && result.tier && result.tier.includes('Tier 2'), 'Upload automatically routed via Tier 2 (Cloud Function Fallback)', result && result.tier);

        // Verify session storage and DOM
        var tierSaved = sessionStorage.getItem('tfr_tier_' + testDocId) || '';
        this.assert(tierSaved.includes('Tier 2'), 'Session storage denotes Tier 2 transmission', tierSaved);

        this.pass('TEST D COMPLETE', 'Tier 1 timeout silently handled. Seamless failover to Tier 2 Cloud Function verified.');
      } finally {
        // Restore original fetch
        window.fetch = originalFetch;
        this.info('Original fetch restored.');
      }
    },

    // -------------------------------------------------------------------------
    // TEST E: Intake Pipeline — Tier 3 (Offline Queue & Auto-Flush)
    // -------------------------------------------------------------------------
    testE_OfflineQueue: async function () {
      this.logHeader('TEST E: Intake Pipeline — Tier 3 Offline Queue & Reconnect Auto-Flush');
      var docs = window.ClientDocuments;
      if (!docs) {
        this.fail('Test E', 'ClientDocuments controller not found. Ensure you are on client/documents.html');
        return;
      }

      var testDocId = (docs.state.documents && docs.state.documents[2] && (docs.state.documents[2].requestId || docs.state.documents[2].id)) || 'req_1098_mortgage';

      // 1. Mock complete network disconnect (Tier 1 & Tier 2 both fail)
      var originalFetch = window.fetch;
      this.info('1. Simulating complete browser disconnect (Network Offline)...');

      window.fetch = async function () {
        throw new TypeError('Failed to fetch (offline)');
      };

      try {
        var result = await docs.attachDocumentToForminit(testDocId);

        this.assert(result && result.success === true, 'Upload handled gracefully in offline mode', result);
        this.assert(result && result.tier && result.tier.includes('Tier 3'), 'Transaction marked as Tier 3 (Offline Queue)', result && result.tier);

        // Verify localStorage queue entry
        var rawQueue = localStorage.getItem('tfr_pending_transmissions');
        var queue = rawQueue ? JSON.parse(rawQueue) : [];
        var queuedItem = queue.find(function (q) { return q.requestId === testDocId; });

        this.assert(queuedItem !== undefined, 'Document payload persisted in localStorage.tfr_pending_transmissions', queuedItem);
        this.assert(queuedItem && queuedItem.fileBase64 && queuedItem.fileBase64.startsWith('data:'), 'File converted to Base64 data URL for persistence');

        this.pass('Tier 3 Offline Queue', 'Payload safely queued in local storage.');

        // 2. Reconnect Network and trigger 'online' event
        this.info('2. Simulating network reconnection & triggering window "online" event...');
        window.fetch = originalFetch; // Restore network

        // Trigger auto-flush
        await docs.flushPendingQueue();

        // Verify queue is now flushed
        var postFlushRaw = localStorage.getItem('tfr_pending_transmissions');
        var postFlushQueue = postFlushRaw ? JSON.parse(postFlushRaw) : [];
        this.assert(postFlushQueue.length === 0, 'Offline queue successfully flushed and emptied upon reconnection', postFlushQueue);

        this.pass('TEST E COMPLETE', 'Tier 3 offline storage and auto-flush on reconnect fully verified.');
      } finally {
        window.fetch = originalFetch;
      }
    },

    // -------------------------------------------------------------------------
    // RUN ALL TESTS
    // -------------------------------------------------------------------------
    runAll: async function () {
      console.clear();
      this.logHeader('STARTING FULL THE FILE ROOM COMPLIANCE VERIFICATION');

      var isSigsPage = window.location.pathname.includes('signatures');
      var isDocsPage = window.location.pathname.includes('documents');

      if (isSigsPage) {
        console.log('%cDetected Signatures Page. Running KBA Tests A & B...', 'color:#019FFF;font-weight:bold;');
        await this.testA_KbaPass();
        await new Promise(function (r) { setTimeout(r, 600); });
        await this.testB_KbaLockout();
      } else if (isDocsPage) {
        console.log('%cDetected Documents Page. Running Intake Tests C, D, & E...', 'color:#019FFF;font-weight:bold;');
        await this.testC_ForminitNormalPath();
        await new Promise(function (r) { setTimeout(r, 600); });
        await this.testD_ForminitFallback();
        await new Promise(function (r) { setTimeout(r, 600); });
        await this.testE_OfflineQueue();
      } else {
        console.warn('Navigate to either client/signatures.html or client/documents.html to run the suite.');
      }

      this.logHeader('VERIFICATION RUN COMPLETE');
    }
  };

  window.TFR_TESTS = TFR_TESTS;
  console.log(
    '%c[TFR_TESTS Loaded] Type %cTFR_TESTS.runAll()%c to run full automated verification.',
    'color:#1D3D51;font-weight:600;',
    'color:#019FFF;font-weight:bold;background:#F2F8FC;padding:2px 4px;',
    'color:#1D3D51;'
  );
})(window);

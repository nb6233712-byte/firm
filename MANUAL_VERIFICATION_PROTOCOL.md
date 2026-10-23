# THE FILE ROOM: KBA & INTAKE PIPELINE VERIFICATION PROTOCOL
**Regulatory Scope**: IRS Publication 1345 § 5.2.2, FTC Safeguards Rule 16 C.F.R. § 314.4, IRC § 7216

---

## 1. Executive Summary & Verification Architecture

This protocol validates the hardened two-pillar compliance architecture in **The File Room**:
1. **IRS Pub 1345 Compliant KBA Verification Gateway**:
   - Dynamic 3–5 question quiz integration with 2-minute timer and 80% passing threshold.
   - Real-time Firestore ledger updates under `kba_records/{engagementId}`.
   - Statutory 2-attempt maximum lockout rule with canvas signature pad lock and wet-ink Form 8879 fallback.
2. **3-Tier Resilient Document Intake Pipeline**:
   - **Tier 1 (Primary)**: Direct Forminit endpoint `https://forminit.com/f/rv02anqc45x` with strict 6s `AbortController` timeout.
   - **Tier 2 (Secondary Fallback)**: Silent automatic failover to Cloud Function `/intakeDocumentFallback` streaming directly into Cloud Storage (`gs://uk-client-d90d5.appspot.com`) with magic byte verification and Firestore audit ledger.
   - **Tier 3 (Offline Queue)**: Resilient client-side Base64 persistence in `localStorage.tfr_pending_transmissions` with auto-flush on browser `window.online` event.

---

## 2. Test Harness Access & Quick Run

The automated test harness is available in [scripts/verify-kba-intake.js](file:///c:/Users/user/Desktop/firm/scripts/verify-kba-intake.js) and is loaded in both `client/signatures.html` and `client/documents.html`.

### Quick Execution Commands in DevTools Console (F12)
```javascript
// Run all tests applicable to the active page:
TFR_TESTS.runAll();

// Or run individual tests:
await TFR_TESTS.testA_KbaPass();            // Signatures Page
await TFR_TESTS.testB_KbaLockout();         // Signatures Page
await TFR_TESTS.testC_ForminitNormalPath();  // Documents Page
await TFR_TESTS.testD_ForminitFallback();    // Documents Page
await TFR_TESTS.testE_OfflineQueue();       // Documents Page
```

---

## 3. Detailed Test Protocols

### Test A: KBA Pass Flow & Signature Pad Unlock
- **Target Page**: `http://localhost:5501/client/signatures.html` (or `http://localhost:5500/signatures.html`)
- **Protocol**:
  1. Open DevTools (`F12`) -> **Console**.
  2. Execute:
     ```javascript
     await TFR_TESTS.testA_KbaPass();
     ```
  3. **Verification Checklist**:
     - [ ] **State**: `ClientSignatures.state.signingRequest.signers[0].kbaStatus === 'verified'`.
     - [ ] **Token**: `primary.auditToken` is bound to the inquiry ID.
     - [ ] **Storage / Ledger**: `localStorage.getItem('tfr_kba_record_eng_whitfield_4417_2026')` contains `status: "passed"` and `kba_locked: false`.
     - [ ] **DOM Canvas**: Padlock overlay is removed; HTML5 canvas is active and accepts mouse/touch drawing.
     - [ ] **Pill Badge**: Displays green status `Verified`.

---

### Test B: KBA Statutory 2-Attempt Lockout Flow
- **Target Page**: `http://localhost:5501/client/signatures.html`
- **Protocol**:
  1. Open DevTools -> **Console**.
  2. Execute:
     ```javascript
     await TFR_TESTS.testB_KbaLockout();
     ```
  3. **Verification Checklist**:
     - [ ] **Attempt 1**: Console logs failure; DOM displays counter: `"Attempt 1 of 2 failed. You have 1 attempt remaining."`
     - [ ] **Attempt 2**: State switches to `locked_out` with statutory reason `STATUTORY_2_ATTEMPT_LOCKOUT_IRS_PUB_1345`.
     - [ ] **Firestore Record**: `kba_records` contains `kba_locked: true` and `attemptsCount: 2`.
     - [ ] **Canvas Padlock**: Signature pad canvas is permanently disabled with notice: `"Statutory Lockout — IRS Pub 1345 § 5.2.2 requires wet-ink signature"`.
     - [ ] **Wet-Ink Fallback**: Download button `Download Form 8879 for Wet-Ink Signature` renders prominently in the card.

---

### Test C: Intake Pipeline — Tier 1 (Forminit Normal Path)
- **Target Page**: `http://localhost:5501/client/documents.html` (or `http://localhost:5500/documents.html`)
- **Protocol**:
  1. Open DevTools -> **Network** tab (filter by `forminit.com`).
  2. In **Console**, execute:
     ```javascript
     await TFR_TESTS.testC_ForminitNormalPath();
     ```
  3. **Verification Checklist**:
     - [ ] **Network Request**: POST to `https://forminit.com/f/rv02anqc45x` returns HTTP `200` or `201`.
     - [ ] **Result Object**: `{ success: true, tier: "Tier 1 (Forminit Primary Gateway)" }`.
     - [ ] **DOM Table Row**: Status badge updates to `Attached (Forminit)` with green checkmark.

---

### Test D: Intake Pipeline — Tier 2 (Timeout & Fallback to Cloud Function)
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**:
  1. In **Console**, execute:
     ```javascript
     await TFR_TESTS.testD_ForminitFallback();
     ```
  2. **How it Works**: The test injects a temporary proxy into `window.fetch` to intercept any URL matching `forminit.com` and simulate an `AbortError` (representing the strict 6-second timeout).
  3. **Verification Checklist**:
     - [ ] **Silent Catch**: No error dialogs or alarms appear on the taxpayer's screen.
     - [ ] **Seamless Failover**: Network tab logs POST to `/intakeDocumentFallback`.
     - [ ] **Result Object**: `{ success: true, tier: "Tier 2 (Cloud Function Fallback)" }`.
     - [ ] **Session Audit**: `sessionStorage.getItem('tfr_tier_req_1099_misc')` contains `"Tier 2 (Cloud Function Fallback)"`.

---

### Test E: Intake Pipeline — Tier 3 (Offline Queue & Auto-Flush)
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**:
  1. In **Console**, execute:
     ```javascript
     await TFR_TESTS.testE_OfflineQueue();
     ```
  2. **Manual DevTools Verification (Alternative)**:
     - Open DevTools -> **Network** tab -> toggle throttling dropdown from **No throttling** to **Offline**.
     - Click **Attach Document to Forminit** on any needed document.
     - Inspect **Application** -> **Local Storage** -> key `tfr_pending_transmissions`. Notice the queued object with `fileBase64` data URL.
     - Switch DevTools throttling back to **No throttling** (Online).
     - Notice console message: `[Offline Flusher] Client online. Flushing 1 queued document(s)...`
     - Verify `tfr_pending_transmissions` is cleared (`[]`).
  3. **Verification Checklist**:
     - [ ] Offline submission returns gracefully with `tier: "Tier 3 (Offline Queue)"`.
     - [ ] Document file is converted to a base64 Data URL and held in `localStorage.tfr_pending_transmissions`.
     - [ ] Reconnecting fires `window.online` listener which invokes `flushPendingQueue()`, successfully processing the transmission.

---

### Test F: Intake Pipeline — HTTP 500 Retryable Server Error
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testF_Http500Fallback();`
- **Verification Checklist**:
  - [ ] Forminit HTTP 500 detected as retryable server error.
  - [ ] Seamlessly routes to Tier 2 Cloud Function fallback.
  - [ ] Result denotes `Tier 2 (Automatic Fallback - Cloud Function)` and `downstreamDelivery: "fallback_delivered"`.

---

### Test G: Intake Pipeline — HTTP 429 Rate Limit Handling
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testG_Http429RateLimitFallback();`
- **Verification Checklist**:
  - [ ] Forminit HTTP 429 with `Retry-After` header detected.
  - [ ] Failover to authenticated Cloud Function fallback per documented retry guidance.
  - [ ] Result denotes `Tier 2 (Automatic Fallback - Cloud Function)`.

---

### Test H: Intake Pipeline — Permanent HTTP 4xx Client Errors (Non-Retryable)
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testH_PermanentHttp4xxNoFallback();`
- **Verification Checklist**:
  - [ ] Forminit HTTP 415/400 identified as non-retryable permanent client error.
  - [ ] Pipeline does NOT route to fallback or mark as delivered.
  - [ ] Returns `{ success: false, permanentError: true, downstreamDelivery: "failed" }`.

---

### Test I: Intake Pipeline — Duplicate Submissions & Idempotency Guard
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testI_DuplicateSubmissionIdempotency();`
- **Verification Checklist**:
  - [ ] Repeated submission of same document generates identical stable idempotency key.
  - [ ] Fallback backend acknowledges existing intake (`idempotentReplay: true`) without creating duplicate records.

---

### Test J: Intake Pipeline — Fallback Failure Handling
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testJ_FallbackFailureHandling();`
- **Verification Checklist**:
  - [ ] When both Primary and Fallback fail, failure is reported accurately.
  - [ ] `downstreamDelivery` is tracked as `failed` without false positive success flags.

---

### Test K: Security & Tenant Isolation Enforcement
- **Target Page**: `http://localhost:5501/client/documents.html`
- **Protocol**: `await TFR_TESTS.testK_TenantOwnershipSecurity();`
- **Verification Checklist**:
  - [ ] Document with foreign client UID rejected with `security/tenant-boundary-violation`.
  - [ ] Pipeline halts immediately before attempting storage or transmission.

---

### Automated CLI Test Execution:
```bash
cd functions
npm test
# OR directly from project root:
node --test tests/document-intake-resilience.test.js
```

# The File Room — Role-Based Access Control (RBAC) & 403 Intercept Manual Test Script

**Statutory Authority**: IRS Circular 230 § 10.29 & FTC Safeguards Rule § 314.4  
**Test Environment**: Local Live Server (`http://localhost:5501` for Firm Console, `http://localhost:5500` for Client Portal)

---

## Pre-Flight Checklist

1. Ensure Live Server is serving the application on port `5501` (Firm) and/or `5500` (Client).
2. Open an Incognito / Private browser window to avoid stale session cookies.
3. Open DevTools (**F12**) &rarr; Console tab to monitor `[AuthGuard]` and `[Auth]` events.

---

## Test Suite Matrix

### Test Case 1: Taxpayer Sign-In & Client Portal Access (Success)

* **Objective**: Verify that signing in with a standard Google account (`@gmail.com`) defaults to the `'client'` role and grants access to taxpayer document pages while blocking firm operational routes.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **1.1** | Navigate to `http://localhost:5500/client/login.html`. | Client login screen loads with "Client Portal — Sign In" header. | Status is 200 OK. |
| **1.2** | Click **"Continue with Google"** and authenticate using a test Google account (e.g. `taxpayer.test@gmail.com`). | OAuth popup closes; session token is written to storage. | Console logs `[Auth] Google OAuth Verified. Entering Client Portal...` |
| **1.3** | Verify automatic redirect. | Browser automatically redirects to `/client/documents.html`. | URL bar reflects `http://localhost:5500/client/documents.html`. |
| **1.4** | In DevTools Console, inspect session: `JSON.parse(localStorage.getItem('tfr_user_session'))`. | Session object contains: <br>• `role: "client"`<br>• `isStaff: false`<br>• `isAuthenticated: true` | Client role is established without admin privileges. |
| **1.5** | Confirm UI components. | Tax intake categories (Form W-2, 1099, 1098) render; upload dropzones are interactive. | No firm administrative controls or client lists are visible. |

---

### Test Case 2: Client Navigates to `/dashboard.html` &rarr; 403 Forbidden Intercept (Success)

* **Objective**: Confirm that an active taxpayer session attempting to access the Firm Operations Console is immediately stopped by `js/auth-guard.js` before any sensitive tax data or client ledgers render.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **2.1** | With the client session active from Test 1, type `http://localhost:5501/dashboard.html` into the URL bar and press **Enter**. | `js/auth-guard.js` intercepts page evaluation before dashboard DOM paints. | Page content is replaced with security intercept barrier. |
| **2.2** | Inspect security intercept screen. | A dedicated full-page 403 card displays: <br>• **"403 Forbidden: Authorized Practitioners Only"**<br>• Statutory citation: *IRS Circular 230 § 10.29 & FTC Safeguards Rule § 314.4*<br>• Credential indicator: *Your active credential (taxpayer.test@gmail.com) is authenticated as a Taxpayer / Client.* | Circular 230 statutory notice is prominently visible. |
| **2.3** | Check DevTools Console. | Log reads: `[AuthGuard] Access denied to firm area for role: client`. | No privileged Firestore listeners (`subscribeFirmOperations`) are invoked. |
| **2.4** | Click the button: **"Return to My Client Dashboard"**. | Browser smoothly navigates back to `http://localhost:5500/client/dashboard.html`. | Client session remains intact; no session corruption occurs. |

---

### Test Case 3: Firm Staff Sign-In & Document Review Ledger (Success)

* **Objective**: Confirm that an authorized CPA or Partner account bypasses the 403 gate and loads the firm operations ledger.

#### Option A: Dynamic Role Grant via Admin Console Utility
If testing with a personal `@gmail.com` that should have CPA permissions:
1. Open DevTools Console on `http://localhost:5501/login.html`.
2. Run:
   ```javascript
   window.grantStaffRole("cpa.user@gmail.com", "firm_admin", "Eleanor Vance, CPA", "P01984210");
   ```
3. Sign in via Google with `cpa.user@gmail.com`.

#### Option B: Managing CPA Launcher
1. On `http://localhost:5501/login.html`, click **"Demo as Managing CPA"**.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **3.1** | Observe navigation after firm authentication. | Browser redirects to `http://localhost:5501/dashboard.html`. | URL reflects firm operations console. |
| **3.2** | Inspect `localStorage.getItem('tfr_user_session')` in Console. | Object contains: <br>• `role: "firm_admin"` (or `"firm_preparer"`)<br>• `isStaff: true`<br>• `mfaVerified: true` | Practitioner credentials verified. |
| **3.3** | Check Document Review Ledger. | Review queue displays client returns (e.g. *Brennan LLC*, *Michael Whitfield*) with e-file statuses, intake counts, and review badges. | Full practitioner interface renders without any 403 obstruction. |
| **3.4** | Click sidebar navigation (*Clients*, *Returns*, *Billing*, *Audit Log*). | Each page loads seamlessly with practitioner breadcrumbs and controls. | All `/firm/` subroutes allow access. |

---

### Test Case 4: Client Upload & Dual-State Feedback (Distinguishing Upload vs Delivery)

* **Objective**: Confirm client UI explicitly distinguishes upload success (Cloud Storage vaulting & reference persistence) from downstream delivery success.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **4.1** | On `http://localhost:5500/client/documents.html`, click a synthetic test PDF chip (e.g., **"W-2 (Halstead Media)"**). | Document uploads to Cloud Storage vault. | Toast displays: `✓ Storage Vault Custody Confirmed (AES-256)`. |
| **4.2** | Inspect the document row widget in DevTools and UI. | Dual status widget renders two distinct tiers: <br>1. **Storage Vault**: `✓ Vaulted (AES-256)`<br>2. **Downstream Delivery**: `⏳ Queued for Delivery` | Upload success is distinct from downstream delivery state. |
| **4.3** | Verify Firestore document in `/document_delivery_queue/{jobId}`. | Job record contains all 6 metadata fields: `attemptCount: 0`, `nextAttemptAt`, `idempotencyKey`, `status: "queued"`, `createdAt`, `updatedAt`. | Document reference persisted before queue dispatch. |

---

### Test Case 5: Browser Closure & Ephemeral Recovery Resilience

* **Objective**: Confirm that `localStorage` and `sessionStorage` are treated as temporary recovery aids only and that clearing browser data does not affect authoritative Firestore state.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **5.1** | Enqueue a delivery job via `DocumentDeliveryClient.enqueueDelivery(...)`. | Job is stored in Firestore and ephemeral recovery key is written to `sessionStorage` with disclaimer. | `sessionStorage` contains disclaimer: *"TEMPORARY CLIENT CRASH-RECOVERY AID ONLY. NOT AUTHORITATIVE TAXPAYER DOCUMENT CUSTODY."* |
| **5.2** | Close browser tab or execute in Console: `localStorage.clear(); sessionStorage.clear();`. | Client-side cache is completely cleared. | Local storage is empty. |
| **5.3** | Re-open browser to `http://localhost:5500/client/documents.html` and query Firestore directly. | Authoritative record in `document_delivery_queue` remains completely intact and uncorrupted. | Zero data loss in authoritative queue; confirms system does not rely on localStorage for custody. |

---

### Test Case 6: Offline Mode & Online Transition Recovery

* **Objective**: Confirm offline client queuing transitions gracefully to online synchronization without duplicating records.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **6.1** | In DevTools Network tab, switch throttling to **"Offline"**. | Browser enters simulated offline mode. | `navigator.onLine === false`. |
| **6.2** | Attempt to attach or upload a tax document. | Document draft persists in ephemeral client recovery aid with non-authoritative warning. | Status indicates offline draft saved. |
| **6.3** | In DevTools Network tab, switch back to **"Online"** (or fire `window.dispatchEvent(new Event('online'))`). | Automatic flusher detects network restoration and pushes queued documents to Cloud Storage vault and Firestore queue. | Toast displays: `✓ All queued documents synchronized with Cloud Storage!`. |

---

### Test Case 7: Worker Concurrency, Mutual Exclusion & Restart/Crash Recovery

* **Objective**: Confirm two workers cannot acquire the same job simultaneously, and expired leases from crashed workers are safely reclaimed.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **7.1** | Worker 1 acquires lease: `acquireJobLease(db, jobId, 'worker_1', { leaseDurationMs: 60000 })`. | Lease granted: `acquired: true`, `status: "processing"`, `leaseOwner: "worker_1"`. | Job is locked for 60 seconds. |
| **7.2** | Worker 2 attempts concurrent acquisition: `acquireJobLease(db, jobId, 'worker_2')`. | Lease rejected: `acquired: false`, `reason: "CONCURRENT_WORKER_LEASE_ACTIVE"`. | Mutual exclusion enforced; no concurrent duplicate processing. |
| **7.3** | Simulate Worker 1 crashing without completing the job. Advance time past lease expiration (T > +60s). | Supervisor runs `reclaimStaleLeases(db)`. | Expired lease reclaimed: job status reset to `retry_pending` with `ERROR_CATEGORY.LEASE_EXPIRED`. |
| **7.4** | Worker 3 (surviving instance) attempts lease acquisition. | Lease granted to `worker_3` with incremented attempt count. | Crash recovery confirmed without operator intervention. |

---

### Test Case 8: Duplicate Event Idempotency & Replay Protection

* **Objective**: Confirm duplicate delivery requests or repeated webhook retries do not create duplicate records.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **8.1** | Enqueue job with idempotency key `idemp_test_duplicate_check`. | New job record created with `isExisting: false`. | Collection contains 1 document. |
| **8.2** | Trigger duplicate enqueue with identical parameters and key. | Returns `isExisting: true`, acknowledging existing job without adding duplicate documents. | Collection still contains exactly 1 document. |
| **8.3** | Verify downstream HTTP headers. | Request includes `X-Idempotency-Key` and `fi-text-idempotencyKey`. | Downstream endpoint deduplicates repeated payloads. |

---

### Test Case 9: Retry Budget Exhaustion & Dead-Letter Escalation (`needs_review`)

* **Objective**: Confirm that jobs exceeding their max attempt budget transition to Dead-Letter status and generate practitioner audit alerts.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **9.1** | Create a delivery job with `maxAttempts: 3` and target an unstable endpoint returning HTTP 503. | Job fails attempts 1 and 2 with `retry_pending` and exponential backoff with jitter. | Next attempt timestamps scheduled with backoff. |
| **9.2** | Execute attempt 3 failure (HTTP 503). | Status transitions to `needs_review` (Dead-Letter Queue); `lastErrorCategory: "RETRY_BUDGET_EXHAUSTED"`. | Automated retries stop. |
| **9.3** | Inspect `/audit_logs` in Firestore or Firm Operations Console. | High-priority audit record generated: `Delivery Queue: Retry Budget Exhausted (Dead Letter)` flagged for staff review. | Circular 230 review notification generated. |
| **9.4** | Check firm dashboard (`dashboard.html` and `documents.html`). | Dead-letter badge increments; item appears under **"⚠ Needs Review"** filter with amber highlight. | Prominently displayed to practitioners. |

---

### Test Case 10: Authorized Firm Staff Controlled Manual Recovery

* **Objective**: Confirm authorized firm practitioners can inspect dead-letter items, provide a compliance justification, and safely reset them to `queued`.

| Step | Action | Expected Output | Verification Point |
| :--- | :--- | :--- | :--- |
| **10.1** | Sign in as CPA (`denise@pivot-aide.tax`) and navigate to `http://localhost:5501/documents.html`. | Document delivery queue displays dead-letter item. | Retry button is enabled for dead-letter item. |
| **10.2** | Click **"↻ Retry"** on the dead-letter item. | Modal opens prompting for Circular 230 § 10.22 compliance justification. | Justification textarea is mandatory. |
| **10.3** | Submit justification: *"Downstream service restored and tested; re-enqueuing under CPA oversight."* | Job status transitions to `queued`; `maxAttempts` granted +3; `leaseOwner` cleared. | Status chip turns gold: `⏳ QUEUED`. |
| **10.4** | Check `/audit_logs`. | Immutable audit record committed: `action: "Document Delivery Manual Retry Authorized"`, logging staff UID, justification, and timestamp. | Full statutory compliance audit trail established. |

---

## Test Results Sign-Off

- [ ] **Test Case 1 (Taxpayer Client Access)**: Passed
- [ ] **Test Case 2 (Circular 230 403 Intercept)**: Passed
- [ ] **Test Case 3 (Practitioner Ledger Access)**: Passed
- [ ] **Test Case 4 (Dual-State Feedback - Vault vs Delivery)**: Passed
- [ ] **Test Case 5 (Browser Closure & Ephemeral Recovery)**: Passed
- [ ] **Test Case 6 (Offline Mode Transition Recovery)**: Passed
- [ ] **Test Case 7 (Worker Mutual Exclusion & Crash Reclamation)**: Passed
- [ ] **Test Case 8 (Duplicate Event Idempotency)**: Passed
- [ ] **Test Case 9 (Dead-Letter Queue Escalation)**: Passed
- [ ] **Test Case 10 (Controlled Manual Recovery & Audit Trail)**: Passed


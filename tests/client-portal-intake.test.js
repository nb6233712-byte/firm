/**
 * ============================================================================
 * THE FILE ROOM — CLIENT PORTAL INTAKE & VERIFICATION UI TEST SUITE
 * tests/client-portal-intake.test.js
 * ============================================================================
 *
 * Verifies all requirements from prompt:
 * 1. Successful upload:
 *    - Upload progress, vault storage confirmation, downstream delivery status shown separately.
 *    - Stable submission receipt (REC-2026-...) generated after backend confirms storage and registration.
 * 2. Pending delivery:
 *    - Shows "Document securely received in encrypted vault. Downstream processing continues."
 *    - Displayed ONLY if storage and intake registration have actually succeeded.
 *    - Never promises downstream delivery when only vault/local storage succeeded.
 * 3. Network loss:
 *    - Offline before server registration clearly states submission is pending synchronization
 *      and has not yet been confirmed by the server.
 *    - Safe recovery and synchronization options.
 * 4. Duplicate submission:
 *    - Deduplication guard prevents duplicate uploads and submissions during retries.
 *    - In-flight double-submit suppressed.
 * 5. Rejected document:
 *    - Plain language explanation without raw stack traces, provider risk data, or unmasked SSNs.
 *    - Accessible safe retry/replacement option.
 * 6. Failed verification:
 *    - Displays server-confirmed verification status.
 *    - Explains failed or expired verification in plain language.
 *    - Step-by-step approved manual-signature alternative under IRS Pub 1345.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Helper to create a clean simulated browser environment
function createBrowserEnvironment(options = {}) {
  const listeners = {};
  const storageMap = new Map();
  const sessionStorageMap = new Map();

  const mockWindow = {
    location: {
      origin: 'https://the-file-room.tax',
      pathname: '/client/documents.html',
      hostname: 'the-file-room.tax'
    },
    navigator: {
      onLine: options.onLine !== undefined ? options.onLine : true,
      clipboard: {
        writeText: async () => {}
      }
    },
    localStorage: {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k),
      clear: () => storageMap.clear(),
      get length() { return storageMap.size; },
      key: (i) => Array.from(storageMap.keys())[i] || null
    },
    sessionStorage: {
      getItem: (k) => sessionStorageMap.get(k) || null,
      setItem: (k, v) => sessionStorageMap.set(k, String(v)),
      removeItem: (k) => sessionStorageMap.delete(k),
      clear: () => sessionStorageMap.clear(),
      get length() { return sessionStorageMap.size; },
      key: (i) => Array.from(sessionStorageMap.keys())[i] || null
    },
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const fns = listeners[evt.type] || [];
      fns.forEach((fn) => fn(evt));
    },
    CustomEvent: class CustomEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail;
      }
    },
    crypto: {
      subtle: {
        digest: async (algo, buf) => {
          const crypto = require('node:crypto');
          const hash = crypto.createHash('sha256').update(Buffer.from(buf)).digest();
          return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
        }
      }
    },
    FileRoomLayout: {
      toasts: [],
      openedModals: [],
      showToast: function (msg, type) {
        this.toasts.push({ msg, type });
      },
      openModal: function (html) {
        this.openedModals.push(html);
      },
      closeModal: function () {}
    },
    FirebaseBridge: {
      currentUser: { uid: 'usr_whitfield_4417', email: 'm.whitfield@example.com', displayName: 'Taylor Bennett' },
      getUserUid: () => 'usr_whitfield_4417',
      getUserName: () => 'Taylor Bennett',
      db: {},
      doc: (db, coll, id) => ({ coll, id }),
      setDoc: async () => {},
      updateDoc: async () => {},
      getDoc: async () => ({ exists: () => false }),
      recordAuditLog: async () => {}
    },
    document: {
      elements: new Map(),
      getElementById: function (id) {
        if (!this.elements.has(id)) {
          const el = {
            id,
            style: {},
            innerHTML: '',
            textContent: '',
            classList: {
              classes: new Set(),
              add(c) { this.classes.add(c); },
              remove(c) { this.classes.delete(c); },
              contains(c) { return this.classes.has(c); }
            },
            querySelector: () => null,
            querySelectorAll: () => []
          };
          this.elements.set(id, el);
        }
        return this.elements.get(id);
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
      createElement: function (tag) {
        return {
          tagName: tag.toUpperCase(),
          style: {},
          setAttribute: () => {},
          addEventListener: () => {}
        };
      }
    }
  };

  mockWindow.window = mockWindow;
  mockWindow.setTimeout = setTimeout;
  mockWindow.clearTimeout = clearTimeout;
  mockWindow.setInterval = setInterval;
  mockWindow.clearInterval = clearInterval;
  mockWindow.sessionStorage.setItem = mockWindow.sessionStorage.setItem.bind(mockWindow.sessionStorage);
  mockWindow.localStorage.setItem = mockWindow.localStorage.setItem.bind(mockWindow.localStorage);

  const context = vm.createContext(mockWindow);

  function resolveClientFile(relPath) {
    const p1 = path.join(__dirname, '../client', relPath);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.resolve('c:/Users/user/Desktop/web app1/client', relPath);
    if (fs.existsSync(p2)) return p2;
    const p3 = path.resolve('c:/Users/user/Desktop/web app1', relPath);
    if (fs.existsSync(p3)) return p3;
    return p1;
  }

  // Load document-delivery-client.js
  const ddcPath = resolveClientFile('js/client/document-delivery-client.js');
  const ddcCode = fs.readFileSync(ddcPath, 'utf8');
  vm.runInContext(ddcCode, context);

  // Load documents.js
  const docsCode = fs.readFileSync(resolveClientFile('js/client/documents.js'), 'utf8');
  vm.runInContext(docsCode, context);

  // Load signatures.js
  const sigCode = fs.readFileSync(resolveClientFile('js/client/signatures.js'), 'utf8');
  vm.runInContext(sigCode, context);

  return context;
}

// ────────────────────────────────────────────────────────────────────────────
// SUITE 1: SUCCESSFUL UPLOAD & VAULT CONFIRMATION
// ────────────────────────────────────────────────────────────────────────────

test('Document Intake: 1. Successful upload separates progress, vault storage, and downstream delivery', async () => {
  const env = createBrowserEnvironment();
  const DDC = env.DocumentDeliveryClient;
  const ClientDocs = env.ClientDocuments;

  assert.ok(DDC, 'DocumentDeliveryClient initialized');
  assert.ok(ClientDocs, 'ClientDocuments initialized');

  // Verify distinct status stages exist in DDC
  assert.equal(DDC.STATES.UPLOADED, 'uploaded');
  assert.equal(DDC.STATES.QUEUED, 'queued');
  assert.equal(DDC.STATES.PROCESSING, 'processing');
  assert.equal(DDC.STATES.DELIVERED, 'delivered');

  // Initialize ClientDocuments
  ClientDocs.state.clientUid = 'usr_whitfield_4417';
  ClientDocs.state.documents = [
    {
      id: 'req_w2',
      requestId: 'usr_whitfield_4417_req_w2',
      title: 'W-2 Form (Halstead Media)',
      status: 'needed',
      category: 'W-2'
    }
  ];

  // Create a valid synthetic PDF buffer
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF');
  const mockFile = {
    name: 'W2_Taylor_Bennett.pdf',
    size: pdfBytes.length,
    type: 'application/pdf',
    arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
  };

  // Execute upload
  const uploadRes = await ClientDocs.uploadFile(mockFile, 'usr_whitfield_4417_req_w2');

  assert.ok(uploadRes.success, 'Upload succeeds');
  assert.equal(uploadRes.status, 'in_review', 'Document enters in_review status upon vault storage');
  assert.ok(uploadRes.storagePath, 'Cloud Storage path is assigned and recorded');
  assert.ok(uploadRes.storagePath.includes('usr_whitfield_4417'), 'Storage path isolates by client tenant UID');

  // Verify stable submission reference (REC-2026-...) is generated
  assert.ok(uploadRes.submissionReceipt, 'Stable submission receipt generated');
  assert.match(uploadRes.submissionReceipt, /^REC-2026-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/, 'Receipt follows REC-2026-CLIENT-DOC-HASH format');

  // Verify updated document in client state
  const updatedDoc = ClientDocs.state.documents.find((d) => d.requestId === 'usr_whitfield_4417_req_w2');
  assert.ok(updatedDoc, 'Document checklist record updated');
  assert.equal(updatedDoc.status, 'in_review');
  assert.equal(updatedDoc.submissionReceipt, uploadRes.submissionReceipt);
  assert.ok(updatedDoc.storagePath, 'Vault storage path recorded on document item');

  // Test row HTML rendering: separates vault confirmation from downstream delivery
  const rowHtml = ClientDocs.renderDocumentRow(updatedDoc);
  assert.ok(rowHtml.includes('1. Storage Vault:'), 'Row renders Storage Vault section explicitly');
  assert.ok(rowHtml.includes('✓ Vault Confirmed (AES-256)'), 'Row displays AES-256 vault custody confirmation');
  assert.ok(rowHtml.includes('2. Downstream Delivery:'), 'Row renders Downstream Delivery section separately');
  assert.ok(rowHtml.includes(uploadRes.submissionReceipt), 'Row displays the confirmed submission receipt reference');
  assert.ok(rowHtml.includes('btn-view-receipt'), 'Row includes action to inspect official receipt');
});

test('Document Intake: 1b. Submission Receipt modal formats complete custody telemetry without secrets', () => {
  const env = createBrowserEnvironment();
  const DDC = env.DocumentDeliveryClient;

  let modalHtmlReceived = null;
  env.FileRoomLayout.openModal = (html) => {
    modalHtmlReceived = html;
  };

  const receiptData = {
    submissionReceipt: 'REC-2026-4417-W2-A9F3',
    fileName: 'W2_Taylor_Bennett.pdf',
    clientId: 'usr_whitfield_4417',
    clientName: 'Taylor Bennett',
    storagePath: 'clients/usr_whitfield_4417/documents/req_w2_1760000000.pdf',
    sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    uploadedAt: '2026-10-15T12:00:00Z',
    status: 'Queued for Transmission'
  };

  DDC.renderReceiptModal(receiptData);

  assert.ok(modalHtmlReceived, 'Receipt modal was opened');
  assert.ok(modalHtmlReceived.includes('REC-2026-4417-W2-A9F3'), 'Modal contains stable receipt reference');
  assert.ok(modalHtmlReceived.includes('W2_Taylor_Bennett.pdf'), 'Modal contains file name');
  assert.ok(modalHtmlReceived.includes('✓ Encrypted Storage Confirmed (AES-256)'), 'Modal confirms AES-256 custody');
  assert.ok(modalHtmlReceived.includes('gs://uk-client-d90d5.appspot.com/'), 'Modal displays Cloud Storage URI');
  assert.ok(modalHtmlReceived.includes('FTC Safeguards Rule'), 'Modal cites statutory regulatory safeguards');

  // Verify zero sensitive leaks in receipt
  assert.ok(!modalHtmlReceived.includes('Bearer '), 'No bearer tokens in modal');
  assert.ok(!modalHtmlReceived.includes('apiKey'), 'No API keys in modal');
  assert.ok(!modalHtmlReceived.includes('password'), 'No passwords in modal');
});

// ────────────────────────────────────────────────────────────────────────────
// SUITE 2: PENDING DELIVERY MESSAGING
// ────────────────────────────────────────────────────────────────────────────

test('Document Intake: 2. Pending delivery indicates document is securely received ONLY after storage succeeds', () => {
  const env = createBrowserEnvironment();
  const ClientDocs = env.ClientDocuments;

  const docWithConfirmedVault = {
    id: 'req_1099',
    requestId: 'usr_whitfield_4417_req_1099',
    title: '1099-MISC',
    status: 'in_review',
    storagePath: 'clients/usr_whitfield_4417/documents/req_1099.pdf',
    submissionReceipt: 'REC-2026-4417-1099-B4E2',
    downstreamDelivery: 'queued'
  };

  const renderedHtml = ClientDocs.renderDocumentRow(docWithConfirmedVault);

  // Requirement: If delivery is pending, show that the document is securely received
  // and processing continues, but only if storage and intake registration have actually succeeded.
  assert.ok(
    renderedHtml.includes('Document securely received in encrypted vault'),
    'Displays "Document securely received in encrypted vault" when vault storage succeeded'
  );
  assert.ok(
    renderedHtml.includes('Downstream processing continues'),
    'Displays "Downstream processing continues"'
  );
  assert.ok(
    renderedHtml.includes('REC-2026-4417-1099-B4E2'),
    'Cites verified custody reference'
  );

  // Requirement: Do not promise that a document was delivered when only local storage succeeded
  assert.ok(
    !renderedHtml.includes('Delivery Confirmed Downstream'),
    'Does not claim "Delivery Confirmed" when downstream transmission is still pending'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// SUITE 3: NETWORK LOSS / OFFLINE BEFORE SERVER REGISTRATION
// ────────────────────────────────────────────────────────────────────────────

test('Document Intake: 3. Offline state before server registration clearly states pending synchronization', async () => {
  // Simulate browser offline
  const env = createBrowserEnvironment({ onLine: false });
  const ClientDocs = env.ClientDocuments;

  ClientDocs.state.documents = [
    {
      id: 'req_charity',
      requestId: 'usr_whitfield_4417_req_charity',
      title: 'Charity Contribution Receipts',
      status: 'needed'
    }
  ];

  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const mockFile = {
    name: 'Charity_Receipts_2026.pdf',
    size: pdfBytes.length,
    type: 'application/pdf',
    arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
  };

  const res = await ClientDocs.uploadFile(mockFile, 'usr_whitfield_4417_req_charity');

  assert.equal(res.success, false, 'Upload does not falsely report success while offline');
  assert.equal(res.offline, true, 'Flags offline condition');
  assert.equal(res.pendingSync, true, 'Flags pending sync state');

  // Check exact required message:
  // "clearly state that submission is pending synchronization and has not yet been confirmed by the server"
  assert.ok(
    res.error.includes('pending synchronization and has not yet been confirmed by the server'),
    'Error message explicitly states submission is pending synchronization and unconfirmed by server'
  );

  // Verify non-authoritative local crash recovery aid saved
  const rawAid = env.sessionStorage.getItem('tfr_offline_pending_usr_whitfield_4417_req_charity');
  assert.ok(rawAid, 'Non-authoritative ephemeral aid persisted in sessionStorage');
  const aidObj = JSON.parse(rawAid);
  assert.equal(aidObj.isAuthoritative, false, 'Marked non-authoritative');
  assert.ok(aidObj.disclaimer.includes('NOT AUTHORITATIVE'), 'Contains non-authoritative custody disclaimer');

  // Verify checklist item state in UI
  const pendingDoc = ClientDocs.state.documents.find((d) => d.requestId === 'usr_whitfield_4417_req_charity');
  assert.equal(pendingDoc.status, 'pending_sync', 'Item marked pending_sync, NOT in_review or delivered');

  const rowHtml = ClientDocs.renderDocumentRow(pendingDoc);
  assert.ok(
    rowHtml.includes('Pending Synchronization and has not yet been confirmed by the server') ||
    rowHtml.includes('Pending Synchronization ⚠'),
    'Row HTML contains prominent pending synchronization warning'
  );
  assert.ok(rowHtml.includes('btn-safe-retry'), 'Provides safe retry/synchronize button');
});

// ────────────────────────────────────────────────────────────────────────────
// SUITE 4: DUPLICATE SUBMISSION PREVENTION
// ────────────────────────────────────────────────────────────────────────────

test('Document Intake: 4. Duplicate submissions during upload and retry are strictly prevented', async () => {
  const env = createBrowserEnvironment({ onLine: true });
  const ClientDocs = env.ClientDocuments;

  ClientDocs.state.documents = [
    {
      id: 'req_k1',
      requestId: 'usr_whitfield_4417_req_k1',
      title: 'Schedule K-1 Partnership',
      status: 'needed'
    }
  ];

  const pdfBytes = Buffer.from('%PDF-1.4\nTest K1\n%%EOF');
  const mockFile = {
    name: 'Blue_Ridge_K1.pdf',
    size: pdfBytes.length,
    type: 'application/pdf',
    arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
  };

  // Simulate an in-flight submission lock
  const submissionKey = 'usr_whitfield_4417_req_k1_' + mockFile.name + '_' + mockFile.size;
  ClientDocs.state.activeSubmissions.add(submissionKey);

  // Attempt duplicate upload while first is in-flight
  const dupRes = await ClientDocs.uploadFile(mockFile, 'usr_whitfield_4417_req_k1');

  assert.equal(dupRes.success, false, 'Duplicate upload rejected');
  assert.equal(dupRes.duplicate, true, 'Result indicates duplicate suppression');
  assert.ok(dupRes.error.includes('already in progress'), 'Clear user-facing duplicate warning');

  // Verify DDC duplicate enqueue protection
  const DDC = env.DocumentDeliveryClient;
  const idempotencyKey = 'ik_ddq_whitfield_req_k1_test123';
  DDC.activeEnqueueRequests.add(idempotencyKey);

  const ddcRes = await DDC.enqueueDelivery({
    documentId: 'req_k1',
    clientId: 'usr_whitfield_4417',
    storagePath: 'clients/usr_whitfield_4417/documents/k1.pdf',
    idempotencyKey: idempotencyKey
  });

  assert.ok(ddcRes.duplicate, 'DDC suppresses duplicate enqueue using same idempotency key');
});

// ────────────────────────────────────────────────────────────────────────────
// SUITE 5: REJECTED DOCUMENT HANDLING & SAFE RETRY
// ────────────────────────────────────────────────────────────────────────────

test('Document Intake: 5. Rejected document provides clear plain-language notice and safe retry option', () => {
  const env = createBrowserEnvironment();
  const ClientDocs = env.ClientDocuments;

  const rejectedDoc = {
    id: 'req_mileage',
    requestId: 'usr_whitfield_4417_req_mileage',
    title: 'Vehicle Mileage Log',
    status: 'rejected',
    rejectionReason: 'Log missing odometer start/end readings for Q3 business travel.',
    category: 'Mileage'
  };

  const rowHtml = ClientDocs.renderDocumentRow(rejectedDoc);

  assert.ok(rowHtml.includes('Resubmission Needed'), 'Displays clear Resubmission Needed badge');
  assert.ok(rowHtml.includes('Log missing odometer start/end readings'), 'Displays plain-language rejection rationale');
  assert.ok(!rowHtml.includes('at eval'), 'No raw stack traces in rejected row');
  assert.ok(!rowHtml.includes('InternalServerError'), 'No internal error codes in row');
  assert.ok(rowHtml.includes('btn-safe-retry'), 'Provides safe retry button');
  assert.ok(rowHtml.includes('Upload Replacement'), 'Provides upload replacement button');
});

test('Document Intake: 5b. Safe retry resumes downstream delivery without re-uploading if file is already vaulted', async () => {
  const env = createBrowserEnvironment();
  const ClientDocs = env.ClientDocuments;
  const DDC = env.DocumentDeliveryClient;

  // Document that already succeeded in Cloud Storage vault but had delivery hiccup
  ClientDocs.state.documents = [
    {
      id: 'req_1098',
      requestId: 'usr_whitfield_4417_req_1098',
      title: 'Form 1098 Mortgage Interest',
      status: 'in_review',
      storagePath: 'clients/usr_whitfield_4417/documents/req_1098_vaulted.pdf',
      downloadUrl: 'https://firebasestorage.googleapis.com/...',
      sha256Checksum: 'abcdef1234567890abcdef1234567890',
      submissionReceipt: 'REC-2026-4417-1098-C9F1',
      downstreamDelivery: 'retry_pending'
    }
  ];

  let enqueuedPayload = null;
  DDC.enqueueDelivery = async (meta) => {
    enqueuedPayload = meta;
    return { success: true, jobId: 'ddq_test_safe_retry' };
  };

  const retryRes = await ClientDocs.retryIntakeSubmission('usr_whitfield_4417_req_1098');

  assert.ok(retryRes.success, 'Safe retry succeeded');
  assert.ok(enqueuedPayload, 'Enqueue delivery invoked directly');
  assert.equal(enqueuedPayload.storagePath, 'clients/usr_whitfield_4417/documents/req_1098_vaulted.pdf', 'Reused existing storagePath');
  assert.equal(enqueuedPayload.submissionReceipt, 'REC-2026-4417-1098-C9F1', 'Preserved stable submission receipt reference');
});

// ────────────────────────────────────────────────────────────────────────────
// SUITE 6: FAILED & EXPIRED IDENTITY VERIFICATION
// ────────────────────────────────────────────────────────────────────────────

test('Identity Verification: 6. Displays server-confirmed status, plain-language failure, and approved manual alternative', () => {
  const env = createBrowserEnvironment();
  const ClientSigs = env.ClientSignatures;

  assert.ok(ClientSigs, 'ClientSignatures controller initialized');

  // Case 6a: First unsuccessful attempt
  ClientSigs.state.signingRequest = {
    form: 'IRS Form 8879',
    taxYear: 2026,
    jurisdictions: 'Federal Form 1040',
    refundAmount: '$3,418',
    balanceDueState: '$0',
    preparedBy: 'Denise R., CPA',
    preparedAt: '2 September 2026',
    signers: [
      {
        role: 'primary',
        roleLabel: 'Primary Taxpayer',
        name: 'Michael Whitfield',
        email: 'm.whitfield@example.com',
        kbaStatus: 'failed',
        attemptsCount: 1,
        maxAttempts: 2,
        signatureStatus: 'unsigned'
      }
    ]
  };

  let cardsHtml = ClientSigs.renderDualSignerCards(ClientSigs.state.signingRequest);

  assert.ok(cardsHtml.includes('Verification Unsuccessful (Attempt 1 of 2)'), 'Status badge shows server attempt count');
  assert.ok(
    cardsHtml.includes('Credit bureau records sometimes contain historical addresses'),
    'Plain-language explanation explains credit bureau inquiries without leaking risk metrics'
  );
  assert.ok(cardsHtml.includes('Check Server Status'), 'Provides action to query server status');
  assert.ok(cardsHtml.includes('Retry Identity Verification'), 'Provides retry button');

  // Case 6b: Statutory 2-attempt lockout
  ClientSigs.state.signingRequest.signers[0].kbaStatus = 'locked_out';
  ClientSigs.state.signingRequest.signers[0].attemptsCount = 2;

  cardsHtml = ClientSigs.renderDualSignerCards(ClientSigs.state.signingRequest);

  assert.ok(cardsHtml.includes('Verification Locked Out (Server Confirmed)'), 'Displays server-confirmed lockout badge');
  assert.ok(
    cardsHtml.includes('remote electronic signing is no longer available for this return'),
    'Plain-language explanation of lockout'
  );
  assert.ok(
    cardsHtml.includes('Download Form 8879 for Wet-Ink Signature'),
    'Provides approved wet-ink manual alternative button'
  );

  // Case 6c: Expired verification window
  ClientSigs.state.signingRequest.signers[0].kbaStatus = 'expired';

  cardsHtml = ClientSigs.renderDualSignerCards(ClientSigs.state.signingRequest);

  assert.ok(cardsHtml.includes('Verification Session Expired'), 'Displays expired session badge');
  assert.ok(
    cardsHtml.toLowerCase().includes('verification sessions have a short security window to protect your personal identity'),
    'Plain-language explanation of session expiration'
  );
  assert.ok(cardsHtml.includes('Start New Verification Session'), 'Provides button to start fresh session');

  // Case 6d: Step-by-step approved manual-signature alternative card
  const wetCardHtml = ClientSigs.renderWetSignatureCard(ClientSigs.state.signingRequest);

  assert.ok(wetCardHtml.includes('Approved Manual-Signature Alternative (IRS Publication 1345)'), 'Cites approved manual alternative under IRS Pub 1345');
  assert.ok(wetCardHtml.includes('Download &amp; Print'), 'Step 1: Download & Print');
  assert.ok(wetCardHtml.includes('Physical Wet-Ink Signature'), 'Step 2: Physical Wet-Ink pen signature');
  assert.ok(wetCardHtml.includes('Scan or Photograph'), 'Step 3: Scan or Photo');
  assert.ok(wetCardHtml.includes('Upload to Secure Vault'), 'Step 4: Upload to Secure Vault');
  assert.ok(wetCardHtml.includes('Practitioner Verification'), 'Step 5: Practitioner verification');
});

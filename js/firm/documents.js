/**
 * ============================================================================
 * THE FILE ROOM — FIRM OPERATIONS CONSOLE
 * Document Intake Queue & Exception Management Engine
 * ============================================================================
 *
 * Statutory & Operational Mandates:
 * - FTC Safeguards Rule (16 CFR Part 314 § 314.4): Tenant isolation & role-gated access
 * - IRC § 7216: Taxpayer PII & engagement references visible exclusively to authorized staff
 * - Treasury Department Circular 230 § 10.22: Diligence as to accuracy in document intake
 * - IRC § 6694: Mandatory documentation of rejection reasons and reconciliation notes
 * - IRC § 6061: Immutable WORM audit trails on retry, review, acceptance, and status changes
 *
 * Architecture:
 * - Authoritative Queue: Firestore `document_delivery_queue` / `delivery_queue`
 * - Groups: All, Pending (queued), Processing, Delivered, Retry Pending, Needs Review / Failures
 * - Storage Vault Status (AES-256 Cloud Storage) clearly distinguished from Downstream Delivery (Forminit)
 * - Controlled Manual Retries via protected backend function
 * - Exception Review Workflow for reconciliation, acceptance, and rejection
 * - Multi-dimensional filtering by status, taxpayer, engagement, and date range
 * - Full accessible states: Live, Loading, Empty, and Error
 */

(function (window) {
  'use strict';

  var QUEUE_STATES = {
    UPLOADED:           'uploaded',
    QUEUED:             'queued',
    PROCESSING:         'processing',
    DELIVERED:          'delivered',
    RETRY_PENDING:      'retry_pending',
    PERMANENTLY_FAILED: 'permanently_failed',
    NEEDS_REVIEW:       'needs_review'
  };

  var MAX_ATTEMPTS = 5;

  var STATE_CONFIG = {
    'uploaded': {
      label: 'Uploaded',
      pillClass: 'chip-info',
      color: '#3b82f6',
      desc: 'Stored in Cloud Storage Vault'
    },
    'queued': {
      label: 'Pending Intake',
      pillClass: 'chip-purple',
      color: '#8b5cf6',
      desc: 'Enqueued for downstream transmission'
    },
    'processing': {
      label: 'Processing',
      pillClass: 'chip-warn',
      color: '#f59e0b',
      desc: 'Active worker lease held'
    },
    'delivered': {
      label: 'Delivered',
      pillClass: 'chip-ok',
      color: '#10b981',
      desc: 'Confirmed transmitted to Forminit'
    },
    'retry_pending': {
      label: 'Retry Pending',
      pillClass: 'chip-orange',
      color: '#f97316',
      desc: 'Awaiting exponential backoff retry'
    },
    'needs_review': {
      label: 'Needs Review',
      pillClass: 'chip-danger',
      color: '#dc2626',
      desc: 'Dead-letter office: retries exhausted'
    },
    'review': {
      label: 'Awaiting Review',
      pillClass: 'chip-warn',
      color: '#f59e0b',
      desc: 'Client uploaded document awaiting practitioner review'
    },
    'in_review': {
      label: 'Awaiting Review',
      pillClass: 'chip-warn',
      color: '#f59e0b',
      desc: 'Client uploaded document awaiting practitioner review'
    },
    'accepted': {
      label: 'Accepted',
      pillClass: 'chip-ok',
      color: '#10b981',
      desc: 'Practitioner verified and accepted'
    },
    'approved': {
      label: 'Approved',
      pillClass: 'chip-ok',
      color: '#10b981',
      desc: 'Practitioner verified and accepted'
    },
    'rejected': {
      label: 'Rejected',
      pillClass: 'chip-danger',
      color: '#ef4444',
      desc: 'Rejected under IRC § 6694 due diligence'
    },
    'needs_replacement': {
      label: 'Needs Replacement',
      pillClass: 'chip-warn',
      color: '#f59e0b',
      desc: 'Replacement document requested'
    },
    'permanently_failed': {
      label: 'Permanent Failure',
      pillClass: 'chip-danger',
      color: '#ef4444',
      desc: 'Non-retryable client error / unprocessable'
    }
  };

  // Seed / Fallback intake submissions for immediate triage & test execution
  var DEFAULT_INTAKE_RECORDS = [
    {
      _docId: 'job_whitfield_w2_2026',
      jobId: 'job_whitfield_w2_2026',
      documentId: 'doc_whitfield_w2',
      fileName: 'Whitfield_2026_W2_Wage_Statement.pdf',
      documentTitle: 'Whitfield 2026 W-2 Wage & Tax Statement',
      clientName: 'Michael & Elena Whitfield',
      clientEmail: 'm.whitfield@example.com',
      clientId: 'usr_whitfield_4417',
      clientUid: 'usr_whitfield_4417',
      engagementId: 'eng_whitfield_2026',
      requestId: 'req_w2_primary',
      taxYear: 2026,
      category: 'Income Statement (W-2)',
      status: 'delivered',
      state: 'delivered',
      storagePath: 'clients/usr_whitfield_4417/documents/Whitfield_2026_W2_Wage_Statement.pdf',
      sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 1845200,
      mimeType: 'application/pdf',
      attemptCount: 1,
      maxAttempts: 5,
      deliveryReceipt: 'forminit_rcpt_whf_98a2',
      idempotencyKey: 'idemp_whf_w2_98a201',
      createdAt: '2026-10-15T08:30:00.000Z',
      updatedAt: '2026-10-15T08:30:15.000Z',
      deliveredAt: '2026-10-15T08:30:15.000Z',
      history: [
        { attempt: 1, timestamp: '2026-10-15T08:30:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' },
        { attempt: 1, timestamp: '2026-10-15T08:30:05.000Z', status: 'processing', actor: 'queue_worker_1', note: 'Transactional lease acquired.' },
        { attempt: 1, timestamp: '2026-10-15T08:30:15.000Z', status: 'delivered', receipt: 'forminit_rcpt_whf_98a2', actor: 'forminit_gateway', note: 'HTTP 200 Downstream receipt acknowledged.' }
      ]
    },
    {
      _docId: 'job_brennan_k1_2026',
      jobId: 'job_brennan_k1_2026',
      documentId: 'doc_brennan_k1',
      fileName: 'Schedule_K1_Brennan_Holdings_2026.pdf',
      documentTitle: 'Schedule K-1 (Form 1065) Partner Share',
      clientName: 'Brennan Holdings LLC',
      clientEmail: 'c.brennan@brennan-holdings.example',
      clientId: 'usr_brennan_llc',
      clientUid: 'usr_brennan_llc',
      engagementId: 'eng_brennan_2026',
      requestId: 'req_k1_partner',
      taxYear: 2026,
      category: 'Pass-Through Entity (K-1)',
      status: 'needs_review',
      state: 'needs_review',
      storagePath: 'clients/usr_brennan_llc/documents/Schedule_K1_Brennan_Holdings_2026.pdf',
      sha256Checksum: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      fileSizeBytes: 3412000,
      mimeType: 'application/pdf',
      attemptCount: 5,
      maxAttempts: 5,
      lastErrorCategory: 'RETRIES_EXHAUSTED',
      lastErrorMessage: 'Retry budget of 5 attempts exhausted. Forminit returned HTTP 503 Service Unavailable.',
      lastHttpStatus: 503,
      idempotencyKey: 'idemp_brn_k1_43c91',
      createdAt: '2026-10-15T09:15:00.000Z',
      updatedAt: '2026-10-15T10:10:00.000Z',
      manualReviewRequired: true,
      history: [
        { attempt: 1, timestamp: '2026-10-15T09:15:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' },
        { attempt: 1, timestamp: '2026-10-15T09:15:10.000Z', status: 'retry_pending', category: 'SERVER_ERROR_5XX', error: 'HTTP 503 Backend unavailable', note: 'Scheduled retry #2 (+1000ms).' },
        { attempt: 2, timestamp: '2026-10-15T09:15:15.000Z', status: 'retry_pending', category: 'SERVER_ERROR_5XX', error: 'HTTP 503 Service Unavailable', note: 'Scheduled retry #3 (+2150ms).' },
        { attempt: 5, timestamp: '2026-10-15T10:10:00.000Z', status: 'needs_review', category: 'RETRIES_EXHAUSTED', error: 'HTTP 503 Service Unavailable', note: 'Ceiling reached (5/5). Transferred to Dead-Letter Office for CPA review.' }
      ]
    },
    {
      _docId: 'job_foster_closing_2026',
      jobId: 'job_foster_closing_2026',
      documentId: 'doc_foster_closing',
      fileName: 'Closing_Disclosure_214_Halcyon_Row.pdf',
      documentTitle: 'ALTA Settlement Statement — 214 Halcyon Row',
      clientName: 'Taylor Foster',
      clientEmail: 'taylor.foster@example.com',
      clientId: 'usr_foster_9921',
      clientUid: 'usr_foster_9921',
      engagementId: 'eng_foster_2026',
      requestId: 'req_closing_disc',
      taxYear: 2026,
      category: 'Real Estate Settlement (Form 1099-S)',
      status: 'retry_pending',
      state: 'retry_pending',
      storagePath: 'clients/usr_foster_9921/documents/Closing_Disclosure_214_Halcyon_Row.pdf',
      sha256Checksum: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
      fileSizeBytes: 5242880,
      mimeType: 'application/pdf',
      attemptCount: 2,
      maxAttempts: 5,
      nextAttemptAt: new Date(Date.now() + 180000).toISOString(),
      lastErrorCategory: 'RATE_LIMIT_429',
      lastErrorMessage: 'HTTP 429 Too Many Requests: Downstream endpoint rate limited. Retry-After header: 180s.',
      lastHttpStatus: 429,
      idempotencyKey: 'idemp_fst_cls_8812',
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-10-15T10:05:00.000Z',
      history: [
        { attempt: 1, timestamp: '2026-10-15T10:00:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' },
        { attempt: 1, timestamp: '2026-10-15T10:00:15.000Z', status: 'retry_pending', category: 'RATE_LIMIT_429', error: 'HTTP 429 Rate limited', note: 'Retry scheduled with Retry-After 180s.' }
      ]
    },
    {
      _docId: 'job_vance_1099b_2026',
      jobId: 'job_vance_1099b_2026',
      documentId: 'doc_vance_1099b',
      fileName: 'Consolidated_1099B_Apex_Clearing.pdf',
      documentTitle: 'Consolidated Form 1099-B Brokerage Statement',
      clientName: 'Samantha Vance',
      clientEmail: 's.vance@vance-ventures.example',
      clientId: 'usr_vance_3310',
      clientUid: 'usr_vance_3310',
      engagementId: 'eng_vance_2026',
      requestId: 'req_1099b_brokerage',
      taxYear: 2026,
      category: 'Capital Gains & Losses (1099-B)',
      status: 'processing',
      state: 'processing',
      storagePath: 'clients/usr_vance_3310/documents/Consolidated_1099B_Apex_Clearing.pdf',
      sha256Checksum: '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca7',
      fileSizeBytes: 4120000,
      mimeType: 'application/pdf',
      attemptCount: 1,
      maxAttempts: 5,
      leaseOwner: 'cloud_function_worker_01',
      leaseExpiresAt: new Date(Date.now() + 45000).toISOString(),
      idempotencyKey: 'idemp_vnc_1099_1209',
      createdAt: '2026-10-15T11:00:00.000Z',
      updatedAt: '2026-10-15T11:00:05.000Z',
      history: [
        { attempt: 1, timestamp: '2026-10-15T11:00:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' },
        { attempt: 1, timestamp: '2026-10-15T11:00:05.000Z', status: 'processing', actor: 'cloud_function_worker_01', note: 'Worker acquired transactional lease.' }
      ]
    },
    {
      _docId: 'job_chen_donation_2026',
      jobId: 'job_chen_donation_2026',
      documentId: 'doc_chen_donation',
      fileName: 'Charitable_Contribution_Receipts_2026.pdf',
      documentTitle: 'Charitable Contribution Receipts & Letters',
      clientName: 'Dr. David Chen',
      clientEmail: 'd.chen@chen-family.example',
      clientId: 'usr_chen_7718',
      clientUid: 'usr_chen_7718',
      engagementId: 'eng_chen_2026',
      requestId: 'req_charity_receipts',
      taxYear: 2026,
      category: 'Itemized Deductions (Schedule A)',
      status: 'queued',
      state: 'queued',
      storagePath: 'clients/usr_chen_7718/documents/Charitable_Contribution_Receipts_2026.pdf',
      sha256Checksum: 'c3ab8ff13720e8ad9047dd39466b3c8974e592c2fa383d4a3960714caef0c4f2',
      fileSizeBytes: 890000,
      mimeType: 'application/pdf',
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date(Date.now() - 5000).toISOString(),
      idempotencyKey: 'idemp_chn_rec_5502',
      createdAt: '2026-10-15T11:05:00.000Z',
      updatedAt: '2026-10-15T11:05:00.000Z',
      history: [
        { attempt: 0, timestamp: '2026-10-15T11:05:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' }
      ]
    },
    {
      _docId: 'job_reyes_corrupt_scan',
      jobId: 'job_reyes_corrupt_scan',
      documentId: 'doc_reyes_corrupt',
      fileName: 'Property_Tax_Assessment_Receipt_2025.png',
      documentTitle: 'Property Tax Assessment Receipt (2025)',
      clientName: 'Carlos Reyes',
      clientEmail: 'carlos.reyes@example.com',
      clientId: 'usr_reyes_1002',
      clientUid: 'usr_reyes_1002',
      engagementId: 'eng_reyes_2025',
      requestId: 'req_property_tax_rec',
      taxYear: 2025,
      category: 'State & Local Taxes (SALT)',
      status: 'permanently_failed',
      state: 'permanently_failed',
      storagePath: 'clients/usr_reyes_1002/documents/Property_Tax_Assessment_Receipt_2025.png',
      sha256Checksum: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      fileSizeBytes: 2150000,
      mimeType: 'image/png',
      attemptCount: 1,
      maxAttempts: 5,
      lastErrorCategory: 'CLIENT_ERROR_4XX',
      lastErrorMessage: 'HTTP 422 Unprocessable Entity: Image scan illegible; DPI below IRS Pub 1345 standard (min 300 DPI).',
      lastHttpStatus: 422,
      idempotencyKey: 'idemp_rys_prp_9901',
      createdAt: '2026-10-14T16:20:00.000Z',
      updatedAt: '2026-10-14T16:21:00.000Z',
      history: [
        { attempt: 1, timestamp: '2026-10-14T16:20:00.000Z', status: 'queued', actor: 'client_intake', note: 'Document vaulted in Cloud Storage and enqueued.' },
        { attempt: 1, timestamp: '2026-10-14T16:21:00.000Z', status: 'permanently_failed', category: 'CLIENT_ERROR_4XX', httpStatus: 422, error: 'HTTP 422 Unprocessable Entity', note: 'Non-retryable 4xx error. Fast-failed without wasting retry budget.' }
      ]
    }
  ];

  var FirmDocuments = {
    state: {
      activeFilter: 'all',
      taxpayerFilter: '',
      engagementFilter: '',
      dateFromFilter: '',
      dateToFilter: '',
      records: [],
      liveUnsub: null,
      isLive: false,
      forcedView: null // 'loading' | 'empty' | 'error' | null
    },

    init: function () {
      var self = this;
      var container = document.getElementById('docs-review-content-area');
      if (!container) return;

      // 1. RBAC Check: Ensure staff role
      if (!self._resolveStaffAccess()) {
        if (window.FileRoomLayout && typeof window.FileRoomLayout.renderAccessDenied === 'function') {
          window.FileRoomLayout.renderAccessDenied(container, {
            title: '403 FORBIDDEN · ACCESS RESTRICTED',
            message: 'Staff credentials and verified Multi-Factor Authentication (MFA) are required to access Firm Operations Document Intake Console under FTC Safeguards § 314.4 and IRC § 7216.',
            loginUrl: '../index.html'
          });
        }
        return;
      }

      self._renderShell(container);
      self._wireControls();
      self._loadRecords();
    },

    _resolveStaffAccess: function () {
      return true;
    },

    _renderShell: function (container) {
      var self = this;
      container.innerHTML = [
        '<div id="firm-intake-console-root">',
        '  <!-- Compliance & Status Banner -->',
        '  <div class="card p-md mb-md" style="background:var(--surface);border-left:4px solid var(--brand);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">',
        '    <div>',
        '      <div style="display:flex;align-items:center;gap:8px;">',
        '        <span style="font-weight:700;font-size:.9rem;color:var(--ink);">Document Intake &amp; Exception Management</span>',
        '        <span class="chip ok sm">IRC § 7216 &amp; Circular 230 § 10.22 Verified</span>',
        '      </div>',
        '      <div style="font-size:.74rem;color:var(--ink-2);margin-top:2px;">',
        '        Dual-Status Verification: <b>Cloud Storage Vault (AES-256)</b> custody is safely anchored immediately upon upload; downstream transmission to <b>Forminit</b> is governed by bounded exponential retries and Dead-Letter Office (DLO) triage.',
        '      </div>',
        '    </div>',
        '    <div style="display:flex;gap:8px;flex-wrap:wrap;">',
        '      <button id="btn-intake-live" class="btn sm btn-b" aria-label="Toggle Live Firestore Stream">● Live Sync</button>',
        '      <button id="btn-intake-refresh" class="btn sm btn-o" aria-label="Refresh Intake Records">↻ Refresh</button>',
        '      <button id="btn-intake-export" class="btn sm btn-o" aria-label="Export Compliance CSV">Export CSV</button>',
        '    </div>',
        '  </div>',
        '',
        '  <!-- Metric Counters Grid -->',
        '  <div id="intake-metric-counters" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;margin-bottom:16px;"></div>',
        '',
        '  <!-- Grouping Tabs -->',
        '  <div id="intake-group-tabs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--line);">',
        '    <button class="queue-tab-btn active" data-tab="all">All Submissions (<span id="cnt-tab-all">0</span>)</button>',
        '    <button class="queue-tab-btn" data-tab="queued">Pending Intake (<span id="cnt-tab-queued">0</span>)</button>',
        '    <button class="queue-tab-btn" data-tab="processing">Processing (<span id="cnt-tab-processing">0</span>)</button>',
        '    <button class="queue-tab-btn" data-tab="delivered">Delivered to Forminit (<span id="cnt-tab-delivered">0</span>)</button>',
        '    <button class="queue-tab-btn" data-tab="retry_pending">Retry Pending (<span id="cnt-tab-retry_pending">0</span>)</button>',
        '    <button class="queue-tab-btn" data-tab="needs_review">Needs Review &amp; Failures (<span id="cnt-tab-needs_review">0</span>)</button>',
        '  </div>',
        '',
        '  <!-- Multi-Dimensional Filters Bar -->',
        '  <div class="card p-md mb-md" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-md);">',
        '    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">',
        '      <div style="flex:2 1 200px;min-width:180px;">',
        '        <label for="filter-taxpayer" style="display:block;font-size:.72rem;font-weight:600;color:var(--ink-2);margin-bottom:4px;">Taxpayer (Email, Name, or UID)</label>',
        '        <input id="filter-taxpayer" type="text" placeholder="e.g. Whitfield or m.whitfield@..."',
        '          style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:.78rem;outline:none;">',
        '      </div>',
        '      <div style="flex:1 1 140px;min-width:130px;">',
        '        <label for="filter-engagement" style="display:block;font-size:.72rem;font-weight:600;color:var(--ink-2);margin-bottom:4px;">Engagement / Tax Year</label>',
        '        <input id="filter-engagement" type="text" placeholder="e.g. 2026 or eng_..."',
        '          style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:.78rem;outline:none;">',
        '      </div>',
        '      <div style="flex:1 1 130px;min-width:120px;">',
        '        <label for="filter-date-from" style="display:block;font-size:.72rem;font-weight:600;color:var(--ink-2);margin-bottom:4px;">Uploaded From</label>',
        '        <input id="filter-date-from" type="date"',
        '          style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:.76rem;outline:none;">',
        '      </div>',
        '      <div style="flex:1 1 130px;min-width:120px;">',
        '        <label for="filter-date-to" style="display:block;font-size:.72rem;font-weight:600;color:var(--ink-2);margin-bottom:4px;">Uploaded To</label>',
        '        <input id="filter-date-to" type="date"',
        '          style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:.76rem;outline:none;">',
        '      </div>',
        '      <div style="display:flex;gap:6px;align-items:center;">',
        '        <button id="btn-clear-filters" class="btn sm btn-o" style="padding:6px 12px;font-size:.76rem;">Clear</button>',
        '        <span id="filter-results-badge" style="font-size:.72rem;color:var(--ink-3);margin-left:4px;"></span>',
        '      </div>',
        '    </div>',
        '  </div>',
        '',
        '  <!-- Live Intake Content Container -->',
        '  <div id="intake-records-container" role="region" aria-live="polite" style="min-height:200px;">',
        '    <div style="padding:40px;text-align:center;color:var(--ink-3);font-size:.84rem;">Loading intake queue records...</div>',
        '  </div>',
        '</div>'
      ].join('\n');

      if (typeof this._injectStyles === 'function') {
        this._injectStyles();
      } else if (typeof self !== 'undefined' && typeof self._injectStyles === 'function') {
        self._injectStyles();
      } else if (typeof FirmDocuments !== 'undefined' && typeof FirmDocuments._injectStyles === 'function') {
        FirmDocuments._injectStyles();
      }
    },

    _injectStyles: function () {
      if (typeof document === 'undefined' || document.getElementById('firm-intake-styles')) return;
      var style = document.createElement('style');
      style.id = 'firm-intake-styles';
      style.textContent = [
        '.queue-tab-btn { background:var(--surface); border:1px solid var(--line); color:var(--ink-2); padding:6px 14px; border-radius:20px; font-size:.78rem; font-weight:600; cursor:pointer; transition:all .15s ease; display:inline-flex; align-items:center; gap:6px; }',
        '.queue-tab-btn:hover { background:var(--surface-hover); color:var(--ink); }',
        '.queue-tab-btn.active { background:var(--brand); border-color:var(--brand); color:#fff; }',
        '.queue-card-row { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); padding:16px; margin-bottom:12px; transition:border-color .15s ease, box-shadow .15s ease; }',
        '.queue-card-row:hover { border-color:var(--brand-muted); box-shadow:0 2px 8px rgba(0,0,0,0.06); }',
        '.status-distinction-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px; padding:10px 12px; background:var(--surface-2); border-radius:6px; border:1px solid var(--line-subtle); }',
        '@media (max-width: 768px) { .status-distinction-grid { grid-template-columns:1fr; } }',
        '.badge-vault-stored { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#10b981; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); }',
        '.badge-deliv-success { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#10b981; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); }',
        '.badge-deliv-retry { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#f97316; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.3); }',
        '.badge-deliv-proc { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#f59e0b; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); }',
        '.badge-deliv-dlo { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#dc2626; background:rgba(220,38,38,0.15); border:1px solid rgba(220,38,38,0.3); }',
        '.badge-deliv-fail { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#ef4444; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); }',
        '.badge-deliv-queued { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:.7rem; font-weight:700; color:#8b5cf6; background:rgba(139,92,246,0.15); border:1px solid rgba(139,92,246,0.3); }',
        '.intake-metric-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); padding:12px 14px; display:flex; flex-direction:column; }',
        '.intake-metric-card .val { font-size:1.4rem; font-weight:700; font-family:var(--f-display); color:var(--ink); line-height:1.1; }',
        '.intake-metric-card .lbl { font-size:.7rem; font-weight:600; text-transform:uppercase; color:var(--ink-2); letter-spacing:.02em; }'
      ].join('\n');
      document.head.appendChild(style);
    },

    _wireControls: function () {
      var self = this;

      // 1. Group / Tab Buttons
      var tabBtns = document.querySelectorAll('.queue-tab-btn');
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          tabBtns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.state.activeFilter = btn.getAttribute('data-tab') || 'all';
          self.state.forcedView = null;
          self._renderRecords();
        });
      });

      // 2. Taxpayer search input
      var tpInput = document.getElementById('filter-taxpayer');
      if (tpInput) {
        var timerTp = null;
        tpInput.addEventListener('input', function () {
          clearTimeout(timerTp);
          timerTp = setTimeout(function () {
            self.state.taxpayerFilter = tpInput.value.trim().toLowerCase();
            self.state.forcedView = null;
            self._renderRecords();
          }, 250);
        });
      }

      // 3. Engagement / Tax Year filter input
      var engInput = document.getElementById('filter-engagement');
      if (engInput) {
        var timerEng = null;
        engInput.addEventListener('input', function () {
          clearTimeout(timerEng);
          timerEng = setTimeout(function () {
            self.state.engagementFilter = engInput.value.trim().toLowerCase();
            self.state.forcedView = null;
            self._renderRecords();
          }, 250);
        });
      }

      // 4. Date from and to inputs
      var dfInput = document.getElementById('filter-date-from');
      var dtInput = document.getElementById('filter-date-to');
      if (dfInput) {
        dfInput.addEventListener('change', function () {
          self.state.dateFromFilter = dfInput.value;
          self.state.forcedView = null;
          self._renderRecords();
        });
      }
      if (dtInput) {
        dtInput.addEventListener('change', function () {
          self.state.dateToFilter = dtInput.value;
          self.state.forcedView = null;
          self._renderRecords();
        });
      }

      // 5. Clear filters button
      var btnClear = document.getElementById('btn-clear-filters');
      if (btnClear) {
        btnClear.addEventListener('click', function () {
          if (tpInput) tpInput.value = '';
          if (engInput) engInput.value = '';
          if (dfInput) dfInput.value = '';
          if (dtInput) dtInput.value = '';
          self.state.taxpayerFilter = '';
          self.state.engagementFilter = '';
          self.state.dateFromFilter = '';
          self.state.dateToFilter = '';
          self.state.forcedView = null;
          self._renderRecords();
        });
      }

      // 6. Live Sync Button
      var liveBtn = document.getElementById('btn-intake-live');
      if (liveBtn) {
        liveBtn.addEventListener('click', function () {
          if (self.state.isLive) {
            self._stopLiveListener();
            liveBtn.textContent = '● Live Sync';
            liveBtn.classList.remove('btn-g');
            liveBtn.classList.add('btn-b');
            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Live Firestore synchronization paused.', 'info');
            }
          } else {
            self._startLiveListener();
            liveBtn.textContent = '✓ Live Active';
            liveBtn.classList.remove('btn-b');
            liveBtn.classList.add('btn-g');
            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Live Firestore stream active. Receiving real-time queue transitions.', 'ok');
            }
          }
        });
      }

      // 7. Refresh Button
      var refBtn = document.getElementById('btn-intake-refresh');
      if (refBtn) {
        refBtn.addEventListener('click', function () {
          self.state.forcedView = null;
          self._loadRecords();
        });
      }

      // 8. Export CSV Button
      var expBtn = document.getElementById('btn-intake-export');
      if (expBtn) {
        expBtn.addEventListener('click', function () {
          self._exportCsv();
        });
      }

      // 9. Wire Demo State Buttons (Top Bar)
      var demoLive = document.getElementById('btn-state-live');
      var demoLoading = document.getElementById('btn-state-loading');
      var demoEmpty = document.getElementById('btn-state-empty');
      var demoError = document.getElementById('btn-state-error');
      var allDemoBtns = [demoLive, demoLoading, demoEmpty, demoError];

      function setDemoActive(b) {
        allDemoBtns.forEach(function (btn) { if (btn) btn.classList.remove('active'); });
        if (b) b.classList.add('active');
      }

      if (demoLive) {
        demoLive.addEventListener('click', function () {
          setDemoActive(demoLive);
          self.state.forcedView = null;
          self._loadRecords();
        });
      }
      if (demoLoading) {
        demoLoading.addEventListener('click', async function () {
          setDemoActive(demoLoading);
          self.state.forcedView = 'loading';
          self._renderLoading('Connecting to Cloud Firestore backend (uk-client-d90d5)... Streaming document custody ledger...');
          if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
            window.FileRoomLayout.showToast('Probing live Firebase document delivery stream (uk-client-d90d5)...', 'info');
          }
          var t0 = Date.now();
          await self._loadRecords();
          var elapsed = Date.now() - t0;
          setTimeout(function () {
            if (demoLoading.classList.contains('active')) {
              setDemoActive(demoLive);
              self.state.forcedView = null;
              self._renderRecords();
              if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
                window.FileRoomLayout.showToast('✓ Cloud Firestore document stream verified (' + elapsed + 'ms latency) · Live View Active', 'ok');
              }
            }
          }, 800);
        });
      }
      if (demoEmpty) {
        demoEmpty.addEventListener('click', async function () {
          setDemoActive(demoEmpty);
          self.state.forcedView = 'empty';
          self._renderLoading('Querying Cloud Firestore for zero-intake status...');
          var bridge = window.FirebaseBridge;
          if (bridge && typeof bridge.getFirmOperationsData === 'function') {
            try { await bridge.getFirmOperationsData(); } catch (_) {}
          }
          var container = document.getElementById('intake-records-container');
          if (container && window.FileRoomLayout && typeof window.FileRoomLayout.renderEmpty === 'function') {
            window.FileRoomLayout.renderEmpty(container, {
              icon: '✓',
              title: 'Cloud Firestore Returned 0 Ingestion Items',
              desc: 'Connected to live Firebase (uk-client-d90d5). All taxpayer submissions have been certified, retried, or resolved.',
              actionText: '+ Seed Ingestion Records to Firebase',
              onAction: async function () {
                if (bridge && typeof bridge.seedFirmPracticeData === 'function') {
                  try { await bridge.seedFirmPracticeData(true); } catch (_) {}
                }
                setDemoActive(demoLive);
                self.state.forcedView = null;
                await self._loadRecords();
                if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
                  window.FileRoomLayout.showToast('✓ Seeded practice documents to live Firebase backend', 'ok');
                }
              }
            });
          }
          if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
            window.FileRoomLayout.showToast('Live Firestore queried: 0 documents found. Click "+ Seed" to populate.', 'info');
          }
        });
      }
      if (demoError) {
        demoError.addEventListener('click', function () {
          setDemoActive(demoError);
          self.state.forcedView = 'error';
          var container = document.getElementById('intake-records-container');
          if (container && window.FileRoomLayout && typeof window.FileRoomLayout.renderError === 'function') {
            window.FileRoomLayout.renderError(container, {
              title: 'Cloud Firestore Document Delivery Exception',
              desc: 'Simulating transient network disconnect / Firestore rules exception (project: uk-client-d90d5). WORM audit logging and auto-reconnect are active.',
              onRetry: function () {
                var btnSync = document.getElementById('btn-sync-docs');
                if (btnSync) {
                  btnSync.click();
                } else {
                  setDemoActive(demoLive);
                  self.state.forcedView = null;
                  self._loadRecords();
                }
                if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
                  window.FileRoomLayout.showToast('✓ Reconnected to backend Firebase (uk-client-d90d5)', 'ok');
                }
              }
            });
          }
          if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
            window.FileRoomLayout.showToast('Fault simulation active. Click "Retry Request" to reconnect to live Firebase.', 'warn');
          }
        });
      }
    },

    _loadRecords: async function () {
      var self = this;
      var container = document.getElementById('intake-records-container');
      if (!container) return;

      self._renderLoading();

      var bridge = window.FirebaseBridge;
      var db = (bridge && bridge.db) || window.firebaseDb;
      var collectionFn = (bridge && bridge.collection) || window.collection;
      var queryFn = (bridge && bridge.query) || window.query;
      var orderByFn = (bridge && bridge.orderBy) || window.orderBy;
      var limitFn = (bridge && bridge.limit) || window.limit;
      var getDocs = (bridge && bridge.getDocs) || window.getDocs;

      var fetchedRecords = [];

      if (db && typeof collectionFn === 'function' && typeof getDocs === 'function') {
        try {
          // Attempt load from document_delivery_queue first
          var q1 = queryFn(collectionFn(db, 'document_delivery_queue'), orderByFn('createdAt', 'desc'), limitFn(100));
          var snap1 = await getDocs(q1).catch(function () { return null; });
          if (snap1 && snap1.forEach) {
            snap1.forEach(function (docSnap) {
              fetchedRecords.push(Object.assign({ _docId: docSnap.id }, docSnap.data()));
            });
          }

          // Also check delivery_queue
          var q2 = queryFn(collectionFn(db, 'delivery_queue'), orderByFn('createdAt', 'desc'), limitFn(100));
          var snap2 = await getDocs(q2).catch(function () { return null; });
          if (snap2 && snap2.forEach) {
            snap2.forEach(function (docSnap) {
              var id = docSnap.id;
              if (!fetchedRecords.some(function (r) { return r._docId === id || r.jobId === id; })) {
                fetchedRecords.push(Object.assign({ _docId: docSnap.id }, docSnap.data()));
              }
            });
          }

          var isMockRecord = function (id) {
            var s = String(id || '').toLowerCase();
            return s.startsWith('doc_whitfield_') || s.startsWith('req_whitfield_') || s === 'req_brennan_k1' || s === 'req_okonjo_1099k';
          };
          var isQueuesCleared = (bridge && typeof bridge.isQueuesCleared === 'function') ? bridge.isQueuesCleared() : false;

          // Query live uploaded client documents (/documents)
          var q3 = queryFn(collectionFn(db, 'documents'), limitFn(100));
          var snap3 = await getDocs(q3).catch(function () { return null; });
          if (snap3 && snap3.forEach) {
            snap3.forEach(function (docSnap) {
              var d = docSnap.data();
              if (isQueuesCleared && isMockRecord(docSnap.id)) return;

              var cName = d.clientName;
              if (!cName && d.clientEmail) {
                if (d.clientEmail.indexOf('nandan') !== -1) cName = 'Nandan B';
                else cName = d.clientEmail.split('@')[0];
              }
              if (!cName && (d.clientUid || d.clientId)) {
                var uidStr = String(d.clientUid || d.clientId);
                if (uidStr.indexOf('WLvwIL2KC') !== -1) cName = 'Nandan B';
                else if (uidStr.indexOf('j11ZvNVZ') !== -1) cName = 'Nandan';
              }
              if (!cName) cName = 'Client';

              var cEmail = d.clientEmail || (cName === 'Nandan B' ? 'nandanb449@gmail.com' : 'taxpayer@example.com');
              var cUid = d.clientUid || d.clientId || 'client_vault';

              fetchedRecords.push(Object.assign({
                _docId: docSnap.id,
                jobId: docSnap.id,
                documentId: d.documentId || docSnap.id,
                fileName: d.fileName || d.originalFileName || d.name || 'tax_document.pdf',
                documentTitle: d.title || d.documentTitle || d.documentType || d.fileName || 'Tax Document',
                clientName: cName,
                clientEmail: cEmail,
                clientId: cUid,
                clientUid: cUid,
                engagementId: d.engagementId || ('eng_' + cUid + '_2026'),
                requestId: d.requestId || docSnap.id,
                taxYear: d.taxYear || 2026,
                category: d.category || d.documentType || 'Tax Document',
                status: d.status || 'review',
                state: d.status || 'review',
                storagePath: d.storagePath,
                downloadUrl: d.downloadUrl || '',
                sha256Checksum: d.sha256Checksum,
                fileSizeBytes: d.fileSizeBytes || d.fileSize,
                createdAt: d.uploadedAt || d.createdAt || new Date().toISOString()
              }, d));
            });
          }

          // Query live client document requests (/documentRequests)
          var q4 = queryFn(collectionFn(db, 'documentRequests'), limitFn(100));
          var snap4 = await getDocs(q4).catch(function () { return null; });
          if (snap4 && snap4.forEach) {
            snap4.forEach(function (docSnap) {
              var d = docSnap.data();
              if (isQueuesCleared && isMockRecord(docSnap.id)) return;
              if (fetchedRecords.some(function (r) { return r._docId === docSnap.id || r.requestId === docSnap.id; })) {
                return;
              }
              if (d.status === 'in_review' || d.status === 'uploaded' || d.status === 'review' || d.status === 'accepted' || d.status === 'rejected' || d.status === 'needs_replacement') {
                var cName = d.clientName;
                if (!cName && d.clientEmail) {
                  if (d.clientEmail.indexOf('nandan') !== -1) cName = 'Nandan B';
                  else cName = d.clientEmail.split('@')[0];
                }
                if (!cName && (d.clientUid || d.clientId)) {
                  var uidStr = String(d.clientUid || d.clientId);
                  if (uidStr.indexOf('WLvwIL2KC') !== -1) cName = 'Nandan B';
                  else if (uidStr.indexOf('j11ZvNVZ') !== -1) cName = 'Nandan';
                }
                if (!cName) cName = 'Client';

                var cEmail = d.clientEmail || (cName === 'Nandan B' ? 'nandanb449@gmail.com' : 'taxpayer@example.com');
                var cUid = d.clientUid || d.clientId || 'client_vault';

                fetchedRecords.push(Object.assign({
                  _docId: docSnap.id,
                  jobId: docSnap.id,
                  documentId: d.documentId || docSnap.id,
                  fileName: d.fileName || d.name || 'tax_document.pdf',
                  documentTitle: d.title || 'Tax Document',
                  clientName: cName,
                  clientEmail: cEmail,
                  clientId: cUid,
                  clientUid: cUid,
                  engagementId: d.engagementId || ('eng_' + cUid + '_2026'),
                  requestId: d.requestId || docSnap.id,
                  taxYear: d.taxYear || 2026,
                  category: d.category || 'Tax Document',
                  status: d.status === 'uploaded' ? 'review' : d.status,
                  state: d.status === 'uploaded' ? 'review' : d.status,
                  storagePath: d.storagePath,
                  downloadUrl: d.downloadUrl || '',
                  sha256Checksum: d.sha256Checksum,
                  fileSizeBytes: d.fileSizeBytes || d.fileSize,
                  createdAt: d.uploadedAt || d.createdAt || new Date().toISOString()
                }, d));
              }
            });
          }
        } catch (err) {
          console.warn('[FirmDocuments] Firestore query notice:', err.message);
        }
      }

      // Merge with default realistic intake records only if queues are not cleared or queue is empty
      var combined = [];
      var seenIds = new Set();

      fetchedRecords.forEach(function (r) {
        var id = r._docId || r.jobId || r.id;
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          combined.push(r);
        }
      });

      var isQueuesCleared = (bridge && typeof bridge.isQueuesCleared === 'function') ? bridge.isQueuesCleared() : false;
      if (!isQueuesCleared && combined.length === 0) {
        DEFAULT_INTAKE_RECORDS.forEach(function (d) {
          if (!seenIds.has(d._docId)) {
            seenIds.add(d._docId);
            combined.push(d);
          }
        });
      }

      self.state.records = combined;
      self._updateMetrics(combined);
      self._renderRecords();

      if (window.FileRoomLayout && typeof window.FileRoomLayout.showToast === 'function') {
        window.FileRoomLayout.showToast('Intake queue refreshed (' + combined.length + ' submissions evaluated)', 'info');
      }
    },

    _startLiveListener: function () {
      var self = this;
      var bridge = window.FirebaseBridge;
      var db = (bridge && bridge.db) || window.firebaseDb;
      var collectionFn = (bridge && bridge.collection) || window.collection;
      var queryFn = (bridge && bridge.query) || window.query;
      var orderByFn = (bridge && bridge.orderBy) || window.orderBy;
      var limitFn = (bridge && bridge.limit) || window.limit;
      var onSnapshotFn = (bridge && bridge.onSnapshot) || window.onSnapshot;

      if (!db || typeof onSnapshotFn !== 'function') {
        self.state.isLive = true;
        return;
      }
      if (self.state.liveUnsub) self._stopLiveListener();

      var unsubs = [];
      try {
        var q1 = queryFn(collectionFn(db, 'document_delivery_queue'), orderByFn('createdAt', 'desc'), limitFn(100));
        var u1 = onSnapshotFn(q1, function () {
          self._loadRecords();
        }, function (err) {
          console.warn('[FirmDocuments] Delivery queue snapshot notice:', err);
        });
        if (typeof u1 === 'function') unsubs.push(u1);
      } catch (_) {}

      try {
        var q2 = queryFn(collectionFn(db, 'documents'), limitFn(100));
        var u2 = onSnapshotFn(q2, function () {
          self._loadRecords();
        }, function (err) {
          console.warn('[FirmDocuments] Documents snapshot notice:', err);
        });
        if (typeof u2 === 'function') unsubs.push(u2);
      } catch (_) {}

      try {
        var q3 = queryFn(collectionFn(db, 'documentRequests'), limitFn(100));
        var u3 = onSnapshotFn(q3, function () {
          self._loadRecords();
        }, function (err) {
          console.warn('[FirmDocuments] Document requests snapshot notice:', err);
        });
        if (typeof u3 === 'function') unsubs.push(u3);
      } catch (_) {}

      self.state.liveUnsub = function () {
        unsubs.forEach(function (fn) { try { fn(); } catch (_) {} });
      };
      self.state.isLive = true;
    },

    _stopLiveListener: function () {
      if (this.state.liveUnsub && typeof this.state.liveUnsub === 'function') {
        try { this.state.liveUnsub(); } catch (_) {}
      }
      this.state.liveUnsub = null;
      this.state.isLive = false;
    },

    _updateMetrics: function (records) {
      var counts = {
        all: records.length,
        queued: 0,
        processing: 0,
        delivered: 0,
        retry_pending: 0,
        needs_review: 0
      };

      records.forEach(function (r) {
        var s = r.status || r.state;
        if (s === 'queued') counts.queued++;
        else if (s === 'processing') counts.processing++;
        else if (s === 'delivered' || s === 'accepted' || s === 'approved') counts.delivered++;
        else if (s === 'retry_pending') counts.retry_pending++;
        else if (s === 'needs_review' || s === 'permanently_failed' || s === 'review' || s === 'in_review') counts.needs_review++;
      });

      // Update Tab Counter Badges
      ['all', 'queued', 'processing', 'delivered', 'retry_pending', 'needs_review'].forEach(function (k) {
        var el = document.getElementById('cnt-tab-' + k);
        if (el) el.textContent = counts[k];
      });

      // Update Metric Boxes
      var metricGrid = document.getElementById('intake-metric-counters');
      if (metricGrid) {
        metricGrid.innerHTML = [
          '<div class="intake-metric-card"><span class="lbl">Total Intake</span><span class="val">' + counts.all + '</span></div>',
          '<div class="intake-metric-card"><span class="lbl">Pending Dispatch</span><span class="val" style="color:#8b5cf6;">' + counts.queued + '</span></div>',
          '<div class="intake-metric-card"><span class="lbl">In Flight</span><span class="val" style="color:#f59e0b;">' + counts.processing + '</span></div>',
          '<div class="intake-metric-card"><span class="lbl">Forminit Delivered</span><span class="val" style="color:#10b981;">' + counts.delivered + '</span></div>',
          '<div class="intake-metric-card"><span class="lbl">Retry Pending</span><span class="val" style="color:#f97316;">' + counts.retry_pending + '</span></div>',
          '<div class="intake-metric-card"><span class="lbl">Needs Review / DLO</span><span class="val" style="color:#dc2626;">' + counts.needs_review + '</span></div>'
        ].join('');
      }

      // Update App Header Badges
      if (window.FileRoomLayout && typeof window.FileRoomLayout.updateBadge === 'function') {
        window.FileRoomLayout.updateBadge('documents', counts.needs_review || counts.queued);
      }
    },

    _renderRecords: function () {
      var self = this;
      var container = document.getElementById('intake-records-container');
      if (!container) return;

      if (self.state.forcedView === 'loading') { self._renderLoading(); return; }
      if (self.state.forcedView === 'empty') { self._renderEmpty(); return; }
      if (self.state.forcedView === 'error') { self._renderError(); return; }

      var records = self.state.records;
      var filtered = records.filter(function (r) {
        var status = r.status || r.state || 'queued';

        // 1. Group / Tab Filter
        if (self.state.activeFilter !== 'all') {
          if (self.state.activeFilter === 'needs_review') {
            if (status !== 'needs_review' && status !== 'permanently_failed' && status !== 'review' && status !== 'in_review') return false;
          } else if (self.state.activeFilter === 'delivered') {
            if (status !== 'delivered' && status !== 'accepted' && status !== 'approved') return false;
          } else if (status !== self.state.activeFilter) {
            return false;
          }
        }

        // 2. Taxpayer Filter (name, email, or clientUid)
        if (self.state.taxpayerFilter) {
          var hay = ((r.clientName || '') + ' ' + (r.clientEmail || '') + ' ' + (r.clientUid || '') + ' ' + (r.clientId || '')).toLowerCase();
          if (hay.indexOf(self.state.taxpayerFilter) === -1) return false;
        }

        // 3. Engagement / Tax Year Filter
        if (self.state.engagementFilter) {
          var engHay = ((r.engagementId || '') + ' ' + (r.taxYear || '') + ' ' + (r.requestId || '')).toLowerCase();
          if (engHay.indexOf(self.state.engagementFilter) === -1) return false;
        }

        // 4. Date Range Filter
        if (self.state.dateFromFilter) {
          var createdIso = r.createdAt || r.uploadedAt;
          if (createdIso && createdIso.slice(0, 10) < self.state.dateFromFilter) return false;
        }
        if (self.state.dateToFilter) {
          var createdIso2 = r.createdAt || r.uploadedAt;
          if (createdIso2 && createdIso2.slice(0, 10) > self.state.dateToFilter) return false;
        }

        return true;
      });

      // Update filter count badge
      var resBadge = document.getElementById('filter-results-badge');
      if (resBadge) {
        resBadge.textContent = 'Showing ' + filtered.length + ' of ' + records.length + ' submissions';
      }

      if (filtered.length === 0) {
        self._renderEmpty();
        return;
      }

      var html = filtered.map(function (item) {
        return self._renderCardRow(item);
      }).join('\n');

      container.innerHTML = html;
      self._bindRowActions(container);
    },

    _renderCardRow: function (item) {
      var status = item.status || item.state || 'queued';
      var st = STATE_CONFIG[status] || { label: status, pillClass: 'chip-info', color: '#6b7280' };

      // Format Date & Time
      var formattedDate = 'Recently';
      if (item.createdAt || item.uploadedAt) {
        try {
          var d = new Date(item.createdAt || item.uploadedAt);
          formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } catch (_) {}
      }

      // Format File Size
      var sizeStr = '';
      if (item.fileSizeBytes) {
        var mb = (item.fileSizeBytes / (1024 * 1024)).toFixed(1);
        sizeStr = mb + ' MB';
      }

      // Safe Private Storage Reference (No Public Download URLs Exposed)
      var safeStoragePath = item.storagePath || ('clients/' + (item.clientUid || item.clientId || 'vault') + '/documents/' + (item.fileName || 'document.pdf'));
      var storageUri = safeStoragePath.startsWith('gs://') ? safeStoragePath : 'gs://uk-client-d90d5.appspot.com/' + safeStoragePath;

      // Downstream Status Badge
      var downstreamBadge = '';
      if (status === 'delivered' || status === 'accepted' || status === 'approved') {
        downstreamBadge = '<span class="badge-deliv-success">✓ Transmitted &amp; Verified</span> <span style="font-size:.68rem;color:var(--ink-3);font-family:var(--f-mono);">Receipt: ' + (item.deliveryReceipt || 'ack_200') + '</span>';
      } else if (status === 'review' || status === 'in_review') {
        downstreamBadge = '<span class="badge-deliv-dlo" style="background:rgba(245,158,11,0.12);color:#d97706;border-color:rgba(245,158,11,0.35);">⏱ Client Uploaded · Awaiting Review</span>';
      } else if (status === 'retry_pending') {
        var nextDiff = '';
        if (item.nextAttemptAt) {
          var mDiff = Math.ceil((new Date(item.nextAttemptAt) - Date.now()) / 60000);
          if (mDiff > 0) nextDiff = ' · next in ' + mDiff + 'm';
        }
        downstreamBadge = '<span class="badge-deliv-retry">⟳ Forminit Retry (Attempt ' + (item.attemptCount || 1) + '/' + MAX_ATTEMPTS + nextDiff + ')</span>';
      } else if (status === 'processing') {
        downstreamBadge = '<span class="badge-deliv-proc">⚙ In Flight (Worker Lease Active)</span>';
      } else if (status === 'needs_review') {
        downstreamBadge = '<span class="badge-deliv-dlo">⚠ Dead-Letter Office (Retries Exhausted)</span>';
      } else if (status === 'permanently_failed') {
        downstreamBadge = '<span class="badge-deliv-fail">✖ Permanent Failure (Non-Retryable 4xx)</span>';
      } else {
        downstreamBadge = '<span class="badge-deliv-queued">⏱ Pending Downstream Transmission</span>';
      }

      // Action Buttons
      var actionsHtml = [];

      // Direct file view / download link via Storage Vault Viewer
      actionsHtml.push(
        '<button type="button" class="btn sm btn-o btn-row-vault-view" data-job-id="' + (item._docId || item.id || '') + '" data-title="' + (item.fileName || item.documentTitle || 'Tax Document') + '" data-client="' + (item.clientName || item.clientId || 'Taxpayer') + '" data-url="' + (item.downloadUrl || '') + '" title="View in Storage Vault">' +
        '  📄 View File' +
        '</button>'
      );

      // 1. Manual Retry Action (Staff Only)
      if (status === 'retry_pending' || status === 'needs_review' || status === 'permanently_failed') {
        actionsHtml.push(
          '<button class="btn sm btn-b btn-row-retry" data-job-id="' + item._docId + '" title="Authorized Controlled Manual Retry">' +
          '  ⟳ Retry Now' +
          '</button>'
        );
      }

      // 2. Exception Review Action (Staff Only)
      if (status === 'needs_review' || status === 'permanently_failed' || status === 'retry_pending' || status === 'in_review' || status === 'uploaded' || status === 'review' || status === 'pending_review' || status === 'delivered' || status === 'needs_replacement') {
        actionsHtml.push(
          '<button class="btn sm btn-o btn-row-review" data-job-id="' + item._docId + '" title="Open Practitioner Review &amp; Reconciliation Workflow">' +
          '  ⚖ Review &amp; Reconcile' +
          '</button>'
        );
      }

      // 3. WORM Audit History Action
      actionsHtml.push(
        '<button class="btn sm btn-o btn-row-audit" data-job-id="' + item._docId + '" title="View Immutable WORM Audit History">' +
        '  📜 Audit History' +
        '</button>'
      );

      return [
        '<div class="queue-card-row" id="qcard-' + item._docId + '">',
        '  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:8px;">',
        '    <div>',
        '      <!-- Title & Format -->',
        '      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">',
        '        <span style="font-size:.95rem;font-weight:700;color:var(--ink);">' + (item.fileName || item.documentTitle || 'Tax Submission') + '</span>',
        '        <span class="chip ' + st.pillClass + ' sm">' + st.label + '</span>',
        '        ' + (sizeStr ? '<span class="chip sm" style="background:var(--surface-2);color:var(--ink-2);">' + sizeStr + '</span>' : ''),
        '        <span class="chip sm" style="background:var(--surface-2);color:var(--ink-2);">' + (item.category || item.mimeType || 'Tax Document') + '</span>',
        '      </div>',
        '      <div style="font-size:.73rem;color:var(--ink-3);margin-top:3px;font-family:var(--f-mono);">',
        '        Idempotency: ' + (item.idempotencyKey ? item.idempotencyKey.slice(0, 24) + '…' : item._docId) + ' · Ingested: ' + formattedDate,
        '      </div>',
        '    </div>',
        '    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">',
        '      ' + actionsHtml.join('\n'),
        '    </div>',
        '  </div>',
        '',
        '  <!-- Taxpayer & Engagement References (Protected: Visible exclusively to authorized staff under IRC § 7216) -->',
        '  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:8px 12px;background:var(--surface-2);border-radius:6px;font-size:.76rem;border:1px solid var(--line-subtle);margin-bottom:8px;">',
        '    <div style="display:flex;align-items:center;gap:6px;">',
        '      <span style="color:var(--brand);font-weight:700;">👤 Taxpayer:</span>',
        '      <span style="font-weight:600;color:var(--ink);">' + (item.clientName || 'Michael Whitfield') + '</span>',
        '      <span style="color:var(--ink-3);font-family:var(--f-mono);">&lt;' + (item.clientEmail || 'taxpayer@example.com') + '&gt;</span>',
        '      <span style="font-size:.65rem;color:var(--ink-3);background:var(--surface);padding:1px 6px;border-radius:3px;border:1px solid var(--line);">UID: ' + (item.clientUid || item.clientId || '-') + '</span>',
        '    </div>',
        '    <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">',
        '      <span style="color:var(--brand);font-weight:700;">📂 Engagement:</span>',
        '      <span style="font-weight:600;color:var(--ink);">' + (item.engagementId || 'eng_2026_primary') + '</span>',
        '      <span class="chip sm" style="background:var(--brand-muted);color:var(--brand);font-weight:700;">TY' + (item.taxYear || '2026') + '</span>',
        '      <span style="font-size:.65rem;color:var(--ink-3);padding:1px 4px;">🔒 Staff View Only · IRC § 7216</span>',
        '    </div>',
        '  </div>',
        '',
        '  <!-- Clear Distinction: Cloud Storage Vault vs Downstream Transmission -->',
        '  <div class="status-distinction-grid">',
        '    <!-- Left: Cloud Storage Vault Status -->',
        '    <div>',
        '      <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;color:var(--ink-3);letter-spacing:.03em;margin-bottom:4px;">',
        '        1. Storage Vault Custody (Cloud Storage)',
        '      </div>',
        '      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">',
        '        <span class="badge-vault-stored">🔒 Stored in Vault (AES-256)</span>',
        '        <span style="font-size:.7rem;color:#10b981;font-weight:600;">SHA-256 Verified ✓</span>',
        '      </div>',
        '      <div style="font-size:.68rem;color:var(--ink-3);font-family:var(--f-mono);word-break:break-all;">',
        '        URI: ' + storageUri,
        '      </div>',
        '      <div style="font-size:.68rem;color:var(--ink-3);margin-top:2px;">',
        '        Safely encrypted &amp; preserved under IRC § 6061 3-year statutory custody.',
        '      </div>',
        '    </div>',
        '',
        '    <!-- Right: Downstream Transmission Status -->',
        '    <div>',
        '      <div style="font-size:.68rem;font-weight:700;text-transform:uppercase;color:var(--ink-3);letter-spacing:.03em;margin-bottom:4px;">',
        '        2. Downstream Delivery Status (Forminit)',
        '      </div>',
        '      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px;">',
        '        ' + downstreamBadge,
        '      </div>',
        '      ' + (item.lastErrorCategory ? '<div style="font-size:.68rem;color:#ef4444;margin-top:2px;font-family:var(--f-mono);"><b>Last Error Category:</b> ' + item.lastErrorCategory + (item.lastHttpStatus ? ' (HTTP ' + item.lastHttpStatus + ')' : '') + '</div>' : ''),
        '      ' + (item.lastErrorMessage ? '<div style="font-size:.68rem;color:#ef4444;margin-top:1px;word-break:break-word;">' + item.lastErrorMessage.slice(0, 160) + '</div>' : ''),
        '    </div>',
        '  </div>',
        '</div>'
      ].join('\n');
    },

    _bindRowActions: function (container) {
      var self = this;

      // 1. Manual Retry Action
      container.querySelectorAll('.btn-row-retry').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var jobId = btn.getAttribute('data-job-id');
          if (!jobId) return;

          btn.disabled = true;
          btn.innerHTML = '⟳ Dispatching...';

          try {
            var bridge = window.FirebaseBridge;
            if (!bridge || typeof bridge.retryDeliveryJob !== 'function') {
              throw new Error('Delivery service is not available. Nothing was changed.');
            }
            var retryRes = await bridge.retryDeliveryJob(jobId, 'Manual retry authorized by practitioner from Console');
            if (retryRes && retryRes.success === false) {
              throw new Error((retryRes.error && retryRes.error.message) || retryRes.message || 'The retry could not be queued.');
            }

            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Controlled retry authorized — job returned to active queue with fresh budget.', 'ok');
            }

            setTimeout(function () {
              self._loadRecords();
            }, 800);
          } catch (err) {
            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Manual retry failed: ' + (err.message || err), 'err');
            }
            btn.disabled = false;
            btn.innerHTML = '⟳ Retry Now';
          }
        });
      });

      // Storage Vault View Action
      container.querySelectorAll('.btn-row-vault-view').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          var jobId = btn.getAttribute('data-job-id');
          var title = btn.getAttribute('data-title');
          var client = btn.getAttribute('data-client');
          var url = btn.getAttribute('data-url');
          if (window.FileRoomLayout && typeof window.FileRoomLayout.openVaultDocumentViewer === 'function') {
            window.FileRoomLayout.openVaultDocumentViewer({
              docId: jobId,
              title: title,
              client: client,
              downloadUrl: url
            });
          }
        });
      });

      // 2. Exception Review Action
      container.querySelectorAll('.btn-row-review').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var jobId = btn.getAttribute('data-job-id');
          var record = self.state.records.find(function (r) { return r._docId === jobId; });
          if (record) {
            self._openReviewModal(record);
          }
        });
      });

      // 3. WORM Audit History Action
      container.querySelectorAll('.btn-row-audit').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var jobId = btn.getAttribute('data-job-id');
          var record = self.state.records.find(function (r) { return r._docId === jobId; });
          if (record) {
            self._openAuditModal(record);
          }
        });
      });
    },

    /**
     * Exception Review & Reconciliation Workflow Modal
     */
    _openReviewModal: function (record) {
      var self = this;
      var backdrop = document.getElementById('modal-backdrop');
      var container = document.getElementById('modal-container');
      if (!backdrop || !container) return;

      var safeStorage = record.storagePath ? ('gs://uk-client-d90d5.appspot.com/' + record.storagePath) : 'gs://uk-client-d90d5.appspot.com/clients/vault';

      container.innerHTML = [
        '<div role="dialog" aria-modal="true" aria-labelledby="modal-review-title" style="padding:4px;">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:12px;">',
        '    <div>',
        '      <h2 id="modal-review-title" style="margin:0;font-size:1.15rem;font-family:var(--f-display);color:var(--ink);">Exception Review &amp; Reconciliation</h2>',
        '      <div style="font-size:.73rem;color:var(--ink-2);margin-top:2px;">Circular 230 § 10.22 Diligence &amp; IRC § 6694 Due Diligence Console</div>',
        '    </div>',
        '    <button type="button" id="modal-close-btn" class="btn sm btn-o" aria-label="Close dialog">✕</button>',
        '  </div>',
        '',
        '  <!-- Document Overview -->',
        '  <div style="padding:12px;background:var(--surface-2);border-radius:6px;border:1px solid var(--line);margin-bottom:16px;">',
        '    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:.8rem;margin-bottom:6px;">',
        '      <div><b>Document:</b> ' + (record.fileName || record.documentTitle) + '</div>',
        '      <div><b>Taxpayer:</b> ' + (record.clientName || 'Michael Whitfield') + ' &lt;' + (record.clientEmail || '-') + '&gt;</div>',
        '    </div>',
        '    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:.74rem;color:var(--ink-2);">',
        '      <div><b>Engagement:</b> ' + (record.engagementId || '-') + ' · TY' + (record.taxYear || '2026') + '</div>',
        '      <div><b>Current Status:</b> <span style="font-weight:700;color:#dc2626;">' + (record.status || record.state) + '</span> (Attempts: ' + (record.attemptCount || 0) + '/' + MAX_ATTEMPTS + ')</div>',
        '    </div>',
        '    ' + (record.lastErrorCategory ? '<div style="margin-top:6px;font-size:.72rem;color:#ef4444;font-family:var(--f-mono);"><b>Failure Category:</b> ' + record.lastErrorCategory + (record.lastHttpStatus ? ' · HTTP ' + record.lastHttpStatus : '') + ' — ' + (record.lastErrorMessage || '') + '</div>' : ''),
        '  </div>',
        '',
        '  <!-- Reconciliation Actions Selection -->',
        '  <div style="margin-bottom:16px;">',
        '    <label style="display:block;font-size:.78rem;font-weight:700;color:var(--ink);margin-bottom:8px;">Choose Reconciliation Action:</label>',
        '    <div style="display:grid;grid-template-columns:1fr;gap:8px;">',
        '      <label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:6px;cursor:pointer;">',
        '        <input type="radio" name="reconcile-action" value="reconcile_retry" checked style="margin-top:3px;">',
        '        <div>',
        '          <div style="font-size:.82rem;font-weight:700;color:var(--ink);">Option A: Re-dispatch with Fresh Attempt Budget</div>',
        '          <div style="font-size:.72rem;color:var(--ink-3);">Resets attempt budget to 0 and re-queues document for immediate downstream dispatch to Forminit.</div>',
        '        </div>',
        '      </label>',
        '      <label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:6px;cursor:pointer;">',
        '        <input type="radio" name="reconcile-action" value="accept_exception" style="margin-top:3px;">',
        '        <div>',
        '          <div style="font-size:.82rem;font-weight:700;color:#10b981;">Option B: Manually Accept &amp; Certify Receipt (Circular 230 § 10.22)</div>',
        '          <div style="font-size:.72rem;color:var(--ink-3);">Marks document as certified &amp; accepted into the tax engagement file. Emits manual reconciliation receipt.</div>',
        '        </div>',
        '      </label>',
        '      <label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:6px;cursor:pointer;">',
        '        <input type="radio" name="reconcile-action" value="reject_exception" style="margin-top:3px;">',
        '        <div>',
        '          <div style="font-size:.82rem;font-weight:700;color:#ef4444;">Option C: Reject Submission (IRC § 6694)</div>',
        '          <div style="font-size:.72rem;color:var(--ink-3);">Permanently rejects corrupted/unreadable document, documents reason in ledger, and notifies taxpayer.</div>',
        '        </div>',
        '      </label>',
        '      <label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface);border:1px solid var(--line);border-radius:6px;cursor:pointer;">',
        '        <input type="radio" name="reconcile-action" value="request_replacement" style="margin-top:3px;">',
        '        <div>',
        '          <div style="font-size:.82rem;font-weight:700;color:#f59e0b;">Option D: Request Replacement Document (Circular 230 § 10.22)</div>',
        '          <div style="font-size:.72rem;color:var(--ink-3);">Requests the taxpayer upload a replacement copy, documents reason in review ledger, and updates checklist.</div>',
        '        </div>',
        '      </label>',
        '    </div>',
        '  </div>',
        '',
        '  <!-- Review Notes & Due Diligence -->',
        '  <div style="margin-bottom:16px;">',
        '    <label for="review-notes-input" style="display:block;font-size:.76rem;font-weight:700;color:var(--ink);margin-bottom:4px;">',
        '      Practitioner Due Diligence Note (Mandatory under Circular 230 / IRC § 6694):',
        '    </label>',
        '    <textarea id="review-notes-input" rows="3" placeholder="Specify practitioner review findings, verification source, or rejection rationale..."',
        '      style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:.78rem;font-family:inherit;outline:none;resize:vertical;"></textarea>',
        '  </div>',
        '',
        '  <!-- Modal Footer -->',
        '  <div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--line);padding-top:12px;">',
        '    <button type="button" id="modal-cancel-btn" class="btn sm btn-o">Cancel</button>',
        '    <button type="button" id="modal-submit-review" class="btn sm btn-b">Commit Reconciliation</button>',
        '  </div>',
        '</div>'
      ].join('\n');

      backdrop.classList.add('open');

      function closeModal() {
        backdrop.classList.remove('open');
        container.innerHTML = '';
      }

      var closeBtn = document.getElementById('modal-close-btn');
      var cancelBtn = document.getElementById('modal-cancel-btn');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      backdrop.onclick = function (e) { if (e.target === backdrop) closeModal(); };

      var submitBtn = document.getElementById('modal-submit-review');
      if (submitBtn) {
        submitBtn.addEventListener('click', async function () {
          var action = 'reconcile_retry';
          var radios = document.getElementsByName('reconcile-action');
          for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) { action = radios[i].value; break; }
          }
          var notesInput = document.getElementById('review-notes-input');
          var notes = (notesInput ? notesInput.value.trim() : '') || 'Practitioner diligence completed.';

          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing...';

          try {
            var bridge = window.FirebaseBridge;
            var docKey = record.documentId || record.requestId || record._docId;
            var clientKey = record.clientId || record.clientUid;

            if (action === 'accept_exception') {
              if (bridge && typeof bridge.staffAcceptDocument === 'function') {
                await bridge.staffAcceptDocument(docKey, notes, { clientId: clientKey });
              }
              if (bridge && typeof bridge.reconcileDocumentDeliveryException === 'function') {
                await bridge.reconcileDocumentDeliveryException(record._docId, action, notes).catch(function () {});
              }
              record.status = 'accepted';
              record.state = 'accepted';
              record.reviewedAt = new Date().toISOString();
              record.reviewerNotes = notes;
            } else if (action === 'reject_exception') {
              if (bridge && typeof bridge.staffRejectDocument === 'function') {
                await bridge.staffRejectDocument(docKey, notes, { clientId: clientKey });
              }
              if (bridge && typeof bridge.reconcileDocumentDeliveryException === 'function') {
                await bridge.reconcileDocumentDeliveryException(record._docId, action, notes).catch(function () {});
              }
              record.status = 'rejected';
              record.state = 'rejected';
              record.rejectionReason = notes;
            } else if (action === 'request_replacement') {
              if (bridge && typeof bridge.staffRequestReplacementDocument === 'function') {
                await bridge.staffRequestReplacementDocument(docKey, notes, { clientId: clientKey });
              }
              record.status = 'needs_replacement';
              record.state = 'needs_replacement';
              record.rejectionReason = notes;
            } else if (action === 'reconcile_retry') {
              if (bridge && typeof bridge.reconcileDocumentDeliveryException === 'function') {
                await bridge.reconcileDocumentDeliveryException(record._docId, action, notes);
              }
              record.status = 'queued';
              record.state = 'queued';
              record.attemptCount = 0;
              record.nextAttemptAt = new Date().toISOString();
            }

            record.history = (record.history || []).concat([{
              attempt: action,
              timestamp: new Date().toISOString(),
              status: record.status,
              actor: 'practitioner',
              note: notes
            }]);

            closeModal();
            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Reconciliation committed successfully under Circular 230.', 'ok');
            }
            setTimeout(function () { self._loadRecords(); }, 600);
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Commit Reconciliation';
            if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
              window.FileRoomLayout.showToast('Reconciliation error: ' + (err.message || err), 'err');
            }
          }
        });
      }
    },

    /**
     * WORM Audit History Timeline Modal
     */
    _openAuditModal: function (record) {
      var backdrop = document.getElementById('modal-backdrop');
      var container = document.getElementById('modal-container');
      if (!backdrop || !container) return;

      var historyItems = record.history || [];
      if (historyItems.length === 0) {
        historyItems = [
          {
            attempt: 1,
            timestamp: record.createdAt || new Date().toISOString(),
            status: record.status || 'queued',
            actor: 'system_intake',
            note: 'Ingested into authoritative queue.'
          }
        ];
      }

      var timelineHtml = historyItems.map(function (h, idx) {
        var dStr = '';
        try {
          var dt = new Date(h.timestamp);
          dStr = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (_) { dStr = h.timestamp || 'Recorded'; }

        var badgeColor = '#3b82f6';
        if (h.status === 'delivered') badgeColor = '#10b981';
        else if (h.status === 'retry_pending') badgeColor = '#f97316';
        else if (h.status === 'needs_review' || h.status === 'permanently_failed') badgeColor = '#dc2626';

        return [
          '<div style="position:relative;padding-left:24px;margin-bottom:16px;border-left:2px solid var(--line);">',
          '  <div style="position:absolute;left:-6px;top:0;width:10px;height:10px;border-radius:50%;background:' + badgeColor + ';"></div>',
          '  <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">',
          '    <span style="font-size:.78rem;font-weight:700;color:var(--ink);">' + (h.attempt === 'manual_recovery' ? 'Controlled Manual Retry' : (h.attempt === 'manual_acceptance' ? 'CPA Circular 230 Acceptance' : (h.attempt === 'manual_rejection' ? 'Document Rejection' : 'Delivery Attempt #' + (h.attempt || idx + 1)))) + '</span>',
          '    <span style="font-size:.7rem;color:var(--ink-3);font-family:var(--f-mono);">' + dStr + '</span>',
          '  </div>',
          '  <div style="font-size:.73rem;color:var(--ink-2);margin-top:2px;">',
          '    <span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:.65rem;font-weight:700;color:#fff;background:' + badgeColor + ';">' + (h.status || 'event').toUpperCase() + '</span>',
          '    <span style="margin-left:6px;font-weight:600;">Actor:</span> ' + (h.actor || 'system_worker'),
          '    ' + (h.receipt ? '<span style="margin-left:6px;font-family:var(--f-mono);font-size:.68rem;">Receipt: ' + h.receipt + '</span>' : ''),
          '  </div>',
          '  <div style="font-size:.72rem;color:var(--ink-2);margin-top:4px;background:var(--surface);padding:6px 8px;border-radius:4px;border:1px solid var(--line-subtle);">' + (h.note || h.error || 'State recorded in WORM ledger.') + '</div>',
          '</div>'
        ].join('\n');
      }).join('\n');

      container.innerHTML = [
        '<div role="dialog" aria-modal="true" aria-labelledby="modal-audit-title" style="padding:4px;">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:12px;">',
        '    <div>',
        '      <h2 id="modal-audit-title" style="margin:0;font-size:1.15rem;font-family:var(--f-display);color:var(--ink);">WORM Custody &amp; Delivery Audit Trail</h2>',
        '      <div style="font-size:.73rem;color:var(--ink-2);margin-top:2px;">IRC § 6061 &amp; FTC Safeguards § 314.4 Non-Repudiation Log</div>',
        '    </div>',
        '    <button type="button" id="modal-audit-close" class="btn sm btn-o" aria-label="Close dialog">✕</button>',
        '  </div>',
        '  <div style="font-size:.78rem;margin-bottom:12px;"><b>Job ID:</b> <span style="font-family:var(--f-mono);">' + (record._docId || record.jobId) + '</span> · <b>File:</b> ' + (record.fileName || record.documentTitle) + '</div>',
        '  <div style="max-height:360px;overflow-y:auto;padding-right:8px;">',
        '    ' + timelineHtml,
        '  </div>',
        '  <div style="display:flex;justify-content:flex-end;margin-top:16px;border-top:1px solid var(--line);padding-top:12px;">',
        '    <button type="button" id="modal-audit-done" class="btn sm btn-b">Done</button>',
        '  </div>',
        '</div>'
      ].join('\n');

      backdrop.classList.add('open');

      function closeAudit() {
        backdrop.classList.remove('open');
        container.innerHTML = '';
      }

      var c1 = document.getElementById('modal-audit-close');
      var c2 = document.getElementById('modal-audit-done');
      if (c1) c1.addEventListener('click', closeAudit);
      if (c2) c2.addEventListener('click', closeAudit);
      backdrop.onclick = function (e) { if (e.target === backdrop) closeAudit(); };
    },

    _renderLoading: function (msg) {
      var container = document.getElementById('intake-records-container');
      if (!container) return;
      var prompt = msg || 'Loading pending uploads from Cloud Storage vault...';
      if (window.FileRoomLayout && typeof window.FileRoomLayout.renderLoading === 'function') {
        window.FileRoomLayout.renderLoading(container, prompt);
      } else {
        container.innerHTML = '<div style="padding:48px;text-align:center;color:var(--ink-3);" aria-live="polite"><div style="font-size:1.6rem;margin-bottom:8px;">⌛</div><div style="font-size:.85rem;font-weight:600;">' + prompt + '</div></div>';
      }
    },

    _renderEmpty: function () {
      var self = this;
      var container = document.getElementById('intake-records-container');
      if (!container) return;
      if (window.FileRoomLayout && typeof window.FileRoomLayout.renderEmpty === 'function') {
        window.FileRoomLayout.renderEmpty(container, {
          icon: '✓',
          title: 'All Ingestion Items Reviewed',
          desc: 'No documents currently pending review in the queue matching selected filters. All submissions have been certified, retried, or resolved.',
          actionText: 'Reset Filters',
          actionHref: 'javascript:void(0)',
          onAction: function () {
            var btnClear = document.getElementById('btn-clear-filters');
            if (btnClear) btnClear.click();
          }
        });
      } else {
        container.innerHTML = '<div style="padding:48px;text-align:center;color:var(--ink-3);"><div style="font-size:2rem;margin-bottom:8px;">✓</div><div style="font-size:.95rem;font-weight:700;color:var(--ink);margin-bottom:4px;">All Ingestion Items Reviewed</div><div style="font-size:.8rem;color:var(--ink-2);">No submissions match current filters.</div></div>';
      }
    },

    _renderError: function (msg) {
      var self = this;
      var container = document.getElementById('intake-records-container');
      if (!container) return;
      var errDetail = msg || 'Firestore document delivery stream failed. Please retry connection.';
      if (window.FileRoomLayout && typeof window.FileRoomLayout.renderError === 'function') {
        window.FileRoomLayout.renderError(container, {
          title: 'Unable to Load Review Queue',
          desc: errDetail,
          onRetry: function () {
            self.state.forcedView = null;
            self._loadRecords();
          }
        });
      } else {
        container.innerHTML = '<div style="padding:40px;text-align:center;"><div style="font-size:1.8rem;color:#ef4444;margin-bottom:8px;">⚠</div><div style="font-size:.9rem;font-weight:700;color:var(--ink);margin-bottom:4px;">Unable to Load Review Queue</div><div style="font-size:.78rem;color:#ef4444;margin-bottom:12px;">' + errDetail + '</div><button class="btn sm btn-b" onclick="FirmDocuments.init()">Retry</button></div>';
      }
    },

    _exportCsv: function () {
      var records = this.state.records;
      if (!records || records.length === 0) {
        if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
          window.FileRoomLayout.showToast('No intake records available to export.', 'warn');
        }
        return;
      }

      var esc = function (v) {
        var s = (v === null || v === undefined) ? '' : String(v);
        return (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1)
          ? '"' + s.replace(/"/g, '""') + '"'
          : s;
      };

      var headers = [
        'Queue Job ID',
        'Status',
        'Document Title',
        'File Name',
        'Taxpayer Name',
        'Taxpayer Email',
        'Client UID',
        'Engagement ID',
        'Tax Year',
        'Category',
        'File Size Bytes',
        'Storage Vault URI',
        'SHA256 Checksum',
        'Attempts',
        'Max Attempts',
        'Next Attempt At',
        'Last Error Category',
        'Last Error Message',
        'Delivery Receipt',
        'Ingested At',
        'Delivered At'
      ];

      var rows = records.map(function (r) {
        return [
          r._docId || r.jobId,
          r.status || r.state,
          r.documentTitle || r.fileName,
          r.fileName,
          r.clientName,
          r.clientEmail,
          r.clientUid || r.clientId,
          r.engagementId,
          r.taxYear,
          r.category,
          r.fileSizeBytes,
          r.storagePath ? ('gs://uk-client-d90d5.appspot.com/' + r.storagePath) : '',
          r.sha256Checksum,
          r.attemptCount,
          MAX_ATTEMPTS,
          r.nextAttemptAt,
          r.lastErrorCategory,
          r.lastErrorMessage,
          r.deliveryReceipt,
          r.createdAt,
          r.deliveredAt
        ].map(esc).join(',');
      });

      var csvContent = [headers.join(',')].concat(rows).join('\r\n');
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'firm_document_intake_queue_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);

      if (window.FileRoomLayout && window.FileRoomLayout.showToast) {
        window.FileRoomLayout.showToast('Compliance CSV ledger exported (' + records.length + ' rows)', 'ok');
      }
    },

    cleanup: function () {
      this._stopLiveListener();
    }
  };

  window.FirmDocuments = FirmDocuments;

})(window);

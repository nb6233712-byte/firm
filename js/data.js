/**
 * The File Room — Central Application State & Mock Database
 * Pivot Aide Tax
 */

window.FileRoomData = {
  user: {
    name: "Michael Whitfield",
    email: "m.whitfield@example.com",
    phoneLast4: "4417",
    verified: false,
    spouse: "Elena Whitfield",
    role: "client"
  },

  file: {
    year: 2026,
    filingStatus: "Married filing jointly",
    jurisdictions: "MD resident · VA and PA non-resident",
    stageName: "In preparation",
    progressPct: 68,
    assignedPreparer: "Denise R.",
    steps: [
      { id: 1, title: "Engagement letter signed", meta: "14 January", status: "done" },
      { id: 2, title: "Documents received — 11 of 13", meta: "Last upload 2 September", status: "done" },
      { id: 3, title: "Two documents still needed", meta: "Rental 1099-MISC and the Q4 mileage log", status: "now" },
      { id: 4, title: "Return prepared and reviewed", meta: "Estimated 9–11 September", status: "todo" },
      { id: 5, title: "You approve and sign Form 8879", meta: "Takes about four minutes", status: "todo" },
      { id: 6, title: "Filed and accepted", meta: "We watch for the acceptance and tell you", status: "todo" }
    ],
    upcomingDeadlines: [
      { label: "Q3 estimated payment", date: "15 Sep 2026" },
      { label: "Extended individual return deadline", date: "15 Oct 2026" },
      { label: "Year-end planning call", date: "Book in November" }
    ],
    activeScopes: [
      {
        id: "scope-current-1040",
        serviceKey: "individual",
        title: "2026 Individual Return (Form 1040)",
        status: "active",
        statusLabel: "Active Scope",
        details: "Federal + MD (resident), VA & PA (non-resident) · Schedules C & E",
        fee: "$1,240.00",
        date: "Engagement signed 14 Jan 2026"
      }
    ],
    pendingScopes: []
  },

  documents: [
    { id: "doc-1", name: "1099-MISC — Keystone Property Group", category: "needed", meta: "Rental income · requested 24 August", type: "1099-MISC", icon: "⚠" },
    { id: "doc-2", name: "Q4 mileage log", category: "needed", meta: "Schedule C · any format, a spreadsheet is fine", type: "Log", icon: "⚠" },
    { id: "doc-3", name: "Closing disclosure — 214 Halcyon Row", category: "review", meta: "Uploaded 2 September · Denise is reading it", type: "Settlement", icon: "◯" },
    { id: "doc-4", name: "W-2 — Halstead Medical Group", category: "received", meta: "Uploaded 28 August · Verified", type: "W-2", icon: "✓" },
    { id: "doc-5", name: "1099-NEC — Whitfield Design Co.", category: "received", meta: "Uploaded 28 August · Verified", type: "1099-NEC", icon: "✓" },
    { id: "doc-6", name: "1098 — mortgage interest", category: "received", meta: "Uploaded 26 August · Verified", type: "1098", icon: "✓" },
    { id: "doc-7", name: "Brokerage 1099 composite", category: "received", meta: "Uploaded 26 August · Verified", type: "1099-B", icon: "✓" },
    { id: "doc-8", name: "Prior year return — TY2025", category: "received", meta: "Carried over from your file", type: "1040", icon: "✓" },
    { id: "doc-9", name: "Property tax receipt — 214 Halcyon Row", category: "received", meta: "Uploaded 20 August · Verified", type: "Tax Receipt", icon: "✓" },
    { id: "doc-10", name: "1099-INT — Cardinal Trust Bank", category: "received", meta: "Uploaded 19 August · Verified", type: "1099-INT", icon: "✓" },
    { id: "doc-11", name: "HSA Form 1099-SA distribution", category: "received", meta: "Uploaded 18 August · Verified", type: "1099-SA", icon: "✓" },
    { id: "doc-12", name: "Estimated tax voucher copy (MD)", category: "received", meta: "Uploaded 15 August · Verified", type: "State Voucher", icon: "✓" },
    { id: "doc-13", name: "Charity gift receipts composite", category: "received", meta: "Uploaded 12 August · Verified", type: "Receipts", icon: "✓" }
  ],

  kbaQuiz: {
    currentStep: 1,
    attemptsLeft: 3,
    questions: [
      {
        question: "Which of these lenders held a mortgage in your name?",
        options: [
          "Cardinal Trust Bank",
          "Meridian Home Lending",
          "Fairwater Savings",
          "None of these"
        ],
        correctIndex: 1
      },
      {
        question: "In which of the following years was your vehicle registered in Maryland purchased?",
        options: [
          "2018",
          "2021",
          "2023",
          "None of these"
        ],
        correctIndex: 1
      },
      {
        question: "Which of the following addresses have you previously resided at?",
        options: [
          "742 Evergreen Terrace, Rockville MD",
          "814 North Calvert St, Baltimore MD",
          "1200 Grand Ave, Annapolis MD",
          "None of these"
        ],
        correctIndex: 1
      }
    ]
  },

  signatureRecord: {
    signed: false,
    method: null,
    timestamp: null,
    ip: "172.56.21.84",
    hash: null
  },

  taxReturn: {
    federalRefund: 3418.00,
    stateBalanceDue: 612.00,
    metrics: [
      { label: "Total income", value: "$214,806", change: "▲ 8%", good: true },
      { label: "Taxable income", value: "$168,240", change: null, good: null },
      { label: "Effective federal rate", value: "14.2%", change: null, good: null },
      { label: "Total tax", value: "$30,491", change: "▲ 3%", good: false }
    ],
    changes: [
      {
        title: "The rental went from a loss to a profit",
        desc: "Halcyon Row was let for the full year. Schedule E swings $9,100."
      },
      {
        title: "You bought equipment in November",
        desc: "Expensed in full this year rather than depreciated. Worth $2,780 to you."
      },
      {
        title: "Pennsylvania is new",
        desc: "Two months of on-site work created a non-resident filing there."
      }
    ],
    pages: [
      { title: "Form 1040 and schedules", pages: "14 pages", status: "Read" },
      { title: "Schedule C — Whitfield Design Co.", pages: "3 pages", status: "Read" },
      { title: "Schedule E — 214 Halcyon Row", pages: "2 pages", status: "Read" },
      { title: "Maryland 502 · Virginia 763 · Pennsylvania 40NR", pages: "19 pages", status: "Read" }
    ]
  },

  messages: [
    {
      id: "m-1",
      sender: "Denise · 2 Sep, 9:14",
      role: "preparer",
      avatar: "DR",
      text: "I have the closing disclosure — thank you. One question: was the Halcyon Row property let for the whole year, or was there a vacant stretch after the tenants left in March?"
    },
    {
      id: "m-2",
      sender: "You · 2 Sep, 9:31",
      role: "me",
      avatar: "MW",
      text: "Vacant for six weeks, then relet from mid-May. I can dig out the new lease if that helps."
    },
    {
      id: "m-3",
      sender: "Denise · 2 Sep, 9:38",
      role: "preparer",
      avatar: "DR",
      text: "The lease would help — upload it whenever. Six weeks vacant while it was available to let does not cost you the deduction, so this is good news rather than bad."
    },
    {
      id: "m-4",
      sender: "Uncle Pat · automatic",
      role: "pat",
      avatar: "PAT",
      text: "Reminder: your Q3 estimated payment is due 15 September. The voucher is in your documents, and you can pay it from the Billing tab."
    }
  ],

  services: [
    {
      id: "svc-1",
      key: "individual",
      title: "Individual return",
      desc: "Federal and every state you need. Upfront price, no mystery invoice.",
      price: "from $200",
      actionText: "Add",
      basePrice: 200,
      activeOnCurrentFile: true
    },
    {
      id: "svc-2",
      key: "business",
      title: "Business return",
      desc: "S-corp, partnership, C-corp. Books reviewed before the return is built.",
      price: "quoted on scope",
      actionText: "Add",
      basePrice: 850
    },
    {
      id: "svc-3",
      key: "bookkeeping",
      title: "Bookkeeping",
      desc: "Monthly reconciliation and statements you can actually use.",
      price: "monthly",
      actionText: "Add",
      basePrice: 195
    },
    {
      id: "svc-4",
      key: "cleanup",
      title: "Accounting cleanup",
      desc: "Catch-up and reconstruction, so the return stands on numbers that are right.",
      price: "quoted on scope",
      actionText: "Add",
      basePrice: 650
    },
    {
      id: "svc-5",
      key: "audit",
      title: "Audit & resolution",
      desc: "Notices, examinations, back taxes, unfiled years.",
      price: "by tier",
      actionText: "Add",
      basePrice: 150
    },
    {
      id: "svc-6",
      key: "flagship",
      title: "The Standing File",
      desc: "Year-long strategy, a dedicated advisor, premium support. For high-income individuals and for businesses.",
      price: "contact for pricing",
      actionText: "Talk to us",
      flagship: true
    }
  ],

  billing: {
    selectedInvoiceId: "inv_2026_0418",
    autoPayEnabled: false,
    savedAccount: {
      bank: "Cardinal Trust",
      last4: "8842",
      type: "Checking",
      savedDate: "March 2026"
    },
    invoices: [
      {
        invoiceId: "inv_2026_0418",
        firmId: "firm_pivot_aide",
        clientId: "usr_whitfield_m",
        engagementId: "eng_2026_1040",
        items: [
          { desc: "Individual return — federal Form 1040", amount: 400.00 },
          { desc: "Maryland, Virginia, Pennsylvania returns", amount: 285.00 },
          { desc: "Schedule C — Whitfield Design Co. (Sole Prop)", amount: 310.00 },
          { desc: "Schedule E — one rental property (214 Halcyon Row)", amount: 245.00 }
        ],
        subtotal: 1240.00,
        fees: 0.00,
        total: 1240.00,
        currency: "USD",
        status: "issued", // draft | issued | pending | paid | failed | void
        dueDate: "2026-09-15",
        createdAt: "2026-08-25T09:00:00.000Z",
        paidAt: null,
        paidMethod: null,
        txnHash: null,
        paymentSessionId: null
      },
      {
        invoiceId: "inv_2026_0207",
        firmId: "firm_pivot_aide",
        clientId: "usr_whitfield_m",
        engagementId: "eng_2026_advisory",
        items: [
          { desc: "Q1 tax projection & estimated tax strategy session", amount: 350.00 }
        ],
        subtotal: 350.00,
        fees: 0.00,
        total: 350.00,
        currency: "USD",
        status: "paid",
        dueDate: "2026-04-15",
        createdAt: "2026-03-25T10:00:00.000Z",
        paidAt: "2026-04-03T14:22:00.000Z",
        paidMethod: "Bank transfer (ACH · Cardinal Trust •••• 8842)",
        txnHash: "ACH-982104-CARDINAL",
        paymentSessionId: "cs_live_98210403"
      },
      {
        invoiceId: "inv_2025_1140",
        firmId: "firm_pivot_aide",
        clientId: "usr_whitfield_m",
        engagementId: "eng_2025_1040",
        items: [
          { desc: "Individual return — TY2025 Form 1040 federal", amount: 375.00 },
          { desc: "Maryland 502 & Virginia 763 returns", amount: 190.00 },
          { desc: "Schedule C — Whitfield Design Co.", amount: 295.00 },
          { desc: "Schedule E — Halcyon Row rental property", amount: 245.00 }
        ],
        subtotal: 1105.00,
        fees: 0.00,
        total: 1105.00,
        currency: "USD",
        status: "paid",
        dueDate: "2026-02-15",
        createdAt: "2026-01-28T11:00:00.000Z",
        paidAt: "2026-02-12T11:05:00.000Z",
        paidMethod: "Bank transfer (ACH · Cardinal Trust •••• 8842)",
        txnHash: "ACH-774190-CARDINAL",
        paymentSessionId: "cs_live_77419012"
      }
    ]
  },

  services: [
    {
      serviceId: "svc_individual_1040",
      firmId: "firm_pivot_aide",
      name: "Individual return",
      description: "Federal and every state you need. Upfront price, no mystery invoice.",
      price: 200,
      billingType: "fixed",
      category: "tax_prep",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "individual",
      priceDisplay: "from $200"
    },
    {
      serviceId: "svc_business_entity",
      firmId: "firm_pivot_aide",
      name: "Business return",
      description: "S-corp, partnership, C-corp. Books reviewed before the return is built.",
      price: 850,
      billingType: "quoted",
      category: "tax_prep",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "business",
      priceDisplay: "quoted on scope"
    },
    {
      serviceId: "svc_bookkeeping_monthly",
      firmId: "firm_pivot_aide",
      name: "Bookkeeping",
      description: "Monthly reconciliation and statements you can actually use.",
      price: 195,
      billingType: "monthly",
      category: "accounting",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "bookkeeping",
      priceDisplay: "monthly"
    },
    {
      serviceId: "svc_accounting_cleanup",
      firmId: "firm_pivot_aide",
      name: "Accounting cleanup",
      description: "Catch-up and reconstruction, so the return stands on numbers that are right.",
      price: 650,
      billingType: "quoted",
      category: "accounting",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "cleanup",
      priceDisplay: "quoted on scope"
    },
    {
      serviceId: "svc_audit_resolution",
      firmId: "firm_pivot_aide",
      name: "Audit & resolution",
      description: "Notices, examinations, back taxes, unfiled years.",
      price: 150,
      billingType: "tiered",
      category: "resolution",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "audit",
      priceDisplay: "by tier"
    },
    {
      serviceId: "svc_standing_file",
      firmId: "firm_pivot_aide",
      name: "The Standing File",
      description: "Year-long strategy, a dedicated advisor, premium support. For high-income individuals and for businesses.",
      price: 2500,
      billingType: "custom",
      category: "advisory",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "flagship",
      priceDisplay: "contact for pricing"
    },
    {
      serviceId: "svc_estate_trust",
      firmId: "firm_pivot_aide",
      name: "Estate & Trust Form 1041",
      description: "Fiduciary income tax returns, distributable net income schedules, and grantor trusts.",
      price: 1200,
      billingType: "quoted",
      category: "advisory",
      active: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      serviceKey: "estate_trust",
      priceDisplay: "from $1,200"
    }
  ],

  updates: [
    // 1. CLIENT-SPECIFIC EVENTS (Confidential, 1:1 taxpayer file events)
    {
      id: "u-1",
      updateId: "u-1",
      type: "client_event",
      category: "action",
      scope: "client",
      clientId: "usr_whitfield_m",
      title: "Your Form 8879 is ready to sign",
      meta: "Once both signatures are in we transmit, usually the next business day.",
      time: "Today, 8:02 AM",
      publishedAt: "2026-09-02T08:02:00.000Z",
      isNew: true,
      isRead: false,
      actionScreen: "sign",
      actionText: "Sign Form 8879",
      details: {
        summary: "Form 8879 (IRS e-file Signature Authorization) is prepared and awaiting taxpayer signature under IRS Pub 1345 § 5.2."
      }
    },
    {
      id: "u-2",
      updateId: "u-2",
      type: "client_event",
      category: "messages",
      scope: "client",
      clientId: "usr_whitfield_m",
      title: "Denise replied about the Halcyon Row vacancy",
      meta: "Six weeks vacant while available to let does not cost you the deduction.",
      time: "2 Sep, 9:38 AM",
      publishedAt: "2026-09-02T09:38:00.000Z",
      isNew: true,
      isRead: false,
      actionScreen: "msgs",
      actionText: "Open Message Thread",
      details: {
        summary: "Preparer response regarding rental schedule vacancy deduction rules under Treas. Reg. § 1.469."
      }
    },
    {
      id: "u-3",
      updateId: "u-3",
      type: "client_event",
      category: "engagement",
      scope: "client",
      clientId: "usr_whitfield_m",
      title: "Pennsylvania added to your file",
      meta: "Two months of on-site work created a non-resident filing obligation.",
      time: "29 Aug 2026",
      publishedAt: "2026-08-29T11:15:00.000Z",
      isNew: false,
      isRead: true,
      actionScreen: "svcs",
      actionText: "Review Scope",
      details: {
        summary: "Engagement amended to include Pennsylvania Form 40NR (Non-resident Individual Income Tax Return)."
      }
    },

    // 2. FIRM-WIDE ANNOUNCEMENTS (Broadcast, 1:N operational bulletins)
    {
      id: "u-firm-1",
      updateId: "u-firm-1",
      type: "firm_announcement",
      category: "announcement",
      scope: "firm",
      clientId: null,
      firmId: "firm_pivot_aide",
      title: "Fall Filing Season Office Hours & Preparer Availability",
      meta: "Support and secure messaging queues are operating extended hours through October 15.",
      time: "1 Sep 2026",
      publishedAt: "2026-09-01T10:00:00.000Z",
      isNew: false,
      isRead: true,
      actionScreen: "firm",
      actionText: "Firm Bulletin",
      details: {
        headline: "Fall Filing Season Schedule & Extended Hours",
        summary: "Pivot Aide Tax will operate extended hours Monday through Saturday through the October 15 extension deadline. Preparer review queues are staffed to ensure turnaround within one business day.",
        department: "Firm Operations Console",
        effectiveDates: "September 1 – October 15, 2026"
      }
    },
    {
      id: "u-firm-2",
      updateId: "u-firm-2",
      type: "firm_announcement",
      category: "announcement",
      scope: "firm",
      clientId: null,
      firmId: "firm_pivot_aide",
      title: "IRS Modernized e-File (MeF) Scheduled Maintenance Window",
      meta: "IRS scheduled maintenance this Sunday 1:00 AM – 7:00 AM ET. Transmission queues hold automatically.",
      time: "28 Aug 2026",
      publishedAt: "2026-08-28T16:00:00.000Z",
      isNew: false,
      isRead: true,
      actionScreen: "firm",
      actionText: "View Operational Advisory",
      details: {
        headline: "IRS MeF Weekend Maintenance Window",
        summary: "The IRS will conduct scheduled production maintenance this Sunday between 01:00 ET and 07:00 ET. E-file transmissions sent during this period will be queued securely on Pivot Aide servers and submitted upon IRS system restart.",
        department: "Systems & E-File Operations",
        effectiveDates: "Sunday 01:00 – 07:00 ET"
      }
    },

    // 3. REGULATORY / TAX UPDATES (Educational & statutory summaries; strictly separated from tax advice)
    {
      id: "u-reg-1",
      updateId: "u-reg-1",
      type: "regulatory_update",
      category: "statutory",
      scope: "public",
      clientId: null,
      firmId: "firm_pivot_aide",
      title: "Rule change that affects your rental property",
      meta: "Uncle Pat's 2-minute breakdown on vacancy deductions under Treas. Reg. § 1.469.",
      time: "18 Aug 2026",
      publishedAt: "2026-08-18T14:20:00.000Z",
      isNew: false,
      isRead: true,
      actionScreen: "rule-modal",
      actionText: "Read 2-Min Breakdown",
      ruleArticle: {
        title: "Treasury Reg. § 1.469 Vacancy Deduction Clarification",
        statutoryCitation: "26 C.F.R. § 1.469-2(d)(5) & Rev. Rul. 80-266",
        summary: "The IRS issued revised administrative guidance on residential rental properties that experience short periods of vacancy between tenant leases during the tax calendar year.",
        keyTakeaway: "Good news for 214 Halcyon Row: As long as the property was actively marketed and held out for rent after the vacancy, you retain 100% of your Schedule E depreciation, mortgage interest, and property tax deductions for the entire 12-month period.",
        impact: "$0 loss of rental deductions. Your projected Schedule E profit swing of $9,100 stands.",
        statutoryDisclaimer: "Informational legal summary only. Under Treasury Circular 230 and AICPA Statements on Standards for Tax Services, this content does not constitute algorithmic tax calculation, automated advice, or a formal tax opinion. Specific application depends on complete taxpayer records reviewed by a licensed professional."
      }
    },
    {
      id: "u-reg-2",
      updateId: "u-reg-2",
      type: "regulatory_update",
      category: "statutory",
      scope: "public",
      clientId: null,
      firmId: "firm_pivot_aide",
      title: "Qualified Business Income (IRC § 199A) TY2026 Thresholds",
      meta: "IRS Rev. Proc. annual inflation adjustments for pass-through deduction phase-in ranges.",
      time: "10 Aug 2026",
      publishedAt: "2026-08-10T12:00:00.000Z",
      isNew: false,
      isRead: true,
      actionScreen: "rule-modal",
      actionText: "Read Statutory Summary",
      ruleArticle: {
        title: "Internal Revenue Code § 199A QBI Inflation Adjustments",
        statutoryCitation: "26 U.S.C. § 199A(e)(2) & IRS Rev. Proc. 2025-50",
        summary: "The IRS announced updated inflation thresholds for the 20% Section 199A Qualified Business Income deduction for pass-through entities and sole proprietors for the current tax year.",
        keyTakeaway: "Threshold limits for joint filers increase before W-2 wage / UBIA limitations begin to phase in. Allows eligible taxpayers to maximize pass-through deductions within expanded safe harbor bands.",
        impact: "Informational baseline for small business and rental activities.",
        statutoryDisclaimer: "Informational summary only. Tax code interpretations vary by entity classification and service trade definitions. Does not constitute tax calculation or professional advice under Treasury Circular 230."
      }
    },

    // 4. DEADLINE REMINDERS (Time-critical statutory & filing calendar dates)
    {
      id: "u-dead-1",
      updateId: "u-dead-1",
      type: "deadline_reminder",
      category: "deadline",
      scope: "client",
      clientId: "usr_whitfield_m",
      firmId: "firm_pivot_aide",
      title: "Q3 estimated payment due 15 September",
      meta: "IRS & Maryland Form 1040-ES / 502D vouchers are ready in Billing.",
      time: "25 Aug 2026",
      publishedAt: "2026-08-25T09:00:00.000Z",
      deadlineDate: "2026-09-15",
      isNew: false,
      isRead: true,
      actionScreen: "pay",
      actionText: "Pay Voucher in Billing",
      details: {
        summary: "IRS and Maryland Q3 2026 estimated tax payment voucher due date: September 15, 2026. Electronic payment available at marylandtaxes.gov, IRS Direct Pay, or through in-app Billing.",
        statutoryAgency: "Internal Revenue Service & Comptroller of Maryland",
        statutoryForm: "Form 1040-ES / Form 502D",
        dueDate: "September 15, 2026",
        penaltyNotice: "Underpayment of estimated taxes incurs IRC § 6654 statutory interest charges. Timely payment prevents accrual."
      }
    },
    {
      id: "u-dead-2",
      updateId: "u-dead-2",
      type: "deadline_reminder",
      category: "deadline",
      scope: "client",
      clientId: "usr_whitfield_m",
      firmId: "firm_pivot_aide",
      title: "Final Individual Extension Deadline: 15 October",
      meta: "Form 4868 six-month extension period terminates October 15 for TY2025 returns.",
      time: "20 Aug 2026",
      publishedAt: "2026-08-20T09:00:00.000Z",
      deadlineDate: "2026-10-15",
      isNew: false,
      isRead: true,
      actionScreen: "return",
      actionText: "Review Prepared Return",
      details: {
        summary: "October 15, 2026 is the statutory cutoff for taxpayers filing under Form 4868 automatic extension. All e-files must be transmitted and acknowledged by IRS MeF before midnight local time.",
        statutoryAgency: "Internal Revenue Service",
        statutoryForm: "Form 1040 (Extended)",
        dueDate: "October 15, 2026",
        penaltyNotice: "Failure to file by October 15 voids extension protection and triggers IRC § 6651 late filing penalties."
      }
    }
  ],

  notificationSettings: {
    needsYou: "push-email",
    stageMove: "push-email",
    deadlines: "push-email",
    ruleChanges: "email",
    firmNews: "off"
  },

  firmTriage: {
    stats: {
      waitingOnClient: 17,
      readyToReview: 6,
      needsActionToday: 4
    },
    actionQueue: [
      { id: "t-1", name: "Okonjo, A.", issue: "8879 unsigned 6 days", sub: "Two reminders sent · escalate to a call", chip: "Chase", chipClass: "warn", action: "chase" },
      { id: "t-2", name: "Brennan Holdings LLC", issue: "KBA failed 3×", sub: "Switch to wet signature", chip: "Act", chipClass: "warn", action: "wet-signature" },
      { id: "t-3", name: "Whitfield, M. & E.", issue: "2 docs outstanding", sub: "Auto-reminder goes out tomorrow", chip: "Waiting", chipClass: "", action: "view" },
      { id: "t-4", name: "Ferrante, L.", issue: "IRS notice uploaded", sub: "Free read promised within 2 business days", chip: "Due Thu", chipClass: "", action: "notice-review" }
    ],
    auditLogs: [
      { time: "Today, 14:02", user: "Denise R.", action: "Viewed 214 Halcyon Row closing disclosure" },
      { time: "Today, 08:02", user: "System", action: "Generated Form 8879 package for Whitfield, M." },
      { time: "2 Sep, 09:38", user: "Denise R.", action: "Sent message regarding Halcyon Row vacancy" },
      { time: "28 Aug, 16:40", user: "Security", action: "Completed upload malware scan: 0 threats found" }
    ]
  }
};

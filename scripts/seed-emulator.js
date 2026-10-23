/**
 * ============================================================================
 * THE FILE ROOM — FIRESTORE EMULATOR SEED SCRIPT
 * scripts/seed-emulator.js
 * ============================================================================
 * Seeds practice engagements, document requests, documents, invoices, messages,
 * and signature records into the local Firestore Emulator at 127.0.0.1:8080.
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const admin = require('../functions/node_modules/firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'uk-client-d90d5' });
}

const db = admin.firestore();

async function seed() {
  console.log('🌱 Seeding Firestore Emulator (127.0.0.1:8080)...');

  // 1. Practice Engagements
  const engagements = [
    {
      id: 'eng_2026_whitfield',
      engagementId: 'eng_2026_whitfield',
      clientUid: 'usr_whitfield_4417',
      clientId: 'usr_whitfield_4417',
      clientName: 'Michael & Elena Whitfield',
      clientEmail: 'm.whitfield@example.com',
      taxYear: 2026,
      filingType: 'Form 1040 (Joint)',
      stage: 3,
      stageName: 'In Preparation',
      preparer: 'Denise Rosenthal, CPA',
      assignedPreparer: 'Denise Rosenthal, CPA',
      preparerEmail: 'denise@pivot-aide.tax',
      lastActivity: 'Closing Disclosure uploaded',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'eng_2026_brennan_llc',
      engagementId: 'eng_2026_brennan_llc',
      clientUid: 'usr_brennan_llc',
      clientId: 'usr_brennan_llc',
      clientName: 'Brennan Holdings LLC',
      clientEmail: 'c.brennan@brennanholdings.com',
      taxYear: 2026,
      filingType: 'Form 1065 (Partnership)',
      stage: 4,
      stageName: 'Senior CPA Review',
      preparer: 'Marcus Chen, EA',
      assignedPreparer: 'Marcus Chen, EA',
      preparerEmail: 'marcus@pivot-aide.tax',
      lastActivity: 'Schedule K-1 draft under review',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'eng_2026_jenkins',
      engagementId: 'eng_2026_jenkins',
      clientUid: 'usr_jenkins_8819',
      clientId: 'usr_jenkins_8819',
      clientName: 'Sarah Jenkins',
      clientEmail: 's.jenkins@example.com',
      taxYear: 2026,
      filingType: 'Form 1040 (Single)',
      stage: 5,
      stageName: 'Client Signature (8879)',
      preparer: 'Denise Rosenthal, CPA',
      assignedPreparer: 'Denise Rosenthal, CPA',
      preparerEmail: 'denise@pivot-aide.tax',
      lastActivity: 'Form 8879 envelope delivered',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'eng_2026_okonjo',
      engagementId: 'eng_2026_okonjo',
      clientUid: 'usr_okonjo_3120',
      clientId: 'usr_okonjo_3120',
      clientName: 'Ada Okonjo',
      clientEmail: 'a.okonjo@example.com',
      taxYear: 2026,
      filingType: 'Form 1040 + Schedule C',
      stage: 2,
      stageName: 'Documents Pending',
      preparer: 'Denise Rosenthal, CPA',
      assignedPreparer: 'Denise Rosenthal, CPA',
      preparerEmail: 'denise@pivot-aide.tax',
      lastActivity: 'Missing 1099-K Square processing',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'eng_2026_vance_corp',
      engagementId: 'eng_2026_vance_corp',
      clientUid: 'usr_vance_9011',
      clientId: 'usr_vance_9011',
      clientName: 'Vance Logistics Corp',
      clientEmail: 't.vance@vancelogistics.com',
      taxYear: 2026,
      filingType: 'Form 1120-S',
      stage: 6,
      stageName: 'E-File Transmitted',
      preparer: 'Elena Rostova, CPA',
      assignedPreparer: 'Elena Rostova, CPA',
      preparerEmail: 'elena@pivot-aide.tax',
      lastActivity: 'IRS MeF acceptance received',
      updatedAt: new Date().toISOString()
    }
  ];

  for (const eng of engagements) {
    await db.collection('engagements').doc(eng.id).set(eng, { merge: true });
    await db.collection('clients').doc(eng.clientUid).set({
      clientId: eng.clientUid,
      clientUid: eng.clientUid,
      displayName: eng.clientName,
      name: eng.clientName,
      email: eng.clientEmail,
      filingType: eng.filingType,
      role: 'client'
    }, { merge: true });
  }
  console.log('✓ Seeded ' + engagements.length + ' engagements & client profiles.');

  // 2. Document Requests (Checklist)
  const docRequests = [
    {
      id: 'req_whitfield_1099_misc',
      requestId: 'req_whitfield_1099_misc',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      title: 'Form 1099-MISC (Keystone Rental)',
      description: 'Rental property income statement from Keystone Management LLC.',
      status: 'pending',
      urgency: 'high',
      category: 'Income',
      requestedAt: '2026-09-01T10:00:00Z',
      dueDate: '15 Sep 2026'
    },
    {
      id: 'req_whitfield_mileage_log',
      requestId: 'req_whitfield_mileage_log',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      title: 'Q4 Business Mileage Log',
      description: 'Log of business travel mileage for consulting vehicle.',
      status: 'pending',
      urgency: 'medium',
      category: 'Deductions',
      requestedAt: '2026-09-01T10:00:00Z',
      dueDate: '15 Sep 2026'
    },
    {
      id: 'req_whitfield_closing_disclosure',
      requestId: 'req_whitfield_closing_disclosure',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      title: 'Closing Disclosure (Refinance)',
      description: 'HUD-1 / Closing statement for primary residence refinance.',
      status: 'review',
      urgency: 'high',
      category: 'Real Estate',
      uploadedFile: 'Closing_Disclosure_Refi.pdf',
      uploadedAt: '2026-10-16T01:15:00Z',
      fileSize: '2.4 MB'
    },
    {
      id: 'req_brennan_k1',
      requestId: 'req_brennan_k1',
      engagementId: 'eng_2026_brennan_llc',
      clientId: 'usr_brennan_llc',
      title: 'Schedule K-1 from Real Estate LP',
      description: 'Passthrough entity tax reporting statement.',
      status: 'review',
      uploadedFile: 'RE_LP_Schedule_K1.pdf',
      uploadedAt: '2026-10-15T14:30:00Z'
    },
    {
      id: 'req_okonjo_1099k',
      requestId: 'req_okonjo_1099k',
      engagementId: 'eng_2026_okonjo',
      clientId: 'usr_okonjo_3120',
      title: 'Form 1099-K Square Processing',
      description: 'Merchant card and third party network payments report.',
      status: 'pending',
      dueDate: '10 Sep 2026'
    }
  ];

  for (const req of docRequests) {
    await db.collection('documentRequests').doc(req.id).set(req, { merge: true });
  }
  console.log('✓ Seeded ' + docRequests.length + ' document requests.');

  // 3. Uploaded Documents
  const documents = [
    {
      id: 'doc_whitfield_w2_01',
      documentId: 'doc_whitfield_w2_01',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      fileName: 'Whitfield_W2_Primary.pdf',
      category: 'W-2',
      fileSize: '412 KB',
      status: 'approved',
      reviewStatus: 'approved',
      storageState: 'stored',
      uploadedAt: '2026-09-02T11:20:00Z'
    },
    {
      id: 'doc_whitfield_w2_02',
      documentId: 'doc_whitfield_w2_02',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      fileName: 'Elena_Whitfield_W2.pdf',
      category: 'W-2',
      fileSize: '388 KB',
      status: 'approved',
      reviewStatus: 'approved',
      storageState: 'stored',
      uploadedAt: '2026-09-02T11:22:00Z'
    },
    {
      id: 'doc_whitfield_closing_stmt',
      documentId: 'doc_whitfield_closing_stmt',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      fileName: 'Closing_Disclosure_Refi.pdf',
      category: 'Real Estate',
      fileSize: '2.4 MB',
      status: 'review',
      reviewStatus: 'pending_review',
      storageState: 'stored',
      uploadedAt: '2026-10-16T01:15:00Z'
    }
  ];

  for (const doc of documents) {
    await db.collection('documents').doc(doc.id).set(doc, { merge: true });
  }
  console.log('✓ Seeded ' + documents.length + ' uploaded documents.');

  // 4. Invoices
  const invoices = [
    {
      id: 'inv_2026_0418',
      invoiceId: 'inv_2026_0418',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      clientName: 'Michael & Elena Whitfield',
      title: 'TY 2026 Individual Tax Preparation (Form 1040 + MD/VA/PA)',
      amountDue: 1240.00,
      totalAmount: 1240.00,
      amount: 1240.00,
      status: 'issued',
      dueDate: '15 Oct 2026',
      issuedDate: '2026-09-01',
      stripeStatus: 'awaiting_payment'
    },
    {
      id: 'inv_2026_0419',
      invoiceId: 'inv_2026_0419',
      engagementId: 'eng_2026_jenkins',
      clientId: 'usr_jenkins_8819',
      clientName: 'Sarah Jenkins',
      title: 'TY 2026 Individual Return Filing',
      amountDue: 390.00,
      totalAmount: 390.00,
      amount: 390.00,
      status: 'issued',
      dueDate: '01 Oct 2026',
      issuedDate: '2026-09-05'
    },
    {
      id: 'inv_2026_0420',
      invoiceId: 'inv_2026_0420',
      engagementId: 'eng_2026_brennan_llc',
      clientId: 'usr_brennan_llc',
      clientName: 'Brennan Holdings LLC',
      title: 'Partnership Form 1065 + State Filings',
      amountDue: 1650.00,
      totalAmount: 1650.00,
      amount: 1650.00,
      status: 'past_due',
      dueDate: '15 Sep 2026',
      issuedDate: '2026-08-15'
    }
  ];

  for (const inv of invoices) {
    await db.collection('invoices').doc(inv.id).set(inv, { merge: true });
  }
  console.log('✓ Seeded ' + invoices.length + ' invoices.');

  // 5. Signatures (Form 8879 / KBA)
  const signatures = [
    {
      id: 'sig_whitfield_8879',
      signatureId: 'sig_whitfield_8879',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      taxYear: 2026,
      formType: 'Form 8879 (IRS e-file Signature Authorization)',
      status: 'pending',
      primarySigner: {
        name: 'Michael Whitfield',
        email: 'm.whitfield@example.com',
        status: 'pending',
        kbaPassed: false
      },
      secondarySigner: {
        name: 'Elena Whitfield',
        email: 'elena.w@example.com',
        status: 'pending',
        kbaPassed: false
      },
      createdDate: '2026-09-10'
    },
    {
      id: 'sig_jenkins_8879',
      signatureId: 'sig_jenkins_8879',
      engagementId: 'eng_2026_jenkins',
      clientId: 'usr_jenkins_8819',
      taxYear: 2026,
      formType: 'Form 8879',
      status: 'pending',
      primarySigner: {
        name: 'Sarah Jenkins',
        email: 's.jenkins@example.com',
        status: 'pending',
        kbaPassed: true
      }
    }
  ];

  for (const sig of signatures) {
    await db.collection('signatures').doc(sig.id).set(sig, { merge: true });
  }
  console.log('✓ Seeded ' + signatures.length + ' signature envelopes.');

  // 6. Tax Returns
  const returns = [
    {
      id: 'ret_2026_whitfield_1040',
      returnId: 'ret_2026_whitfield_1040',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      form: 'Form 1040 (Joint)',
      taxYear: 2026,
      status: 'in_preparation',
      approvalStatus: 'pending_review',
      clientAuthorized: false,
      agi: 168400,
      totalTax: 21850,
      refundAmount: 3418,
      states: ['MD', 'VA', 'PA']
    }
  ];

  for (const ret of returns) {
    await db.collection('tax_returns').doc(ret.id).set(ret, { merge: true });
  }
  console.log('✓ Seeded ' + returns.length + ' tax returns.');

  // 7. Messages
  const messages = [
    {
      id: 'msg_whitfield_001',
      messageId: 'msg_whitfield_001',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      clientUid: 'usr_whitfield_4417',
      taxYear: 2026,
      text: 'Hi Denise, we just uploaded our Closing Disclosure for the refinance. Let us know if you need anything else for Schedule E.',
      senderId: 'usr_whitfield_4417',
      senderUid: 'usr_whitfield_4417',
      senderName: 'Michael Whitfield',
      senderRole: 'client',
      avatar: 'MW',
      readByClient: true,
      readByFirm: false,
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      id: 'msg_whitfield_002',
      messageId: 'msg_whitfield_002',
      engagementId: 'eng_2026_whitfield',
      clientId: 'usr_whitfield_4417',
      clientUid: 'usr_whitfield_4417',
      taxYear: 2026,
      text: 'Thanks Michael! I received the Closing Disclosure and am reviewing the loan origination points right now. Once Keystone sends the 1099-MISC, we will finalize Form 8879.',
      senderId: 'preparer_denise_cpa',
      senderUid: 'preparer_denise_cpa',
      senderName: 'Denise Rosenthal, CPA',
      senderRole: 'firm_staff',
      avatar: 'DR',
      readByClient: true,
      readByFirm: true,
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString()
    }
  ];

  for (const msg of messages) {
    await db.collection('messages').doc(msg.id).set(msg, { merge: true });
  }
  console.log('✓ Seeded ' + messages.length + ' messages.');

  // 8. Document Delivery Queue (All 7 States)
  const deliveryJobs = [
    {
      jobId: 'ddq_okonjo_closing_2026_a992',
      id: 'ddq_okonjo_closing_2026_a992',
      idempotencyKey: 'idemp_usr_okonjo_3120_closing_stmt',
      documentId: 'doc_okonjo_closing_stmt',
      clientId: 'usr_okonjo_3120',
      clientName: 'Ada Okonjo',
      taxpayerName: 'Ada Okonjo',
      engagementId: 'eng_2026_okonjo',
      engagementName: '2026 Form 1120-S Corporate',
      fileName: 'HUD1_Settlement_Closing_Statement_2026.pdf',
      fileSize: '2.1 MB',
      taxYear: 2026,
      storageStatus: 'vault_secured',
      storagePath: 'clients/usr_okonjo_3120/tax-years/2026/documents/HUD1_Settlement_Closing_Statement_2026.pdf',
      status: 'queued',
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: '2026-10-15T22:04:00.000Z',
      updatedAt: '2026-10-15T22:04:00.000Z'
    },
    {
      jobId: 'ddq_bennett_1098_2026_c311',
      id: 'ddq_bennett_1098_2026_c311',
      idempotencyKey: 'idemp_usr_taylor_bennett_1098',
      documentId: 'doc_bennett_1098',
      clientId: 'usr_taylor_bennett',
      clientName: 'Taylor Bennett',
      taxpayerName: 'Taylor Bennett',
      engagementId: 'eng_bennett_2026_1040',
      engagementName: '2026 Form 1040 Schedule C',
      fileName: 'Form_1098_Mortgage_Interest_2026.pdf',
      fileSize: '1.1 MB',
      taxYear: 2026,
      storageStatus: 'vault_secured',
      storagePath: 'clients/usr_taylor_bennett/tax-years/2026/documents/Form_1098_Mortgage_Interest_2026.pdf',
      status: 'processing',
      attemptCount: 1,
      maxAttempts: 5,
      leaseWorkerId: 'worker_srv_usc',
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: '2026-10-15T22:02:00.000Z',
      updatedAt: '2026-10-15T22:02:30.000Z'
    },
    {
      jobId: 'ddq_whitfield_1099nec_2026_f4a2',
      id: 'ddq_whitfield_1099nec_2026_f4a2',
      idempotencyKey: 'idemp_usr_whitfield_4417_doc_1099_nec',
      documentId: 'doc_1099_nec',
      clientId: 'usr_whitfield_4417',
      clientName: 'Michael Whitfield',
      taxpayerName: 'Michael Whitfield',
      engagementId: 'eng_2026_whitfield',
      engagementName: '2026 Form 1040 Individual',
      fileName: '1099-NEC_Consulting_2026.pdf',
      fileSize: '840 KB',
      taxYear: 2026,
      storageStatus: 'vault_secured',
      storagePath: 'clients/usr_whitfield_4417/tax-years/2026/documents/1099-NEC_Consulting_2026.pdf',
      status: 'retry_pending',
      attemptCount: 2,
      maxAttempts: 5,
      lastErrorCategory: 'RATE_LIMITED_429',
      lastErrorMessage: 'HTTP 429 Rate Limited. Retry-After header honored: backoff scheduled.',
      createdAt: '2026-10-15T16:20:00.000Z',
      updatedAt: '2026-10-15T16:28:10.000Z'
    },
    {
      jobId: 'ddq_whitfield_w2_2026_ac81',
      id: 'ddq_whitfield_w2_2026_ac81',
      idempotencyKey: 'idemp_usr_whitfield_4417_doc_w2_acme',
      documentId: 'doc_w2_acme',
      clientId: 'usr_whitfield_4417',
      clientName: 'Michael Whitfield',
      taxpayerName: 'Michael Whitfield',
      engagementId: 'eng_2026_whitfield',
      engagementName: '2026 Form 1040 Individual',
      fileName: 'W-2_Acme_Holdings_2026.pdf',
      fileSize: '1.4 MB',
      taxYear: 2026,
      storageStatus: 'vault_secured',
      status: 'delivered',
      attemptCount: 1,
      maxAttempts: 5,
      deliveredAt: '2026-10-15T15:12:00.000Z',
      createdAt: '2026-10-15T15:10:00.000Z',
      updatedAt: '2026-10-15T15:12:00.000Z'
    },
    {
      jobId: 'ddq_brennan_k1_2026_e319',
      id: 'ddq_brennan_k1_2026_e319',
      idempotencyKey: 'idemp_usr_brennan_llc_doc_k1',
      documentId: 'doc_k1_brennan',
      clientId: 'usr_brennan_llc',
      clientName: 'Brennan Holdings LLC',
      taxpayerName: 'Charles Brennan',
      engagementId: 'eng_2026_brennan_llc',
      engagementName: '2026 Form 1065 Partnership',
      fileName: 'Schedule_K1_Brennan_Enterprises_2026.pdf',
      fileSize: '3.2 MB',
      taxYear: 2026,
      storageStatus: 'vault_secured',
      status: 'needs_review',
      attemptCount: 5,
      maxAttempts: 5,
      lastErrorCategory: 'RETRY_BUDGET_EXHAUSTED',
      lastErrorMessage: 'HTTP 504 Gateway Timeout on attempt 5/5. Escalated to Dead-Letter.',
      createdAt: '2026-10-15T14:10:00.000Z',
      updatedAt: '2026-10-15T14:45:00.000Z'
    }
  ];

  for (const job of deliveryJobs) {
    await db.collection('document_delivery_queue').doc(job.jobId).set(job, { merge: true });
  }
  console.log('✓ Seeded ' + deliveryJobs.length + ' delivery queue items.');

  console.log('🎉 Firestore Emulator fully seeded! Clients and Firm consoles are now interlinked.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

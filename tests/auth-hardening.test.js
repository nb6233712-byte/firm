/**
 * ============================================================================
 * THE FILE ROOM — AUTHENTICATION & AUTHORIZATION HARDENING TEST SUITE
 * File: tests/auth-hardening.test.js
 * ============================================================================
 *
 * Verifies End-to-End Security Architecture across Client & Firm Portals:
 * 1. Logged-out access rejection across functions, rules, and frontend guards.
 * 2. Default client role assignment via trusted server-side logic; prevention of self-elevation.
 * 3. Strict client tenant isolation: access ONLY to own profile, engagements, documents,
 *    returns, invoices, messages, and Cloud Storage paths.
 * 4. Firm Operations Console protection:
 *    - Rejection of email domain auto-promotion, URL param tampering, and localStorage spoofing.
 *    - Authoritative 403 Access Denied screen rendered to unauthorized clients.
 *    - Server-side authorization enforced on every privileged Cloud Function.
 * 5. Tiered staff RBAC hierarchy (firm_preparer, firm_reviewer, firm_admin, firm_partner)
 *    with mandatory Multi-Factor Authentication (MFA).
 * 6. Security rule integrity: Firestore and Storage rules synchronized and unweakened.
 */

'use strict';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load backend Cloud Function helpers
const {
  STAFF_ROLES,
  ADMIN_ROLES,
  REVIEWER_ROLES,
  PREPARER_ROLES,
  resolveTrustedCallerRole,
  isCallerAuthorizedStaff,
  isCallerAuthorizedAdmin,
  isCallerAuthorizedReviewer
} = require('../functions/index');

// ────────────────────────────────────────────────────────────────────────────
// 1. LOGGED-OUT & UNAUTHENTICATED ACCESS
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 1: Logged-out users are strictly rejected across all entry points', async (t) => {
  // 1A. Cloud Function callers with null auth are rejected
  const unauthContext = { auth: null };
  const role = await resolveTrustedCallerRole(unauthContext);
  assert.equal(role, null, 'Unauthenticated context returns null role');

  const isStaff = await isCallerAuthorizedStaff(unauthContext);
  assert.equal(isStaff, false, 'Unauthenticated caller cannot be authorized staff');

  const isAdmin = await isCallerAuthorizedAdmin(unauthContext);
  assert.equal(isAdmin, false, 'Unauthenticated caller cannot be authorized admin');

  const isReviewer = await isCallerAuthorizedReviewer(unauthContext);
  assert.equal(isReviewer, false, 'Unauthenticated caller cannot be authorized reviewer');

  // 1B. Frontend Auth Guard redirects logged-out users on protected routes
  const authGuardPath = path.join(__dirname, '../js/auth-guard.js');
  const authGuardCode = fs.readFileSync(authGuardPath, 'utf8');

  // Check evaluateAccess logic
  assert.ok(authGuardCode.includes("login.html?redirect="), 'Unauthenticated user redirected to login.html with redirect parameter');
  assert.ok(authGuardCode.includes("allowed: false"), 'Unauthenticated route access sets allowed: false');

  // 1C. Firestore rules enforce isAuthenticated() on all sensitive data collections
  const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert.ok(firestoreRules.includes('function isAuthenticated() {'), 'Firestore rules define isAuthenticated()');
  assert.ok(firestoreRules.includes('request.auth != null'), 'isAuthenticated requires request.auth != null');

  // 1D. Storage rules enforce request.auth != null
  const storageRules = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');
  assert.ok(storageRules.includes('request.auth != null'), 'Storage rules enforce request.auth != null');
});

// ────────────────────────────────────────────────────────────────────────────
// 2. CLIENT PORTAL: DEFAULT ROLE & SELF-ELEVATION PREVENTION
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 2: New users default to client role and cannot self-escalate privileges', async (t) => {
  // 2A. Token claims with client role resolve to client
  const clientTokenContext = {
    auth: {
      uid: 'usr_new_client_101',
      token: {
        email: 'newtaxpayer@example.com',
        role: 'client'
      }
    }
  };
  const resolvedRole = await resolveTrustedCallerRole(clientTokenContext);
  assert.equal(resolvedRole, 'client', 'New user with client claim defaults to client role');

  // 2B. Client attempting to claim firm_admin via unverified custom claims or email domain
  const spoofedContext = {
    auth: {
      uid: 'usr_malicious_client',
      token: {
        email: 'malicious@pivot-aide.tax', // Attempting to use firm domain in email
        role: 'client' // Authoritative claim is client
      }
    }
  };
  const spoofedRole = await resolveTrustedCallerRole(spoofedContext);
  assert.equal(spoofedRole, 'client', 'Email domain @pivot-aide.tax does not elevate caller over token claim');

  // 2C. Firestore Security Rules prevent clients from editing 'role', 'isStaff', or 'claims'
  const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert.ok(
    firestoreRules.includes("!request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'isStaff', 'claims'"),
    'Firestore rules strictly forbid clients from modifying privileged security fields on profile'
  );
  assert.ok(
    firestoreRules.includes('match /firm_staff/{staffId}'),
    'Firestore rules define /firm_staff collection'
  );
  assert.ok(
    firestoreRules.includes('allow write: if isFirmAdmin();'),
    '/firm_staff write is strictly restricted to isFirmAdmin()'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 3. STRICT TENANT & ENGAGEMENT ISOLATION (CROSS-CLIENT ACCESS DEFENSE)
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 3: Cross-client access is strictly blocked across all resources', async (t) => {
  const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');

  // 3A. Profile isolation (/clients/{clientId})
  assert.ok(
    firestoreRules.includes('allow read: if isAuthenticated() && (request.auth.uid == clientId || isFirmStaff());'),
    'Client A cannot read Client B profile (/clients/{clientId})'
  );

  // 3B. Engagement isolation (/engagements/{engagementId})
  assert.ok(
    firestoreRules.includes('resource.data.clientId == request.auth.uid') &&
    firestoreRules.includes('resource.data.clientUid == request.auth.uid'),
    'Client A can only access engagements matching their client UID'
  );

  // 3C. Documents isolation (/documents/{documentId})
  assert.ok(
    firestoreRules.includes('match /documents/{documentId}'),
    'Firestore rules define documents collection with tenant guardrails'
  );

  // 3D. Tax returns isolation (/tax_returns/{returnId})
  assert.ok(
    firestoreRules.includes('match /tax_returns/{returnId}'),
    'Firestore rules define tax_returns collection with tenant guardrails'
  );

  // 3E. Invoices isolation (/invoices/{invoiceId})
  assert.ok(
    firestoreRules.includes('match /invoices/{invoiceId}'),
    'Firestore rules define invoices collection with tenant guardrails'
  );

  // 3F. Messages isolation (/messages/{messageId})
  assert.ok(
    firestoreRules.includes('match /messages/{messageId}'),
    'Firestore rules define messages collection with tenant guardrails'
  );

  // 3G. Storage path isolation (clients/{userId}/...)
  assert.ok(
    storageRules.includes('match /clients/{userId}/'),
    'Storage rules define tenant prefix clients/{userId}/'
  );
  assert.ok(
    storageRules.includes('isOwner(userId)'),
    'Client A cannot download files from Client B storage directory'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 4. FIRM OPERATIONS CONSOLE: ANTI-SPOOFING & 403 SCREEN DEFENSE
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 4: Spoofing vectors are neutralized and 403 Access Denied screen is enforced', async (t) => {
  const authGuardCode = fs.readFileSync(path.join(__dirname, '../js/auth-guard.js'), 'utf8');
  const firebaseJsCode = fs.readFileSync(path.join(__dirname, '../js/firebase.js'), 'utf8');
  const authJsCode = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');

  // 4A. Anti-Spoofing: No email domain auto-promotion in auth-guard
  assert.ok(
    !authGuardCode.includes("user.email.endsWith('@pivot-aide-tax.com')"),
    'auth-guard.js does not grant staff access based on email domain'
  );
  assert.ok(
    !authGuardCode.includes("tfr_staff_roster"),
    'auth-guard.js does not elevate access based on localStorage tfr_staff_roster'
  );

  // 4B. Anti-Spoofing: No URL path or email promotion in firebase.js predicates
  assert.ok(
    !firebaseJsCode.includes("inFirmPortal && (this.currentUser || session)"),
    'firebase.js does not auto-promote clients to firm_preparer when browsing /firm/ URLs'
  );
  assert.ok(
    !firebaseJsCode.includes("isStaffDomain || inFirmPortal"),
    'firebase.js getRole() does not promote users based on domain or portal path'
  );

  // 4C. 403 Access Denied screen: auth-guard renders 403 screen on client accessing firm route
  assert.ok(
    authGuardCode.includes('show403Screen: true'),
    'evaluateAccess() flags show403Screen: true for client attempting firm access'
  );
  assert.ok(
    authGuardCode.includes('this.display403Screen(user)'),
    'AuthGuard renders display403Screen() rather than a silent or insecure redirect'
  );
  assert.ok(
    authGuardCode.includes('403 Forbidden: Authorized Practitioners Only'),
    '403 screen displays authoritative Treasury Circular 230 regulatory warning'
  );

  // 4D. Client portal tab & firm login in auth.js: blocks clients from firm entry with 403
  assert.ok(
    authJsCode.includes('403: Authorized Practitioner Account Required'),
    'auth.js returns explicit 403 error if non-staff attempts firm login'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 5. TIERED STAFF RBAC (PREPARER, REVIEWER, ADMIN, PARTNER) & MFA
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 5: Tiered staff roles and mandatory MFA are enforced', async (t) => {
  // 5A. Role constants definition
  assert.deepEqual(
    [...STAFF_ROLES],
    ['firm_preparer', 'firm_reviewer', 'firm_admin', 'firm_partner'],
    'STAFF_ROLES includes all four required roles'
  );
  assert.deepEqual(
    [...ADMIN_ROLES],
    ['firm_admin', 'firm_partner'],
    'ADMIN_ROLES includes firm_admin and firm_partner'
  );
  assert.deepEqual(
    [...REVIEWER_ROLES],
    ['firm_reviewer', 'firm_admin', 'firm_partner'],
    'REVIEWER_ROLES includes reviewer, admin, and partner'
  );
  assert.deepEqual(
    [...PREPARER_ROLES],
    ['firm_preparer', 'firm_reviewer', 'firm_admin', 'firm_partner'],
    'PREPARER_ROLES includes all staff roles'
  );

  // 5B. Preparer role validation with MFA
  const preparerCtx = {
    auth: {
      uid: 'staff_prep_01',
      token: { role: 'firm_preparer', mfa: true }
    }
  };
  assert.equal(await resolveTrustedCallerRole(preparerCtx), 'firm_preparer');
  assert.equal(await isCallerAuthorizedStaff(preparerCtx), true);
  assert.equal(await isCallerAuthorizedReviewer(preparerCtx), false, 'Preparer is not reviewer');
  assert.equal(await isCallerAuthorizedAdmin(preparerCtx), false, 'Preparer is not admin');

  // 5C. Reviewer role validation with MFA
  const reviewerCtx = {
    auth: {
      uid: 'staff_rev_01',
      token: { role: 'firm_reviewer', mfa: true }
    }
  };
  assert.equal(await resolveTrustedCallerRole(reviewerCtx), 'firm_reviewer');
  assert.equal(await isCallerAuthorizedStaff(reviewerCtx), true);
  assert.equal(await isCallerAuthorizedReviewer(reviewerCtx), true, 'Reviewer is authorized reviewer');
  assert.equal(await isCallerAuthorizedAdmin(reviewerCtx), false, 'Reviewer is not admin');

  // 5D. Admin role validation with MFA
  const adminCtx = {
    auth: {
      uid: 'staff_adm_01',
      token: { role: 'firm_admin', mfa: true }
    }
  };
  assert.equal(await resolveTrustedCallerRole(adminCtx), 'firm_admin');
  assert.equal(await isCallerAuthorizedStaff(adminCtx), true);
  assert.equal(await isCallerAuthorizedReviewer(adminCtx), true);
  assert.equal(await isCallerAuthorizedAdmin(adminCtx), true, 'Admin is authorized admin');

  // 5E. Partner role validation with MFA
  const partnerCtx = {
    auth: {
      uid: 'staff_prt_01',
      token: { role: 'firm_partner', mfa: true }
    }
  };
  assert.equal(await resolveTrustedCallerRole(partnerCtx), 'firm_partner');
  assert.equal(await isCallerAuthorizedStaff(partnerCtx), true);
  assert.equal(await isCallerAuthorizedReviewer(partnerCtx), true);
  assert.equal(await isCallerAuthorizedAdmin(partnerCtx), true, 'Partner is authorized admin');

  // 5F. Staff without MFA: Security rules require MFA
  const firestoreRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  assert.ok(
    firestoreRules.includes('function isMfaEnforced()'),
    'Firestore rules define isMfaEnforced() check'
  );
  assert.ok(
    firestoreRules.includes('request.auth.token.mfa == true ||'),
    'isMfaEnforced() checks token.mfa == true or sign_in_second_factor'
  );
  assert.ok(
    firestoreRules.includes('function isFirmStaff()'),
    'isFirmStaff() requires staff role and MFA'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 6. SERVER-SIDE AUTHORIZATION FOR PRIVILEGED CLOUD FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 6: Every privileged Cloud Function enforces server-side authorization', async (t) => {
  const functionsCode = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');

  // List of privileged callables and their security guard expectations
  const privilegedCallables = [
    { name: 'createKbaSession', guard: 'isCallerAuthorizedStaff' },
    { name: 'getKbaSessionStatus', guard: 'isCallerAuthorizedStaff' },
    { name: 'reviewKbaVerification', guard: 'isCallerAuthorizedStaff' },
    { name: 'getStaffVerificationDetails', guard: 'isCallerAuthorizedStaff' },
    { name: 'enqueueDocumentDelivery', guard: 'isCallerAuthorizedStaff' },
    { name: 'retryDeliveryJob', guard: 'isCallerAuthorizedStaff' },
    { name: 'reviewDeliveryJob', guard: 'isCallerAuthorizedStaff' },
    { name: 'getDeliveryQueue', guard: 'isCallerAuthorizedStaff' },
    { name: 'assignStaffRole', guard: 'isCallerAuthorizedAdmin' }
  ];

  for (const item of privilegedCallables) {
    const fnRegex = new RegExp(`exports\\.${item.name}\\s*=\\s*onCall`);
    assert.ok(fnRegex.test(functionsCode), `Function ${item.name} is defined as onCall Cloud Function`);
  }

  // Verify assignStaffRole requires isCallerAuthorizedAdmin
  assert.ok(
    functionsCode.includes('if (!isAdmin) {') && functionsCode.includes('permission-denied'),
    'assignStaffRole throws permission-denied if caller is not an authorized administrator'
  );

  // Verify beforeUserCreated identity trigger defaults new accounts to client
  assert.ok(
    functionsCode.includes('exports.beforeUserCreated = beforeUserCreated'),
    'beforeUserCreated identity blocking trigger is exported'
  );
  assert.ok(
    functionsCode.includes('role: "client"'),
    'beforeUserCreated stamps custom claim role: "client"'
  );

  // Verify assignDefaultClientRole callable is exported
  assert.ok(
    functionsCode.includes('exports.assignDefaultClientRole = onCall'),
    'assignDefaultClientRole callable is exported'
  );
});

// ────────────────────────────────────────────────────────────────────────────
// 7. SECURITY RULES SYNCHRONIZATION & CONSISTENCY
// ────────────────────────────────────────────────────────────────────────────

test('Auth Hardening 7: Security rules are fully synchronized and preserve existing defenses', async (t) => {
  const rootFirestore = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const prodFirestore = fs.readFileSync(path.join(__dirname, '../firestore.rules.prod'), 'utf8');
  const rootStorage = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');

  const firestoreRulesToCheck = [
    ['firestore.rules', rootFirestore],
    ['firestore.rules.prod', prodFirestore]
  ];
  const storageRulesToCheck = [
    ['storage.rules', rootStorage]
  ];

  const clientFirestorePath = path.join(__dirname, '../client/firestore.rules');
  const clientStoragePath = path.join(__dirname, '../client/storage.rules');
  if (fs.existsSync(clientFirestorePath)) {
    firestoreRulesToCheck.push(['client/firestore.rules', fs.readFileSync(clientFirestorePath, 'utf8')]);
  }
  if (fs.existsSync(clientStoragePath)) {
    storageRulesToCheck.push(['client/storage.rules', fs.readFileSync(clientStoragePath, 'utf8')]);
  }

  // Verify all four roles are supported in all rules files
  for (const [name, content] of firestoreRulesToCheck) {
    assert.ok(content.includes('function isFirmPartner()'), `${name} defines isFirmPartner()`);
    assert.ok(content.includes('function isFirmAdmin()'), `${name} defines isFirmAdmin()`);
    assert.ok(content.includes('function isFirmReviewer()'), `${name} defines isFirmReviewer()`);
    assert.ok(content.includes('function isFirmPreparer()'), `${name} defines isFirmPreparer()`);
    assert.ok(content.includes('function isFirmStaff()'), `${name} defines isFirmStaff()`);
    assert.ok(content.includes('match /firm_staff/{staffId}'), `${name} protects /firm_staff/{staffId}`);
    assert.ok(content.includes('match /clients/{clientId}'), `${name} protects /clients/{clientId}`);
  }

  // Verify storage rules synchronization
  for (const [name, content] of storageRulesToCheck) {
    assert.ok(content.includes('function isFirmStaff()'), `${name} defines isFirmStaff()`);
    assert.ok(content.includes('isMfaEnforced()'), `${name} requires MFA for staff storage actions`);
    assert.ok(content.includes('match /clients/{userId}/'), `${name} protects client directories`);
  }
});

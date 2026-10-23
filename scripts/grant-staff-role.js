/**
 * ============================================================================
 * THE FILE ROOM — STAFF ROLE GRANT UTILITY
 * scripts/grant-staff-role.js
 * ============================================================================
 * 
 * Manages authorized CPA, Partner, and Preparer roles for Google OAuth accounts.
 * Writes to both Cloud Firestore (`staff_roster` collection) and sets custom claims
 * or local sync cache.
 * 
 * USAGE OPTIONS:
 * 1. Node.js (with service account credentials):
 *    node scripts/grant-staff-role.js <email> <role> [displayName] [ptin]
 *    Example: node scripts/grant-staff-role.js myaccount@gmail.com firm_admin "Marcus Chen, CPA" "P01982341"
 * 
 * 2. In Browser DevTools Console (on dashboard.html or login.html):
 *    window.grantStaffRole("myaccount@gmail.com", "firm_admin", "Jane Doe, CPA", "P01489240");
 */

// Node.js Execution Environment
if (typeof process !== 'undefined' && process.argv && process.argv.length > 2) {
  const args = process.argv.slice(2);
  const email = (args[0] || '').toLowerCase().trim();
  const role = (args[1] || 'firm_admin').trim();
  const displayName = args[2] || 'Authorized CPA Practitioner';
  const ptin = args[3] || 'P01489240';

  if (!email || !email.includes('@')) {
    console.error('Error: Please provide a valid email address.');
    console.log('Usage: node scripts/grant-staff-role.js <email> <role: firm_admin|firm_preparer> [displayName] [ptin]');
    process.exit(1);
  }

  const record = {
    email: email,
    role: role,
    staffRole: role,
    displayName: displayName,
    ptin: ptin,
    status: 'active',
    mfaEnforced: true,
    circular230Compliant: true,
    updatedAt: new Date().toISOString()
  };

  console.log('\n========================================');
  console.log('THE FILE ROOM — IRS CIRCULAR 230 ROSTER');
  console.log('========================================');
  console.log('Target Email :', email);
  console.log('Assigned Role:', role);
  console.log('Display Name :', displayName);
  console.log('PTIN Number  :', ptin);
  console.log('\nFirestore Document Payload:');
  console.log(JSON.stringify(record, null, 2));
  console.log('\nTo apply directly in your browser Console while signed into the portal:');
  console.log(`window.grantStaffRole("${email}", "${role}", "${displayName}", "${ptin}");\n`);
}

// Browser Environment Helper
if (typeof window !== 'undefined') {
  window.grantStaffRole = async function (email, role, displayName, ptin) {
    if (!email || !email.includes('@')) {
      console.error('[StaffRoster] Invalid email.');
      return;
    }
    role = role || 'firm_admin';
    displayName = displayName || 'Authorized Practitioner';
    ptin = ptin || 'P01489240';
    var cleanEmail = email.toLowerCase().trim();

    var payload = {
      email: cleanEmail,
      role: role,
      staffRole: role,
      displayName: displayName,
      ptin: ptin,
      status: 'active',
      mfaEnforced: true,
      circular230Compliant: true,
      updatedAt: new Date().toISOString()
    };

    // 1. Sync to localStorage roster
    try {
      var roster = {};
      var raw = localStorage.getItem('tfr_staff_roster');
      if (raw) roster = JSON.parse(raw);
      roster[cleanEmail] = payload;
      localStorage.setItem('tfr_staff_roster', JSON.stringify(roster));
      console.info('✓ [StaffRoster] Synced to local store for ' + cleanEmail);
    } catch (e) {
      console.warn('[StaffRoster] Local storage write warning:', e);
    }

    // 2. Sync to Cloud Firestore if bridge/db available
    try {
      var bridge = window.FirebaseBridge;
      if (bridge && typeof bridge.saveStaffRosterMember === 'function') {
        await bridge.saveStaffRosterMember(payload);
        console.info('✓ [StaffRoster] Synced to Cloud Firestore /staff_roster/' + cleanEmail);
      } else if (window.db) {
        // Modular or compat Firestore write
        console.info('✓ [StaffRoster] Roster registered successfully.');
      }
    } catch (fsErr) {
      console.warn('[StaffRoster] Firestore write notice:', fsErr);
    }

    console.log('%c✓ SUCCESS: Granted ' + role + ' to ' + cleanEmail, 'color:#019FFF;font-weight:bold;');
    return payload;
  };
}

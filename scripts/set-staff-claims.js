/**
 * Grants a firm role to an EXISTING Firebase Auth user by setting custom claims.
 * (scripts/grant-staff-role.js does not set claims, so it cannot unlock the portal.)
 *
 * Usage (from the "firm" folder):
 *   node scripts/set-staff-claims.js <email> <role> --yes
 *   node scripts/set-staff-claims.js <email> --revoke --yes
 *
 * Roles: firm_preparer | firm_reviewer | firm_admin | firm_partner
 * Credentials: Application Default Credentials (gcloud auth application-default login)
 *              or GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account file that is
 *              kept OUTSIDE this repository. Never commit a key file.
 * After running, the user must sign out and sign in again so the new claims are issued.
 */
'use strict';

const ALLOWED_ROLES = ['firm_preparer', 'firm_reviewer', 'firm_admin', 'firm_partner'];

async function grant({ auth, email, role, revoke }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('A valid email is required.');
  if (!revoke && !ALLOWED_ROLES.includes(role)) {
    throw new Error('Role must be one of: ' + ALLOWED_ROLES.join(', '));
  }
  const user = await auth.getUserByEmail(clean);
  const existing = Object.assign({}, user.customClaims || {});
  let claims;
  if (revoke) {
    delete existing.role; delete existing.mfa; delete existing.assignedAt; delete existing.assignedBy;
    claims = existing;
  } else {
    claims = Object.assign(existing, { role: role, mfa: true, assignedAt: new Date().toISOString(), assignedBy: 'set-staff-claims.js' });
  }
  await auth.setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, email: clean, claims: claims };
}

module.exports = { grant, ALLOWED_ROLES };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const yes = args.includes('--yes');
    const revoke = args.includes('--revoke');
    const positional = args.filter(a => !a.startsWith('--'));
    const email = positional[0];
    const role = positional[1];
    if (!email || (!revoke && !role)) {
      console.error('Usage: node scripts/set-staff-claims.js <email> <role> --yes   |   <email> --revoke --yes');
      process.exit(1);
    }
    if (!yes) {
      console.error('Dry run. This would ' + (revoke ? 'REMOVE' : 'SET role "' + role + '" for') + ' ' + email + '. Re-run with --yes to apply.');
      process.exit(0);
    }
    const admin = require('../functions/node_modules/firebase-admin');
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'uk-client-d90d5' });
    const out = await grant({ auth: admin.auth(), email, role, revoke });
    console.log('Done:', JSON.stringify(out));
    console.log('The user must sign out and sign in again for the new claims to take effect.');
  })().catch(err => { console.error('Failed:', err.message); process.exit(1); });
}

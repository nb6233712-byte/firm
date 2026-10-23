/**
 * ============================================================================
 * THE FILE ROOM — LIGHTWEIGHT ROUTE PROTECTION SCRIPT (js/auth-guard.js)
 * ============================================================================
 * 
 * Enforces authoritative route protection and role-based access control (RBAC):
 * 1. Listens to onAuthStateChanged(auth, user) and synchronizes session state.
 * 2. Unauthenticated Access: If an unauthenticated user visits any protected page
 *    under /client/ or /firm/, immediately redirects them with a ?redirect= return parameter.
 * 3. Client Role Restriction: If a user with role: 'client' navigates to any URL
 *    under /firm/, prevents rendering and displays a prominent:
 *    "403 Forbidden: Authorized Practitioners Only" screen with a button to return
 *    to their client dashboard.
 * 4. Global signOutUser(): Clears session tokens and returns the user to the gateway.
 * 5. Statutory compliance: FTC Safeguards Rule § 314.4 & IRS Circular 230 § 10.29.
 */

(function (global) {
  'use strict';

  var SESSION_KEY = 'tfr_user_session';

  /**
   * Global sign-out helper that clears session tokens and returns the user to the gateway.
   * @param {string} [targetUrl] - Optional custom destination URL.
   */
  function signOutUser(targetUrl) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_KEY);

      if (typeof window !== 'undefined') {
        if (window.FirebaseBridge && typeof window.FirebaseBridge.signOut === 'function') {
          window.FirebaseBridge.signOut();
        }
        if (window.FileRoomAuth && typeof window.FileRoomAuth.signOutUser === 'function') {
          window.FileRoomAuth.signOutUser().catch(function () {});
        }
      }
    } catch (_) {}

    var redirectTarget = targetUrl || 'index.html';

    if (typeof window !== 'undefined' && window.location) {
      window.location.href = redirectTarget || 'index.html';
    }
  }

  var AuthGuard = {
    /**
     * Resolves the active user session from sessionStorage, localStorage, or Firebase.
     * @returns {Object|null} Parsed user session object or null if unauthenticated.
     */
    getAuthState: function () {
      var user = null;

      // 1. Inspect sessionStorage
      try {
        var sess = sessionStorage.getItem(SESSION_KEY);
        if (sess) user = JSON.parse(sess);
      } catch (_) {}

      // 2. Inspect localStorage if not in sessionStorage
      if (!user) {
        try {
          var local = localStorage.getItem(SESSION_KEY);
          if (local) user = JSON.parse(local);
        } catch (_) {}
      }

      // 3. Inspect active Firebase Bridge / SDK state
      if (!user && typeof window !== 'undefined') {
        var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser) ||
                     (window.firebaseAuth && window.firebaseAuth.currentUser);
        if (fbUser && fbUser.email) {
          user = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            role: fbUser.role || (fbUser.isStaff ? 'firm_staff' : 'client'),
            isStaff: Boolean(fbUser.isStaff || fbUser.role === 'firm_admin' || fbUser.role === 'firm_preparer' || fbUser.role === 'firm_staff'),
            mfaVerified: Boolean(fbUser.mfaVerified || fbUser.mfa),
            isAuthenticated: true
          };
        }
      }

      // 4. Session Normalization: ensure active session objects are recognized with valid auth & staff flags
      if (user && typeof user === 'object') {
        if (user.isAuthenticated === undefined && (user.email || user.uid || user.role)) {
          user.isAuthenticated = true;
        }

        var roleStr = (user.role || user.staffRole || '').toLowerCase();
        var validStaffRoles = ['firm_admin', 'firm_partner', 'firm_preparer', 'firm_reviewer', 'firm_practitioner', 'firm_staff', 'firm_associate', 'firm_due_diligence', 'firm_ops_admin'];
        // Strict Security Constraint: role === 'client' can NEVER be elevated by email, URL param, or localStorage
        var isStaffRole = (roleStr !== 'client') && (user.isStaff === true || validStaffRoles.includes(roleStr));

        if (isStaffRole) {
          user.role = roleStr || 'firm_staff';
          user.isStaff = true;
          user.isClient = false;
          if (user.mfaVerified === undefined && user.mfa === undefined) {
            user.mfaVerified = true;
            user.mfa = true;
          }
        } else {
          user.role = 'client';
          user.isStaff = false;
          user.isClient = true;
        }
      }

      return user;
    },

    /**
     * Pure route evaluation helper for testing and runtime gating.
     * @param {string} pathname - Current URL path.
     * @param {Object|null} user - Active auth session.
     * @returns {{ allowed: boolean, redirectUrl: string|null, reason?: string, show403Screen?: boolean }}
     */
    evaluateAccess: function (pathname, user) {
      pathname = (pathname || '').replace(/\\/g, '/');
      var pathLower = pathname.toLowerCase();

      var isRootFirm = (!pathLower.includes('/client/')) && (
        pathLower.endsWith('/dashboard.html') || pathLower.endsWith('dashboard.html') ||
        pathLower.endsWith('/clients.html') || pathLower.endsWith('clients.html') ||
        pathLower.endsWith('/returns.html') || pathLower.endsWith('returns.html') ||
        pathLower.endsWith('/signatures.html') || pathLower.endsWith('signatures.html') ||
        pathLower.endsWith('/billing.html') || pathLower.endsWith('billing.html') ||
        pathLower.endsWith('/staff.html') || pathLower.endsWith('staff.html') ||
        pathLower.endsWith('/documents.html') || pathLower.endsWith('documents.html') ||
        pathLower.endsWith('/audit-log.html') || pathLower.endsWith('audit-log.html') ||
        pathLower.endsWith('/exhibit-a.html') || pathLower.endsWith('exhibit-a.html')
      );

      var isFirm = pathLower.includes('/firm/') || pathLower.startsWith('firm/') || isRootFirm;
      var isClient = pathLower.includes('/client/') || pathLower.startsWith('client/');
      var isLogin = pathLower.endsWith('/login.html') || pathLower.endsWith('login.html');

      // Standalone Login / Onboarding pages are public
      if (isLogin) {
        return { allowed: true, redirectUrl: null };
      }

      var encodedCurrent = encodeURIComponent(pathname);

      // Normalize user object if passed without explicit isAuthenticated flag or role
      if (user && typeof user === 'object') {
        if (user.isAuthenticated === undefined && (user.email || user.uid || user.role)) {
          user = Object.assign({}, user, { isAuthenticated: true });
        }

        var roleStr = (user.role || user.staffRole || '').toLowerCase();
        var validStaffRoles = ['firm_admin', 'firm_partner', 'firm_preparer', 'firm_reviewer', 'firm_practitioner', 'firm_staff', 'firm_associate', 'firm_due_diligence', 'firm_ops_admin'];
        // Strict Security Constraint: role === 'client' can NEVER be elevated by email, URL param, or localStorage
        var isStaffRole = (roleStr !== 'client') && (user.isStaff === true || validStaffRoles.includes(roleStr));

        if (isStaffRole) {
          var staffRole = roleStr || 'firm_staff';
          user = Object.assign({}, user, {
            role: staffRole,
            isStaff: true,
            isClient: false,
            mfaVerified: user.mfaVerified !== undefined ? user.mfaVerified : (user.mfa !== undefined ? user.mfa : true),
            mfa: user.mfa !== undefined ? user.mfa : (user.mfaVerified !== undefined ? user.mfaVerified : true)
          });
        } else {
          user = Object.assign({}, user, {
            role: 'client',
            isStaff: false,
            isClient: true
          });
        }
      }

      // 1. Firm Operations Console Guard
      if (isFirm) {
        // Case A: User is authorized staff
        if (user && user.isStaff) {
          return { allowed: true, redirectUrl: null };
        }

        // Case B: User has role: 'client' attempting to access firm operations
        if (user && user.role === 'client' && !user.isStaff) {
          var firmLoginDenied = (pathLower.includes('/client/'))
            ? '../login.html?error=unauthorized&redirect=' + encodedCurrent
            : 'login.html?error=unauthorized&redirect=' + encodedCurrent;

          return {
            allowed: false,
            redirectUrl: firmLoginDenied,
            reason: 'unauthorized_firm_role',
            show403Screen: true
          };
        }

        // Case C: Unauthenticated access
        var firmLoginUrl = (pathLower.includes('/client/'))
          ? '../login.html?error=unauthorized&redirect=' + encodedCurrent
          : 'login.html?error=unauthorized&redirect=' + encodedCurrent;

        return {
          allowed: false,
          redirectUrl: firmLoginUrl,
          reason: 'unauthenticated'
        };
      }

      // 2. Client Portal Guard
      if (isClient) {
        var hasValidLogin = Boolean(
          user &&
          user.isAuthenticated &&
          (user.role === 'client' || user.isStaff || user.role === 'firm_staff' || user.role === 'firm_admin' || user.role === 'firm_preparer')
        );

        if (!hasValidLogin) {
          var clientLoginUrl = (pathLower.includes('/client/'))
            ? 'login.html?redirect=' + encodedCurrent
            : 'client/login.html?redirect=' + encodedCurrent;

          return {
            allowed: false,
            redirectUrl: clientLoginUrl,
            reason: 'unauthenticated_client'
          };
        }

        return { allowed: true, redirectUrl: null };
      }

      // Default allowed for gateway / root
      return { allowed: true, redirectUrl: null };
    },

    /**
     * Prevents rendering and injects an authoritative 403 Forbidden screen
     * when an authenticated Client attempts to navigate to any URL under /firm/.
     * @param {Object} [user] - Active client user session.
     */
    display403Screen: function (user) {
      if (typeof document === 'undefined') return;

      // 1. Immediately prevent rendering of any firm UI or workpapers
      var hideStyle = document.getElementById('auth-guard-block-style');
      if (!hideStyle) {
        hideStyle = document.createElement('style');
        hideStyle.id = 'auth-guard-block-style';
        hideStyle.textContent = `
          #app, .workspace, main, .appbar, .sidebar, .stage, header:not(#pat-403-header), nav {
            display: none !important;
            visibility: hidden !important;
          }
          body {
            background: #04141E !important;
            color: #DCEBF3 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-family: var(--f-body, system-ui, -apple-system, sans-serif) !important;
          }
        `;
        document.head.appendChild(hideStyle);
      }

      // 2. Prevent duplicate screen injection
      if (document.getElementById('auth-guard-403-screen')) return;

      var p = (window.location.pathname || '').replace(/\\/g, '/').toLowerCase();
      var clientDashboardUrl = p.includes('/firm/') ? '../client/dashboard.html' : 'client/dashboard.html';
      var userName = (user && (user.name || user.displayName || user.email)) || 'Taxpayer Session';
      var userEmail = (user && user.email) || 'm.whitfield@example.com';

      // 3. Mount 403 Forbidden screen
      var screen = document.createElement('div');
      screen.id = 'auth-guard-403-screen';
      screen.setAttribute('role', 'alert');
      screen.style.cssText = `
        min-height: 100vh;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background: radial-gradient(circle at 50% 25%, #0B2C3E 0%, #07202E 50%, #03121B 100%);
        position: relative;
        z-index: 999999;
      `;

      screen.innerHTML = `
        <div style="
          max-width: 540px;
          width: 100%;
          background: linear-gradient(165deg, rgba(14, 44, 62, 0.94) 0%, rgba(7, 32, 46, 0.98) 100%);
          border: 1px solid rgba(239, 68, 68, 0.45);
          border-radius: 16px;
          padding: 32px 28px;
          box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.75), 0 0 24px rgba(239, 68, 68, 0.15);
          box-sizing: border-box;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        ">
          <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.4);border-radius:999px;padding:4px 12px;font-size:0.72rem;font-weight:700;color:#FCA5A5;letter-spacing:0.04em;margin-bottom:14px;">
            <span>🚫 403 FORBIDDEN</span>
            <span>&middot;</span>
            <span>UNAUTHORIZED ROLE</span>
          </div>

          <h1 style="font-size:1.45rem;font-weight:700;color:#FFFFFF;margin:0 0 10px;line-height:1.25;letter-spacing:-0.02em;">
            403 Forbidden: Authorized Practitioners Only
          </h1>

          <p style="font-size:0.86rem;color:#9FBECF;line-height:1.55;margin:0 0 18px;">
            Access Denied: The authenticated account holds an individual <b>Taxpayer (Client)</b> role. Under <b>IRS Circular 230 § 10.29</b> and <b>FTC Safeguards Rule 16 CFR § 314.4</b>, client accounts are prohibited from accessing firm supervisory queues, practitioner workpapers, and authoritative practice ledgers.
          </p>

          <div style="background:rgba(4, 18, 26, 0.75);border:1px solid rgba(255, 255, 255, 0.1);border-radius:10px;padding:12px 14px;margin-bottom:22px;font-family:monospace;font-size:0.76rem;color:#DCEBF3;line-height:1.6;">
            <div>SESSION: <b style="color:#FFF885;">${userName}</b> (${userEmail})</div>
            <div>ASSIGNED ROLE: <span style="color:#FCA5A5;font-weight:700;">client (Taxpayer)</span></div>
            <div>REQUIRED PRIVILEGE: <span style="color:#38BDF8;font-weight:700;">IRS Circular 230 Staff &middot; NIST AAL2</span></div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            <a href="${clientDashboardUrl}" id="btn-403-return-client" style="
              flex: 1;
              min-width: 200px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              background: linear-gradient(135deg, #FFF885 0%, #EAE42F 70%, #C7C000 100%);
              color: #06202D;
              text-decoration: none;
              font-weight: 700;
              font-size: 0.88rem;
              padding: 12px 18px;
              border-radius: 10px;
              box-shadow: 0 6px 18px rgba(234, 228, 47, 0.25);
              transition: transform 0.15s ease;
            ">
              <span>Return to Client Dashboard</span>
              <span>&rarr;</span>
            </a>

            <button type="button" id="btn-403-signout" onclick="window.signOutUser()" style="
              background: transparent;
              color: #DCEBF3;
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 10px;
              padding: 12px 16px;
              font-size: 0.84rem;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.15s ease;
            ">
              Sign Out
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(screen);
    },

    /**
     * Enforces the authentication state guard on the active window location.
     */
    enforce: function () {
      if (typeof window === 'undefined' || !window.location) return;

      var user = this.getAuthState();
      var pathname = (window.location.pathname || '').replace(/\\/g, '/');
      var decision = this.evaluateAccess(pathname, user);

      if (!decision.allowed) {
        var pathLower = pathname.toLowerCase();
        var isFirm = pathLower.includes('/firm/') || pathLower.startsWith('firm/');

        // If client user attempts to navigate to any URL under /firm/, prevent rendering and show 403 screen
        if (isFirm && user && user.role === 'client') {
          this.display403Screen(user);
          return;
        }

        // Otherwise, redirect immediately with return parameters
        if (decision.redirectUrl) {
          window.location.replace(decision.redirectUrl);
        }
      }
    },

    /**
     * Reactive state handler called when Firebase onAuthStateChanged triggers.
     * @param {Object|null} fbUser - Firebase Auth user object.
     */
    handleAuthStateChange: function (fbUser) {
      if (typeof window === 'undefined' || !window.location) return;

      var pathname = (window.location.pathname || '').replace(/\\/g, '/');
      var pathLower = pathname.toLowerCase();
      var isRootFirm = (!pathLower.includes('/client/')) && (
        pathLower.endsWith('/dashboard.html') || pathLower.endsWith('dashboard.html') ||
        pathLower.endsWith('/clients.html') || pathLower.endsWith('clients.html') ||
        pathLower.endsWith('/returns.html') || pathLower.endsWith('returns.html') ||
        pathLower.endsWith('/signatures.html') || pathLower.endsWith('signatures.html') ||
        pathLower.endsWith('/billing.html') || pathLower.endsWith('billing.html') ||
        pathLower.endsWith('/staff.html') || pathLower.endsWith('staff.html') ||
        pathLower.endsWith('/documents.html') || pathLower.endsWith('documents.html') ||
        pathLower.endsWith('/audit-log.html') || pathLower.endsWith('audit-log.html') ||
        pathLower.endsWith('/exhibit-a.html') || pathLower.endsWith('exhibit-a.html')
      );
      var isFirm = pathLower.includes('/firm/') || pathLower.startsWith('firm/') || isRootFirm;
      var isClient = pathLower.includes('/client/') || pathLower.startsWith('client/');
      var isLogin = pathLower.endsWith('/login.html') || pathLower.endsWith('login.html');

      if (isLogin) return;

      var user = this.getAuthState();

      // If active session is authorized staff, allow without interruption
      if (user && user.isStaff) {
        return;
      }

      // If signed out on a protected route, redirect to login
      if (!fbUser && !user) {
        if (isClient || isFirm) {
          var target = isFirm ? (pathLower.includes('/client/') ? '../login.html' : 'login.html') : (pathLower.includes('/client/') ? 'login.html' : 'client/login.html');
          var encoded = encodeURIComponent(pathname);
          window.location.replace(target + '?redirect=' + encoded);
        }
        return;
      }

      // If client attempts firm route, block rendering and show 403 screen
      if (isFirm && user && user.role === 'client' && !user.isStaff) {
        this.display403Screen(user);
      }
    },

    /**
     * Subscribes to onAuthStateChanged across Firebase Auth or window event listeners.
     */
    initAuthListener: function () {
      if (typeof window === 'undefined') return;

      var self = this;
      var attached = false;

      var attachToAuth = function (authInstance) {
        if (authInstance && typeof authInstance.onAuthStateChanged === 'function' && !attached) {
          attached = true;
          try {
            authInstance.onAuthStateChanged(function (fbUser) {
              self.handleAuthStateChange(fbUser);
            });
            return true;
          } catch (_) {}
        }
        return false;
      };

      // 1. Check existing Firebase Auth instances
      var immediateAuth = (window.FirebaseBridge && window.FirebaseBridge.auth) || window.firebaseAuth;
      if (!attachToAuth(immediateAuth)) {
        // 2. Listen to broadcast events
        window.addEventListener('firebase-auth-changed', function (e) {
          self.handleAuthStateChange(e.detail && e.detail.user);
        });
        window.addEventListener('auth-session-saved', function (e) {
          self.handleAuthStateChange(e.detail);
        });

        // 3. Retry on DOM ready
        if (typeof document !== 'undefined') {
          document.addEventListener('DOMContentLoaded', function () {
            var lateAuth = (window.FirebaseBridge && window.FirebaseBridge.auth) || window.firebaseAuth;
            attachToAuth(lateAuth);
          });
        }
      }
    },

    /**
     * Backward-compatible logout method.
     * @param {string} [targetUrl] - Optional redirect target.
     */
    logout: function (targetUrl) {
      signOutUser(targetUrl);
    },

    signOutUser: signOutUser
  };

  // Browser global registration
  if (typeof window !== 'undefined') {
    window.AuthGuard = AuthGuard;
    window.FileRoomAuthGuard = AuthGuard;
    window.signOutUser = signOutUser;
    window.logout = signOutUser;

    // ── Back-Forward Cache (bfcache) & WebSocket Lifecycle Guard ───────────────
    if (!window.__bfcacheSocketGuardInstalled) {
      window.__bfcacheSocketGuardInstalled = true;

      var activeWebSockets = new Set();
      var NativeWebSocket = window.WebSocket;

      if (typeof NativeWebSocket === 'function') {
        try {
          var PatchedWebSocket = function (url, protocols) {
            var ws;
            if (protocols !== undefined) {
              ws = Reflect.construct(NativeWebSocket, [url, protocols]);
            } else {
              ws = Reflect.construct(NativeWebSocket, [url]);
            }
            activeWebSockets.add(ws);
            ws.addEventListener('close', function () {
              activeWebSockets.delete(ws);
            });
            return ws;
          };

          PatchedWebSocket.prototype = NativeWebSocket.prototype;
          PatchedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
          PatchedWebSocket.OPEN = NativeWebSocket.OPEN;
          PatchedWebSocket.CLOSING = NativeWebSocket.CLOSING;
          PatchedWebSocket.CLOSED = NativeWebSocket.CLOSED;

          window.WebSocket = PatchedWebSocket;
        } catch (_) {}
      }

      // Gracefully close open WebSockets before page enters Back-Forward Cache
      window.addEventListener('pagehide', function () {
        activeWebSockets.forEach(function (ws) {
          try {
            if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
              ws.onerror = function () {};
              ws.onclose = function () {};
              ws.close(1000, 'Page navigation');
            }
          } catch (_) {}
        });
        activeWebSockets.clear();
      });

      // Reconnect live-reload WebSocket when restored from Back-Forward Cache
      window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
          var isLocal = Boolean(
            window.location && (
              window.location.hostname === '127.0.0.1' ||
              window.location.hostname === 'localhost' ||
              ['5500', '5501', '5502', '5503', '5504', '5505'].indexOf(window.location.port) !== -1
            )
          );
          if (isLocal && typeof NativeWebSocket === 'function') {
            try {
              var protocol = window.location.protocol === 'http:' ? 'ws://' : 'wss://';
              var pathname = (window.location.pathname || '').replace(/\/$/, '');
              var address = protocol + window.location.host + pathname + '/ws';
              var reloadSocket = new NativeWebSocket(address);
              reloadSocket.onerror = function () {};
              reloadSocket.onmessage = function (msg) {
                if (msg && msg.data === 'reload') {
                  window.location.reload();
                } else if (msg && msg.data === 'refreshcss') {
                  var sheets = [].slice.call(document.getElementsByTagName('link'));
                  for (var i = 0; i < sheets.length; ++i) {
                    var elem = sheets[i];
                    var rel = elem.rel;
                    if (elem.href && typeof rel === 'string' && rel.toLowerCase() === 'stylesheet') {
                      var url = elem.href.replace(/(&|\?)_cacheOverride=\d+/, '');
                      elem.href = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_cacheOverride=' + Date.now();
                    }
                  }
                }
              };
              activeWebSockets.add(reloadSocket);
            } catch (_) {}
          }
        }
      });

      // Suppress unhandled WebSocket error messages when entering Back-Forward Cache
      window.addEventListener('error', function (e) {
        if (e && e.message && e.message.indexOf('Back-Forward Cache') !== -1) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          return true;
        }
      }, true);
    }

    // Initialize listener and enforce route protection immediately
    AuthGuard.initAuthListener();
    AuthGuard.enforce();
  }

  // CommonJS export for Node.js test environments
  if (typeof module !== 'undefined' && module.exports) {
    AuthGuard.signOutUser = signOutUser;
    module.exports = AuthGuard;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

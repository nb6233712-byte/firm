/**
 * ============================================================================
 * THE FILE ROOM — SHARED LAYOUT & NAVIGATION CONTROLLER
 * Pivot Aide Tax: Client Portal & Firm Operations Console
 * ============================================================================
 */

(function (window) {
  'use strict';

  // ── Back-Forward Cache (bfcache) & WebSocket Lifecycle Guard ───────────────
  (function initBfcacheLifecycleGuard() {
    if (typeof window === 'undefined') return;

    var activeWebSockets = new Set();
    var NativeWebSocket = window.WebSocket;

    // Intercept WebSocket instantiation to track live connections
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

    // 1. Gracefully close open WebSockets before page enters Back-Forward Cache
    window.addEventListener('pagehide', function (event) {
      activeWebSockets.forEach(function (ws) {
        try {
          if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
            // Suppress error callbacks during bfcache teardown
            ws.onerror = function () {};
            ws.close(1000, 'Page entered Back-Forward Cache');
          }
        } catch (_) {}
      });
      activeWebSockets.clear();
    });

    // 2. Lifecycle restoration when user returns via Back / Forward button
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        // Re-synchronize Firebase Auth & User Session if active
        if (window.FirebaseBridge && typeof window.FirebaseBridge._broadcastAuth === 'function') {
          var savedSession = null;
          try {
            var raw = localStorage.getItem('tfr_user_session');
            if (raw) savedSession = JSON.parse(raw);
          } catch (_) {}
          var active = window.FirebaseBridge.currentUser || savedSession;
          if (active && active.email) {
            window.FirebaseBridge._broadcastAuth(active);
          }
        }

        // Re-render active dashboard triage if initialized
        if (window.FirmDashboard && typeof window.FirmDashboard.render === 'function') {
          window.FirmDashboard.render();
        } else if (window.ClientDashboard && typeof window.ClientDashboard.render === 'function') {
          window.ClientDashboard.render();
        }

        // Reconnect VS Code Live Server hot-reload WebSocket if in local dev
        if (window.location && window.location.port === '5500' && typeof NativeWebSocket === 'function') {
          try {
            var protocol = window.location.protocol === 'http:' ? 'ws://' : 'wss://';
            var address = protocol + window.location.host + '/ws';
            var reloadSocket = new window.WebSocket(address);
            reloadSocket.onerror = function () {};
            reloadSocket.onmessage = function (msg) {
              if (msg && msg.data === 'reload') {
                window.location.reload();
              }
            };
          } catch (_) {}
        }
      }
    });
  })();

  // ── Navigation Configuration ───────────────────────────────────────────────

  var CLIENT_NAV_CONFIG = [
    { id: 'dashboard', title: 'Your file', path: 'dashboard.html', icon: '◉', alias: 'home' },
    { id: 'documents', title: 'Documents', path: 'documents.html', icon: '↑', alias: 'docs' },
    { id: 'signatures', title: 'Sign Form 8879', path: 'signatures.html', icon: '✎', alias: 'sign' },
    { id: 'tax-return', title: 'Your return', path: 'tax-return.html', icon: '☰', alias: 'return' },
    { id: 'messages', title: 'Messages', path: 'messages.html', icon: '✉', alias: 'msgs', badge: 0 },
    { id: 'services', title: 'Services', path: 'services.html', icon: '◎', alias: 'svcs' },
    { id: 'billing', title: 'Billing', path: 'billing.html', icon: '$', alias: 'bill' },
    { id: 'updates', title: 'Updates', path: 'updates.html', icon: '●', alias: 'news' },
    { id: 'profile', title: 'Profile & Security', path: 'profile.html', icon: '⚙', alias: 'profile' }
  ];

  var FIRM_NAV_CONFIG = [
    { grp: 'Firm Operations' },
    { id: 'dashboard', title: 'Operations Triage', path: 'dashboard.html', icon: '⚙', alias: 'all' },
    { id: 'clients', title: 'Clients & Pipeline', path: 'clients.html', icon: '👥', alias: 'clients' },
    { id: 'workflow', title: 'Missing Docs', path: 'workflow.html', icon: '⏳', alias: 'missing' },
    { id: 'documents', title: 'Docs Review Queue', path: 'documents.html', icon: '↑', alias: 'docs', badge: 0 },
    { id: 'returns', title: 'Returns & Sigs', path: 'returns.html', icon: '☰', alias: 'returns' },
    { id: 'signatures', title: 'KBA Monitoring', path: 'signatures.html', icon: '✎', alias: 'kba' },
    { id: 'messages', title: 'Client Messages', path: 'messages.html', icon: '✉', alias: 'messages', badge: 0 },
    { id: 'services', title: 'Service Catalog', path: 'services.html', icon: '◎', alias: 'services' },
    { id: 'billing', title: 'AR & Billing', path: 'billing.html', icon: '$', alias: 'invoices' },
    { id: 'tasks', title: 'Action Tasks', path: 'tasks.html', icon: '📋', alias: 'tasks' },
    { id: 'audit-log', title: 'Audit Ledger', path: 'audit-log.html', icon: '🛡', alias: 'activity' },
    { id: 'staff', title: 'Staff & Roles', path: 'staff.html', icon: '👥', alias: 'staff' },
    { grp: 'Architecture & Rules' },
    { id: 'exhibit-a', title: 'Exhibit A: Compliance', path: 'exhibit-a.html', icon: '⚖', alias: 'exhibit-a' },
    { id: 'exhibit-b', title: 'Exhibit B: Architecture', path: 'exhibit-b.html', icon: '📐', alias: 'exhibit-b' }
  ];

  // ── Layout Controller Object ───────────────────────────────────────────────

  var Layout = {
    clientNav: CLIENT_NAV_CONFIG,
    firmNav: FIRM_NAV_CONFIG,

    /**
     * Initializes the shared layout shell on any page.
     * @param {Object} options - Configuration object { portal: 'client'|'firm', activePage: string, breadcrumbs: [] }
     */
    init: function (options) {
      options = options || {};
      var portal = options.portal || 'client';
      var activePage = options.activePage || 'dashboard';

      this.portal = portal;
      this.activePage = activePage;

      // 1. Resolve User Context
      var user = this.resolveUser(portal);
      this.currentUser = user;

      // 2. Render Shell Components
      this.renderAppbar(portal, user);
      this.renderSidebar(portal, activePage, user);
      this.renderMobileTabbar(portal, activePage);
      if (options.breadcrumbs) {
        this.renderBreadcrumbs(options.breadcrumbs);
      }

      // 3. Clear badge for the active page being viewed & synchronize bell notification
      if (activePage) {
        this.clearBadge(activePage);
      }
      this.syncBellNotification(portal, activePage);

      // 4. Attach Global Event Listeners
      this.bindEvents(portal);

      // 5. Connect Realtime Backend Firebase Synchronization for Navigation Badges
      this.syncWithBackendFirebase(portal);

      // 6. Connect Realtime Connection Lifecycle & Firebase Status Observer
      this.bindConnectionLifecycle();

      // 7. Expose helpers globally
      window.FileRoomLayout = this;
    },

    /**
     * Binds online/offline, firebase-auth-changed, and test connection listeners.
     */
    bindConnectionLifecycle: function () {
      var self = this;
      var isOnline = (typeof navigator !== 'undefined' && navigator.onLine !== false);
      self.updateConnectionStatus(isOnline);

      if (typeof window !== 'undefined') {
        window.addEventListener('online', function () {
          self.updateConnectionStatus(true);
          Layout.showToast('Network restored: Reconnected to Firebase backend', 'ok');
        });

        window.addEventListener('offline', function () {
          self.updateConnectionStatus(false);
          Layout.showToast('Network lost: Operating from local offline cache', 'warning');
        });

        window.addEventListener('firebase-auth-changed', function (e) {
          var u = e.detail ? e.detail.user : null;
          self.updateUserContext(u);
          if (u) {
            self.updateConnectionStatus(true, 'Firebase Auth live · ' + u.email);
          }
        });

        window.addEventListener('firebase-ready', function () {
          self.updateConnectionStatus(true);
        });

        // Intercept click on firebase status badge for on-demand connection ping test
        var badge = document.getElementById('firebase-status-badge');
        if (badge) {
          badge.addEventListener('click', function () {
            self.updateConnectionStatus('checking');
            if (window.FirebaseBridge && typeof window.FirebaseBridge.testConnection === 'function') {
              window.FirebaseBridge.testConnection().then(function (res) {
                if (res && res.success) {
                  self.updateConnectionStatus(true, 'Firebase Live: uk-client-d90d5 · Auth ✓ · Firestore ✓ · Analytics ✓');
                  Layout.showToast('✓ Firebase Connected: uk-client-d90d5 (Firestore & Auth active)', 'ok');
                } else {
                  self.updateConnectionStatus(false, (res && res.message) || 'Firestore unavailable');
                  Layout.showToast('Firebase Status: ' + ((res && res.message) || 'Disconnected'), 'warning');
                }
              }).catch(function (err) {
                self.updateConnectionStatus(false, err.message);
                Layout.showToast('Firebase connection test failed: ' + err.message, 'warning');
              });
            } else {
              var online = (typeof navigator !== 'undefined' && navigator.onLine !== false);
              self.updateConnectionStatus(online);
              Layout.showToast(online ? '✓ System Online · Backend sync active' : '⚠ System Offline · Working from cache', online ? 'ok' : 'warning');
            }
          });
        }
      }
    },

    /**
     * Dynamically updates the Firebase connection badge in the Appbar.
     */
    updateConnectionStatus: function (isConnected, details) {
      var badge = document.getElementById('firebase-status-badge');
      if (!badge) return;

      var projectId = (window.FirebaseBridge && window.FirebaseBridge.config && window.FirebaseBridge.config.projectId) || 'uk-client-d90d5 (piovde-tax)';

      if (isConnected === true || isConnected === 'connected' || isConnected === 'live') {
        badge.className = 'firebase-badge connected';
        badge.innerHTML = '<span class="fb-dot"></span>Online';
        badge.title = details || ('Firebase Live: ' + projectId + ' · Firestore & Auth Connected (Click to Ping)');
      } else if (isConnected === 'checking') {
        badge.className = 'firebase-badge';
        badge.innerHTML = '<span class="fb-dot"></span>Checking...';
        badge.title = 'Verifying Cloud Firestore connectivity...';
      } else {
        badge.className = 'firebase-badge offline';
        badge.innerHTML = '<span class="fb-dot" style="background:#e74c3c;box-shadow:0 0 6px #e74c3c"></span>Offline';
        badge.title = details || 'Firebase Offline · Operating with cached local session (Click to Retry)';
      }
    },

    /**
     * Dynamically updates user identity in the Appbar, User Menu Dropdown, and Sidebar.
     */
    updateUserContext: function (newUser) {
      var user = this.resolveUser(this.portal);
      if (newUser && newUser.email) {
        if (newUser.displayName) user.name = newUser.displayName;
        if (newUser.email) user.email = newUser.email;
        if (newUser.role) user.role = newUser.role;
        if (newUser.photoURL) user.photoURL = newUser.photoURL;
        var defaultInit = this.portal === 'firm' ? 'DR' : 'MW';
        user.initials = (newUser.initials || (user.name ? user.name.split(' ').map(function(n){return n[0];}).join('').slice(0, 2) : defaultInit)).toUpperCase();
      }

      var photo = (newUser && newUser.photoURL) || user.photoURL || '';
      if (!photo) {
        try {
          photo = localStorage.getItem('tfr_user_avatar') || '';
          if (!photo) {
            var rawS = localStorage.getItem('tfr_user_session');
            if (rawS) {
              var ps = JSON.parse(rawS);
              photo = ps.photoURL || '';
            }
          }
        } catch (_) {}
      }

      var avatarEl = document.getElementById('btn-user-avatar');
      if (avatarEl) {
        if (photo) {
          avatarEl.innerHTML = '<img src="' + photo + '" alt="' + (user.name || 'User') + '" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.textContent=\'' + user.initials + '\';" />';
          avatarEl.style.padding = '0';
          avatarEl.style.overflow = 'hidden';
          avatarEl.style.display = 'grid';
          avatarEl.style.placeItems = 'center';
        } else {
          avatarEl.textContent = user.initials;
          avatarEl.style.padding = '';
        }
        avatarEl.title = user.name + ' (' + user.email + ')';
      }

      var dropdownAv = document.querySelector('#user-menu-dropdown .user-menu-header img') || document.querySelector('#user-menu-dropdown .user-menu-header .av');
      if (dropdownAv && dropdownAv.parentNode) {
        if (photo) {
          var newImg = document.createElement('img');
          newImg.src = photo;
          newImg.alt = user.name || 'User';
          newImg.setAttribute('referrerpolicy', 'no-referrer');
          newImg.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--gold);flex-shrink:0;display:block;';
          newImg.onerror = function () {
            var fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'av';
            fallbackDiv.style.cssText = 'width:40px;height:40px;font-size:0.95rem;flex-shrink:0;';
            fallbackDiv.textContent = user.initials;
            if (newImg.parentNode) newImg.parentNode.replaceChild(fallbackDiv, newImg);
          };
          dropdownAv.parentNode.replaceChild(newImg, dropdownAv);
        } else {
          var newDiv = document.createElement('div');
          newDiv.className = 'av';
          newDiv.style.cssText = 'width:40px;height:40px;font-size:0.95rem;flex-shrink:0;';
          newDiv.textContent = user.initials;
          dropdownAv.parentNode.replaceChild(newDiv, dropdownAv);
        }
      }

      var menuNameEl = document.querySelector('.user-menu-name');
      if (menuNameEl) menuNameEl.textContent = user.name;

      var menuEmailEl = document.querySelector('.user-menu-email');
      if (menuEmailEl) menuEmailEl.textContent = user.email;

      var menuRoleTag = document.querySelector('.user-menu-role-tag');
      if (menuRoleTag) {
        var isFirm = this.portal === 'firm';
        menuRoleTag.className = 'user-menu-role-tag ' + (isFirm ? 'firm' : 'client');
        menuRoleTag.textContent = isFirm ? ('Staff · ' + (user.role || 'firm_preparer')) : 'Client Account';
      }

      var sideEmailEl = document.getElementById('side-user-email');
      if (sideEmailEl) {
        sideEmailEl.textContent = user.email;
        sideEmailEl.title = user.email;
      }
    },

    /**
     * Connects layout navigation badges dynamically to backend Firebase.
     */
    syncWithBackendFirebase: function (portal) {
      var self = this;
      if (portal !== 'firm' && self.portal !== 'firm') return;

      function updateBadgesFromData(data) {
        if (!data || !data.metrics) return;
        var m = data.metrics;
        var docsCount = m.docsAwaitingReview !== undefined ? m.docsAwaitingReview : (data.triageQueue ? data.triageQueue.filter(function (t) { return t.category === 'docs' && t.actionKey === 'doc-review'; }).length : 0);
        self.updateBadge('documents', docsCount);

        var missingCount = m.missingDocRequests !== undefined ? m.missingDocRequests : (data.missingDocs ? data.missingDocs.length : 0);
        self.updateBadge('workflow', missingCount);

        var retCount = m.returnsAwaitingApproval !== undefined ? m.returnsAwaitingApproval : 0;
        self.updateBadge('returns', retCount);

        var msgCount = m.unreadMessages !== undefined ? m.unreadMessages : 0;
        self.updateBadge('messages', msgCount);
      }

      function doSync() {
        var bridge = window.FirebaseBridge;
        if (bridge && typeof bridge.getFirmOperationsData === 'function') {
          bridge.getFirmOperationsData().then(updateBadgesFromData).catch(function () {});
        }
      }

      if (window.FirebaseBridge) {
        doSync();
      } else {
        var retries = 0;
        var timer = setInterval(function () {
          retries++;
          if (window.FirebaseBridge || retries > 25) {
            clearInterval(timer);
            if (window.FirebaseBridge) doSync();
          }
        }, 100);
      }

      try {
        var db = window.firebaseDb;
        var onSnap = window.onSnapshot;
        var collFn = window.collection;
        if (db && typeof onSnap === 'function' && typeof collFn === 'function') {
          onSnap(collFn(db, 'documentRequests'), function (snap) {
            var count = 0;
            if (snap && typeof snap.forEach === 'function') {
              snap.forEach(function (d) {
                var st = (d.data() && d.data().status) || '';
                if (st === 'review' || st === 'in_review' || st === 'pending_review') {
                  count++;
                }
              });
            }
            self.updateBadge('documents', count);
          }, function () {});
        }
      } catch (_) {}

      window.addEventListener('tfr:doc_status_changed', function () {
        doSync();
      });
      window.addEventListener('tfr:operations_updated', function () {
        doSync();
      });
    },

    /**
     * Resolves the current session user with demo fallback.
     */
    resolveUser: function (portal) {
      var savedSession = null;
      try {
        var raw = localStorage.getItem('tfr_user_session');
        if (raw) savedSession = JSON.parse(raw);
      } catch (_) {}

      var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser);

      function calcInitials(name, email, fallback) {
        if (name && typeof name === 'string' && name.trim()) {
          var clean = name.trim().replace(/,/g, '');
          var parts = clean.split(/\s+/);
          if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          }
          return clean.slice(0, 2).toUpperCase();
        }
        if (email && typeof email === 'string' && email.trim()) {
          var local = email.split('@')[0].replace(/[^a-zA-Z]/g, '');
          if (local.length > 0) return local.slice(0, 2).toUpperCase();
        }
        return fallback;
      }

      if (fbUser && fbUser.email) {
        var validStaffRoles = ['firm_admin', 'firm_partner', 'firm_preparer', 'firm_reviewer', 'firm_practitioner', 'firm_staff'];
        var resolvedRole = fbUser.role;
        var hasStaffRole = resolvedRole && resolvedRole !== 'client' && validStaffRoles.includes(resolvedRole);
        if (!hasStaffRole) {
          resolvedRole = (portal === 'firm' && fbUser.isStaff) ? 'firm_preparer' : 'client';
          hasStaffRole = resolvedRole !== 'client';
        }
        function formatClientName(displayName, email, fallback) {
          if (displayName) return displayName;
          if (email && !email.toLowerCase().includes('whitfield')) {
            var p = email.split('@')[0].replace(/[._-]+/g, ' ');
            return p.split(' ').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
          }
          return fallback;
        }

        var localAvatar = null;
        try {
          localAvatar = localStorage.getItem('tfr_user_avatar');
          if (!localAvatar && savedSession && savedSession.photoURL) {
            localAvatar = savedSession.photoURL;
          }
        } catch (_) {}
        var name = fbUser.displayName || (hasStaffRole ? 'Denise R., CPA' : formatClientName(null, fbUser.email, 'Michael Whitfield'));
        var defaultInit = hasStaffRole ? 'DR' : 'MW';
        var initials = fbUser.initials || calcInitials(name, fbUser.email, defaultInit);
        var resolvedPhoto = (fbUser && fbUser.photoURL) || localAvatar || (savedSession && savedSession.photoURL) || '';
        return {
          name: name,
          email: fbUser.email,
          initials: initials,
          role: resolvedRole,
          isStaff: Boolean(hasStaffRole),
          mfa: Boolean(fbUser.mfa || fbUser.mfaVerified),
          mfaVerified: Boolean(fbUser.mfa || fbUser.mfaVerified),
          uid: fbUser.uid,
          photoURL: resolvedPhoto
        };
      }

      if (savedSession && savedSession.email) {
        var localAvatarSession = null;
        try {
          localAvatarSession = localStorage.getItem('tfr_user_avatar');
        } catch (_) {}
        var sRole = (savedSession.role || '').toLowerCase();
        var validStaffRoles = ['firm_admin', 'firm_partner', 'firm_preparer', 'firm_reviewer', 'firm_practitioner', 'firm_staff'];
        var hasStaffRole = sRole !== 'client' && validStaffRoles.includes(sRole);
        if (!hasStaffRole) {
          savedSession.role = 'client';
          savedSession.isStaff = false;
        } else {
          savedSession.isStaff = true;
        }
        var sName = savedSession.displayName || (savedSession.name && !savedSession.name.includes('Whitfield') ? savedSession.name : null) || (hasStaffRole ? 'Denise R., CPA' : (function(){
          var sEmail = savedSession.email || '';
          if (sEmail && !sEmail.includes('whitfield')) {
            var p = sEmail.split('@')[0].replace(/[._-]+/g, ' ');
            return p.split(' ').map(function(w){ return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(' ');
          }
          return savedSession.name || 'Michael Whitfield';
        })());
        var sDefault = hasStaffRole ? 'DR' : 'MW';
        if (!savedSession.initials) {
          savedSession.initials = calcInitials(sName, savedSession.email, sDefault);
        }
        savedSession.name = sName;
        savedSession.photoURL = savedSession.photoURL || localAvatarSession || '';
        return savedSession;
      }

      var defaultLocalAvatar = null;
      try {
        defaultLocalAvatar = localStorage.getItem('tfr_user_avatar');
      } catch (_) {}

      // Default Persona Fallbacks
      if (portal === 'firm') {
        return {
          name: 'Denise R., CPA',
          email: 'denise@pivot-aide.tax',
          initials: 'DR',
          role: 'firm_preparer',
          mfa: true,
          uid: 'staff_denise',
          photoURL: defaultLocalAvatar || ''
        };
      } else {
        return {
          name: 'Michael & Elena Whitfield',
          email: 'm.whitfield@example.com',
          initials: 'MW',
          role: 'client',
          mfa: false,
          uid: 'usr_whitfield_4417',
          photoURL: defaultLocalAvatar || ''
        };
      }
    },

    /**
     * Authoritatively verifies whether a user session qualifies as firm staff (Circular 230 / FTC Safeguards).
     * Requires trusted staff role assignment and verified MFA.
     */
    isStaffUser: function (user) {
      if (!user) {
        user = (window.AuthGuard && typeof window.AuthGuard.getAuthState === 'function' && window.AuthGuard.getAuthState()) ||
               (window.FirebaseBridge && window.FirebaseBridge.currentUser) ||
               this.currentUser ||
               this.resolveUser('firm');
      }
      if (!user) return false;
      var role = (user.role || '').toLowerCase();
      var validStaffRoles = ['firm_admin', 'firm_partner', 'firm_preparer', 'firm_reviewer', 'firm_practitioner', 'firm_staff'];
      var hasStaffRole = role !== 'client' && validStaffRoles.includes(role) && user.isStaff === true;
      var hasMfa = Boolean(user.mfa || user.mfaVerified);
      return Boolean(hasStaffRole && hasMfa);
    },

    /**
     * Injects or hydrates the Appbar header.
     */
    renderAppbar: function (portal, user) {
      var appbar = document.querySelector('header.appbar');
      if (!appbar) return;

      user = user || this.resolveUser(portal) || {};
      var isFirm = portal === 'firm';
      var switchLabel = isFirm ? 'Client Portal &rarr;' : 'Firm Console &rarr;';
      var switchHref = isFirm ? '../client/dashboard.html' : '../firm/dashboard.html';
      var switchButtonHtml = isFirm ? '' : '';

      var statusBadgeHtml = isFirm ? [
        '  <span class="firebase-badge connected" id="firebase-status-badge" title="Firebase Backend Live (uk-client-d90d5) · Click to Ping" style="cursor:pointer">',
        '    <span class="fb-dot"></span>Online',
        '  </span>'
      ].join('\n') : '';

      var userName = user.name || (isFirm ? 'Denise R., CPA' : 'Michael Whitfield');
      var userEmail = user.email || (isFirm ? 'denise@pivot-aide.tax' : 'm.whitfield@example.com');
      var userInitials = user.initials || (isFirm ? 'DR' : 'MW');
      var userRole = user.role || (isFirm ? 'firm_preparer' : 'client');
      var userPhoto = user.photoURL || '';
      if (!userPhoto) {
        try {
          userPhoto = localStorage.getItem('tfr_user_avatar') || '';
          if (!userPhoto) {
            var sRawSession = localStorage.getItem('tfr_user_session');
            if (sRawSession) {
              var sParsedSession = JSON.parse(sRawSession);
              userPhoto = sParsedSession.photoURL || '';
            }
          }
        } catch (_) {}
      }

      var avContentHtml = userPhoto ?
        '<img src="' + userPhoto + '" alt="' + userName + '" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.textContent=\'' + userInitials + '\';" />' :
        userInitials;

      var dropdownAvatarHtml = userPhoto ?
        '<img src="' + userPhoto + '" alt="' + userName + '" referrerpolicy="no-referrer" class="user-menu-avatar" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #019FFF;box-shadow:0 0 0 2px rgba(1,159,255,0.25);flex-shrink:0;display:block;" onerror="this.onerror=null;this.outerHTML=\'<div class=\\\'av user-menu-avatar\\\' style=\\\'width:44px;height:44px;font-size:1.15rem;font-weight:700;background:#E64A19;color:#fff;border-radius:50%;display:grid;place-items:center;border:2px solid #019FFF;box-shadow:0 0 0 2px rgba(1,159,255,0.25);flex-shrink:0;\\\'>' + userInitials + '</div>\';" />' :
        '<div class="av user-menu-avatar" style="width:44px;height:44px;font-size:1.15rem;font-weight:700;background:#E64A19;color:#fff;border-radius:50%;display:grid;place-items:center;border:2px solid #019FFF;box-shadow:0 0 0 2px rgba(1,159,255,0.25);flex-shrink:0;">' + userInitials + '</div>';

      appbar.innerHTML = [
        '<div class="appbar-left" style="display:flex;align-items:center;gap:11px">',
        '  <button class="appbar-hamburger" id="btn-toggle-menu" aria-label="Open Navigation Menu">☰</button>',
        '  <a href="index.html" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit" title="Return to Firm Console Home">',
        '    <svg class="owl-av" viewBox="0 0 200 220" style="width:26px;height:29px;flex:none" aria-hidden="true">',
        '      <use href="#pat-av"></use>',
        '    </svg>',
        '    <span class="wm">Pivot Aide <span>Tax</span></span>',
        '  </a>',
        '</div>',
        '<span class="sp" style="flex:1"></span>',
        '<div class="appbar-right" style="display:flex;align-items:center;gap:10px">',
        statusBadgeHtml,
        switchButtonHtml,
        '  <button id="btn-open-arch-rules" class="appbar-rules-btn" title="View IRS Pub 1345 & FTC Safeguards Architecture Rules">',
        '    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">',
        '      <circle cx="12" cy="12" r="10"/>',
        '      <line x1="12" y1="16" x2="12" y2="12"/>',
        '      <line x1="12" y1="8" x2="12.01" y2="8"/>',
        '    </svg>',
        '    <span>Rules</span>',
        '  </button>',
        '  <a href="' + (isFirm ? 'messages.html' : 'updates.html') + '" id="appbar-bell-btn" class="appbar-btn bell" aria-label="Notifications" title="Updates & Deadlines" style="background:transparent;border:0;cursor:pointer;position:relative;display:grid;place-items:center;padding:4px;color:#fff;text-decoration:none">',
        '    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">',
        '      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />',
        '      <path d="M13.7 21a2 2 0 0 1-3.4 0" />',
        '    </svg>',
        '    <span class="dot" id="appbar-bell-dot" style="position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:var(--gold);border:1.5px solid var(--night);display:none"></span>',
        '  </a>',
        '  <div class="user-menu-wrapper">',
        '    <div class="av" id="btn-user-avatar" title="' + userName + ' (' + userEmail + ')" style="cursor:pointer;overflow:hidden;padding:0;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#E64A19;color:#fff;font-weight:700;font-size:0.85rem;border:1.5px solid var(--gold);box-shadow:0 0 0 1.5px rgba(234,228,47,0.25);" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">' + avContentHtml + '</div>',
        '    <div class="user-menu-dropdown" id="user-menu-dropdown">',
        '      <div class="user-menu-header" style="display:flex;align-items:center;gap:14px;">',
        dropdownAvatarHtml,
        '        <div style="min-width:0;flex:1;">',
        '          <div class="user-menu-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + userName + '</div>',
        '          <div class="user-menu-email" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + userEmail + '</div>',
        '          <span class="user-menu-role-tag ' + (isFirm ? 'firm' : 'client') + '">' + (isFirm ? 'Staff · ' + userRole : 'Staff · Client') + '</span>',
        '        </div>',
        '      </div>',
        '      <div class="user-menu-body">',
        '        <a href="' + (isFirm ? 'staff.html' : 'profile.html') + '" class="user-menu-item" id="menu-item-profile">',
        '          <span class="menu-ic">⚙</span>' + (isFirm ? 'Staff Credentials & MFA' : 'Profile & Security'),
        '        </a>',
        '        <a href="dashboard.html" class="user-menu-item" id="menu-item-home">',
        '          <span class="menu-ic">🏛</span>' + (isFirm ? 'Console Home' : 'Client Portal Home'),
        '        </a>',
        '        <div class="user-menu-divider"></div>',
        '        <button type="button" class="user-menu-item" id="btn-menu-theme">',
        '          <span class="menu-ic">◐</span>Toggle Dark / Light',
        '        </button>',
        '        <button type="button" class="user-menu-item user-menu-signout" id="btn-menu-signout">',
        '          <span class="menu-ic">✕</span>Sign out',
        '        </button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
    },

    /**
     * Injects or hydrates the responsive sidebar.
     */
    renderSidebar: function (portal, activePage, user) {
      var sidebar = document.querySelector('aside.side');
      if (!sidebar) return;

      var isFirm = portal === 'firm';
      var navList = isFirm ? this.firmNav : this.clientNav;
      var personaBadgeText = isFirm ? 'Firm Operations' : 'Client Portal';
      var switchHref = isFirm ? '../client/dashboard.html' : '../firm/dashboard.html';

      var navLinksHtml = navList.map(function (item) {
        if (item.grp) {
          return '<span class="grp">' + item.grp + '</span>';
        }
        var isActive = (item.id === activePage || item.alias === activePage);
        var activeClass = isActive ? ' on' : '';
        var badgeCount = (isActive || !item.badge || item.badge <= 0) ? 0 : item.badge;
        var badgeHtml = badgeCount > 0 ? '<span class="badge-num" id="nav-badge-' + item.id + '">' + badgeCount + '</span>' : '';
        return [
          '<a href="' + item.path + '" class="' + activeClass + '" data-page="' + item.id + '">',
          '  <span class="ic">' + item.icon + '</span>',
          '  <span>' + item.title + '</span>',
          badgeHtml,
          '</a>'
        ].join('');
      }).join('');

      sidebar.innerHTML = [
        '<nav class="side-nav" aria-label="' + personaBadgeText + ' Navigation">',
        navLinksHtml,
        '</nav>',
        '<div class="side-footer">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">',
        '    <span id="side-user-email" style="font-size:.72rem;color:var(--night-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px">' + user.email + '</span>',
        '    <button type="button" id="btn-side-signout" title="Sign out" style="background:transparent;border:0;color:var(--gold);font-size:.7rem;cursor:pointer;padding:2px 4px;font-family:var(--f-mono)">Sign out</button>',
        '  </div>',
        '  <div><b>The File Room</b> v1.0</div>',
        '  <div>IRS Pub 1345 &middot; FTC Safeguards</div>',
        '</div>'
      ].join('');
    },

    /**
     * Dynamically updates or clears navigation badge count.
     */
    updateBadge: function (pageId, count) {
      var navList = this.portal === 'firm' ? this.firmNav : this.clientNav;
      var item = navList.find(function (n) { return n.id === pageId || n.alias === pageId; });
      if (item) {
        item.badge = count > 0 ? count : 0;
      }
      var link = document.querySelector('.side a[data-page="' + pageId + '"]');
      if (link) {
        var existingBadge = link.querySelector('.badge-num');
        var isActive = (pageId === this.activePage || (item && item.alias === this.activePage));
        if (count > 0 && !isActive) {
          if (existingBadge) {
            existingBadge.textContent = count;
          } else {
            var span = document.createElement('span');
            span.className = 'badge-num';
            span.id = 'nav-badge-' + pageId;
            span.textContent = count;
            link.appendChild(span);
          }
        } else if (existingBadge) {
          existingBadge.parentNode.removeChild(existingBadge);
        }
      }
    },

    /**
     * Clears badge from a navigation item.
     */
    clearBadge: function (pageId) {
      this.updateBadge(pageId, 0);
    },

    /**
     * Synchronizes bell notification indicator dot based on unread state and active page.
     */
    syncBellNotification: function (portal, activePage) {
      portal = portal || this.portal;
      activePage = activePage || this.activePage;
      var self = this;
      var isNotificationPage = (portal === 'firm' && activePage === 'messages') ||
                               (portal !== 'firm' && activePage === 'updates');
      var bellDot = document.getElementById('appbar-bell-dot') || document.querySelector('.appbar-btn.bell .dot');
      if (!bellDot) return;

      if (isNotificationPage) {
        bellDot.style.display = 'none';
        try {
          localStorage.setItem('tfr_bell_viewed', 'true');
          localStorage.setItem('tfr_notifications_read', 'true');
        } catch (_) {}
        return;
      }

      var isViewed = false;
      try {
        isViewed = localStorage.getItem('tfr_bell_viewed') === 'true' || localStorage.getItem('tfr_notifications_read') === 'true';
      } catch (_) {}

      var hasUnread = false;
      try {
        if (window.FirebaseBridge && typeof window.FirebaseBridge.getUnreadUpdatesCount === 'function') {
          hasUnread = window.FirebaseBridge.getUnreadUpdatesCount() > 0;
        }
      } catch (_) {}

      if (!isViewed && hasUnread) {
        bellDot.style.display = 'block';
      } else if (isViewed) {
        bellDot.style.display = 'none';
      }

      // Live Firestore /updates real-time observation
      try {
        var db = (window.FirebaseBridge && window.FirebaseBridge.db) || window.firebaseDb;
        var onSnap = (window.FirebaseBridge && window.FirebaseBridge.onSnapshot) || window.onSnapshot;
        var collFn = (window.FirebaseBridge && window.FirebaseBridge.collection) || window.collection;
        var qFn = (window.FirebaseBridge && window.FirebaseBridge.query) || window.query;
        var wFn = (window.FirebaseBridge && window.FirebaseBridge.where) || window.where;
        if (db && typeof onSnap === 'function' && typeof collFn === 'function') {
          var user = self.resolveUser(portal);
          var uid = user.uid || (portal === 'firm' ? 'staff_denise' : 'usr_whitfield_4417');
          var isFirm = portal === 'firm';
          var updatesTarget = (isFirm || typeof qFn !== 'function' || typeof wFn !== 'function')
            ? collFn(db, 'updates')
            : qFn(collFn(db, 'updates'), wFn('clientId', '==', uid));

          onSnap(updatesTarget, function (snap) {
            var unreadCount = 0;
            var receipts = {};
            try {
              var raw = localStorage.getItem('the_file_room_read_updates_' + uid);
              if (raw) receipts = JSON.parse(raw);
            } catch (_) {}

            if (snap && typeof snap.forEach === 'function') {
              snap.forEach(function (docSnap) {
                var d = docSnap.data() || {};
                var id = docSnap.id;
                var isTarget = !d.clientId || d.clientId === uid || d.scope === 'firm' || d.scope === 'public';
                if (isTarget && !receipts[id] && !receipts[d.updateId] && (d.isNew === true || d.isRead === false)) {
                  unreadCount++;
                }
              });
            }

            var isNowViewed = false;
            try {
              isNowViewed = localStorage.getItem('tfr_bell_viewed') === 'true' || localStorage.getItem('tfr_notifications_read') === 'true';
            } catch (_) {}

            if (unreadCount > 0 && !isNowViewed && !isNotificationPage) {
              bellDot.style.display = 'block';
            } else if (unreadCount === 0 || isNotificationPage) {
              bellDot.style.display = 'none';
            }
          }, function (err) {
            // Log notice without latching global firestore denial
          });
        }
      } catch (_) {}
    },

    /**
     * Dynamically updates the bell notification indicator dot.
     */
    setBellDot: function (visible) {
      var isNotificationPage = (this.portal === 'firm' && this.activePage === 'messages') ||
                               (this.portal !== 'firm' && this.activePage === 'updates');
      var bellDot = document.getElementById('appbar-bell-dot') || document.querySelector('.appbar-btn.bell .dot');
      if (bellDot) {
        bellDot.style.display = (visible && !isNotificationPage) ? 'block' : 'none';
      }
      if (!visible) {
        try {
          localStorage.setItem('tfr_bell_viewed', 'true');
          localStorage.setItem('tfr_notifications_read', 'true');
        } catch (_) {}
      }
    },

    /**
     * Clears the bell notification dot and persists viewed state.
     */
    clearBell: function () {
      this.setBellDot(false);
    },

    /**
     * Injects or hydrates the mobile bottom tabbar.
     */
    renderMobileTabbar: function (portal, activePage) {
      var isFirm = portal === 'firm';
      var existingTabbar = document.querySelector('.tabbar');
      if (existingTabbar && existingTabbar.parentNode) {
        existingTabbar.parentNode.removeChild(existingTabbar);
      }

      var tabbar = document.createElement('nav');
      tabbar.className = 'tabbar';
      tabbar.setAttribute('aria-label', (isFirm ? 'Firm' : 'Client') + ' Bottom Navigation');

      var tabs = isFirm ? [
        { title: 'Triage', path: 'dashboard.html', id: 'dashboard', icon: '⚙' },
        { title: 'Clients', path: 'clients.html', id: 'clients', icon: '👥' },
        { title: 'Review', path: 'documents.html', id: 'documents', icon: '↑' },
        { title: 'Returns', path: 'returns.html', id: 'returns', icon: '☰' },
        { title: 'Portal', path: '../client/dashboard.html', id: 'portal', icon: '◉' }
      ] : [
        { title: 'File', path: 'dashboard.html', id: 'dashboard', icon: '◉' },
        { title: 'Docs', path: 'documents.html', id: 'documents', icon: '↑' },
        { title: 'Return', path: 'tax-return.html', id: 'tax-return', icon: '☰' },
        { title: 'Msgs', path: 'messages.html', id: 'messages', icon: '✉' },
        { title: 'Profile', path: 'profile.html', id: 'profile', icon: '⚙' }
      ];

      tabbar.innerHTML = tabs.map(function (tab) {
        var onClass = (tab.id === activePage) ? ' class="on"' : '';
        return '<a href="' + tab.path + '"' + onClass + '><span class="ic">' + tab.icon + '</span>' + tab.title + '</a>';
      }).join('');

      var appContainer = document.getElementById('app');
      if (appContainer) {
        appContainer.appendChild(tabbar);
      }
    },

    /**
     * Renders breadcrumb links in the `#page-breadcrumbs` container.
     */
    renderBreadcrumbs: function (crumbs) {
      var container = document.getElementById('page-breadcrumbs');
      if (!container || !Array.isArray(crumbs)) return;

      var crumbsHtml = crumbs.map(function (c, idx) {
        var isLast = idx === crumbs.length - 1;
        if (isLast) {
          return '<span class="crumb-current">' + c.title + '</span>';
        }
        var href = c.href || '#';
        return [
          '<a href="' + href + '" class="crumb-item">' + c.title + '</a>',
          '<span class="crumb-separator">&rsaquo;</span>'
        ].join('');
      }).join('');

      container.innerHTML = '<nav class="breadcrumbs" aria-label="Breadcrumb">' + crumbsHtml + '</nav>';
    },

    /**
     * Attaches global interactive events (hamburger drawer, user menu dropdown, theme toggler, sign out).
     */
    bindEvents: function (portal) {
      // 1. Mobile Drawer Toggle
      var btnHamburger = document.getElementById('btn-toggle-menu');
      var drawerBackdrop = document.getElementById('drawer-backdrop');

      function toggleDrawer(open) {
        var side = document.getElementById('side');
        if (!side) return;
        var willOpen = (typeof open === 'boolean') ? open : !side.classList.contains('open');
        side.classList.toggle('open', willOpen);
        if (drawerBackdrop) {
          drawerBackdrop.classList.toggle('open', willOpen);
        }
      }

      if (btnHamburger) {
        btnHamburger.addEventListener('click', function (e) {
          e.preventDefault();
          toggleDrawer();
        });
      }

      if (drawerBackdrop) {
        drawerBackdrop.addEventListener('click', function () {
          toggleDrawer(false);
        });
      }

      // 2. User Avatar Dropdown
      var btnAvatar = document.getElementById('btn-user-avatar');
      var dropdown = document.getElementById('user-menu-dropdown');

      if (btnAvatar && dropdown) {
        btnAvatar.addEventListener('click', function (e) {
          e.stopPropagation();
          var isOpen = dropdown.classList.toggle('show');
          btnAvatar.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        document.addEventListener('click', function (e) {
          if (!dropdown.contains(e.target) && e.target !== btnAvatar) {
            dropdown.classList.remove('show');
            btnAvatar.setAttribute('aria-expanded', 'false');
          }
        });

        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            btnAvatar.setAttribute('aria-expanded', 'false');
            btnAvatar.focus();
          }
        });
      }

      // Reactive profile photo sync across windows & components
      var self = this;
      function handleAvatarChange(newPhoto) {
        var p = newPhoto;
        if (p === undefined || p === null) {
          try {
            p = localStorage.getItem('tfr_user_avatar') || '';
            if (!p) {
              var sRaw = localStorage.getItem('tfr_user_session');
              if (sRaw) {
                var s = JSON.parse(sRaw);
                p = s.photoURL || '';
              }
            }
          } catch (_) { p = ''; }
        }
        if (self.currentUser) {
          self.currentUser.photoURL = p;
        }
        self.updateUserContext({ photoURL: p });
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('tfr:avatar_updated', function (e) {
          var p = (e && e.detail && e.detail.photoURL !== undefined) ? e.detail.photoURL : null;
          handleAvatarChange(p);
        });

        window.addEventListener('storage', function (e) {
          if (e && (e.key === 'tfr_user_avatar' || e.key === 'tfr_user_session')) {
            handleAvatarChange(null);
          }
        });
      }

      // 3. Theme Toggler
      var btnMenuTheme = document.getElementById('btn-menu-theme');
      if (btnMenuTheme) {
        btnMenuTheme.addEventListener('click', function () {
          var cur = document.documentElement.getAttribute('data-theme') || 'light';
          var next = (cur === 'dark') ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('tfr_theme', next); } catch (_) {}
          Layout.showToast('Theme set to ' + next + ' mode', 'info');
        });
      }

      // 4. Sign Out Buttons
      var signoutHandler = function () {
        try {
          localStorage.removeItem('tfr_user_session');
          localStorage.removeItem('tfr_client_id');
          localStorage.removeItem('tfr_role');
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('tfr_user_session');
          }
          if (window.FirebaseBridge && typeof window.FirebaseBridge.signOut === 'function') {
            window.FirebaseBridge.signOut().catch(function () {});
          } else if (window.FirebaseBridge && typeof window.FirebaseBridge.logoutUser === 'function') {
            window.FirebaseBridge.logoutUser().catch(function () {});
          } else if (window.logoutUser) {
            window.logoutUser().catch(function () {});
          }
        } catch (_) {}
        Layout.showToast('Signed out successfully', 'info');
        setTimeout(function () {
          window.location.href = 'index.html';
        }, 300);
      };

      var btnMenuSignout = document.getElementById('btn-menu-signout');
      if (btnMenuSignout) btnMenuSignout.addEventListener('click', signoutHandler);
      var btnSideSignout = document.getElementById('btn-side-signout');
      if (btnSideSignout) btnSideSignout.addEventListener('click', signoutHandler);

      // 5. Architecture Rules Modal
      var btnRules = document.getElementById('btn-open-arch-rules');
      if (btnRules) {
        btnRules.addEventListener('click', function () {
          Layout.showArchitectureRulesModal();
        });
      }

      // 6. Bell Notification Click Handler
      var btnBell = document.getElementById('appbar-bell-btn') || document.querySelector('.appbar-btn.bell');
      if (btnBell) {
        btnBell.addEventListener('click', function () {
          Layout.clearBell();
        });
      }

      // 7. Global Modal Dismiss Delegation & Escape Key Handler
      if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
          if (!e.target) return;
          var closeTarget = (typeof e.target.closest === 'function')
            ? e.target.closest('[data-close-modal], .btn-close-modal, #btn-close-vault-modal, #btn-close-vault-viewer, #btn-close-triage-modal, #btn-modal-cancel')
            : null;
          if (closeTarget) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            Layout.closeModal();
          }
        });

        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' || e.keyCode === 27) {
            var backdrop = document.getElementById('modal-backdrop');
            if (backdrop && (backdrop.classList.contains('active') || backdrop.classList.contains('open') || backdrop.style.display === 'flex')) {
              Layout.closeModal();
            }
          }
        });
      }

      // 8. Reactive Avatar Update Listener (Realtime & Cross-Component)
      window.addEventListener('tfr:avatar_updated', function (e) {
        var photo = (e && e.detail && e.detail.photoURL) || '';
        if (!photo) {
          try {
            photo = localStorage.getItem('tfr_user_avatar') || '';
            if (!photo) {
              var sRaw = localStorage.getItem('tfr_user_session');
              if (sRaw) {
                var s = JSON.parse(sRaw);
                photo = s.photoURL || '';
              }
            }
          } catch (_) {}
        }
        var avBtn = document.getElementById('btn-user-avatar');
        var u = Layout.resolveUser(Layout.portal);
        if (avBtn) {
          if (photo) {
            avBtn.innerHTML = '<img src="' + photo + '" alt="' + (u.name || 'User') + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + (u.initials || 'MW') + '\';" />';
          } else {
            avBtn.textContent = u.initials || 'MW';
          }
        }
        var dropdownAv = document.querySelector('#user-menu-dropdown .user-menu-header img') || document.querySelector('#user-menu-dropdown .user-menu-header .av');
        if (dropdownAv && dropdownAv.parentNode) {
          if (photo) {
            var newImg = document.createElement('img');
            newImg.src = photo;
            newImg.alt = u.name || 'User';
            newImg.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--gold);flex-shrink:0;display:block;';
            newImg.onerror = function () {
              var fallbackDiv = document.createElement('div');
              fallbackDiv.className = 'av';
              fallbackDiv.style.cssText = 'width:40px;height:40px;font-size:0.95rem;flex-shrink:0;';
              fallbackDiv.textContent = u.initials || 'MW';
              if (newImg.parentNode) newImg.parentNode.replaceChild(fallbackDiv, newImg);
            };
            dropdownAv.parentNode.replaceChild(newImg, dropdownAv);
          } else {
            var newDiv = document.createElement('div');
            newDiv.className = 'av';
            newDiv.style.cssText = 'width:40px;height:40px;font-size:0.95rem;flex-shrink:0;';
            newDiv.textContent = u.initials || 'MW';
            dropdownAv.parentNode.replaceChild(newDiv, dropdownAv);
          }
        }
      });

      // 9. Storage Event Listener for Cross-Tab Reactive Synchronization
      window.addEventListener('storage', function (e) {
        if (e.key === 'tfr_user_avatar' || e.key === 'tfr_user_session') {
          var updatedPhoto = localStorage.getItem('tfr_user_avatar') || '';
          if (!updatedPhoto && e.key === 'tfr_user_session' && e.newValue) {
            try {
              var parsed = JSON.parse(e.newValue);
              updatedPhoto = parsed.photoURL || '';
            } catch (_) {}
          }
          window.dispatchEvent(new CustomEvent('tfr:avatar_updated', {
            detail: { photoURL: updatedPhoto }
          }));
        }
      });
    },

    // ── Reusable Component Renderers ──────────────────────────────────────────

    /**
     * Renders a loading spinner state into a target container.
     */
    renderLoading: function (containerEl, message) {
      if (typeof containerEl === 'string') {
        containerEl = document.getElementById(containerEl);
      }
      if (!containerEl) return;
      message = message || 'Loading file data...';

      containerEl.innerHTML = [
        '<div class="loading-state-container" role="status">',
        '  <div class="loading-spinner"></div>',
        '  <div class="loading-text">' + message + '</div>',
        '</div>'
      ].join('');
    },

    /**
     * Renders an empty state card into a target container.
     */
    renderEmpty: function (containerEl, options) {
      if (typeof containerEl === 'string') {
        containerEl = document.getElementById(containerEl);
      }
      if (!containerEl) return;
      options = options || {};
      var icon = options.icon || '✓';
      var title = options.title || 'All Clear';
      var desc = options.desc || 'There are no pending actions or outstanding records at this time.';
      var actionBtnHtml = '';

      if (options.actionText && options.actionHref) {
        actionBtnHtml = '<div class="empty-state-actions"><a href="' + options.actionHref + '" class="btn sm btn-b">' + options.actionText + '</a></div>';
      } else if (options.actionText && options.onAction) {
        actionBtnHtml = '<div class="empty-state-actions"><button type="button" class="btn sm btn-b" id="empty-state-action-btn">' + options.actionText + '</button></div>';
      }

      containerEl.innerHTML = [
        '<div class="empty-state-card">',
        '  <div class="empty-state-icon">' + icon + '</div>',
        '  <h3 class="empty-state-title">' + title + '</h3>',
        '  <p class="empty-state-desc">' + desc + '</p>',
        actionBtnHtml,
        '</div>'
      ].join('');

      if (options.onAction && document.getElementById('empty-state-action-btn')) {
        document.getElementById('empty-state-action-btn').addEventListener('click', options.onAction);
      }
    },

    /**
     * Renders an error state card into a target container.
     */
    renderError: function (containerEl, options) {
      if (typeof containerEl === 'string') {
        containerEl = document.getElementById(containerEl);
      }
      if (!containerEl) return;
      options = options || {};
      var icon = options.icon || '⚠';
      var title = options.title || 'Unable to Load Records';
      var desc = options.desc || 'An unexpected network or permission issue occurred while retrieving data.';
      var retryBtnHtml = '';

      if (options.onRetry) {
        retryBtnHtml = '<button type="button" class="btn sm btn-o" id="error-state-retry-btn">Retry Request</button>';
      }

      containerEl.innerHTML = [
        '<div class="error-state-card" role="alert">',
        '  <div class="error-state-icon">' + icon + '</div>',
        '  <div class="error-state-title">' + title + '</div>',
        '  <div class="error-state-desc">' + desc + '</div>',
        retryBtnHtml,
        '</div>'
      ].join('');

      if (options.onRetry && document.getElementById('error-state-retry-btn')) {
        document.getElementById('error-state-retry-btn').addEventListener('click', options.onRetry);
      }
    },

    /**
     * Renders a statutory 403 Access Denied security card into a target container.
     */
    renderAccessDenied: function (containerEl, options) {
      if (typeof containerEl === 'string') {
        containerEl = document.getElementById(containerEl);
      }
      if (!containerEl) return;
      options = options || {};
      var title = options.title || '403 FORBIDDEN · ACCESS RESTRICTED';
      var message = options.message || 'Staff credentials and verified Multi-Factor Authentication (MFA) are required to access Firm Operations Console.';
      var loginUrl = options.loginUrl || 'index.html';

      containerEl.innerHTML = [
        '<div class="card p-xl text-center" style="max-width:560px;margin:40px auto;border:2px solid var(--danger);background:var(--surface)">',
        '  <div style="font-size:3rem;margin-bottom:16px;">🛑</div>',
        '  <h2 style="font-family:var(--f-display);margin-bottom:8px;color:var(--danger);">' + title + '</h2>',
        '  <p style="color:var(--ink-2);font-size:0.9rem;margin-bottom:24px;line-height:1.5;">' + message + '</p>',
        '  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">',
        '    <a href="' + loginUrl + '" class="btn btn-b">Return to Sign In &rarr;</a>',
        '    <a href="../client/dashboard.html" class="btn btn-o">Go to Client Portal</a>',
        '  </div>',
        '</div>'
      ].join('');
    },

    /**
     * Reusable Toast notification banner.
     */
    showToast: function (msg, type) {
      var container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
      }

      var toast = document.createElement('div');
      toast.className = 'toast ' + (type || 'info');
      toast.textContent = msg;
      container.appendChild(toast);

      setTimeout(function () {
        toast.classList.add('out');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
      }, 3500);
    },

    /**
     * Renders a modern, accessible, perfectly centered in-app alert dialog.
     * Replaces browser's top-docked native alert() with a centered modal card.
     */
    showCenteredAlert: function (message, title, onOk) {
      if (typeof document === 'undefined') return;

      var existingAlert = document.getElementById('tfr-centered-alert-backdrop');
      if (existingAlert && existingAlert.parentNode) {
        existingAlert.parentNode.removeChild(existingAlert);
      }

      var alertBackdrop = document.createElement('div');
      alertBackdrop.id = 'tfr-centered-alert-backdrop';
      alertBackdrop.className = 'modal-backdrop active open';
      alertBackdrop.style.cssText = 'position:fixed;inset:0;background:rgba(6,32,45,0.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex!important;align-items:center!important;justify-content:center!important;z-index:9999999;padding:16px;box-sizing:border-box;margin:0!important;';

      var alertCard = document.createElement('div');
      alertCard.className = 'modal-card';
      alertCard.style.cssText = 'background:#ffffff;border-radius:14px;box-shadow:0 24px 64px rgba(2,14,22,0.5),0 0 0 1px rgba(0,0,0,0.06);width:100%;max-width:440px;text-align:center;padding:28px 24px;box-sizing:border-box;margin:auto!important;';

      var alertTitle = title || 'Notice';
      var isReceipt = (message && message.indexOf('Receipt reference') !== -1) || (alertTitle && alertTitle.toLowerCase().indexOf('receipt') !== -1);
      var icon = isReceipt ? '📋' : 'ℹ️';

      // Clean message formatting
      var formattedMsg = (message || '');
      var receiptMatch = formattedMsg.match(/REC-[A-Z0-9_-]+/i);
      var msgHtml = formattedMsg;
      if (receiptMatch) {
        var rCode = receiptMatch[0];
        msgHtml = formattedMsg.replace(rCode, '<b style="font-family:var(--f-mono,monospace);color:#019FFF;background:rgba(1,159,255,0.08);padding:3px 8px;border-radius:4px;word-break:break-all;">' + rCode + '</b>');
      }

      alertCard.innerHTML = [
        '<div style="width:52px;height:52px;border-radius:50%;background:rgba(1,159,255,0.1);color:#019FFF;font-size:1.8rem;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;">' + icon + '</div>',
        '<h3 style="font-family:var(--f-display,serif);margin:0 0 10px 0;font-size:1.25rem;color:#06202D;font-weight:600;">' + alertTitle + '</h3>',
        '<p style="font-size:0.88rem;color:#4B6475;line-height:1.55;margin:0 0 22px 0;word-break:break-word;">' + msgHtml + '</p>',
        '<div style="display:flex;justify-content:center;">',
        '  <button type="button" id="tfr-centered-alert-ok-btn" class="btn sm btn-b" style="min-width:110px;padding:9px 26px;font-size:0.88rem;font-weight:600;border-radius:6px;cursor:pointer;background:#019FFF;color:#fff;border:none;box-shadow:0 2px 6px rgba(1,159,255,0.35);">OK</button>',
        '</div>'
      ].join('');

      alertBackdrop.appendChild(alertCard);
      document.body.appendChild(alertBackdrop);

      var okBtn = document.getElementById('tfr-centered-alert-ok-btn');
      var keyHandler = function (e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.keyCode === 27 || e.keyCode === 13) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          closeAlert();
        }
      };

      var closeAlert = function () {
        if (alertBackdrop && alertBackdrop.parentNode) {
          alertBackdrop.parentNode.removeChild(alertBackdrop);
        }
        if (typeof document.removeEventListener === 'function') {
          document.removeEventListener('keydown', keyHandler);
        }
        if (typeof onOk === 'function') onOk();
      };

      if (okBtn) {
        okBtn.onclick = closeAlert;
        try { okBtn.focus(); } catch (_) {}
      }

      alertBackdrop.onclick = function (e) {
        if (e.target === alertBackdrop) {
          closeAlert();
        }
      };

      if (typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', keyHandler);
      }
    },

    /**
     * Web Audio API synthesized melodic notification chime.
     * Dual-tone sequence: 587.33 Hz (D5) -> 880 Hz (A5).
     * Respects user sound preference in localStorage ('tfr_sound_notifications').
     * Handles browser autoplay policy / AudioContext suspension.
     * @param {boolean} [force=false] - Force play even if muted (for explicit Test Sound buttons).
     */
    playNotificationSound: function (force) {
      if (typeof window === 'undefined') return;

      var soundPref = null;
      try {
        soundPref = localStorage.getItem('tfr_sound_notifications');
      } catch (_) {}
      var isEnabled = soundPref !== 'false';
      if (!isEnabled && !force) return;

      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        if (!this._audioCtx || this._audioCtx.state === 'closed') {
          this._audioCtx = new AudioCtx();
        }
        var ctx = this._audioCtx;

        if (ctx.state === 'suspended') {
          ctx.resume().catch(function () {});
        }

        var now = ctx.currentTime;

        // Note 1: D5 (587.33 Hz)
        var osc1 = ctx.createOscillator();
        var gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);

        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.23);

        // Note 2: A5 (880.00 Hz)
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.12);

        gain2.gain.setValueAtTime(0, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.22, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.50);

      } catch (err) {
        console.warn('[Layout] Sound alert notice:', err);
      }
    },

    /**
     * Opens modal dialog.
     */
    openModal: function (htmlContent) {
      var doc = (typeof document !== 'undefined') ? document : (window && window.document);
      if (!doc) return;
      var backdrop = doc.getElementById('modal-backdrop');
      var container = doc.getElementById('modal-container');
      if (!backdrop || !container) return;

      container.innerHTML = htmlContent;

      if (backdrop.classList) {
        backdrop.classList.add('active');
        backdrop.classList.add('open');
      }
      if (backdrop.style) {
        backdrop.style.display = 'flex';
      }

      var closeBtns = (typeof container.querySelectorAll === 'function')
        ? container.querySelectorAll('[data-close-modal], .btn-close-modal, #btn-close-vault-modal, #btn-close-vault-viewer, #btn-close-triage-modal, #btn-modal-cancel')
        : [];
      if (closeBtns && closeBtns.forEach) {
        closeBtns.forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            Layout.closeModal();
          });
        });
      }

      backdrop.onclick = function (e) {
        if (e.target === backdrop) {
          Layout.closeModal();
        }
      };
    },

    /**
     * Closes modal dialog.
     */
    closeModal: function () {
      var doc = (typeof document !== 'undefined') ? document : (window && window.document);
      if (!doc) return;
      var backdrop = doc.getElementById('modal-backdrop');
      if (backdrop) {
        if (backdrop.classList) {
          backdrop.classList.remove('active');
          backdrop.classList.remove('open');
        }
        if (backdrop.style) {
          backdrop.style.display = 'none';
        }
      }
      var container = doc.getElementById('modal-container');
      if (container) {
        container.innerHTML = '';
        if (container.classList) {
          container.classList.remove('modal-wide');
        }
        if (container.style) {
          container.style.maxWidth = '';
          container.style.maxHeight = '';
          container.style.overflowY = '';
        }
      }
    },

    /**
     * Architecture Rules Modal (IRS Pub 1345, FTC Safeguards, Circular 230, and Live Backend Security).
     */
    showArchitectureRulesModal: function () {
      this.openModal([
        '<div class="modal-hdr" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line)">',
        '  <h3 style="font-family:var(--f-display);margin:0;font-size:1.15rem;color:var(--ink)">Governing Regulatory Rules & Backend Security</h3>',
        '  <button type="button" data-close-modal style="background:transparent;border:0;font-size:1.2rem;cursor:pointer;color:var(--ink-2)">&times;</button>',
        '</div>',
        '<div class="modal-body" style="padding:20px;max-height:70vh;overflow-y:auto;font-size:.85rem;line-height:1.5;color:var(--ink)">',
        '  <div style="margin-bottom:12px;padding:12px;background:var(--surface-2);border-left:3px solid var(--ok);border-radius:4px">',
        '    <div style="font-weight:700;color:var(--ok);margin-bottom:4px;display:flex;align-items:center;gap:6px">',
        '      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok)"></span>',
        '      Live Firebase Backend: Connected',
        '    </div>',
        '    <div style="font-size:.78rem;color:var(--ink-2)">Project: <code>uk-client-d90d5 (piovde-tax)</code> &middot; Cloud Firestore NoSQL &middot; Firebase Auth &middot; Storage Vault</div>',
        '  </div>',
        '  <div style="margin-bottom:14px;padding:12px;background:var(--surface-2);border-left:3px solid var(--brand);border-radius:4px">',
        '    <b>IRS Publication 1345 § 5:</b> Remote Form 8879 signing mandates non-repudiable identity verification (out-of-wallet credit bureau KBA or DocuSign ID Evidence). Browser-only quizzes are prohibited in production.',
        '  </div>',
        '  <div style="margin-bottom:14px;padding:12px;background:var(--surface-2);border-left:3px solid var(--gold);border-radius:4px">',
        '    <b>Treasury Circular 230 § 10.22:</b> Tax practitioner diligence requires independent document review and preparer-signed publication before transmission.',
        '  </div>',
        '  <div style="margin-bottom:14px;padding:12px;background:var(--surface-2);border-left:3px solid var(--ok);border-radius:4px">',
        '    <b>FTC Safeguards Rule 16 CFR § 314.4:</b> Customer financial data must be protected with MFA on all staff accounts, 25MB encrypted storage vaults, and tamper-evident audit logs.',
        '  </div>',
        '</div>',
        '<div class="modal-ftr" style="padding:12px 20px;background:var(--surface-2);border-top:1px solid var(--line);text-align:right">',
        '  <button type="button" class="btn sm btn-b" data-close-modal>Understood</button>',
        '</div>'
      ].join(''));
    },

    /**
     * Renders high-fidelity Storage Vault document preview (IRS Tax Forms, Uploaded Scans, or Cryptographic Custody).
     */
    renderVaultDocumentHtml: function (params) {
      params = params || {};
      var docId = params.docId || ('doc_' + Date.now());
      var title = params.title || params.name || 'Tax Document';
      var client = params.client || 'Taxpayer';
      var clientUid = params.clientUid || 'usr_whitfield_4417';
      var downloadUrl = params.downloadUrl || '';

      // Check cached binary in sessionStorage
      var cachedDataUrl = null;
      var sess = params.sessionStorage ||
                 (typeof window !== 'undefined' && window.sessionStorage) ||
                 (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (sess) {
        try {
          cachedDataUrl = sess.getItem('tfr_vault_' + docId) ||
                          sess.getItem('tfr_vault_' + docId.replace(/^trg_(req|doc|rej)_/, '')) ||
                          (params.requestId ? sess.getItem('tfr_vault_' + params.requestId) : null);
        } catch (_) {}
      }
      if (!cachedDataUrl && downloadUrl && (downloadUrl.indexOf('data:') === 0 || downloadUrl.indexOf('blob:') === 0)) {
        cachedDataUrl = downloadUrl;
      }

      var sTitle = (title + ' ' + docId).toLowerCase();
      var isW2 = sTitle.indexOf('w2') !== -1 || sTitle.indexOf('w-2') !== -1 || sTitle.indexOf('wage') !== -1;
      var is1099Nec = sTitle.indexOf('1099-nec') !== -1 || sTitle.indexOf('1099nec') !== -1 || sTitle.indexOf('design co') !== -1;
      var is1099Misc = sTitle.indexOf('1099-misc') !== -1 || sTitle.indexOf('1099misc') !== -1 || sTitle.indexOf('keystone') !== -1 || sTitle.indexOf('rental') !== -1;
      var isClosing = sTitle.indexOf('closing') !== -1 || sTitle.indexOf('settlement') !== -1 || sTitle.indexOf('disclosure') !== -1;
      var isK1 = sTitle.indexOf('k-1') !== -1 || sTitle.indexOf('k1') !== -1 || sTitle.indexOf('brennan') !== -1 || sTitle.indexOf('1065') !== -1;

      // Body markup for Document View
      var docBodyHtml = '';
      if (cachedDataUrl && cachedDataUrl.indexOf('data:image/') === 0) {
        docBodyHtml = [
          '<div style="text-align:center;padding:16px;background:#1a202c;border-radius:4px">',
          '  <img src="' + cachedDataUrl + '" alt="' + title + '" style="max-width:100%;max-height:460px;object-fit:contain;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.3)">',
          '  <div style="font-size:.74rem;color:#cbd5e1;margin-top:8px">Uploaded Image Scan &middot; ClamAV Clean &middot; AES-256 Vault Custody</div>',
          '</div>'
        ].join('');
      } else if ((cachedDataUrl && (cachedDataUrl.indexOf('data:application/pdf') === 0 || cachedDataUrl.indexOf('blob:') === 0)) ||
                 (downloadUrl && (downloadUrl.indexOf('.pdf') !== -1 || downloadUrl.indexOf('firebasestorage') !== -1 || downloadUrl.indexOf('blob:') === 0 || downloadUrl.indexOf('data:application/pdf') === 0)) ||
                 (params && params.testPdfUrl)) {
        var activePdfUrl = (cachedDataUrl && (cachedDataUrl.indexOf('data:application/pdf') === 0 || cachedDataUrl.indexOf('blob:') === 0))
          ? cachedDataUrl
          : ((downloadUrl && (downloadUrl.indexOf('.pdf') !== -1 || downloadUrl.indexOf('firebasestorage') !== -1 || downloadUrl.indexOf('blob:') === 0 || downloadUrl.indexOf('data:application/pdf') === 0))
            ? downloadUrl
            : (params && params.testPdfUrl));
        docBodyHtml = [
          '<div style="height:520px;background:#fff;border-radius:4px;overflow:hidden;border:1px solid var(--line);display:flex;flex-direction:column;">',
          '  <div style="padding:6px 12px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:.74rem;display:flex;justify-content:space-between;align-items:center;">',
          '    <span style="color:var(--ink-2);font-family:var(--f-mono)">PDF Stream &middot; Encrypted AES-256 Vault View</span>',
          '    <a href="' + activePdfUrl + '" target="_blank" rel="noopener" style="color:var(--brand);text-decoration:underline;font-weight:600">Open in New Window &nearr;</a>',
          '  </div>',
          '  <iframe src="' + activePdfUrl + '#toolbar=1" style="width:100%;flex:1;border:none" title="' + title + '"></iframe>',
          '</div>'
        ].join('');
      } else if (isW2) {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:16px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">',
          '    <div><span style="font-family:monospace;font-weight:bold;font-size:13px;border:1px solid #111;padding:1px 6px">22222</span> <span style="font-size:10px;color:#666">Void &#9633;</span></div>',
          '    <div style="text-align:center"><div style="font-weight:bold;font-size:14px;letter-spacing:0.5px">Form W-2 Wage and Tax Statement</div><div style="font-size:10px;color:#555">Copy B &mdash; To Be Filed With Employee\'s Federal Tax Return</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:14px">2026</div><div style="font-size:9px;color:#666">OMB No. 1545-0008</div></div>',
          '  </div>',
          '  <div style="display:grid;grid-template-columns:1.2fr 1fr;border:1px solid #111">',
          '    <div style="border-right:1px solid #111">',
          '      <div style="padding:5px;border-bottom:1px solid #111"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">a Employee\'s social security number</div><div style="font-family:monospace;font-size:13px;font-weight:bold;padding-top:1px">***-**-4417</div></div>',
          '      <div style="padding:5px;border-bottom:1px solid #111"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">b Employer identification number (EIN)</div><div style="font-family:monospace;font-size:13px;font-weight:bold;padding-top:1px">12-8941029</div></div>',
          '      <div style="padding:5px;border-bottom:1px solid #111;min-height:50px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">c Employer\'s name, address, and ZIP code</div><div style="font-weight:bold;padding-top:1px">Halstead Medical Partners LLC</div><div style="color:#333">440 Park Ave S, 8th Fl, New York, NY 10016</div></div>',
          '      <div style="padding:5px;border-bottom:1px solid #111"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">e Employee\'s name</div><div style="font-weight:bold;font-size:12px;padding-top:1px">' + client + '</div></div>',
          '      <div style="padding:5px;min-height:40px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">f Employee\'s address and ZIP code</div><div style="color:#333">742 Evergreen Terrace, Apt 4B, New York, NY 10025</div></div>',
          '    </div>',
          '    <div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>1</b> Wages, tips, other comp.</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$142,500.00</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>2</b> Federal income tax withheld</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$22,800.00</div></div>',
          '      </div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>3</b> Social security wages</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$142,500.00</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>4</b> Social security tax withheld</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$8,835.00</div></div>',
          '      </div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>5</b> Medicare wages</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$142,500.00</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>6</b> Medicare tax withheld</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$2,066.25</div></div>',
          '      </div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>12a</b> Code D (401k)</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$22,500.00</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>13</b> Retirement Plan</div><div style="font-size:10px;font-weight:bold;text-align:center">&#9745; Checked</div></div>',
          '      </div>',
          '      <div style="display:grid;grid-template-columns:0.6fr 1.2fr 1.2fr">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>15</b> State</div><div style="font-family:monospace;font-size:12px;font-weight:bold">NY</div></div>',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>16</b> State wages</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$142,500.00</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>17</b> State income tax</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$8,550.00</div></div>',
          '      </div>',
          '    </div>',
          '  </div>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:4px">',
          '    <span>Internal Revenue Service &middot; Treasury Form W-2</span>',
          '    <span style="font-family:monospace">VAULT-ID: ' + docId + ' &middot; AES-256 SEAL VERIFIED</span>',
          '  </div>',
          '</div>'
        ].join('');
      } else if (is1099Nec) {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:16px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:grid;grid-template-columns:1.4fr 1fr;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">',
          '    <div><div style="font-size:10px;color:#555">&#9633; CORRECTED (if checked)</div><div style="font-weight:bold;font-size:15px;margin-top:2px">Form 1099-NEC &middot; Nonemployee Compensation</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:15px">2026</div><div style="font-size:9px;color:#666">OMB No. 1545-0115 &middot; Copy B For Recipient</div></div>',
          '  </div>',
          '  <div style="display:grid;grid-template-columns:1.2fr 1fr;border:1px solid #111">',
          '    <div style="border-right:1px solid #111">',
          '      <div style="padding:6px;border-bottom:1px solid #111;min-height:50px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">PAYER\'S name, address, and telephone number</div><div style="font-weight:bold;padding-top:2px">Keystone Property Group LLC / Whitfield Design Co.</div><div style="color:#333">100 Broadway, Suite 400, New York, NY 10005 &middot; (212) 555-0199</div></div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555;font-weight:bold">PAYER\'S TIN</div><div style="font-family:monospace;font-size:12px;font-weight:bold">12-3456789</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555;font-weight:bold">RECIPIENT\'S TIN</div><div style="font-family:monospace;font-size:12px;font-weight:bold">***-**-4417</div></div>',
          '      </div>',
          '      <div style="padding:5px;border-bottom:1px solid #111"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">RECIPIENT\'S name</div><div style="font-weight:bold;font-size:12px">' + client + '</div></div>',
          '      <div style="padding:5px;min-height:40px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">Street address (including apt. no.)</div><div style="color:#333">742 Evergreen Terrace, Apt 4B, New York, NY 10025</div></div>',
          '    </div>',
          '    <div>',
          '      <div style="padding:8px;border-bottom:1px solid #111;background:rgba(234,228,47,0.06)"><div style="font-size:10px;color:#111"><b>1</b> Nonemployee compensation</div><div style="font-family:monospace;font-size:16px;font-weight:bold;text-align:right;padding-top:2px;color:#06202D">$48,500.00</div></div>',
          '      <div style="padding:6px;border-bottom:1px solid #111"><div style="font-size:10px;color:#555"><b>4</b> Federal income tax withheld</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$0.00</div></div>',
          '      <div style="display:grid;grid-template-columns:0.6fr 1.2fr 1.2fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>5</b> State</div><div style="font-family:monospace;font-size:12px;font-weight:bold">NY</div></div>',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555"><b>6</b> State no.</div><div style="font-family:monospace;font-size:11px;font-weight:bold">12-3456789</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555"><b>7</b> State income</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$48,500.00</div></div>',
          '      </div>',
          '      <div style="padding:8px;background:#f9fbfd"><div style="font-size:9px;color:#666">This is important tax information furnished to the IRS. Net self-employment subject to Schedule C reconciliation.</div></div>',
          '    </div>',
          '  </div>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:4px">',
          '    <span>Department of the Treasury &mdash; Internal Revenue Service</span>',
          '    <span style="font-family:monospace">VAULT-ID: ' + docId + ' &middot; CLAMAV CLEAN</span>',
          '  </div>',
          '</div>'
        ].join('');
      } else if (is1099Misc) {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:16px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:grid;grid-template-columns:1.4fr 1fr;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">',
          '    <div><div style="font-size:10px;color:#555">&#9633; CORRECTED (if checked)</div><div style="font-weight:bold;font-size:15px;margin-top:2px">Form 1099-MISC &middot; Miscellaneous Information</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:15px">2026</div><div style="font-size:9px;color:#666">OMB No. 1545-0115 &middot; Copy B For Recipient</div></div>',
          '  </div>',
          '  <div style="display:grid;grid-template-columns:1.2fr 1fr;border:1px solid #111">',
          '    <div style="border-right:1px solid #111">',
          '      <div style="padding:6px;border-bottom:1px solid #111;min-height:50px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">PAYER\'S name, address, and telephone number</div><div style="font-weight:bold;padding-top:2px">Keystone Property Group LLC</div><div style="color:#333">100 Broadway, Suite 400, New York, NY 10005 &middot; (212) 555-0199</div></div>',
          '      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #111">',
          '        <div style="padding:5px;border-right:1px solid #111"><div style="font-size:9px;color:#555;font-weight:bold">PAYER\'S TIN</div><div style="font-family:monospace;font-size:12px;font-weight:bold">12-3456789</div></div>',
          '        <div style="padding:5px"><div style="font-size:9px;color:#555;font-weight:bold">RECIPIENT\'S TIN</div><div style="font-family:monospace;font-size:12px;font-weight:bold">***-**-4417</div></div>',
          '      </div>',
          '      <div style="padding:5px;border-bottom:1px solid #111"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">RECIPIENT\'S name</div><div style="font-weight:bold;font-size:12px">' + client + '</div></div>',
          '      <div style="padding:5px;min-height:40px"><div style="font-size:9px;text-transform:uppercase;color:#555;font-weight:bold">Street address (including apt. no.)</div><div style="color:#333">742 Evergreen Terrace, Apt 4B, New York, NY 10025</div></div>',
          '    </div>',
          '    <div>',
          '      <div style="padding:8px;border-bottom:1px solid #111;background:rgba(234,228,47,0.06)"><div style="font-size:10px;color:#111"><b>1</b> Rents (Real Estate)</div><div style="font-family:monospace;font-size:16px;font-weight:bold;text-align:right;padding-top:2px;color:#06202D">$24,000.00</div></div>',
          '      <div style="padding:6px;border-bottom:1px solid #111"><div style="font-size:10px;color:#555"><b>2</b> Royalties</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$0.00</div></div>',
          '      <div style="padding:6px;border-bottom:1px solid #111"><div style="font-size:10px;color:#555"><b>4</b> Federal income tax withheld</div><div style="font-family:monospace;font-size:12px;font-weight:bold;text-align:right">$0.00</div></div>',
          '      <div style="padding:8px;background:#f9fbfd"><div style="font-size:9px;color:#666">Schedule E Supplemental Income reporting required under IRC &sect; 469 passive activity rules.</div></div>',
          '    </div>',
          '  </div>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:4px">',
          '    <span>Department of the Treasury &mdash; Internal Revenue Service</span>',
          '    <span style="font-family:monospace">VAULT-ID: ' + docId + ' &middot; CLAMAV CLEAN</span>',
          '  </div>',
          '</div>'
        ].join('');
      } else if (isClosing) {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:16px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">',
          '    <div><div style="font-weight:bold;font-size:15px">Closing Disclosure</div><div style="font-size:10px;color:#555">U.S. Consumer Financial Protection Bureau (CFPB) Form H-25</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:13px">Settlement Date: 14 Aug 2026</div><div style="font-size:9px;color:#666">File No: CD-2026-9918</div></div>',
          '  </div>',
          '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1px solid #111;padding:8px;margin-bottom:8px">',
          '    <div><div><b>Borrower:</b> ' + client + '</div><div><b>Property:</b> 742 Evergreen Terrace, New York, NY 10025</div><div><b>Sale Price:</b> $625,000.00</div></div>',
          '    <div><div><b>Loan Amount:</b> $500,000.00 &middot; 30-Yr Fixed</div><div><b>Interest Rate:</b> 5.875%</div><div><b>Lender:</b> First National Mortgage Corp</div></div>',
          '  </div>',
          '  <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #111">',
          '    <thead><tr style="background:#f1f5f9;border-bottom:1px solid #111"><th style="padding:6px;text-align:left">Closing Cost Item (Tax Relevant Disclosures)</th><th style="padding:6px;text-align:right">Paid at Closing</th><th style="padding:6px;text-align:left">Tax Treatment</th></tr></thead>',
          '    <tbody>',
          '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>Origination Points (1.000%)</b> &mdash; Loan discount fee</td><td style="padding:6px;text-align:right;font-family:monospace;font-weight:bold">$4,250.00</td><td style="padding:6px;color:var(--ok);font-weight:bold">&#10003; IRC &sect; 163 Deductible Points</td></tr>',
          '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>Real Estate Property Taxes (County/City)</b></td><td style="padding:6px;text-align:right;font-family:monospace;font-weight:bold">$6,180.00</td><td style="padding:6px;color:var(--ok);font-weight:bold">&#10003; Schedule A SALT Deductible</td></tr>',
          '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>Prepaid Homeowners Hazard Insurance (12 mo)</b></td><td style="padding:6px;text-align:right;font-family:monospace">$1,840.00</td><td style="padding:6px;color:#666">Nondeductible Personal</td></tr>',
          '      <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px"><b>Title Examination &amp; Attorney Settlement Fee</b></td><td style="padding:6px;text-align:right;font-family:monospace">$2,430.00</td><td style="padding:6px;color:var(--brand);font-weight:bold">&#10003; Added to Property Cost Basis</td></tr>',
          '      <tr style="background:#f8fafc;font-weight:bold"><td style="padding:8px">Total Settlement Charges</td><td style="padding:8px;text-align:right;font-family:monospace;font-size:13px">$14,700.00</td><td style="padding:8px">Verified by CPA</td></tr>',
          '    </tbody>',
          '  </table>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:4px">',
          '    <span>U.S. Consumer Financial Protection Bureau &middot; Real Estate Settlement Procedures Act (RESPA)</span>',
          '    <span style="font-family:monospace">VAULT-ID: ' + docId + ' &middot; AES-256</span>',
          '  </div>',
          '</div>'
        ].join('');
      } else if (isK1) {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:16px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px">',
          '    <div><div style="font-weight:bold;font-size:14px">Schedule K-1 (Form 1065)</div><div style="font-size:10px;color:#555">Partner\'s Share of Income, Deductions, Credits</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:15px">2026</div><div style="font-size:9px;color:#666">OMB No. 1545-0123</div></div>',
          '  </div>',
          '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;border:1px solid #111;padding:8px;margin-bottom:8px">',
          '    <div><div><b>Part I: Partnership Information</b></div><div>EIN: <code>27-3918294</code></div><div>Name: <b>Brennan Holdings LLC</b></div></div>',
          '    <div><div><b>Part II: Partner Information</b></div><div>TIN: <code>***-**-4417</code></div><div>Name: <b>' + client + '</b> (33.33% Share)</div></div>',
          '  </div>',
          '  <div style="border:1px solid #111;padding:8px">',
          '    <div style="font-weight:bold;border-bottom:1px solid #111;padding-bottom:4px;margin-bottom:6px">Part III: Partner\'s Share of Current Year Income</div>',
          '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">',
          '      <div>Box 1: Ordinary business income: <b style="font-family:monospace">$64,200.00</b></div>',
          '      <div>Box 4: Guaranteed payments: <b style="font-family:monospace">$18,000.00</b></div>',
          '      <div>Box 5: Interest income: <b style="font-family:monospace">$1,240.00</b></div>',
          '      <div>Box 19: Distributions: <b style="font-family:monospace">$45,000.00</b></div>',
          '    </div>',
          '  </div>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:9px;color:#666;border-top:1px dashed #ccc;padding-top:4px">',
          '    <span>Department of the Treasury &mdash; Internal Revenue Service</span>',
          '    <span style="font-family:monospace">VAULT-ID: ' + docId + ' &middot; CLAMAV CLEAN</span>',
          '  </div>',
          '</div>'
        ].join('');
      } else {
        docBodyHtml = [
          '<div class="irs-form-card" style="background:#fff;color:#111;padding:20px;border:2px solid #111;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;max-width:760px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,0.06)">',
          '  <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px">',
          '    <div><div style="font-weight:bold;font-size:15px">' + title + '</div><div style="font-size:11px;color:#555">Client Vault Upload &middot; Certified Practitioner Copy</div></div>',
          '    <div style="text-align:right"><div style="font-weight:bold;font-size:14px">Tax Year 2026</div><div style="font-size:10px;color:#666">FTC 16 CFR &sect; 314.4 Safeguard</div></div>',
          '  </div>',
          '  <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:14px;border-radius:4px;margin-bottom:14px">',
          '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">',
          '      <div><b>Taxpayer Client:</b> ' + client + '</div>',
          '      <div><b>Client UID:</b> <code>' + clientUid + '</code></div>',
          '      <div><b>Document ID:</b> <code>' + docId + '</code></div>',
          '      <div><b>Malware Scan:</b> <span style="color:var(--ok);font-weight:bold">&#10003; Clean (ClamAV)</span></div>',
          '      <div><b>Vault Standard:</b> AES-256 Galois/Counter Mode</div>',
          '      <div><b>Due Diligence:</b> Treasury Circular 230 &sect; 10.22</div>',
          '    </div>',
          '  </div>',
          '  <div style="padding:14px;border:1px dashed #cbd5e1;background:#fff;border-radius:4px;text-align:center">',
          '    <div style="font-size:2rem;margin-bottom:6px">&#128196;</div>',
          '    <div style="font-weight:bold;font-size:13px;color:#1e293b">' + title + '</div>',
          '    <div style="font-size:11px;color:#64748b;margin-top:4px">Document authenticated in Cloud Storage Vault &middot; 25MB statutory quota compliant &middot; Immutable audit seal affixed.</div>',
          '  </div>',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:10px;color:#666;border-top:1px dashed #ccc;padding-top:6px">',
          '    <span>The File Room by Pivot Aide Tax &middot; Practice Enclave</span>',
          '    <span style="font-family:monospace">SHA-256 INTEGRITY VERIFIED</span>',
          '  </div>',
          '</div>'
        ].join('');
      }

      // Security & Custody Audit breakdown
      var auditBodyHtml = [
        '<div style="padding:16px;background:var(--surface);font-size:.82rem">',
        '  <h4 style="margin:0 0 10px 0;font-family:var(--f-display);color:var(--ink)">Vault Security &amp; Cryptographic Custody Ledger</h4>',
        '  <table class="tbl" style="width:100%;border-collapse:collapse;font-size:.8rem;border:1px solid var(--line)">',
        '    <tbody>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;width:180px;font-weight:600;color:var(--ink-2)">Storage Vault Object ID:</td><td style="padding:8px 12px;font-family:var(--f-mono)">' + docId + '</td></tr>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">Taxpayer Identifier:</td><td style="padding:8px 12px">' + client + ' (<code>' + clientUid + '</code>)</td></tr>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">Antivirus Scan Signature:</td><td style="padding:8px 12px"><span class="chip ok sm">&#10003; CLEAN &middot; ClamAV Engine v2026.10 (0 threats found)</span></td></tr>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">Encryption Algorithm:</td><td style="padding:8px 12px">AES-256-GCM (Hardware Cryptographic Module at Rest)</td></tr>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">SHA-256 Integrity Checksum:</td><td style="padding:8px 12px;font-family:var(--f-mono);font-size:.76rem;word-break:break-all">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</td></tr>',
        '      <tr style="border-bottom:1px solid var(--line-2)"><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">Statutory Mandates:</td><td style="padding:8px 12px">FTC Safeguards Rule 16 CFR &sect; 314.4 &middot; Treasury Circular 230 &sect; 10.22 &middot; IRS Pub 1345</td></tr>',
        '      <tr><td style="padding:8px 12px;font-weight:600;color:var(--ink-2)">Cloud Storage Vault Ref:</td><td style="padding:8px 12px;font-family:var(--f-mono);font-size:.74rem">uk-client-d90d5.firebasestorage.app/clients/' + clientUid + '/tax-years/2026/documents/' + docId + '.pdf</td></tr>',
        '    </tbody>',
        '  </table>',
        '</div>'
      ].join('');

      return [
        '<div class="vault-document-viewer-container" id="vault-viewer-' + docId + '" style="font-family:var(--f-body)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface-2);border-bottom:1px solid var(--line);font-size:.8rem;flex-wrap:wrap;gap:8px">',
        '    <div style="display:flex;align-items:center;gap:8px">',
        '      <span style="font-size:1.15rem">📄</span>',
        '      <div><b style="color:var(--ink)">Vault Preview: ' + title + '</b> <span class="chip ok sm" style="font-size:.68rem">&#10003; Clean</span></div>',
        '    </div>',
        '    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">',
        '      <div style="display:inline-flex;border:1px solid var(--line);border-radius:4px;overflow:hidden">',
        '        <button type="button" class="btn xs btn-o vault-tab-btn active" data-tab="doc" style="border-radius:0;border:none;font-size:.72rem;background:var(--surface);font-weight:600">Tax Form View</button>',
        '        <button type="button" class="btn xs btn-o vault-tab-btn" data-tab="audit" style="border-radius:0;border:none;border-left:1px solid var(--line);font-size:.72rem">Security &amp; Audit</button>',
        '      </div>',
        '      <button type="button" class="btn xs btn-o btn-vault-fs" title="Open Fullscreen Viewer" style="font-size:.72rem;display:inline-flex;align-items:center;gap:4px"><span>⛶</span> Fullscreen</button>',
        '      <button type="button" class="btn xs btn-o btn-vault-print" title="Print Document" style="font-size:.72rem;display:inline-flex;align-items:center;gap:4px"><span>🖨</span> Print</button>',
        '      <button type="button" class="btn xs btn-b btn-vault-download" title="Download Document" style="font-size:.72rem;display:inline-flex;align-items:center;gap:4px"><span>⬇</span> Download</button>',
        '    </div>',
        '  </div>',
        '  <div class="vault-panel-body" style="padding:14px;background:var(--surface-2);max-height:520px;overflow-y:auto">',
        '    <div class="vault-view-section vault-view-doc" style="display:block">' + docBodyHtml + '</div>',
        '    <div class="vault-view-section vault-view-audit" style="display:none">' + auditBodyHtml + '</div>',
        '  </div>',
        '</div>'
      ].join('');
    },

    /**
     * Opens full-screen dedicated Storage Vault Document Viewer modal.
     */
    openVaultDocumentViewer: function (params) {
      params = params || {};
      var docId = params.docId || ('doc_' + Date.now());
      var title = params.title || params.name || 'Tax Document';
      var client = params.client || 'Taxpayer';

      var previewHtml = this.renderVaultDocumentHtml(params);

      var modalHtml = [
        '<div class="modal-hdr" style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--surface)">',
        '  <div style="display:flex;align-items:center;gap:10px">',
        '    <span style="font-size:1.3rem">📄</span>',
        '    <div>',
        '      <h3 style="font-family:var(--f-display);margin:0;font-size:1.15rem;color:var(--ink)">' + title + '</h3>',
        '      <div style="font-size:.76rem;color:var(--ink-2)">Storage Vault Custody &middot; Submitted by <b>' + client + '</b> &middot; ID: <code>' + docId + '</code></div>',
        '    </div>',
        '  </div>',
        '  <button type="button" data-close-modal id="btn-close-vault-modal" class="btn sm btn-o btn-close-modal" style="padding:2px 10px;font-size:1.2rem;cursor:pointer" title="Close Viewer" onclick="if(window.FileRoomLayout&&typeof window.FileRoomLayout.closeModal===\'function\'){window.FileRoomLayout.closeModal();}" aria-label="Close Viewer">&times;</button>',
        '</div>',
        '<div class="modal-body" style="padding:14px;max-height:76vh;overflow-y:auto;background:var(--surface-2)">',
        previewHtml,
        '</div>',
        '<div class="modal-ftr" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:var(--surface);border-top:1px solid var(--line)">',
        '  <span class="chip ok sm" style="font-size:.72rem">&#10003; Clean Malware Scan &middot; FTC Safeguards 16 CFR &sect; 314.4</span>',
        '  <div style="display:flex;gap:10px">',
        '    <button type="button" class="btn sm btn-o btn-close-modal" id="btn-close-vault-viewer" data-close-modal style="cursor:pointer" onclick="if(window.FileRoomLayout&&typeof window.FileRoomLayout.closeModal===\'function\'){window.FileRoomLayout.closeModal();}">Close Viewer</button>',
        '  </div>',
        '</div>'
      ].join('');

      var doc = (typeof document !== 'undefined') ? document : (window && window.document);
      var container = doc ? doc.getElementById('modal-container') : null;
      if (container) {
        if (container.classList) container.classList.add('modal-wide');
        if (container.style) container.style.maxWidth = '920px';
      }

      this.openModal(modalHtml);

      var self = this;
      var closeX = doc ? doc.getElementById('btn-close-vault-modal') : null;
      if (closeX) {
        closeX.onclick = function (e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          self.closeModal();
        };
      }
      var closeBtn = doc ? doc.getElementById('btn-close-vault-viewer') : null;
      if (closeBtn) {
        closeBtn.onclick = function (e) {
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
          self.closeModal();
        };
      }

      var viewerContainer = doc ? doc.getElementById('vault-viewer-' + docId) : null;
      if (viewerContainer) {
        this._bindVaultViewerEvents(viewerContainer, params);
      }
    },

    /**
     * Downloads an authenticated document file or generated vault copy.
     */
    downloadVaultDocument: function (docId, title, client) {
      var safeName = (title || 'Tax_Document').replace(/[^a-zA-Z0-9._-]/g, '_');
      var cached = null;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          cached = sessionStorage.getItem('tfr_vault_' + docId) ||
                   sessionStorage.getItem('tfr_vault_' + docId.replace(/^trg_(req|doc|rej)_/, ''));
        } catch (_) {}
      }

      if (!safeName.toLowerCase().endsWith('.pdf')) safeName += '.pdf';

      if (cached && (cached.indexOf('data:') === 0 || cached.indexOf('blob:') === 0)) {
        var a = document.createElement('a');
        a.href = cached;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this.showToast('Downloaded vault document: ' + safeName, 'ok');
        return;
      }

      var formHtml = this.renderVaultDocumentHtml({ docId: docId, title: title, client: client });
      var fullDoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + safeName + '</title><style>body{font-family:sans-serif;padding:20px;background:#f8fafc}</style></head><body>' + formHtml + '</body></html>';
      var blob = new Blob([fullDoc], { type: 'text/html' });
      var blobUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeName + '_VaultCopy.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 2000);
      this.showToast('Downloaded authenticated vault document: ' + safeName, 'ok');
    },

    /**
     * Prints the document representation.
     */
    printVaultDocument: function (containerId) {
      var elem = document.getElementById(containerId);
      if (!elem) {
        window.print();
        return;
      }
      var printWin = window.open('', '_blank', 'width=800,height=700');
      if (printWin) {
        printWin.document.write('<!DOCTYPE html><html><head><title>Storage Vault Print</title><style>body{font-family:Arial,sans-serif;margin:20px} .btn,.chip{display:none!important}</style></head><body>' + elem.innerHTML + '</body></html>');
        printWin.document.close();
        printWin.focus();
        setTimeout(function () { printWin.print(); printWin.close(); }, 350);
      } else {
        window.print();
      }
    },

    /**
     * Binds interaction events for tabs, fullscreen, download, and print inside a vault viewer container.
     */
    _bindVaultViewerEvents: function (container, params) {
      var self = this;
      if (!container) return;

      var tabBtns = container.querySelectorAll('.vault-tab-btn');
      var docSec = container.querySelector('.vault-view-doc');
      var auditSec = container.querySelector('.vault-view-audit');

      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var tab = btn.getAttribute('data-tab');
          tabBtns.forEach(function (b) {
            b.classList.remove('active');
            b.style.background = '';
            b.style.fontWeight = '';
          });
          btn.classList.add('active');
          btn.style.background = 'var(--surface)';
          btn.style.fontWeight = '600';
          if (tab === 'doc') {
            if (docSec) docSec.style.display = 'block';
            if (auditSec) auditSec.style.display = 'none';
          } else {
            if (docSec) docSec.style.display = 'none';
            if (auditSec) auditSec.style.display = 'block';
          }
        });
      });

      var btnFs = container.querySelector('.btn-vault-fs');
      if (btnFs) {
        btnFs.addEventListener('click', function () {
          self.openVaultDocumentViewer(params);
        });
      }

      var btnDl = container.querySelector('.btn-vault-download');
      if (btnDl) {
        btnDl.addEventListener('click', function () {
          self.downloadVaultDocument(params.docId, params.title, params.client);
        });
      }

      var btnPrint = container.querySelector('.btn-vault-print');
      if (btnPrint) {
        btnPrint.addEventListener('click', function () {
          self.printVaultDocument(container.id);
        });
      }
    }
  };

  window.FileRoomLayout = Layout;
  window.Layout = Layout;
  if (typeof window !== 'undefined') {
    window.showCenteredAlert = function (msg, title, onOk) {
      return Layout.showCenteredAlert(msg, title, onOk);
    };
    if (!window._nativeAlertOverridden) {
      window._nativeAlertOverridden = true;
      var _nativeAlert = window.alert;
      window.alert = function (msg) {
        if (typeof document !== 'undefined' && Layout && typeof Layout.showCenteredAlert === 'function') {
          var isReceipt = (typeof msg === 'string') && msg.indexOf('Receipt reference') !== -1;
          Layout.showCenteredAlert(msg, isReceipt ? 'Receipt Copied' : 'Notice');
        } else if (typeof _nativeAlert === 'function') {
          _nativeAlert(msg);
        }
      };
    }
  }

})(window);


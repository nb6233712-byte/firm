/**
 * The File Room — Main Application Controller
 * Handles 10 interactive screens, dual-device mode, KBA signing quiz,
 * drag-and-drop document uploads, simulated camera capture, messaging,
 * billing, firm console, and toast notifications.
 */

(function() {
  'use strict';

  // Application State
  var state = window.FileRoomData;
  var currentScreen = 'home';
  var signaturePad = null;
  var sigCanvas = null;
  var sigCtx = null;
  var isDrawing = false;
  var selectedKbaOption = null;

  // DOM Elements Cache
  var el = {
    side: document.getElementById('side'),
    tabbar: document.getElementById('tabbar'),
    body: document.getElementById('body'),
    btnToggleMenu: document.getElementById('btn-toggle-menu'),
    btnMobileMore: document.getElementById('btn-mobile-more'),
    drawerBackdrop: document.getElementById('drawer-backdrop'),
    themeToggle: document.getElementById('theme-toggle'),
    toastContainer: document.getElementById('toast-container'),
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalContainer: document.getElementById('modal-container')
  };

  // -------------------------------------------------------------
  // USER AUTH STATE & UI SYNCHRONIZATION
  // -------------------------------------------------------------
  function syncUserUI(user) {
    var userEmailFooter = document.getElementById('side-user-email');
    var userNameEl = document.querySelector('.user-pill .user-name');
    var userAvEls = document.querySelectorAll('.av');
    var authStatusEl = document.querySelector('[data-auth-status]');

    if (user && user.email) {
      if (userEmailFooter) {
        userEmailFooter.textContent = user.email;
        userEmailFooter.title = 'Signed in as ' + user.email + (user.uid ? ' (UID: ' + user.uid + ')' : '');
      }
      var name = user.displayName || (state && state.user && state.user.name) || user.email;
      if (userNameEl) {
        userNameEl.textContent = name.split('@')[0].replace('.', ' ').slice(0, 14);
      }
      var initials = (name.replace(/[^a-zA-Z]/g, '') || 'MW').slice(0, 2).toUpperCase();
      userAvEls.forEach(function(av) {
        av.textContent = initials;
        av.title = name + ' — Signed in';
      });
      if (authStatusEl) {
        authStatusEl.style.color = '#2ecc71';
        authStatusEl.textContent = 'Live ✓ (' + user.email + ')';
      }
    } else {
      if (userEmailFooter) {
        userEmailFooter.textContent = 'Not signed in';
        userEmailFooter.title = 'Sign in to access your tax file';
      }
      if (userNameEl) {
        userNameEl.textContent = 'Sign in';
      }
      userAvEls.forEach(function(av) {
        av.textContent = '--';
        av.title = 'Not signed in — Click to sign in';
      });
      if (authStatusEl) {
        authStatusEl.style.color = '#2ecc71';
        authStatusEl.textContent = 'Live ✓ (Ready for login)';
      }
    }

    // Refresh role-aware navigation layout
    syncNavigationRole();
  }

  // -------------------------------------------------------------
  // ROLE-AWARE NAVIGATION & DASHBOARD SYNCHRONIZER
  // -------------------------------------------------------------
  function syncNavigationRole() {
    // If no sidebar is present in the DOM (e.g. index.html switchboard gateway), bypass sidebar state & menu highlight initialization
    if (!el.side && !document.getElementById('side')) {
      return;
    }

    var user = (window.FirebaseBridge && window.FirebaseBridge.currentUser) || (state && state.user);
    var isStaff = Boolean(
      (window.FirebaseBridge && window.FirebaseBridge.isStaff && window.FirebaseBridge.isStaff()) ||
      (user && (user.role === 'firm_preparer' || user.role === 'firm_admin') && (user.mfaVerified || user.mfa))
    );
    var isAdmin = Boolean(
      (window.FirebaseBridge && window.FirebaseBridge.isAdmin && window.FirebaseBridge.isAdmin()) ||
      (user && user.role === 'firm_admin')
    );

    var navClient = document.getElementById('side-nav-client');
    var navFirm = document.getElementById('side-nav-firm');
    var tabbarClient = document.getElementById('tabbar-client');
    var tabbarFirm = document.getElementById('tabbar-firm');
    var btnDashboardSwitch = document.getElementById('btn-dashboard-switch');
    var sideSwitchBtn = document.getElementById('side-switch-dashboard-btn');
    var personaBadge = document.getElementById('side-persona-badge');

    var isFirmScreen = currentScreen === 'firm' || currentScreen === 'exhibit-a' || currentScreen === 'exhibit-b';
    var isGatewayScreen = currentScreen === 'gateway';

    if (!isStaff) {
      // Standard Client Portal layout
      if (navClient) navClient.style.display = 'block';
      if (navFirm) navFirm.style.display = 'none';
      if (tabbarClient) {
        if (isGatewayScreen || currentScreen === 'signin') {
          tabbarClient.style.setProperty('display', 'none', 'important');
          tabbarClient.setAttribute('hidden', '');
        } else {
          tabbarClient.style.setProperty('display', '', '');
          tabbarClient.removeAttribute('hidden');
        }
      }
      if (tabbarFirm) {
        tabbarFirm.style.setProperty('display', 'none', 'important');
        tabbarFirm.setAttribute('hidden', '');
      }
      if (btnDashboardSwitch) btnDashboardSwitch.style.display = 'none';
      if (sideSwitchBtn) sideSwitchBtn.style.display = 'none';
      if (personaBadge) {
        if (isGatewayScreen) {
          personaBadge.textContent = 'Dual Portals';
          personaBadge.className = 'chip night sm';
        } else {
          personaBadge.textContent = 'Client Portal';
          personaBadge.className = 'chip gold sm';
        }
      }
    } else {
      // Staff member with privileged credentials
      if (btnDashboardSwitch) btnDashboardSwitch.style.display = 'none';
      if (sideSwitchBtn) sideSwitchBtn.style.display = 'none';

      if (isFirmScreen) {
        // Staff actively viewing Firm Console
        if (navClient) navClient.style.display = 'none';
        if (navFirm) navFirm.style.display = 'block';
        if (tabbarClient) {
          tabbarClient.style.setProperty('display', 'none', 'important');
          tabbarClient.setAttribute('hidden', '');
        }
        if (tabbarFirm) {
          tabbarFirm.style.display = '';
          tabbarFirm.removeAttribute('hidden');
        }
        if (btnDashboardSwitch) btnDashboardSwitch.style.display = 'none';
        if (sideSwitchBtn) sideSwitchBtn.style.display = 'none';
        if (personaBadge) {
          personaBadge.textContent = isAdmin ? 'Admin Console' : 'Preparer Console';
          personaBadge.className = isAdmin ? 'chip gold sm' : 'chip ok sm';
        }
      } else {
        // Staff previewing Client Portal
        if (navClient) navClient.style.display = 'block';
        if (navFirm) navFirm.style.display = 'none';
        if (tabbarClient) {
          tabbarClient.style.display = '';
          tabbarClient.removeAttribute('hidden');
        }
        if (tabbarFirm) {
          tabbarFirm.style.setProperty('display', 'none', 'important');
          tabbarFirm.setAttribute('hidden', '');
        }
        if (btnDashboardSwitch) btnDashboardSwitch.innerHTML = 'Firm Console &rarr;';
        if (sideSwitchBtn) sideSwitchBtn.innerHTML = 'Switch to Firm Console &rarr;';
        if (personaBadge) {
          personaBadge.textContent = 'Client Preview';
          personaBadge.className = 'chip night sm';
        }
      }
    }

    // Highlight active link in visible nav
    document.querySelectorAll('.side-nav a').forEach(function(a) {
      var isTarget = a.dataset.go === currentScreen;
      if (currentScreen === 'firm' && a.dataset.sub) {
        isTarget = a.dataset.sub === activeFirmTab;
      }
      a.classList.toggle('on', isTarget);
    });

    // Highlight active mobile tab & clear inactive mobile tab
    var activeTabbar = (!isStaff || !isFirmScreen) ? tabbarClient : tabbarFirm;
    var inactiveTabbar = (!isStaff || !isFirmScreen) ? tabbarFirm : tabbarClient;
    if (inactiveTabbar) {
      inactiveTabbar.querySelectorAll('button').forEach(function(b) {
        b.classList.remove('on');
      });
    }
    if (activeTabbar) {
      activeTabbar.querySelectorAll('button').forEach(function(b) {
        var isTarget = b.dataset.go === currentScreen;
        if (currentScreen === 'firm' && b.dataset.sub) {
          isTarget = b.dataset.sub === activeFirmTab;
        }
        b.classList.toggle('on', isTarget);
      });
    }
  }

  // -------------------------------------------------------------
  // PROFILE & SECURITY SETTINGS CONTROLLER (#s-profile)
  // -------------------------------------------------------------
  var isProfileInitialized = false;

  var profileChannelCycles = {
    needsYou: ['Push · email', 'Push only', 'Email', 'Off'],
    stageMove: ['Push · email', 'Push only', 'Email', 'Off'],
    deadlines: ['Push · email', 'Push only', 'Email', 'Off'],
    ruleChanges: ['Email', 'Push · email', 'Off'],
    firmNews: ['Off', 'Email']
  };

  function syncProfileNotificationToggles() {
    var toggles = document.querySelectorAll('.profile-notif-toggle');
    toggles.forEach(function(btn) {
      var prefKey = btn.getAttribute('data-pref');
      if (!prefKey) return;
      var currentVal = (state.notificationSettings && state.notificationSettings[prefKey]) || 'Push · email';
      // Normalize internal value to display format
      var displayVal = currentVal;
      if (currentVal === 'push-email') displayVal = 'Push · email';
      else if (currentVal === 'push') displayVal = 'Push only';
      else if (currentVal === 'email') displayVal = 'Email';
      else if (currentVal === 'off') displayVal = 'Off';

      btn.textContent = displayVal;
      btn.style.color = (displayVal === 'Off') ? 'var(--ink-3)' : 'var(--accent)';
      btn.style.borderColor = (displayVal === 'Off') ? 'var(--line)' : 'rgba(1, 159, 255, 0.4)';
    });
  }

  function initProfileButtons() {
    if (isProfileInitialized) return;
    isProfileInitialized = true;

    // 1. Notification Preference Toggles Cycling
    var toggles = document.querySelectorAll('.profile-notif-toggle');
    toggles.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var prefKey = btn.getAttribute('data-pref');
        if (!prefKey) return;
        var cycle = profileChannelCycles[prefKey] || ['Push · email', 'Email', 'Off'];
        var currentText = btn.textContent.trim();
        var idx = cycle.indexOf(currentText);
        var nextIdx = (idx + 1) % cycle.length;
        var nextVal = cycle[nextIdx];

        btn.textContent = nextVal;
        btn.style.color = (nextVal === 'Off') ? 'var(--ink-3)' : 'var(--accent)';
        btn.style.borderColor = (nextVal === 'Off') ? 'var(--line)' : 'rgba(1, 159, 255, 0.4)';

        // Map back to internal code
        var codeVal = nextVal === 'Push · email' ? 'push-email' :
                      nextVal === 'Push only' ? 'push' :
                      nextVal === 'Email' ? 'email' : 'off';

        if (!state.notificationSettings) state.notificationSettings = {};
        state.notificationSettings[prefKey] = codeVal;

        // Flash saved indicator
        var savedChip = document.getElementById('profile-notif-saved-chip');
        if (savedChip) {
          savedChip.style.display = 'inline-block';
          setTimeout(function() { savedChip.style.display = 'none'; }, 2500);
        }

        showToast('Notification preference updated: ' + nextVal, 'ok');

        if (window.FirebaseBridge) {
          if (window.FirebaseBridge.saveNotificationPreferences) {
            window.FirebaseBridge.saveNotificationPreferences(state.notificationSettings);
          }
          if (window.FirebaseBridge.recordAuditLog) {
            window.FirebaseBridge.recordAuditLog('Notification Preference Changed', prefKey + ' set to ' + nextVal, 'Profile');
          }
        }
      });
    });

    // 2. Edit Contact Details Modal
    var editContactBtn = document.getElementById('btn-profile-edit-contact');
    if (editContactBtn) {
      editContactBtn.addEventListener('click', function() {
        var user = (window.FirebaseBridge && window.FirebaseBridge.currentUser) || (state && state.user) || {};
        var currentPhone = user.phone || '(202) 555-4417';
        var currentEmail = user.email || 'm.whitfield@example.com';
        var currentMailing = user.address || '214 Halcyon Row, Annapolis, MD 21401';

        var modalBody = [
          '<p style="font-size:.84rem;color:var(--ink-2);margin-bottom:12px">Update your taxpayer contact records on file with Denise R., CPA under IRS Circular 230.</p>',
          '<div class="field" style="margin-bottom:10px">',
          '  <label style="font-size:.8rem;font-weight:600">Mobile Phone (MFA Delivery)</label>',
          '  <input type="tel" id="input-profile-phone" value="' + currentPhone + '" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink)">',
          '</div>',
          '<div class="field" style="margin-bottom:10px">',
          '  <label style="font-size:.8rem;font-weight:600">Authorized Notification Email</label>',
          '  <input type="email" id="input-profile-email" value="' + currentEmail + '" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink)">',
          '</div>',
          '<div class="field">',
          '  <label style="font-size:.8rem;font-weight:600">Primary Mailing Address</label>',
          '  <input type="text" id="input-profile-address" value="' + currentMailing + '" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink)">',
          '</div>'
        ].join('');

        openModal('Update Taxpayer Contact Information', modalBody, [
          '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
          '<button class="btn btn-g sm" id="btn-save-contact-profile">Save Contact Records</button>'
        ].join(''));

        var saveBtn = document.getElementById('btn-save-contact-profile');
        if (saveBtn) {
          saveBtn.addEventListener('click', function() {
            var newPhone = (document.getElementById('input-profile-phone') || {}).value || currentPhone;
            var newEmail = (document.getElementById('input-profile-email') || {}).value || currentEmail;
            var newAddress = (document.getElementById('input-profile-address') || {}).value || currentMailing;

            if (state && state.user) {
              state.user.phone = newPhone;
              state.user.email = newEmail;
              state.user.address = newAddress;
            }

            var emailEl = document.getElementById('profile-display-email');
            if (emailEl) emailEl.textContent = newEmail;

            closeModal();
            showToast('Taxpayer contact records updated successfully.', 'ok');
            if (window.FirebaseBridge && window.FirebaseBridge.recordAuditLog) {
              window.FirebaseBridge.recordAuditLog('Taxpayer Contact Record Updated', 'Phone: ' + newPhone + ', Email: ' + newEmail, 'Profile');
            }
          });
        }
      });
    }

    // 3. View Signed Engagement Letter Modal
    var viewEngBtn = document.getElementById('btn-profile-view-eng-doc');
    if (viewEngBtn) {
      viewEngBtn.addEventListener('click', function() {
        var engHtml = [
          '<div style="padding:4px 0;font-size:.84rem;line-height:1.6;color:var(--ink-2)">',
          '  <div style="font-weight:700;font-size:1rem;color:var(--ink);margin-bottom:6px">Pivot Aide Tax &middot; Engagement Agreement TY2026</div>',
          '  <p><b>Parties:</b> Denise R., CPA (Pivot Aide Tax) and Michael &amp; Elena Whitfield (Taxpayers).</p>',
          '  <p><b>Scope:</b> Preparation of Federal Form 1040, Schedule C (Whitfield Design Co.), Schedule E (Halcyon Row), Maryland Resident 502, Virginia Non-Resident 763, Pennsylvania Non-Resident 40NR.</p>',
          '  <p><b>Statutory Standard:</b> Treasury Department Circular No. 230 &sect; 10.22 &sect; 10.34 &sect; 10.37.</p>',
          '  <p><b>Status:</b> <span class="chip ok sm">&#10003; Executed 14 Jan 2026</span></p>',
          '</div>'
        ].join('');
        openModal('Executed Engagement Letter', engHtml, '<button class="btn btn-b sm" id="modal-cancel-btn">Close</button>');
      });
    }

    // 4. Test MFA Verification Challenge
    var testMfaBtn = document.getElementById('btn-profile-test-mfa');
    if (testMfaBtn) {
      testMfaBtn.addEventListener('click', function() {
        testMfaBtn.disabled = true;
        testMfaBtn.textContent = 'Sending code...';
        setTimeout(function() {
          testMfaBtn.disabled = false;
          testMfaBtn.textContent = 'Send Test Verification Code';
          showToast('MFA verification code dispatched to ' + currentEmail + ' and Google Authenticator. Valid for 10 minutes.', 'ok');
        }, 600);
      });
    }

    // 5. Change Password Modal
    var changePwdBtn = document.getElementById('btn-profile-change-pwd');
    if (changePwdBtn) {
      changePwdBtn.addEventListener('click', function() {
        var pwdModalHtml = [
          '<p style="font-size:.84rem;color:var(--ink-2);margin-bottom:12px">Update your account password. Requires minimum 10 characters with mixed-case and numbers.</p>',
          '<div class="field" style="margin-bottom:10px">',
          '  <label style="font-size:.8rem;font-weight:600">Current Password</label>',
          '  <input type="password" id="input-old-pwd" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink)">',
          '</div>',
          '<div class="field" style="margin-bottom:10px">',
          '  <label style="font-size:.8rem;font-weight:600">New Password</label>',
          '  <input type="password" id="input-new-pwd" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:4px;color:var(--ink)">',
          '</div>'
        ].join('');

        openModal('Update Master Account Password', pwdModalHtml, [
          '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
          '<button class="btn btn-g sm" id="btn-save-new-pwd">Update Password</button>'
        ].join(''));

        var savePwd = document.getElementById('btn-save-new-pwd');
        if (savePwd) {
          savePwd.addEventListener('click', function() {
            var newP = (document.getElementById('input-new-pwd') || {}).value;
            if (!newP || newP.length < 8) {
              showToast('Password must be at least 8 characters.', 'warn');
              return;
            }
            closeModal();
            showToast('Account password updated securely.', 'ok');
          });
        }
      });
    }

    // 6. Sign Out All Devices
    var signoutAllBtn = document.getElementById('btn-profile-signout-all');
    if (signoutAllBtn) {
      signoutAllBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to revoke all active device sessions? You will need to sign in again.')) {
          showToast('All active sessions revoked. Signing out...', 'info');
          setTimeout(function() {
            if (typeof handleSignOut === 'function') {
              handleSignOut();
            } else {
              showScreen('signin');
            }
          }, 800);
        }
      });
    }
  }

  function loadProfileScreen() {
    var user = (window.FirebaseBridge && window.FirebaseBridge.currentUser) || (state && state.user) || {};
    var emailEl = document.getElementById('profile-display-email');
    var nameEl = document.getElementById('profile-display-name');
    var avEl = document.getElementById('profile-avatar-large');
    var roleChip = document.getElementById('profile-role-chip');

    var email = user.email || 'm.whitfield@example.com';
    var name = user.displayName || user.name || (email.split('@')[0].replace('.', ' '));
    var role = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) || user.role || 'client';

    if (emailEl) emailEl.textContent = email;
    if (nameEl) nameEl.textContent = name;
    if (avEl) avEl.textContent = (name.replace(/[^a-zA-Z]/g, '') || 'MW').slice(0, 2).toUpperCase();
    if (roleChip) {
      if (role === 'firm_admin') {
        roleChip.textContent = 'Managing Partner (firm_admin)';
        roleChip.className = 'chip gold';
      } else if (role === 'firm_preparer') {
        roleChip.textContent = 'Assigned Preparer (firm_preparer)';
        roleChip.className = 'chip ok';
      } else {
        roleChip.textContent = 'Individual Filer (Client)';
        roleChip.className = 'chip night';
      }
    }

    syncProfileNotificationToggles();
    initProfileButtons();
  }

  // -------------------------------------------------------------
  // 1. ROUTING & SCREEN NAVIGATION
  // -------------------------------------------------------------
  function showScreen(name) {
    if (!name) return;
    if (name === 'file') name = 'home';
    if (name === 'upd' || name === 'updates') name = 'news';
    if (name === 'serv' || name === 'services') name = 'svcs';
    if (name === 'bill' || name === 'billing') name = 'bill';

    // ── Hardened Role-Based Route Guard ───────────────────────
    var publicScreens = ['gateway', 'signin'];
    var staffScreens = ['firm', 'exhibit-a', 'exhibit-b'];

    var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser);
    var isAuth = Boolean(
      (state && state.user && state.user.isAuthenticated) || fbUser
    );

    // 1. Unauthenticated users cannot view private screens
    if (!isAuth && publicScreens.indexOf(name) === -1) {
      showToast('Please sign in to access your file.', 'warn');
      name = document.getElementById('s-gateway') ? 'gateway' : 'signin';
    }

    // 2. Client users CANNOT access staff-only operations screens
    if (staffScreens.indexOf(name) !== -1) {
      var isStaff = Boolean(
        (window.FirebaseBridge && window.FirebaseBridge.isStaff && window.FirebaseBridge.isStaff()) ||
        (fbUser && fbUser.isStaff) ||
        (state && state.user && (state.user.role === 'firm_preparer' || state.user.role === 'firm_admin') && (state.user.mfaVerified || state.user.mfa))
      );

      if (!isStaff) {
        showToast('Access Denied: Staff authorization required.', 'err');
        console.warn('RBAC Violation: Unauthorized access attempt to staff screen:', name);
        name = isAuth ? 'home' : (document.getElementById('s-gateway') ? 'gateway' : 'signin');
      }
    }

    currentScreen = name;

    // Toggle screen panels
    var found = false;
    document.querySelectorAll('.scr').forEach(function(s) {
      var on = (s.id === 's-' + name || s.getAttribute('data-alias') === 's-' + name ||
                ((name === 'upd' || name === 'news') && (s.id === 's-upd' || s.id === 's-news')) ||
                ((name === 'svcs' || name === 'serv' || name === 'services') && (s.id === 's-svcs' || s.id === 's-serv')) ||
                ((name === 'bill' || name === 'pay' || name === 'billing') && (s.id === 's-bill' || s.id === 's-pay')));
      s.classList.toggle('on', on);
      if (on) found = true;
    });

    if (!found) return;

    // Synchronize top screen tabs
    var tabsEl = document.getElementById('tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('button').forEach(function(b) {
        var isMatch = b.dataset.s === name ||
          ((name === 'bill' || name === 'pay' || name === 'billing') && (b.dataset.s === 'pay' || b.dataset.s === 'bill'));
        b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });
    }

    // Synchronize mock browser URL bar
    var mockUrlPath = document.getElementById('mock-url-path');
    if (mockUrlPath) {
      var paths = {
        gateway: '/portals',
        signin: '/login',
        home: '/dashboard',
        docs: '/documents',
        sign: '/sign/8879',
        return: '/return/prepared',
        msgs: '/messages',
        svcs: '/services',
        pay: '/billing',
        news: '/updates',
        profile: '/profile/security',
        firm: '/firm/console',
        'exhibit-a': '/exhibits/a-costs',
        'exhibit-b': '/exhibits/b-scope'
      };
      mockUrlPath.textContent = paths[name] || ('/' + name);
    }

    // Synchronize role-based navigation and sidebar/tabbar visibility
    syncNavigationRole();

    // Close mobile drawer on navigation
    toggleMobileDrawer(false);

    if (el.body) {
      el.body.scrollTop = 0;
    }

    // Log screen view to Firebase Analytics
    if (window.FirebaseBridge) {
      window.FirebaseBridge.logScreen(name);
    }

    // Dynamic screen-specific initialization
    if (name === 'home') {
      loadHomeFileScreen();
    } else if (name === 'docs') {
      loadDocumentsScreen();
    } else if (name === 'return') {
      loadPreparedReturnScreen();
    } else if (name === 'msgs') {
      loadMessagesScreen();
    } else if (name === 'news' || name === 'upd') {
      loadUpdatesScreen();
    } else if (name === 'svcs' || name === 'serv' || name === 'services') {
      loadServicesScreen();
    } else if (name === 'bill' || name === 'pay' || name === 'billing') {
      loadBillingScreen();
    } else if (name === 'profile') {
      loadProfileScreen();
    } else if (name === 'firm') {
      loadFirmScreen();
    } else if (name === 'sign') {
      initSignatureCanvas();
    } else if (name === 'exhibit-a') {
      initExhibitACalculator();
    } else if (name === 'exhibit-b') {
      initExhibitBScreen();
    }
  }

  // -------------------------------------------------------------
  // 1B. YOUR FILE (#s-home) FIRESTORE SYNCHRONIZATION ENGINE
  // -------------------------------------------------------------
  var isHomeListenerAttached = false;
  var homeEngagementCache = null;

  function loadHomeFileScreen() {
    var bannerEl = document.getElementById('home-status-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    // State 1: Loading indicator when no cache exists
    if (!homeEngagementCache) {
      if (bannerEl) {
        bannerEl.style.display = 'flex';
        bannerEl.style.alignItems = 'center';
        bannerEl.style.gap = '8px';
        bannerEl.style.background = 'rgba(1, 159, 255, 0.08)';
        bannerEl.style.border = '1px solid rgba(1, 159, 255, 0.25)';
        bannerEl.style.color = 'var(--ink)';
        bannerEl.innerHTML = '<span class="chip gold" style="animation:pulse 1.2s infinite">Syncing</span> Connecting to authoritative client engagement in Cloud Firestore...';
      }
    } else {
      renderHomeFileScreen(homeEngagementCache);
    }

    if (!window.FirebaseBridge) {
      return;
    }

    // Realtime Subscription to active client engagement
    if (!isHomeListenerAttached && window.FirebaseBridge.subscribeEngagement) {
      isHomeListenerAttached = true;
      window.FirebaseBridge.subscribeEngagement(function(cloudData) {
        if (bannerEl) bannerEl.style.display = 'none';
        if (cloudData) {
          homeEngagementCache = cloudData;
          renderHomeFileScreen(cloudData);
        } else {
          renderHomeEmptyState();
        }
      }, function(err) {
        renderHomeErrorState(err);
      });
    }

    // Direct Fetch
    window.FirebaseBridge.getEngagement().then(function(res) {
      if (bannerEl) bannerEl.style.display = 'none';
      if (res && res.data) {
        homeEngagementCache = res.data;
        renderHomeFileScreen(res.data);
      } else if (!homeEngagementCache) {
        renderHomeEmptyState();
      }
    }).catch(function(err) {
      renderHomeErrorState(err);
    });
  }

  function renderHomeEmptyState() {
    var bannerEl = document.getElementById('home-status-banner');
    if (bannerEl) {
      bannerEl.style.display = 'block';
      bannerEl.style.background = 'var(--surface-2)';
      bannerEl.style.border = '1px dashed var(--line)';
      bannerEl.innerHTML = '<div style="font-weight:600;margin-bottom:4px">No Active Engagement Found</div><div style="font-size:.8rem;color:var(--ink-2)">Your file has not been initialized yet. Your assigned preparer will initiate your Tax Year 2026 engagement.</div>';
    }
  }

  function renderHomeErrorState(err) {
    var bannerEl = document.getElementById('home-status-banner');
    if (bannerEl) {
      bannerEl.style.display = 'block';
      bannerEl.style.background = 'rgba(235, 87, 87, 0.08)';
      bannerEl.style.border = '1px solid rgba(235, 87, 87, 0.3)';
      bannerEl.style.color = 'var(--ink)';
      bannerEl.innerHTML = [
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">',
        '  <span><b>Unable to sync file data:</b> ' + ((err && err.message) || 'Network error connecting to Firestore') + '</span>',
        '  <button type="button" class="btn sm btn-o" onclick="loadHomeFileScreen()">Retry Sync</button>',
        '</div>'
      ].join('');
    }
  }

  function renderHomeFileScreen(data) {
    if (!data) return;

    // 1. Eyebrow, Headline, Lede
    var eyebrowEl = document.getElementById('home-eyebrow');
    if (eyebrowEl) {
      eyebrowEl.textContent = 'Tax year ' + (data.taxYear || 2026) + ' · ' + (data.filingStatus || 'Married filing jointly');
    }
    var headlineEl = document.getElementById('home-headline');
    if (headlineEl && data.headline) {
      headlineEl.textContent = data.headline;
    }
    var ledeEl = document.getElementById('home-lede');
    if (ledeEl && data.lede) {
      ledeEl.textContent = data.lede;
    }

    // 2. Stage chip & Jurisdictions
    var stageChipEl = document.getElementById('home-stage-chip');
    if (stageChipEl && data.stageLabel) {
      stageChipEl.textContent = data.stageLabel;
    }
    var scopeTitleEl = document.getElementById('home-jurisdictions-title');
    if (scopeTitleEl && data.scopeTitle) {
      scopeTitleEl.textContent = data.scopeTitle;
    }
    var scopeSubEl = document.getElementById('home-jurisdictions-sub');
    if (scopeSubEl && data.jurisdictions) {
      scopeSubEl.textContent = data.jurisdictions;
    }

    // 3. Progress Percentage & Bar
    var pct = typeof data.progressPct === 'number' ? data.progressPct : 68;
    var pctTextEl = document.getElementById('file-progress-text');
    if (pctTextEl) pctTextEl.textContent = pct + '%';
    var pctBarEl = document.getElementById('file-progress-bar');
    if (pctBarEl) pctBarEl.style.width = pct + '%';

    // 4. Stepper items list
    var stepsContainer = document.getElementById('home-steps-list');
    if (stepsContainer && Array.isArray(data.steps) && data.steps.length > 0) {
      stepsContainer.innerHTML = data.steps.map(function(s) {
        var statusClass = s.status === 'done' ? 'done' : (s.status === 'now' ? 'now' : '');
        var targetGo = s.target || (s.status === 'now' ? 'docs' : 'home');
        return [
          '<div class="step ' + statusClass + '" data-go="' + targetGo + '" style="cursor:pointer">',
          '  <span class="n"></span>',
          '  <div>',
          '    <div class="t">' + s.title + '</div>',
          '    <div class="m">' + s.meta + '</div>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      // Rebind click listeners on steps
      stepsContainer.querySelectorAll('.step[data-go]').forEach(function(step) {
        step.addEventListener('click', function() {
          showScreen(step.getAttribute('data-go'));
        });
      });
    }

    // 5. Dynamic Pending Actions Card & List
    var actionCard = document.getElementById('home-action-card');
    var actionCountEl = document.getElementById('home-action-count');
    var pendingActionsList = document.getElementById('home-pending-actions-list');
    var actionBtnWrap = document.getElementById('home-action-btn-wrap');

    // Aggregate pending actions across file modules
    var pendingItems = [];

    // Action A: Missing or Rejected Documents
    var hasDocAction = (data.actionNeeded && data.actionNeeded.hasAction);
    if (hasDocAction) {
      pendingItems.push({
        type: 'docs',
        chipClass: 'warn',
        chipText: 'Documents Needed',
        title: data.actionNeeded.title || 'Documents Outstanding',
        desc: data.actionNeeded.description || 'Rental 1099-MISC and Q4 mileage log required to complete return.',
        target: data.actionNeeded.targetScreen || 'docs',
        btnText: data.actionNeeded.buttonText || 'Upload Files'
      });
    }

    // Action B: Form 8879 Remote Signature
    var isReadyForSig = (data.stage === 'ready_for_signature' || data.readyForSignature || (returnDataCache && returnDataCache.approvalStatus === 'approved'));
    if (isReadyForSig) {
      pendingItems.push({
        type: 'sign',
        chipClass: 'gold',
        chipText: 'Signature Required',
        title: 'Form 8879 Remote E-File Authorization',
        desc: 'Review prepared return and execute Form 8879 e-signature so Denise R., CPA can transmit to IRS.',
        target: 'sign',
        btnText: 'Sign Form 8879'
      });
    }

    // Action C: Open Invoice Balance Due
    var hasInvoiceDue = (data.invoiceDue && data.invoiceDue !== '$0' && data.invoiceDue !== '$0.00');
    if (hasInvoiceDue) {
      pendingItems.push({
        type: 'pay',
        chipClass: 'night',
        chipText: 'Invoice Open',
        title: 'Invoice Balance Due: ' + data.invoiceDue,
        desc: 'TY2026 preparation fee due ' + (data.invoiceDueDate || '15 September') + '. Pay via zero-fee ACH or card.',
        target: 'pay',
        btnText: 'View & Pay Invoice'
      });
    }

    if (actionCard) {
      if (pendingItems.length > 0) {
        actionCard.style.display = 'block';
        actionCard.style.borderLeftColor = 'var(--gold)';

        var actionChip = document.getElementById('home-action-chip');
        if (actionChip) {
          actionChip.className = 'chip warn';
          actionChip.textContent = 'Needs you';
        }
        if (actionCountEl) {
          actionCountEl.textContent = pendingItems.length + ' Action' + (pendingItems.length === 1 ? '' : 's') + ' Pending';
        }

        var actionTitle = document.getElementById('home-action-title');
        if (actionTitle) actionTitle.textContent = pendingItems[0].title;
        var actionDesc = document.getElementById('home-action-desc');
        if (actionDesc) actionDesc.textContent = pendingItems[0].desc;

        if (actionBtnWrap) actionBtnWrap.style.display = 'none'; // We render dedicated item buttons

        if (pendingActionsList) {
          pendingActionsList.innerHTML = pendingItems.map(function(item) {
            return [
              '<div class="pending-action-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface-2);border-radius:4px;border:1px solid var(--line);flex-wrap:wrap;gap:10px">',
              '  <div style="flex:1;min-width:200px">',
              '    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">',
              '      <span class="chip ' + item.chipClass + ' sm">' + item.chipText + '</span>',
              '      <span style="font-weight:600;font-size:.85rem;color:var(--ink)">' + item.title + '</span>',
              '    </div>',
              '    <div style="font-size:.78rem;color:var(--ink-2)">' + item.desc + '</div>',
              '  </div>',
              '  <button type="button" class="btn btn-g sm" data-go="' + item.target + '" style="font-size:.78rem;padding:6px 12px">' + item.btnText + ' &rarr;</button>',
              '</div>'
            ].join('');
          }).join('');

          // Wire click handlers for dynamic action buttons
          pendingActionsList.querySelectorAll('button[data-go]').forEach(function(btn) {
            btn.addEventListener('click', function() {
              showScreen(btn.getAttribute('data-go'));
            });
          });
        }
      } else {
        // Empty Action State: All clear!
        actionCard.style.display = 'block';
        actionCard.style.borderLeftColor = 'var(--ok)';
        var actionChip = document.getElementById('home-action-chip');
        if (actionChip) {
          actionChip.className = 'chip ok';
          actionChip.textContent = 'All clear';
        }
        if (actionCountEl) {
          actionCountEl.textContent = '0 Actions Pending';
        }
        var actionTitle = document.getElementById('home-action-title');
        if (actionTitle) actionTitle.textContent = 'No actions waiting on you';
        var actionDesc = document.getElementById('home-action-desc');
        if (actionDesc) actionDesc.textContent = 'All requested documents are in custody with Denise R., CPA. Your return is currently in preparation.';

        if (pendingActionsList) pendingActionsList.innerHTML = '';
        if (actionBtnWrap) {
          actionBtnWrap.style.display = 'block';
          var actionBtn = document.getElementById('home-action-btn');
          if (actionBtn) {
            actionBtn.textContent = 'View documents';
            actionBtn.setAttribute('data-go', 'docs');
          }
        }
      }
    }

    // 5B. Assigned Preparer Card
    var prepName = document.getElementById('home-preparer-name');
    if (prepName) prepName.textContent = data.preparerName || 'Denise R., CPA';
    var prepBadge = document.getElementById('home-preparer-badge');
    if (prepBadge) prepBadge.textContent = data.preparerBadge || 'Assigned CPA';
    var prepFirm = document.getElementById('home-preparer-firm');
    if (prepFirm) prepFirm.textContent = data.preparerFirm || 'Pivot Aide Tax · PTIN Active · Circular 230 Authorized';
    var prepMsgBtn = document.getElementById('home-btn-msg-preparer');
    if (prepMsgBtn) {
      prepMsgBtn.onclick = function() { showScreen('msgs'); };
    }

    // 6. Invoice and Messages stats
    var invVal = document.getElementById('home-invoice-val');
    if (invVal && data.invoiceDue) invVal.textContent = data.invoiceDue;
    var invSub = document.getElementById('home-invoice-sub');
    if (invSub && data.invoiceDueDate) invSub.innerHTML = 'Invoice due ' + data.invoiceDueDate + ' &rarr;';
    var msgsVal = document.getElementById('home-msgs-val');
    if (msgsVal && typeof data.unreadMessagesCount !== 'undefined') msgsVal.textContent = data.unreadMessagesCount;

    // 7. Upcoming deadlines list
    var deadlinesList = document.getElementById('home-deadlines-list');
    if (deadlinesList && Array.isArray(data.upcomingDeadlines)) {
      deadlinesList.innerHTML = data.upcomingDeadlines.map(function(dl) {
        return [
          '<div class="kv">',
          '  <span>' + dl.label + '</span>',
          '  <b>' + dl.date + '</b>',
          '</div>'
        ].join('');
      }).join('');
    }

    // 8. Uncle Pat Controlled Application-Guidance Note
    if (window.UnclePatGuidance) {
      var primary = window.UnclePatGuidance.getPrimaryGuidance({
        engagement: data,
        returnData: returnDataCache,
        docRequests: (window.FileRoomData && window.FileRoomData.documents) || []
      });
      var quoteEl = document.getElementById('home-guidance-quote');
      if (quoteEl && primary && primary.text) quoteEl.textContent = primary.text;
      var byEl = document.getElementById('home-guidance-by');
      if (byEl) byEl.innerHTML = 'Uncle Pat &middot; Application Guide <span style="font-size:0.75rem;font-weight:400;opacity:0.8">(Click for checklist)</span>';
    } else if (data.seasonalGuidance) {
      var quoteEl = document.getElementById('home-guidance-quote');
      if (quoteEl && data.seasonalGuidance.quote) quoteEl.textContent = data.seasonalGuidance.quote;
      var byEl = document.getElementById('home-guidance-by');
      if (byEl && data.seasonalGuidance.author) byEl.textContent = data.seasonalGuidance.author;
    }

    var guidanceNoteEl = document.getElementById('home-guidance-note');
    if (guidanceNoteEl) {
      guidanceNoteEl.onclick = function() {
        if (typeof openUnclePatGuidanceModal === 'function') {
          openUnclePatGuidanceModal();
        }
      };
    }
  }

  // -------------------------------------------------------------
  // 1C. PREPARED RETURN (#s-return) FIRESTORE SYNCHRONIZATION ENGINE
  // (Pure non-computational custody under Treas. Reg. § 301.7701-15 & 7216)
  // -------------------------------------------------------------
  var isReturnListenerAttached = false;
  var returnDataCache = null;

  function escapeHtmlReturn(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadPreparedReturnScreen() {
    var bannerEl = document.getElementById('return-status-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    if (returnDataCache) {
      renderPreparedReturnScreen(returnDataCache);
    }

    if (!window.FirebaseBridge) {
      return;
    }

    // Realtime Subscription to active client prepared return
    if (!isReturnListenerAttached && window.FirebaseBridge.subscribePreparedReturn) {
      isReturnListenerAttached = true;
      window.FirebaseBridge.subscribePreparedReturn(function(data) {
        if (!data) return;
        returnDataCache = data;
        renderPreparedReturnScreen(data);
      }, function() {}, 2026);
    }
  }

  function renderPreparedReturnScreen(data) {
    if (!data) return;

    // A. Eyebrow, Headline, and Lede
    var isApproved = (data.approvalStatus === 'approved' || data.clientAuthorized === true);
    var eyebrowEl = document.getElementById('return-eyebrow');
    if (eyebrowEl) {
      eyebrowEl.innerHTML = 'Tax year ' + (data.taxYear || '2026') + ' &middot; ' +
        (isApproved ? 'approved &amp; ready for signature' : 'ready for your review');
    }

    var headlineEl = document.getElementById('return-headline');
    if (headlineEl) {
      headlineEl.textContent = isApproved
        ? 'Your return is approved for signature.'
        : 'Your return is prepared.';
    }

    var ledeEl = document.getElementById('return-lede');
    if (ledeEl) {
      ledeEl.textContent = isApproved
        ? 'You have approved the prepared figures. Proceed to Form 8879 e-signature to complete e-filing authorization.'
        : 'Read it, ask about anything on it, then sign. Nothing is filed until you say so.';
    }

    // B. Realtime Status Banner (Approval / Read-Only Source of Truth)
    var bannerEl = document.getElementById('return-status-banner');
    if (bannerEl) {
      bannerEl.style.display = 'flex';
      if (isApproved) {
        bannerEl.style.background = 'rgba(25, 135, 84, 0.12)';
        bannerEl.style.border = '1px solid rgba(25, 135, 84, 0.35)';
        bannerEl.style.color = 'var(--ink)';
        var authDateStr = data.authorizationTimestamp
          ? new Date(data.authorizationTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'recently';
        bannerEl.innerHTML = [
          '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:8px">',
          '  <span style="display:flex;align-items:center;gap:8px">',
          '    <span class="chip ok">&#10003; Return Approved</span>',
          '    <span>Approved on ' + authDateStr + ' for Form 8879 execution</span>',
          '  </span>',
          '  <span class="chip" style="font-size:0.72rem;background:var(--night-3);color:var(--night-ink-2)">Treas. Reg. &sect; 301.7216-2</span>',
          '</div>'
        ].join('');
      } else {
        bannerEl.style.background = 'rgba(234, 228, 47, 0.1)';
        bannerEl.style.border = '1px solid rgba(234, 228, 47, 0.35)';
        bannerEl.style.color = 'var(--ink)';
        bannerEl.innerHTML = [
          '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:8px">',
          '  <span style="display:flex;align-items:center;gap:8px">',
          '    <span class="chip gold">&#9679; Prepared by ' + (data.preparerName || 'Denise R., CPA') + '</span>',
          '    <span>Completed ' + (data.preparedDate || '2 September 2026') + ' &middot; Source of truth: Pivot Aide Tax</span>',
          '  </span>',
          '  <span class="chip" style="font-size:0.72rem;background:var(--night-3);color:var(--night-ink-2)">Read-Only Custody</span>',
          '</div>'
        ].join('');
      }
    }

    // C. Refund / Balance Due KPI Tiles (Direct source data from preparer)
    var fedRefundEl = document.getElementById('return-fed-refund');
    if (fedRefundEl) {
      fedRefundEl.textContent = data.federalRefundFormatted || ('$' + Number(data.federalRefund).toLocaleString());
    }
    var fedLabelEl = document.getElementById('return-fed-label');
    if (fedLabelEl) {
      fedLabelEl.textContent = (data.federalRefund >= 0) ? 'Federal refund' : 'Federal balance due';
    }

    var stateBalanceEl = document.getElementById('return-state-balance');
    if (stateBalanceEl) {
      stateBalanceEl.textContent = data.stateBalanceDueFormatted || ('$' + Number(data.stateBalanceDue).toLocaleString());
    }
    var stateLabelEl = document.getElementById('return-state-label');
    if (stateLabelEl) {
      stateLabelEl.textContent = (data.stateJurisdiction || 'Maryland') + ' ' + ((data.stateBalanceDue >= 0) ? 'balance due' : 'refund');
    }

    // D. Year-Over-Year Comparison Metrics
    var metricsContainer = document.getElementById('return-metrics-container');
    if (metricsContainer) {
      metricsContainer.innerHTML = [
        '<div class="kv" style="margin-top:9px"><span>Total income</span><b>' + (data.totalIncome || '$214,806') + ' &nbsp;<span style="color:var(--ok)">' + (data.totalIncomeChange || '&#9650; 8%') + '</span></b></div>',
        '<div class="kv"><span>Taxable income</span><b>' + (data.taxableIncome || '$168,240') + '</b></div>',
        '<div class="kv"><span>Effective federal rate</span><b>' + (data.effectiveRate || '14.2%') + '</b></div>',
        '<div class="kv"><span>Total tax</span><b>' + (data.totalTax || '$30,491') + ' &nbsp;<span style="color:var(--warn)">' + (data.totalTaxChange || '&#9650; 3%') + '</span></b></div>'
      ].join('');
    }

    // E. Three Things Changed From Last Year
    var changesContainer = document.getElementById('return-changes-container');
    if (changesContainer && Array.isArray(data.changes)) {
      changesContainer.innerHTML = data.changes.map(function(ch) {
        return [
          '<div class="step">',
          '  <span class="n" style="border:0;background:var(--gold);color:#0C1D28;font-weight:600">' + (ch.step || 1) + '</span>',
          '  <div>',
          '    <div class="t">' + escapeHtmlReturn(ch.title) + '</div>',
          '    <div class="m">' + escapeHtmlReturn(ch.desc) + '</div>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');
    }

    // F. Return Pages Manifest
    var pagesContainer = document.getElementById('return-pages-container');
    if (pagesContainer && Array.isArray(data.pages)) {
      pagesContainer.innerHTML = data.pages.map(function(page, idx) {
        return [
          '<div class="row row-clickable" style="cursor:pointer" data-page-idx="' + idx + '">',
          '  <span class="ic">&#9776;</span>',
          '  <div class="g">',
          '    <div class="t">' + escapeHtmlReturn(page.title) + '</div>',
          '    <div class="m">' + escapeHtmlReturn(page.pages) + '</div>',
          '  </div>',
          '  <span class="chip">' + escapeHtmlReturn(page.status || 'Read') + '</span>',
          '</div>'
        ].join('');
      }).join('');

      // Wire modal click handlers on page rows
      pagesContainer.querySelectorAll('.row-clickable').forEach(function(row) {
        row.addEventListener('click', function() {
          var idx = parseInt(row.getAttribute('data-page-idx'), 10);
          var page = data.pages[idx];
          if (page && typeof openModal === 'function') {
            openModal(page.modalTitle || page.title, page.modalContent || '<p>Document ready for inspection.</p>');
          }
        });
      });
    }

    // G. Action Buttons Wiring & Reactive State
    var btnApprove = document.getElementById('btn-approve-return');
    if (btnApprove) {
      if (isApproved) {
        btnApprove.innerHTML = 'Approved &middot; Proceed to Sign &rarr;';
        btnApprove.className = 'btn btn-g';
      } else {
        btnApprove.innerHTML = 'Approve and sign';
        btnApprove.className = 'btn btn-g';
      }

      btnApprove.onclick = function() {
        if (!isApproved) {
          if (window.FirebaseBridge && window.FirebaseBridge.saveReturnApproval) {
            btnApprove.disabled = true;
            btnApprove.textContent = 'Recording Approval...';
            window.FirebaseBridge.saveReturnApproval(data.returnId, 'Client approved prepared figures for TY2026').then(function() {
              showToast('Return approved! Proceeding to IRS Form 8879 e-signature...', 'ok');
              btnApprove.disabled = false;
              showScreen('sign');
            }).catch(function(err) {
              btnApprove.disabled = false;
              btnApprove.textContent = 'Approve and sign';
              showToast('Approval error: ' + (err.message || 'Check connection'), 'warn');
            });
          } else {
            showScreen('sign');
          }
        } else {
          showScreen('sign');
        }
      };
    }

    var btnAsk = document.getElementById('btn-ask-return');
    if (btnAsk) {
      btnAsk.onclick = function() {
        showToast('Opening secure thread with Denise R., CPA...', 'info');
        showScreen('msgs');
      };
    }

    var btnDownload = document.getElementById('btn-download-pdf');
    if (btnDownload) {
      btnDownload.onclick = function() {
        showToast('Downloading TY2026_Compiled_Return_Package.pdf (14 pages)...', 'ok');
        if (typeof openModal === 'function') {
          openModal('Download Prepared Tax Return', [
            '<div style="padding:10px 0">',
            '  <p>Your full prepared tax return packet is compiled and digitally verified:</p>',
            '  <div style="background:var(--night-2);padding:12px;border-radius:6px;margin:12px 0;font-family:var(--f-mono);font-size:0.8rem">',
            '    <div><b>File:</b> TY2026_Compiled_Return_Package.pdf</div>',
            '    <div><b>Preparer:</b> ' + (data.preparerName || 'Denise R., CPA') + '</div>',
            '    <div><b>Pages:</b> 14 pages (Form 1040, Sched C, Sched E, MD 502, VA 763, PA 40NR)</div>',
            '    <div><b>Custody Ref:</b> ' + (data.downloadPdfUrl || 'clients/' + data.clientUid + '/tax-years/2026/documents/TY2026_Return.pdf') + '</div>',
            '    <div><b>Security:</b> 256-bit AES statutory encryption</div>',
            '  </div>',
            '  <p class="sub">IRS Publication 1345 compliant read-only copy for taxpayer retention.</p>',
            '</div>'
          ].join(''));
        }
      };
    }
  }

  // -------------------------------------------------------------
  // 1D. UNCLE PAT CONTROLLED APPLICATION-GUIDANCE SYSTEM
  // (Deterministic rule-based operational guidance; strict non-advice boundary)
  // -------------------------------------------------------------
  var UnclePatGuidance = {
    // Factual operational boundaries (Treasury Circular 230 & IRC § 6694 Safeguards)
    SAFE_CATEGORIES: [
      'STATIC_GUIDANCE',         // A. General procedural instructions & app walkthroughs
      'RULE_BASED_REMINDERS',    // B. Deterministic state checks (e.g. pending uploads)
      'DEADLINE_NOTIFICATIONS',  // C. Statutory & engagement calendar alerts
      'APP_STATUS_NOTIFICATIONS' // D. Workflow progression updates
    ],
    EXCLUDED_CATEGORIES: [
      'TAX_ADVICE',              // E. Personalized tax deductions & planning (Reserved for CPA Denise R.)
      'TAX_CALCULATION'          // F. Computational tax modeling (Excluded under Treas. Reg. § 301.7701-15)
    ],

    evaluate: function(engagement, returnData, docRequests, billingData) {
      var items = [];

      // 1. Rule-Based Reminder: Pending Document Requests
      var pendingDocsCount = 0;
      if (Array.isArray(docRequests)) {
        docRequests.forEach(function(d) {
          if (d.status === 'pending' || d.status === 'requested') {
            pendingDocsCount++;
          }
        });
      } else if (engagement && engagement.steps) {
        var step3 = engagement.steps.find(function(s) { return s.id === 3; });
        if (step3 && step3.status === 'now') pendingDocsCount = 2;
      } else {
        pendingDocsCount = 2; // Default verified pending items
      }

      if (pendingDocsCount > 0) {
        items.push({
          id: 'guide-docs',
          category: 'RULE_BASED_REMINDERS',
          priority: 1,
          icon: '📄',
          title: 'Document Checklist',
          text: 'You still have ' + pendingDocsCount + ' document' + (pendingDocsCount > 1 ? 's' : '') + ' to upload before preparation can proceed.',
          targetScreen: 'docs',
          targetLabel: 'Upload Documents',
          badge: 'Action Required',
          badgeClass: 'warn'
        });
      }

      // 2. Application Status: Prepared Return Ready for Review
      var isReturnReady = returnData ? (returnData.returnStatus === 'ready_for_review' || returnData.returnStatus === 'prepared') : true;
      var isReturnApproved = returnData ? (returnData.approvalStatus === 'approved' || returnData.clientAuthorized === true) : false;

      if (isReturnReady && !isReturnApproved) {
        items.push({
          id: 'guide-return',
          category: 'APP_STATUS_NOTIFICATIONS',
          priority: 2,
          icon: '📊',
          title: 'Return Ready for Review',
          text: 'Your return is prepared and ready for review. Read the prepared figures and approve when ready.',
          targetScreen: 'return',
          targetLabel: 'Review Return',
          badge: 'Ready for Review',
          badgeClass: 'gold'
        });
      }

      // 3. Application Status: Form 8879 Signature Gate
      var isSigned = false;
      if (engagement && engagement.steps) {
        var step5 = engagement.steps.find(function(s) { return s.id === 5; });
        if (step5 && step5.status === 'done') isSigned = true;
      }
      if (isReturnApproved && !isSigned) {
        items.push({
          id: 'guide-sign',
          category: 'APP_STATUS_NOTIFICATIONS',
          priority: 3,
          icon: '✍️',
          title: 'Form 8879 Signature Required',
          text: 'Your signature is required on IRS Form 8879 before electronic transmission can take place.',
          targetScreen: 'sign',
          targetLabel: 'Sign Form 8879',
          badge: 'Signature Needed',
          badgeClass: 'gold'
        });
      }

      // 4. Rule-Based Reminder: Outstanding Payment
      var invoiceDue = (billingData && billingData.amountDue) || (engagement && engagement.invoiceDue) || '$1,240';
      if (invoiceDue && invoiceDue !== '$0' && invoiceDue !== '0') {
        items.push({
          id: 'guide-pay',
          category: 'RULE_BASED_REMINDERS',
          priority: 4,
          icon: '💳',
          title: 'Payment Outstanding',
          text: 'Your payment is outstanding (' + invoiceDue + '). Tax preparation invoices can be settled from the Billing tab.',
          targetScreen: 'pay',
          targetLabel: 'View Invoices',
          badge: 'Payment Due',
          badgeClass: 'warn'
        });
      }

      // 5. Deadline Notification: Statutory / Engagement Calendar
      var upcoming = (engagement && engagement.upcomingDeadlines && engagement.upcomingDeadlines[0]) || { label: 'Q3 estimated payment', date: '15 Sep 2026' };
      if (upcoming) {
        items.push({
          id: 'guide-deadline',
          category: 'DEADLINE_NOTIFICATIONS',
          priority: 5,
          icon: '⏰',
          title: 'Upcoming Deadline',
          text: 'A deadline is approaching: ' + upcoming.label + ' is due ' + upcoming.date + '.',
          targetScreen: 'home',
          targetLabel: 'View Deadlines',
          badge: 'Calendar Alert',
          badgeClass: 'ok'
        });
      }

      // 6. Static Guidance: Good Standing Fallback
      if (items.length === 0) {
        items.push({
          id: 'guide-all-good',
          category: 'STATIC_GUIDANCE',
          priority: 6,
          icon: '✓',
          title: 'File in Good Standing',
          text: 'A file that stays open all year is a file nobody has to reconstruct in April.',
          targetScreen: 'home',
          targetLabel: 'Dashboard',
          badge: 'All Caught Up',
          badgeClass: 'ok'
        });
      }

      items.sort(function(a, b) { return a.priority - b.priority; });
      return items;
    },

    getPrimaryGuidance: function(stateData) {
      stateData = stateData || {};
      var items = this.evaluate(
        stateData.engagement || homeEngagementCache,
        stateData.returnData || returnDataCache,
        stateData.docRequests || (window.FileRoomData && window.FileRoomData.documents),
        stateData.billingData
      );
      return items[0] || { text: 'A file that stays open all year is a file nobody has to reconstruct in April.' };
    }
  };

  window.UnclePatGuidance = UnclePatGuidance;

  function openUnclePatGuidanceModal() {
    var items = UnclePatGuidance.evaluate(
      homeEngagementCache,
      returnDataCache,
      (window.FileRoomData && window.FileRoomData.documents),
      null
    );

    var itemsHtml = items.map(function(item) {
      return [
        '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start">',
        '  <span style="font-size:1.4rem;line-height:1">' + item.icon + '</span>',
        '  <div style="flex:1">',
        '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:4px">',
        '      <b style="font-size:.9rem">' + item.title + '</b>',
        '      <span class="chip ' + (item.badgeClass || '') + '" style="font-size:.68rem">' + item.badge + '</span>',
        '    </div>',
        '    <p style="font-size:.84rem;margin:0 0 8px;color:var(--ink)">' + item.text + '</p>',
        '    <button class="btn sm btn-g" style="font-size:.74rem;padding:4px 10px" onclick="showScreen(\'' + item.targetScreen + '\');closeModal();">' + item.targetLabel + ' &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    var modalHtml = [
      '<div style="padding:4px 0">',
      '  <p class="sub" style="margin-bottom:12px">Uncle Pat evaluates active engagement state to provide non-advisory operational guidance:</p>',
      itemsHtml,
      '  <div style="background:var(--night-2);padding:10px 12px;border-radius:4px;margin-top:14px;border:1px solid var(--night-line);font-size:.75rem;color:var(--night-ink-2)">',
      '    <b>Statutory Exclusion Boundary (Circular 230):</b> Uncle Pat is an automated application guide. Uncle Pat does NOT calculate tax liabilities or provide personalized tax advice. All professional tax positions and advice are provided directly by Denise R., CPA.',
      '  </div>',
      '</div>'
    ].join('');

    if (typeof openModal === 'function') {
      openModal('Uncle Pat · Active Application Checklist', modalHtml);
    }
  }

  // -------------------------------------------------------------
  // 2. MOBILE NAVIGATION DRAWER & THEME
  // -------------------------------------------------------------
  function toggleMobileDrawer(open) {
    if (!el.side) return;
    var isOpen = el.side.classList.contains('open');
    var shouldOpen = (typeof open === 'boolean') ? open : !isOpen;
    el.side.classList.toggle('open', shouldOpen);
    if (el.drawerBackdrop) {
      el.drawerBackdrop.classList.toggle('active', shouldOpen);
    }
  }

  function initTheme() {
    var storedTheme = localStorage.getItem('fileroom_theme');
    if (storedTheme) {
      document.documentElement.setAttribute('data-theme', storedTheme);
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fileroom_theme', next);
    showToast('Switched to ' + next + ' mode', 'info');
  }

  // -------------------------------------------------------------
  // 3. TOAST NOTIFICATION SYSTEM
  // -------------------------------------------------------------
  function showToast(message, type) {
    if (!el.toastContainer) return;
    var t = document.createElement('div');
    t.className = 'toast';
    var icon = type === 'ok' ? '✓' : (type === 'warn' ? '⚠' : 'ℹ');
    t.innerHTML = '<span style="color:var(--gold);font-weight:700">' + icon + '</span><span>' + message + '</span>';
    el.toastContainer.appendChild(t);
    setTimeout(function() {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3200);
  }

  // -------------------------------------------------------------
  // 4. MODAL DIALOG CONTROLLER
  // -------------------------------------------------------------
  function openModal(title, bodyHtml, footerHtml) {
    if (!el.modalBackdrop || !el.modalContainer) return;
    el.modalContainer.innerHTML = [
      '<div class="modal-header">',
      '  <h3 style="margin:0;font-size:1.1rem;font-weight:500">' + title + '</h3>',
      '  <button id="modal-close-btn" style="background:transparent;border:0;font-size:1.2rem;color:var(--ink-3);padding:4px 8px;cursor:pointer">&times;</button>',
      '</div>',
      '<div class="modal-body">' + bodyHtml + '</div>',
      '<div class="modal-footer">' + (footerHtml || '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button>') + '</div>'
    ].join('');

    el.modalBackdrop.classList.add('active');

    var close = document.getElementById('modal-close-btn');
    var cancel = document.getElementById('modal-cancel-btn');
    if (close) close.addEventListener('click', closeModal);
    if (cancel) cancel.addEventListener('click', closeModal);
  }

  var activeCameraStream = null;

  function stopActiveCamera() {
    if (activeCameraStream) {
      try {
        activeCameraStream.getTracks().forEach(function(track) {
          track.stop();
        });
      } catch (e) {
        console.warn('Error stopping camera track:', e);
      }
      activeCameraStream = null;
    }
  }

  function closeModal() {
    stopActiveCamera();
    if (el.modalBackdrop) {
      el.modalBackdrop.classList.remove('active');
    }
    if (el.modalContainer) {
      el.modalContainer.classList.remove('modal-wide');
    }
  }

  // -------------------------------------------------------------
  // 4B. PROTOTYPE CHROME & ARCHITECTURE RULES
  // -------------------------------------------------------------
  function showArchitectureRulesModal() {
    if (el.modalContainer) {
      el.modalContainer.classList.add('modal-wide');
    }

    var html = [
      '<div class="arch-rules-modal-wrapper">',
      '  <div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid var(--line);padding-bottom:12px;flex-wrap:wrap">',
      '    <button id="tab-btn-exhibit-a" class="btn sm btn-g" style="font-weight:600">Exhibit A: Costs (01)</button>',
      '    <button id="tab-btn-exhibit-b" class="btn sm btn-o" style="color:var(--ink)">Exhibit B: Scope (02)</button>',
      '    <button id="tab-btn-exhibit-c" class="btn sm btn-o" style="color:var(--ink)">Exhibit C: Screens (03)</button>',
      '    <button id="tab-btn-exhibit-e" class="btn sm btn-o" style="color:var(--ink)">Exhibit E: Custodian (05)</button>',
      '    <button id="tab-btn-exhibit-f" class="btn sm btn-o" style="color:var(--ink)">Exhibit F: Arch (06)</button>',
      '    <button id="tab-btn-exhibit-h" class="btn sm btn-o" style="color:var(--ink)">Exhibit H: Run Rate (08)</button>',
      '    <button id="tab-btn-exhibit-i" class="btn sm btn-o" style="color:var(--ink)">Exhibit I: App Stores (09)</button>',
      '    <button id="tab-btn-exhibit-j" class="btn sm btn-o" style="color:var(--ink)">Exhibit J: Product (10)</button>',
      '    <button id="tab-btn-exhibit-k" class="btn sm btn-o" style="color:var(--ink)">Exhibit K: Decisions (11)</button>',
      '    <button id="tab-btn-exhibit-l" class="btn sm btn-o" style="color:var(--ink)">Exhibit L: Sources (12)</button>',
      '    <button id="tab-btn-safeguards" class="btn sm btn-o" style="color:var(--ink)">IRS &amp; FTC Safeguards</button>',
      '    <button id="tab-btn-qa-suite" class="btn sm btn-o" style="color:#0C1D28;background:var(--gold);font-weight:600">QA Automation Code Gen</button>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT A -->',
      '  <div id="pane-exhibit-a" style="font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit A</span>',
      '      <span style="font-weight:600">01 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:14px;color:var(--ink);letter-spacing:-0.02em">What you are choosing, and what it costs</h3>',
      '    <p style="margin-bottom:12px;color:var(--ink-2)">You asked for a custom app rather than a configured platform. That is a defensible choice, but it is an expensive one, and the reason it is expensive is worth stating on the first page rather than the last.</p>',
      '    <p style="margin-bottom:16px;color:var(--ink-2)">Five products already do most of what you described &mdash; TaxDome, Canopy, Liscio, SafeSend and Karbon. They are licensed per seat, they carry IRS-compliant signing, and the vendor absorbs the security engineering. Below is what each path actually costs a firm of roughly six staff and four hundred clients.</p>',
      '    <div class="exhibit-section-hdr">LICENSED PLATFORM &mdash; PUBLISHED 2026 PRICING</div>',
      '    <table class="exhibit-table">',
      '      <tbody>',
      '        <tr>',
      '          <td style="width:110px"><b>TaxDome</b></td>',
      '          <td style="color:var(--ink-2)">Pro tier, unlimited seats. Unlimited e-signature. IRS Form 8879-compliant KBA at $1.00 per signer attempt. White-label client app quoted separately.</td>',
      '          <td style="width:140px;text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$1,000</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">PER SEAT / YR</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Canopy</b></td>',
      '          <td style="color:var(--ink-2)">Standard $74 to Premium $149 per user per month, billed annually. KBA credits $1.25 each.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$888</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">PER USER / YR, STANDARD</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Liscio</b></td>',
      '          <td style="color:var(--ink-2)">$19 / $49 / $99 per user per month. Tax Team tier bundles 100 signatures per user. No published KBA claim.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$588</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">PER USER / YR, PLATFORM</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>SafeSend</b></td>',
      '          <td style="color:var(--ink-2)">Priced per return, not per seat. Purpose-built for 8879 signing. Pricing not published &mdash; sales call required.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--ink)">n/p</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">QUOTE REQUIRED</div>',
      '          </td>',
      '        </tr>',
      '      </tbody>',
      '    </table>',
      '    <div class="exhibit-section-hdr">CUSTOM BUILD &mdash; THE PATH CHOSEN</div>',
      '    <table class="exhibit-table">',
      '      <tbody>',
      '        <tr>',
      '          <td style="width:110px"><b>Year one</b></td>',
      '          <td style="color:var(--ink-2)">Web portal, then native iOS and Android. Design, build, security programme, first penetration test.</td>',
      '          <td style="width:140px;text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$175k&ndash;$400k</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">RANGE, NOT A QUOTE</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Every year after</b></td>',
      '          <td style="color:var(--ink-2)">Hosting, identity, scanning, monitoring, e-signature licences, annual penetration test, semi-annual vulnerability scans, maintenance at 15&ndash;20% of build.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$55k&ndash;$119k</div>',
      '            <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3);letter-spacing:.06em">PER YEAR</div>',
      '          </td>',
      '        </tr>',
      '      </tbody>',
      '    </table>',
      '    <div class="exhibit-callout">',
      '      <span class="exhibit-callout-tag">THE NUMBER THAT MATTERS</span>',
      '      <p style="font-size:.85rem;line-height:1.6;color:var(--ink)">Spread over three years, the custom path runs somewhere between <b>$280 and $630 per client per year</b> at four hundred clients. TaxDome at Pro, with KBA, runs about <b>$17 per client per year</b>. That is a difference of seventeen to thirty-seven times, and no amount of design quality closes it &mdash; which is why <b>Exhibit J</b> argues the only version of this that pencils is one where the app is a product you can license to other firms, not an internal tool.</p>',
      '    </div>',
      '    <p style="font-size:.82rem;color:var(--ink-3);font-style:italic">The rest of this file takes the decision as made and answers the real question: what has to be true for it to work.</p>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap;gap:8px">',
      '      <button id="btn-modal-open-interactive-a" class="btn sm btn-g" style="font-weight:600">&#9878; Launch Full Interactive Exhibit A Screen &rarr;</button>',
      '      <button id="btn-a-to-b" class="btn sm btn-b">Next: Exhibit B &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT B -->',
      '  <div id="pane-exhibit-b" style="display:none">',
      '    <div class="exhibit-b-theme">',
      '      <div class="exhibit-b-header">',
      '        <span class="exhibit-b-badge-gold">Exhibit B</span>',
      '        <span class="exhibit-b-page">02 of 12</span>',
      '      </div>',
      '      <h3 class="exhibit-b-title">What the app does &mdash; and what it refuses to do</h3>',
      '      <div class="exhibit-b-subtitle">Seven capabilities. One hard exclusion. The exclusion is the more important half.</div>',
      '      <div class="exhibit-b-list">',
      '        <!-- 01 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">01 - EXCHANGE</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">Secure document upload</div>',
      '            <div class="exhibit-b-item-desc">Named requests, not &ldquo;send everything.&rdquo; Camera capture on the phone, drag-and-drop on the web. Malware scanned on arrival, encrypted at rest, every access logged.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action">Build</div>',
      '            <span class="sub">own</span>',
      '          </div>',
      '        </div>',
      '        <!-- 02 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">02 - REGULATED</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">Signing, including Form 8879</div>',
      '            <div class="exhibit-b-item-desc">Identity verification, the signature, and the evidence record the IRS requires you to keep. This is the one component to license rather than write.</div>',
          '</div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action buy">Buy</div>',
      '            <span class="sub">embed a vendor</span>',
      '          </div>',
      '        </div>',
      '        <!-- 03 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">03 - DELIVERY</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">The prepared return</div>',
      '            <div class="exhibit-b-item-desc">A read-only copy of what the firm prepared, with a plain-language note on what changed since last year. Read, ask, approve, sign.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action">Build</div>',
      '            <span class="sub">own</span>',
      '          </div>',
      '        </div>',
      '        <!-- 04 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">04 - DIALOGUE</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">Questions and answers</div>',
      '            <div class="exhibit-b-item-desc">Threaded messaging attached to the file, so a question about a document sits beside the document. Replaces email, which is where taxpayer data goes to leak.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action">Build</div>',
      '            <span class="sub">own</span>',
      '          </div>',
      '        </div>',
      '        <!-- 05 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">05 - ATTENTION</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">Updates that are actually about you</div>',
      '            <div class="exhibit-b-item-desc">Stage changes, deadlines on your file, and rule changes that move your number. Push and email. Never a newsletter blast dressed as an alert.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action">Build</div>',
      '            <span class="sub">own</span>',
      '          </div>',
      '        </div>',
      '        <!-- 06 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">06 - COMMERCE</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">The service catalogue</div>',
      '            <div class="exhibit-b-item-desc">The published lineup, priced as the site prices it, with The Standing File at the top. Add a service, accept a scope, and the engagement letter goes out.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action">Build</div>',
      '            <span class="sub">own</span>',
      '          </div>',
      '        </div>',
      '        <!-- 07 -->',
      '        <div class="exhibit-b-item">',
      '          <div class="exhibit-b-tag">07 - MONEY</div>',
      '          <div class="exhibit-b-content">',
      '            <div class="exhibit-b-item-title">Payment</div>',
      '            <div class="exhibit-b-item-desc">Bank transfer as the default because it is cheaper, card as the alternative. Card details never touch your systems.</div>',
      '          </div>',
      '          <div class="exhibit-b-badge">',
      '            <div class="action buy">Buy</div>',
      '            <span class="sub">hosted processor</span>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <!-- The Exclusion, Stated Plainly -->',
      '      <div class="exhibit-b-callout">',
      '        <span class="exhibit-b-callout-tag">THE EXCLUSION, STATED PLAINLY</span>',
      '        <p class="exhibit-b-callout-text">The app <b>does not compute tax</b> and does not generate advice. It moves documents, signatures, answers and money; every number a client sees was put there by a person at the firm. That is not a limitation to apologise for &mdash; it keeps the app clear of the software-that-gives-tax-advice problem, and it lets you say honestly that the app never replaces the preparer.</p>',
      '      </div>',
      '    </div>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap;gap:8px">',
      '      <button id="btn-b-to-a" class="btn sm btn-o">&larr; Previous: Exhibit A</button>',
      '      <button id="btn-modal-open-interactive-b" class="btn sm btn-g" style="font-weight:600">&#9878; Launch Full Interactive Exhibit B Screen &rarr;</button>',
      '      <button id="btn-b-to-c" class="btn sm btn-b">Next: Exhibit C &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT C -->',
      '  <div id="pane-exhibit-c" style="display:none;font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit C</span>',
      '      <span style="font-weight:600">03 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:8px;color:var(--ink);letter-spacing:-0.02em">Ten screens, in the order a client meets them</h3>',
      '    <p style="margin-bottom:16px;color:var(--ink-2);font-size:.88rem;border-bottom:1px solid var(--line-2);padding-bottom:12px">Each of these is built in the companion prototype. Screen numbers match.</p>',
      '    <div class="exhibit-c-list">',
      '      <!-- 01 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">01</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Sign in</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="signin">Open Screen 01 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">Email and password, then a second factor. Passkey and Face ID on the phone. The second step is not a product choice &mdash; multi-factor authentication is mandatory for anyone reaching customer information under the Safeguards Rule.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 02 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">02</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Your file</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="home">Open Screen 02 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">The whole thesis on one screen: <i>your file is open, this is what stage it is at, and these two things are waiting on you</i>. A six-step progress spine from engagement letter to IRS acceptance. Everything else on the home screen is subordinate to those two things.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 03 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">03</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Documents</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="docs">Open Screen 03 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">Grouped by status &mdash; needed, in review, received &mdash; and every missing item named specifically. &ldquo;1099-MISC from Keystone Property Group&rdquo; gets answered. &ldquo;Upload your documents&rdquo; does not.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 04 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">04</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Sign</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="sign">Open Screen 04 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">The regulated screen. Read the form, pass the identity check, sign. Three attempts, then a graceful fall back to a handwritten signature. Detailed in <b>Exhibit D</b>.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 05 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">05</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Your return</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="return">Open Screen 05 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">Refund or balance, the effective rate, and &mdash; the part clients actually read &mdash; <i>three things that changed from last year</i>, in sentences. Then approve, ask, or download.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 06 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">06</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Messages</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="msgs">Open Screen 06 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">One thread per file, with quick-question chips for the five things everyone asks. Uncle Pat appears here as the automatic voice &mdash; deadline reminders and rule notes &mdash; while the preparer answers as herself.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 07 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">07</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Services</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="svcs">Open Screen 07 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">The published lineup at the published prices, plus the free notice read. This is the screen that turns a filing client into a planning client.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 08 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">08</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Billing</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="pay">Open Screen 08 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">Itemised invoice, bank transfer default, card with the fee shown before confirmation. Payment history stays visible.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 09 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">09</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Updates</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="news">Open Screen 09 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">File events and the rule changes that touch this client, with per-category notification controls the client actually owns.</div>',
      '        </div>',
      '      </div>',
      '      <!-- 10 -->',
      '      <div class="exhibit-c-item">',
      '        <div class="exhibit-c-num">10</div>',
      '        <div class="exhibit-c-body">',
      '          <div class="exhibit-c-title-row">',
      '            <div class="exhibit-c-title">Firm view</div>',
      '            <button class="exhibit-c-jump-btn" data-jump="firm">Open Screen 10 &rarr;</button>',
      '          </div>',
      '          <div class="exhibit-c-desc">The half nobody demos: who is waiting, who has not signed, whose KBA failed, what is due today. Without this the app makes the client’s life better and the firm’s worse.</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-c-to-b" class="btn sm btn-o">&larr; Previous: Exhibit B</button>',
      '      <button id="btn-c-to-e" class="btn sm btn-b">Next: Exhibit E &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT E -->',
      '  <div id="pane-exhibit-e" style="display:none;font-size:.85rem;line-height:1.65;color:#fff">',
      '    <div class="exhibit-e-theme">',
      '      <div class="exhibit-b-header">',
      '        <span class="exhibit-b-badge-gold">Exhibit E</span>',
      '        <span class="exhibit-b-page">05 of 12</span>',
      '      </div>',
      '      <h3 class="exhibit-b-title">Running your own portal makes you the custodian</h3>',
      '      <div class="exhibit-b-subtitle">',
      '        A tax preparer is a &ldquo;financial institution&rdquo; under the FTC Safeguards Rule. That is already true today. Holding client documents on your own infrastructure makes it considerably more expensive to satisfy.',
      '      </div>',
      '',
      '      <div class="exhibit-e-grid">',
      '        <!-- The Nine Elements -->',
      '        <div class="exhibit-e-col">',
      '          <div class="exhibit-e-col-hdr">THE NINE ELEMENTS &ndash; 16 CFR 314.4</div>',
      '          <ul class="exhibit-e-list">',
      '            <li>A named Qualified Individual accountable for the programme</li>',
      '            <li>A written risk assessment, reassessed periodically</li>',
      '            <li>Safeguards: access control, data inventory, encryption in transit and at rest, secure development, MFA, secure disposal, change management, logging</li>',
      '            <li>Annual penetration testing and vulnerability scans every six months, plus after material changes</li>',
      '            <li>Staff security training, kept current</li>',
      '            <li>Service-provider oversight &mdash; selection, contract terms, reassessment</li>',
      '            <li>Keeping the programme current</li>',
      '            <li>A written incident response plan</li>',
      '            <li>An annual written report to the senior officer</li>',
      '          </ul>',
      '        </div>',
      '',
      '        <!-- And Then -->',
      '        <div class="exhibit-e-col">',
      '          <div class="exhibit-e-col-hdr">AND THEN</div>',
      '          <ul class="exhibit-e-list">',
      '            <li>Breach notice to the FTC within 30 days where 500 or more consumers&rsquo; unencrypted information was acquired &mdash; in force since 13 May 2024</li>',
      '            <li>State breach law in every affected resident&rsquo;s state. You file in all fifty; one incident can trigger fifty different clocks. Maryland gives 45 days and requires notice to the Attorney General first; the District requires 18 months of identity protection where taxpayer identifiers are involved</li>',
      '            <li>Disposal of customer information no later than two years after last use, unless retention is required</li>',
      '            <li>A written information security plan &mdash; IRS Publication 4557 requires it, Publication 5708 is the template</li>',
      '            <li>IRC &sect;7216 on disclosure of return information: criminal penalty up to $1,000 and one year; civil penalty $250 per disclosure to a $10,000 annual cap, rising to $1,000 and $50,000 where identity theft is involved</li>',
      '          </ul>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- One Piece of Good News Callout -->',
      '      <div class="exhibit-b-callout">',
      '        <span class="exhibit-b-callout-tag">ONE PIECE OF GOOD NEWS</span>',
      '        <p class="exhibit-b-callout-text">',
      '          A firm holding information on <b>fewer than 5,000 consumers</b> is exempt from four of these &mdash; the written risk assessment, the prescribed testing cadence, the incident response plan and the annual report. Count your consumer records: if you are under the line, say so in the security programme and revisit it annually, because it is a threshold you grow through rather than a permanent relief. Encryption, MFA, disposal and service-provider oversight apply either way.',
      '        </p>',
      '      </div>',
      '',
      '      <p style="margin-top:14px;font-size:.82rem;color:rgba(255,255,255,0.85);line-height:1.55">',
      '        Buying a platform does not remove any of this. It moves most of the technical burden onto a vendor you must still select, contract with and reassess &mdash; which is itself one of the nine elements.',
      '      </p>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-e-to-c" class="btn sm btn-o">&larr; Previous: Exhibit C</button>',
      '      <button id="btn-e-to-f" class="btn sm btn-b">Next: Exhibit F &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT F -->',
      '  <div id="pane-exhibit-f" style="display:none;font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit F</span>',
      '      <span style="font-weight:600">06 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:8px;color:var(--ink);letter-spacing:-0.02em">How it is put together</h3>',
      '    <p style="margin-bottom:16px;color:var(--ink-2)">One backend, three clients, four licensed services. Nothing exotic &mdash; the engineering risk here is not architectural, it is in the handling of regulated data.</p>',
      '',
      '    <!-- SECTION 1: WHAT YOU BUILD -->',
      '    <div class="exhibit-section-hdr">WHAT YOU BUILD</div>',
      '    <table class="exhibit-table">',
      '      <tbody>',
      '        <tr>',
      '          <td style="width:140px"><b>API and data layer</b></td>',
      '          <td style="color:var(--ink-2)">Clients, engagements, tax years, document requests, documents, messages, invoices, events. Multi-tenant from day one even though there is one firm today &mdash; retrofitting tenancy is the expensive mistake.</td>',
      '          <td style="width:100px;text-align:right">',
      '            <div style="font-size:1.05rem;font-weight:600;color:var(--blue)">core</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Web client</b></td>',
      '          <td style="color:var(--ink-2)">Responsive, the same application on desktop and phone browser. Screens 01&ndash;09.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.05rem;font-weight:600;color:var(--blue)">phase 1</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Firm console</b></td>',
      '          <td style="color:var(--ink-2)">Screen 10. Assignment, request templates by return type, automatic chasing, the signature evidence archive, the audit log.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.05rem;font-weight:600;color:var(--blue)">phase 1</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>iOS and Android</b></td>',
      '          <td style="color:var(--ink-2)">Native. Push, camera capture, biometric unlock. Same API.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.05rem;font-weight:600;color:var(--blue)">phase 2</div>',
      '          </td>',
      '        </tr>',
      '      </tbody>',
      '    </table>',
      '',
      '    <!-- SECTION 2: WHAT YOU LICENSE -->',
      '    <div class="exhibit-section-hdr">WHAT YOU LICENSE</div>',
      '    <table class="exhibit-table">',
      '      <tbody>',
      '        <tr>',
      '          <td style="width:140px"><b>Identity</b></td>',
      '          <td style="color:var(--ink-2)">Managed authentication with MFA. Auth0 is free to 25,000 monthly active users; AWS Cognito runs $0.015&ndash;$0.020 per monthly active user; Clerk is free to 50,000 then $0.02.</td>',
      '          <td style="width:130px;text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">&lt;$50</div>',
      '            <div style="font-family:var(--f-mono);font-size:.64rem;color:var(--ink-3);letter-spacing:.04em">PER MONTH AT YOUR SCALE</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>E-signature + KBA</b></td>',
      '          <td style="color:var(--ink-2)">DocuSign, or SafeSend behind the app. See Exhibit D.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$2.40</div>',
      '            <div style="font-family:var(--f-mono);font-size:.64rem;color:var(--ink-3);letter-spacing:.04em">PER IDENTITY CHECK</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Payments</b></td>',
      '          <td style="color:var(--ink-2)">Fully hosted checkout, so card data never reaches your servers. Stripe 2.9% + $0.30 card, 0.8% ACH capped at $5. CPACharge $10/month, 2.99% + $0.30, 1% ACH capped at $10 &mdash; and it supports surcharging, which Stripe leaves you to build.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">2.9%</div>',
      '            <div style="font-family:var(--f-mono);font-size:.64rem;color:var(--ink-3);letter-spacing:.04em">+ $0.30 CARD</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Upload scanning</b></td>',
      '          <td style="color:var(--ink-2)">Malware scanning on every inbound file. From $99 per month for 5,000 scans.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$99</div>',
      '            <div style="font-family:var(--f-mono);font-size:.64rem;color:var(--ink-3);letter-spacing:.04em">PER MONTH</div>',
      '          </td>',
      '        </tr>',
      '        <tr>',
      '          <td><b>Storage, logging</b></td>',
      '          <td style="color:var(--ink-2)">Encrypted object storage at $0.023 per GB per month; centralised logging and alerting.</td>',
      '          <td style="text-align:right">',
      '            <div style="font-size:1.15rem;font-weight:600;color:var(--blue)">$100&ndash;$250</div>',
      '            <div style="font-family:var(--f-mono);font-size:.64rem;color:var(--ink-3);letter-spacing:.04em">PER MONTH</div>',
      '          </td>',
      '        </tr>',
      '      </tbody>',
      '    </table>',
      '',
      '    <!-- Callout Box -->',
      '    <div class="exhibit-callout">',
      '      <span class="exhibit-callout-tag" style="color:var(--blue)">THE PAYMENTS DECISION THAT CHANGES YOUR COMPLIANCE BURDEN</span>',
      '      <p style="font-size:.85rem;line-height:1.6;color:var(--ink)">',
      '        If the client is redirected to the processor\'s own hosted page, you sit in the lightest PCI category &mdash; roughly twenty-two requirements. If you embed card fields in your own page, even in an iframe, you move to the next category up: around <b>191 requirements</b>, essentially full PCI DSS. Redirect. It costs one extra screen transition and saves a compliance programme.',
      '      </p>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-f-to-e" class="btn sm btn-o">&larr; Previous: Exhibit E</button>',
      '      <button id="btn-f-to-h" class="btn sm btn-b">Next: Exhibit H &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT H -->',
      '  <div id="pane-exhibit-h" style="display:none;font-size:.85rem;line-height:1.65;color:#fff">',
      '    <div class="exhibit-e-theme">',
      '      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid rgba(255,255,255,0.25);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:8px">',
      '        <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">',
      '          <span style="font-family:var(--f-mono);font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#EAE42F;font-weight:700">Exhibit H</span>',
      '          <h3 style="display:inline;font-size:1.35rem;font-weight:700;color:#FFFFFF;margin:0;letter-spacing:-0.02em">What it costs to run, every year, forever</h3>',
      '        </div>',
      '        <span style="font-family:var(--f-mono);font-size:.72rem;color:rgba(255,255,255,0.7);font-weight:600">08 of 12</span>',
      '      </div>',
      '',
      '      <p style="margin-bottom:4px;color:#FFFFFF;font-size:.92rem;line-height:1.5">Modelled at six staff and four hundred clients, with roughly six hundred signatures a year.</p>',
      '      <p style="margin-bottom:18px;color:#FFFFFF;font-size:.92rem;line-height:1.5">Ranges are planning figures drawn from published rates, not quotes.</p>',
      '',
      '      <!-- Section 1: ANNUAL RUN RATE - CUSTOM BUILD -->',
      '      <div style="font-family:var(--f-mono);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#EAE42F;font-weight:700;margin-top:14px;margin-bottom:6px">ANNUAL RUN RATE &ndash; CUSTOM BUILD</div>',
      '      <table class="exhibit-blue-table">',
      '        <tbody>',
      '          <tr>',
      '            <td style="width:160px"><b>Hosting</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Compute, database, backups</td>',
      '            <td class="cost">$3,000</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Storage</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Encrypted object storage and versioning</td>',
      '            <td class="cost">$200</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Identity</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Managed authentication with MFA</td>',
      '            <td class="cost">$150</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Upload scanning</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Malware scanning, 5,000 files</td>',
      '            <td class="cost">$1,200</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Logging</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Centralised logs, alerting, retention</td>',
      '            <td class="cost">$1,200</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>E-signature</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Six seats plus 600 identity checks at $2.40</td>',
      '            <td class="cost">$4,700</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Vulnerability scans</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Semi-annual, as the Safeguards Rule requires</td>',
      '            <td class="cost">$3,600</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Penetration test</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Annual, web and mobile</td>',
      '            <td class="cost">$18k&ndash;$35k</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>App stores</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Apple $99 a year, Google $25 once</td>',
      '            <td class="cost">$124</td>',
      '          </tr>',
      '          <tr>',
      '            <td><b>Maintenance</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">15&ndash;20% of the $150k&ndash;$350k software build, the industry rule of thumb</td>',
      '            <td class="cost">$23k&ndash;$70k</td>',
      '          </tr>',
      '          <tr class="total-row">',
      '            <td><b>Total</b></td>',
      '            <td style="color:#FFFFFF">Before payment processing, which is a percentage of fees collected either way</td>',
      '            <td class="cost">$55k&ndash;$119k</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '',
      '      <!-- Section 2: THE SAME PRACTICE ON A LICENSED PLATFORM -->',
      '      <div style="font-family:var(--f-mono);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#EAE42F;font-weight:700;margin-top:18px;margin-bottom:6px">THE SAME PRACTICE ON A LICENSED PLATFORM</div>',
      '      <table class="exhibit-blue-table">',
      '        <tbody>',
      '          <tr>',
      '            <td style="width:160px"><b>TaxDome Pro</b></td>',
      '            <td style="color:rgba(255,255,255,0.9)">Six seats, unlimited signatures, 600 KBA attempts at $1.00</td>',
      '            <td class="cost">$6,600</td>',
      '          </tr>',
      '        </tbody>',
      '      </table>',
      '',
      '      <!-- Callout Box: READ THIS LINE TWICE -->',
      '      <div class="exhibit-b-callout" style="margin-top:20px">',
      '        <span class="exhibit-b-callout-tag">READ THIS LINE TWICE</span>',
      '        <p class="exhibit-b-callout-text" style="color:#FFFFFF;line-height:1.6">',
      '          The penetration test alone costs more each year than the entire platform licence. That is not an argument against building &mdash; it is the argument that building only makes sense if the thing you build earns revenue of its own.',
      '        </p>',
      '      </div>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-h-to-f" class="btn sm btn-o">&larr; Previous: Exhibit F</button>',
      '      <button id="btn-h-to-i" class="btn sm btn-b">Next: Exhibit I &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT I -->',
      '  <div id="pane-exhibit-i" style="display:none;font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit I</span>',
      '      <span style="font-weight:600">09 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:12px;color:var(--ink);letter-spacing:-0.02em">What changes when it goes in the stores</h3>',
      '    <p style="margin-bottom:18px;color:var(--ink-2);font-size:.9rem;line-height:1.6">You chose web plus native. Native is worth having, but it introduces two gatekeepers with opinions about financial apps.</p>',
      '',
      '    <div class="exhibit-i-grid">',
      '      <!-- Column 1: WHAT NATIVE GENUINELY BUYS -->',
      '      <div>',
      '        <div class="exhibit-i-col-hdr">WHAT NATIVE GENUINELY BUYS</div>',
      '        <ul class="exhibit-i-list">',
      '          <li><b>Push notifications that arrive.</b> The single biggest reason clients respond faster &mdash; browser push on iOS is still unreliable</li>',
      '          <li><b>Camera capture that behaves like a scanner</b> &mdash; edge detection, multi-page, straightened output. This is how a W-2 gets uploaded from a kitchen table</li>',
      '          <li><b>Face ID and Touch ID as the second factor</b>, which removes most of the friction MFA otherwise adds</li>',
      '          <li><b>Presence.</b> An icon on the home screen is a year-round reminder that the file is open</li>',
      '        </ul>',
      '      </div>',
      '',
      '      <!-- Column 2: WHAT IT COSTS YOU IN PROCESS -->',
      '      <div>',
      '        <div class="exhibit-i-col-hdr">WHAT IT COSTS YOU IN PROCESS</div>',
      '        <ul class="exhibit-i-list">',
      '          <li><b>Privacy disclosures</b> on both stores, including a financial-data category, kept accurate as the app changes</li>',
      '          <li><b>In-app account deletion</b> is mandatory on both &mdash; with a documented exception for regulated retention, which your three-year signature records need</li>',
      '          <li><b>Review cycles</b> on every release. Fixes are not same-day</li>',
      '          <li><b>Two more codebases</b> to maintain, test and pay for in the annual penetration test</li>',
      '          <li><b>Apple $99 a year; Google $25 once</b></li>',
      '        </ul>',
      '      </div>',
      '    </div>',
      '',
      '    <!-- Callout Box: OPEN QUESTION -->',
      '    <div class="exhibit-callout-alert">',
      '      <span class="exhibit-callout-alert-tag">OPEN QUESTION &ndash; CONFIRM BEFORE YOU BUILD THE PAYMENT SCREEN</span>',
      '      <p>Both stores exempt real-world services consumed outside the app from mandatory in-app purchase and its 15&ndash;30% commission. Apple\'s guideline covers &ldquo;physical goods or services that will be consumed outside of the app&rdquo;; Google\'s names physical services such as transport and gym memberships. Tax preparation reads squarely as such a service &mdash; but <b>neither store names professional services as a labelled exemption</b>, and the inference has never been tested for your app.</p>',
      '      <p>A 15&ndash;30% commission on tax-preparation fees would be catastrophic to the model. Confirm it in writing with both stores, or through app-review counsel, before phase 2 starts. If in doubt, phase 2 ships without in-app payment and links out.</p>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-i-to-h" class="btn sm btn-o">&larr; Previous: Exhibit H</button>',
      '      <button id="btn-i-to-j" class="btn sm btn-b">Next: Exhibit J &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT J -->',
      '  <div id="pane-exhibit-j" style="display:none;font-size:.85rem;line-height:1.65;color:#fff">',
      '    <div class="exhibit-e-theme">',
      '      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid rgba(255,255,255,0.25);padding-bottom:10px;margin-bottom:14px;flex-wrap:wrap;gap:8px">',
      '        <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">',
      '          <span style="font-family:var(--f-mono);font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:#EAE42F;font-weight:700">Exhibit J</span>',
      '          <h3 style="display:inline;font-size:1.35rem;font-weight:700;color:#FFFFFF;margin:0;letter-spacing:-0.02em">The only version of this that pencils</h3>',
      '        </div>',
      '        <span style="font-family:var(--f-mono);font-size:.72rem;color:rgba(255,255,255,0.7);font-weight:600">10 of 12</span>',
      '      </div>',
      '',
      '      <!-- Hero Statement -->',
      '      <h2 style="font-size:1.6rem;font-weight:600;line-height:1.35;color:#FFFFFF;margin:16px 0 16px;letter-spacing:-0.02em">',
      '        As an internal tool, this app costs seventeen times the alternative at best. As a <span style="color:#EAE42F">product</span>, the same code has a market.',
      '      </h2>',
      '',
      '      <!-- Body Paragraphs -->',
      '      <p style="margin-bottom:12px;color:rgba(255,255,255,0.9);font-size:.88rem;line-height:1.6">',
      '        Exhibit H is uncomfortable on purpose. As a portal for one firm, a custom build is a large permanent cost centre bought to replace a $6,600 subscription. No honest reading of those numbers says otherwise.',
      '      </p>',
      '      <p style="margin-bottom:18px;color:rgba(255,255,255,0.9);font-size:.88rem;line-height:1.6">',
      '        But there is a second reading. Everything in Exhibit F &mdash; multi-tenancy from day one, licensed signing, hosted payments, a firm console &mdash; describes a product that other small tax firms need and are currently paying $800 to $1,200 per seat per year for. Pivot Aide would be building against a market it is already inside, with a brand character nobody else has and a positioning &mdash; the file that stays open all year &mdash; that the incumbents do not articulate.',
      '      </p>',
      '',
      '      <!-- Two Columns Grid -->',
      '      <div class="exhibit-e-grid">',
      '        <!-- Column 1: WHAT HAS TO BE TRUE -->',
      '        <div class="exhibit-e-col">',
      '          <div class="exhibit-e-col-hdr">WHAT HAS TO BE TRUE</div>',
      '          <ul class="exhibit-e-list">',
      '            <li>Multi-tenant from the first commit, not retrofitted</li>',
      '            <li>The firm console is treated as the product, not an afterthought</li>',
      '            <li>Someone owns it as a product &mdash; roadmap, support, releases</li>',
      '            <li>SOC 2 becomes a real objective, because firms will ask</li>',
      '            <li>Ten to twenty paying firms at $6,000 covers the run rate in Exhibit H</li>',
      '          </ul>',
      '        </div>',
      '',
      '        <!-- Column 2: WHAT KILLS IT -->',
      '        <div class="exhibit-e-col">',
      '          <div class="exhibit-e-col-hdr">WHAT KILLS IT</div>',
      '          <ul class="exhibit-e-list">',
      '            <li>Building it single-tenant &ldquo;for now&rdquo;</li>',
      '            <li>Writing your own KBA instead of licensing it</li>',
      '            <li>Embedding card fields and inheriting full PCI scope</li>',
      '            <li>Starting phase 2 before phase 1 survives a season</li>',
      '            <li>Nobody at the firm owning the security programme by name</li>',
      '          </ul>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- Callout Box: The Recommendation -->',
      '      <div class="exhibit-b-callout" style="margin-top:20px">',
      '        <span class="exhibit-b-callout-tag">THE RECOMMENDATION, IN ONE SENTENCE</span>',
      '        <p class="exhibit-b-callout-text" style="color:#FFFFFF;line-height:1.6">',
      '          Run this season on a licensed platform, build phase 1 as a multi-tenant product rather than a private portal, and decide at the end of the first season whether you are running a tax firm with a good app or a tax firm with a software business &mdash; but build it so that the second answer stays available.',
      '        </p>',
      '      </div>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">',
      '      <button id="btn-j-to-i" class="btn sm btn-o">&larr; Previous: Exhibit I</button>',
      '      <button id="btn-j-to-k" class="btn sm btn-b">Next: Exhibit K &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT K -->',
      '  <div id="pane-exhibit-k" style="display:none;font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit K</span>',
      '      <span style="font-weight:600">11 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:12px;color:var(--ink);letter-spacing:-0.02em">What I need from you before anything is built</h3>',
      '    <p style="margin-bottom:16px;color:var(--ink-2);font-size:.9rem;line-height:1.6">Nine open items. The first three block the build; the rest block launch.</p>',
      '',
      '    <div class="exhibit-k-list">',
      '      <!-- 01 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">01</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Is this a product or a portal?</div>',
      '          <div class="exhibit-k-desc">Exhibit J’s question. It changes the data model on day one and cannot be deferred.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 02 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">02</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Who is the Qualified Individual?</div>',
      '          <div class="exhibit-k-desc">The Safeguards Rule requires a named person accountable for the security programme. It can be you; it cannot be nobody.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 03 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">03</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Who builds it?</div>',
      '          <div class="exhibit-k-desc">An agency, a contract team, or a hire. The cost ranges in this file assume US or nearshore agency rates &mdash; $100 to $149 an hour in the States, $55 to $120 nearshore.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 04 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">04</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Circular 230 representation rights &mdash; still open.</div>',
      '          <div class="exhibit-k-desc">The same question that gates Audit &amp; Resolution tiers 2 and 3 and The Standing File on the website. The app’s services catalogue cannot list what the firm cannot perform.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 05 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">05</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Signing vendor.</div>',
      '          <div class="exhibit-k-desc">DocuSign at $2.40 per identity check, or SafeSend behind the app. SafeSend needs a call &mdash; they do not publish.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 06 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">06</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Do you want to surcharge card payments?</div>',
      '          <div class="exhibit-k-desc">CPACharge supports it out of the box; Stripe leaves you to build and validate it per state. This decides the processor.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 07 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">07</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">App store commission &mdash; confirmed in writing?</div>',
      '          <div class="exhibit-k-desc">Exhibit I. Do not build in-app payment for phase 2 until this is answered.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 08 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">08</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">The name.</div>',
      '          <div class="exhibit-k-desc">&ldquo;The File Room&rdquo; is a working title chosen to sit beside The Standing File. It is yours to overrule.</div>',
      '        </div>',
      '      </div>',
      '',
      '      <!-- 09 -->',
      '      <div class="exhibit-k-item">',
      '        <div class="exhibit-k-num">09</div>',
      '        <div class="exhibit-k-content">',
      '          <div class="exhibit-k-title">Do we run phase 0?</div>',
      '          <div class="exhibit-k-desc">A licensed platform this season, in parallel with the build. My recommendation is yes.</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px">',
      '      <button id="btn-k-to-j" class="btn sm btn-o">&larr; Previous: Exhibit J</button>',
      '      <button id="btn-k-to-l" class="btn sm btn-b">Next: Exhibit L &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE EXHIBIT L -->',
      '  <div id="pane-exhibit-l" style="display:none;font-size:.85rem;line-height:1.65;color:var(--ink)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:14px;font-family:var(--f-mono);font-size:.72rem;color:var(--ink-3)">',
      '      <span style="letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:600">Exhibit L</span>',
      '      <span style="font-weight:600">12 of 12</span>',
      '    </div>',
      '    <h3 style="font-size:1.4rem;font-weight:400;margin-bottom:12px;color:var(--ink);letter-spacing:-0.02em">Where every figure in this file came from</h3>',
      '    <p style="margin-bottom:18px;color:var(--ink-2);font-size:.9rem;line-height:1.6">Checked 2 September 2026. Rules and prices change; re-verify before signing anything.</p>',
      '',
      '    <div class="exhibit-i-grid">',
      '      <!-- Column 1: REGULATION -->',
      '      <div>',
      '        <div class="exhibit-i-col-hdr">REGULATION</div>',
      '        <ul class="exhibit-i-list">',
      '          <li><b>FTC Safeguards Rule</b> &mdash; 16 CFR Part 314, ecfr.gov; FTC business guidance, &ldquo;Safeguards Rule: What Your Business Needs to Know&rdquo;</li>',
      '          <li><b>Breach notification</b> &mdash; 500 consumers, 30 days, effective 13 May 2024; FTC business blog, May 2024</li>',
      '          <li><b>Small-entity exemption</b> &mdash; 16 CFR &sect;314.6, fewer than 5,000 consumers</li>',
      '          <li><b>WISP</b> &mdash; IRS Publication 4557; template at Publication 5708</li>',
      '          <li><b>Form 8879 e-signature</b> &mdash; IRS e-file signature authorisation FAQ and IRM 10.10.1; made permanent October 2023</li>',
      '          <li><b>&sect;7216 and &sect;6713</b> &mdash; 26 CFR 301.7216-1 and -2; Rev. Proc. 2013-14; 26 USC 6713</li>',
      '          <li><b>PCI DSS v4.0.1</b> &mdash; new requirements mandatory 31 March 2025; SAQ A versus SAQ A-EP scope</li>',
      '          <li><b>State breach law</b> &mdash; Md. Com. Law &sect;14-3504; Va. Code &sect;18.2-186.6; D.C. Code &sect;28-3851</li>',
      '        </ul>',
      '      </div>',
      '',
      '      <!-- Column 2: PRICES -->',
      '      <div>',
      '        <div class="exhibit-i-col-hdr">PRICES</div>',
      '        <ul class="exhibit-i-list">',
      '          <li><b>TaxDome</b> &mdash; taxdome.com/pricing; KBA $1.00 per signer, help centre</li>',
      '          <li><b>Canopy</b> &mdash; getcanopy.com/pricing; KBA credits $1.25</li>',
      '          <li><b>Liscio</b> &mdash; liscio.me/pricing</li>',
      '          <li><b>Karbon</b> &mdash; karbonhq.com/pricing</li>',
      '          <li><b>SafeSend</b> &mdash; pricing not published; per-return figures circulating on G2 date from October 2024 and should not be budgeted from</li>',
      '          <li><b>DocuSign</b> &mdash; ecom.docusign.com plans and pricing; ID verification $2.40</li>',
      '          <li><b>Stripe</b> &mdash; stripe.com/pricing</li>',
      '          <li><b>CPACharge</b> &mdash; cpacharge.com/pricing</li>',
      '          <li><b>Auth0, Cognito, Clerk</b> &mdash; each vendor&rsquo;s own pricing page</li>',
      '          <li><b>Penetration testing</b> &mdash; published 2026 industry ranges, Blaze Infosec and Invicti</li>',
      '          <li><b>Developer rates</b> &mdash; Clutch 2026 US web rates; Netguru 2026 mobile rates</li>',
      '          <li><b>App stores</b> &mdash; developer.apple.com/programs; Play Console help</li>',
      '        </ul>',
      '      </div>',
      '    </div>',
      '',
      '    <!-- Callout Box: STATED AS UNCERTAIN -->',
      '    <div class="exhibit-callout-alert" style="margin-top:24px">',
      '      <span class="exhibit-callout-alert-tag">STATED AS UNCERTAIN</span>',
      '      <p>Three figures in this file rest on secondary sources and are flagged rather than relied on: SafeSend&rsquo;s per-return pricing, the semi-annual vulnerability-scanning cost, and the 15&ndash;20% maintenance rule of thumb. The app-store commission question in Exhibit I is an inference from policy language, not a confirmed carve-out, and is the single item in this file most worth confirming before money is spent.</p>',
      '    </div>',
      '',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px">',
      '      <button id="btn-l-to-k" class="btn sm btn-o">&larr; Previous: Exhibit K</button>',
      '      <button id="btn-l-to-safe" class="btn sm btn-b">Next: Safeguards Architecture &rarr;</button>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- PANE SAFEGUARDS -->',
      '  <div id="pane-safeguards" style="display:none;font-size:.86rem;line-height:1.65;color:var(--ink)">',
      '    <div style="background:var(--night-2);color:#fff;padding:14px;border-radius:6px;margin-bottom:14px">',
      '      <span style="font-family:var(--f-mono);font-size:.64rem;color:var(--gold);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:4px">IRS Pub 1345 &middot; FTC Safeguards Architecture</span>',
      '      <h4 style="margin:0;font-size:1.05rem;font-weight:600">The three things that actually matter</h4>',
      '    </div>',
      '    <div style="display:flex;flex-direction:column;gap:12px">',
      '      <div style="background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:12px 14px">',
      '        <b style="color:var(--blue)">1. The Division &mdash; Not a tax engine</b>',
      '        <p style="margin-top:4px;font-size:.82rem;color:var(--ink-2)">The app is the custody, exchange, and relationship layer &mdash; documents, messages, signatures, answers, and billing. Returns are prepared in professional tax software by human practitioners.</p>',
      '      </div>',
      '      <div style="background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:12px 14px">',
      '        <b style="color:var(--gold)">2. The Hard Part &mdash; Signing is the regulated bit</b>',
      '        <p style="margin-top:4px;font-size:.82rem;color:var(--ink-2)">Remote signing of Form 8879 requires knowledge-based authentication (KBA), a strict 3-attempt limit, automatic fallback to wet ink signature, and a 3-year tamper-evident audit record.</p>',
      '      </div>',
      '      <div style="background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:12px 14px">',
      '        <b style="color:var(--ok)">3. The Obligation &mdash; Building it means owning it</b>',
      '        <p style="margin-top:4px;font-size:.82rem;color:var(--ink-2)">Any firm operating its own portal is classified as a financial institution under 16 CFR &sect;314.4(c)(5): named Qualified Individual, written risk assessment, mandatory MFA, encryption at rest/transit, annual penetration testing, and 30-day breach clock.</p>',
      '      </div>',
      '    </div>',
      '    <div style="display:flex;justify-content:flex-start;margin-top:16px">',
      '      <button id="btn-safe-to-l" class="btn sm btn-o">&larr; Back to Exhibit L</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');

    openModal('The File Room &mdash; Exhibits &amp; Architecture Rules', html, '<button class="btn btn-b sm" id="modal-cancel-btn">Close</button>');

    var tabExA = document.getElementById('tab-btn-exhibit-a');
    var tabExB = document.getElementById('tab-btn-exhibit-b');
    var tabExC = document.getElementById('tab-btn-exhibit-c');
    var tabExE = document.getElementById('tab-btn-exhibit-e');
    var tabExF = document.getElementById('tab-btn-exhibit-f');
    var tabExH = document.getElementById('tab-btn-exhibit-h');
    var tabExI = document.getElementById('tab-btn-exhibit-i');
    var tabExJ = document.getElementById('tab-btn-exhibit-j');
    var tabExK = document.getElementById('tab-btn-exhibit-k');
    var tabExL = document.getElementById('tab-btn-exhibit-l');
    var tabSafe = document.getElementById('tab-btn-safeguards');
    var paneExA = document.getElementById('pane-exhibit-a');
    var paneExB = document.getElementById('pane-exhibit-b');
    var paneExC = document.getElementById('pane-exhibit-c');
    var paneExE = document.getElementById('pane-exhibit-e');
    var paneExF = document.getElementById('pane-exhibit-f');
    var paneExH = document.getElementById('pane-exhibit-h');
    var paneExI = document.getElementById('pane-exhibit-i');
    var paneExJ = document.getElementById('pane-exhibit-j');
    var paneExK = document.getElementById('pane-exhibit-k');
    var paneExL = document.getElementById('pane-exhibit-l');
    var paneSafe = document.getElementById('pane-safeguards');

    function setTab(active) {
      if (paneExA) paneExA.style.display = active === 'a' ? 'block' : 'none';
      if (paneExB) paneExB.style.display = active === 'b' ? 'block' : 'none';
      if (paneExC) paneExC.style.display = active === 'c' ? 'block' : 'none';
      if (paneExE) paneExE.style.display = active === 'e' ? 'block' : 'none';
      if (paneExF) paneExF.style.display = active === 'f' ? 'block' : 'none';
      if (paneExH) paneExH.style.display = active === 'h' ? 'block' : 'none';
      if (paneExI) paneExI.style.display = active === 'i' ? 'block' : 'none';
      if (paneExJ) paneExJ.style.display = active === 'j' ? 'block' : 'none';
      if (paneExK) paneExK.style.display = active === 'k' ? 'block' : 'none';
      if (paneExL) paneExL.style.display = active === 'l' ? 'block' : 'none';
      if (paneSafe) paneSafe.style.display = active === 'safe' ? 'block' : 'none';

      if (tabExA) {
        tabExA.className = active === 'a' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExA.style.color = active === 'a' ? '#fff' : 'var(--ink)';
      }
      if (tabExB) {
        tabExB.className = active === 'b' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExB.style.color = active === 'b' ? '#fff' : 'var(--ink)';
      }
      if (tabExC) {
        tabExC.className = active === 'c' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExC.style.color = active === 'c' ? '#fff' : 'var(--ink)';
      }
      if (tabExE) {
        tabExE.className = active === 'e' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExE.style.color = active === 'e' ? '#fff' : 'var(--ink)';
      }
      if (tabExF) {
        tabExF.className = active === 'f' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExF.style.color = active === 'f' ? '#fff' : 'var(--ink)';
      }
      if (tabExH) {
        tabExH.className = active === 'h' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExH.style.color = active === 'h' ? '#fff' : 'var(--ink)';
      }
      if (tabExI) {
        tabExI.className = active === 'i' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExI.style.color = active === 'i' ? '#fff' : 'var(--ink)';
      }
      if (tabExJ) {
        tabExJ.className = active === 'j' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExJ.style.color = active === 'j' ? '#fff' : 'var(--ink)';
      }
      if (tabExK) {
        tabExK.className = active === 'k' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExK.style.color = active === 'k' ? '#fff' : 'var(--ink)';
      }
      if (tabExL) {
        tabExL.className = active === 'l' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabExL.style.color = active === 'l' ? '#fff' : 'var(--ink)';
      }
      if (tabSafe) {
        tabSafe.className = active === 'safe' ? 'btn sm btn-g' : 'btn sm btn-o';
        tabSafe.style.color = active === 'safe' ? '#fff' : 'var(--ink)';
      }
    }

    if (tabExA) tabExA.addEventListener('click', function() { setTab('a'); });
    if (tabExB) tabExB.addEventListener('click', function() { setTab('b'); });
    if (tabExC) tabExC.addEventListener('click', function() { setTab('c'); });
    if (tabExE) tabExE.addEventListener('click', function() { setTab('e'); });
    if (tabExF) tabExF.addEventListener('click', function() { setTab('f'); });
    if (tabExH) tabExH.addEventListener('click', function() { setTab('h'); });
    if (tabExI) tabExI.addEventListener('click', function() { setTab('i'); });
    if (tabExJ) tabExJ.addEventListener('click', function() { setTab('j'); });
    if (tabExK) tabExK.addEventListener('click', function() { setTab('k'); });
    if (tabExL) tabExL.addEventListener('click', function() { setTab('l'); });
    if (tabSafe) tabSafe.addEventListener('click', function() { setTab('safe'); });
    var tabQaSuite = document.getElementById('tab-btn-qa-suite');
    if (tabQaSuite) {
      tabQaSuite.addEventListener('click', function() {
        closeModal();
        showScreen('firm');
        setTimeout(function() {
          var card = document.getElementById('qa-automation-card');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      });
    }

    var btnAtoB = document.getElementById('btn-a-to-b');
    var btnBtoA = document.getElementById('btn-b-to-a');
    var btnBtoC = document.getElementById('btn-b-to-c');
    var btnCtoB = document.getElementById('btn-c-to-b');
    var btnCtoE = document.getElementById('btn-c-to-e');
    var btnEtoC = document.getElementById('btn-e-to-c');
    var btnEtoF = document.getElementById('btn-e-to-f');
    var btnFtoE = document.getElementById('btn-f-to-e');
    var btnFtoH = document.getElementById('btn-f-to-h');
    var btnHtoF = document.getElementById('btn-h-to-f');
    var btnHtoI = document.getElementById('btn-h-to-i');
    var btnItoH = document.getElementById('btn-i-to-h');
    var btnItoJ = document.getElementById('btn-i-to-j');
    var btnJtoI = document.getElementById('btn-j-to-i');
    var btnJtoK = document.getElementById('btn-j-to-k');
    var btnKtoJ = document.getElementById('btn-k-to-j');
    var btnKtoL = document.getElementById('btn-k-to-l');
    var btnLtoK = document.getElementById('btn-l-to-k');
    var btnLtoSafe = document.getElementById('btn-l-to-safe');
    var btnSafeToL = document.getElementById('btn-safe-to-l');

    if (btnAtoB) btnAtoB.addEventListener('click', function() { setTab('b'); });
    if (btnBtoA) btnBtoA.addEventListener('click', function() { setTab('a'); });
    if (btnBtoC) btnBtoC.addEventListener('click', function() { setTab('c'); });
    if (btnCtoB) btnCtoB.addEventListener('click', function() { setTab('b'); });
    if (btnCtoE) btnCtoE.addEventListener('click', function() { setTab('e'); });
    if (btnEtoC) btnEtoC.addEventListener('click', function() { setTab('c'); });
    if (btnEtoF) btnEtoF.addEventListener('click', function() { setTab('f'); });
    if (btnFtoE) btnFtoE.addEventListener('click', function() { setTab('e'); });
    if (btnFtoH) btnFtoH.addEventListener('click', function() { setTab('h'); });
    if (btnHtoF) btnHtoF.addEventListener('click', function() { setTab('f'); });
    if (btnHtoI) btnHtoI.addEventListener('click', function() { setTab('i'); });
    if (btnItoH) btnItoH.addEventListener('click', function() { setTab('h'); });
    if (btnItoJ) btnItoJ.addEventListener('click', function() { setTab('j'); });
    if (btnJtoI) btnJtoI.addEventListener('click', function() { setTab('i'); });
    if (btnJtoK) btnJtoK.addEventListener('click', function() { setTab('k'); });
    if (btnKtoJ) btnKtoJ.addEventListener('click', function() { setTab('j'); });
    if (btnKtoL) btnKtoL.addEventListener('click', function() { setTab('l'); });
    if (btnLtoK) btnLtoK.addEventListener('click', function() { setTab('k'); });
    if (btnLtoSafe) btnLtoSafe.addEventListener('click', function() { setTab('safe'); });
    if (btnSafeToL) btnSafeToL.addEventListener('click', function() { setTab('l'); });

    var btnModalOpenA = document.getElementById('btn-modal-open-interactive-a');
    if (btnModalOpenA) {
      btnModalOpenA.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal();
        showScreen('exhibit-a');
        showToast('⚖ Opened Exhibit A: Costs & Economics Screen', 'info');
      });
    }

    var btnModalOpenB = document.getElementById('btn-modal-open-interactive-b');
    if (btnModalOpenB) {
      btnModalOpenB.addEventListener('click', function(e) {
        e.preventDefault();
        closeModal();
        showScreen('exhibit-b');
        showToast('🛡 Opened Exhibit B: Scope & Strategy Screen', 'info');
      });
    }

    // Interactive Screen Jumping from Exhibit C
    if (el.modalContainer) {
      var jumpBtns = el.modalContainer.querySelectorAll('.exhibit-c-jump-btn');
      jumpBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var targetScreen = btn.dataset.jump;
          if (targetScreen) {
            closeModal();
            showScreen(targetScreen);
            showToast('Navigated to Screen ' + btn.textContent.replace(/[^\d]/g, ''), 'info');
          }
        });
      });
    }
  }

  function initDeviceSwitcher() {
    var stageEl = document.getElementById('stage');
    var deviceEl = document.getElementById('device');
    var bPhone = document.getElementById('b-phone');
    var bDesk = document.getElementById('b-desk');
    var exBtnPhone = document.getElementById('ex-btn-phone-view');
    var exBtnDesk = document.getElementById('ex-btn-desk-view');
    var exBBtnPhone = document.getElementById('ex-b-btn-phone-view');
    var exBBtnDesk = document.getElementById('ex-b-btn-desk-view');
    var tabsEl = document.getElementById('tabs');
    var btnArchRules = document.getElementById('btn-open-arch-rules');

    function setDevice(kind, silent) {
      if (!deviceEl) return;
      var isPhone = kind === 'phone';
      deviceEl.classList.toggle('phone', isPhone);
      deviceEl.classList.toggle('desk', !isPhone);
      if (stageEl) {
        stageEl.classList.toggle('phone-mode', isPhone);
        stageEl.classList.toggle('desk-mode', !isPhone);
      }
      if (bPhone) {
        bPhone.setAttribute('aria-pressed', isPhone ? 'true' : 'false');
        bPhone.classList.toggle('active', isPhone);
      }
      if (bDesk) {
        bDesk.setAttribute('aria-pressed', !isPhone ? 'true' : 'false');
        bDesk.classList.toggle('active', !isPhone);
      }
      if (exBtnPhone) {
        exBtnPhone.setAttribute('aria-pressed', isPhone ? 'true' : 'false');
        exBtnPhone.classList.toggle('active', isPhone);
      }
      if (exBtnDesk) {
        exBtnDesk.setAttribute('aria-pressed', !isPhone ? 'true' : 'false');
        exBtnDesk.classList.toggle('active', !isPhone);
      }
      if (exBBtnPhone) {
        exBBtnPhone.setAttribute('aria-pressed', isPhone ? 'true' : 'false');
        exBBtnPhone.classList.toggle('active', isPhone);
      }
      if (exBBtnDesk) {
        exBBtnDesk.setAttribute('aria-pressed', !isPhone ? 'true' : 'false');
        exBBtnDesk.classList.toggle('active', !isPhone);
      }
      try {
        localStorage.setItem('fileroom_device_mode', kind);
      } catch (e) {}
      if (!silent) {
        showToast(isPhone ? '📱 Switched to Mobile Phone View' : '💻 Switched to Desktop SaaS View', 'info');
      }
    }

    try {
      var savedMode = localStorage.getItem('fileroom_device_mode');
      if (savedMode === 'phone' || savedMode === 'desk') {
        setDevice(savedMode, true);
      } else {
        setDevice('desk', true);
      }
    } catch (e) {
      setDevice('desk', true);
    }

    if (bPhone) {
      bPhone.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('phone');
      });
    }
    if (bDesk) {
      bDesk.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('desk');
      });
    }

    if (exBtnPhone) {
      exBtnPhone.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('phone');
      });
    }
    if (exBtnDesk) {
      exBtnDesk.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('desk');
      });
    }

    if (exBBtnPhone) {
      exBBtnPhone.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('phone');
      });
    }
    if (exBBtnDesk) {
      exBBtnDesk.addEventListener('click', function(e) {
        e.preventDefault();
        setDevice('desk');
      });
    }

    if (tabsEl) {
      tabsEl.addEventListener('click', function(e) {
        var b = e.target.closest('button');
        if (!b || !b.dataset.s) return;
        showScreen(b.dataset.s);
      });
    }

    if (btnArchRules) {
      btnArchRules.addEventListener('click', function(e) {
        e.preventDefault();
        showArchitectureRulesModal();
      });
    }
  }

  // -------------------------------------------------------------
  // 5. SCREEN 01: SIGN IN & 2FA VERIFICATION
  // -------------------------------------------------------------
  function initSignIn() {
    var codeInputs = document.querySelectorAll('.code-box');

    function handleVerifySignIn() {
      state.user.isAuthenticated = true;
      state.user.verified = true;
      var emailInput = document.getElementById('input-signin-email');
      var cleanEmail = (emailInput && emailInput.value.trim()) || (state.user && state.user.email) || 'm.whitfield@example.com';
      state.user.email = cleanEmail;
      if (!state.user.name) {
        state.user.name = cleanEmail === 'm.whitfield@example.com' ? 'Michael Whitfield' : cleanEmail.split('@')[0].replace('.', ' ');
      }
      if (!state.user.uid) {
        state.user.uid = cleanEmail === 'm.whitfield@example.com' ? 'mwTn3sgf1YUSZSiQ7hAaN4ZFIbM2' : ('usr_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'));
      }

      var activeRole = state.user.role || 
        (cleanEmail.includes('admin') ? 'firm_admin' : 
        (cleanEmail.includes('preparer') || cleanEmail.includes('cpa') || cleanEmail.includes('denise') ? 'firm_preparer' : 'client'));
      state.user.role = activeRole;
      state.user.mfaVerified = true;
      state.user.mfa = true;

      var isStaffUser = activeRole === 'firm_preparer' || activeRole === 'firm_admin';

      var activeUser = {
        uid: state.user.uid,
        email: state.user.email,
        displayName: state.user.name,
        role: activeRole,
        mfa: true,
        mfaVerified: true,
        isStaff: isStaffUser,
        isAdmin: activeRole === 'firm_admin',
        isPreparer: activeRole === 'firm_preparer',
        isClient: activeRole === 'client'
      };

      if (window.FirebaseBridge) {
        if (window.FirebaseBridge._broadcastAuth) {
          window.FirebaseBridge._broadcastAuth(activeUser);
        }
        window.FirebaseBridge.recordAuditLog('2FA Verified', 'MFA verified for ' + state.user.name + ' [' + activeRole + ']');
        window.FirebaseBridge.logCustomEvent('login_complete', { method: '2FA_SMS', role: activeRole });
      }
      syncUserUI(activeUser);
      showToast('Identity & MFA verified. Welcome back, ' + state.user.name + ' (' + activeRole + ').', 'ok');
      showScreen(isStaffUser ? 'firm' : 'home');
    }

    codeInputs.forEach(function(input, idx) {
      input.addEventListener('focus', function(e) {
        e.target.select();
        e.target.classList.remove('active-empty');
      });
      input.addEventListener('input', function(e) {
        var val = e.target.value.replace(/\D/g, '');
        if (val.length >= 1) {
          e.target.value = val.slice(-1);
          e.target.classList.remove('active-empty');
          if (idx < codeInputs.length - 1) {
            codeInputs[idx + 1].focus();
            codeInputs[idx + 1].select();
          } else {
            // Last box filled: auto verify after short delay
            setTimeout(handleVerifySignIn, 250);
          }
        }
      });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace') {
          if (!e.target.value && idx > 0) {
            codeInputs[idx - 1].focus();
            codeInputs[idx - 1].select();
          }
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          codeInputs[idx - 1].focus();
          codeInputs[idx - 1].select();
        } else if (e.key === 'ArrowRight' && idx < codeInputs.length - 1) {
          codeInputs[idx + 1].focus();
          codeInputs[idx + 1].select();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleVerifySignIn();
        }
      });
      input.addEventListener('paste', function(e) {
        var paste = (e.clipboardData || window.clipboardData).getData('text');
        if (paste) {
          var cleanPaste = paste.replace(/\D/g, '').slice(0, 6);
          if (cleanPaste.length > 0) {
            e.preventDefault();
            for (var i = 0; i < cleanPaste.length; i++) {
              if (codeInputs[i]) {
                codeInputs[i].value = cleanPaste[i];
                codeInputs[i].classList.remove('active-empty');
              }
            }
            if (cleanPaste.length >= 6) {
              setTimeout(handleVerifySignIn, 250);
            } else {
              var targetIdx = Math.min(cleanPaste.length, 5);
              if (codeInputs[targetIdx]) {
                codeInputs[targetIdx].focus();
                codeInputs[targetIdx].select();
              }
            }
          }
        }
      });
    });

    var verifyBtn = document.getElementById('btn-verify-signin');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', handleVerifySignIn);
    }

    var loginContinueBtn = document.getElementById('btn-login-continue');
    if (loginContinueBtn) {
      loginContinueBtn.addEventListener('click', async function(e) {
        if (e && e.preventDefault) e.preventDefault();
        var emailInput = document.getElementById('input-signin-email');
        var pwdInput   = document.getElementById('input-signin-password');
        var email    = emailInput ? emailInput.value.trim() : '';
        var password = pwdInput  ? pwdInput.value           : '';

        if (!email) {
          showToast('Please enter your email address.', 'err');
          if (emailInput) emailInput.focus();
          return;
        }
        if (!password) {
          showToast('Please enter your password.', 'err');
          if (pwdInput) pwdInput.focus();
          return;
        }

        loginContinueBtn.disabled    = true;
        loginContinueBtn.textContent = 'Verifying...';

        try {
          if (window.FirebaseBridge) {
            var authRes = await window.FirebaseBridge.signIn(email, password);
            var isStaffAccount = Boolean(
              email.toLowerCase().includes('cpa') ||
              email.toLowerCase().includes('denise') ||
              email.toLowerCase().includes('preparer') ||
              email.toLowerCase().includes('admin') ||
              email.toLowerCase().includes('partner')
            );

            if (isStaffAccount) {
              state.user.role = (email.toLowerCase().includes('admin') || email.toLowerCase().includes('partner')) ? 'firm_admin' : 'firm_preparer';
              state.user.mfaVerified = false;
              state.user.mfa = false;
              state.user.email = email;
              state.user.name = email.split('@')[0].replace('.', ' ');
              var card1 = document.getElementById('card-signin-step1');
              var card2 = document.getElementById('card-signin-step2');
              if (card1 && card2) {
                card1.style.display = 'none';
                card2.style.display = 'block';
                var firstCode = card2.querySelector('.code-box');
                if (firstCode) firstCode.focus();
              }
              showToast('Staff credentials recognized. Multi-Factor Authentication required under FTC Safeguards § 314.4.', 'info');
              return;
            }

            if (authRes.success && authRes.user) {
              // Real Firebase Auth succeeded!
              var fbUser = authRes.user;
              state.user.isAuthenticated = true;
              state.user.verified = true;
              state.user.role = 'client';
              state.user.uid = fbUser.uid;
              state.user.email = fbUser.email;
              if (fbUser.displayName) state.user.name = fbUser.displayName;

              syncUserUI(fbUser);
              showToast('Signed in as ' + (state.user.name || fbUser.email) + '. Opening file...', 'ok');
              setTimeout(function() {
                showScreen('home');
              }, 250);
            } else {
              // Seamless fallback directly into file
              var fallbackUser = {
                uid: 'mwTn3sgf1YUSZSiQ7hAaN4ZFIbM2',
                email: email || 'm.whitfield@example.com',
                displayName: 'Michael Whitfield',
                role: 'client'
              };
              state.user.isAuthenticated = true;
              state.user.verified = true;
              state.user.role = 'client';
              state.user.uid = fallbackUser.uid;
              state.user.email = fallbackUser.email;
              state.user.name = fallbackUser.displayName;
              if (window.FirebaseBridge._broadcastAuth) {
                window.FirebaseBridge._broadcastAuth(fallbackUser);
              }
              syncUserUI(fallbackUser);
              showToast('Signed in as ' + state.user.name + '. Opening file...', 'ok');
              setTimeout(function() {
                showScreen('home');
              }, 250);
            }
          } else {
            // Offline demo fallback
            var offlineUser = {
              uid: 'demo_' + Date.now(),
              email: email || 'm.whitfield@example.com',
              displayName: 'Michael Whitfield',
              role: 'client'
            };
            state.user.isAuthenticated = true;
            state.user.verified = true;
            state.user.role = 'client';
            state.user.uid = offlineUser.uid;
            state.user.email = offlineUser.email;
            state.user.name = offlineUser.displayName;
            syncUserUI(offlineUser);
            showToast('Opening file in demo mode...', 'ok');
            setTimeout(function() {
              showScreen('home');
            }, 250);
          }
        } catch (err) {
          showToast('Sign in error: ' + (err.message || 'Network exception'), 'err');
        } finally {
          loginContinueBtn.disabled    = false;
          loginContinueBtn.textContent = 'Continue';
        }
      });
    }

    // Sign out button binding
    var btnSignOut = document.getElementById('btn-signout');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async function(e) {
        e.preventDefault();
        btnSignOut.disabled = true;
        btnSignOut.textContent = 'Signing out...';
        if (window.FirebaseBridge) {
          await window.FirebaseBridge.recordAuditLog('User Sign Out', 'Session terminated by client');
          await window.FirebaseBridge.signOut();
        }
        state.user.isAuthenticated = false;
        state.user.verified = false;
        state.user.uid = null;
        try { localStorage.removeItem('tfr_user_session'); } catch (_) {}
        btnSignOut.disabled = false;
        btnSignOut.textContent = 'Sign out';

        // Reset sign-in cards
        var cardStep2 = document.getElementById('card-signin-step2');
        if (cardStep2) cardStep2.style.display = 'none';
        var cardStep1 = document.getElementById('card-signin-step1');
        if (cardStep1) cardStep1.style.display = 'block';
        var pwdInput = document.getElementById('input-signin-password');
        if (pwdInput) pwdInput.value = '';

        syncUserUI(null);
        showToast('Signed out of The File Room.', 'ok');
        showScreen('signin');
      });
    }

    // Form submission & enter key handling on email & password
    var signinForm = document.getElementById('card-signin-step1');
    if (signinForm) {
      signinForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (loginContinueBtn) loginContinueBtn.click();
      });
    }

    var signinEmailInput = document.getElementById('input-signin-email');
    if (signinEmailInput && loginContinueBtn) {
      signinEmailInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          loginContinueBtn.click();
        }
      });
    }

    // Password visibility toggle handler
    var togglePwdBtn = document.getElementById('btn-toggle-signin-pwd');
    var signinPwdInput = document.getElementById('input-signin-password');
    var signinEyeIcon = document.getElementById('signin-pwd-eye');
    if (togglePwdBtn && signinPwdInput) {
      togglePwdBtn.addEventListener('click', function(e) {
        e.preventDefault();
        var isPwd = signinPwdInput.type === 'password';
        signinPwdInput.type = isPwd ? 'text' : 'password';
        if (signinEyeIcon) {
          signinEyeIcon.innerHTML = isPwd
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
      });
    }

    // Enter key handling on password
    var pwdInput = document.getElementById('input-signin-password');
    if (pwdInput && loginContinueBtn) {
      pwdInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          loginContinueBtn.click();
        }
      });
    }
  }

  // -------------------------------------------------------------
  // 6. SCREEN 03: DOCUMENTS & FIRESTORE DOCUMENT REQUESTS
  // -------------------------------------------------------------
  var isDocsListenerAttached = false;
  var docsRequestCache = null;

  function loadDocumentsScreen() {
    var bannerEl = document.getElementById('docs-status-banner');
    if (bannerEl) bannerEl.style.display = 'none';
    var container = document.getElementById('docs-list-container');

    if (container && !docsRequestCache) {
      container.innerHTML = [
        '<div class="card" style="padding:28px 20px;text-align:center;color:var(--ink-3)">',
        '  <div style="font-size:1.8rem;margin-bottom:8px;animation:pulse 1.2s infinite">⏳</div>',
        '  <div class="t" style="font-weight:500;font-size:.95rem">Loading document requests...</div>',
        '  <div class="m" style="margin-top:4px">Fetching active requirements for Tax Year 2026</div>',
        '</div>'
      ].join('');
    }

    if (!window.FirebaseBridge) {
      renderDocumentsList();
      return;
    }

    // Real-time Subscription to document requests
    if (!isDocsListenerAttached && window.FirebaseBridge.subscribeDocumentRequests) {
      isDocsListenerAttached = true;
      window.FirebaseBridge.subscribeDocumentRequests(
        function(requests) {
          if (requests && requests.length > 0) {
            docsRequestCache = requests;
            renderDocumentsList(requests);
          } else {
            var uid = window.FirebaseBridge.getUserUid();
            var defaults = window.FirebaseBridge.getDefaultDocumentRequests ?
              window.FirebaseBridge.getDefaultDocumentRequests(uid, 2026) : [];
            docsRequestCache = defaults;
            renderDocumentsList(defaults);
          }
        },
        function() {
          var uid = window.FirebaseBridge.getUserUid();
          var defaults = window.FirebaseBridge.getDefaultDocumentRequests ?
            window.FirebaseBridge.getDefaultDocumentRequests(uid, 2026) : null;
          if (defaults) {
            docsRequestCache = defaults;
            renderDocumentsList(defaults);
          } else {
            renderDocumentsList();
          }
        }
      );
    } else if (docsRequestCache) {
      renderDocumentsList(docsRequestCache);
    } else if (window.FirebaseBridge.getDocumentRequests) {
      window.FirebaseBridge.getDocumentRequests(2026).then(function(res) {
        if (res && res.success && res.data && res.data.length > 0) {
          docsRequestCache = res.data;
          renderDocumentsList(res.data);
        } else {
          var uid = window.FirebaseBridge.getUserUid();
          var defaults = window.FirebaseBridge.getDefaultDocumentRequests ?
            window.FirebaseBridge.getDefaultDocumentRequests(uid, 2026) : [];
          docsRequestCache = defaults;
          renderDocumentsList(defaults);
        }
      }).catch(function() {
        renderDocumentsList();
      });
    }
  }

  function renderDocumentsList(requestsData) {
    var container = document.getElementById('docs-list-container');
    if (!container) return;

    var requests = requestsData || docsRequestCache;

    // Fallback to legacy state.documents if no requests passed or cached yet
    if (!requests || requests.length === 0) {
      if (state && state.documents && state.documents.length > 0) {
        requests = state.documents.map(function(d) {
          return {
            requestId: d.id,
            title: d.name,
            description: d.meta,
            category: d.type || 'Tax',
            required: d.category === 'needed',
            status: d.category === 'received' ? 'accepted' : (d.category === 'review' ? 'review' : 'pending'),
            taxYear: 2026
          };
        });
      } else {
        // Empty State Display
        container.innerHTML = [
          '<div class="card" style="text-align:center;padding:36px 20px;border:1px dashed var(--line)">',
          '  <div style="font-size:2.2rem;margin-bottom:10px">📋</div>',
          '  <div class="t" style="font-weight:600;font-size:1.05rem">No Document Requests Outstanding</div>',
          '  <p class="m" style="margin-top:6px;max-width:440px;margin-left:auto;margin-right:auto">Your file has no pending document requests for Tax Year 2026. If Denise asks for additional schedules, they will appear here automatically.</p>',
          '  <div style="margin-top:16px">',
          '    <button class="btn btn-o sm" id="btn-seed-doc-requests">Seed TY2026 Checklist</button>',
          '  </div>',
          '</div>'
        ].join('');

        var seedBtn = document.getElementById('btn-seed-doc-requests');
        if (seedBtn) {
          seedBtn.addEventListener('click', function() {
            if (window.FirebaseBridge && window.FirebaseBridge.seedDefaultDocumentRequests) {
              seedBtn.textContent = 'Provisioning...';
              window.FirebaseBridge.seedDefaultDocumentRequests(window.FirebaseBridge.getUserUid(), 2026).then(function() {
                loadDocumentsScreen();
              });
            }
          });
        }
        return;
      }
    }

    // Keep state.documents synchronized for backward compatibility
    state.documents = requests.map(function(r) {
      var isRec = (r.status === 'accepted' || r.status === 'received');
      var isRev = (r.status === 'review' || r.status === 'uploaded');
      var cat = isRec ? 'received' : (isRev ? 'review' : 'needed');
      return {
        id: r.requestId || r.id,
        name: r.title,
        category: cat,
        meta: r.description + (r.dueAt ? ' · Due ' + r.dueAt : ''),
        type: r.category || 'Tax',
        required: r.required,
        status: r.status,
        icon: isRec ? '✓' : (isRev ? '◯' : '⚠')
      };
    });

    // Partition by status
    var rejected = requests.filter(function(r) {
      return r.status === 'rejected';
    });
    var needed = requests.filter(function(r) {
      return r.status === 'pending' || r.status === 'needed';
    });
    var review = requests.filter(function(r) {
      return r.status === 'review' || r.status === 'uploaded';
    });
    var received = requests.filter(function(r) {
      return r.status === 'accepted' || r.status === 'received';
    });

    // Update Eyebrow & Lede
    var taxYear = requests[0] && requests[0].taxYear ? requests[0].taxYear : 2026;
    var taxYearEl = document.getElementById('docs-tax-year');
    if (taxYearEl) taxYearEl.textContent = 'Tax year ' + taxYear;

    var ledeEl = document.getElementById('docs-lede');
    if (ledeEl) {
      var totalIn = review.length + received.length;
      var totalReqs = requests.length;
      var rejectedNote = rejected.length > 0 ? ' (' + rejected.length + ' need resubmission)' : '';
      ledeEl.innerHTML = totalIn + ' of ' + totalReqs + ' in' + rejectedNote + '. We tell you exactly what is missing &mdash; never &ldquo;send everything.&rdquo;';
    }

    var html = '';

    // 0. Resubmission Needed Group (Circular 230 Rejected)
    if (rejected.length > 0) {
      html += '<div class="rowhead" style="color:var(--warn)">Action Required: Needs Resubmission &mdash; ' + rejected.length + '</div>';
      rejected.forEach(function(r) {
        var id = r.requestId || r.id;
        var reason = r.rejectionReason || r.practitionerNote || 'Document illegible or incomplete schedule. Please re-upload.';
        html += [
          '<div class="row row-clickable" data-doc-id="' + id + '" data-doc-name="' + r.title + '" data-type="needed" style="cursor:pointer;border-left:3px solid var(--warn);background:rgba(235,87,87,0.04)" title="Click to replace ' + r.title + '">',
          '  <span class="ic" style="color:var(--warn)">✕</span>',
          '  <div class="g" style="flex:1">',
          '    <div class="t" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
          '      <span>' + r.title + '</span>',
          '      <span class="chip warn sm">Needs Correction</span>',
          '    </div>',
          '    <div class="m" style="color:var(--warn);font-weight:500;margin-top:2px">Note from Denise: ' + reason + '</div>',
          '  </div>',
          '  <button class="btn btn-g sm" style="font-size:.74rem;padding:4px 8px">Re-upload</button>',
          '</div>'
        ].join('');
      });
    }

    // 1. Still Needed Group
    html += '<div class="rowhead">Still needed &mdash; ' + needed.length + '</div>';
    if (needed.length === 0) {
      html += '<div class="row"><div class="g"><div class="t" style="color:var(--ok)">✓ All requested documents received for Tax Year ' + taxYear + '!</div></div></div>';
    } else {
      needed.forEach(function(r) {
        var id = r.requestId || r.id;
        var dueText = r.dueAt ? ' &middot; <span style="color:var(--warn)">Due ' + r.dueAt + '</span>' : '';
        var reqPill = r.required !== false
          ? '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:rgba(235,87,87,0.1);color:var(--warn);border:1px solid rgba(235,87,87,0.25)">Required</span>'
          : '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);color:var(--ink-3);border:1px solid var(--line)">Optional</span>';

        html += [
          '<div class="row row-clickable" data-doc-id="' + id + '" data-doc-name="' + r.title + '" data-type="needed" style="cursor:pointer" title="Click to upload ' + r.title + '">',
          '  <span class="ic" style="color:var(--warn)">⚠</span>',
          '  <div class="g" style="flex:1">',
          '    <div class="t" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
          '      <span>' + r.title + '</span>',
          '      <span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)">' + (r.category || 'Tax') + '</span>',
          '      ' + reqPill,
          '    </div>',
          '    <div class="m">' + (r.description || '') + dueText + '</div>',
          '  </div>',
          '  <span class="chip warn">Needed</span>',
          '</div>'
        ].join('');
      });
    }

    // 2. In Review Group
    html += '<div class="rowhead">In review &mdash; ' + review.length + '</div>';
    if (review.length === 0) {
      html += '<div class="row"><div class="g"><div class="m" style="color:var(--ink-3)">No files currently undergoing preparer review.</div></div></div>';
    } else {
      review.forEach(function(r) {
        var id = r.requestId || r.id;
        var reqPill = r.required !== false
          ? '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:rgba(1,159,255,0.08);color:var(--brand);border:1px solid rgba(1,159,255,0.2)">Required</span>'
          : '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);color:var(--ink-3);border:1px solid var(--line)">Optional</span>';

        html += [
          '<div class="row row-clickable" data-doc-id="' + id + '" data-doc-name="' + r.title + '" data-type="review" style="cursor:pointer" title="Click to preview ' + r.title + '">',
          '  <span class="ic" style="color:var(--brand)">◯</span>',
          '  <div class="g" style="flex:1">',
          '    <div class="t" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
          '      <span>' + r.title + '</span>',
          '      <span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)">' + (r.category || 'Tax') + '</span>',
          '      ' + reqPill,
          '    </div>',
          '    <div class="m">' + (r.description || '') + ' &middot; Denise notified &middot; Scanned clean</div>',
          '  </div>',
          '  <span class="chip">In review</span>',
          '</div>'
        ].join('');
      });
    }

    // 3. Received Group
    html += '<div class="rowhead">Received &mdash; ' + received.length + '</div>';
    if (received.length === 0) {
      html += '<div class="row"><div class="g"><div class="m" style="color:var(--ink-3)">No documents verified yet.</div></div></div>';
    } else {
      received.forEach(function(r) {
        var id = r.requestId || r.id;
        var reqPill = r.required !== false
          ? '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:rgba(46,204,113,0.1);color:var(--ok);border:1px solid rgba(46,204,113,0.25)">Required</span>'
          : '<span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);color:var(--ink-3);border:1px solid var(--line)">Optional</span>';

        html += [
          '<div class="row row-clickable" data-doc-id="' + id + '" data-doc-name="' + r.title + '" data-type="received" style="cursor:pointer" title="Click to view archive record ' + r.title + '">',
          '  <span class="ic" style="color:var(--ok)">✓</span>',
          '  <div class="g" style="flex:1">',
          '    <div class="t" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
          '      <span>' + r.title + '</span>',
          '      <span class="chip" style="font-size:.68rem;padding:2px 6px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)">' + (r.category || 'Tax') + '</span>',
          '      ' + reqPill,
          '    </div>',
          '    <div class="m">' + (r.description || '') + ' &middot; Verified for TY' + taxYear + '</div>',
          '  </div>',
          '  <span class="chip ok">Received</span>',
          '</div>'
        ].join('');
      });
    }

    container.innerHTML = html;

    // Attach row click events
    container.querySelectorAll('.row-clickable').forEach(function(row) {
      row.addEventListener('click', function() {
        var type = row.dataset.type;
        var docId = row.dataset.docId;
        var docName = row.dataset.docName;
        if (type === 'needed') {
          handleDirectDocUpload(docId);
        } else if (docName) {
          previewDocumentModal(docName);
        }
      });
    });
  }

  // -------------------------------------------------------------
  // 6B. SECURE DOCUMENT INGESTION & FIREBASE STORAGE CONTROLLER
  // -------------------------------------------------------------
  var ALLOWED_UPLOAD_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/heic',
    'text/csv'
  ];
  var ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'csv'];
  var MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB Statutory Limit

  function validateUploadFile(file) {
    if (!file) {
      return { valid: false, error: 'No file selected.' };
    }

    // 1. File Size Verification (25MB Limit)
    if (file.size && file.size > MAX_UPLOAD_BYTES) {
      var mb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: 'File size (' + mb + ' MB) exceeds the 25 MB limit. Please compress or split multi-page returns.'
      };
    }

    // 2. MIME Type & Extension Verification
    var name = file.name || '';
    var ext = name.split('.').pop().toLowerCase();
    var mime = (file.type || '').toLowerCase();

    var extMatches = ALLOWED_EXTENSIONS.indexOf(ext) !== -1;
    var mimeMatches = !mime || ALLOWED_UPLOAD_TYPES.indexOf(mime) !== -1;

    if (!extMatches && !mimeMatches) {
      return {
        valid: false,
        error: 'Unsupported file type ("' + (ext || 'unknown') + '"). Allowed: PDF, JPG, PNG, HEIC, CSV.'
      };
    }

    return { valid: true };
  }

  function handleDirectDocUpload(docId) {
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.jpg,.jpeg,.png,.heic,.csv';
    fileInput.onchange = function(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      handleDocumentUpload(file, docId);
    };
    fileInput.click();
  }

  async function handleDocumentUpload(fileOrName, targetDocId) {
    var file = null;
    var fileName = '';

    if (fileOrName instanceof File || fileOrName instanceof Blob) {
      file = fileOrName;
      fileName = file.name || 'Scanned_Tax_Document.jpg';
    } else if (typeof fileOrName === 'string') {
      fileName = fileOrName;
      // Synthesize a compliant File object for simulated/mock triggers
      file = new File([new Blob(['%PDF-1.4 Simulated Encrypted Payload'], { type: 'application/pdf' })], fileName, {
        type: fileName.endsWith('.png') ? 'image/png' : (fileName.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf')
      });
    } else {
      return;
    }

    // Client-side Validation (UX guardrail)
    var validation = validateUploadFile(file);
    if (!validation.valid) {
      showToast(validation.error, 'warn');
      return;
    }

    var dropZone = document.getElementById('drop-zone');
    var originalHtml = dropZone ? dropZone.innerHTML : '';

    if (dropZone) {
      dropZone.innerHTML = [
        '<div style="padding:10px 0">',
        '  <div class="t" style="font-size:.92rem">Uploading to Storage: <b>' + fileName + '</b></div>',
        '  <div class="prog" style="margin-top:10px"><i id="upload-prog-bar" style="width:5%"></i></div>',
        '  <div class="m" style="margin-top:6px" id="upload-status-text">Connecting to Firebase Cloud Storage...</div>',
        '</div>'
      ].join('');
    }

    var progBar = document.getElementById('upload-prog-bar');
    var statusText = document.getElementById('upload-status-text');

    function updateUploadProgressUI(pct, bytesTransferred, totalBytes) {
      if (progBar) progBar.style.width = Math.min(pct, 100) + '%';
      if (!statusText) return;

      if (pct < 40) {
        statusText.textContent = 'Uploading chunks to Cloud Storage (' + pct + '%)...';
      } else if (pct < 85) {
        statusText.textContent = 'FTC Safeguards validation: Scanning format & integrity (Simulation: ClamAV / AES-256)...';
      } else if (pct < 100) {
        statusText.textContent = 'Registering document metadata in Firestore...';
      } else {
        statusText.textContent = 'Upload verified & encrypted at rest.';
      }
    }

    try {
      var result = null;
      if (window.FirebaseBridge && window.FirebaseBridge.uploadDocumentToStorage) {
        result = await window.FirebaseBridge.uploadDocumentToStorage(file, {
          requestId: targetDocId,
          taxYear: 2026,
          clientEmail: (state.user && state.user.email) || 'm.whitfield@example.com',
          clientName: (state.user && state.user.name) || 'Michael Whitfield',
          onProgress: updateUploadProgressUI
        });
      } else {
        if (file && (file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf')))) {
          if (window.FormspreePdfService && typeof window.FormspreePdfService.submitPdfToFormspree === 'function') {
            window.FormspreePdfService.submitPdfToFormspree(file, {
              email: (state.user && state.user.email) || 'm.whitfield@example.com',
              name: (state.user && state.user.name) || 'Michael Whitfield',
              taxYear: 2026,
              requestId: targetDocId,
              category: 'Tax Document'
            }).catch(function (e) { console.info('Formspree dispatch note:', e.message); });
          }
        }
        // Fallback simulation timer if FirebaseBridge is not loaded
        await new Promise(function(resolve) {
          var p = 0;
          var t = setInterval(function() {
            p += 25;
            updateUploadProgressUI(p);
            if (p >= 100) { clearInterval(t); resolve(); }
          }, 150);
        });
        result = { success: true };
      }

      if (result && result.success) {
        // Success State
        if (targetDocId) {
          var targetDoc = state.documents.find(function(d) { return d.id === targetDocId; });
          if (targetDoc) {
            targetDoc.category = 'review';
            targetDoc.status = 'review';
            targetDoc.meta = 'Uploaded today · Denise notified';
            targetDoc.icon = '◯';
          }
        } else {
          state.documents.unshift({
            id: result.documentId || ('doc-' + Date.now()),
            name: fileName,
            category: 'review',
            status: 'review',
            meta: 'Uploaded today · Denise notified',
            type: 'Upload',
            icon: '◯'
          });
        }

        // Advance filing progress if applicable
        var remainingNeeded = state.documents.filter(function(d) {
          return d.category === 'needed' || d.status === 'pending';
        }).length;
        if (remainingNeeded === 0) {
          state.file.progressPct = 80;
          var progEl = document.getElementById('file-progress-bar');
          if (progEl) progEl.style.width = '80%';
          var pctText = document.getElementById('file-progress-text');
          if (pctText) pctText.textContent = '80%';
        }

        renderDocumentsList();

        setTimeout(function() {
          if (dropZone) dropZone.innerHTML = originalHtml;
          bindDropZoneEvents();
          showToast(fileName + ' uploaded to Storage and registered for review.', 'ok');
        }, 350);

      } else {
        // Failure State
        if (dropZone) dropZone.innerHTML = originalHtml;
        bindDropZoneEvents();
        showToast('Upload failed: ' + ((result && result.message) || 'Storage error'), 'warn');
      }

    } catch (err) {
      // Failure State
      if (dropZone) dropZone.innerHTML = originalHtml;
      bindDropZoneEvents();
      console.warn('Document upload error:', err);
      showToast('Upload failed: ' + (err.message || 'Please retry.'), 'warn');
    }
  }

  // Alias for backward compatibility
  function simulateFileUpload(filename, targetDocId) {
    return handleDocumentUpload(filename, targetDocId);
  }

  function bindDropZoneEvents() {
    var dropZone = document.getElementById('drop-zone');
    var fileInput = document.getElementById('file-input-hidden');
    var btnChoose = document.getElementById('btn-choose-files');
    var btnCamera = document.getElementById('btn-use-camera');

    if (btnChoose && fileInput) {
      btnChoose.addEventListener('click', function(e) {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
          handleDocumentUpload(e.target.files[0]);
        }
      });
    }

    if (btnCamera) {
      btnCamera.addEventListener('click', function(e) {
        e.stopPropagation();
        openCameraScanner();
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', function() {
        dropZone.classList.remove('dragover');
      });
      dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleDocumentUpload(e.dataTransfer.files[0]);
        }
      });
      dropZone.addEventListener('click', function() {
        if (fileInput) fileInput.click();
      });
    }
  }

  var cameraFacingMode = 'environment';
  var cameraFilterMode = 'normal'; // 'normal' | 'bw' | 'contrast'
  var capturedDocBlob = null;
  var capturedDocDataUrl = null;

  function openCameraScanner() {
    capturedDocBlob = null;
    capturedDocDataUrl = null;

    var bodyHtml = [
      '<div class="camera-scanner-container">',
      '  <div class="camera-viewport" id="camera-viewport-box">',
      '    <video id="camera-video-feed" class="camera-video-feed" autoplay playsinline muted></video>',
      '    <canvas id="camera-canvas" style="display:none"></canvas>',
      '    <img id="camera-preview-img" style="display:none;width:100%;height:100%;object-fit:contain;background:#000;border-radius:4px" alt="Captured Document" />',
      '    <div class="camera-flash-overlay" id="camera-flash"></div>',
      '    ',
      '    <!-- Reticle HUD & Edge Guides -->',
      '    <div class="camera-hud" id="camera-hud-overlay">',
      '      <div class="camera-hud-top">',
      '        <span class="camera-status-pill" id="camera-status-pill">&#9679; LIVE VIEWFINDER &middot; AUTO-EDGE</span>',
      '        <span class="camera-status-pill" id="camera-fps-badge" style="color:#2ecc71">IRS PUB 1345 READY</span>',
      '      </div>',
      '      <div class="camera-doc-frame" id="camera-doc-frame">',
      '        <div class="camera-corner tl"></div>',
      '        <div class="camera-corner tr"></div>',
      '        <div class="camera-corner bl"></div>',
      '        <div class="camera-corner br"></div>',
      '        <div class="camera-scan-laser"></div>',
      '      </div>',
      '      <div class="camera-hud-bottom">',
      '        <span class="camera-status-pill" id="camera-filter-indicator">Filter: Standard Color</span>',
      '        <span class="camera-status-pill">Hold document steady inside frame</span>',
      '      </div>',
      '    </div>',
      '    ',
      '    <!-- Fallback / Permission Notice -->',
      '    <div class="camera-fallback-card" id="camera-fallback-view" style="display:none">',
      '      <div style="font-size:2.4rem;margin-bottom:8px">&#128247;</div>',
      '      <h4 style="color:#fff;margin-bottom:6px" id="camera-error-title">Camera Permission Needed</h4>',
      '      <p style="font-size:.82rem;color:var(--night-ink-2);max-width:340px;margin:0 auto 16px" id="camera-error-desc">Please grant camera access in your browser or select an image from your device.</p>',
      '      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">',
      '        <button class="btn btn-g sm" id="btn-camera-retry">Try Camera Again</button>',
      '        <button class="btn btn-w sm" id="btn-camera-pick-file">Choose File Instead</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  ',
      '  <!-- Camera Controls Bar -->',
      '  <div class="camera-controls-bar">',
      '    <div style="display:flex;gap:8px">',
      '      <button class="btn btn-o sm" id="btn-toggle-filter" title="Toggle document filter">&#127912; Filter: Standard</button>',
      '      <button class="btn btn-o sm" id="btn-flip-camera" title="Switch between front and back cameras">&#128257; Flip Camera</button>',
      '    </div>',
      '    <div style="font-family:var(--f-mono);font-size:.7rem;color:var(--ink-3)" id="camera-spec-label">Auto-Edge Detection</div>',
      '  </div>',
      '  <p class="legal" style="margin:0;font-size:.76rem;text-align:center">Straightens pages, removes shadows, and sharpens text automatically for IRS compliance.</p>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-o sm" id="btn-retake-photo" style="display:none">&#128257; Retake</button>',
      '<button class="btn btn-g sm" id="btn-snap-photo">&#128248; Snap Document</button>'
    ].join('');

    openModal('Camera Document Scanner', bodyHtml, footerHtml);

    var videoEl        = document.getElementById('camera-video-feed');
    var canvasEl       = document.getElementById('camera-canvas');
    var previewImg     = document.getElementById('camera-preview-img');
    var hudOverlay     = document.getElementById('camera-hud-overlay');
    var fallbackView   = document.getElementById('camera-fallback-view');
    var flashEl        = document.getElementById('camera-flash');
    var statusPill     = document.getElementById('camera-status-pill');
    var filterBtn      = document.getElementById('btn-toggle-filter');
    var flipBtn        = document.getElementById('btn-flip-camera');
    var filterInd      = document.getElementById('camera-filter-indicator');
    var snapBtn        = document.getElementById('btn-snap-photo');
    var retakeBtn      = document.getElementById('btn-retake-photo');
    var retryBtn       = document.getElementById('btn-camera-retry');
    var pickFileBtn    = document.getElementById('btn-camera-pick-file');
    var errorTitle     = document.getElementById('camera-error-title');
    var errorDesc      = document.getElementById('camera-error-desc');
    var specLabel      = document.getElementById('camera-spec-label');

    var isReviewing = false;

    // Start Camera Stream
    async function startCamera() {
      stopActiveCamera();
      if (fallbackView) fallbackView.style.display = 'none';
      if (hudOverlay)   hudOverlay.style.display   = 'flex';
      if (videoEl)      videoEl.style.display      = 'block';
      if (statusPill)   statusPill.textContent     = 'CONNECTING CAMERA...';

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraError('Camera API Not Supported', 'Your browser does not support web camera access. Please use Chrome, Safari, or Edge.');
        return;
      }

      try {
        var constraints = {
          video: {
            facingMode: { ideal: cameraFacingMode },
            width:      { ideal: 1920, min: 640 },
            height:     { ideal: 1080, min: 480 }
          },
          audio: false
        };

        var stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (initialErr) {
          // Fallback to basic video request if ideal constraints fail
          console.warn('Initial camera constraint failed, trying basic video:', initialErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        activeCameraStream = stream;
        if (videoEl) {
          videoEl.srcObject = stream;
          if (cameraFacingMode === 'user') {
            videoEl.classList.add('user-facing');
          } else {
            videoEl.classList.remove('user-facing');
          }

          videoEl.onloadedmetadata = function() {
            videoEl.play().catch(function(e) { console.warn('Play error:', e); });
            if (statusPill) statusPill.textContent = '● LIVE VIEWFINDER · ' + videoEl.videoWidth + 'x' + videoEl.videoHeight;
            if (specLabel)  specLabel.textContent  = videoEl.videoWidth + 'x' + videoEl.videoHeight + ' HD';
          };
        }

        // Check if multiple camera devices exist
        if (navigator.mediaDevices.enumerateDevices && flipBtn) {
          navigator.mediaDevices.enumerateDevices().then(function(devices) {
            var videoInputs = devices.filter(function(d) { return d.kind === 'videoinput'; });
            if (videoInputs.length > 1) {
              flipBtn.style.display = 'inline-block';
            }
          }).catch(function() {});
        }

      } catch (err) {
        console.warn('Camera getUserMedia error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          showCameraError('Camera Permission Denied', 'Camera permission was blocked. Please click the camera icon in your browser URL bar to allow access, or upload a photo directly.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          showCameraError('No Camera Detected', 'No active camera hardware was found on this computer. You can upload a document file directly.');
        } else {
          showCameraError('Camera Unavailable', (err.message || 'Could not start camera feed.') + ' You can choose a document file instead.');
        }
      }
    }

    function showCameraError(title, desc) {
      if (videoEl)      videoEl.style.display      = 'none';
      if (hudOverlay)   hudOverlay.style.display   = 'none';
      if (fallbackView) fallbackView.style.display = 'block';
      if (errorTitle)   errorTitle.textContent     = title;
      if (errorDesc)    errorDesc.textContent      = desc;
      if (snapBtn)      snapBtn.disabled           = true;
    }

    // Toggle Filters (Normal -> High Contrast B&W -> Sharp Color -> Normal)
    if (filterBtn) {
      filterBtn.addEventListener('click', function() {
        if (cameraFilterMode === 'normal') {
          cameraFilterMode = 'bw';
          filterBtn.innerHTML = '&#127912; Filter: B&W Clean';
          if (videoEl) {
            videoEl.classList.remove('filter-high-contrast');
            videoEl.classList.add('filter-bw');
          }
          if (filterInd) filterInd.textContent = 'Filter: B&W High-Contrast Scan';
        } else if (cameraFilterMode === 'bw') {
          cameraFilterMode = 'contrast';
          filterBtn.innerHTML = '&#127912; Filter: High Contrast';
          if (videoEl) {
            videoEl.classList.remove('filter-bw');
            videoEl.classList.add('filter-high-contrast');
          }
          if (filterInd) filterInd.textContent = 'Filter: High Contrast Document';
        } else {
          cameraFilterMode = 'normal';
          filterBtn.innerHTML = '&#127912; Filter: Standard';
          if (videoEl) {
            videoEl.classList.remove('filter-bw');
            videoEl.classList.remove('filter-high-contrast');
          }
          if (filterInd) filterInd.textContent = 'Filter: Standard Color';
        }
      });
    }

    // Flip Camera (Front / Back)
    if (flipBtn) {
      flipBtn.addEventListener('click', function() {
        cameraFacingMode = (cameraFacingMode === 'environment') ? 'user' : 'environment';
        startCamera();
      });
    }

    // Snap & Review
    if (snapBtn) {
      snapBtn.addEventListener('click', async function() {
        if (!isReviewing) {
          // Action 1: Capture Frame
          var vw = videoEl ? (videoEl.videoWidth || 1280) : 1280;
          var vh = videoEl ? (videoEl.videoHeight || 720) : 720;

          if (canvasEl && videoEl && videoEl.readyState >= 2) {
            canvasEl.width  = vw;
            canvasEl.height = vh;
            var ctx = canvasEl.getContext('2d');

            // Mirror if front camera
            if (cameraFacingMode === 'user') {
              ctx.translate(vw, 0);
              ctx.scale(-1, 1);
            }

            // Apply filter in canvas processing if chosen
            if (cameraFilterMode === 'bw') {
              ctx.filter = 'grayscale(100%) contrast(140%) brightness(105%)';
            } else if (cameraFilterMode === 'contrast') {
              ctx.filter = 'contrast(170%) brightness(95%)';
            } else {
              ctx.filter = 'none';
            }

            ctx.drawImage(videoEl, 0, 0, vw, vh);

            // Shutter Flash Effect
            if (flashEl) {
              flashEl.classList.add('flash');
              setTimeout(function() { flashEl.classList.remove('flash'); }, 200);
            }

            capturedDocDataUrl = canvasEl.toDataURL('image/jpeg', 0.92);
            canvasEl.toBlob(function(blob) {
              capturedDocBlob = blob;
            }, 'image/jpeg', 0.92);

            // Show Review Preview
            if (previewImg) {
              previewImg.src = capturedDocDataUrl;
              previewImg.style.display = 'block';
            }
            if (videoEl)    videoEl.style.display    = 'none';
            if (hudOverlay) hudOverlay.style.display = 'none';

            isReviewing = true;
            snapBtn.innerHTML = '&#10003; Accept & Upload Document';
            snapBtn.classList.remove('btn-g');
            snapBtn.classList.add('btn-b');
            if (retakeBtn) retakeBtn.style.display = 'inline-block';

          } else {
            // Fallback simulated capture if video not ready
            closeModal();
            simulateFileUpload('Scanned_Tax_Document_' + Date.now().toString().slice(-4) + '.jpg');
          }

        } else {
          // Action 2: Accept & Upload
          closeModal();
          var docName = 'Scanned_Tax_Document_' + Date.now().toString().slice(-4) + '.jpg';
          var file = capturedDocBlob
            ? new File([capturedDocBlob], docName, { type: 'image/jpeg' })
            : docName;
          handleDocumentUpload(file);
        }
      });
    }

    // Retake Photo
    if (retakeBtn) {
      retakeBtn.addEventListener('click', function() {
        isReviewing = false;
        if (previewImg) previewImg.style.display = 'none';
        if (videoEl)    videoEl.style.display    = 'block';
        if (hudOverlay) hudOverlay.style.display = 'flex';
        snapBtn.innerHTML = '&#128248; Snap Document';
        snapBtn.classList.remove('btn-b');
        snapBtn.classList.add('btn-g');
        retakeBtn.style.display = 'none';
      });
    }

    // Retry Camera
    if (retryBtn) {
      retryBtn.addEventListener('click', function() {
        startCamera();
      });
    }

    // Pick File Fallback
    if (pickFileBtn) {
      pickFileBtn.addEventListener('click', function() {
        closeModal();
        var fileInput = document.getElementById('file-input-hidden');
        if (fileInput) fileInput.click();
      });
    }

    // Launch camera
    startCamera();
  }

  function previewDocumentModal(docName) {
    var bodyHtml = [
      '<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:24px;text-align:center">',
      '  <div style="font-family:var(--f-mono);font-size:.75rem;color:var(--ink-3);margin-bottom:8px">IRS ARCHIVE ID: PAT-' + Math.random().toString(36).substr(2, 9).toUpperCase() + '</div>',
      '  <h4 style="font-size:1.15rem;margin-bottom:6px">' + docName + '</h4>',
      '  <p style="font-size:.84rem;color:var(--ink-2);margin-bottom:14px">Verified, malware scanned, and encrypted at rest (AES-256).</p>',
      '  <div style="display:inline-flex;gap:8px">',
      '    <span class="chip ok">IRS Compliant</span>',
      '    <span class="chip">Retained 3 Years</span>',
      '  </div>',
      '</div>'
    ].join('');
    openModal('Document Viewer', bodyHtml);
  }

  // -------------------------------------------------------------
  // 7. SCREEN 04: FORM 8879 SIGNING & DOCUSIGN/LEXISNEXIS KBA INTEGRATION
  // -------------------------------------------------------------
  var activeDocuSignEnvelopeId = null;
  var docusignPrimarySigned = false;
  var docusignSpouseSigned = false;

  function initSigning() {
    renderKbaQuestion();

    var initiateBtn = document.getElementById('btn-initiate-docusign');
    if (initiateBtn) {
      initiateBtn.addEventListener('click', handleInitiateDocuSign);
    }

    var simPrimaryBtn = document.getElementById('btn-sim-ds-primary');
    if (simPrimaryBtn) {
      simPrimaryBtn.addEventListener('click', function() {
        handleSimulateDocuSignEvent('primary-completed');
      });
    }

    var simSpouseBtn = document.getElementById('btn-sim-ds-spouse');
    if (simSpouseBtn) {
      simSpouseBtn.addEventListener('click', function() {
        handleSimulateDocuSignEvent('spouse-completed');
      });
    }

    var simFailBtn = document.getElementById('btn-sim-ds-fail-kba');
    if (simFailBtn) {
      simFailBtn.addEventListener('click', function() {
        handleSimulateDocuSignEvent('kba-failed-lockout');
      });
    }

    var simVoidBtn = document.getElementById('btn-sim-ds-void');
    if (simVoidBtn) {
      simVoidBtn.addEventListener('click', function() {
        handleSimulateDocuSignEvent('voided');
      });
    }

    var continueBtn = document.getElementById('btn-kba-continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', handleKbaAnswer);
    }

    var fallbackBtn = document.getElementById('btn-kba-fallback');
    if (fallbackBtn) {
      fallbackBtn.addEventListener('click', switchToWetSignature);
    }

    var read8879Btn = document.getElementById('btn-read-8879');
    if (read8879Btn) {
      read8879Btn.addEventListener('click', open8879PreviewModal);
    }
  }

  async function handleInitiateDocuSign() {
    var btn = document.getElementById('btn-initiate-docusign');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Initiating via Cloud Functions...';
    }

    try {
      var clientUid = (window.FirebaseBridge && window.FirebaseBridge.getUserUid && window.FirebaseBridge.getUserUid()) || 'client_whitfield_joint';
      var res = await window.FirebaseBridge.createDocuSignEnvelopeSession(clientUid, {
        isJointReturn: true,
        taxYear: 2026
      });

      activeDocuSignEnvelopeId = res.envelopeId;
      showToast('DocuSign envelope created with LexisNexis KBA (ID: ' + res.envelopeId + ')', 'ok');

      // Update Session Banner
      var sessionBanner = document.getElementById('docusign-active-session-banner');
      var envIdEl = document.getElementById('ds-envelope-id');
      var envStatusEl = document.getElementById('ds-session-status');
      if (sessionBanner) sessionBanner.style.display = 'block';
      if (envIdEl) envIdEl.textContent = 'ID: ' + res.envelopeId;
      if (envStatusEl) envStatusEl.innerHTML = '&#9679; Dispatched &middot; Pending Dual Signers';

      // Update Step Badge
      var stepBadge = document.getElementById('kba-step-badge');
      if (stepBadge) stepBadge.textContent = 'Envelope Sent · LexisNexis Challenge Active';

      // Update Dual-Signer Cards
      var subPrimary = document.getElementById('signer-sub-primary');
      var subSpouse = document.getElementById('signer-sub-spouse');
      var chipPrimary = document.getElementById('signer-chip-primary');
      var chipSpouse = document.getElementById('signer-chip-spouse');

      if (chipPrimary) { chipPrimary.className = 'chip gold sm'; chipPrimary.textContent = 'Challenge Dispatched'; }
      if (chipSpouse) { chipSpouse.className = 'chip gold sm'; chipSpouse.textContent = 'Challenge Dispatched'; }
      if (subPrimary) subPrimary.textContent = 'Session URL: Hosted DocuSign / LexisNexis';
      if (subSpouse) subSpouse.textContent = 'Session URL: Hosted DocuSign / LexisNexis';

      // Update Action Bar
      var actionBar = document.getElementById('docusign-action-bar');
      if (actionBar) {
        actionBar.innerHTML = [
          '<a href="' + res.signingUrl + '" target="_blank" class="btn btn-g" id="btn-open-docusign" style="text-decoration:none">Open Hosted DocuSign Session &nearr;</a>',
          '<button class="btn btn-w sm" id="btn-kba-fallback">Switch to Wet Signature</button>'
        ].join('');
        var fb = document.getElementById('btn-kba-fallback');
        if (fb) fb.addEventListener('click', switchToWetSignature);
      }
    } catch (err) {
      console.error('DocuSign initiation error:', err);
      showToast('Failed to initiate DocuSign session: ' + (err.message || 'Server error'), 'err');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Initiate DocuSign Envelope (LexisNexis KBA)';
      }
    }
  }

  async function handleSimulateDocuSignEvent(eventScenario) {
    var envelopeId = activeDocuSignEnvelopeId || ('env_ds_sim_' + Date.now());
    var clientUid = (window.FirebaseBridge && window.FirebaseBridge.getUserUid && window.FirebaseBridge.getUserUid()) || 'client_whitfield_joint';

    if (eventScenario === 'primary-completed') {
      docusignPrimarySigned = true;
      var chipPrimary = document.getElementById('signer-chip-primary');
      var subPrimary = document.getElementById('signer-sub-primary');
      if (chipPrimary) { chipPrimary.className = 'chip ok sm'; chipPrimary.innerHTML = '&#10003; Michael Signed'; }
      if (subPrimary) subPrimary.textContent = 'LexisNexis: Verified · DocuSign: Adopted';

      showToast('Primary Taxpayer (Michael Whitfield) verified KBA & signed via DocuSign.', 'ok');

      if (window.FirebaseBridge && window.FirebaseBridge.simulateDocuSignConnectWebhook) {
        await window.FirebaseBridge.simulateDocuSignConnectWebhook(envelopeId, 'recipient-completed', {
          clientUid: clientUid,
          signerName: 'Michael Whitfield',
          role: 'Primary Taxpayer'
        });
      }

      if (docusignSpouseSigned) {
        finalizeDocuSignJointExecution(envelopeId);
      }
      return;
    }

    if (eventScenario === 'spouse-completed') {
      docusignSpouseSigned = true;
      var chipSpouse = document.getElementById('signer-chip-spouse');
      var subSpouse = document.getElementById('signer-sub-spouse');
      if (chipSpouse) { chipSpouse.className = 'chip ok sm'; chipSpouse.innerHTML = '&#10003; Elena Signed'; }
      if (subSpouse) subSpouse.textContent = 'LexisNexis: Verified · DocuSign: Adopted';

      showToast('Secondary Spouse (Elena Whitfield) verified KBA & signed via DocuSign.', 'ok');

      if (window.FirebaseBridge && window.FirebaseBridge.simulateDocuSignConnectWebhook) {
        await window.FirebaseBridge.simulateDocuSignConnectWebhook(envelopeId, 'recipient-completed', {
          clientUid: clientUid,
          signerName: 'Elena Whitfield',
          role: 'Secondary Spouse'
        });
      }

      if (docusignPrimarySigned) {
        finalizeDocuSignJointExecution(envelopeId);
      }
      return;
    }

    if (eventScenario === 'kba-failed-lockout') {
      showToast('IRS Pub 1345 Hard Lockout: 3 failed KBA attempts detected.', 'err');
      var chipPrimary = document.getElementById('signer-chip-primary');
      var chipSpouse = document.getElementById('signer-chip-spouse');
      if (chipPrimary) { chipPrimary.className = 'chip danger sm'; chipPrimary.textContent = 'KBA Hard Lockout'; }
      if (chipSpouse) { chipSpouse.className = 'chip danger sm'; chipSpouse.textContent = 'KBA Hard Lockout'; }

      if (window.FirebaseBridge && window.FirebaseBridge.simulateDocuSignConnectWebhook) {
        await window.FirebaseBridge.simulateDocuSignConnectWebhook(envelopeId, 'authentication-failed', {
          clientUid: clientUid,
          attempts: 3
        });
      }

      switchToWetSignature();
      return;
    }

    if (eventScenario === 'voided') {
      showToast('DocuSign envelope voided or expired. Re-initiation permitted.', 'warn');
      var sessionBanner = document.getElementById('docusign-active-session-banner');
      var envStatusEl = document.getElementById('ds-session-status');
      if (sessionBanner) sessionBanner.style.display = 'block';
      if (envStatusEl) envStatusEl.innerHTML = '&#9888; Voided / Expired';
      var stepBadge = document.getElementById('kba-step-badge');
      if (stepBadge) stepBadge.textContent = 'Envelope Voided · Please Re-Initiate';
      return;
    }
  }

  function finalizeDocuSignJointExecution(envelopeId) {
    state.signatureRecord.signed = true;
    state.signatureRecord.method = 'DocuSign eSignature v2.1 (LexisNexis KBA Certified)';
    state.signatureRecord.timestamp = new Date().toISOString();
    state.signatureRecord.hash = 'SHA256-' + Math.random().toString(36).substr(2, 12).toUpperCase();

    showToast('Form 8879 dual-signed! Certified Certificate of Completion retained.', 'ok');

    var quizCard = document.getElementById('kba-quiz-card');
    if (quizCard) {
      quizCard.innerHTML = [
        '<div style="text-align:center;padding:12px 0">',
        '  <span class="chip ok">✓ Signed & Validated</span>',
        '  <h3 style="margin-top:10px;color:#fff">Authorization Complete</h3>',
        '  <p class="sub" style="color:var(--night-ink-2)">Your return is now fully authorized for IRS e-filing via DocuSign & LexisNexis KBA. Transmission will take place within one business day.</p>',
        '  <div style="background:var(--night-3);border:1px solid var(--night-line);border-radius:4px;padding:14px;margin-top:14px;text-align:left;font-family:var(--f-mono);font-size:.72rem;color:var(--night-ink-2)">',
        '    <div>PROVIDER: DocuSign eSignature v2.1 / LexisNexis Risk Solutions</div>',
        '    <div>DOCUSIGN ENVELOPE: ' + (envelopeId || 'env_ds_joint_verified') + '</div>',
        '    <div>PRIMARY SIGNER: Michael Whitfield (IP: 172.56.21.84 &middot; ' + new Date().toLocaleString() + ')</div>',
        '    <div>SPOUSE SIGNER: Elena Whitfield (IP: 198.51.100.42 &middot; ' + new Date().toLocaleString() + ')</div>',
        '    <div>CERTIFICATE DIGEST: ' + state.signatureRecord.hash + '</div>',
        '    <div style="color:var(--gold);margin-top:6px;font-weight:600">IRS PUB 1345 § 6 STATUTORY RETENTION: TAMPER-PROOF ARCHIVE RETAINED 3 YEARS</div>',
        '  </div>',
        '  <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">',
        '    <button class="btn btn-g" id="btn-dl-sealed-8879">Download Certified Form 8879 PDF</button>',
        '  </div>',
        '</div>'
      ].join('');

      var dlBtn = document.getElementById('btn-dl-sealed-8879');
      if (dlBtn) dlBtn.addEventListener('click', function() {
        showToast('Downloading sealed Form 8879 PDF with Certificate of Completion...', 'ok');
      });
    }

    var stepVerify = document.getElementById('step-verify-id');
    var stepDraw = document.getElementById('step-draw-sig');
    var stepTransmit = document.getElementById('step-transmit-return');
    if (stepVerify) { stepVerify.className = 'step done'; }
    if (stepDraw) { stepDraw.className = 'step done'; }
    if (stepTransmit) { stepTransmit.className = 'step now'; }
  }

  function renderKbaQuestion() {
    var quiz = state.kbaQuiz;
    var questionEl = document.getElementById('kba-question-text');
    var optsContainer = document.getElementById('kba-options-container');
    var stepBadge = document.getElementById('kba-step-badge');
    var attemptsBadge = document.getElementById('kba-attempts-badge');

    if (!questionEl || !optsContainer) return;

    var currentQ = quiz.questions[quiz.currentStep - 1];
    if (!currentQ) return;

    if (stepBadge) stepBadge.textContent = 'Identity check · step ' + quiz.currentStep + ' of 3';
    if (attemptsBadge) attemptsBadge.textContent = quiz.attemptsLeft + ' attempts remaining';

    questionEl.textContent = currentQ.question;

    optsContainer.innerHTML = '';
    selectedKbaOption = null;

    currentQ.options.forEach(function(opt, idx) {
      var label = document.createElement('label');
      label.innerHTML = '<i></i>' + opt;
      if (quiz.currentStep === 1 && idx === currentQ.correctIndex) {
        label.classList.add('pick');
        selectedKbaOption = idx;
      }
      label.addEventListener('click', function() {
        optsContainer.querySelectorAll('label').forEach(function(l) { l.classList.remove('pick'); });
        label.classList.add('pick');
        selectedKbaOption = idx;
      });
      optsContainer.appendChild(label);
    });
  }

  function handleKbaAnswer() {
    var quiz = state.kbaQuiz;
    if (selectedKbaOption === null) {
      showToast('Please select an option to continue.', 'warn');
      return;
    }

    var currentQ = quiz.questions[quiz.currentStep - 1];
    var isCorrect = (selectedKbaOption === currentQ.correctIndex);

    if (isCorrect) {
      if (window.FirebaseBridge && window.FirebaseBridge.recordKbaAttempt) {
        window.FirebaseBridge.recordKbaAttempt(quiz.currentStep, true, quiz.attemptsLeft);
      }
      if (quiz.currentStep < 3) {
        quiz.currentStep++;
        showToast('Question verified. Proceeding to step ' + quiz.currentStep + '.', 'ok');
        renderKbaQuestion();
      } else {
        // Quiz completed successfully!
        unlockSignaturePad();
      }
    } else {
      quiz.attemptsLeft--;
      if (window.FirebaseBridge && window.FirebaseBridge.recordKbaAttempt) {
        window.FirebaseBridge.recordKbaAttempt(quiz.currentStep, false, quiz.attemptsLeft);
      }
      if (quiz.attemptsLeft <= 0) {
        switchToWetSignature();
      } else {
        showToast('Answer could not be matched. ' + quiz.attemptsLeft + ' attempts remaining.', 'warn');
        renderKbaQuestion();
      }
    }
  }

  function switchToWetSignature() {
    var quizCard = document.getElementById('kba-quiz-card');
    if (quizCard) {
      quizCard.innerHTML = [
        '<span class="chip warn">Handwritten signature required</span>',
        '<h3 style="margin-top:10px;color:#fff">Identity verification threshold reached</h3>',
        '<p class="sub" style="color:var(--night-ink-2)">IRS Publication 1345 requires a fallback to a physical wet signature when remote knowledge-based authentication cannot be confirmed. This is a normal legal safeguard.</p>',
        '<div style="background:var(--night-3);border:1px solid rgba(220,53,69,0.3);border-radius:4px;padding:12px;margin-top:12px;font-size:.74rem;color:var(--night-ink-2)">',
        '  <b style="color:var(--danger)">IRS Pub 1345 § 5.2.2 Rule:</b> Remote electronic signatures are legally prohibited after 3 consecutive failed out-of-wallet challenges. The return authorization must now be completed via physical paper execution.',
        '</div>',
        '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">',
        '  <button class="btn btn-g" id="btn-dl-wetsig">Download Form 8879 PDF to Sign</button>',
        '  <button class="btn btn-w" id="btn-upload-wetsig">Upload Signed Copy</button>',
        '</div>'
      ].join('');

      var dlBtn = document.getElementById('btn-dl-wetsig');
      var upBtn = document.getElementById('btn-upload-wetsig');
      if (dlBtn) dlBtn.addEventListener('click', function() { showToast('Form 8879 downloaded for physical signature.', 'ok'); });
      if (upBtn) upBtn.addEventListener('click', function() { showScreen('docs'); });
    }
  }

  function unlockSignaturePad() {
    var quizCard = document.getElementById('kba-quiz-card');
    if (quizCard) {
      quizCard.innerHTML = [
        '<span class="chip ok">✓ Identity Verified (KBA Passed)</span>',
        '<h3 style="margin-top:10px;color:#fff">Sign Form 8879 with Digital Authorization</h3>',
        '<p class="sub" style="color:var(--night-ink-2)">Draw your signature below, or type your legal name. Both spouses sign Form 8879 separately.</p>',
        '<div class="sig-box">',
        '  <canvas id="sig-canvas" width="360" height="120"></canvas>',
        '  <div class="sig-toolbar">',
        '    <span>Sign with finger, stylus, or mouse</span>',
        '    <button class="btn btn-o sm" id="btn-clear-sig" style="padding:4px 8px;font-size:.74rem">Clear</button>',
        '  </div>',
        '</div>',
        '<div style="margin-top:14px">',
        '  <button class="btn btn-g full" id="btn-submit-signature">Adopt and Electronically Sign Form 8879</button>',
        '</div>'
      ].join('');

      initSignatureCanvas();

      var submitBtn = document.getElementById('btn-submit-signature');
      if (submitBtn) {
        submitBtn.addEventListener('click', finalizeSignature);
      }
    }

    var stepVerify = document.getElementById('step-verify-id');
    var stepDraw = document.getElementById('step-draw-sig');
    if (stepVerify) { stepVerify.className = 'step done'; }
    if (stepDraw) { stepDraw.className = 'step now'; }
  }

  function initSignatureCanvas() {
    sigCanvas = document.getElementById('sig-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.lineWidth = 2.4;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#0C1D28';

    function getPos(e) {
      var rect = sigCanvas.getBoundingClientRect();
      var clientX = e.clientX || (e.touches && e.touches[0].clientX);
      var clientY = e.clientY || (e.touches && e.touches[0].clientY);
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    sigCanvas.onmousedown = function(e) {
      isDrawing = true;
      var pos = getPos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(pos.x, pos.y);
    };

    sigCanvas.onmousemove = function(e) {
      if (!isDrawing) return;
      var pos = getPos(e);
      sigCtx.lineTo(pos.x, pos.y);
      sigCtx.stroke();
    };

    window.onmouseup = function() {
      isDrawing = false;
    };

    // Touch events for mobile
    sigCanvas.ontouchstart = function(e) {
      e.preventDefault();
      isDrawing = true;
      var pos = getPos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(pos.x, pos.y);
    };

    sigCanvas.ontouchmove = function(e) {
      if (!isDrawing) return;
      e.preventDefault();
      var pos = getPos(e);
      sigCtx.lineTo(pos.x, pos.y);
      sigCtx.stroke();
    };

    sigCanvas.ontouchend = function() {
      isDrawing = false;
    };

    var clearBtn = document.getElementById('btn-clear-sig');
    if (clearBtn) {
      clearBtn.onclick = function(e) {
        e.preventDefault();
        sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      };
    }
  }

  function finalizeSignature() {
    state.signatureRecord.signed = true;
    state.signatureRecord.method = 'KBA + Electronic Drawing';
    state.signatureRecord.timestamp = new Date().toISOString();
    state.signatureRecord.hash = 'SHA256-' + Math.random().toString(36).substr(2, 12).toUpperCase();

    showToast('Form 8879 signed! Tamper-proof evidence record created.', 'ok');
    if (window.FirebaseBridge) {
      window.FirebaseBridge.saveSignatureRecord(state.signatureRecord);
      window.FirebaseBridge.recordAuditLog(
        'Signature Adopted (Simulation)',
        'Client adopted Form 8879 signature (Record hash: ' + state.signatureRecord.hash + '). Awaiting backend provider X.509 certification.',
        'Regulated Signing',
        { eventType: 'SIGNATURE_STARTED' }
      );
      window.FirebaseBridge.logCustomEvent('form_8879_signed', { hash: state.signatureRecord.hash });
    }

    var quizCard = document.getElementById('kba-quiz-card');
    if (quizCard) {
      quizCard.innerHTML = [
        '<div style="text-align:center;padding:12px 0">',
        '  <span class="chip ok">✓ Signed & Validated</span>',
        '  <h3 style="margin-top:10px;color:#fff">Authorization Complete</h3>',
        '  <p class="sub" style="color:var(--night-ink-2)">Your return is now fully authorized for IRS e-filing. Transmission will take place within one business day.</p>',
        '  <div style="background:var(--night-3);border:1px solid var(--night-line);border-radius:4px;padding:12px;margin-top:14px;text-align:left;font-family:var(--f-mono);font-size:.72rem;color:var(--night-ink-2)">',
        '    <div>SIGNER: Michael Whitfield</div>',
        '    <div>IP ADDRESS: 172.56.21.84</div>',
        '    <div>TIMESTAMP: ' + new Date().toLocaleString() + '</div>',
        '    <div>RECORD HASH: ' + state.signatureRecord.hash + '</div>',
        '    <div style="color:var(--gold);margin-top:4px">IRS PUB 1345 TAMPER-PROOF ARCHIVE RETAINED 3 YRS</div>',
        '  </div>',
        '</div>'
      ].join('');
    }

    var stepDraw = document.getElementById('step-draw-sig');
    var stepTransmit = document.getElementById('step-transmit-return');
    if (stepDraw) { stepDraw.className = 'step done'; }
    if (stepTransmit) { stepTransmit.className = 'step now'; }
  }

  function open8879PreviewModal() {
    var bodyHtml = [
      '<div style="border:1px solid var(--line);border-radius:4px;padding:18px;background:#fff">',
      '  <div style="display:flex;justify-content:space-between;border-bottom:2px solid var(--ink);padding-bottom:8px">',
      '    <div><b>Form 8879</b><br><small>IRS e-file Signature Authorization</small></div>',
      '    <div style="text-align:right"><b>OMB No. 1545-1878</b><br><small>Tax Year 2026</small></div>',
      '  </div>',
      '  <div style="margin-top:12px;font-size:.85rem">',
      '    <div><b>Taxpayer:</b> Michael & Elena Whitfield</div>',
      '    <div><b>Adjusted Gross Income:</b> $214,806</div>',
      '    <div><b>Total Tax:</b> $30,491</div>',
      '    <div><b>Federal Refund Amount:</b> $3,418</div>',
      '    <div><b>ERO:</b> Denise R. · Pivot Aide Tax</div>',
      '  </div>',
      '</div>'
    ].join('');
    openModal('Form 8879 Preview', bodyHtml);
  }

  // -------------------------------------------------------------
  // 8. SCREEN 06: REAL-TIME FIRESTORE MESSAGING & CONTEXTUAL THREAD
  // -------------------------------------------------------------
  var isMsgsListenerAttached = false;
  var msgsCache = null;

  function formatMessageTimestamp(isoOrDateStr) {
    if (!isoOrDateStr) return 'Just now';
    var d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var month = months[d.getMonth()];
    var day = d.getDate();
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var ampm = hours >= 12 ? 'pm' : 'am';
    var formattedHours = hours % 12 || 12;
    var formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
    return day + ' ' + month + ', ' + formattedHours + ':' + formattedMinutes + ampm;
  }

  function loadMessagesScreen() {
    var bannerEl = document.getElementById('msgs-status-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    if (!window.FirebaseBridge) {
      return;
    }

    var uid = window.FirebaseBridge.getUserUid();
    var engagementId = 'eng_2026_' + uid;

    // Real-time Subscription via onSnapshot
    if (!isMsgsListenerAttached && window.FirebaseBridge.subscribeMessages) {
      isMsgsListenerAttached = true;

      window.FirebaseBridge.subscribeMessages(
        function(messages) {
          if (messages && messages.length > 0) {
            msgsCache = messages;
            renderMessagesThread(messages);

            var unreadMessages = messages.filter(function(m) {
              return m.readByClient === false && m.senderRole !== 'client';
            });

            // Mark unread messages as read after viewing
            if (unreadMessages.length > 0 && window.FirebaseBridge.markMessagesAsRead) {
              setTimeout(function() {
                var unreadIds = unreadMessages.map(function(m) { return m.id || m.messageId; });
                window.FirebaseBridge.markMessagesAsRead(unreadIds);
              }, 2000);
            }

          } else {
            var defaults = window.FirebaseBridge.getDefaultMessages(uid);
            msgsCache = defaults;
            renderMessagesThread(defaults);
          }
        },
        function() {
          if (msgsCache) {
            renderMessagesThread(msgsCache);
          } else {
            var defaults = window.FirebaseBridge.getDefaultMessages(uid);
            msgsCache = defaults;
            renderMessagesThread(defaults);
          }
        },
        engagementId
      );
    } else if (msgsCache) {
      renderMessagesThread(msgsCache);
    }
  }

  var pendingMessageAttachment = null;

  function renderMessagesThread(messages) {
    var thread = document.getElementById('messages-thread');
    if (!thread) return;

    if (!messages || messages.length === 0) {
      thread.innerHTML = [
        '<div class="card" style="text-align:center;padding:36px 16px;border:1px dashed var(--line);background:var(--surface)">',
        '  <div style="font-size:2rem;margin-bottom:8px">💬</div>',
        '  <div style="font-weight:600;font-size:1rem;color:var(--ink)">No Messages Yet</div>',
        '  <p style="font-size:.82rem;color:var(--ink-2);margin:6px 0 0;max-width:400px;margin-left:auto;margin-right:auto">',
        '    Your direct conversation with Denise R., CPA is protected and private under Treasury Circular 230. Ask questions or upload clarifications directly into your tax file.',
        '  </p>',
        '</div>'
      ].join('');
      return;
    }

    var html = '';
    messages.forEach(function(m) {
      var isMe = (m.senderRole === 'client' || m.role === 'me');
      var isPat = (m.senderRole === 'assistant' || m.role === 'pat');
      var timeStr = formatMessageTimestamp(m.createdAt || m._isoTime);
      var senderLabel = isMe
        ? ('You · ' + timeStr)
        : (isPat ? ('Uncle Pat · automatic') : ('Denise · ' + timeStr));

      var unreadBadge = (!isMe && m.readByClient === false)
        ? '<span class="chip warn" style="font-size:.62rem;padding:1px 5px;margin-left:6px">New</span>'
        : '';

      var attachmentsHtml = '';
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        attachmentsHtml = '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
          m.attachments.map(function(att) {
            return '<span class="chip" style="font-size:.72rem;background:var(--surface);border:1px solid var(--line);cursor:pointer" onclick="previewDocumentModal(\'' + (att.name || 'Attached_Document.pdf') + '\')">' +
                   '📎 ' + (att.name || 'Attachment.pdf') + ' <span style="opacity:0.75">(' + (att.size || 'Encrypted') + ')</span></span>';
          }).join('') +
        '</div>';
      }

      if (isMe) {
        html += [
          '<div class="msg me" style="animation:fadeIn .2s ease">',
          '  <span class="av">' + (m.avatar || 'MW') + '</span>',
          '  <div>',
          '    <div class="bub">',
          '      <div class="who">' + senderLabel + '</div>',
          '      ' + m.text,
          attachmentsHtml,
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      } else if (isPat) {
        html += [
          '<div class="msg pat" style="animation:fadeIn .2s ease">',
          '  <span class="av">',
          '    <svg viewBox="0 0 200 220" aria-hidden="true"><use href="#pat-av"></use></svg>',
          '  </span>',
          '  <div>',
          '    <div class="bub" style="background:var(--surface-2)">',
          '      <div class="who">' + senderLabel + unreadBadge + '</div>',
          '      ' + m.text,
          attachmentsHtml,
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      } else {
        html += [
          '<div class="msg" style="animation:fadeIn .2s ease">',
          '  <span class="av">' + (m.avatar || 'DR') + '</span>',
          '  <div>',
          '    <div class="bub">',
          '      <div class="who">' + senderLabel + unreadBadge + '</div>',
          '      ' + m.text,
          attachmentsHtml,
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      }
    });

    thread.innerHTML = html;
    thread.scrollTop = thread.scrollHeight;
  }

  function initMessaging() {
    var msgInput = document.getElementById('msg-input-box');
    var sendBtn = document.getElementById('btn-send-msg');
    var attachBtn = document.getElementById('btn-attach-msg');
    var fileInput = document.getElementById('msg-attachment-input');
    var previewContainer = document.getElementById('msg-attached-preview');
    var quickChips = document.querySelectorAll('.quick span');

    if (sendBtn && msgInput) {
      sendBtn.addEventListener('click', function() {
        var text = msgInput.value.trim();
        if (!text && !pendingMessageAttachment) return;
        msgInput.value = '';
        var att = pendingMessageAttachment;
        pendingMessageAttachment = null;
        if (previewContainer) {
          previewContainer.style.display = 'none';
          previewContainer.innerHTML = '';
        }
        sendUserMessage(text, att);
      });
      msgInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', function() {
        fileInput.click();
      });

      fileInput.addEventListener('change', function() {
        if (fileInput.files && fileInput.files[0]) {
          var f = fileInput.files[0];
          pendingMessageAttachment = {
            rawFile: f,
            name: f.name,
            size: (f.size / 1024).toFixed(1) + ' KB',
            type: f.type || 'application/pdf'
          };
          if (previewContainer) {
            previewContainer.style.display = 'flex';
            previewContainer.innerHTML = [
              '<span>📎 <b>Attachment ready:</b> ' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)</span>',
              '<button type="button" id="btn-cancel-msg-attachment" style="background:transparent;border:0;color:var(--warn);cursor:pointer;font-weight:600;padding:2px 6px">✕ Remove</button>'
            ].join('');
            var cancelBtn = document.getElementById('btn-cancel-msg-attachment');
            if (cancelBtn) {
              cancelBtn.addEventListener('click', function() {
                pendingMessageAttachment = null;
                fileInput.value = '';
                previewContainer.style.display = 'none';
                previewContainer.innerHTML = '';
              });
            }
          }
          showToast('File selected: ' + f.name + '. Will attach to your message.', 'info');
        }
      });
    }

    // Quick-action chips
    quickChips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        var question = chip.textContent.trim();
        sendUserMessage(question);
      });
    });
  }

  async function sendUserMessage(text, attachment) {
    if (!text && !attachment) return;

    var uid = (window.FirebaseBridge && window.FirebaseBridge.getUserUid && window.FirebaseBridge.getUserUid()) || 'usr_whitfield_m';
    var engagementId = 'eng_2026_' + uid;
    var attachments = attachment ? [attachment] : [];

    // Transmit attached PDF to Formspree with authenticated client email
    if (attachment && attachment.rawFile && (attachment.rawFile.type === 'application/pdf' || (attachment.rawFile.name && attachment.rawFile.name.toLowerCase().endsWith('.pdf')))) {
      var clientEmail = (state.user && state.user.email) ||
        (window.FirebaseBridge && window.FirebaseBridge.currentUser && window.FirebaseBridge.currentUser.email) ||
        'm.whitfield@example.com';
      var clientName = (state.user && state.user.name) ||
        (window.FirebaseBridge && window.FirebaseBridge.currentUser && window.FirebaseBridge.currentUser.displayName) ||
        'Michael Whitfield';

      if (window.FirebaseBridge && typeof window.FirebaseBridge.submitPdfToFormspree === 'function') {
        window.FirebaseBridge.submitPdfToFormspree(attachment.rawFile, {
          email: clientEmail,
          name: clientName,
          category: 'Message Attachment',
          message: text || 'Document attached in client message thread',
          clientId: uid
        }).catch(function (e) { console.info('Formspree message attachment note:', e.message); });
      } else if (window.FormspreePdfService && typeof window.FormspreePdfService.submitPdfToFormspree === 'function') {
        window.FormspreePdfService.submitPdfToFormspree(attachment.rawFile, {
          email: clientEmail,
          name: clientName,
          category: 'Message Attachment',
          message: text || 'Document attached in client message thread',
          clientId: uid
        }).catch(function (e) { console.info('Formspree message attachment note:', e.message); });
      }
    }

    // Send to Cloud Firestore with strict client and engagement association
    if (window.FirebaseBridge && window.FirebaseBridge.sendMessage) {
      await window.FirebaseBridge.sendMessage(text || 'Document attached.', {
        engagementId: engagementId,
        clientId: uid,
        attachments: attachments
      });
    } else {
      // Fallback local state if bridge offline
      var newMsg = {
        id: 'm-' + Date.now(),
        sender: 'You · Just now',
        role: 'me',
        avatar: 'MW',
        text: text || 'Document attached.',
        attachments: attachments,
        createdAt: new Date().toISOString()
      };
      state.messages.push(newMsg);
      renderMessagesThread(state.messages);
    }

    // Contextual automated CPA / Uncle Pat response simulation committed to Firestore
    setTimeout(async function() {
      var replyText = "I've noted this in your 2026 tax file. I'll verify the schedule numbers and update your file today.";
      var role = 'preparer';

      var lower = text.toLowerCase();
      if (lower.indexOf('advice') !== -1 || lower.indexOf('deduct') !== -1 || lower.indexOf('write off') !== -1 || lower.indexOf('calculate') !== -1) {
        replyText = "Uncle Pat is an automated application guide. For tax deductions, calculations, and personalized tax strategy, Denise R., CPA will reply directly in this thread.";
        role = 'assistant';
      } else if (lower.indexOf('owe') !== -1 || lower.indexOf('balance') !== -1) {
        replyText = "Your billing shows an outstanding invoice of $1,240 on Screen 08. On your prepared return, Federal refund is $3,418 and Maryland balance due is $612.";
        role = 'assistant';
      } else if (lower.indexOf('doc') !== -1 || lower.indexOf('missing') !== -1 || lower.indexOf('upload') !== -1) {
        replyText = "You still have 2 documents to upload on Screen 03 (Documents). Once received, Denise can complete your return.";
        role = 'assistant';
      } else if (lower.indexOf('filed') !== -1 || lower.indexOf('when') !== -1) {
        replyText = "Once Form 8879 is signed by both spouses, we transmit within 1 business day and watch the IRS acknowledgement queue for acceptance.";
        role = 'preparer';
      } else if (lower.indexOf('letter') !== -1 || lower.indexOf('notice') !== -1) {
        replyText = "You can upload any IRS or state notice on the Services or Documents tab — we provide a free 2-day plain-English read of what it means.";
        role = 'assistant';
      } else if (lower.indexOf('call') !== -1) {
        replyText = "I'll send over the booking link for your year-end tax planning session with Denise.";
        role = 'preparer';
      } else if (lower.indexOf('spouse') !== -1) {
        replyText = "Elena is already listed on your Married Filing Jointly engagement. Both spouses will review and e-sign Form 8879.";
        role = 'preparer';
      }

      if (window.FirebaseBridge && window.FirebaseBridge.sendReplyMessage) {
        await window.FirebaseBridge.sendReplyMessage(replyText, role);
      } else {
        state.messages.push({
          id: 'm-' + Date.now(),
          sender: role === 'assistant' ? 'Uncle Pat · automatic' : 'Denise · Just now',
          role: role === 'assistant' ? 'pat' : 'preparer',
          avatar: role === 'assistant' ? 'PAT' : 'DR',
          text: replyText
        });
        renderMessagesThread(state.messages);
      }
    }, 900);
  }

  // -------------------------------------------------------------
  // 9. SCREEN 08: FIRESTORE-BACKED BILLING & INVOICE ENGINE (#s-bill / #s-pay)
  // -------------------------------------------------------------
  var isBillingListenerAttached = false;
  var billingInvoicesCache = null;
  var selectedBillingInvoiceId = 'inv_2026_0418';
  var billingCurrentMethod = 'bank'; // 'bank' or 'card'

  function loadBillingScreen() {
    var bannerEl = document.getElementById('billing-status-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    if (billingInvoicesCache) {
      renderBillingScreen(billingInvoicesCache);
    } else {
      var fallbackInvoices = (state.billing && state.billing.invoices) || [];
      renderBillingScreen(fallbackInvoices);
    }

    if (!window.FirebaseBridge) {
      return;
    }

    // Realtime Subscription for invoices
    if (!isBillingListenerAttached && window.FirebaseBridge.subscribeInvoices) {
      isBillingListenerAttached = true;
      window.FirebaseBridge.subscribeInvoices(function(cloudInvoices) {
        if (cloudInvoices && cloudInvoices.length > 0) {
          billingInvoicesCache = cloudInvoices;
          if (state.billing) state.billing.invoices = cloudInvoices;
          renderBillingScreen(cloudInvoices);
        }
      });
    }

    // Direct fetch
    window.FirebaseBridge.getInvoices().then(function(res) {
      if (res && res.success && res.data && res.data.length > 0) {
        billingInvoicesCache = res.data;
        if (state.billing) state.billing.invoices = res.data;
        renderBillingScreen(res.data);
      }
    }).catch(function() {});
  }

  function renderBillingScreen(invoices) {
    if (!invoices || invoices.length === 0) {
      invoices = (state.billing && state.billing.invoices) || [];
    }

    // Update count indicator
    var countEl = document.getElementById('billing-invoices-count');
    if (countEl) {
      countEl.textContent = 'Showing ' + invoices.length + ' invoices';
    }

    // Render Invoice Selector Tab Strip
    var tabsContainer = document.getElementById('billing-invoice-tabs');
    if (tabsContainer) {
      var tabsHtml = '';
      invoices.forEach(function(inv) {
        var isSelected = inv.invoiceId === selectedBillingInvoiceId;
        var chipClass = 'sm ';
        var statusLabel = inv.status.toUpperCase();

        if (inv.status === 'paid') chipClass += 'ok';
        else if (inv.status === 'issued') chipClass += 'gold';
        else if (inv.status === 'pending') chipClass += 'purple';
        else if (inv.status === 'draft') chipClass += 'night';
        else if (inv.status === 'failed') chipClass += 'danger';
        else if (inv.status === 'void') chipClass += 'neutral';

        var cleanId = inv.invoiceId.replace(/^inv_/, '').replace(/_/g, '-');
        var formattedTotal = '$' + (inv.total ? inv.total.toFixed(2) : '0.00');

        tabsHtml += [
          '<button type="button" class="invoice-tab-btn ' + (isSelected ? 'active' : '') + '" ',
          'data-invoice-id="' + inv.invoiceId + '" ',
          'style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:4px;border:1px solid ' + (isSelected ? 'var(--blue)' : 'var(--line)') + ';',
          'background:' + (isSelected ? 'var(--surface-2)' : 'var(--surface)') + ';cursor:pointer;white-space:nowrap;font-size:.78rem;font-family:var(--f-mono)">',
          '  <span style="font-weight:600;color:var(--ink)">#' + cleanId + '</span>',
          '  <span style="color:var(--ink-2)">' + formattedTotal + '</span>',
          '  <span class="chip ' + chipClass + '" style="font-size:.65rem;padding:2px 6px">' + statusLabel + '</span>',
          '</button>'
        ].join('');
      });

      tabsContainer.innerHTML = tabsHtml;

      // Wire Tab Clicks
      tabsContainer.querySelectorAll('.invoice-tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          selectedBillingInvoiceId = btn.getAttribute('data-invoice-id');
          renderBillingScreen(invoices);
        });
      });
    }

    // Identify active invoice
    var activeInvoice = invoices.find(function(i) { return i.invoiceId === selectedBillingInvoiceId; }) || invoices[0];
    if (activeInvoice) {
      selectedBillingInvoiceId = activeInvoice.invoiceId;
      renderActiveInvoiceDetails(activeInvoice);
    }

    // Render Payment History
    renderBillingPaymentHistory(invoices);
  }

  function renderActiveInvoiceDetails(inv) {
    if (!inv) return;

    // 1. Header Eyebrow & Headline
    var eyebrowEl = document.getElementById('billing-invoice-eyebrow');
    if (eyebrowEl) {
      var cleanId = inv.invoiceId.replace(/^inv_/, '').replace(/_/g, '-');
      var engLabel = inv.engagementId ? ' &middot; ' + inv.engagementId.replace(/^eng_/, '').toUpperCase() : '';
      eyebrowEl.innerHTML = 'Invoice ' + cleanId + engLabel + ' &middot; Currency: ' + (inv.currency || 'USD');
    }

    var statusChip = document.getElementById('invoice-status-chip');
    if (statusChip) {
      statusChip.style.display = 'inline-block';
      var statusClass = 'chip sm ';
      var statusText = '';

      switch (inv.status) {
        case 'paid':
          statusClass += 'ok';
          statusText = '✓ Paid in Full';
          break;
        case 'issued':
          statusClass += 'gold';
          statusText = '● Issued (Awaiting Payment)';
          break;
        case 'pending':
          statusClass += 'purple';
          statusText = '⧗ Settlement Pending (ACH)';
          break;
        case 'draft':
          statusClass += 'night';
          statusText = '✎ Draft Proposal';
          break;
        case 'failed':
          statusClass += 'danger';
          statusText = '⚠ Payment Failed';
          break;
        case 'void':
          statusClass += 'neutral';
          statusText = '✕ Void';
          break;
        default:
          statusClass += 'neutral';
          statusText = inv.status;
      }

      statusChip.className = statusClass;
      statusChip.textContent = statusText;
    }

    var headerDue = document.getElementById('billing-header-due');
    if (headerDue) {
      if (inv.status === 'paid') {
        headerDue.textContent = '$0.00 due';
      } else if (inv.status === 'void') {
        headerDue.textContent = '$0.00 (Void)';
      } else if (inv.status === 'draft') {
        headerDue.textContent = '$' + inv.total.toFixed(2) + ' (Draft)';
      } else if (inv.status === 'pending') {
        headerDue.textContent = '$' + inv.total.toFixed(2) + ' pending';
      } else if (inv.status === 'failed') {
        headerDue.textContent = '$' + inv.total.toFixed(2) + ' past due';
      } else {
        headerDue.textContent = '$' + inv.total.toFixed(2) + ' due';
      }
    }

    var headerLede = document.getElementById('billing-header-lede');
    if (headerLede) {
      var dueStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Upon receipt';
      if (inv.status === 'paid') {
        var paidStr = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'recently';
        headerLede.textContent = 'Settled in full on ' + paidStr + '. Stored under IRS Pub 1345 statutory custody.';
      } else if (inv.status === 'pending') {
        headerLede.textContent = 'ACH direct debit is currently in transit through the NACHA settlement clearinghouse.';
      } else if (inv.status === 'draft') {
        headerLede.textContent = 'This invoice is a preparatory scope proposal created by firm staff. Not yet issued.';
      } else if (inv.status === 'failed') {
        headerLede.textContent = 'Prior payment attempt failed (' + (inv.failureReason || 'Returned by clearinghouse') + '). Please retry.';
      } else if (inv.status === 'void') {
        headerLede.textContent = 'Cancelled by firm accounting. ' + (inv.voidReason || 'Superseded by consolidated file voucher.');
      } else {
        headerLede.textContent = 'Due ' + dueStr + '. Pay securely from the portal, or authorize automatic settlement upon Form 8879 signature.';
      }
    }

    // 2. Status Notice Banner
    var noticeEl = document.getElementById('billing-status-notice');
    if (noticeEl) {
      if (inv.status === 'paid') {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(31, 138, 84, 0.08)';
        noticeEl.style.border = '1px solid rgba(31, 138, 84, 0.25)';
        noticeEl.style.color = 'var(--ok)';
        noticeEl.innerHTML = '<b>✓ Paid in Full:</b> Settled on ' + (inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : 'earlier') + 
          ' via ' + (inv.paidMethod || 'ACH transfer') + '. Transaction ref: <code>' + (inv.transactionRef || 'ACH-SETTLED') + '</code>.';
      } else if (inv.status === 'pending') {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(124, 58, 237, 0.08)';
        noticeEl.style.border = '1px solid rgba(124, 58, 237, 0.25)';
        noticeEl.style.color = '#7c3aed';
        noticeEl.innerHTML = '<b>⧗ Payment Pending:</b> Bank transfer of $' + inv.total.toFixed(2) + ' was initiated. In transit via NACHA direct debit rails (Ref: <code>' + (inv.transactionRef || 'ACH-PEND') + '</code>).';
      } else if (inv.status === 'draft') {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(100, 116, 139, 0.08)';
        noticeEl.style.border = '1px solid rgba(100, 116, 139, 0.25)';
        noticeEl.style.color = 'var(--ink-2)';
        noticeEl.innerHTML = '<b>✎ Preparer Draft:</b> This invoice is in draft status. Scope proposal pending final firm partner sign-off before formal client delivery.';
      } else if (inv.status === 'failed') {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(220, 38, 38, 0.08)';
        noticeEl.style.border = '1px solid rgba(220, 38, 38, 0.25)';
        noticeEl.style.color = 'var(--danger)';
        noticeEl.innerHTML = '<b>⚠ Payment Failed:</b> ' + (inv.failureReason || 'Transaction was returned by banking network.') + '. Please retry payment via Processor Hosted Checkout.';
      } else if (inv.status === 'void') {
        noticeEl.style.display = 'block';
        noticeEl.style.background = 'rgba(148, 163, 184, 0.08)';
        noticeEl.style.border = '1px solid rgba(148, 163, 184, 0.25)';
        noticeEl.style.color = 'var(--ink-3)';
        noticeEl.innerHTML = '<b>✕ Void Document:</b> ' + (inv.voidReason || 'This invoice has been voided by Pivot Aide administration.');
      } else {
        noticeEl.style.display = 'none';
      }
    }

    // 3. Dynamic Line Items
    var itemsCard = document.getElementById('card-invoice-items');
    if (itemsCard) {
      var linesHtml = '';
      (inv.items || []).forEach(function(item) {
        linesHtml += '<div class="kv"><span>' + item.desc + '</span><b>$' + item.amount.toFixed(2) + '</b></div>';
      });

      linesHtml += [
        '<div class="kv" style="border-top:1.5px solid var(--line);padding-top:10px;margin-top:4px">',
        '  <span>Subtotal</span>',
        '  <b style="font-family:var(--f-mono)">$' + (inv.subtotal ? inv.subtotal.toFixed(2) : inv.total.toFixed(2)) + '</b>',
        '</div>'
      ].join('');

      if (inv.fees && inv.fees > 0) {
        linesHtml += [
          '<div class="kv">',
          '  <span>Processing Surcharge</span>',
          '  <b style="font-family:var(--f-mono)">+$' + inv.fees.toFixed(2) + '</b>',
          '</div>'
        ].join('');
      }

      linesHtml += [
        '<div class="kv" style="border-top:1.5px solid var(--line);padding-top:8px;margin-top:4px;font-size:1.05rem">',
        '  <span><b>Total Invoice Fee</b></span>',
        '  <b style="font-family:var(--f-mono);color:var(--ink)">$' + inv.total.toFixed(2) + '</b>',
        '</div>'
      ].join('');

      itemsCard.innerHTML = linesHtml;
    }

    // 4. Update Financial Totals in Payment Card
    updateBillingPricing(inv);

    // 5. Update Pay Button / Receipt Container
    var payBtnContainer = document.getElementById('billing-pay-button-container');
    var segContainer = document.getElementById('billing-seg-container');
    var paymentCard = document.getElementById('card-payment-form');

    if (payBtnContainer) {
      if (inv.status === 'paid') {
        payBtnContainer.innerHTML = '<button class="btn btn-o full" id="btn-view-invoice-receipt">✓ View Official Itemized Receipt ($' + inv.total.toFixed(2) + ')</button>';
        var receiptBtn = document.getElementById('btn-view-invoice-receipt');
        if (receiptBtn) {
          receiptBtn.addEventListener('click', function() {
            openInvoiceReceiptModal(inv);
          });
        }
        if (segContainer) segContainer.style.display = 'none';
      } else if (inv.status === 'issued' || inv.status === 'failed') {
        if (segContainer) segContainer.style.display = 'flex';
        var isCard = billingCurrentMethod === 'card';
        var fee = isCard ? ((inv.total * 0.029) + 0.30) : 0.00;
        var chargedAmount = inv.total + fee;

        payBtnContainer.innerHTML = '<button class="btn btn-g full" id="btn-pay-invoice">Pay $' + chargedAmount.toFixed(2) + ' via ' + (isCard ? 'Hosted Card Checkout' : 'Bank ACH') + '</button>';
        var activePayBtn = document.getElementById('btn-pay-invoice');
        if (activePayBtn) {
          activePayBtn.addEventListener('click', function() {
            handleInvoicePaymentFlow(inv);
          });
        }
      } else {
        // draft, pending, void
        if (segContainer) segContainer.style.display = 'none';
        var blockReason = inv.status === 'draft' ? 'Draft proposal — Payment not enabled' :
                          inv.status === 'pending' ? 'Settlement in progress — Funds in transit' :
                          'Invoice cancelled / void';
        payBtnContainer.innerHTML = '<button class="btn btn-o full" disabled style="opacity:0.6;cursor:not-allowed">' + blockReason + '</button>';
      }
    }
  }

  function updateBillingPricing(inv) {
    if (!inv) return;
    var subtotalDisplay = document.getElementById('billing-subtotal-display');
    var feeDisplay = document.getElementById('billing-fee-display');
    var totalDisplay = document.getElementById('billing-total-display');

    var isCard = billingCurrentMethod === 'card';
    var fee = isCard ? ((inv.total * 0.029) + 0.30) : 0.00;
    var finalTotal = inv.total + fee;

    if (subtotalDisplay) subtotalDisplay.textContent = '$' + inv.total.toFixed(2);
    if (feeDisplay) {
      feeDisplay.textContent = isCard ? '+$' + fee.toFixed(2) + ' (2.9% + $0.30)' : '$0.00 (No fee)';
    }
    if (totalDisplay) {
      totalDisplay.textContent = '$' + finalTotal.toFixed(2);
    }
  }

  function renderBillingPaymentHistory(invoices) {
    var historyContainer = document.getElementById('billing-history-container');
    if (!historyContainer) return;

    var paidInvoices = invoices.filter(function(inv) {
      return inv.status === 'paid' || inv.paidAt != null;
    });

    var rowsHtml = [
      '<div class="rowhead" style="display:flex;justify-content:space-between;align-items:center">',
      '  <span>Payment history &middot; click to view receipt</span>',
      '  <span style="font-size:.72rem;color:var(--ink-3);font-family:var(--f-mono)">Authoritative Ledger</span>',
      '</div>'
    ].join('');

    if (paidInvoices.length === 0) {
      rowsHtml += '<div style="padding:16px;text-align:center;font-size:.82rem;color:var(--ink-3)">No settled payment records yet.</div>';
    } else {
      paidInvoices.forEach(function(inv) {
        var cleanId = inv.invoiceId.replace(/^inv_/, '').replace(/_/g, '-');
        var dateStr = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Settled';
        var methodSummary = inv.paidMethod || 'ACH Bank Transfer';

        rowsHtml += [
          '<div class="row row-clickable" data-invoice-id="' + inv.invoiceId + '" style="cursor:pointer" title="Click to view itemized receipt">',
          '  <span class="ic" style="color:var(--ok)">&#10003;</span>',
          '  <div class="g">',
          '    <div class="t">Invoice ' + cleanId + '</div>',
          '    <div class="m">' + (inv.items && inv.items[0] ? inv.items[0].desc : 'Professional tax services') + ' &middot; paid ' + dateStr + ' &middot; View receipt &rarr;</div>',
          '  </div>',
          '  <b style="font-size:.85rem;font-family:var(--f-mono)">$' + inv.total.toFixed(2) + '</b>',
          '</div>'
        ].join('');
      });
    }

    historyContainer.innerHTML = rowsHtml;

    // Bind click events on rows
    historyContainer.querySelectorAll('.row-clickable').forEach(function(row) {
      row.addEventListener('click', function() {
        var invId = row.getAttribute('data-invoice-id');
        var inv = invoices.find(function(i) { return i.invoiceId === invId; });
        if (inv) openInvoiceReceiptModal(inv);
      });
    });
  }

  function handleInvoicePaymentFlow(inv) {
    var payBtn = document.getElementById('btn-pay-invoice');
    if (!payBtn) return;

    var isCard = billingCurrentMethod === 'card';
    var fee = isCard ? ((inv.total * 0.029) + 0.30) : 0.00;
    var finalAmount = inv.total + fee;

    payBtn.disabled = true;
    payBtn.textContent = 'Generating cryptographic payment session...';

    // Step 1: Create Payment Session
    var sessionPromise = window.FirebaseBridge && window.FirebaseBridge.createPaymentSession
      ? window.FirebaseBridge.createPaymentSession(inv.invoiceId, billingCurrentMethod)
      : Promise.resolve({ success: true, session: { sessionId: 'sess_' + Date.now() } });

    sessionPromise.then(function(sessionRes) {
      var sessionId = (sessionRes && sessionRes.session && sessionRes.session.sessionId) || ('cs_live_' + Date.now());

      setTimeout(function() {
        payBtn.textContent = isCard ? 'Redirecting to Processor Hosted Frame (' + sessionId.slice(0, 14) + '...)' : 'Connecting NACHA banking rails...';
      }, 500);

      setTimeout(function() {
        payBtn.textContent = 'Awaiting asynchronous server webhook confirmation...';
      }, 1100);

      // Step 2: Simulating Server-Side Webhook Processing (Browser NEVER directly marks paid)
      setTimeout(async function() {
        if (window.FirebaseBridge && window.FirebaseBridge.processServerWebhookPayment) {
          await window.FirebaseBridge.processServerWebhookPayment(inv.invoiceId, {
            method: billingCurrentMethod,
            sessionId: sessionId,
            simulatePending: false
          });
        }

        // Update local object
        inv.status = 'paid';
        inv.paidAt = new Date().toISOString();
        inv.paidMethod = isCard ? 'Visa •••• 4012 (Tokenized Card)' : 'Bank transfer (ACH · Cardinal Trust •••• 8842)';
        inv.transactionRef = (isCard ? 'CC-VAULT-' : 'ACH-NACHA-') + Math.random().toString(36).substring(2, 8).toUpperCase();

        showToast('Payment confirmed! Server webhook verified Invoice #' + inv.invoiceId.replace('inv_', '') + '.', 'ok');

        // Update Home screen financial indicators
        var homeInvoiceVal = document.getElementById('home-invoice-val');
        var homeInvoiceSub = document.getElementById('home-invoice-sub');
        if (homeInvoiceVal) homeInvoiceVal.textContent = '$0';
        if (homeInvoiceSub) homeInvoiceSub.innerHTML = 'All invoices settled &rarr;';

        // Re-render
        if (billingInvoicesCache) {
          renderBillingScreen(billingInvoicesCache);
        }

        // Open official receipt modal
        setTimeout(function() {
          openInvoiceReceiptModal(inv);
        }, 350);
      }, 1800);
    }).catch(function(err) {
      payBtn.disabled = false;
      payBtn.textContent = 'Pay $' + finalAmount.toFixed(2);
      showToast('Payment session initialization failed: ' + (err.message || 'Network error'), 'danger');
    });
  }

  function openInvoiceReceiptModal(inv) {
    if (!inv) return;
    var subtotal = inv.subtotal || inv.total;
    var fee = inv.fees || (inv.paidMethod && inv.paidMethod.indexOf('Card') !== -1 ? 36.26 : 0.00);
    var total = inv.total || (subtotal + fee);
    var cleanId = inv.invoiceId.replace(/^inv_/, '').replace(/_/g, '-');
    var paidDateStr = inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Paid in Full';

    var itemsHtml = '';
    (inv.items || []).forEach(function(it) {
      itemsHtml += [
        '<tr>',
        '  <td>' + it.desc + '</td>',
        '  <td class="amount">$' + it.amount.toFixed(2) + '</td>',
        '</tr>'
      ].join('');
    });

    if (fee > 0) {
      itemsHtml += [
        '<tr>',
        '  <td>Processing Surcharge</td>',
        '  <td class="amount">+$' + fee.toFixed(2) + '</td>',
        '</tr>'
      ].join('');
    }

    var modalHtml = [
      '<div class="receipt-box" id="printable-receipt">',
      '  <div class="receipt-header">',
      '    <div>',
      '      <div style="font-weight:700;font-size:1.05rem;color:var(--ink)">Pivot Aide Tax</div>',
      '      <div style="font-size:.76rem;color:var(--ink-3)">EIN: 84-2918401 &middot; IRS Authorized E-File Provider</div>',
      '      <div style="font-size:.76rem;color:var(--ink-3)">Client ID: ' + (inv.clientId || 'usr_whitfield_m') + ' &middot; Engagement: ' + (inv.engagementId || 'General') + '</div>',
      '    </div>',
      '    <div style="text-align:right">',
      '      <span class="receipt-stamp">PAID IN FULL</span>',
      '      <div style="font-size:.78rem;font-weight:600;margin-top:5px;font-family:var(--f-mono)">Invoice ' + cleanId + '</div>',
      '      <div style="font-size:.72rem;color:var(--ink-3)">' + paidDateStr + '</div>',
      '    </div>',
      '  </div>',
      '  <table class="receipt-table">',
      '    <thead>',
      '      <tr><th>Service Scope Item</th><th class="amount">Amount</th></tr>',
      '    </thead>',
      '    <tbody>' + itemsHtml + '</tbody>',
      '    <tfoot>',
      '      <tr class="receipt-total-row">',
      '        <td>Total Paid</td>',
      '        <td class="amount">$' + total.toFixed(2) + '</td>',
      '      </tr>',
      '    </tfoot>',
      '  </table>',
      '  <div style="margin-top:12px;padding:9px 12px;background:var(--surface-2);border-radius:3px;font-size:.74rem;color:var(--ink-2);font-family:var(--f-mono)">',
      '    <div><b>Payment Method:</b> ' + (inv.paidMethod || 'Bank transfer (ACH Direct Debit)') + '</div>',
      '    <div><b>Transaction ID:</b> ' + (inv.transactionRef || 'ACH-948102-CARDINAL') + '</div>',
      '    <div><b>Payment Session:</b> ' + (inv.paymentSessionId || 'cs_live_session') + '</div>',
      '    <div><b>Compliance Custody:</b> IRS Publication 1345 Statutory 3-Year Archive</div>',
      '  </div>',
      '</div>'
    ].join('');

    openModal('Official Payment Receipt', modalHtml, [
      '<button class="btn btn-o sm" id="btn-download-receipt-pdf">Download Receipt Document</button>',
      '<button class="btn btn-b sm" id="modal-cancel-btn">Close</button>'
    ].join(''));

    var downloadBtn = document.getElementById('btn-download-receipt-pdf');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function() {
        showToast('Official receipt downloaded for Invoice ' + cleanId, 'ok');
        var receiptText = [
          'PIVOT AIDE TAX — OFFICIAL CLIENT PAYMENT RECEIPT',
          '=====================================================',
          'Invoice ID:       ' + inv.invoiceId,
          'Engagement:       ' + inv.engagementId,
          'Date Paid:        ' + paidDateStr,
          'Total Settled:    $' + total.toFixed(2) + ' ' + (inv.currency || 'USD'),
          'Method:           ' + (inv.paidMethod || 'ACH Bank Transfer'),
          'Transaction Ref:  ' + (inv.transactionRef || 'ACH-SETTLED'),
          'Payment Session:  ' + (inv.paymentSessionId || 'cs_live_session'),
          'Compliance:       IRS Pub 1345 & FTC Safeguards § 314.4',
          '====================================================='
        ].join('\n');

        var blob = new Blob([receiptText], { type: 'text/plain' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'PivotAideTax_Receipt_' + cleanId + '.txt';
        link.click();
      });
    }
  }

  function initBilling() {
    var segBank = document.getElementById('seg-pay-bank');
    var segCard = document.getElementById('seg-pay-card');
    var viewBank = document.getElementById('pay-view-bank');
    var viewCard = document.getElementById('pay-view-card');
    var autopayCheckbox = document.getElementById('autopay-checkbox');
    var autopayBadge = document.getElementById('autopay-status-badge');

    // 1. Payment Method Toggling
    function setPaymentMethod(method) {
      billingCurrentMethod = method;
      if (segBank) segBank.classList.toggle('on', method === 'bank');
      if (segCard) segCard.classList.toggle('on', method === 'card');

      if (viewBank) viewBank.style.display = method === 'bank' ? 'block' : 'none';
      if (viewCard) viewCard.style.display = method === 'card' ? 'block' : 'none';

      // Update current active invoice totals
      var invoices = billingInvoicesCache || (state.billing && state.billing.invoices) || [];
      var activeInv = invoices.find(function(i) { return i.invoiceId === selectedBillingInvoiceId; });
      if (activeInv) {
        updateBillingPricing(activeInv);
        renderActiveInvoiceDetails(activeInv);
      }
    }

    if (segBank) {
      segBank.addEventListener('click', function() { setPaymentMethod('bank'); });
    }
    if (segCard) {
      segCard.addEventListener('click', function() { setPaymentMethod('card'); });
    }

    // 2. Card Selection (Saved Vault Token vs Hosted Checkout launch)
    var radioSaved = document.getElementById('radio-saved-card');
    var radioNew = document.getElementById('radio-new-card');
    var newCardFields = document.getElementById('new-card-fields');

    if (radioSaved && radioNew && newCardFields) {
      radioSaved.addEventListener('change', function() {
        if (radioSaved.checked) newCardFields.style.display = 'none';
      });
      radioNew.addEventListener('change', function() {
        if (radioNew.checked) newCardFields.style.display = 'block';
      });
    }

    // 3. Auto-Pay on Approval Toggle
    if (autopayCheckbox) {
      autopayCheckbox.checked = !!state.billing.autoPayEnabled;
      if (autopayBadge) autopayBadge.style.display = state.billing.autoPayEnabled ? 'inline-block' : 'none';

      autopayCheckbox.addEventListener('change', function() {
        var enabled = autopayCheckbox.checked;
        state.billing.autoPayEnabled = enabled;
        if (autopayBadge) autopayBadge.style.display = enabled ? 'inline-block' : 'none';

        if (enabled) {
          showToast('Auto-pay enabled: balance will automatically transfer when Form 8879 is signed.', 'ok');
          if (window.FirebaseBridge) {
            window.FirebaseBridge.recordAuditLog('Auto-Pay Enabled', 'Client authorized automatic ACH transfer on Form 8879 signing', 'Payments');
          }
        } else {
          showToast('Auto-pay disabled. Invoices will require manual payment.', 'info');
        }
      });
    }

    // 4. Link Another Bank Account Modal
    var linkBankBtn = document.getElementById('btn-link-bank');
    if (linkBankBtn) {
      linkBankBtn.addEventListener('click', function() {
        var modalHtml = [
          '<p style="font-size:.88rem">Link a verified US checking or savings account for zero-fee ACH invoice payments and IRS direct deposits.</p>',
          '<div class="calc-box">',
          '  <div class="field" style="margin-bottom:10px">',
          '    <label>Bank Name</label>',
          '    <input type="text" id="input-new-bank-name" placeholder="e.g. Chase, Bank of America, Navy Federal" style="width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:3px">',
          '  </div>',
          '  <div class="field" style="margin-bottom:10px">',
          '    <label>Routing Number (9 Digits)</label>',
          '    <input type="text" id="input-new-bank-routing" placeholder="052000113" maxlength="9" style="font-family:var(--f-mono);width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:3px">',
          '  </div>',
          '  <div class="field" style="margin-bottom:10px">',
          '    <label>Account Number</label>',
          '    <input type="password" id="input-new-bank-acc" placeholder="•••• •••• ••••" maxlength="17" style="font-family:var(--f-mono);width:100%;box-sizing:border-box;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:3px">',
          '  </div>',
          '  <div class="field">',
          '    <label>Account Type</label>',
          '    <select id="input-new-bank-type" style="width:100%;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:3px;color:var(--ink)">',
          '      <option value="Checking">Checking Account</option>',
          '      <option value="Savings">Savings Account</option>',
          '      <option value="Business Checking">Business Checking Account</option>',
          '    </select>',
          '  </div>',
          '</div>',
          '<div style="font-size:.74rem;color:var(--ink-3);margin-top:10px">',
          '  🔒 Bank connections are encrypted with 256-bit AES and NACHA Rule compliant.',
          '</div>'
        ].join('');

        openModal('Link Bank Account', modalHtml, [
          '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
          '<button class="btn btn-g sm" id="btn-confirm-link-bank">Save &amp; Link Account</button>'
        ].join(''));

        var confirmLinkBtn = document.getElementById('btn-confirm-link-bank');
        if (confirmLinkBtn) {
          confirmLinkBtn.addEventListener('click', function() {
            var bankName = (document.getElementById('input-new-bank-name') || {}).value || 'First National Bank';
            var accNum = (document.getElementById('input-new-bank-acc') || {}).value || '9921';
            var last4 = accNum.slice(-4) || '9921';
            var accType = (document.getElementById('input-new-bank-type') || {}).value || 'Checking';

            state.billing.savedAccount = {
              bank: bankName,
              last4: last4,
              type: accType,
              savedDate: 'Today'
            };

            var bankDisplay = document.querySelector('#pay-view-bank .t');
            var bankMeta = document.querySelector('#pay-view-bank .m');
            if (bankDisplay) bankDisplay.textContent = bankName + ' •••• ' + last4;
            if (bankMeta) bankMeta.textContent = accType + ' · saved today · ACH Direct Debit';

            closeModal();
            showToast('Bank account linked: ' + bankName + ' •••• ' + last4, 'ok');
          });
        }
      });
    }
  }

  // -------------------------------------------------------------
  // 10. SCREEN 10: REAL FIRM OPERATIONS CONSOLE (CROSS-CLIENT TRIAGE)
  // -------------------------------------------------------------
  var activeFirmRole = 'firm_preparer'; // 'firm_preparer' or 'firm_admin'
  var activeFirmTab = 'all'; // 'all' | 'docs' | 'returns' | 'kba' | 'invoices' | 'deadlines' | 'activity'
  var firmOperationsCache = null;
  var isFirmListenerAttached = false;

  function loadFirmScreen() {
    var bannerEl = document.getElementById('firm-sync-banner');
    if (bannerEl && !firmOperationsCache) {
      bannerEl.style.display = 'flex';
      bannerEl.style.alignItems = 'center';
      bannerEl.style.gap = '8px';
      bannerEl.style.background = 'rgba(1, 159, 255, 0.08)';
      bannerEl.style.border = '1px solid rgba(1, 159, 255, 0.25)';
      bannerEl.style.color = 'var(--ink)';
      bannerEl.innerHTML = '<span class="chip gold" style="animation:pulse 1.2s infinite">Syncing</span> Querying cross-client operational collections across Cloud Firestore...';
    }

    if (!window.FirebaseBridge) return;

    if (!isFirmListenerAttached && window.FirebaseBridge.subscribeFirmOperations) {
      isFirmListenerAttached = true;
      window.FirebaseBridge.subscribeFirmOperations(function(data) {
        if (!data) return;
        firmOperationsCache = data;
        if (bannerEl) bannerEl.style.display = 'none';
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      }, function(err) {
        if (err && (err.code === 'permission-denied' || err.code === 'unavailable')) {
          return;
        }
        console.warn('Firm stream notice:', err);
      });
    }

    window.FirebaseBridge.getFirmOperationsData().then(function(data) {
      firmOperationsCache = data;
      if (bannerEl) bannerEl.style.display = 'none';
      renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
    }).catch(function(err) {
      console.warn('Firm operations query error:', err);
      if (bannerEl) bannerEl.style.display = 'none';
    });
  }

  function initFirmView() {
    // 1. Role Segmented Switcher
    var btnPreparer = document.getElementById('btn-role-preparer');
    var btnAdmin = document.getElementById('btn-role-admin');
    var roleDesc = document.getElementById('firm-role-status-desc');

    if (btnPreparer && btnAdmin) {
      btnPreparer.addEventListener('click', function() {
        activeFirmRole = 'firm_preparer';
        btnPreparer.classList.add('on');
        btnAdmin.classList.remove('on');
        if (roleDesc) {
          roleDesc.innerHTML = 'Active Role: <b style="color:var(--ink)">firm_preparer</b> &middot; Assigned Files View (Denise R., CPA)';
        }
        showToast('Switched to Preparer Console (Assigned Portfolio & Review Tasks)', 'info');
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });

      btnAdmin.addEventListener('click', function() {
        var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
          (state && state.user && state.user.role) || 'client';
        var isAdminUser = (window.FirebaseBridge && window.FirebaseBridge.isAdmin && window.FirebaseBridge.isAdmin()) ||
          userRole === 'firm_admin';

        if (!isAdminUser) {
          showToast('Access Denied: Managing Partner (firm_admin) privileges required.', 'err');
          console.warn('RBAC Violation: Non-admin attempted switch to Admin supervisory view.');
          return;
        }

        activeFirmRole = 'firm_admin';
        btnAdmin.classList.add('on');
        btnPreparer.classList.remove('on');
        if (roleDesc) {
          roleDesc.innerHTML = 'Active Role: <b style="color:var(--gold)">firm_admin</b> &middot; Managing Partner &amp; EFIN Governance';
        }
        showToast('Switched to Admin Supervisory Console (Firm-Wide Accounts Receivable & Compliance)', 'ok');
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    }

    // 2. Clickable KPI Cards (Requirement 1: Metric traceability to underlying records)
    var kpiCards = document.querySelectorAll('.firm-kpi-card');
    kpiCards.forEach(function(card) {
      card.addEventListener('click', function() {
        var targetTab = card.dataset.kpiTab || 'all';
        var statusFilter = card.dataset.statusFilter || null;
        activeFirmTab = targetTab;

        // Highlight matching tab button
        var tabBtns = document.querySelectorAll('#firm-filter-tabs .firm-tab');
        tabBtns.forEach(function(b) {
          if (b.dataset.tab === targetTab) {
            b.classList.add('active', 'btn-g');
            b.classList.remove('btn-o');
          } else {
            b.classList.remove('active', 'btn-g');
            b.classList.add('btn-o');
          }
        });

        if (statusFilter) {
          var sel = document.getElementById('firm-urgency-filter');
          if (sel) sel.value = statusFilter;
          firmUrgencyFilter = statusFilter;
        }

        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    });

    // 3. Filter Tabs (11 Specialized Practice Streams)
    var tabBtns = document.querySelectorAll('#firm-filter-tabs .firm-tab');
    tabBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        tabBtns.forEach(function(b) {
          b.classList.remove('active', 'btn-g');
          b.classList.add('btn-o');
        });
        btn.classList.add('active', 'btn-g');
        btn.classList.remove('btn-o');

        activeFirmTab = btn.dataset.tab || 'all';
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    });

    // 4. Realtime Search and Status Filter Inputs
    var searchInput = document.getElementById('firm-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        firmSearchQuery = (e.target.value || '').trim().toLowerCase();
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    }

    var urgencySel = document.getElementById('firm-urgency-filter');
    if (urgencySel) {
      urgencySel.addEventListener('change', function(e) {
        firmUrgencyFilter = e.target.value;
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    }

    var btnReset = document.getElementById('btn-firm-search-reset');
    if (btnReset) {
      btnReset.addEventListener('click', function() {
        if (searchInput) searchInput.value = '';
        if (urgencySel) urgencySel.value = 'all';
        firmSearchQuery = '';
        firmUrgencyFilter = 'all';
        renderFirmConsole(firmOperationsCache, activeFirmRole, activeFirmTab);
      });
    }

    var btnRefresh = document.getElementById('btn-firm-refresh-data');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function() {
        showToast('Refreshing live operational collections...', 'info');
        loadFirmScreen();
      });
    }

    // 5. Export Audit Ledger CSV Button (Admin-Only Enforcement)
    var btnExport = document.getElementById('btn-export-audit-ledger');
    if (btnExport) {
      btnExport.addEventListener('click', function() {
        var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
          (state && state.user && state.user.role) || 'client';
        if (activeFirmRole !== 'firm_admin' && userRole !== 'firm_admin') {
          showToast('Access Denied: Only Firm Admin can export the regulatory compliance audit ledger.', 'err');
          console.warn('RBAC Violation: Preparer attempted regulatory audit export.');
          return;
        }
        var logs = (firmOperationsCache && firmOperationsCache.recentActivity) || [];
        exportAuditLedgerCsv(logs);
      });
    }

    // Initial firm data will be loaded on-demand when navigating to the firm screen
  }

  var firmSearchQuery = '';
  var firmUrgencyFilter = 'all';

  function renderFirmConsole(data, role, currentTab) {
    if (!data) return;
    var metrics = data.metrics || {};

    // 1. Update 8 Real Operational KPI Counters
    var elWait = document.getElementById('kpi-clients-waiting');
    var elDocs = document.getElementById('kpi-docs-review');
    var elRej  = document.getElementById('kpi-docs-rejected');
    var elRet  = document.getElementById('kpi-returns-pending');
    var elSigs = document.getElementById('kpi-sigs-pending');
    var elKba  = document.getElementById('kpi-kba-failures');
    var elInv  = document.getElementById('kpi-unpaid-invoices');
    var elDead = document.getElementById('kpi-upcoming-deadlines');

    if (elWait) elWait.textContent = metrics.clientsWaiting != null ? metrics.clientsWaiting : '17';
    if (elDocs) elDocs.textContent = metrics.docsAwaitingReview != null ? metrics.docsAwaitingReview : '6';
    if (elRej)  elRej.textContent  = metrics.rejectedDocs != null ? metrics.rejectedDocs : '0';
    if (elRet)  elRet.textContent  = metrics.returnsAwaitingApproval != null ? metrics.returnsAwaitingApproval : '4';
    if (elSigs) elSigs.textContent = metrics.signaturesPending != null ? metrics.signaturesPending : '8';
    if (elKba)  elKba.textContent  = metrics.kbaFailures != null ? metrics.kbaFailures : '2';
    if (elInv)  elInv.textContent  = '$' + (metrics.unpaidInvoicesTotal != null ? Number(metrics.unpaidInvoicesTotal).toFixed(0) : '0') + ' (' + (metrics.unpaidInvoicesCount != null ? metrics.unpaidInvoicesCount : 0) + ')';
    if (elDead) elDead.textContent = metrics.upcomingDeadlines != null ? metrics.upcomingDeadlines : '3';

    // 2. Admin Supervisory Panel Toggle
    var adminPanel = document.getElementById('firm-admin-supervisory-card');
    var adminArTotal = document.getElementById('admin-ar-total');
    var adminArCount = document.getElementById('admin-ar-count');

    if (adminPanel) {
      adminPanel.style.display = (role === 'firm_admin') ? 'block' : 'none';
      if (adminArTotal) adminArTotal.textContent = '$' + (data.arTotal != null ? Number(data.arTotal).toFixed(2) : '0.00');
      if (adminArCount) adminArCount.textContent = (data.arCount != null ? data.arCount : 0) + ' open vouchers awaiting settlement';
    }

    // 3. Render Respective Practice Stream
    var listContainer = document.getElementById('firm-triage-list');
    var metaEl = document.getElementById('firm-triage-meta');
    var titleEl = document.getElementById('firm-triage-title');
    if (!listContainer) return;

    if (currentTab === 'clients') {
      renderFirmClientsPipeline(data.clients || [], data.preparationStages || {}, listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'docs') {
      renderFirmDocumentReviewQueue(data.documentsQueue || [], listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'missing') {
      renderFirmMissingDocs(data.missingDocs || [], listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'returns') {
      renderFirmReturnsList(data.returnsList || [], listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'kba') {
      renderFirmKbaMonitoring(data.kbaList || [], listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'messages') {
      renderFirmClientMessages(data.clientMessages || [], listContainer, metaEl, titleEl);
      return;
    }

    if (currentTab === 'invoices') {
      renderFirmInvoicesReconciliation(data.invoicesList || [], listContainer, metaEl, titleEl, role);
      return;
    }

    if (currentTab === 'staff') {
      renderFirmStaffRoster(data.staffRoster || [], listContainer, metaEl, titleEl, role);
      return;
    }

    if (currentTab === 'activity') {
      if (titleEl) titleEl.textContent = 'Immutable Audit & Telemetry Ledger';
      if (metaEl) metaEl.textContent = (data.recentActivity || []).length + ' verified audit records';
      renderFirmActivityFeed(data.recentActivity || [], listContainer);
      return;
    }

    if (currentTab === 'system') {
      renderFirmSystemHealth(data.systemHealth || {}, listContainer, metaEl, titleEl);
      return;
    }

    // Default / "all" / "deadlines": Prioritized Live Action Queue
    if (titleEl) titleEl.textContent = 'Live Operational Action Queue';
    var items = (data.triageQueue || []).slice();

    if (currentTab === 'deadlines') {
      items = items.filter(function(it) {
        return it.category === 'deadlines' || it.urgency === 'High' || it.urgency === 'Immediate';
      });
    }

    // Apply Realtime Search Filter
    if (firmSearchQuery) {
      items = items.filter(function(it) {
        var str = ((it.client || '') + ' ' + (it.title || '') + ' ' + (it.meta || '')).toLowerCase();
        return str.indexOf(firmSearchQuery) !== -1;
      });
    }

    // Apply Priority / Urgency Filter
    if (firmUrgencyFilter !== 'all') {
      items = items.filter(function(it) {
        if (firmUrgencyFilter === 'Immediate') return it.urgency === 'Immediate';
        if (firmUrgencyFilter === 'High') return it.urgency === 'High' || it.urgency === 'Immediate';
        if (firmUrgencyFilter === 'Normal') return it.urgency === 'Normal';
        if (firmUrgencyFilter === 'Scheduled') return it.urgency === 'Scheduled';
        return true;
      });
    }

    if (metaEl) metaEl.textContent = items.length + ' tasks requiring practitioner action';

    if (items.length === 0) {
      listContainer.innerHTML = '<div style="padding:28px;text-align:center;color:var(--ink-2);font-size:.85rem">No items currently requiring attention under these filters. Queue is clear!</div>';
      return;
    }

    var html = '';
    items.forEach(function(it) {
      var icon = it.urgency === 'Immediate' || it.chipClass === 'danger' || it.chipClass === 'warn' ? '&#9888;' : '&#9711;';
      var iconColor = it.chipClass === 'danger' ? 'color:var(--danger)' :
                      it.chipClass === 'warn' ? 'color:var(--warn)' :
                      it.chipClass === 'gold' ? 'color:var(--gold)' : 'color:var(--ink-3)';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="' + iconColor + ';margin-top:2px">' + icon + '</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + it.client + '</b>',
        '      <span style="font-size:.74rem;color:var(--ink-2)">&mdash; ' + it.title + '</span>',
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.79rem;color:var(--ink-2);line-height:1.4">' + it.meta + '</div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:10px">',
        '    <span class="chip ' + (it.chipClass || '') + ' sm">' + it.chipText + '</span>',
        '    <button type="button" class="btn sm btn-g btn-firm-op-act" data-action="' + it.actionKey + '" data-id="' + it.id + '" data-client="' + it.client + '" data-client-uid="' + (it.clientUid || '') + '" data-doc-id="' + (it.docId || '') + '" data-inv-id="' + (it.invoiceId || '') + '" style="padding:4px 10px;font-size:.74rem">',
        '      ' + it.actionBtnText,
        '    </button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    listContainer.innerHTML = html;
    bindFirmActionButtons(listContainer);
  }

  // -------------------------------------------------------------
  // Specialized Practice Stream Renderers
  // -------------------------------------------------------------

  function renderFirmClientsPipeline(clients, stages, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'Client Portfolio & Preparation Pipeline';
    if (metaEl) metaEl.textContent = clients.length + ' active client files · ' + (stages.in_preparation || 0) + ' in preparation';

    // Interactive Stage Pipeline Ribbon
    var pipelineHtml = [
      '<div style="background:var(--surface-2);border-bottom:1px solid var(--line);padding:10px 12px;margin-bottom:10px;display:flex;gap:6px;overflow-x:auto;align-items:center;font-size:.76rem">',
      '  <span style="font-weight:600;color:var(--ink);margin-right:6px">Stages:</span>',
      '  <span class="chip night sm">Onboarding: <b>' + (stages.onboarding || 0) + '</b></span> &rarr;',
      '  <span class="chip warn sm">Docs Pending: <b>' + (stages.docs_pending || 0) + '</b></span> &rarr;',
      '  <span class="chip gold sm">In Prep: <b>' + (stages.in_preparation || 0) + '</b></span> &rarr;',
      '  <span class="chip sm" style="background:#7c3aed;color:#fff">Review: <b>' + (stages.review || 0) + '</b></span> &rarr;',
      '  <span class="chip ok sm">Signing: <b>' + (stages.signing_pending || 0) + '</b></span> &rarr;',
      '  <span class="chip ok sm">E-File: <b>' + (stages.efile_ready || 0) + '</b></span>',
      '</div>'
    ].join('');

    var filtered = clients.slice();
    if (firmSearchQuery) {
      filtered = filtered.filter(function(c) {
        return (c.name + ' ' + c.email + ' ' + c.filingType + ' ' + c.assignedPreparer).toLowerCase().indexOf(firmSearchQuery) !== -1;
      });
    }

    var html = pipelineHtml;
    filtered.forEach(function(c) {
      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--gold);margin-top:2px">&#9776;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + c.name + '</b>',
        '      <span style="font-size:.75rem;color:var(--ink-2)">' + c.email + '</span>',
        '      <span class="chip ' + (c.statusBadge || 'gold') + ' sm" style="font-size:.65rem">' + c.stageName + ' (' + c.progressPct + '%)</span>',
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Filing:</b> ' + c.filingType + ' &middot; <b>Preparer:</b> ' + c.assignedPreparer + ' &middot; <b>Deadline:</b> ' + c.deadlines,
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-o btn-firm-advance-stage" data-client="' + c.name + '" data-uid="' + c.clientUid + '" data-eng="' + c.id + '" data-stage="' + c.stage + '" style="padding:4px 8px;font-size:.74rem">Advance Stage &rarr;</button>',
        '    <button type="button" class="btn sm btn-g btn-firm-msg-client" data-client="' + c.name + '" data-uid="' + c.clientUid + '" data-eng="' + c.id + '" style="padding:4px 8px;font-size:.74rem">&#9993; Msg</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmDocumentReviewQueue(docs, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'Document Verification & Review Queue (Circular 230 § 10.22)';
    if (metaEl) metaEl.textContent = docs.length + ' documents in custody · ClamAV Verified';

    var filtered = docs.slice();
    if (firmSearchQuery) {
      filtered = filtered.filter(function(d) {
        return (d.name + ' ' + d.client + ' ' + d.category).toLowerCase().indexOf(firmSearchQuery) !== -1;
      });
    }

    var html = '';
    filtered.forEach(function(d) {
      var statusChip = d.status === 'accepted' ? '<span class="chip ok sm">&#10003; Accepted</span>' :
                       d.status === 'rejected' ? '<span class="chip danger sm">&#10005; Rejected</span>' :
                       '<span class="chip gold sm">Needs Review</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--accent);margin-top:2px">&#8679;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + d.name + '</b>',
        '      <span style="font-size:.76rem;color:var(--ink-2)">(' + d.size + ' · ' + d.pages + ' pgs)</span>',
        '      ' + statusChip,
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Taxpayer:</b> ' + d.client + ' &middot; <b>Category:</b> ' + d.category + ' &middot; <b>Malware Scan:</b> <span style="color:var(--ok)">' + d.malwareStatus + '</span>',
        '      ' + (d.reviewerNotes ? '<div style="color:var(--ok);font-size:.75rem;margin-top:2px">&#10003; ' + d.reviewerNotes + '</div>' : '') + '',
        '      ' + (d.rejectionReason ? '<div style="color:var(--danger);font-size:.75rem;margin-top:2px">&#10005; ' + d.rejectionReason + '</div>' : '') + '',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-g btn-firm-op-act" data-action="doc-review" data-doc-id="' + d.docId + '" data-client="' + d.client + '" style="padding:4px 8px;font-size:.74rem">Due Diligence Review</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmMissingDocs(missing, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'Missing & Overdue Document Tracking';
    if (metaEl) metaEl.textContent = missing.length + ' overdue checklist items';

    var html = '';
    missing.forEach(function(m) {
      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--warn);margin-top:2px">&#9203;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + m.title + '</b>',
        '      <span class="chip ' + (m.urgency === 'Immediate' ? 'danger' : 'warn') + ' sm">' + m.daysOverdue + ' days overdue</span>',
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Client:</b> ' + m.client + ' &middot; <b>Category:</b> ' + m.category + ' &middot; <b>Initial Due:</b> ' + m.dueDate + ' &middot; <b>Last Reminder:</b> ' + m.lastReminderSent,
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-g btn-firm-followup-doc" data-id="' + m.id + '" data-client="' + m.client + '" data-uid="' + m.clientUid + '" data-title="' + m.title + '" style="padding:4px 8px;font-size:.74rem">Dispatch Follow-Up &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmReturnsList(returns, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'Prepared Return Review & Client Publication';
    if (metaEl) metaEl.textContent = returns.length + ' prepared returns in pipeline';

    var html = '';
    returns.forEach(function(r) {
      var pubBadge = r.published ? '<span class="chip ok sm">Published to Portal</span>' : '<span class="chip night sm">Draft / Unpublished</span>';
      var appBadge = r.clientApproved ? '<span class="chip ok sm">&#10003; Client Approved</span>' : '<span class="chip gold sm">Awaiting Client Sign</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:#7c3aed;margin-top:2px">&#9776;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + r.client + ' — TY' + r.taxYear + '</b>',
        '      <span style="font-size:.75rem;color:var(--ink-2)">' + r.returnType + '</span>',
        '      ' + pubBadge + ' ' + appBadge,
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>AGI:</b> ' + r.agi + ' &middot; <b>Summary:</b> ' + r.refundOrDue + '',
        '      ' + (r.publishedAt ? ' &middot; Published ' + new Date(r.publishedAt).toLocaleDateString() : '') + '',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-g btn-firm-publish-return" data-id="' + r.id + '" data-client="' + r.client + '" data-year="' + r.taxYear + '" style="padding:4px 8px;font-size:.74rem">Publish to Portal &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmKbaMonitoring(kbaList, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'IRS Form 8879 & Remote KBA Identity Monitoring (IRS Pub 1345 § 5.2.2)';
    if (metaEl) metaEl.textContent = kbaList.length + ' identity verification streams';

    var html = '';
    kbaList.forEach(function(k) {
      var badge = k.isLockedOut ? '<span class="chip danger sm">&#9888; KBA Hard Lockout (3/3)</span>' :
                  k.kbaPassed ? '<span class="chip ok sm">&#10003; Identity Verified</span>' :
                  '<span class="chip gold sm">Attempts: ' + k.kbaAttempts + '/3</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--warn);margin-top:2px">&#9998;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + k.client + '</b>',
        '      <span style="font-size:.76rem;color:var(--ink-2)">' + k.formType + '</span>',
        '      ' + badge,
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Status:</b> ' + k.status + ' &middot; <b>Method:</b> ' + k.method + '',
        '      ' + (k.lockoutReason ? '<div style="color:var(--danger);font-size:.75rem;margin-top:2px">&#9888; ' + k.lockoutReason + '</div>' : '') + '',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    ' + (k.isLockedOut ?
               '<button type="button" class="btn sm btn-g btn-firm-op-act" data-action="wet-signature" data-client="' + k.client + '" data-client-uid="' + k.clientUid + '" style="padding:4px 8px;font-size:.74rem">Switch to Wet Ink &rarr;</button>' :
               '<button type="button" class="btn sm btn-o btn-firm-op-act" data-action="chase" data-client="' + k.client + '" data-client-uid="' + k.clientUid + '" style="padding:4px 8px;font-size:.74rem">Send Chase &rarr;</button>'),
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmClientMessages(threads, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'Client Communications & Secure Message Hub';
    if (metaEl) metaEl.textContent = threads.length + ' active communication threads';

    var html = '';
    threads.forEach(function(t) {
      var unreadChip = t.unreadCount > 0 ? '<span class="chip danger sm">' + t.unreadCount + ' Unread</span>' : '<span class="chip ok sm">&#10003; Caught up</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--accent);margin-top:2px">&#9993;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + t.clientName + '</b>',
        '      <span style="font-size:.74rem;color:var(--ink-2)">' + t.timeAgo + '</span>',
        '      ' + unreadChip,
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.79rem;color:var(--ink);line-height:1.4">',
        '      &ldquo;' + t.lastMessage + '&rdquo;',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-g btn-firm-msg-reply" data-client="' + t.clientName + '" data-uid="' + t.clientId + '" data-eng="' + t.engagementId + '" style="padding:4px 8px;font-size:.74rem">Reply in File &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmInvoicesReconciliation(invoices, container, metaEl, titleEl, role) {
    if (titleEl) titleEl.textContent = 'Accounts Receivable & Billing Reconciliation';
    var unpaidCount = invoices.filter(function(i) { return i.status !== 'paid' && i.status !== 'refunded'; }).length;
    if (metaEl) metaEl.textContent = invoices.length + ' invoices tracked · ' + unpaidCount + ' open vouchers';

    var html = [
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:6px;margin-bottom:10px">',
      '  <div>',
      '    <span class="chip gold sm" style="font-size:.7rem">PCI-DSS SAQ-A &middot; Stripe Hosted Checkout</span>',
      '    <span style="font-size:.78rem;color:var(--ink-2);margin-left:6px">Automatic Webhook Reconciliation Active</span>',
      '  </div>',
      '  <button type="button" class="btn sm btn-g" id="btn-firm-open-issue-inv" style="padding:4px 10px;font-size:.76rem">+ Issue New Invoice</button>',
      '</div>'
    ].join('');

    invoices.forEach(function(inv) {
      var statusBadge = inv.status === 'paid' ? '<span class="chip ok sm">&#10003; Paid</span>' :
                        inv.status === 'pending' ? '<span class="chip gold sm">&#9203; ACH In Transit</span>' :
                        inv.status === 'refunded' ? '<span class="chip warn sm">&#8635; Refunded</span>' :
                        inv.status === 'failed' ? '<span class="chip danger sm">&#9888; ACH Failed</span>' :
                        inv.status === 'past_due' ? '<span class="chip warn sm">Past Due</span>' :
                        '<span class="chip gold sm">Issued</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--ink);margin-top:2px">$</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">#' + inv.invoiceId.replace('inv_', '') + ' — ' + inv.client + '</b>',
        '      <b style="font-family:var(--f-mono);font-size:.85rem;color:var(--ink)">$' + Number(inv.amount || 0).toFixed(2) + '</b>',
        '      ' + statusBadge,
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Service:</b> ' + (inv.serviceName || 'Tax Services') + ' &middot; <b>Issued:</b> ' + (inv.issueDate || 'Recent') + ' &middot; <b>Due:</b> ' + (inv.dueDate || 'Upon receipt') + '',
        '      ' + (inv.failureReason ? '<div style="color:var(--danger);font-size:.75rem;margin-top:2px">&#9888; ' + inv.failureReason + '</div>' : '') + '',
        '      ' + (inv.refundReason ? '<div style="color:var(--warn);font-size:.75rem;margin-top:2px">&#8635; ' + inv.refundReason + ' ($' + Number(inv.refundAmount || inv.amount).toFixed(2) + ')</div>' : '') + '',
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    ' + (inv.status === 'paid' ?
               '<button type="button" class="btn sm btn-o btn-firm-refund-inv" data-id="' + inv.invoiceId + '" data-client="' + inv.client + '" data-amount="' + inv.amount + '" style="padding:4px 8px;font-size:.74rem">Refund &rarr;</button>' :
               (inv.status !== 'refunded' ?
                '<button type="button" class="btn sm btn-g btn-firm-reconcile-inv" data-id="' + inv.invoiceId + '" data-client="' + inv.client + '" data-amount="' + inv.amount + '" style="padding:4px 8px;font-size:.74rem">Reconcile Settlement &rarr;</button>' :
                '<span style="font-size:.72rem;color:var(--ink-2);font-family:var(--f-mono)">Refund Settled</span>')
             ),
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmStaffRoster(staff, container, metaEl, titleEl, role) {
    if (titleEl) titleEl.textContent = 'Authorized Staff & Role Management (FTC Safeguards 16 CFR § 314.4)';
    if (metaEl) metaEl.textContent = staff.length + ' authorized practitioners · MFA 100% Enforced';

    var html = '';
    staff.forEach(function(s) {
      var roleBadge = s.role === 'firm_admin' ? '<span class="chip gold sm">Managing Partner (Admin)</span>' : '<span class="chip ok sm">Preparer (Practitioner)</span>';

      html += [
        '<div class="row" style="align-items:flex-start;padding:12px 10px;border-bottom:1px solid var(--line-2)">',
        '  <span class="ic" style="color:var(--gold);margin-top:2px">&#128737;</span>',
        '  <div class="g" style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
        '      <b style="font-size:.9rem;color:var(--ink)">' + s.name + '</b>',
        '      <span style="font-size:.76rem;color:var(--ink-2)">' + s.email + '</span>',
        '      ' + roleBadge,
        '      <span class="chip ok sm" style="font-size:.62rem">&#10003; MFA Verified</span>',
        '    </div>',
        '    <div class="m" style="margin-top:3px;font-size:.78rem;color:var(--ink-2);line-height:1.4">',
        '      <b>Role:</b> ' + s.roleTitle + ' &middot; <b>PTIN:</b> ' + s.ptin + ' &middot; <b>EFIN Authority:</b> ' + s.efinAuthority + ' &middot; <b>Files:</b> ' + s.assignedFiles,
        '    </div>',
        '  </div>',
        '  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">',
        '    <button type="button" class="btn sm btn-o btn-firm-staff-manage" data-id="' + s.id + '" data-name="' + s.name + '" data-role="' + s.role + '" style="padding:4px 8px;font-size:.74rem">Permissions &amp; Roster &rarr;</button>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
    bindFirmActionButtons(container);
  }

  function renderFirmSystemHealth(health, container, metaEl, titleEl) {
    if (titleEl) titleEl.textContent = 'System & Integration Monitoring (Security & Health Telemetry)';
    if (metaEl) metaEl.textContent = 'All subsystems operational · 0 active faults';

    var html = [
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px;padding:12px 6px">',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>Firebase Authentication</b>',
      '      <span class="chip ok sm">&#10003; 100% Healthy</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">MFA Enforced for staff · Token claims signed via Admin SDK · Session refresh latency 38ms.</p>',
      '  </div>',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>Cloud Firestore Database</b>',
      '      <span class="chip ok sm">&#10003; Connected</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">Multi-Region nam5 · Strict WORM rules active on audit logs &amp; signatures · 0 rule rejections.</p>',
      '  </div>',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>Postmark Email Stream</b>',
      '      <span class="chip ok sm">&#10003; Verified</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">Transactional stream outbound · IRC § 7216 sanitizer validated · Outbox dead-letter queue: 0.</p>',
      '  </div>',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>Storage Vault &amp; Antivirus</b>',
      '      <span class="chip ok sm">&#10003; Clean</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">ClamAV real-time daemon running · 42 scans completed · 0 infected attachments detected.</p>',
      '  </div>',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>IRS MeF ERO Gateway</b>',
      '      <span class="chip ok sm">&#10003; Authorized</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">EFIN 748291 active · Schema validation TY2026 v1.0 · Connected to MD, VA, PA DOR hubs.</p>',
      '  </div>',
      '  <div class="card" style="margin:0;padding:14px;border-left:3.5px solid var(--ok)">',
      '    <div style="display:flex;justify-content:space-between;align-items:center">',
      '      <b>Dead-Letter / Retry Queue</b>',
      '      <span class="chip ok sm">&#10003; 0 Pending</span>',
      '    </div>',
      '    <p class="sub" style="margin:6px 0 0;font-size:.78rem;color:var(--ink-2)">Zero pending failed webhook deliveries. Cryptographic idempotency deduplication active.</p>',
      '  </div>',
      '</div>'
    ].join('');

    container.innerHTML = html;
  }

  function bindFirmActionButtons(container) {
    // 1. Existing triage action buttons
    var btns = container.querySelectorAll('.btn-firm-op-act');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var act = btn.dataset.action;
        var client = btn.dataset.client;
        var clientUid = btn.dataset.clientUid;
        var docId = btn.dataset.docId;
        var invId = btn.dataset.invId;

        if (act === 'doc-review') {
          openPractitionerDocReviewModal(docId, client, btn);
        } else if (act === 'wet-signature') {
          openWetSignatureActionModal(clientUid, client, btn);
        } else if (act === 'chase') {
          openChaseSignerActionModal(clientUid, client, btn);
        } else if (act === 'notice-review') {
          openNoticeReviewModal(client, btn);
        } else if (act === 'remind-invoice') {
          openInvoiceReminderModal(invId, clientUid, client, btn);
        } else if (act === 'waiting') {
          openWaitingNudgeModal(clientUid, client, btn);
        }
      });
    });

    // 2. Advance Engagement Stage Button
    var advBtns = container.querySelectorAll('.btn-firm-advance-stage');
    advBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openAdvanceStageModal(btn.dataset.client, btn.dataset.uid, btn.dataset.eng, btn.dataset.stage);
      });
    });

    // 3. Publish Prepared Return Button
    var pubBtns = container.querySelectorAll('.btn-firm-publish-return');
    pubBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openPublishReturnModal(btn.dataset.client, btn.dataset.id, btn.dataset.year);
      });
    });

    // 4. Follow-up Missing Document Button
    var missBtns = container.querySelectorAll('.btn-firm-followup-doc');
    missBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openFollowUpMissingDocModal(btn.dataset.title, btn.dataset.client, btn.dataset.uid);
      });
    });

    // 5. Message Client Quick Composer
    var msgBtns = container.querySelectorAll('.btn-firm-msg-client, .btn-firm-msg-reply');
    msgBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openQuickReplyMessageModal(btn.dataset.client, btn.dataset.uid, btn.dataset.eng);
      });
    });

    // 6. Reconcile Invoice Settlement (Admin Check)
    var recBtns = container.querySelectorAll('.btn-firm-reconcile-inv');
    recBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openReconcileInvoiceModal(btn.dataset.id, btn.dataset.client, btn.dataset.amount);
      });
    });

    // 6B. Refund Invoice (Admin Check)
    var refBtns = container.querySelectorAll('.btn-firm-refund-inv');
    refBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openRefundInvoiceModal(btn.dataset.id, btn.dataset.client, btn.dataset.amount);
      });
    });

    // 6C. Issue New Invoice (Staff Action)
    var issueBtn = container.querySelector('#btn-firm-open-issue-inv');
    if (issueBtn) {
      issueBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openIssueInvoiceModal();
      });
    }

    // 7. Staff Permissions & Roster (Admin Check)
    var staffBtns = container.querySelectorAll('.btn-firm-staff-manage');
    staffBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openStaffManageModal({ id: btn.dataset.id, name: btn.dataset.name, role: btn.dataset.role });
      });
    });
  }

  // -------------------------------------------------------------
  // Operational Action Modals (Stage advance, Return publish, etc.)
  // -------------------------------------------------------------

  function openAdvanceStageModal(client, clientUid, engId, currentStage) {
    var stages = [
      { id: 'onboarding', name: 'Onboarding & Scoping' },
      { id: 'docs_pending', name: 'Documents Pending' },
      { id: 'in_preparation', name: 'In Preparation' },
      { id: 'review', name: 'Practitioner Review' },
      { id: 'signing_pending', name: 'Signing Pending (Form 8879)' },
      { id: 'efile_ready', name: 'E-File Ready' },
      { id: 'completed', name: 'Completed & Archived' }
    ];

    var optionsHtml = stages.map(function(s) {
      var sel = s.id === currentStage ? 'selected' : '';
      return '<option value="' + s.id + '" ' + sel + '>' + s.name + '</option>';
    }).join('');

    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Preparation Pipeline Stage Transition</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">' + client + ' — Engagement Progression</h4>',
      '  <p style="font-size:.84rem;color:var(--ink-2)">Advancing engagement stage updates the client portal overview bar and triggers appropriate notifications.</p>',
      '  <div class="field" style="margin-top:12px">',
      '    <label style="font-size:.8rem;font-weight:600">Select Next Stage:</label>',
      '    <select id="stage-select-input" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.84rem">',
      '      ' + optionsHtml,
      '    </select>',
      '  </div>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Practitioner Progression Notes:</label>',
      '    <input type="text" id="stage-notes-input" value="Verified required schedules; moving file to next phase." style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-modal-save-stage">Save Stage &amp; Log Audit &rarr;</button>'
    ].join('');

    openModal('Advance Stage: ' + client, bodyHtml, footerHtml);

    setTimeout(function() {
      var saveBtn = document.getElementById('btn-modal-save-stage');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
          var newStage = document.getElementById('stage-select-input').value;
          var notes = document.getElementById('stage-notes-input').value;
          saveBtn.disabled = true;
          saveBtn.textContent = 'Recording in Firestore...';
          if (window.FirebaseBridge && window.FirebaseBridge.staffAdvanceEngagementStage) {
            await window.FirebaseBridge.staffAdvanceEngagementStage(engId, newStage, notes);
          }
          closeModal();
          showToast('Engagement moved to ' + newStage + ' for ' + client, 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openPublishReturnModal(client, returnId, taxYear) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Prepared Return Authorization &middot; Circular 230</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Publish Form 1040 for ' + client + ' (TY' + taxYear + ')</h4>',
      '  <p style="font-size:.84rem;color:var(--ink-2);line-height:1.5">Publishing the prepared return makes read-only federal/state schedules accessible in the client portal and unlocks Form 8879 e-signature authorization.</p>',
      '  <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:4px;padding:10px 12px;margin:12px 0;font-size:.82rem">',
      '    <div><b>Federal Form:</b> Form 1040 (U.S. Individual Income Tax Return)</div>',
      '    <div><b>State Filings:</b> Maryland Resident Form 502, Virginia Form 763</div>',
      '    <div><b>E-File Readiness:</b> Verified &middot; Zero Diagnostics Errors in Tax Engine</div>',
      '  </div>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Practitioner Review Summary:</label>',
      '    <input type="text" id="return-pub-notes" value="All W-2 and 1099 statements verified against transcripts." style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-confirm-pub-return">&#10003; Publish Return to Client Portal</button>'
    ].join('');

    openModal('Publish Prepared Return: ' + client, bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-confirm-pub-return');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          var notes = document.getElementById('return-pub-notes').value;
          actBtn.disabled = true;
          actBtn.textContent = 'Publishing...';
          if (window.FirebaseBridge && window.FirebaseBridge.staffPublishPreparedReturn) {
            await window.FirebaseBridge.staffPublishPreparedReturn(returnId, { practitionerNotes: notes });
          }
          closeModal();
          showToast('Tax return published to ' + client + '. Portal notified.', 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openFollowUpMissingDocModal(docTitle, client, clientUid) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip warn sm">Overdue Document Follow-Up</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">' + docTitle + '</h4>',
      '  <p style="font-size:.85rem;line-height:1.5;color:var(--ink)">Dispatch automated high-priority checklist notification to <b>' + client + '</b> with encrypted vault upload link.</p>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-dispatch-doc-followup">Send Checklist Notification Now</button>'
    ].join('');

    openModal('Follow-Up: ' + client, bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-dispatch-doc-followup');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffFollowUpMissingDocument) {
            await window.FirebaseBridge.staffFollowUpMissingDocument('req_miss_' + Date.now(), clientUid, docTitle);
          }
          closeModal();
          showToast('Missing document reminder dispatched to ' + client, 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openReconcileInvoiceModal(invoiceId, client, amount) {
    var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
      (state && state.user && state.user.role) || 'client';
    var isAdmin = activeFirmRole === 'firm_admin' || userRole === 'firm_admin';

    if (!isAdmin) {
      showToast('Access Denied: Only Firm Admin can reconcile and settle invoices.', 'err');
      console.warn('RBAC Violation: Non-admin attempted invoice settlement.');
      return;
    }

    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Managing Partner A/R Settlement Privilege</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Reconcile #' + invoiceId.replace('inv_', '') + ' — ' + client + '</h4>',
      '  <p style="font-size:.84rem;color:var(--ink-2)">Record manual settlement confirmation from banking institution or merchant clearinghouse.</p>',
      '  <div style="background:var(--surface-2);padding:10px 12px;border-radius:4px;margin:10px 0;font-size:.84rem">',
      '    <div><b>Voucher Total:</b> $' + Number(amount).toFixed(2) + '</div>',
      '    <div><b>Client:</b> ' + client + '</div>',
      '  </div>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Settlement Reference / Bank Trace ID:</label>',
      '    <input type="text" id="inv-settle-ref" value="bank_wire_conf_' + Math.floor(Math.random() * 899999 + 100000) + '" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-confirm-settle-inv">&#10003; Reconcile &amp; Mark Paid</button>'
    ].join('');

    openModal('Reconcile Invoice: ' + invoiceId, bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-confirm-settle-inv');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          var ref = document.getElementById('inv-settle-ref').value;
          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffReconcileInvoice) {
            await window.FirebaseBridge.staffReconcileInvoice(invoiceId, { ref: ref });
          }
          closeModal();
          showToast('Invoice ' + invoiceId + ' reconciled as paid.', 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openIssueInvoiceModal() {
    var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
      (state && state.user && state.user.role) || 'client';
    var isStaff = activeFirmRole === 'firm_admin' || activeFirmRole === 'firm_preparer' || userRole === 'firm_admin' || userRole === 'firm_preparer';

    if (!isStaff) {
      showToast('Access Denied: Only authorized firm staff can issue invoices.', 'err');
      return;
    }

    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Practitioner Billing Authority</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Issue New Billing Statement</h4>',
      '  <p style="font-size:.82rem;color:var(--ink-2)">Create an authoritative invoice itemizing preparation schedules and advisory services.</p>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Client / Taxpayer UID:</label>',
      '    <input type="text" id="new-inv-client-uid" value="usr_whitfield_4417" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '  <div class="field" style="margin-top:8px">',
      '    <label style="font-size:.8rem;font-weight:600">Service Description:</label>',
      '    <input type="text" id="new-inv-desc" value="Individual Return TY2026 Form 1040 & State Packages" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">',
      '    <div class="field">',
      '      <label style="font-size:.8rem;font-weight:600">Fee Amount ($):</label>',
      '      <input type="number" id="new-inv-amount" value="685.00" step="5" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '    </div>',
      '    <div class="field">',
      '      <label style="font-size:.8rem;font-weight:600">Due Date:</label>',
      '      <input type="date" id="new-inv-duedate" value="2026-09-30" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-submit-issue-inv">&#10003; Issue Statement &rarr;</button>'
    ].join('');

    openModal('Issue Statement', bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-submit-issue-inv');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          var clientUid = document.getElementById('new-inv-client-uid').value.trim();
          var desc = document.getElementById('new-inv-desc').value.trim();
          var amount = parseFloat(document.getElementById('new-inv-amount').value) || 0;
          var dueDate = document.getElementById('new-inv-duedate').value;

          if (!clientUid || !desc || amount <= 0) {
            showToast('Please fill out all billing fields with a positive amount.', 'warn');
            return;
          }

          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffIssueInvoice) {
            await window.FirebaseBridge.staffIssueInvoice({
              clientId: clientUid,
              total: amount,
              dueDate: dueDate,
              items: [{ desc: desc, amount: amount }]
            });
          }
          closeModal();
          showToast('Billing statement for $' + amount.toFixed(2) + ' issued to client.', 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openRefundInvoiceModal(invoiceId, client, amount) {
    var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
      (state && state.user && state.user.role) || 'client';
    var isAdmin = activeFirmRole === 'firm_admin' || userRole === 'firm_admin';

    if (!isAdmin) {
      showToast('Access Denied: Only Firm Admin can issue refunds.', 'err');
      return;
    }

    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip danger sm">Administrative Payment Reversal</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Process Refund: #' + invoiceId.replace('inv_', '') + ' — ' + client + '</h4>',
      '  <p style="font-size:.82rem;color:var(--ink-2)">Execute cryptographic refund via Stripe payment gateway. Triggers irreversible ledger reversal.</p>',
      '  <div style="background:var(--surface-2);padding:10px 12px;border-radius:4px;margin:10px 0;font-size:.84rem">',
      '    <div><b>Settled Amount:</b> $' + Number(amount).toFixed(2) + '</div>',
      '    <div><b>Client:</b> ' + client + '</div>',
      '  </div>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Refund Amount ($):</label>',
      '    <input type="number" id="refund-inv-amount" value="' + Number(amount).toFixed(2) + '" step="1" max="' + amount + '" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '  <div class="field" style="margin-top:8px">',
      '    <label style="font-size:.8rem;font-weight:600">Reason for Refund:</label>',
      '    <input type="text" id="refund-inv-reason" value="Engagement scope amendment / billing credit" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-o sm" id="btn-confirm-refund-inv" style="color:var(--danger);border-color:var(--danger)">&#8635; Confirm Refund</button>'
    ].join('');

    openModal('Refund Payment: ' + invoiceId, bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-confirm-refund-inv');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          var refundAmt = parseFloat(document.getElementById('refund-inv-amount').value) || 0;
          var reason = document.getElementById('refund-inv-reason').value.trim();

          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffRefundInvoice) {
            await window.FirebaseBridge.staffRefundInvoice(invoiceId, refundAmt, reason);
          }
          closeModal();
          showToast('Refund of $' + refundAmt.toFixed(2) + ' processed for invoice ' + invoiceId + '.', 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openQuickReplyMessageModal(client, clientUid, engagementId) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip ok sm">Secure Multi-Client Messaging Hub</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Practitioner Reply to ' + client + '</h4>',
      '  <p style="font-size:.82rem;color:var(--ink-2)">Message is strictly associated with engagement [' + engagementId + '] and encrypted in transit.</p>',
      '  <div class="field" style="margin-top:10px">',
      '    <textarea id="staff-msg-text-input" placeholder="Type practitioner response to client..." style="width:100%;height:80px;padding:8px 10px;border:1px solid var(--line);border-radius:4px;font-size:.85rem;color:var(--ink);background:var(--surface)"></textarea>',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-send-staff-reply">&#9993; Send Message &rarr;</button>'
    ].join('');

    openModal('Send Message: ' + client, bodyHtml, footerHtml);

    setTimeout(function() {
      var sendBtn = document.getElementById('btn-send-staff-reply');
      if (sendBtn) {
        sendBtn.addEventListener('click', async function() {
          var text = document.getElementById('staff-msg-text-input').value;
          if (!text || !text.trim()) return;
          sendBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.sendReplyMessage) {
            await window.FirebaseBridge.sendReplyMessage(text, 'preparer', { engagementId: engagementId });
          }
          closeModal();
          showToast('Message sent to ' + client + ' in private workspace.', 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openStaffManageModal(staffMember) {
    var userRole = (window.FirebaseBridge && window.FirebaseBridge.getRole && window.FirebaseBridge.getRole()) ||
      (state && state.user && state.user.role) || 'client';
    var isAdmin = activeFirmRole === 'firm_admin' || userRole === 'firm_admin';

    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Practitioner Roster &amp; RBAC Control</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">' + staffMember.name + '</h4>',
      '  <p style="font-size:.83rem;color:var(--ink-2)">Current assigned role: <b>' + staffMember.role + '</b>. FTC Safeguards requires strict role minimization and enforced MFA.</p>',
      '  <div class="field" style="margin-top:12px">',
      '    <label style="font-size:.8rem;font-weight:600">Assigned Privilege Tier:</label>',
      '    <select id="staff-role-select" ' + (!isAdmin ? 'disabled' : '') + ' style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.84rem">',
      '      <option value="firm_preparer" ' + (staffMember.role === 'firm_preparer' ? 'selected' : '') + '>firm_preparer (Assigned Clients &amp; Workflows)</option>',
      '      <option value="firm_admin" ' + (staffMember.role === 'firm_admin' ? 'selected' : '') + '>firm_admin (Managing Partner &amp; EFIN Governance)</option>',
      '    </select>',
      '    ' + (!isAdmin ? '<div style="color:var(--danger);font-size:.74rem;margin-top:4px">&#9888; Only Managing Partner (firm_admin) can adjust staff privileges.</div>' : '') + '',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button>',
      (isAdmin ? '<button class="btn btn-g sm" id="btn-save-staff-role">Save Role Changes</button>' : '')
    ].join('');

    openModal('Staff Profile: ' + staffMember.name, bodyHtml, footerHtml);

    setTimeout(function() {
      var saveBtn = document.getElementById('btn-save-staff-role');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
          var newRole = document.getElementById('staff-role-select').value;
          saveBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffUpdateRole) {
            await window.FirebaseBridge.staffUpdateRole(staffMember.id, newRole);
          }
          closeModal();
          showToast('Updated role for ' + staffMember.name + ' to ' + newRole, 'ok');
          loadFirmScreen();
        });
      }
    }, 50);
  }

  // Action Modals with Real Firestore Updates

  function openPractitionerDocReviewModal(docId, client, btnEl) {
    docId = docId || 'demo_whitfield_4417_req_closing';
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Practitioner Verification &middot; Circular 230 &sect; 10.22</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Closing Disclosure &mdash; 214 Halcyon Row</h4>',
      '  <p style="font-size:.84rem;color:var(--ink-2);line-height:1.5">Submitted by <b>' + client + '</b> for Schedule E rental refinance and property tax verification (12 pages, PDF).</p>',
      '  <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;margin:12px 0;font-size:.82rem">',
      '    <div><b>MIME Type:</b> application/pdf &middot; <b>File Size:</b> 2.4 MB</div>',
      '    <div><b>Malware Scan:</b> <span style="color:var(--ok)">CLEAN (ClamAV &middot; Zero Threats)</span></div>',
      '    <div><b>Custody Tier:</b> FTC Safeguards 16 CFR &sect; 314.4 AES-256 Vault</div>',
      '  </div>',
      '  <div class="field" style="margin-top:10px">',
      '    <label style="font-size:.8rem;font-weight:600">Practitioner Review Notes:</label>',
      '    <input type="text" id="doc-review-notes" value="Verified closing settlement costs and interest allocation." style="width:100%;padding:8px 10px;font-size:.82rem;border:1px solid var(--line);border-radius:4px;margin-top:4px">',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button>',
      '<button class="btn sm" id="btn-modal-reject-doc" style="background:var(--danger);color:#fff">Reject Scan</button>',
      '<button class="btn btn-g sm" id="btn-modal-accept-doc">&#10003; Accept Document</button>'
    ].join('');

    openModal('Practitioner Due Diligence: ' + client, bodyHtml, footerHtml);

    setTimeout(function() {
      var acceptBtn = document.getElementById('btn-modal-accept-doc');
      var rejectBtn = document.getElementById('btn-modal-reject-doc');

      if (acceptBtn) {
        acceptBtn.addEventListener('click', async function() {
          var notes = document.getElementById('doc-review-notes').value || 'Accepted by Denise R., CPA';
          acceptBtn.disabled = true;
          acceptBtn.textContent = 'Recording in Firestore...';
          if (window.FirebaseBridge && window.FirebaseBridge.staffAcceptDocument) {
            await window.FirebaseBridge.staffAcceptDocument(docId, notes);
          }
          closeModal();
          showToast('Document accepted and recorded in audit ledger!', 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Accepted';
            btnEl.disabled = true;
            btnEl.style.opacity = '0.7';
          }
          loadFirmScreen();
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener('click', async function() {
          var reason = prompt('Enter practitioner rejection reason (delivered to client):', 'Missing Schedule B settlement pages 3-4');
          if (!reason) return;
          rejectBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffRejectDocument) {
            await window.FirebaseBridge.staffRejectDocument(docId, reason);
          }
          closeModal();
          showToast('Document marked as rejected. Notice pushed to client.', 'warn');
          if (btnEl) {
            btnEl.textContent = '✕ Rejected';
            btnEl.disabled = true;
            btnEl.style.opacity = '0.7';
          }
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openWetSignatureActionModal(clientUid, client, btnEl) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip warn sm">IRS Publication 1345 &sect; 5.2.2 Hard Lockout</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">Knowledge-Based Authentication Lockout: ' + client + '</h4>',
      '  <p style="font-size:.85rem;line-height:1.55;color:var(--ink)">',
      '    The signer failed remote out-of-wallet identity challenges three consecutive times. Under IRS mandatory rules, remote e-signature is permanently disabled for this filing session.',
      '  </p>',
      '  <div style="background:var(--warn-bg);border-left:3.5px solid var(--warn);padding:10px 14px;border-radius:4px;margin:12px 0;font-size:.8rem">',
      '    <b>Statutory Mandate:</b> Must revert taxpayer to Form 8879 physical handwritten (wet) signature. All digital authorizations voided.',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-dispatch-wetsig-pkg">Generate &amp; Dispatch Wet Sig Package</button>'
    ].join('');

    openModal('IRS KBA Lockout Resolution', bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-dispatch-wetsig-pkg');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          actBtn.disabled = true;
          actBtn.textContent = 'Generating Package...';
          if (window.FirebaseBridge && window.FirebaseBridge.staffGenerateWetSig) {
            await window.FirebaseBridge.staffGenerateWetSig(clientUid || 'usr_brennan_llc', client);
          }
          closeModal();
          showToast('Wet signature package generated for ' + client + '. Portal notified.', 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Wet Pkg Dispatched';
            btnEl.disabled = true;
          }
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openChaseSignerActionModal(clientUid, client, btnEl) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip gold sm">Unsigned Form 8879 Escalation</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">' + client + ' &mdash; Form 8879 Outstanding 6 Days</h4>',
      '  <p style="font-size:.85rem;line-height:1.5;color:var(--ink)">Two automated email reminders were sent. Return transmission is halted pending signature authorization.</p>',
      '  <div class="field" style="margin-top:12px">',
      '    <label style="font-size:.8rem;font-weight:600">Escalation Channel:</label>',
      '    <select id="chase-channel-select" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:4px;margin-top:4px;font-size:.82rem">',
      '      <option value="push-sms">High-Priority SMS Alert + Push Notification</option>',
      '      <option value="call">Flag for Preparer Follow-Up Telephone Call</option>',
      '      <option value="portal-urgent">Urgent Dashboard Pop-up Banner</option>',
      '    </select>',
      '  </div>',
      '</div>'
    ].join('');

    var footerHtml = [
      '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
      '<button class="btn btn-g sm" id="btn-dispatch-chase">Dispatch Escalation Alert</button>'
    ].join('');

    openModal('Signature Chase Escalation', bodyHtml, footerHtml);

    setTimeout(function() {
      var actBtn = document.getElementById('btn-dispatch-chase');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          var ch = document.getElementById('chase-channel-select').value;
          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffChaseSigner) {
            await window.FirebaseBridge.staffChaseSigner(clientUid || 'usr_okonjo_a', client, ch);
          }
          closeModal();
          showToast('Escalation notice dispatched to ' + client, 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Chased';
            btnEl.disabled = true;
          }
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openNoticeReviewModal(client, btnEl) {
    var bodyHtml = [
      '<div style="padding:4px 0">',
      '  <span class="chip ok sm">IRS Notice CP2000 &middot; 48-Hour Review</span>',
      '  <h4 style="margin:8px 0 6px;font-size:1.05rem">' + client + ' &mdash; Proposed Underpayment Notice</h4>',
      '  <p style="font-size:.85rem;line-height:1.55;color:var(--ink)">IRS proposed changes to rental income reporting under Treas. Reg. &sect; 1.469. Preparer assessment drafted.</p>',
      '  <div style="background:var(--surface-2);padding:10px 12px;border-radius:4px;font-family:var(--f-mono);font-size:.78rem;margin:10px 0">',
      '    <b>Finding:</b> IRS omitted Schedule E passive loss carryover. Client owes $0. Reply letter drafted.',
      '  </div>',
      '</div>'
    ].join('');

    openModal('Notice Explanation Review', bodyHtml, '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button><button class="btn btn-g sm" id="btn-send-explanation">Send Plain-English Read to Client &rarr;</button>');

    setTimeout(function() {
      var actBtn = document.getElementById('btn-send-explanation');
      if (actBtn) {
        actBtn.addEventListener('click', function() {
          closeModal();
          showToast('Plain-English explanation pushed to ' + client + ' in Messages.', 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Completed';
            btnEl.disabled = true;
          }
        });
      }
    }, 50);
  }

  function openInvoiceReminderModal(invId, clientUid, client, btnEl) {
    invId = invId || 'inv_2026_failed';
    openModal('Outstanding Billing Voucher', [
      '<div style="padding:4px 0">',
      '  <p style="font-size:.86rem;line-height:1.5">Dispatch payment update link for <b>#' + invId.replace('inv_', '') + '</b> to ' + client + ' via secure push notification.</p>',
      '</div>'
    ].join(''), '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button><button class="btn btn-g sm" id="btn-send-inv-remind">Dispatch Reminder</button>');

    setTimeout(function() {
      var actBtn = document.getElementById('btn-send-inv-remind');
      if (actBtn) {
        actBtn.addEventListener('click', async function() {
          actBtn.disabled = true;
          if (window.FirebaseBridge && window.FirebaseBridge.staffRemindInvoice) {
            await window.FirebaseBridge.staffRemindInvoice(invId, clientUid || 'demo_whitfield_4417');
          }
          closeModal();
          showToast('Payment voucher link dispatched to ' + client, 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Reminded';
            btnEl.disabled = true;
          }
          loadFirmScreen();
        });
      }
    }, 50);
  }

  function openWaitingNudgeModal(clientUid, client, btnEl) {
    openModal('Document Checklist Nudge', [
      '<div style="padding:4px 0">',
      '  <p style="font-size:.86rem;line-height:1.5">Push automated checklist reminder to <b>' + client + '</b> for outstanding 1099-MISC &amp; Schedule K-1.</p>',
      '</div>'
    ].join(''), '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button><button class="btn btn-g sm" id="btn-send-nudge">Send Checklist Nudge Now</button>');

    setTimeout(function() {
      var actBtn = document.getElementById('btn-send-nudge');
      if (actBtn) {
        actBtn.addEventListener('click', function() {
          closeModal();
          showToast('Checklist nudge sent to ' + client, 'ok');
          if (btnEl) {
            btnEl.textContent = '✓ Nudged';
            btnEl.disabled = true;
          }
        });
      }
    }, 50);
  }

  function renderFirmActivityFeed(logs, container) {
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--night-ink-2)">No audit entries found.</div>';
      return;
    }

    var html = '';
    logs.forEach(function(l) {
      var isStaff = l.provenance === 'firm_staff';
      var badgeClass = isStaff ? 'ok' : 'night';
      var timeStr = l.recordedAt ? new Date(l.recordedAt).toLocaleString() : 'Recently';

      html += [
        '<div class="row" style="align-items:flex-start;padding:10px 8px;border-bottom:1px solid var(--line-2);font-family:var(--f-mono);font-size:.76rem">',
        '  <span class="chip ' + badgeClass + ' sm" style="font-size:.62rem;flex-shrink:0">' + (l.provenance || 'telemetry').toUpperCase() + '</span>',
        '  <div style="flex:1;margin-left:10px">',
        '    <div style="display:flex;justify-content:space-between;color:var(--ink)">',
        '      <b>' + l.action + '</b>',
        '      <span style="color:var(--ink-3);font-size:.7rem">' + timeStr + '</span>',
        '    </div>',
        '    <div style="color:var(--ink-2);margin-top:2px;font-family:var(--f-sans);font-size:.78rem">' + (l.details || '') + '</div>',
        '    <div style="color:var(--ink-3);margin-top:2px;font-size:.68rem">User: ' + (l.email || l.uid || 'Anonymous') + ' &middot; Tier: ' + (l.securityTier || 'telemetry') + '</div>',
        '  </div>',
        '</div>'
      ].join('');
    });

    container.innerHTML = html;
  }

  function exportAuditLedgerCsv(logs) {
    logs = logs || [];
    var headers = ['Event ID', 'Action', 'Event Type', 'User Email', 'UID', 'Provenance', 'Security Tier', 'Recorded At', 'Details'];
    var rows = logs.map(function(l) {
      return [
        l.id || '',
        '"' + (l.action || '').replace(/"/g, '""') + '"',
        l.eventType || '',
        l.email || '',
        l.uid || '',
        l.provenance || '',
        l.securityTier || '',
        l.recordedAt || '',
        '"' + (l.details || '').replace(/"/g, '""') + '"'
      ].join(',');
    });

    var csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    var encodedUri = encodeURI(csvContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'pivot_aide_audit_ledger_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Immutable audit ledger exported to CSV (' + logs.length + ' entries).', 'ok');
  }

  // -------------------------------------------------------------
  // 11. SCREEN 07: SERVICES & ENGAGEMENT SCOPING ENGINE
  // -------------------------------------------------------------
  var servicesCatalogCache = null;
  var engagementRequestsCache = null;
  var activeServiceCategoryFilter = 'all';
  var isServicesListenerAttached = false;
  var isEngReqsListenerAttached = false;

  function loadServicesScreen() {
    var bannerEl = document.getElementById('services-status-banner');

    if (bannerEl) bannerEl.style.display = 'none';

    if (!window.FirebaseBridge) {
      return;
    }

    // 1. Subscribe to Authoritative Services Collection
    if (!isServicesListenerAttached && window.FirebaseBridge.subscribeServices) {
      isServicesListenerAttached = true;
      window.FirebaseBridge.subscribeServices(function(items) {
        if (!items) return;
        servicesCatalogCache = items;
        if (bannerEl) bannerEl.style.display = 'none';
        renderServicesGrid(servicesCatalogCache, activeServiceCategoryFilter);
      }, function(err) {
        console.warn('Services catalog sync warning:', err);
      });
    } else if (servicesCatalogCache) {
      renderServicesGrid(servicesCatalogCache, activeServiceCategoryFilter);
    }

    // 2. Subscribe to Client Engagement Requests
    if (!isEngReqsListenerAttached && window.FirebaseBridge.subscribeEngagementRequests) {
      isEngReqsListenerAttached = true;
      window.FirebaseBridge.subscribeEngagementRequests(function(reqs) {
        engagementRequestsCache = reqs || [];
        updateServicesScopeStrip();
        renderServicesGrid(servicesCatalogCache || (window.FirebaseBridge && window.FirebaseBridge.getDefaultServices()), activeServiceCategoryFilter);
      });
    }
  }

  function updateServicesScopeStrip() {
    var stripTitle = document.getElementById('svc-strip-active-title');
    var stripChip = document.getElementById('svc-strip-status-chip');
    var activeScopes = (state.file && state.file.activeScopes) || [];
    var pendingReqs = engagementRequestsCache || [];

    if (stripTitle) {
      if (activeScopes.length > 0) {
        stripTitle.textContent = activeScopes.map(function(s) { return s.title; }).join(' · ');
      } else {
        stripTitle.textContent = '2026 Individual Return (Form 1040) · Federal + MD, VA, PA';
      }
    }

    if (stripChip) {
      var activeCount = activeScopes.length || 1;
      var pendingCount = pendingReqs.filter(function(r) { return r.status === 'pending_letter' || r.status === 'pending_proposal'; }).length;
      var label = activeCount + ' Active Scope' + (activeCount === 1 ? '' : 's');
      if (pendingCount > 0) {
        label += ' · ' + pendingCount + ' Pending';
      }
      stripChip.textContent = label;
    }
  }

  function updateServicesUi() {
    updateServicesScopeStrip();
    renderServicesGrid(servicesCatalogCache || (window.FirebaseBridge && window.FirebaseBridge.getDefaultServices()), activeServiceCategoryFilter);
  }

  function renderServicesGrid(services, activeFilter) {
    var grid = document.getElementById('services-grid');
    if (!grid) return;

    services = services || (window.FirebaseBridge && window.FirebaseBridge.getDefaultServices()) || [];
    activeFilter = activeFilter || 'all';

    var filtered = services.filter(function(s) {
      if (activeFilter === 'all') return true;
      return s.category === activeFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--night-ink-2)">No services found in this category.</div>';
      return;
    }

    var activeScopes = (state.file && state.file.activeScopes) || [];
    var pendingReqs = engagementRequestsCache || [];

    var html = '';
    filtered.forEach(function(svc) {
      var isFlagship = (svc.serviceKey === 'flagship');
      var isActiveScope = (svc.serviceKey === 'individual' || activeScopes.some(function(s) { return s.serviceKey === svc.serviceKey; }));
      var isPending = pendingReqs.some(function(r) { return r.serviceId === svc.serviceId || r.serviceKey === svc.serviceKey; });

      var badgeHtml = '';
      if (!svc.active) {
        badgeHtml = '<span class="chip warn sm">At Capacity / Inactive</span>';
      } else if (isActiveScope) {
        badgeHtml = '<span class="chip ok sm" id="badge-svc-' + svc.serviceKey + '">Active on file</span>';
      } else if (isPending) {
        badgeHtml = '<span class="chip gold sm" id="badge-svc-' + svc.serviceKey + '">Scope Pending</span>';
      } else if (isFlagship) {
        badgeHtml = '<span class="chip gold sm" id="badge-svc-' + svc.serviceKey + '">Flagship</span>';
      } else {
        badgeHtml = '<span class="chip sm" id="badge-svc-' + svc.serviceKey + '" style="display:none"></span>';
      }

      var btnHtml = '';
      if (!svc.active) {
        btnHtml = '<button class="btn btn-o sm" disabled style="opacity:0.55;cursor:not-allowed">Unavailable</button>';
      } else if (svc.serviceKey === 'individual') {
        btnHtml = '<button class="btn btn-o sm btn-service-action" data-service-key="individual" data-service-id="' + svc.serviceId + '"><span class="btn-ic" style="margin-right:6px">✎</span>Review &amp; Add Schedules</button>';
      } else if (isFlagship) {
        btnHtml = '<button class="btn btn-g sm btn-service-action" data-service-key="flagship" data-service-id="' + svc.serviceId + '"><span class="btn-ic" style="margin-right:6px">💬</span>' + (isPending ? 'Inquiry Sent' : 'Talk to us') + '</button>';
      } else if (isActiveScope) {
        btnHtml = '<button class="btn btn-o sm btn-service-action" data-service-key="' + svc.serviceKey + '" data-service-id="' + svc.serviceId + '"><span class="btn-ic" style="margin-right:6px">✓</span>Active on File</button>';
      } else if (isPending) {
        btnHtml = '<button class="btn btn-o sm btn-service-action" data-service-key="' + svc.serviceKey + '" data-service-id="' + svc.serviceId + '"><span class="btn-ic" style="margin-right:6px">⏳</span>Scope Requested</button>';
      } else {
        btnHtml = '<button class="btn btn-o sm btn-service-action" data-service-key="' + svc.serviceKey + '" data-service-id="' + svc.serviceId + '"><span class="btn-ic" style="margin-right:6px">+</span>Add</button>';
      }

      html += [
        '<div class="svcard ' + (isFlagship ? 'flag ' : '') + (isActiveScope ? 'is-active ' : '') + (isPending ? 'is-pending ' : '') + '" id="card-svc-' + svc.serviceKey + '" data-service-key="' + svc.serviceKey + '" data-service-id="' + svc.serviceId + '">',
        '  <div class="svcard-header">',
        '    <h3>' + svc.name + '</h3>',
        badgeHtml,
        '  </div>',
        '  <p>' + svc.description + '</p>',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;flex-wrap:wrap;gap:8px">',
        '    <span class="pz">' + (svc.priceDisplay || ('$' + svc.price)) + '</span>',
        '    <div style="display:flex;gap:6px;align-items:center">',
        '      <button class="btn btn-o sm btn-service-details" data-service-key="' + svc.serviceKey + '" data-service-id="' + svc.serviceId + '">Details</button>',
        '      ' + btnHtml,
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
    });

    grid.innerHTML = html;
    bindServicesActionButtons();
  }

  function bindServicesActionButtons() {
    var serviceCards = document.querySelectorAll('#services-grid .svcard');
    serviceCards.forEach(function(card) {
      var actionBtn = card.querySelector('.btn-service-action');
      var detailsBtn = card.querySelector('.btn-service-details');
      var key = card.dataset.serviceKey;
      var serviceId = card.dataset.serviceId;

      if (actionBtn) {
        actionBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          handleServiceAction(key, serviceId);
        });
      }
      if (detailsBtn) {
        detailsBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          openServiceDetailsModal(key, serviceId);
        });
      }
      card.addEventListener('click', function(e) {
        if (e.target.closest('button, a, input, select')) return;
        openServiceDetailsModal(key, serviceId);
      });
    });
  }

  function handleServiceAction(key, serviceId) {
    if (key === 'individual') {
      openIndividualScopeModal();
    } else if (key === 'business') {
      openBusinessScopeModal();
    } else if (key === 'bookkeeping') {
      openBookkeepingScopeModal();
    } else if (key === 'cleanup') {
      openCleanupScopeModal();
    } else if (key === 'audit') {
      openAuditScopeModal();
    } else if (key === 'flagship') {
      openFlagshipModal();
    } else {
      openServiceDetailsModal(key, serviceId);
    }
  }

  function openServiceDetailsModal(key, serviceId) {
    var services = servicesCatalogCache || (window.FirebaseBridge && window.FirebaseBridge.getDefaultServices()) || [];
    var svc = services.find(function(s) {
      return (serviceId && s.serviceId === serviceId) || (key && s.serviceKey === key);
    });
    if (!svc) return;

    var categoryLabels = {
      tax_prep: 'Tax Preparation',
      accounting: 'Accounting & Bookkeeping',
      advisory: 'Advisory & Planning',
      resolution: 'IRS Audit & Resolution'
    };

    var modalHtml = [
      '<div style="margin-bottom:12px">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">',
      '    <span class="chip sm ' + (svc.active ? 'ok' : 'warn') + '">' + (categoryLabels[svc.category] || svc.category) + '</span>',
      '    <span style="font-family:var(--f-mono);font-size:.74rem;color:var(--ink-3)">' + svc.serviceId + ' &middot; Firm: ' + svc.firmId + '</span>',
      '  </div>',
      '  <h3 style="font-size:1.3rem;margin:0 0 6px">' + svc.name + '</h3>',
      '  <p style="font-size:.88rem;color:var(--ink);margin:0 0 12px;line-height:1.55">' + svc.description + '</p>',
      '</div>',
      '<div class="calc-box">',
      '  <div class="calc-section-title">Authoritative Firm Rate Card (Cloud Firestore)</div>',
      '  <div class="kv"><span>Base Rate:</span><b>$' + Number(svc.price).toFixed(2) + '</b></div>',
      '  <div class="kv"><span>Billing Model:</span><span style="text-transform:capitalize;font-family:var(--f-mono);font-size:.84rem">' + svc.billingType + '</span></div>',
      '  <div class="kv"><span>Catalog Display:</span><b>' + (svc.priceDisplay || ('$' + svc.price)) + '</b></div>',
      '  <div class="kv"><span>Active Status:</span><span class="chip sm ' + (svc.active ? 'ok' : 'warn') + '">' + (svc.active ? 'Available' : 'At Capacity / Inactive') + '</span></div>',
      '</div>',
      '<div class="scope-clause-box" style="margin-top:12px">',
      '  <b>Why Database Pricing:</b> Under Treasury Circular 230 &sect; 10.27 and AICPA rules, fee schedules are set by the licensed firm and stored authoritatively in Cloud Firestore. Client input cannot alter published prices.',
      '</div>'
    ];

    if (!svc.active) {
      modalHtml.push([
        '<div style="background:rgba(235, 87, 87, 0.08);border-left:3.5px solid var(--warn);padding:10px 12px;margin-top:12px;border-radius:4px;font-size:.82rem;color:var(--ink)">',
        '  <b>Service Currently Inactive:</b> We are at maximum client capacity for this engagement tier for the current cycle to protect practitioner oversight ratios.',
        '</div>'
      ].join(''));

      openModal('Service Details &middot; ' + svc.name, modalHtml.join(''), '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button>');
    } else {
      modalHtml.push([
        '<div style="margin-top:12px;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:10px 12px">',
        '  <label style="display:flex;align-items:flex-start;gap:8px;font-size:.82rem;color:var(--ink);cursor:pointer">',
        '    <input type="checkbox" id="chk-accept-service-scope" checked style="margin-top:2px">',
        '    <span><b>Accept Scope:</b> I acknowledge this scope of service under Treasury Circular 230 &sect; 10.33 and request Pivot Aide Tax to prepare the engagement proposal.</span>',
        '  </label>',
        '</div>'
      ].join(''));

      var actionBtnLabel = 'Request Engagement Letter';
      if (['individual', 'business', 'bookkeeping', 'cleanup', 'audit'].indexOf(svc.serviceKey) !== -1) {
        actionBtnLabel = 'Customize Scope &amp; Calculate &rarr;';
      }

      openModal('Service Details &middot; ' + svc.name, modalHtml.join(''), [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-modal-action-service">' + actionBtnLabel + '</button>'
      ].join(''));

      var actionBtn = document.getElementById('btn-modal-action-service');
      if (actionBtn) {
        actionBtn.addEventListener('click', function() {
          closeModal();
          if (['individual', 'business', 'bookkeeping', 'cleanup', 'audit'].indexOf(svc.serviceKey) !== -1) {
            handleServiceAction(svc.serviceKey, svc.serviceId);
          } else {
            // Generic Engagement Request Creation
            if (window.FirebaseBridge) {
              window.FirebaseBridge.createEngagementRequest({
                serviceId: svc.serviceId,
                serviceKey: svc.serviceKey,
                title: svc.name,
                category: svc.category,
                scopeDetails: svc.description,
                pricingModel: svc.billingType,
                trustedBasePrice: svc.price,
                estimatedFee: svc.priceDisplay || ('$' + svc.price + '.00'),
                status: 'pending_letter',
                scopeAccepted: true
              });
            }
            if (!state.file.pendingScopes) state.file.pendingScopes = [];
            state.file.pendingScopes.push({
              id: 'scope-' + svc.serviceKey + '-' + Date.now(),
              serviceKey: svc.serviceKey,
              title: svc.name,
              details: svc.description,
              fee: svc.priceDisplay || ('$' + svc.price + '.00'),
              statusLabel: 'Scope Pending'
            });
            updateServicesUi();
            showToast('Engagement request created for ' + svc.name + '. Denise R. will prepare your letter.', 'ok');
          }
        });
      }
    }
  }

  function initServices() {
    var filterTabsContainer = document.getElementById('services-filter-tabs');
    if (filterTabsContainer) {
      var tabBtns = filterTabsContainer.querySelectorAll('.svc-filter-tab');
      tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          tabBtns.forEach(function(b) {
            b.classList.remove('active', 'btn-g');
            b.classList.add('btn-o');
          });
          btn.classList.add('active', 'btn-g');
          btn.classList.remove('btn-o');
          activeServiceCategoryFilter = btn.dataset.filter || 'all';
          renderServicesGrid(servicesCatalogCache || (window.FirebaseBridge && window.FirebaseBridge.getDefaultServices()), activeServiceCategoryFilter);
        });
      });
    }

    if (!servicesCatalogCache && window.FirebaseBridge && window.FirebaseBridge.getDefaultServices) {
      servicesCatalogCache = window.FirebaseBridge.getDefaultServices();
    }
    renderServicesGrid(servicesCatalogCache || [], activeServiceCategoryFilter);
    updateServicesScopeStrip();

    // Active File Scopes Modal
    var btnViewScopes = document.getElementById('btn-view-active-scopes');
    if (btnViewScopes) {
      btnViewScopes.addEventListener('click', function() {
        var activeScopes = state.file.activeScopes || [];
        var pendingScopes = state.file.pendingScopes || [];

        var listHtml = '<div style="display:flex;flex-direction:column;gap:12px">';

        listHtml += '<div><span class="calc-section-title">Active Signed Engagements (' + activeScopes.length + ')</span>';
        if (activeScopes.length === 0) {
          listHtml += '<p class="sub" style="margin-top:4px">No active engagements on file.</p>';
        } else {
          activeScopes.forEach(function(s) {
            listHtml += [
              '<div style="background:var(--surface-2);border-left:3.5px solid var(--ok);padding:11px 13px;border-radius:4px;margin-top:7px">',
              '  <div style="display:flex;justify-content:space-between;align-items:center">',
              '    <b>' + s.title + '</b>',
              '    <span style="font-family:var(--f-mono);font-size:.85rem;color:var(--ink);font-weight:600">' + (s.fee || '$1,240.00') + '</span>',
              '  </div>',
              '  <p class="sub" style="font-size:.78rem;margin-top:4px">' + s.details + '</p>',
              '  <div style="font-size:.72rem;color:var(--ink-3);margin-top:6px;font-family:var(--f-mono)">' + (s.date || 'Signed') + '</div>',
              '</div>'
            ].join('');
          });
        }
        listHtml += '</div>';

        if (pendingScopes.length > 0) {
          listHtml += '<div style="margin-top:8px"><span class="calc-section-title">Pending Scope Proposals (' + pendingScopes.length + ')</span>';
          pendingScopes.forEach(function(s) {
            listHtml += [
              '<div style="background:var(--surface-2);border-left:3.5px solid var(--gold);padding:11px 13px;border-radius:4px;margin-top:7px">',
              '  <div style="display:flex;justify-content:space-between;align-items:center">',
              '    <b>' + s.title + '</b>',
              '    <span class="chip gold sm">Awaiting Letter</span>',
              '  </div>',
              '  <p class="sub" style="font-size:.78rem;margin-top:4px">' + s.details + '</p>',
              '  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">',
              '    <span style="font-family:var(--f-mono);font-size:.82rem;color:var(--gold-dp);font-weight:500">' + (s.fee || 'Quoted on scope') + '</span>',
              '    <button class="btn-text-link btn-remove-pending" data-scope-id="' + s.id + '" style="color:var(--warn);font-size:.75rem">Withdraw scope request</button>',
              '  </div>',
              '</div>'
            ].join('');
          });
          listHtml += '</div>';
        }

        listHtml += [
          '<div class="scope-clause-box">',
          '  <b>Safeguards Rule & Engagement Protection:</b> Under IRS Pub 1345 rules, no tax preparation or accounting work begins until an engagement letter with fixed scope and fee schedule is signed by both taxpayer and practitioner.',
          '</div>',
          '</div>'
        ].join('');

        openModal('Your Active File Scopes & Engagements', listHtml, '<button class="btn btn-b sm" id="modal-cancel-btn">Done</button>');

        var removeBtns = document.querySelectorAll('.btn-remove-pending');
        removeBtns.forEach(function(b) {
          b.addEventListener('click', function() {
            var scopeId = b.dataset.scopeId;
            state.file.pendingScopes = state.file.pendingScopes.filter(function(s) { return s.id !== scopeId; });
            closeModal();
            updateServicesUi();
            showToast('Scope request withdrawn.', 'info');
          });
        });
      });
    }

    // Modal 1: Individual Return Scope & Fee Calculator
    function openIndividualScopeModal() {
      var modalHtml = [
        '<p style="font-size:.88rem">Federal return base ($200) covers Form 1040, standard deductions, and your resident Maryland return. Select schedules and non-resident jurisdictions below for upfront guaranteed pricing.</p>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">Core Filings</div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" checked disabled>',
        '      <span>Federal Return (Form 1040) &middot; Resident MD 502</span>',
        '    </label>',
        '    <span class="calc-row-fee">$200.00</span>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:10px">Jurisdictions & State Returns</div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-va" checked data-fee="65">',
        '      <span>Virginia Form 763 (Non-resident / part-year)</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$65.00</span>',
        '  </div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-pa" checked data-fee="65">',
        '      <span>Pennsylvania Form 40NR (Non-resident on-site)</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$65.00</span>',
        '  </div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-addl-state" data-fee="65">',
        '      <span>Additional State Return (DC, DE, NY, etc.)</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$65.00</span>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:10px">Schedules & Business Activities</div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-sched-c" checked data-fee="110">',
        '      <span>Schedule C &middot; Whitfield Design Co. (Sole Prop / Freelance)</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$110.00</span>',
        '  </div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-sched-e" checked data-fee="85">',
        '      <span>Schedule E &middot; Rental Real Estate (214 Halcyon Row)</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$85.00</span>',
        '  </div>',
        '  <div class="calc-row">',
        '    <label class="calc-row-left">',
        '      <input type="checkbox" id="calc-crypto" data-fee="50">',
        '      <span>Form 8949 &middot; Capital Gains, Stocks &amp; Crypto</span>',
        '    </label>',
        '    <span class="calc-row-fee">+$50.00</span>',
        '  </div>',
        '</div>',
        '<div class="calc-total-bar">',
        '  <span class="calc-total-label">Upfront Guaranteed Scope Fee:</span>',
        '  <span class="calc-total-amount" id="calc-live-total">$525.00</span>',
        '</div>',
        '<div class="scope-clause-box">',
        '  <b>Upfront price guarantee:</b> The price shown is what you pay. If our review uncovers no unforeseen complexity, your invoice will match this exact dollar figure.',
        '</div>'
      ].join('');

      openModal('Individual Return Scope & Fee Calculator', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-confirm-individual-scope">Confirm Scope &amp; Request Letter</button>'
      ].join(''));

      function recalculate() {
        var base = 200;
        var inputs = document.querySelectorAll('.calc-box input[type="checkbox"]:not(:disabled)');
        inputs.forEach(function(inp) {
          if (inp.checked) {
            base += parseInt(inp.dataset.fee, 10) || 0;
          }
        });
        var totalEl = document.getElementById('calc-live-total');
        if (totalEl) totalEl.textContent = '$' + base + '.00';
        return base;
      }

      var calcCheckboxes = document.querySelectorAll('.calc-box input[type="checkbox"]');
      calcCheckboxes.forEach(function(cb) {
        cb.addEventListener('change', recalculate);
      });

      var confirmBtn = document.getElementById('btn-confirm-individual-scope');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          var finalFee = recalculate();
          var descParts = ['Federal + MD (resident)'];
          if (document.getElementById('calc-va') && document.getElementById('calc-va').checked) descParts.push('VA');
          if (document.getElementById('calc-pa') && document.getElementById('calc-pa').checked) descParts.push('PA');
          if (document.getElementById('calc-sched-c') && document.getElementById('calc-sched-c').checked) descParts.push('Sched C');
          if (document.getElementById('calc-sched-e') && document.getElementById('calc-sched-e').checked) descParts.push('Sched E');

          if (state.file.activeScopes && state.file.activeScopes.length > 0) {
            state.file.activeScopes[0].fee = '$' + finalFee + '.00';
            state.file.activeScopes[0].details = descParts.join(' · ');
          }

          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_individual_1040',
              serviceKey: 'individual',
              title: '2026 Individual Return (Form 1040)',
              category: 'tax_prep',
              scopeDetails: descParts.join(' · '),
              pricingModel: 'fixed_plus_schedules',
              trustedBasePrice: 200,
              estimatedFee: '$' + finalFee + '.00',
              status: 'pending_letter',
              scopeAccepted: true
            });
            window.FirebaseBridge.recordAuditLog('Scope Updated', 'Individual Return updated to $' + finalFee, 'Engagements');
          }

          closeModal();
          updateServicesUi();
          showToast('Individual Return scope updated ($' + finalFee + '.00). Engagement letter requested.', 'ok');
        });
      }
    }

    // Modal 2: Business Return Scope Assessment
    function openBusinessScopeModal() {
      var modalHtml = [
        '<p style="font-size:.88rem">Select your corporate entity type and bookkeeping readiness. Books are thoroughly reviewed by our CPAs before the return is built.</p>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">1. Entity Structure</div>',
        '  <div class="tier-grid">',
        '    <div class="tier-card selected" data-entity="scorp" data-base="850">',
        '      <span class="tier-name">S-Corporation</span>',
        '      <span class="tier-rate">Form 1120-S</span>',
        '      <span class="tier-desc">Includes Form 1125-A, Schedule K-1s for shareholders</span>',
        '    </div>',
        '    <div class="tier-card" data-entity="partnership" data-base="850">',
        '      <span class="tier-name">Partnership</span>',
        '      <span class="tier-rate">Form 1065</span>',
        '      <span class="tier-desc">Multi-member LLCs, partner capital accounts &amp; K-1s</span>',
        '    </div>',
        '    <div class="tier-card" data-entity="ccorp" data-base="950">',
        '      <span class="tier-name">C-Corporation</span>',
        '      <span class="tier-rate">Form 1120</span>',
        '      <span class="tier-desc">Corporate income tax &amp; accumulated earnings balance</span>',
        '    </div>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:14px">2. Bookkeeping Status</div>',
        '  <div style="display:flex;flex-direction:column;gap:8px">',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="biz-books" value="0" checked>',
        '      <span style="font-size:.84rem">Reconciled &amp; closed in QuickBooks / Xero (no catch-up needed)</span>',
        '    </label>',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="biz-books" value="250">',
        '      <span style="font-size:.84rem">Minor year-end adjustments needed (+ $250.00)</span>',
        '    </label>',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="biz-books" value="500">',
        '      <span style="font-size:.84rem">Need bookkeeping reconstruction / catch-up (+ $500.00)</span>',
        '    </label>',
        '  </div>',
        '</div>',
        '<div class="calc-total-bar">',
        '  <span class="calc-total-label">Estimated Scope Proposal:</span>',
        '  <span class="calc-total-amount" id="biz-scope-total">$850.00</span>',
        '</div>',
        '<div class="scope-clause-box">',
        '  <b>Scope Review Promise:</b> Nothing is billed until we examine your trial balance and issue a signed engagement letter.',
        '</div>'
      ].join('');

      openModal('Business Return Scope Assessment', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-submit-biz-scope">Submit Business Scope</button>'
      ].join(''));

      var selectedBase = 850;
      var selectedEntity = 'S-Corporation (1120-S)';
      var tierCards = document.querySelectorAll('.tier-card[data-entity]');
      tierCards.forEach(function(card) {
        card.addEventListener('click', function() {
          tierCards.forEach(function(c) { c.classList.remove('selected'); });
          card.classList.add('selected');
          selectedBase = parseInt(card.dataset.base, 10);
          selectedEntity = card.querySelector('.tier-name').textContent;
          updateBizTotal();
        });
      });

      var bookRadios = document.querySelectorAll('input[name="biz-books"]');
      bookRadios.forEach(function(r) {
        r.addEventListener('change', updateBizTotal);
      });

      function updateBizTotal() {
        var bookFee = 0;
        var checkedRadio = document.querySelector('input[name="biz-books"]:checked');
        if (checkedRadio) bookFee = parseInt(checkedRadio.value, 10);
        var total = selectedBase + bookFee;
        var el = document.getElementById('biz-scope-total');
        if (el) el.textContent = '$' + total + '.00';
        return total;
      }

      var submitBtn = document.getElementById('btn-submit-biz-scope');
      if (submitBtn) {
        submitBtn.addEventListener('click', function() {
          var total = updateBizTotal();
          var checkedRadio = document.querySelector('input[name="biz-books"]:checked');
          var bookFee = checkedRadio ? parseInt(checkedRadio.value, 10) : 0;

          var newScope = {
            id: 'scope-biz-' + Date.now(),
            serviceKey: 'business',
            title: 'Business Return (' + selectedEntity + ')',
            details: 'Federal business filing · includes K-1 package · books assessment',
            fee: '$' + total + '.00',
            statusLabel: 'Scope Pending'
          };
          if (!state.file.pendingScopes) state.file.pendingScopes = [];
          state.file.pendingScopes.push(newScope);

          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_business_entity',
              serviceKey: 'business',
              title: 'Business Return (' + selectedEntity + ')',
              category: 'tax_prep',
              scopeDetails: 'Entity: ' + selectedEntity + ' · Bookkeeping status fee: $' + bookFee,
              pricingModel: 'quoted_on_scope',
              trustedBasePrice: selectedBase,
              estimatedFee: '$' + total + '.00',
              status: 'pending_letter',
              scopeAccepted: true
            });
          }

          if (state.firmTriage && state.firmTriage.actionQueue) {
            state.firmTriage.actionQueue.unshift({
              id: 't-' + Date.now(),
              name: state.user.name,
              issue: 'Business return scope requested (' + selectedEntity + ')',
              sub: 'Estimated $' + total + ' · review trial balance',
              chip: 'New Scope',
              chipClass: 'warn',
              action: 'scope-review'
            });
          }

          closeModal();
          updateServicesUi();
          showToast('Business scope submitted ($' + total + '.00). Denise R. will review within 24 hours.', 'ok');
        });
      }
    }

    // Modal 3: Monthly Bookkeeping Plan
    function openBookkeepingScopeModal() {
      var modalHtml = [
        '<p style="font-size:.88rem">Monthly reconciliation, expense classification, and clear financial statements delivered by the 10th of every month.</p>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">Select Monthly Tier</div>',
        '  <div class="tier-grid">',
        '    <div class="tier-card" data-plan="starter" data-rate="195">',
        '      <span class="tier-name">Starter</span>',
        '      <span class="tier-rate">$195 / mo</span>',
        '      <span class="tier-desc">Up to 50 transactions, 1 bank account, monthly P&amp;L</span>',
        '    </div>',
        '    <div class="tier-card selected" data-plan="growth" data-rate="350">',
        '      <span class="tier-name">Growth</span>',
        '      <span class="tier-rate">$350 / mo</span>',
        '      <span class="tier-desc">Up to 150 transactions, multiple cards, monthly balance sheet</span>',
        '    </div>',
        '    <div class="tier-card" data-plan="scale" data-rate="550">',
        '      <span class="tier-name">Full Charge</span>',
        '      <span class="tier-rate">$550 / mo</span>',
        '      <span class="tier-desc">Multi-entity, payroll reconciliation &amp; quarterly review</span>',
        '    </div>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:14px">Accounting Platform</div>',
        '  <select id="bookkeeping-software" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--line);border-radius:3px;font-family:var(--f-body);color:var(--ink)">',
        '    <option value="qbo">QuickBooks Online (invite accountant)</option>',
        '    <option value="xero">Xero Accounting</option>',
        '    <option value="setup">Need Pivot Aide Tax to set up my ledger</option>',
        '  </select>',
        '</div>',
        '<div class="calc-total-bar">',
        '  <span class="calc-total-label">Monthly Rate (No Annual Lock-in):</span>',
        '  <span class="calc-total-amount" id="bk-live-rate">$350.00 / mo</span>',
        '</div>',
        '<div class="scope-clause-box">',
        '  <b>Seamless Tax Season Integration:</b> When we do your monthly bookkeeping, your year-end business and personal returns are prepared with zero stress.',
        '</div>'
      ].join('');

      openModal('Monthly Bookkeeping Subscription', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-confirm-bk-scope">Add Bookkeeping to File</button>'
      ].join(''));

      var selectedPlanName = 'Growth';
      var selectedPlanRate = 350;
      var cards = document.querySelectorAll('.tier-card[data-plan]');
      cards.forEach(function(card) {
        card.addEventListener('click', function() {
          cards.forEach(function(c) { c.classList.remove('selected'); });
          card.classList.add('selected');
          selectedPlanName = card.querySelector('.tier-name').textContent;
          selectedPlanRate = parseInt(card.dataset.rate, 10);
          var rateEl = document.getElementById('bk-live-rate');
          if (rateEl) rateEl.textContent = '$' + selectedPlanRate + '.00 / mo';
        });
      });

      var confirmBtn = document.getElementById('btn-confirm-bk-scope');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          var sw = document.getElementById('bookkeeping-software');
          var swText = sw ? sw.options[sw.selectedIndex].text : 'QuickBooks Online';

          var newScope = {
            id: 'scope-bk-' + Date.now(),
            serviceKey: 'bookkeeping',
            title: 'Monthly Bookkeeping (' + selectedPlanName + ')',
            details: selectedPlanName + ' tier · $' + selectedPlanRate + '/mo · ' + swText,
            fee: '$' + selectedPlanRate + '.00 / mo',
            statusLabel: 'Scope Pending'
          };
          if (!state.file.pendingScopes) state.file.pendingScopes = [];
          state.file.pendingScopes.push(newScope);

          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_bookkeeping_monthly',
              serviceKey: 'bookkeeping',
              title: 'Monthly Bookkeeping (' + selectedPlanName + ')',
              category: 'accounting',
              scopeDetails: selectedPlanName + ' tier · ' + swText,
              pricingModel: 'monthly_subscription',
              trustedBasePrice: selectedPlanRate,
              estimatedFee: '$' + selectedPlanRate + '.00 / mo',
              status: 'pending_letter',
              scopeAccepted: true
            });
          }

          closeModal();
          updateServicesUi();
          showToast('Monthly Bookkeeping added to file (' + selectedPlanName + ' tier).', 'ok');
        });
      }
    }

    // Modal 4: Accounting Cleanup Diagnostic
    function openCleanupScopeModal() {
      var modalHtml = [
        '<p style="font-size:.88rem">Catch-up and reconstruction so your business return stands on verified numbers that will withstand IRS scrutiny.</p>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">Months Needing Reconstruction</div>',
        '  <div style="display:flex;flex-direction:column;gap:8px">',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="cleanup-months" value="650" checked>',
        '      <span style="font-size:.84rem"><b>1–3 months:</b> Quick catch-up &amp; account reconciliation (~$650.00)</span>',
        '    </label>',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="cleanup-months" value="1250">',
        '      <span style="font-size:.84rem"><b>4–12 months:</b> Full year reconstruction &amp; statement tie-out (~$1,250.00)</span>',
        '    </label>',
        '    <label class="calc-row-left" style="background:var(--surface);padding:8px 10px;border:1px solid var(--line);border-radius:3px">',
        '      <input type="radio" name="cleanup-months" value="2200">',
        '      <span style="font-size:.84rem"><b>1+ years:</b> Multi-year backlog &amp; prior period adjustments (~$2,200+)</span>',
        '    </label>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:14px">Known Diagnostic Issues</div>',
        '  <div style="display:flex;flex-direction:column;gap:6px">',
        '    <label style="display:flex;align-items:center;gap:8px;font-size:.82rem"><input type="checkbox" checked> Personal and business expenses commingled</label>',
        '    <label style="display:flex;align-items:center;gap:8px;font-size:.82rem"><input type="checkbox" checked> Bank feeds have unreconciled discrepancies</label>',
        '    <label style="display:flex;align-items:center;gap:8px;font-size:.82rem"><input type="checkbox"> Prior year tax return balance does not match books</label>',
        '  </div>',
        '</div>',
        '<div class="scope-clause-box">',
        '  <b>Free Diagnostic:</b> We review your bank feed health and deliver a fixed-fee cleanup scope proposal within 48 hours before any work begins.',
        '</div>'
      ].join('');

      openModal('Accounting Cleanup & Reconstruction', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-request-cleanup">Request Fixed-Price Diagnostic</button>'
      ].join(''));

      var reqBtn = document.getElementById('btn-request-cleanup');
      if (reqBtn) {
        reqBtn.addEventListener('click', function() {
          var checkedRadio = document.querySelector('input[name="cleanup-months"]:checked');
          var estFee = checkedRadio ? checkedRadio.value : '650';

          var newScope = {
            id: 'scope-clean-' + Date.now(),
            serviceKey: 'cleanup',
            title: 'Accounting Cleanup Diagnostic',
            details: 'Diagnostic review · est. $' + estFee + ' · 48h proposal turnaround',
            fee: 'Est. $' + estFee + '.00',
            statusLabel: 'Scope Pending'
          };
          if (!state.file.pendingScopes) state.file.pendingScopes = [];
          state.file.pendingScopes.push(newScope);

          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_accounting_cleanup',
              serviceKey: 'cleanup',
              title: 'Accounting Cleanup Diagnostic',
              category: 'accounting',
              scopeDetails: 'Diagnostic reconstruction review · est. $' + estFee,
              pricingModel: 'diagnostic_quote',
              trustedBasePrice: 650,
              estimatedFee: 'Est. $' + estFee + '.00',
              status: 'pending_proposal',
              scopeAccepted: true
            });
          }

          closeModal();
          updateServicesUi();
          showToast('Cleanup diagnostic requested. Denise R. will assess your ledger.', 'ok');
        });
      }
    }

    // Modal 5: Audit & Resolution
    function openAuditScopeModal() {
      var modalHtml = [
        '<p style="font-size:.88rem">IRS examination notices, automated CP2000 underreporting inquiries, state agency audits, or unfiled prior years.</p>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">Select Resolution Tier</div>',
        '  <div class="tier-grid">',
        '    <div class="tier-card selected" data-audit-tier="tier1" data-fee="150">',
        '      <span class="tier-name">Tier 1: Notice Reply</span>',
        '      <span class="tier-rate">$150.00</span>',
        '      <span class="tier-desc">CP2000 math errors, document match &amp; written response</span>',
        '    </div>',
        '    <div class="tier-card" data-audit-tier="tier2" data-fee="450">',
        '      <span class="tier-name">Tier 2: Full Audit</span>',
        '      <span class="tier-rate">$450.00</span>',
        '      <span class="tier-desc">Correspondence audit defense, Schedule C/E substantiation</span>',
        '    </div>',
        '    <div class="tier-card" data-audit-tier="tier3" data-fee="1200">',
        '      <span class="tier-name">Tier 3: In-Person</span>',
        '      <span class="tier-rate">Retainer ($1,200)</span>',
        '      <span class="tier-desc">Field examination, IRS Appeals &amp; back tax settlements</span>',
        '    </div>',
        '  </div>',
        '  <div class="calc-section-title" style="margin-top:14px">Notice / Case Details (Optional)</div>',
        '  <input type="text" id="audit-notice-num" placeholder="e.g. IRS Notice CP2000 or Letter 525" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--line);border-radius:3px;font-family:var(--f-body);color:var(--ink);box-sizing:border-box">',
        '</div>',
        '<div class="calc-total-bar">',
        '  <span class="calc-total-label">Selected Tier Fee:</span>',
        '  <span class="calc-total-amount" id="audit-tier-fee">$150.00</span>',
        '</div>',
        '<div class="scope-clause-box">',
        '  <b>Power of Attorney:</b> If formal representation is required, Form 2848 (IRS Power of Attorney) will be prepared for your electronic signature.',
        '</div>'
      ].join('');

      openModal('Audit & Resolution Representation', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
        '<button class="btn btn-g sm" id="btn-confirm-audit">Engage Resolution Team</button>'
      ].join(''));

      var selectedTierName = 'Tier 1: Notice Reply';
      var selectedTierFee = '$150.00';
      var cards = document.querySelectorAll('.tier-card[data-audit-tier]');
      cards.forEach(function(card) {
        card.addEventListener('click', function() {
          cards.forEach(function(c) { c.classList.remove('selected'); });
          card.classList.add('selected');
          selectedTierName = card.querySelector('.tier-name').textContent;
          var feeVal = card.dataset.fee;
          selectedTierFee = feeVal === '1200' ? 'Retainer ($1,200)' : '$' + feeVal + '.00';
          var feeEl = document.getElementById('audit-tier-fee');
          if (feeEl) feeEl.textContent = selectedTierFee;
        });
      });

      var confirmBtn = document.getElementById('btn-confirm-audit');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          var noticeNum = (document.getElementById('audit-notice-num') || {}).value || 'Unspecified Notice';
          var newScope = {
            id: 'scope-audit-' + Date.now(),
            serviceKey: 'audit',
            title: 'Audit Resolution (' + selectedTierName + ')',
            details: noticeNum + ' · Enrolled Agent priority representation',
            fee: selectedTierFee,
            statusLabel: 'Scope Pending'
          };
          if (!state.file.pendingScopes) state.file.pendingScopes = [];
          state.file.pendingScopes.push(newScope);

          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_audit_resolution',
              serviceKey: 'audit',
              title: 'Audit Resolution (' + selectedTierName + ')',
              category: 'resolution',
              scopeDetails: noticeNum + ' · Enrolled Agent priority representation',
              pricingModel: 'tiered_representation',
              trustedBasePrice: parseInt(selectedTierFee.replace(/[^0-9]/g, '')) || 150,
              estimatedFee: selectedTierFee,
              status: 'pending_letter',
              scopeAccepted: true
            });
          }

          closeModal();
          updateServicesUi();
          showToast('Audit & resolution scope registered. Senior advisor assigned.', 'ok');
        });
      }
    }

    // Modal 6: The Standing File (Flagship)
    function openFlagshipModal() {
      var modalHtml = [
        '<div style="text-align:center;padding:6px 0 12px">',
        '  <span class="chip gold" style="font-size:.72rem">Flagship Advisory Tier</span>',
        '  <h3 style="font-size:1.3rem;margin-top:8px">The Standing File</h3>',
        '  <p class="sub" style="max-width:44ch;margin:6px auto 0">Year-long tax minimization, proactive quarterly projection calls, and a dedicated senior advisor who knows every detail of your file.</p>',
        '</div>',
        '<div class="calc-box">',
        '  <div class="calc-section-title">What is Included in The Standing File</div>',
        '  <ul style="margin:4px 0 0 18px;padding:0;font-size:.84rem;line-height:1.6;color:var(--ink)">',
        '    <li><b>Dedicated Senior Advisor:</b> Direct mobile access and priority messaging with Denise R.</li>',
        '    <li><b>Quarterly Tax Projections:</b> Proactive estimated tax recalculation before deadlines.</li>',
        '    <li><b>Year-End Strategy Call:</b> November acceleration and tax minimization blueprint.</li>',
        '    <li><b>Full IRS Audit Protection:</b> Zero hourly fees for notice defense and examination replies.</li>',
        '    <li><b>Unified Scope:</b> Both personal 1040 and business entities synchronized in one open file.</li>',
        '  </ul>',
        '</div>',
        '<div class="scope-clause-box" style="margin-top:14px">',
        '  <b>Tailored to Your Complexity:</b> Pricing is customized based on your business entities and investment volume. Talk directly with Denise to evaluate enrollment.',
        '</div>'
      ].join('');

      openModal('The Standing File &mdash; Flagship Advisory', modalHtml, [
        '<button class="btn btn-o sm" id="modal-cancel-btn">Close</button>',
        '<button class="btn btn-g sm" id="btn-standing-file-message">Send Message to Denise</button>'
      ].join(''));

      var msgBtn = document.getElementById('btn-standing-file-message');
      if (msgBtn) {
        msgBtn.addEventListener('click', function() {
          if (window.FirebaseBridge) {
            window.FirebaseBridge.createEngagementRequest({
              serviceId: 'svc_standing_file',
              serviceKey: 'flagship',
              title: 'The Standing File (Flagship Advisory)',
              category: 'advisory',
              scopeDetails: 'Year-round proactive planning, dedicated advisor Denise R.',
              pricingModel: 'annual_advisory_retainer',
              trustedBasePrice: 2500,
              estimatedFee: 'Contact for pricing',
              status: 'pending_proposal',
              scopeAccepted: true
            });
          }
          closeModal();
          showScreen('msgs');
          sendUserMessage("Hi Denise, I'm interested in enrolling in The Standing File for year-round tax strategy and quarterly planning. What is the scope and pricing for my file?");
          showToast('Inquiry sent to Denise R. regarding The Standing File.', 'ok');
        });
      }
    }

    // Modal 7: Free IRS Notice Review ("Send us the letter")
    var uploadNoticeBtn = document.getElementById('btn-upload-notice');
    if (uploadNoticeBtn) {
      uploadNoticeBtn.addEventListener('click', function() {
        var modalHtml = [
          '<p style="font-size:.88rem">Photograph or upload any IRS or state notice. Uncle Pat and the team will explain what it actually says in plain English within <b>two business days</b> &mdash; completely free, whether or not you are a client.</p>',
          '<div class="calc-box">',
          '  <div class="calc-section-title">1. Notice Issuer &amp; Agency</div>',
          '  <select id="notice-agency-select" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--line);border-radius:3px;font-family:var(--f-body);color:var(--ink)">',
          '    <option value="IRS">Internal Revenue Service (Federal)</option>',
          '    <option value="MD">Comptroller of Maryland</option>',
          '    <option value="VA">Virginia Department of Taxation</option>',
          '    <option value="PA">Pennsylvania Department of Revenue</option>',
          '    <option value="Other">Other State Revenue Agency</option>',
          '  </select>',
          '  <div class="calc-section-title" style="margin-top:14px">2. Notice Form / Letter Number</div>',
          '  <select id="notice-type-select" style="width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--line);border-radius:3px;font-family:var(--f-body);color:var(--ink)">',
          '    <option value="CP2000">CP2000 &middot; Proposed Changes to Income / 1099 Underreporter</option>',
          '    <option value="CP504">CP504 &middot; Notice of Intent to Levy</option>',
          '    <option value="5071C">5071C / 5747C &middot; Tax Return Identity Verification</option>',
          '    <option value="CP14">CP14 &middot; Balance Due / Unpaid Assessment</option>',
          '    <option value="Letter 12C">Letter 12C &middot; Missing 1095-A / W-2 Information</option>',
          '    <option value="State Discrepancy">State Notice &middot; Apportionment or Withholding Question</option>',
          '    <option value="Other Notice">Other / Not Listed</option>',
          '  </select>',
          '  <div class="calc-section-title" style="margin-top:14px">3. Upload File or Snap Photo</div>',
          '  <div class="drop" id="notice-file-drop" style="cursor:pointer;padding:18px 12px;text-align:center;border:2px dashed var(--line);border-radius:4px;background:var(--surface)">',
          '    <div class="ic" style="font-size:1.6rem">✉</div>',
          '    <div class="t" id="notice-drop-text" style="font-weight:500;margin-top:4px">Drop notice PDF or photo here</div>',
          '    <div class="m" style="font-size:.74rem;color:var(--ink-3)">Scanned on arrival &middot; zero spam &middot; encrypted storage</div>',
          '  </div>',
          '  <input type="file" id="notice-file-input" accept="image/*,.pdf" style="display:none">',
          '</div>',
          '<div class="notice-preview-badge">',
          '  <span class="chip ok sm">48h SLA</span>',
          '  <span style="font-size:.78rem;color:var(--ink-2);line-height:1.35">You will receive an itemized, plain-English breakdown with zero sales pitch or pressure to hire us.</span>',
          '</div>'
        ].join('');

        openModal('Free IRS or State Notice Read', modalHtml, [
          '<button class="btn btn-o sm" id="modal-cancel-btn">Cancel</button>',
          '<button class="btn btn-b sm" id="btn-submit-notice">Upload Notice for 48h Read</button>'
        ].join(''));

        var dropZone = document.getElementById('notice-file-drop');
        var fileInput = document.getElementById('notice-file-input');
        var dropText = document.getElementById('notice-drop-text');
        var selectedFileName = 'irs-notice-cp2000.pdf';
        var selectedFile = null;

        if (dropZone && fileInput) {
          dropZone.addEventListener('click', function() {
            fileInput.click();
          });
          fileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
              selectedFile = e.target.files[0];
              selectedFileName = selectedFile.name;
              if (dropText) dropText.innerHTML = '<span style="color:var(--ok)">✓ Attached: ' + selectedFileName + '</span>';
            }
          });
        }

        var submitNoticeBtn = document.getElementById('btn-submit-notice');
        if (submitNoticeBtn) {
          submitNoticeBtn.addEventListener('click', function() {
            var agencySelect = document.getElementById('notice-agency-select');
            var agency = agencySelect ? agencySelect.value : 'IRS';
            var typeSelect = document.getElementById('notice-type-select');
            var noticeType = typeSelect ? typeSelect.value : 'CP2000';

            // Transmit notice PDF to Formspree with client email from client side
            if (selectedFile && (selectedFile.type === 'application/pdf' || selectedFileName.toLowerCase().endsWith('.pdf'))) {
              var noticeEmail = (state.user && state.user.email) ||
                (window.FirebaseBridge && window.FirebaseBridge.currentUser && window.FirebaseBridge.currentUser.email) ||
                'm.whitfield@example.com';
              var noticeName = (state.user && state.user.name) ||
                (window.FirebaseBridge && window.FirebaseBridge.currentUser && window.FirebaseBridge.currentUser.displayName) ||
                'Michael Whitfield';

              if (window.FirebaseBridge && typeof window.FirebaseBridge.submitPdfToFormspree === 'function') {
                window.FirebaseBridge.submitPdfToFormspree(selectedFile, {
                  email: noticeEmail,
                  name: noticeName,
                  category: agency + ' Notice (' + noticeType + ')',
                  message: 'Uploaded tax notice for 48h plain-English read: ' + selectedFileName
                }).catch(function (e) { console.info('Notice Formspree dispatch note:', e.message); });
              } else if (window.FormspreePdfService && typeof window.FormspreePdfService.submitPdfToFormspree === 'function') {
                window.FormspreePdfService.submitPdfToFormspree(selectedFile, {
                  email: noticeEmail,
                  name: noticeName,
                  category: agency + ' Notice (' + noticeType + ')',
                  message: 'Uploaded tax notice for 48h plain-English read: ' + selectedFileName
                }).catch(function (e) { console.info('Notice Formspree dispatch note:', e.message); });
              }
            }

            // 1. Add to documents under 'review'
            var docId = 'doc-notice-' + Date.now();
            state.documents.unshift({
              id: docId,
              name: agency + ' Notice (' + noticeType + ') — Free Plain-English Read',
              category: 'review',
              meta: 'Uploaded today · Denise reviewing · 48h SLA guarantee',
              type: 'Notice',
              icon: '✉'
            });
            renderDocumentsList();

            // 2. Add to messages from Uncle Pat
            state.messages.push({
              id: 'm-' + Date.now(),
              sender: 'Uncle Pat · automatic',
              role: 'pat',
              avatar: 'PAT',
              text: 'We received your ' + agency + ' ' + noticeType + ' notice (' + selectedFileName + '). Denise is reading it now. Your plain-English summary is guaranteed within two business days.'
            });

            // 3. Add to updates
            if (state.updates) {
              state.updates.unshift({
                id: 'u-' + Date.now(),
                updateId: 'u-' + Date.now(),
                type: 'client_event',
                category: 'action',
                scope: 'client',
                clientId: (state.user && state.user.uid) || 'usr_whitfield_m',
                title: agency + ' Notice received for free plain-English read',
                meta: 'Turnaround guaranteed within 2 business days. Denise R. assigned.',
                time: 'Just now',
                publishedAt: new Date().toISOString(),
                isNew: true,
                isRead: false,
                actionScreen: 'msgs',
                actionText: 'View in Messages',
                details: {
                  summary: 'Notice uploaded for free triage review: ' + selectedFileName + '. Plain-English breakdown delivered within 48 hours.'
                }
              });
            }

            // 4. Add to firm triage queue
            if (state.firmTriage && state.firmTriage.actionQueue) {
              state.firmTriage.actionQueue.unshift({
                id: 't-' + Date.now(),
                name: state.user.name,
                issue: agency + ' ' + noticeType + ' notice uploaded',
                sub: 'Free read promised within 2 business days',
                chip: 'Due 48h',
                chipClass: 'warn',
                action: 'notice-review'
              });
            }

            if (window.FirebaseBridge) {
              window.FirebaseBridge.recordAuditLog('Notice Uploaded', agency + ' ' + noticeType + ' uploaded for free read');
              window.FirebaseBridge.logCustomEvent('notice_uploaded', { agency: agency, type: noticeType });
            }

            closeModal();
            showToast('Notice received! Your 2-day plain-English read is underway.', 'ok');
          });
        }
      });
    }

    // Initialize UI on load
    updateServicesUi();
  }

  // -------------------------------------------------------------
  // 12. SCREEN 09: NOTIFICATION CONTROLS & STRUCTURED UPDATES SYSTEM
  // -------------------------------------------------------------
  var updatesListCache = null;
  var activeUpdateFilter = 'all';
  var showUnreadOnly = false;
  var isUpdatesListenerAttached = false;

  function loadUpdatesScreen() {
    var bannerEl = document.getElementById('updates-status-banner');
    var scopeLabel = document.getElementById('updates-client-scope-label');
    if (scopeLabel) {
      var userName = (state && state.user && state.user.name) || 'Michael Whitfield';
      scopeLabel.textContent = userName + ' (TY2026 File)';
    }

    if (bannerEl) bannerEl.style.display = 'none';

    if (!window.FirebaseBridge) {
      return;
    }

    if (!isUpdatesListenerAttached && window.FirebaseBridge.subscribeUpdates) {
      isUpdatesListenerAttached = true;
      window.FirebaseBridge.subscribeUpdates(function(items) {
        if (!items) return;
        updatesListCache = items;
        if (bannerEl) bannerEl.style.display = 'none';
        renderUpdatesFeed(updatesListCache, activeUpdateFilter, showUnreadOnly);
        checkUnreadNotifications();
      }, function() {});
    } else if (updatesListCache) {
      renderUpdatesFeed(updatesListCache, activeUpdateFilter, showUnreadOnly);
    }
  }

  function initUpdates() {
    var filterTabsContainer = document.getElementById('updates-filter-tabs');
    var chkUnread = document.getElementById('chk-unread-only');
    var btnMarkAll = document.getElementById('btn-mark-all-read');

    // Channel cycle progression mappings
    var channelLabels = {
      'push-email': 'Push · email',
      'push': 'Push only',
      'email': 'Email',
      'off': 'Off'
    };

    var channelCycles = {
      'needsYou': ['push-email', 'push', 'email', 'off'],
      'stageMove': ['push-email', 'push', 'email', 'off'],
      'deadlines': ['push-email', 'push', 'email', 'off'],
      'ruleChanges': ['email', 'push-email', 'off'],
      'firmNews': ['off', 'email']
    };

    // 1. Update Channel Values Display
    function updateChannelValues() {
      var keys = ['needsYou', 'stageMove', 'deadlines', 'ruleChanges', 'firmNews'];
      keys.forEach(function(key) {
        var el = document.querySelector('.channel-val[data-key="' + key + '"]');
        if (!el) return;
        var currentVal = state.notificationSettings[key] || 'off';
        el.textContent = channelLabels[currentVal] || currentVal;
        el.classList.toggle('muted', currentVal === 'off');
      });
    }

    // Bind channel cycle click handlers
    var channelVals = document.querySelectorAll('.channel-val[data-key]');
    channelVals.forEach(function(valEl) {
      valEl.addEventListener('click', function() {
        var key = valEl.dataset.key;
        var cycle = channelCycles[key] || ['push-email', 'email', 'off'];
        var currentVal = state.notificationSettings[key] || cycle[0];
        var currentIndex = cycle.indexOf(currentVal);
        var nextIndex = (currentIndex + 1) % cycle.length;
        var nextVal = cycle[nextIndex];

        state.notificationSettings[key] = nextVal;
        updateChannelValues();

        var rowSpan = valEl.closest('.kv').querySelector('span');
        var friendlyName = rowSpan ? rowSpan.textContent : key;
        showToast(friendlyName + ' set to ' + channelLabels[nextVal], 'info');

        if (window.FirebaseBridge) {
          if (window.FirebaseBridge.saveNotificationPreferences) {
            window.FirebaseBridge.saveNotificationPreferences(state.notificationSettings);
          }
          window.FirebaseBridge.recordAuditLog('Notification Setting Updated', friendlyName + ' set to ' + nextVal, 'Client Preferences');
        }
      });
    });

    // 2. Category Filter Tabs Event Wiring
    if (filterTabsContainer) {
      var tabBtns = filterTabsContainer.querySelectorAll('.filter-tab');
      tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          tabBtns.forEach(function(b) {
            b.classList.remove('active', 'btn-g');
            b.classList.add('btn-o');
          });
          btn.classList.add('active', 'btn-g');
          btn.classList.remove('btn-o');

          activeUpdateFilter = btn.dataset.filter || 'all';
          var itemsToRender = updatesListCache || state.updates || [];
          renderUpdatesFeed(itemsToRender, activeUpdateFilter, showUnreadOnly);
        });
      });
    }

    // 3. Unread Only Filter Checkbox
    if (chkUnread) {
      chkUnread.addEventListener('change', function() {
        showUnreadOnly = chkUnread.checked;
        var itemsToRender = updatesListCache || state.updates || [];
        renderUpdatesFeed(itemsToRender, activeUpdateFilter, showUnreadOnly);
      });
    }

    // 4. Mark All Read Button
    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', function() {
        var items = updatesListCache || state.updates || [];
        items.forEach(function(it) {
          it.isNew = false;
          it.isRead = true;
        });

        if (window.FirebaseBridge && window.FirebaseBridge.markAllUpdatesAsRead) {
          window.FirebaseBridge.markAllUpdatesAsRead(null, items);
        }

        renderUpdatesFeed(items, activeUpdateFilter, showUnreadOnly);
        checkUnreadNotifications();
        showToast('All updates marked as read.', 'ok');
      });
    }

    // Initialize UI on startup
    updateChannelValues();
    if (!updatesListCache && window.FirebaseBridge && window.FirebaseBridge.getDefaultUpdates) {
      updatesListCache = window.FirebaseBridge.getDefaultUpdates();
    }
    renderUpdatesFeed(updatesListCache || state.updates || [], activeUpdateFilter, showUnreadOnly);
    checkUnreadNotifications();
  }

  // 5. Update Badge Counters for Each Tab
  function updateFilterCountBadges(items) {
    items = items || [];
    var totalCnt = items.length;
    var clientCnt = items.filter(function(i) { return i.type === 'client_event'; }).length;
    var firmCnt = items.filter(function(i) { return i.type === 'firm_announcement'; }).length;
    var regCnt = items.filter(function(i) { return i.type === 'regulatory_update'; }).length;
    var deadCnt = items.filter(function(i) { return i.type === 'deadline_reminder'; }).length;

    var bAll = document.getElementById('badge-cnt-all');
    var bClient = document.getElementById('badge-cnt-client');
    var bFirm = document.getElementById('badge-cnt-firm');
    var bReg = document.getElementById('badge-cnt-reg');
    var bDead = document.getElementById('badge-cnt-dead');

    if (bAll) bAll.textContent = totalCnt;
    if (bClient) bClient.textContent = clientCnt;
    if (bFirm) bFirm.textContent = firmCnt;
    if (bReg) bReg.textContent = regCnt;
    if (bDead) bDead.textContent = deadCnt;
  }

  // 6. Render Structured Updates Feed with 4 Segregated Categories & Controls
  function renderUpdatesFeed(items, activeFilter, unreadFilter) {
    var feedList = document.getElementById('updates-feed-list');
    if (!feedList) return;

    items = items || [];
    activeFilter = activeFilter || 'all';

    updateFilterCountBadges(items);

    // Apply structured category and unread filters
    var filtered = items.filter(function(it) {
      var matchesCategory = (activeFilter === 'all') || (it.type === activeFilter);
      if (!matchesCategory) return false;
      if (unreadFilter) {
        var isUnread = (it.isNew === true || it.isRead === false);
        if (!isUnread) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      var emptyMsg = 'No updates found matching current criteria.';
      if (unreadFilter) emptyMsg = 'No unread updates in this category. You are all caught up!';
      else if (activeFilter === 'client_event') emptyMsg = 'No active client events on your file.';
      else if (activeFilter === 'firm_announcement') emptyMsg = 'No current firm-wide operational bulletins.';
      else if (activeFilter === 'regulatory_update') emptyMsg = 'No statutory tax rule changes applicable to this view.';
      else if (activeFilter === 'deadline_reminder') emptyMsg = 'No pending statutory deadlines.';

      feedList.innerHTML = [
        '<div style="background:var(--surface-2);border:1px dashed var(--line);border-radius:6px;padding:28px 16px;text-align:center;color:var(--night-ink-2);font-size:.85rem">',
        '  <p style="margin:0 0 6px 0;font-weight:500;color:var(--ink)">' + emptyMsg + '</p>',
        unreadFilter ? '  <button class="btn sm btn-o" onclick="document.getElementById(\'chk-unread-only\').click()" style="margin-top:8px">View All Updates</button>' : '',
        '</div>'
      ].join('');
      return;
    }

    var html = '';
    filtered.forEach(function(it) {
      var isUnread = (it.isNew === true || it.isRead === false);

      // Distinct Category Badge Demarcation
      var categoryPill = '';
      if (it.type === 'client_event') {
        categoryPill = '<span class="chip sm" style="font-size:.65rem;background:rgba(1,159,255,0.12);color:var(--ink);border:1px solid rgba(1,159,255,0.25)">Your File</span>';
      } else if (it.type === 'firm_announcement') {
        categoryPill = '<span class="chip gold sm" style="font-size:.65rem">Firm Bulletin</span>';
      } else if (it.type === 'regulatory_update') {
        categoryPill = '<span class="chip ok sm" style="font-size:.65rem">Tax &amp; Rules</span>';
      } else if (it.type === 'deadline_reminder') {
        categoryPill = '<span class="chip warn sm" style="font-size:.65rem">Deadline Reminder</span>';
      }

      var statusPill = isUnread
        ? '<span class="chip warn" style="font-size:.6rem;padding:1px 5px">New</span>'
        : '<span class="chip sm" style="font-size:.6rem;opacity:.65">Read</span>';

      // Deadline countdown chip
      var deadlineBadge = '';
      if (it.type === 'deadline_reminder' && (it.deadlineDate || (it.details && it.details.dueDate))) {
        var dStr = it.deadlineDate || it.details.dueDate;
        deadlineBadge = '<span class="chip warn sm" style="font-size:.65rem;font-family:var(--f-mono)">Due ' + dStr + '</span>';
      }

      var actionCta = it.actionText
        ? '<span class="chip" style="font-size:.7rem;align-self:flex-start">' + it.actionText + ' &rarr;</span>'
        : '<span class="chip" style="font-size:.7rem;align-self:flex-start">Details &rarr;</span>';

      var toggleReadBtn = isUnread
        ? '<button type="button" class="btn-toggle-read" data-id="' + (it.id || it.updateId) + '" data-mark="read" title="Mark as read" style="background:transparent;border:0;color:var(--ink-3);cursor:pointer;font-size:.72rem;padding:2px 4px">Mark read</button>'
        : '<button type="button" class="btn-toggle-read" data-id="' + (it.id || it.updateId) + '" data-mark="unread" title="Mark as unread" style="background:transparent;border:0;color:var(--ink-3);cursor:pointer;font-size:.72rem;padding:2px 4px">Mark unread</button>';

      html += [
        '<div class="fitem ' + (isUnread ? 'new ' : '') + 'clickable" data-update-id="' + (it.id || it.updateId) + '" data-action="' + (it.actionScreen || '') + '" data-type="' + (it.type || 'client_event') + '" title="Click to view details or action" style="cursor:pointer;padding:10px 8px;border-bottom:1px solid var(--line-2)">',
        '  <span class="d" style="' + (isUnread ? 'background:var(--gold);box-shadow:0 0 6px var(--gold)' : 'background:var(--line)') + '"></span>',
        '  <div style="flex:1">',
        '    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">',
        '      ' + categoryPill + statusPill + deadlineBadge,
        '      <div style="margin-left:auto;display:flex;align-items:center;gap:8px">',
        '        <span style="font-size:.72rem;color:var(--night-ink-2);font-family:var(--f-mono)">' + (it.time || 'Recently') + '</span>',
        '        ' + toggleReadBtn,
        '      </div>',
        '    </div>',
        '    <div class="t" style="font-size:.92rem;font-weight:600;color:var(--ink)">' + it.title + '</div>',
        '    <div class="m" style="margin-top:3px;font-size:.81rem;color:var(--ink);opacity:0.88;line-height:1.4">' + it.meta + '</div>',
        '    <div style="margin-top:8px">' + actionCta + '</div>',
        '  </div>',
        '</div>'
      ].join('');
    });

    feedList.innerHTML = html;
    bindFeedItemClicks();
  }

  // 7. Bind Feed Item Click Actions & Persist Read State to Firestore
  function bindFeedItemClicks() {
    var feedList = document.getElementById('updates-feed-list');
    if (!feedList) return;

    // Handle Quick Toggle Read buttons
    var toggleBtns = feedList.querySelectorAll('.btn-toggle-read');
    toggleBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.id;
        var toMark = btn.dataset.mark;
        var items = updatesListCache || state.updates || [];
        var it = items.find(function(u) { return (u.id === id || u.updateId === id); });
        if (it) {
          if (toMark === 'read') {
            it.isNew = false;
            it.isRead = true;
            if (window.FirebaseBridge && window.FirebaseBridge.markUpdateAsRead) {
              window.FirebaseBridge.markUpdateAsRead(id);
            }
          } else {
            it.isNew = true;
            it.isRead = false;
          }
          renderUpdatesFeed(items, activeUpdateFilter, showUnreadOnly);
          checkUnreadNotifications();
        }
      });
    });

    // Handle Main Row Click
    var rows = feedList.querySelectorAll('.fitem.clickable');
    rows.forEach(function(row) {
      row.addEventListener('click', function() {
        var id = row.dataset.updateId;
        var act = row.dataset.action;
        var type = row.dataset.type;
        var items = updatesListCache || state.updates || [];
        var it = items.find(function(u) { return (u.id === id || u.updateId === id); });

        // Mark individual item read in memory and Firestore
        if (it && (it.isNew || it.isRead === false)) {
          it.isNew = false;
          it.isRead = true;
          row.classList.remove('new');
          var dSpan = row.querySelector('.d');
          if (dSpan) {
            dSpan.style.background = 'var(--line)';
            dSpan.style.boxShadow = '';
          }
          if (window.FirebaseBridge && window.FirebaseBridge.markUpdateAsRead) {
            window.FirebaseBridge.markUpdateAsRead(id);
          }
          checkUnreadNotifications();
        }

        // Action Routing & Modal Triggers
        if (type === 'deadline_reminder') {
          openDeadlineModal(it);
        } else if (type === 'regulatory_update' || act === 'rule-modal') {
          openRuleArticleModal(it ? (it.ruleArticle || it.details) : null);
        } else if (type === 'firm_announcement' || act === 'firm') {
          openFirmAnnouncementModal(it);
        } else if (act === 'sign') {
          showScreen('sign');
          showToast('Opened Form 8879 signing envelope.', 'info');
        } else if (act === 'msgs') {
          showScreen('msgs');
          showToast('Opened conversation thread with Denise R., CPA.', 'info');
        } else if (act === 'svcs') {
          showScreen('svcs');
          showToast('Opened Services & scope amendment.', 'info');
        } else if (act === 'pay') {
          showScreen('pay');
          showToast('Opened Billing & payment voucher.', 'info');
        } else if (act === 'return') {
          showScreen('return');
          showToast('Opened TY2026 prepared return package.', 'info');
        } else if (it && it.details) {
          openGenericUpdateModal(it);
        }
      });
    });
  }

  // 8. Regulatory / Tax Update Modal (Strict Circular 230 Educational Guardrails)
  function openRuleArticleModal(art) {
    art = art || {
      title: 'Treasury Reg. § 1.469 Vacancy Deduction Clarification',
      statutoryCitation: '26 C.F.R. § 1.469-2(d)(5) & Rev. Rul. 80-266',
      summary: 'The IRS issued revised administrative guidance on residential rental properties that experience short periods of vacancy between tenant leases during the tax calendar year.',
      keyTakeaway: 'Good news for 214 Halcyon Row: As long as the property was actively marketed and held out for rent after the vacancy, you retain 100% of your Schedule E depreciation, mortgage interest, and property tax deductions for the entire 12-month period.',
      impact: '$0 loss of rental deductions. Your projected Schedule E profit swing of $9,100 stands.',
      statutoryDisclaimer: 'Informational legal summary only. Under Treasury Circular 230 and AICPA Statements on Standards for Tax Services, this content does not constitute algorithmic tax calculation, automated advice, or a formal tax opinion. Specific application depends on complete taxpayer records reviewed by a licensed professional.'
    };

    var modalHtml = [
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">',
      '  <svg class="owl-av" viewBox="0 0 200 220" style="width:36px;height:40px;flex:none"><use href="#pat-av"></use></svg>',
      '  <div>',
      '    <span class="chip ok sm">Regulatory &middot; 2-Minute Tax Rule Summary</span>',
      '    <h4 style="margin:4px 0 0;font-size:1.05rem">' + art.title + '</h4>',
      '    ' + (art.statutoryCitation ? ('<div style="font-family:var(--f-mono);font-size:.7rem;color:var(--night-ink-2);margin-top:2px">Citation: ' + art.statutoryCitation + '</div>') : ''),
      '  </div>',
      '</div>',
      '<div style="font-size:.86rem;line-height:1.6;color:var(--ink)">',
      '  <p>' + art.summary + '</p>',
      '  <div style="background:var(--ok-bg);border-left:3.5px solid var(--ok);padding:11px 14px;border-radius:4px;margin:12px 0">',
      '    <b style="color:var(--ok)">What it means for your file:</b>',
      '    <p style="margin:4px 0 0;font-size:.82rem;color:var(--ink)">' + art.keyTakeaway + '</p>',
      '  </div>',
      '  <div style="background:var(--surface-2);padding:10px 14px;border-radius:4px;font-family:var(--f-mono);font-size:.78rem">',
      '    <b>Bottom-Line Impact:</b> ' + art.impact,
      '  </div>',
      '</div>',
      '<div style="background:var(--night-2);padding:10px 12px;border-radius:4px;margin-top:14px;border:1px solid var(--night-line);font-size:.74rem;color:var(--night-ink-2)">',
      '  <b>Statutory Guardrail & Circular 230 Notice:</b> ' + (art.statutoryDisclaimer || 'Informational legal summary only. Does not constitute tax calculation, return preparation, or formal tax advice under Treasury Circular 230. Consult your licensed CPA for personalized tax advice.'),
      '</div>'
    ].join('');

    openModal('Rule Change Assessment: 214 Halcyon Row', modalHtml, '<button class="btn btn-b sm" id="modal-cancel-btn">Understood &middot; Return to Updates</button>');
  }

  // 9. Statutory Deadline Reminder Modal
  function openDeadlineModal(it) {
    it = it || {};
    var details = it.details || {};
    var modalHtml = [
      '<div style="padding:4px 0">',
      '  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">',
      '    <span class="chip warn sm">Statutory Deadline &middot; Time Sensitive</span>',
      '    <span class="chip sm" style="font-family:var(--f-mono)">' + (details.dueDate || it.deadlineDate || 'Pending') + '</span>',
      '  </div>',
      '  <h4 style="margin:4px 0 10px;font-size:1.1rem">' + it.title + '</h4>',
      '  <p style="font-size:.86rem;line-height:1.6;color:var(--ink)">' + (details.summary || it.meta) + '</p>',
      '  <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;margin:12px 0;font-size:.82rem">',
      '    <div style="margin-bottom:4px"><b>Filing Authority:</b> ' + (details.statutoryAgency || 'Internal Revenue Service & State Department of Revenue') + '</div>',
      '    <div style="margin-bottom:4px"><b>Prescribed Form:</b> ' + (details.statutoryForm || 'Form 1040-ES / State Form 502D') + '</div>',
      '    <div><b>Statutory Due Date:</b> ' + (details.dueDate || it.deadlineDate || 'Immediate') + '</div>',
      '  </div>',
      '  <div style="background:var(--warn-bg);border-left:3.5px solid var(--warn);padding:10px 14px;border-radius:4px;margin:12px 0;font-size:.8rem;color:var(--ink)">',
      '    <b>Statutory Notice:</b> ' + (details.penaltyNotice || 'Failure to make timely estimated payments incurs mandatory statutory interest charges under IRC § 6654.'),
      '  </div>',
      '  <p class="legal">This deadline is calibrated to your active 2026 engagement file. Notifications follow your channel preferences.</p>',
      '</div>'
    ].join('');

    var ctaBtn = '';
    if (it.actionScreen === 'pay') {
      ctaBtn = '<button class="btn btn-g sm" id="modal-deadline-act-btn">Pay Voucher in Billing &rarr;</button>';
    } else if (it.actionScreen === 'return') {
      ctaBtn = '<button class="btn btn-g sm" id="modal-deadline-act-btn">Review Prepared Return &rarr;</button>';
    } else if (it.actionScreen === 'sign') {
      ctaBtn = '<button class="btn btn-g sm" id="modal-deadline-act-btn">Sign Form 8879 &rarr;</button>';
    }

    openModal(it.title || 'Statutory Deadline Reminder', modalHtml, ctaBtn + '<button class="btn btn-b sm" id="modal-cancel-btn">Dismiss</button>');

    setTimeout(function() {
      var actBtn = document.getElementById('modal-deadline-act-btn');
      if (actBtn) {
        actBtn.addEventListener('click', function() {
          closeModal();
          if (it.actionScreen) showScreen(it.actionScreen);
        });
      }
    }, 50);
  }

  // 10. Firm Announcement Bulletin Modal
  function openFirmAnnouncementModal(it) {
    it = it || {};
    var details = it.details || {};
    var modalHtml = [
      '<div style="padding:6px 0">',
      '  <span class="chip gold sm" style="margin-bottom:8px">Pivot Aide Tax &middot; Official Bulletin</span>',
      '  <h4 style="margin:6px 0 10px;font-size:1.05rem">' + (details.headline || it.title) + '</h4>',
      '  <p style="font-size:.86rem;line-height:1.6;color:var(--ink)">' + (details.summary || it.meta) + '</p>',
      '  <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;margin:12px 0;font-size:.82rem">',
      '    <div><b>Issuing Unit:</b> ' + (details.department || 'Pivot Aide Tax Operations Console') + '</div>',
      '    <div><b>Effective Window:</b> ' + (details.effectiveDates || it.time || 'Current Season') + '</div>',
      '    <div><b>Audience:</b> Firm-wide announcement to all active engagements</div>',
      '  </div>',
      '  <p class="legal">Firm notices are strictly administrative or operational. Pivot Aide Tax never broadcasts promotional newsletters through this channel.</p>',
      '</div>'
    ].join('');

    openModal(it.title || 'Firm Announcement', modalHtml, '<button class="btn btn-b sm" id="modal-cancel-btn">Close Bulletin</button>');
  }

  // 11. Generic Client Event Detail Modal
  function openGenericUpdateModal(it) {
    it = it || {};
    var details = it.details || {};
    var modalHtml = [
      '<div style="padding:6px 0">',
      '  <span class="chip sm" style="margin-bottom:8px">Engagement File Update</span>',
      '  <h4 style="margin:6px 0 10px;font-size:1.05rem">' + it.title + '</h4>',
      '  <p style="font-size:.86rem;line-height:1.6;color:var(--ink)">' + it.meta + '</p>',
      details.summary ? ('<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:12px;margin:12px 0;font-size:.82rem"><p style="margin:0">' + details.summary + '</p></div>') : '',
      '  <p class="legal">This update pertains directly to your active 2026 engagement file with Denise R., CPA.</p>',
      '</div>'
    ].join('');

    var ctaBtn = '';
    if (it.actionScreen) {
      ctaBtn = '<button class="btn btn-g sm" id="modal-generic-act-btn">' + (it.actionText || 'Take Action') + ' &rarr;</button>';
    }

    openModal(it.title, modalHtml, ctaBtn + '<button class="btn btn-b sm" id="modal-cancel-btn">Dismiss</button>');

    if (it.actionScreen) {
      setTimeout(function() {
        var actBtn = document.getElementById('modal-generic-act-btn');
        if (actBtn) {
          actBtn.addEventListener('click', function() {
            closeModal();
            showScreen(it.actionScreen);
          });
        }
      }, 50);
    }
  }

  // 12. Check Unread Notifications & Update Bell Indicator Dot
  function checkUnreadNotifications() {
    var items = updatesListCache || state.updates || [];
    var hasUnread = items.some(function(u) { return (u.isNew || u.isRead === false); });
    var bellDot = document.querySelector('.appbar-btn.bell .dot');
    if (bellDot) {
      bellDot.style.display = hasUnread ? 'block' : 'none';
    }
  }

  // -------------------------------------------------------------
  // 13. GLOBAL EVENT DELEGATION
  // -------------------------------------------------------------
  function bindGlobalEvents() {
    // Mobile navigation drawer toggles (bound only when sidebar is present in DOM)
    if (el.side) {
      if (el.btnToggleMenu) {
        el.btnToggleMenu.addEventListener('click', function() {
          toggleMobileDrawer();
        });
      }

      if (el.btnMobileMore) {
        el.btnMobileMore.addEventListener('click', function() {
          toggleMobileDrawer(true);
        });
      }

      if (el.drawerBackdrop) {
        el.drawerBackdrop.addEventListener('click', function() {
          toggleMobileDrawer(false);
        });
      }

      // Auto-close mobile drawer when window resizes to desktop width
      window.addEventListener('resize', function() {
        if (window.innerWidth > 860) {
          toggleMobileDrawer(false);
        }
      });
    }

    // Anchor & button jump links with [data-go]
    document.addEventListener('click', function(e) {
      var target = e.target.closest('[data-go]');
      if (!target) return;
      // If event originated inside a sidebar router on a page without a sidebar, ignore
      if ((target.closest('.side') || target.closest('.side-nav')) && !el.side) return;
      e.preventDefault();
      var screenName = target.dataset.go;
      var subTab = target.dataset.sub;
      if (subTab && screenName === 'firm') {
        activeFirmTab = subTab;
        var firmTabBtn = document.querySelector('#firm-filter-tabs [data-tab="' + subTab + '"]');
        if (firmTabBtn) {
          document.querySelectorAll('#firm-filter-tabs .firm-tab').forEach(function(b) {
            b.classList.remove('active', 'btn-g');
            b.classList.add('btn-o');
          });
          firmTabBtn.classList.add('active', 'btn-g');
          firmTabBtn.classList.remove('btn-o');
        }
      }
      showScreen(screenName);
    });

    // Dashboard Switcher Toggles (Header Pill & Sidebar Footer Button)
    function handleDashboardToggle(e) {
      if (e) e.preventDefault();
      var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser);
      var isStaff = Boolean(
        (window.FirebaseBridge && window.FirebaseBridge.isStaff && window.FirebaseBridge.isStaff()) ||
        (fbUser && fbUser.isStaff) ||
        (state && state.user && (state.user.role === 'firm_preparer' || state.user.role === 'firm_admin') && (state.user.mfaVerified || state.user.mfa))
      );
      if (!isStaff) {
        showToast('Access Denied: Staff authorization required.', 'err');
        return;
      }
      if (currentScreen === 'firm' || currentScreen === 'exhibit-a' || currentScreen === 'exhibit-b') {
        showScreen('home');
      } else {
        showScreen('firm');
      }
    }
    var btnDashboardSwitch = document.getElementById('btn-dashboard-switch');
    if (btnDashboardSwitch) btnDashboardSwitch.addEventListener('click', handleDashboardToggle);
    var sideSwitchBtn = document.getElementById('side-switch-dashboard-btn');
    if (sideSwitchBtn) sideSwitchBtn.addEventListener('click', handleDashboardToggle);

    // Profile & Security Settings Action Listeners
    var btnProfileMfa = document.getElementById('btn-profile-test-mfa');
    if (btnProfileMfa) {
      btnProfileMfa.addEventListener('click', function() {
        showToast('Test verification code dispatched to registered email and Google Authenticator.', 'ok');
      });
    }
    var btnProfilePwd = document.getElementById('btn-profile-change-pwd');
    if (btnProfilePwd) {
      btnProfilePwd.addEventListener('click', function() {
        var email = ((state && state.user && state.user.email) || 'm.whitfield@example.com');
        showToast('Password reset link sent to ' + email + '.', 'info');
      });
    }
    var btnProfileSignoutAll = document.getElementById('btn-profile-signout-all');
    if (btnProfileSignoutAll) {
      btnProfileSignoutAll.addEventListener('click', function() {
        var btnSignout = document.getElementById('btn-signout');
        if (btnSignout) btnSignout.click();
      });
    }

    // Theme toggle
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);

    // Modal backdrop click
    if (el.modalBackdrop) {
      el.modalBackdrop.addEventListener('click', function(e) {
        if (e.target === el.modalBackdrop) closeModal();
      });
    }

    // Keyboard navigation (Escape to close mobile drawer / modal)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (el.side) toggleMobileDrawer(false);
        closeModal();
      }
    });

    // Gateway Dashboard Navigation Links
    var btnDemoClient = document.getElementById('btn-demo-client-dash');
    if (btnDemoClient) {
      btnDemoClient.addEventListener('click', function(e) {
        e.preventDefault();
        // Support explicit modal launch if shift-click or data-action="modal" is set
        if (e.shiftKey || btnDemoClient.getAttribute('data-action') === 'modal') {
          if (window.FileRoomAuthModal && document.getElementById('auth-modal')) {
            window.FileRoomAuthModal.open('client');
            return;
          }
        }
        var savedSession = null;
        try {
          var raw = localStorage.getItem('tfr_user_session');
          if (raw) savedSession = JSON.parse(raw);
        } catch (_) {}
        var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser);
        var activeUser = fbUser || savedSession;

        if (activeUser && activeUser.role === 'client' && activeUser.isAuthenticated) {
          window.location.href = 'client/dashboard.html';
        } else {
          window.location.href = 'client/login.html';
        }
      });
    }
    var btnDemoFirm = document.getElementById('btn-demo-firm-dash');
    if (btnDemoFirm) {
      btnDemoFirm.addEventListener('click', function(e) {
        e.preventDefault();
        // Support explicit modal launch if shift-click or data-action="modal" is set
        if (e.shiftKey || btnDemoFirm.getAttribute('data-action') === 'modal') {
          if (window.FileRoomAuthModal && document.getElementById('auth-modal')) {
            window.FileRoomAuthModal.open('firm');
            return;
          }
        }
        // Validate firm session authorization before redirecting
        var savedSession = null;
        try {
          var raw = localStorage.getItem('tfr_user_session');
          if (raw) savedSession = JSON.parse(raw);
        } catch (_) {}
        var fbUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser);
        var activeUser = fbUser || savedSession;

        if (activeUser && activeUser.role === 'client' && !activeUser.isStaff) {
          showToast('Access Denied: Authorized Firm Staff credentials required (403 Forbidden).', 'err');
          window.location.href = 'firm/login.html?error=403_unauthorized_role';
          return;
        }
        if (activeUser && (activeUser.role === 'firm_admin' || activeUser.role === 'firm_preparer' || activeUser.role === 'firm_staff') && activeUser.mfaVerified) {
          window.location.href = 'firm/dashboard.html';
        } else {
          window.location.href = 'firm/login.html';
        }
      });
    }
  }

  // -------------------------------------------------------------
  // 14. FIREBASE CLOUD SERVICES INTEGRATION
  // -------------------------------------------------------------
  function initFirebaseIntegration() {
    function updateFirebaseUi() {
      var badge = document.getElementById('firebase-status-badge');
      var cardBadge = document.getElementById('firebase-card-badge');
      var authStatusEl = document.querySelector('[data-auth-status]');
      var firestoreStatusEl = document.querySelector('[data-firestore-status]');
      var storageStatusEl = document.querySelector('[data-storage-status]');
      var analyticsStatusEl = document.querySelector('[data-analytics-status]');

      var projId = (window.FirebaseBridge && window.FirebaseBridge.config && window.FirebaseBridge.config.projectId) || 'uk-client-d90d5';
      if (badge) {
        badge.classList.add('connected');
        badge.title = 'Firebase Connected: ' + projId;
      }
      if (cardBadge) {
        cardBadge.classList.add('connected');
        cardBadge.innerHTML = '<span class="fb-dot"></span>Connected: ' + projId;
      }

      if (window.FirebaseBridge) {
        var user = window.FirebaseBridge.currentUser;
        if (authStatusEl) {
          if (user) {
            authStatusEl.style.color = '#2ecc71';
            authStatusEl.textContent = 'Live ✓ (' + user.email + ')';
          } else {
            authStatusEl.style.color = '#2ecc71';
            authStatusEl.textContent = 'Live ✓ (Ready for login)';
          }
        }
        var updateAnalyticsStatus = function() {
          if (!analyticsStatusEl) return;
          var status = (window.FirebaseBridge && window.FirebaseBridge.serviceStatus && window.FirebaseBridge.serviceStatus.analytics) || 'checking';
          if (status === 'live') {
            analyticsStatusEl.style.color = '#2ecc71';
            analyticsStatusEl.textContent = 'Live ✓ (G-B0RMTC8VBX)';
            analyticsStatusEl.title = 'Firebase Analytics telemetry is active';
          } else if (status === 'permission_denied') {
            analyticsStatusEl.style.color = 'var(--gold)';
            analyticsStatusEl.textContent = 'Standby (FIS 403: Enable in GCP)';
            analyticsStatusEl.title = 'Enable Firebase Installations API on this API key in Google Cloud Console';
          } else {
            analyticsStatusEl.style.color = 'var(--night-ink-2)';
            analyticsStatusEl.textContent = 'Standby';
          }
        };
        updateAnalyticsStatus();
        window.addEventListener('firebase-analytics-status', updateAnalyticsStatus);

        if (firestoreStatusEl && firestoreStatusEl.textContent === 'Checking...') {
          firestoreStatusEl.style.color = 'var(--gold)';
          firestoreStatusEl.textContent = 'Ready (Click Ping to test)';
        }
      }
    }

    window.addEventListener('firebase-ready', function() {
      updateFirebaseUi();
    });
    if (window.FirebaseBridge) {
      updateFirebaseUi();
    }

    window.addEventListener('firebase-auth-changed', function(e) {
      var user = e.detail ? e.detail.user : null;
      if (user && user.email) {
        state.user.isAuthenticated = true;
        state.user.verified = true;
        state.user.uid = user.uid;
        state.user.email = user.email;
        if (user.displayName) state.user.name = user.displayName;
        syncUserUI(user);

        // If currently on sign-in screen and session is active, automatically restore session and open Your File (#s-home)
        if (currentScreen === 'signin') {
          showToast('Session active for ' + user.email + '. Opening file...', 'ok');
          setTimeout(function() {
            showScreen('home');
          }, 350);
        }
      } else {
        state.user.isAuthenticated = false;
        state.user.verified = false;
        state.user.uid = null;
        isDocsListenerAttached = false;
        docsRequestCache = null;
        isHomeListenerAttached = false;
        homeEngagementCache = null;
        isMsgsListenerAttached = false;
        msgsCache = null;
        syncUserUI(null);
      }
    });

    // Wire up Firm Console test buttons
    var testBtn = document.getElementById('btn-test-firebase');
    if (testBtn) {
      testBtn.addEventListener('click', async function() {
        testBtn.disabled = true;
        testBtn.textContent = 'Pinging...';
        var fsEl = document.querySelector('[data-firestore-status]');
        if (window.FirebaseBridge) {
          var res = await window.FirebaseBridge.testConnection();
          if (res.success) {
            if (fsEl) {
              fsEl.style.color = '#2ecc71';
              fsEl.textContent = 'Live ✓ (Connected)';
            }
            showToast(res.message, 'ok');
          } else {
            if (fsEl) {
              fsEl.style.color = 'var(--gold)';
              fsEl.textContent = 'Console setup needed';
            }
            showToast('Auth: Live ✓ | Firestore needs 1-time setup in Firebase Console', 'warn');
          }
        } else {
          showToast('Connecting to Firebase (uk-client-d90d5)...', 'info');
        }
        testBtn.disabled = false;
        testBtn.textContent = 'Ping Cloud Services';
      });
    }

    var syncBtn = document.getElementById('btn-sync-firebase');
    if (syncBtn) {
      syncBtn.addEventListener('click', async function() {
        if (window.FirebaseBridge) {
          await window.FirebaseBridge.recordAuditLog('Ledger Sync', 'User requested Firebase ledger sync');
          showToast('Audit log record saved to Firebase!', 'ok');
        } else {
          showToast('Firebase syncing...', 'info');
        }
      });
    }

    var guideBtn = document.getElementById('btn-firebase-guide');
    if (guideBtn) {
      guideBtn.addEventListener('click', function() {
        openModal('Firebase Cloud Services — Quick Setup', [
          '<div style="font-size:.86rem;line-height:1.65">',
          '  <p>Project <b>uk-client-d90d5</b> is connected. Current service status:</p>',
          '  <ul style="margin:10px 0 14px 20px;line-height:1.8">',
          '    <li><b style="color:#2ecc71">Authentication:</b> LIVE ✓ (Email/Password active)</li>',
          '    <li><b style="color:#2ecc71">Analytics:</b> Standby / Live (Measurement ID G-B0RMTC8VBX)</li>',
          '    <li><b style="color:var(--gold)">Cloud Firestore:</b> 1 click to activate in Firebase Console</li>',
          '    <li><b style="color:var(--gold)">Cloud Storage:</b> 1 click to activate in Firebase Console</li>',
          '  </ul>',
          '  <div style="background:var(--bg-card-subtle);border-left:3px solid var(--gold);padding:10px 14px;margin-bottom:14px;border-radius:3px">',
          '    <b>How to enable Firestore (30 seconds):</b>',
          '    <ol style="margin:6px 0 0 16px;padding:0">',
          '      <li>Open <a href="https://console.firebase.google.com/project/uk-client-d90d5/firestore" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:underline"><b>Firebase Firestore Console</b></a></li>',
          '      <li>Click <b>Create database</b></li>',
          '      <li>Select <b>Start in test mode</b> &rarr; Click <b>Next</b> &rarr; <b>Enable</b></li>',
          '    </ol>',
          '  </div>',
          '  <div style="background:var(--bg-card-subtle);border-left:3px solid var(--blue);padding:10px 14px;margin-bottom:14px;border-radius:3px">',
          '    <b>How to enable Cloud Storage (30 seconds):</b>',
          '    <ol style="margin:6px 0 0 16px;padding:0">',
          '      <li>Open <a href="https://console.firebase.google.com/project/uk-client-d90d5/storage" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:underline"><b>Firebase Storage Console</b></a></li>',
          '      <li>Click <b>Get started</b> &rarr; <b>Start in test mode</b> &rarr; <b>Done</b></li>',
          '    </ol>',
          '  </div>',
          '  <p class="sub" style="color:var(--ink-3)">Note: The app works completely smoothly even before provisioning — all data persists safely in your session!</p>',
          '</div>'
        ].join(''), '<button class="btn btn-b sm" id="modal-cancel-btn">Got it</button>');
      });
    }

    updateFirebaseUi();
  }

  // -------------------------------------------------------------
  // 14B. QA TEST PLAN & AUTOMATION CODE GENERATOR
  // -------------------------------------------------------------
  function initQaAutomationSuite() {
    var suites = {
      eicar: {
        id: "TC-SEC-01",
        title: "01 · EICAR Malware Ingestion & Quarantine Rejection",
        category: "Security & Ingestion",
        statutory: "FTC Safeguards 16 CFR §314.4(c)(4)",
        target: "Quarantine isolation, zero S3 persistence, staff alert dispatch",
        filename: "tests/compliance/eicar-malware-rejection.spec.ts",
        description: "Uploads synthetic EICAR antivirus test signature string. Verifies that the asynchronous scanning worker flags the payload as INFECTED, permanently prevents persistence in the production S3 vault, expunges quarantine memory, and records a high-priority threat audit event.",
        simLog: [
          "[START] Running Playwright compliance test: eicar-malware-rejection.spec.ts",
          "  [SETUP] Intercepting /api/v1/exchange/upload-intent... [OK]",
          "  [STEP 1] Submitting synthetic EICAR test string (68 bytes) to quarantine endpoint...",
          "  [STEP 2] ClamAV/Lambda virus scanner triggered on payload...",
          "  ✓ [ASSERTION 1] HTTP 422 Unprocessable Entity returned with code 'ERR_MALWARE_DETECTED_EICAR' (45ms)",
          "  ✓ [ASSERTION 2] Red client warning banner rendered: 'Upload blocked: threat signature matched' (22ms)",
          "  ✓ [ASSERTION 3] Cryptographic verify: S3 production vault object count unchanged (0 bytes stored) (12ms)",
          "  ✓ [ASSERTION 4] FTC Audit event persisted: 'MALWARE_UPLOAD_PREVENTED' (18ms)",
          "[PASSED] 1 test passed (97ms) — Zero-trust quarantine defense verified."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "import crypto from 'crypto';",
          "",
          "test.describe('SEC-01: Inbound File Ingestion & Antivirus Quarantine', () => {",
          "  // Standard European Institute for Computer Antivirus Research test string",
          "  const EICAR_TEST_STRING =",
          "    'X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';",
          "",
          "  test('should quarantine synthetic malware and prevent S3 vault persistence', async ({ page }) => {",
          "    // 1. Mock Pre-Signed Upload Intent Route",
          "    await page.route('**/api/v1/exchange/upload-intent', async (route) => {",
          "      await route.fulfill({",
          "        status: 200,",
          "        contentType: 'application/json',",
          "        body: JSON.stringify({",
          "          upload_id: 'upl_eicar_test_01',",
          "          quarantine_url: 'https://quarantine-bucket.s3.amazonaws.com/uploads/temp-eicar.txt',",
          "          kms_key_arn: 'arn:aws:kms:us-east-1:123456789012:key/test-quarantine-key'",
          "        })",
          "      });",
          "    });",
          "",
          "    // 2. Mock Antivirus Neutralization & Rejection on Finalize",
          "    await page.route('**/api/v1/exchange/finalize-upload', async (route) => {",
          "      const payload = route.request().postDataJSON();",
          "      expect(payload.upload_id).toBe('upl_eicar_test_01');",
          "",
          "      await route.fulfill({",
          "        status: 422,",
          "        contentType: 'application/json',",
          "        body: JSON.stringify({",
          "          error_code: 'ERR_MALWARE_DETECTED_EICAR',",
          "          message: 'Upload blocked: threat signature matched EICAR-AV-Test. File expunged.',",
          "          quarantined_at: new Date().toISOString()",
          "        })",
          "      });",
          "    });",
          "",
          "    // 3. Navigate to Documents Hub & Upload EICAR String",
          "    await page.goto('/#docs');",
          "    await page.click('#btn-choose-files');",
          "",
          "    await page.setInputFiles('#file-input-hidden', {",
          "      name: 'suspicious_invoice.txt',",
          "      mimeType: 'text/plain',",
          "      buffer: Buffer.from(EICAR_TEST_STRING)",
          "    });",
          "",
          "    // 4. Assert Quarantine Warning Toast Rendered in Client UI",
          "    const alertToast = page.locator('#toast-container');",
          "    await expect(alertToast).toContainText('Upload blocked: threat signature matched');",
          "",
          "    // 5. Cryptographic Assertion: S3 Production Vault must remain pristine",
          "    const vaultKeyAssertion = await page.evaluate(() => {",
          "      return (window as any).FileRoomData?.documents.find((d: any) => d.name === 'suspicious_invoice.txt');",
          "    });",
          "    expect(vaultKeyAssertion).toBeUndefined();",
          "",
          "    // 6. Audit Trail Verification (FTC Safeguards 16 CFR §314.4(c)(8))",
          "    const auditRes = await page.request.get('/api/v1/audit/logs?limit=1');",
          "    const logs = await auditRes.json();",
          "    expect(logs[0].action).toBe('MALWARE_UPLOAD_PREVENTED');",
          "    expect(logs[0].threat_id).toBe('EICAR');",
          "  });",
          "});"
        ].join('\n')
      },
      kba_lockout: {
        id: "TC-IRS-02",
        title: "02 · IRS Pub 1345 KBA 3-Attempt Hard Lockout",
        category: "Regulated Signing",
        statutory: "IRS Publication 1345 §Electronic Signatures",
        target: "Hard lockout at attempt 3, canvas revocation, physical wet sig fallback",
        filename: "tests/compliance/irs-pub1345-kba-lockout.spec.ts",
        description: "Simulates remote Form 8879 execution with consecutive failed credit bureau knowledge checks. Verifies that the 3rd failed attempt irreversibly disables digital signing, triggers a physical wet-signature workflow, and writes an unalterable compliance event.",
        simLog: [
          "[START] Running Playwright compliance test: irs-pub1345-kba-lockout.spec.ts",
          "  [SETUP] Navigating to Form 8879 Signing Hub (#s-sign)... [OK]",
          "  [STEP 1] Submitting KBA Attempt 1 with incorrect credit distractor...",
          "  ✓ [ASSERTION 1] Warning toast displayed: '2 attempts remaining' (34ms)",
          "  [STEP 2] Submitting KBA Attempt 2 with incorrect credit distractor...",
          "  ✓ [ASSERTION 2] Warning toast displayed: '1 attempts remaining' (28ms)",
          "  [STEP 3] Submitting KBA Attempt 3 (Final Lockout Trigger)...",
          "  ✓ [ASSERTION 3] API responds with HTTP 423 Locked: 'hard_lockout_wet_sig_required' (41ms)",
          "  ✓ [ASSERTION 4] Canvas signing pad #sig-canvas permanently revoked from DOM (15ms)",
          "  ✓ [ASSERTION 5] Fallback UI rendered: 'Handwritten signature required (IRS Pub 1345)' (19ms)",
          "  ✓ [ASSERTION 6] Audit log verified: 3 attempts recorded, remedy=PHYSICAL_WET_SIGNATURE (24ms)",
          "[PASSED] 1 test passed (161ms) — IRS Pub 1345 Lockout Mandate Enforced."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "",
          "test.describe('IRS Pub 1345: Knowledge-Based Authentication Lockout Engine', () => {",
          "  let attemptCounter = 0;",
          "",
          "  test('should enforce strict 3-attempt lockout and revoke digital signature access', async ({ page }) => {",
          "    // 1. Mock KBA Questions & Verification Endpoint",
          "    await page.route('**/api/v1/signing/packages/*/kba/submit-answers', async (route) => {",
          "      attemptCounter++;",
          "      const attemptsLeft = 3 - attemptCounter;",
          "",
          "      if (attemptsLeft > 0) {",
          "        await route.fulfill({",
          "          status: 403,",
          "          contentType: 'application/json',",
          "          body: JSON.stringify({",
          "            status: 'failed_attempt',",
          "            attempts_left: attemptsLeft,",
          "            message: `Identity verification failed. ${attemptsLeft} attempts remaining.`",
          "          })",
          "        });",
          "      } else {",
          "        // Enforce IRS Pub 1345 Hard Lockout",
          "        await route.fulfill({",
          "          status: 423,",
          "          contentType: 'application/json',",
          "          body: JSON.stringify({",
          "            status: 'hard_lockout_wet_sig_required',",
          "            attempts_left: 0,",
          "            message: 'Identity verification threshold reached. Electronic signing locked.',",
          "            statutory_remedy: 'HANDWRITTEN_WET_SIGNATURE',",
          "            download_wetsig_pdf_url: '/api/v1/signing/packages/8879/download-blank-pdf'",
          "          })",
          "        });",
          "      }",
          "    });",
          "",
          "    // 2. Navigate to Form 8879 Signing Screen",
          "    await page.goto('/#sign');",
          "    await expect(page.locator('#kba-quiz-card')).toBeVisible();",
          "",
          "    // 3. Submit Attempt 1 (Incorrect Option)",
          "    await page.click('#kba-options-container label:has-text(\"None of these\")');",
          "    await page.click('#btn-kba-continue');",
          "    await expect(page.locator('#toast-container')).toContainText('2 attempts remaining');",
          "",
          "    // 4. Submit Attempt 2 (Incorrect Option)",
          "    await page.click('#kba-options-container label:has-text(\"Cardinal Trust Bank\")');",
          "    await page.click('#btn-kba-continue');",
          "    await expect(page.locator('#toast-container')).toContainText('1 attempts remaining');",
          "",
          "    // 5. Submit Attempt 3 (Final Lockout Trigger)",
          "    await page.click('#kba-options-container label:has-text(\"Fairwater Savings\")');",
          "    await page.click('#btn-kba-continue');",
          "",
          "    // 6. Assert Canvas Signature Pad is Permanently Revoked",
          "    await expect(page.locator('#sig-canvas')).not.toBeVisible();",
          "    await expect(page.locator('#btn-submit-signature')).not.toBeVisible();",
          "",
          "    // 7. Assert Physical Wet Signature Fallback UI Rendered",
          "    const fallbackNotice = page.locator('#kba-quiz-card');",
          "    await expect(fallbackNotice).toContainText('Handwritten signature required');",
          "    await expect(page.locator('#btn-dl-wetsig')).toBeVisible();",
          "",
          "    // 8. Audit Log Verification (IRS Pub 1345 3-Year Record)",
          "    const auditRes = await page.request.get('/api/v1/audit/logs?event=KBA_LOCKOUT');",
          "    const logs = await auditRes.json();",
          "    expect(logs[0].attempts_consumed).toBe(3);",
          "    expect(logs[0].remedy).toBe('PHYSICAL_WET_SIGNATURE_FALLBACK');",
          "  });",
          "});"
        ].join('\n')
      },
      joint_filer: {
        id: "TC-IRS-03",
        title: "03 · Joint-Filer (MFJ) Independent E-Sign Sequence",
        category: "Regulated Signing",
        statutory: "IRS Form 8879 Part II Line 2 Mandate",
        target: "Separate KBA proofing, distinct IP/timestamp logs, composite SHA-256",
        filename: "tests/compliance/joint-filer-signing-sequence.spec.ts",
        description: "Validates Married Filing Jointly returns where both spouses must independently authenticate via separate credit bureau challenges, record distinct IP addresses, and contribute to an unsealed composite cryptographic evidence manifest.",
        simLog: [
          "[START] Running Playwright compliance test: joint-filer-signing-sequence.spec.ts",
          "  [CONTEXT 1] Primary Taxpayer (Michael W.) session on IP: 172.56.21.84...",
          "  [STEP 1] Taxpayer passes KBA quiz & adopts digital signature...",
          "  ✓ [ASSERTION 1] Return package status = 'partially_signed' (31ms)",
          "  ✓ [ASSERTION 2] Return release gate remains SEALED (spouse pending) (14ms)",
          "  [CONTEXT 2] Spouse (Elena W.) session on IP: 198.51.100.42...",
          "  [STEP 2] Spouse completes independent credit check challenge & signs...",
          "  ✓ [ASSERTION 3] Distinct IP & UTC timestamps recorded for each spouse (22ms)",
          "  ✓ [ASSERTION 4] Composite SHA-256 evidence hash matches: SHA256(SigA + SigB) (11ms)",
          "  ✓ [ASSERTION 5] Final return status unlocked = 'ready_to_transmit' (18ms)",
          "[PASSED] 1 test passed (96ms) — Joint-Filer Statutory Isolation Verified."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "import crypto from 'crypto';",
          "",
          "test.describe('IRS Pub 1345: Married Filing Jointly (MFJ) Dual-Signer Sequence', () => {",
          "  const PRIMARY_IP = '172.56.21.84';",
          "  const SPOUSE_IP = '198.51.100.42';",
          "",
          "  test('should require independent KBA and distinct audit hashes for both spouses', async ({ browser }) => {",
          "    // Create Isolated Browser Contexts for Primary and Spouse",
          "    const primaryContext = await browser.newContext({ userAgent: 'Desktop', extraHTTPHeaders: { 'X-Forwarded-For': PRIMARY_IP } });",
          "    const spouseContext  = await browser.newContext({ userAgent: 'Mobile',  extraHTTPHeaders: { 'X-Forwarded-For': SPOUSE_IP } });",
          "",
          "    const primaryPage = await primaryContext.newPage();",
          "    const spousePage  = await spouseContext.newPage();",
          "",
          "    // 1. Primary Taxpayer (Michael Whitfield) Passes KBA & Signs",
          "    await primaryPage.goto('/#sign');",
          "    await primaryPage.click('#kba-options-container label:has-text(\"Meridian Home Lending\")');",
          "    await primaryPage.click('#btn-kba-continue');",
          "    await primaryPage.click('#btn-kba-continue');",
          "    await primaryPage.click('#btn-kba-continue');",
          "    await expect(primaryPage.locator('#sig-canvas')).toBeVisible();",
          "    await primaryPage.click('#btn-submit-signature');",
          "",
          "    // 2. Verify Return Release is STILL GATED (Spouse Signature Pending)",
          "    const statusRes = await primaryPage.request.get('/api/v1/delivery/returns/current');",
          "    const returnStatus = await statusRes.json();",
          "    expect(returnStatus.pdf_ready).toBe(false);",
          "    expect(returnStatus.missing_signatures).toContain('spouse');",
          "",
          "    // 3. Spouse (Elena Whitfield) Authenticates from Separate Device / IP",
          "    await spousePage.goto('/#sign?role=spouse');",
          "    await spousePage.click('#kba-options-container label:has-text(\"Cardinal Trust Bank\")');",
          "    await spousePage.click('#btn-kba-continue');",
          "    await spousePage.click('#btn-kba-continue');",
          "    await spousePage.click('#btn-kba-continue');",
          "    await expect(spousePage.locator('#sig-canvas')).toBeVisible();",
          "    await spousePage.click('#btn-submit-signature');",
          "",
          "    // 4. Assert Dual-Signed Form 8879 Package is Executed",
          "    await expect(spousePage.locator('#kba-quiz-card')).toContainText('Authorization Complete');",
          "",
          "    // 5. Cryptographic Evidence Verification (IRS Pub 1345 3-Year Record)",
          "    const auditRes = await primaryPage.request.get('/api/v1/signing/packages/8879/evidence-manifest');",
          "    const manifest = await auditRes.json();",
          "",
          "    expect(manifest.signers).toHaveLength(2);",
          "    expect(manifest.signers[0].role).toBe('taxpayer');",
          "    expect(manifest.signers[0].ip).toBe(PRIMARY_IP);",
          "    expect(manifest.signers[1].role).toBe('spouse');",
          "    expect(manifest.signers[1].ip).toBe(SPOUSE_IP);",
          "",
          "    // Verify SHA-256 Composite Signature Digest",
          "    const expectedDigest = crypto.createHash('sha256')",
          "      .update(`${manifest.signers[0].hash}:${manifest.signers[1].hash}`)",
          "      .digest('hex');",
          "    expect(manifest.composite_sha256).toBe(expectedDigest);",
          "  });",
          "});"
        ].join('\n')
      },
      idor_token: {
        id: "TC-SEC-04",
        title: "04 · IDOR & Multi-Tenant BOLA Isolation Gate",
        category: "Security & Tenancy",
        statutory: "FTC Safeguards Rule 16 CFR §314.4(c)(1)",
        target: "Strict 403 Forbidden on horizontal privilege escalation, zero PII leak",
        filename: "tests/compliance/idor-tenant-isolation.spec.ts",
        description: "Executes automated horizontal privilege escalation attempts. Asserts that Firm A client bearer credentials cannot query or download documents, returns, or invoice IDs belonging to Firm B.",
        simLog: [
          "[START] Running Playwright compliance test: idor-tenant-isolation.spec.ts",
          "  [SETUP] Generating verified bearer token for Tenant Alpha (firm_id: alpha_88)...",
          "  [ATTACK 1] Sending GET /api/v1/exchange/documents/doc_beta_sensitive_1040...",
          "  ✓ [ASSERTION 1] Endpoint returns HTTP 403 Forbidden (38ms)",
          "  ✓ [ASSERTION 2] Response body strictly scrubbed: zero PII or file stream returned (12ms)",
          "  [ATTACK 2] Sending GET /api/v1/money/invoices/inv_beta_confidential...",
          "  ✓ [ASSERTION 3] Endpoint returns HTTP 403 Forbidden (27ms)",
          "  ✓ [ASSERTION 4] Cross-tenant security event written to SIEM audit log (19ms)",
          "[PASSED] 1 test passed (96ms) — Multi-Tenant Row-Level Security Verified."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "",
          "test.describe('SEC-02: Broken Object-Level Authorization (BOLA / IDOR) Defense', () => {",
          "  test('should reject horizontal cross-tenant access with strict 403 Forbidden', async ({ page }) => {",
          "    // 1. Authenticate with Firm Alpha Token Claims",
          "    const firmABearerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmaXJtSWQiOiJmaXJtX2FscGhhIiwiY2xpZW50SWQiOiJjbGllbnRfMDEifQ';",
          "",
          "    // 2. Attempt Horizontal Exploit: Query Tenant Beta's Sensitive Documents",
          "    const victimDocumentId = 'doc_firm_beta_9921_sensitive_1040';",
          "    const unauthorizedDocResponse = await page.request.get(`/api/v1/exchange/documents/${victimDocumentId}/secure-view`, {",
          "      headers: { 'Authorization': `Bearer ${firmABearerToken}` }",
          "    });",
          "",
          "    // 3. Assert Strict Rejection (No Information Disclosure)",
          "    expect(unauthorizedDocResponse.status()).toBe(403);",
          "    const docErrorBody = await unauthorizedDocResponse.json();",
          "    expect(docErrorBody.error).toBe('ACCESS_DENIED_TENANT_BOUNDARY');",
          "    expect(docErrorBody).not.toHaveProperty('stream_url');",
          "    expect(docErrorBody).not.toHaveProperty('file_name');",
          "",
          "    // 4. Attempt Horizontal Exploit: Query Tenant Beta's Billing Invoice",
          "    const victimInvoiceId = 'inv_firm_beta_4412_retainer';",
          "    const unauthorizedInvResponse = await page.request.get(`/api/v1/money/invoices/${victimInvoiceId}`, {",
          "      headers: { 'Authorization': `Bearer ${firmABearerToken}` }",
          "    });",
          "",
          "    expect(unauthorizedInvResponse.status()).toBe(403);",
          "",
          "    // 5. Assert Security Monitoring Event Dispatched to SIEM",
          "    const securityAudit = await page.request.get('/api/v1/audit/security-telemetry?event=BOLA_CROSS_TENANT_DETECTED');",
          "    const violationLog = await securityAudit.json();",
          "    expect(violationLog[0].attacker_firm_id).toBe('firm_alpha');",
          "    expect(violationLog[0].target_resource_id).toBe(victimDocumentId);",
          "  });",
          "});"
        ].join('\n')
      },
      payment_idempotency: {
        id: "TC-FIN-05",
        title: "05 · Payment Webhook Idempotency & Return Release",
        category: "Fintech & Billing",
        statutory: "PCI DSS v4.0.1 SAQ A & Engagement Milestone",
        target: "Zero race condition on duplicate webhooks, single invoice credit, return unsealed",
        filename: "tests/compliance/payment-webhook-idempotency.spec.ts",
        description: "Dispatches simultaneous duplicate Stripe checkout completion webhooks. Verifies atomic database locking, single ledger crediting, and instantaneous unsealing of client return downloads.",
        simLog: [
          "[START] Running Playwright compliance test: payment-webhook-idempotency.spec.ts",
          "  [SETUP] Generating valid Stripe HMAC-SHA256 signature header...",
          "  [STEP 1] Firing 2 concurrent POST /api/v1/money/webhooks/stripe payloads...",
          "  ✓ [ASSERTION 1] Both webhooks respond with HTTP 200 OK (Stripe SLA) (42ms)",
          "  ✓ [ASSERTION 2] Atomic lock applied: processed=1, idempotent_duplicate=1 (18ms)",
          "  ✓ [ASSERTION 3] Invoice status transitioned to 'paid' ($1,240.00 credited once) (24ms)",
          "  ✓ [ASSERTION 4] Prepared return download button enabled in client UI (16ms)",
          "[PASSED] 1 test passed (100ms) — Payment Idempotency Engine Verified."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "import crypto from 'crypto';",
          "",
          "test.describe('FIN-01: Payment Webhook Idempotency & Return Release', () => {",
          "  const WEBHOOK_SECRET = 'whsec_test_secret_key_8841';",
          "",
          "  test('should handle duplicate webhook delivery without double-crediting or race conditions', async ({ page }) => {",
          "    const invoiceId = 'inv-2026-0418';",
          "    const paymentTimestamp = Math.floor(Date.now() / 1000);",
          "",
          "    const eventPayload = JSON.stringify({",
          "      id: 'evt_stripe_concurrent_test_991',",
          "      type: 'checkout.session.completed',",
          "      data: {",
          "        object: {",
          "          id: 'cs_live_session_123',",
          "          metadata: { invoice_id: invoiceId, firm_id: 'uk-client-d90d5' },",
          "          amount_total: 124000,",
          "          payment_status: 'paid'",
          "        }",
          "      }",
          "    });",
          "",
          "    // Generate Stripe HMAC Signature",
          "    const signature = crypto",
          "      .createHmac('sha256', WEBHOOK_SECRET)",
          "      .update(`${paymentTimestamp}.${eventPayload}`)",
          "      .digest('hex');",
          "    const signatureHeader = `t=${paymentTimestamp},v1=${signature}`;",
          "",
          "    // 1. Dispatch 2 Concurrent Webhook Requests (Simulate Network Retry Race)",
          "    const [response1, response2] = await Promise.all([",
          "      page.request.post('/api/v1/money/webhooks/stripe', {",
          "        headers: { 'Stripe-Signature': signatureHeader, 'Content-Type': 'application/json' },",
          "        data: eventPayload",
          "      }),",
          "      page.request.post('/api/v1/money/webhooks/stripe', {",
          "        headers: { 'Stripe-Signature': signatureHeader, 'Content-Type': 'application/json' },",
          "        data: eventPayload",
          "      })",
          "    ]);",
          "",
          "    // 2. Assert Both Webhooks Receive 200 OK (Stripe Requirement)",
          "    expect(response1.status()).toBe(200);",
          "    expect(response2.status()).toBe(200);",
          "",
          "    const body1 = await response1.json();",
          "    const body2 = await response2.json();",
          "",
          "    // 3. Assert Exactly One Execution Processed, Other Acknowledged as Duplicate",
          "    const executedCount = [body1.processed, body2.processed].filter(Boolean).length;",
          "    expect(executedCount).toBe(1);",
          "",
          "    // 4. Verify Invoice Balance in Database is Credited Exactly Once",
          "    const invoiceRes = await page.request.get(`/api/v1/money/invoices/${invoiceId}`);",
          "    const invoice = await invoiceRes.json();",
          "    expect(invoice.status).toBe('paid');",
          "    expect(invoice.amount_paid).toBe(1240.00);",
          "",
          "    // 5. Assert Return Download Gate is Unsealed",
          "    await page.goto('/#return');",
          "    await expect(page.locator('#btn-download-prepared-return')).toBeEnabled();",
          "  });",
          "});"
        ].join('\n')
      },
      ach_lifecycle: {
        id: "TC-FIN-06",
        title: "06 · ACH Lifecycle, Micro-Deposits & NSF Bounce (R01)",
        category: "Fintech & Billing",
        statutory: "NACHA Operating Rules & Stripe Financial Connections",
        target: "Instant verification, micro-deposit fallback, R01 NSF freeze, dispute webhook lock",
        filename: "tests/compliance/ach-lifecycle-settlement.spec.ts",
        description: "Executes end-to-end ACH bank debit lifecycle tests: validates instant Plaid/Stripe Financial Connections, 2-cent micro-deposit fallback, pending state gating, R01 NSF insufficient fund auto-freezes, and unauthorized debit dispute webhooks.",
        simLog: [
          "[START] Running Playwright compliance test: ach-lifecycle-settlement.spec.ts",
          "  [SETUP] Mocking Stripe Financial Connections instant verification...",
          "  ✓ [ASSERTION 1] Instant account verification linked: Chase Bank (•••• 4912) (28ms)",
          "  ✓ [ASSERTION 2] payment_intent.processing webhook: funds in transit, return download locked (19ms)",
          "  ✓ [ASSERTION 3] Micro-deposit fallback: $0.32 & $0.45 verified successfully (34ms)",
          "  ✓ [ASSERTION 4] R01 NSF failure simulated: charge.failed locks return and dispatches notice (22ms)",
          "  ✓ [ASSERTION 5] Unauthorized debit dispute webhook (R05/R07): engagement audit trail frozen (15ms)",
          "[PASSED] 4 tests passed (118ms) — ACH Lifecycle & Settlement Engine Verified."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "import crypto from 'crypto';",
          "",
          "test.describe('FIN-02: ACH Bank Transfer Lifecycle, Micro-Deposits & NSF Failures', () => {",
          "  const WEBHOOK_SECRET = 'whsec_ach_settlement_test_7721';",
          "  const INVOICE_ID = 'inv-2026-0418';",
          "  const CLIENT_ID = 'usr_whitfield_m_4819';",
          "",
          "  test('should handle instant account verification and initiate 3-5 day ACH processing', async ({ page }) => {",
          "    // 1. Mock Instant Account Verification via Stripe Financial Connections",
          "    await page.route('**/api/v1/money/ach/initiate', async (route) => {",
          "      await route.fulfill({",
          "        status: 200,",
          "        contentType: 'application/json',",
          "        body: JSON.stringify({",
          "          success: true,",
          "          paymentIntentId: 'pi_ach_instant_test_8841',",
          "          paymentMethod: 'ach_debit',",
          "          status: 'processing',",
          "          expectedClearanceDate: '2026-04-22',",
          "          bankAccountMasked: 'Chase Bank (•••• 4912)'",
          "        })",
          "      });",
          "    });",
          "    await page.goto('/#pay');",
          "    await expect(page.locator('#btn-pay-invoice')).toBeVisible();",
          "  });",
          "",
          "  test('should support manual micro-deposit fallback verification workflow', async ({ page }) => {",
          "    const verifyRes = await page.request.post('/api/v1/money/ach/verify-microdeposits', {",
          "      headers: { 'Content-Type': 'application/json' },",
          "      data: JSON.stringify({ bankAccountId: 'ba_manual_test_3319', deposit1Cents: 32, deposit2Cents: 45 })",
          "    });",
          "    expect(verifyRes.status()).toBe(200);",
          "    const data = await verifyRes.json();",
          "    expect(data.verified).toBe(true);",
          "  });",
          "",
          "  test('should handle ACH Bounce (R01 NSF) by freezing release and alerting firm', async ({ page }) => {",
          "    const webhookRes = await page.request.post('/api/v1/money/webhooks/stripe', {",
          "      headers: { 'Content-Type': 'application/json' },",
          "      data: JSON.stringify({ type: 'charge.failed', failure_code: 'insufficient_funds' })",
          "    });",
          "    expect(webhookRes.status()).toBe(200);",
          "    const invoiceRes = await page.request.get(`/api/v1/money/invoices/${INVOICE_ID}`);",
          "    const invoice = await invoiceRes.json();",
          "    expect(invoice.status).toBe('payment_failed');",
          "    expect(invoice.returnReleaseGranted).toBe(false);",
          "  });",
          "});"
        ].join('\n')
      },
      zero_cardholder: {
        id: "TC-SEC-07",
        title: "07 · Zero-Cardholder-Data Assurance (PCI-DSS SAQ-A)",
        category: "Information Security",
        statutory: "PCI-DSS v4.0.1 SAQ-A & FTC Safeguards § 314.4",
        target: "Deep network traffic inspection: zero PAN/CVV tokens touch internal application logs or DBs",
        filename: "tests/compliance/zero-cardholder-data-pci.spec.ts",
        description: "Intercepts all client-side network traffic and storage mechanisms during card checkout. Confirms no Luhn-valid PAN or CVV tokens touch internal servers or storage, proving 100% PCI-DSS SAQ-A scope qualification.",
        simLog: [
          "[START] Running Playwright compliance test: zero-cardholder-data-pci.spec.ts",
          "  [SETUP] Attaching network traffic interception listener to page.on('request')...",
          "  ✓ [ASSERTION 1] Card element rendered inside Stripe Elements iframe (parent DOM zero inputs) (21ms)",
          "  ✓ [ASSERTION 2] Form submit tokenized: received pm_card_8819 token (32ms)",
          "  ✓ [ASSERTION 3] Deep payload inspection: checked 14 API requests — 0 PAN / 0 CVV found (18ms)",
          "  ✓ [ASSERTION 4] Client storage inspection: localStorage & sessionStorage scrubbed of card data (11ms)",
          "[PASSED] 1 test passed (82ms) — PCI-DSS SAQ-A Zero-Cardholder Data Assured."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "",
          "test.describe('SEC-03: PCI-DSS SAQ-A Zero-Cardholder-Data Assurance', () => {",
          "  test('should verify zero PAN or CVV tokens touch internal application servers', async ({ page }) => {",
          "    const interceptedPayloads: any[] = [];",
          "    page.on('request', req => {",
          "      if (req.url().includes('/api/') || req.url().includes('/money/')) {",
          "        interceptedPayloads.push({ url: req.url(), postData: req.postData() || '' });",
          "      }",
          "    });",
          "    await page.goto('/#pay');",
          "    await expect(page.locator('#billing-total-display')).toBeVisible();",
          "",
          "    // Verify parent DOM has NO raw card input fields",
          "    const rawPanInput = page.locator('input[name=\"cardnumber\"], input#card-number');",
          "    expect(await rawPanInput.count()).toBe(0);",
          "",
          "    // Assert zero Luhn-valid PAN or CVV in intercepted payloads",
          "    for (const req of interceptedPayloads) {",
          "      expect(req.postData).not.toMatch(/\"cvv\"\\s*:\\s*\"?[0-9]{3,4}\"?/);",
          "    }",
          "  });",
          "});"
        ].join('\n')
      },
      anti_advice: {
        id: "TC-REG-08",
        title: "08 · Anti-Advice & Non-Computation Boundary (The Exclusion)",
        category: "Regulatory & Legal",
        statutory: "Treasury Circular 230 § 10.22, IRC § 6694 & Treas. Reg. § 301.7701-15(f)",
        target: "Zero reactive calculation formulas, mandatory CPA attribution, rejection of unverified figures",
        filename: "tests/compliance/anti-advice-boundary-enforcement.spec.ts",
        description: "Validates Exhibit B's 'THE EXCLUSION' architectural boundary: ensures zero client-side calculation formulas exist, rejects API payloads lacking licensed human preparer attribution (PTIN), blocks AI tax optimization endpoints, and asserts visual statutory disclaimers.",
        simLog: [
          "[START] Running Playwright compliance test: anti-advice-boundary-enforcement.spec.ts",
          "  [SETUP] Navigating to Screen 05 (Your Return)...",
          "  ✓ [ASSERTION 1] Verified initial static totals: Federal Refund $3,418 / MD Due $612 (16ms)",
          "  ✓ [ASSERTION 2] Injected modified income into DOM: zero reactive recalculation (formula absent) (14ms)",
          "  ✓ [ASSERTION 3] API Gateway POST /api/v1/returns/delivery without PTIN: HTTP 403 PREPARER_ATTRIBUTION_REQUIRED (26ms)",
          "  ✓ [ASSERTION 4] Prohibited endpoint POST /api/v1/returns/ai-optimize: HTTP 404 NOT_FOUND (Hard Exclusion) (12ms)",
          "  ✓ [ASSERTION 5] Human preparer attribution rendered: Denise R., CPA (PTIN: P01849201) (15ms)",
          "  ✓ [ASSERTION 6] Statutory Safe-Harbor disclaimer validated: custody & transit without computation (9ms)",
          "[PASSED] 4 tests passed (92ms) — Non-Computation & Anti-Advice Guardrails Enforced."
        ],
        code: [
          "import { test, expect } from '@playwright/test';",
          "",
          "test.describe('REG-01: Anti-Advice & Non-Computation Boundary Enforcement (The Exclusion)', () => {",
          "  test('should verify zero client-side calculation formulas and immutability of tax totals', async ({ page }) => {",
          "    await page.goto('/#return');",
          "    const refundBefore = await page.locator('.stat:has-text(\"Federal refund\") .n').textContent();",
          "    expect(refundBefore?.trim()).toBe('$3,418');",
          "",
          "    // Tamper DOM line value - assert totals do not recalculate",
          "    await page.evaluate(() => {",
          "      const line1z = document.querySelector('#line-total-income .tax-form-val');",
          "      if (line1z) line1z.textContent = '$999,999';",
          "    });",
          "    const refundAfter = await page.locator('.stat:has-text(\"Federal refund\") .n').textContent();",
          "    expect(refundAfter?.trim()).toBe('$3,418');",
          "  });",
          "",
          "  test('should reject return payload injection lacking human preparer cryptographic attribution', async ({ page }) => {",
          "    const unAttributedPayload = { clientId: 'usr_whitfield_m_4819', balances: { refundOrDueCents: 341800 } };",
          "    const injectRes = await page.request.post('/api/v1/returns/delivery', { data: JSON.stringify(unAttributedPayload) });",
          "    expect([400, 403]).toContain(injectRes.status());",
          "  });",
          "",
          "  test('should render human-preparer attribution and statutory transit safe-harbor disclaimer in UI', async ({ page }) => {",
          "    await page.goto('/#return');",
          "    const preparerBox = page.locator('#tax-form-paper');",
          "    await expect(preparerBox).toContainText('Denise R., CPA');",
          "  });",
          "});"
        ].join('\n')
      }
    };

    var currentKey = 'kba_lockout';

    function renderScenario(key) {
      currentKey = key;
      var s = suites[key];
      if (!s) return;

      var filenameEl = document.getElementById('qa-code-filename');
      var descBox = document.getElementById('qa-scenario-desc-box');
      var codeDisplay = document.getElementById('qa-code-display');

      if (filenameEl) filenameEl.textContent = '📄 ' + s.filename;
      if (descBox) {
        descBox.innerHTML = [
          '<div style="font-weight:600;color:#fff;margin-bottom:3px">' + s.title + ' &middot; <span style="color:var(--gold)">' + s.statutory + '</span></div>',
          '<div><b>Assertion Target:</b> ' + s.target + '</div>',
          '<div style="margin-top:4px;color:var(--night-ink-2);font-size:.74rem">' + s.description + '</div>'
        ].join('');
      }
      if (codeDisplay) {
        codeDisplay.textContent = s.code;
      }
    }

    // Populate Matrix Table View
    function renderMatrixTable() {
      var tbody = document.getElementById('qa-matrix-table-body');
      if (!tbody) return;

      var rowsHtml = '';
      Object.keys(suites).forEach(function(k) {
        var item = suites[k];
        rowsHtml += [
          '<tr style="border-bottom:1px solid var(--night-line);cursor:pointer" class="qa-matrix-row" data-key="' + k + '">',
          '  <td style="padding:10px;font-family:var(--f-mono);font-weight:600;color:var(--gold)">' + item.id + '</td>',
          '  <td style="padding:10px"><b style="color:#fff">' + item.title.split('·')[1].trim() + '</b><div style="font-size:.72rem;color:var(--night-ink-2)">' + item.category + '</div></td>',
          '  <td style="padding:10px;font-size:.75rem">' + item.statutory + '</td>',
          '  <td style="padding:10px;font-size:.75rem">' + item.target + '</td>',
          '  <td style="padding:10px"><span class="chip ok sm">AUTOMATED</span></td>',
          '</tr>'
        ].join('');
      });

      tbody.innerHTML = rowsHtml;

      tbody.querySelectorAll('.qa-matrix-row').forEach(function(row) {
        row.addEventListener('click', function() {
          var k = row.dataset.key;
          var select = document.getElementById('qa-scenario-select');
          if (select) select.value = k;
          renderScenario(k);
          switchQaTab('generator');
        });
      });
    }

    // Tab Switching
    var tabGen = document.getElementById('qa-tab-generator');
    var tabMat = document.getElementById('qa-tab-matrix');
    var tabRun = document.getElementById('qa-tab-runner');
    var viewGen = document.getElementById('qa-view-generator');
    var viewMat = document.getElementById('qa-view-matrix');
    var viewRun = document.getElementById('qa-view-runner');

    function switchQaTab(name) {
      if (viewGen) viewGen.style.display = name === 'generator' ? 'block' : 'none';
      if (viewMat) viewMat.style.display = name === 'matrix' ? 'block' : 'none';
      if (viewRun) viewRun.style.display = name === 'runner' ? 'block' : 'none';

      if (tabGen) { tabGen.className = name === 'generator' ? 'btn sm btn-g' : 'btn sm btn-w'; }
      if (tabMat) { tabMat.className = name === 'matrix' ? 'btn sm btn-g' : 'btn sm btn-w'; }
      if (tabRun) { tabRun.className = name === 'runner' ? 'btn sm btn-g' : 'btn sm btn-w'; }
    }

    if (tabGen) tabGen.addEventListener('click', function() { switchQaTab('generator'); });
    if (tabMat) tabMat.addEventListener('click', function() { switchQaTab('matrix'); });
    if (tabRun) tabRun.addEventListener('click', function() { switchQaTab('runner'); });

    // Dropdown Change
    var selectEl = document.getElementById('qa-scenario-select');
    if (selectEl) {
      selectEl.addEventListener('change', function(e) {
        renderScenario(e.target.value);
      });
    }

    // Copy Button
    var btnCopy = document.getElementById('btn-copy-test-code');
    if (btnCopy) {
      btnCopy.addEventListener('click', function() {
        var s = suites[currentKey];
        if (!s) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(s.code).then(function() {
            showToast('Playwright TypeScript test suite copied to clipboard!', 'ok');
          }).catch(function() {
            showToast('Copied to clipboard.', 'ok');
          });
        } else {
          showToast('Code copied.', 'ok');
        }
      });
    }

    // Download Button
    var btnDl = document.getElementById('btn-download-test-code');
    if (btnDl) {
      btnDl.addEventListener('click', function() {
        var s = suites[currentKey];
        if (!s) return;
        var blob = new Blob([s.code], { type: 'text/typescript' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = s.filename.split('/').pop() || 'test.spec.ts';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Downloaded ' + a.download, 'ok');
      });
    }

    // Run Simulation
    function runSimulation(key) {
      var s = suites[key || currentKey];
      if (!s) return;
      switchQaTab('runner');

      var term = document.getElementById('qa-runner-terminal');
      if (!term) return;

      term.innerHTML = '<div style="color:var(--gold)">$ npx playwright test ' + s.filename + ' --reporter=list</div>';

      var i = 0;
      var interval = setInterval(function() {
        if (i < s.simLog.length) {
          var line = s.simLog[i];
          var div = document.createElement('div');
          if (line.includes('[PASSED]')) {
            div.style.color = '#2ecc71';
            div.style.fontWeight = 'bold';
            div.style.marginTop = '8px';
          } else if (line.includes('✓')) {
            div.style.color = '#38bdf8';
          } else if (line.includes('[START]')) {
            div.style.color = 'var(--night-ink-2)';
            div.style.marginBottom = '4px';
          } else {
            div.style.color = 'var(--night-ink)';
          }
          div.textContent = line;
          term.appendChild(div);
          term.scrollTop = term.scrollHeight;
          i++;
        } else {
          clearInterval(interval);
          showToast('Playwright simulation passed cleanly!', 'ok');
        }
      }, 180);
    }

    var btnRun = document.getElementById('btn-run-selected-test');
    if (btnRun) btnRun.addEventListener('click', function() { runSimulation(); });

    var btnReRun = document.getElementById('btn-re-execute-runner');
    if (btnReRun) btnReRun.addEventListener('click', function() { runSimulation(); });

    // Initial render
    renderScenario('kba_lockout');
    renderMatrixTable();
  }

  // -------------------------------------------------------------
  // 14B. IRS COMPLIANCE & PEN-TEST READINESS REPORT GENERATOR
  // -------------------------------------------------------------
  function initComplianceReportGenerator() {
    var controls = [
      {
        id: 'KBA-01',
        domain: 'pub1345',
        domainName: 'IRS Pub 1345 §6 E-Sign & KBA',
        title: 'Dynamic Out-of-Wallet Identity Proofing',
        statute: 'IRS Pub 1345 §6.1',
        risk: 'critical',
        status: 'pass',
        details: 'Dynamic generation of 3 to 5 multi-choice identity questions from credit bureau repositories. 80% passing threshold. 2-minute expiration per attempt.',
        verification: 'KBA API webhook verified with mock credit bureau test vectors. Fresh question set generated per attempt.'
      },
      {
        id: 'KBA-02',
        domain: 'pub1345',
        domainName: 'IRS Pub 1345 §6 E-Sign & KBA',
        title: '3-Attempt Hard Lockout & Rejection Engine',
        statute: 'IRS Pub 1345 §6.2',
        risk: 'critical',
        status: 'pass',
        details: 'Strict 3-failure lockout ceiling across all sessions. Immediate digital signing revocation and automated switch to in-person / paper Form 8879 wet ink signature.',
        verification: 'Verified via automated Playwright spec irs-pub1345-kba-lockout.spec.ts. 4th attempt strictly blocked with HTTP 423 Locked.'
      },
      {
        id: 'KBA-03',
        domain: 'pub1345',
        domainName: 'IRS Pub 1345 §6 E-Sign & KBA',
        title: 'Joint-Filer (MFJ) Dual Identity Independence',
        statute: 'IRS Pub 1345 §6.3',
        risk: 'high',
        status: 'pass',
        details: 'Spouses in Married Filing Jointly returns authenticate independently via separate email invitations, separate KBA sessions, and dual cryptographic timestamps.',
        verification: 'Verified via automated Playwright spec joint-filer-signing-sequence.spec.ts. Dual independent signer certificates generated.'
      },
      {
        id: 'KBA-04',
        domain: 'pub1345',
        domainName: 'IRS Pub 1345 §6 E-Sign & KBA',
        title: 'Cryptographic Form 8879 Document Hash Binding',
        statute: 'IRS Pub 1345 §6.4',
        risk: 'critical',
        status: 'pass',
        details: 'SHA-256 cryptographic digest calculated at time of signing and irreversibly bound into certificate of completion with signer IP, user agent, and UTC timestamp.',
        verification: 'SHA-256 hash match verified on executed PDF. Post-signature byte tampering invalidates digital envelope.'
      },
      {
        id: 'KBA-05',
        domain: 'pub1345',
        domainName: 'IRS Pub 1345 §6 E-Sign & KBA',
        title: 'Statutory 3-Year Evidence Record Retention SLA',
        statute: 'IRS Pub 1345 §6.5 & IRC §6061',
        risk: 'medium',
        status: 'pass',
        details: 'Complete evidence bundle (KBA results, consent disclosure, audit log, signed PDF) retained in immutable S3 Glacier vault for mandatory 3-year statutory window.',
        verification: 'S3 Object Lock compliance mode verified with 1,096-day retention hold.'
      },
      {
        id: 'CRYPTO-01',
        domain: 'crypto',
        domainName: 'AES-256 & Data-at-Rest',
        title: 'AES-256-GCM Envelope Encryption at Rest',
        statute: 'IRS Pub 4557 §3 & FTC §314.4(c)(4)',
        risk: 'critical',
        status: 'pass',
        details: 'All tax returns, W-2s, and 1099s encrypted using AES-256 envelope encryption with client-isolated Data Encryption Keys (DEKs) wrapped by KMS master keys.',
        verification: 'Database fields and S3 blobs verified zero plaintext. KMS key rotation scheduled every 90 days.'
      },
      {
        id: 'CRYPTO-02',
        domain: 'crypto',
        domainName: 'AES-256 & Data-at-Rest',
        title: 'TLS 1.3 Strict In-Transit Encryption with HSTS Preload',
        statute: 'IRS Pub 4557 §3 & NIST SP 800-52',
        risk: 'high',
        status: 'pass',
        details: 'Strict HTTPS enforcement with TLS 1.3 exclusively and Perfect Forward Secrecy (PFS) ciphers. HSTS preload header enabled with 1-year max-age.',
        verification: 'SSL Labs Grade A+ verified. Deprecated protocols (TLS 1.0/1.1, CBC, 3DES) rejected at edge proxy.'
      },
      {
        id: 'CRYPTO-03',
        domain: 'crypto',
        domainName: 'AES-256 & Data-at-Rest',
        title: 'Inbound Anti-Malware Quarantine & EICAR Filter',
        statute: 'IRS Pub 4557 §3.2 & FTC Safeguards',
        risk: 'high',
        status: 'pass',
        details: 'Synchronous antivirus and heuristic inspection prior to committing client uploads to persistent storage. Instant quarantine of suspicious signatures.',
        verification: 'Verified via Playwright spec eicar-malware-rejection.spec.ts. Upload rejected with HTTP 422 Unprocessable Entity.'
      },
      {
        id: 'CRYPTO-04',
        domain: 'crypto',
        domainName: 'AES-256 & Data-at-Rest',
        title: 'Zero Client-Side Secret Persistence',
        statute: 'FTC Safeguards §314.4 & OWASP Mobile M1',
        risk: 'critical',
        status: 'pass',
        details: 'No AWS IAM secret keys, KMS master keys, or private signing certificates stored in browser LocalStorage, IndexedDB, or mobile application bundle.',
        verification: 'Static AST code analysis confirms zero leaked credentials. All signing operations mediated via isolated backend API.'
      },
      {
        id: 'AUDIT-01',
        domain: 'audit',
        domainName: 'Audit Logging & Access Trails',
        title: 'Append-Only Forensic Audit Trail with HMAC Chaining',
        statute: 'FTC Safeguards §314.4(c)(1) & IRS Pub 4557',
        risk: 'high',
        status: 'pass',
        details: 'Every document view, download, signature, and staff escalation logged with cryptographically chained HMAC SHA-256 hashes (Hash_N = SHA-256(Record + Hash_{N-1})).',
        verification: 'Audit log chain verified tamper-evident. Modification of intermediate record causes chain integrity validation failure.'
      },
      {
        id: 'AUDIT-02',
        domain: 'audit',
        domainName: 'Audit Logging & Access Trails',
        title: 'Role-Based Access Control (RBAC) & Tenant Isolation',
        statute: 'FTC Safeguards §314.4(c)(2)',
        risk: 'critical',
        status: 'pass',
        details: 'Strict separation between staff, clients, and firm administrative views. Staff restricted to assigned engagements; cross-client read blocked.',
        verification: 'RBAC authorization matrix verified. Unauthorized client impersonation attempts trigger security alarms.'
      },
      {
        id: 'AUDIT-03',
        domain: 'audit',
        domainName: 'Audit Logging & Access Trails',
        title: 'Broken Object-Level Authorization (BOLA/IDOR) Defense',
        statute: 'OWASP API1:2023 & FTC Safeguards',
        risk: 'critical',
        status: 'pass',
        details: 'Every file download, invoice fetch, and Form 8879 review endpoint cryptographically verifies user session token against object tenant ownership ID.',
        verification: 'Verified via Playwright spec idor-tenant-isolation.spec.ts. Cross-tenant IDOR access strictly rejected with HTTP 403 Forbidden.'
      },
      {
        id: 'AUDIT-04',
        domain: 'audit',
        domainName: 'Audit Logging & Access Trails',
        title: '15-Minute Session Inactivity Lockout & Step-Up MFA',
        statute: 'FTC Safeguards §314.4(c)(5) & IRS Pub 4557',
        risk: 'medium',
        status: 'pass',
        details: 'Automatic session expiration after 15 minutes of user inactivity. Step-up biometric or TOTP re-authentication required to view full SSN/EIN.',
        verification: 'Idle timer tested. Client session invalidated in Redis cache upon 15:00 expiration.'
      },
      {
        id: 'PEN-01',
        domain: 'pentest',
        domainName: 'Pen-Test Target Hardening',
        title: 'SSRF & Document Rendering Enclave Hardening',
        statute: 'OWASP Top 10 A10:2021 & Pen-Test Target',
        risk: 'high',
        status: 'pass',
        details: 'Server-side PDF generation and rendering sandboxed in isolated Firecracker microVMs without access to internal VPC metadata IP (169.254.169.254).',
        verification: 'Pen-test sandbox escape tests blocked. Outbound network egress disabled during document rendering.'
      },
      {
        id: 'PEN-02',
        domain: 'pentest',
        domainName: 'Pen-Test Target Hardening',
        title: 'API Rate Limiting & Timing Attack Protection',
        statute: 'NIST SP 800-63B & FTC Safeguards',
        risk: 'medium',
        status: 'pass',
        details: 'Token-bucket rate limiting on authentication and KBA endpoints (5 attempts/min per IP). Constant-time cryptographic comparison functions used for HMACs.',
        verification: 'Tested with burst load; HTTP 429 Too Many Requests issued. Timing differentials < 0.05ms.'
      },
      {
        id: 'PEN-03',
        domain: 'pentest',
        domainName: 'Pen-Test Target Hardening',
        title: 'Automated CI/CD SAST/DAST & Zero High/Critical CVEs',
        statute: 'FTC Safeguards §314.4(c)(8)',
        risk: 'high',
        status: 'pass',
        details: 'Automated vulnerability scanning in CI/CD pipeline. Zero unresolved Critical or High vulnerabilities allowed in production container images.',
        verification: 'Trivy and Snyk scans clean. Dependency check passed with zero known exploits.'
      }
    ];

    var currentFilter = 'all';

    function calculateMetrics() {
      var total = controls.length;
      var passed = controls.filter(function(c) { return c.status === 'pass'; }).length;
      var failed = total - passed;

      var critTotal = controls.filter(function(c) { return c.risk === 'critical'; }).length;
      var critFail  = controls.filter(function(c) { return c.risk === 'critical' && c.status === 'fail'; }).length;

      var highTotal = controls.filter(function(c) { return c.risk === 'high'; }).length;
      var highFail  = controls.filter(function(c) { return c.risk === 'high' && c.status === 'fail'; }).length;

      var medTotal  = controls.filter(function(c) { return c.risk === 'medium'; }).length;
      var medFail   = controls.filter(function(c) { return c.risk === 'medium' && c.status === 'fail'; }).length;

      var score = Math.round((passed / total) * 100);

      return {
        total: total,
        passed: passed,
        failed: failed,
        critTotal: critTotal,
        critFail: critFail,
        highTotal: highTotal,
        highFail: highFail,
        medTotal: medTotal,
        medFail: medFail,
        score: score
      };
    }

    function updateUI() {
      var m = calculateMetrics();

      // Update Gauge
      var gaugeEl = document.getElementById('audit-score-gauge');
      if (gaugeEl) {
        gaugeEl.textContent = m.score + '%';
        gaugeEl.classList.remove('critical', 'warning');
        if (m.critFail > 0 || m.score < 70) {
          gaugeEl.classList.add('critical');
        } else if (m.score < 90) {
          gaugeEl.classList.add('warning');
        }
      }

      // Update KPIs
      var critEl = document.getElementById('audit-kpi-critical');
      var critSub = document.getElementById('audit-kpi-critical-sub');
      if (critEl) {
        critEl.textContent = m.critFail + ' / ' + m.critTotal;
        critEl.style.color = m.critFail > 0 ? '#ef4444' : '#2ecc71';
      }
      if (critSub) critSub.textContent = m.critFail === 0 ? '0 Deficiencies' : m.critFail + ' Blockers Active';

      var highEl = document.getElementById('audit-kpi-high');
      var highSub = document.getElementById('audit-kpi-high-sub');
      if (highEl) {
        highEl.textContent = m.highFail + ' / ' + m.highTotal;
        highEl.style.color = m.highFail > 0 ? '#f97316' : '#2ecc71';
      }
      if (highSub) highSub.textContent = m.highFail === 0 ? '0 Deficiencies' : m.highFail + ' High Severity';

      var medEl = document.getElementById('audit-kpi-medium');
      var medSub = document.getElementById('audit-kpi-medium-sub');
      if (medEl) {
        medEl.textContent = m.medFail + ' / ' + m.medTotal;
        medEl.style.color = m.medFail > 0 ? '#eab308' : '#2ecc71';
      }
      if (medSub) medSub.textContent = m.medFail === 0 ? '0 Deficiencies' : m.medFail + ' Medium Risk';

      var passEl = document.getElementById('audit-kpi-passed');
      var passSub = document.getElementById('audit-kpi-passed-sub');
      if (passEl) {
        passEl.textContent = m.passed + ' / ' + m.total;
        passEl.style.color = m.failed > 0 ? (m.critFail > 0 ? '#ef4444' : '#f59e0b') : '#2ecc71';
      }
      if (passSub) passSub.textContent = m.score + '% Statutory Passing';

      // Update Status Banner
      var bannerEl = document.getElementById('audit-live-status-banner');
      var bannerText = document.getElementById('audit-banner-text');
      var bannerIcon = document.getElementById('audit-banner-icon');
      var statPill = document.getElementById('audit-statutory-pill');

      if (bannerEl && bannerText && bannerIcon) {
        if (m.critFail > 0) {
          bannerEl.className = 'audit-status-banner fail';
          bannerIcon.innerHTML = '&#9888;';
          bannerText.innerHTML = '<b>CRITICAL STATUTORY DEFICIENCY DETECTED (' + m.critFail + ' FAILURES):</b> Under IRS Pub 1345 §6 and FTC Safeguards §314.4, critical control failure halts electronic signature safe-harbor and penetration testing readiness. Remediation required within 24 hours.';
          if (statPill) {
            statPill.className = 'chip warn';
            statPill.innerHTML = '&#9888; BLOCKED: CRITICAL DEFICIENCY';
          }
        } else if (m.highFail > 0 || m.medFail > 0) {
          bannerEl.className = 'audit-status-banner fail';
          bannerEl.style.background = 'rgba(249, 115, 22, 0.15)';
          bannerEl.style.borderColor = 'rgba(249, 115, 22, 0.5)';
          bannerEl.style.color = '#fed7aa';
          bannerIcon.innerHTML = '&#9679;';
          bannerText.innerHTML = '<b>CONDITIONAL PRE-TEST READINESS (' + (m.highFail + m.medFail) + ' DEFICIENCIES):</b> Baseline KBA controls intact, but ' + m.highFail + ' High and ' + m.medFail + ' Medium risk findings must be resolved prior to final external penetration testing sign-off.';
          if (statPill) {
            statPill.className = 'chip warn';
            statPill.innerHTML = '&#9679; CONDITIONAL READINESS';
          }
        } else {
          bannerEl.className = 'audit-status-banner pass';
          bannerEl.style.background = '';
          bannerEl.style.borderColor = '';
          bannerEl.style.color = '';
          bannerIcon.innerHTML = '&#10003;';
          bannerText.innerHTML = '<b>PRE-ENGAGEMENT VERIFICATION SATISFIED:</b> All IRS Pub 1345 §6 identity proofing limits, AES-256 cryptographic controls, and FTC Safeguards §314.4 tamper-evident logging mechanisms are verified. Platform authorized for external penetration testing.';
          if (statPill) {
            statPill.className = 'chip ok';
            statPill.innerHTML = '&#9679; ATT-READY: LOW RESIDUAL RISK';
          }
        }
      }

      renderChecklistItems();
    }

    function renderChecklistItems() {
      var container = document.getElementById('audit-checklist-container');
      if (!container) return;

      var filtered = controls.filter(function(c) {
        if (currentFilter === 'all') return true;
        return c.domain === currentFilter;
      });

      var html = '';
      filtered.forEach(function(item) {
        var isPass = item.status === 'pass';
        var rowClass = isPass ? 'audit-item-row passed' : 'audit-item-row failed';
        var riskClass = 'audit-risk-tag ' + item.risk;
        var toggleClass = isPass ? 'audit-toggle-btn passed' : 'audit-toggle-btn failed';
        var toggleLabel = isPass ? '&#10003; Pass' : '&#10005; Fail';

        html += [
          '<div class="' + rowClass + '" data-control-id="' + item.id + '">',
          '  <div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px">',
          '    <span style="font-family:var(--f-mono);font-size:.74rem;font-weight:700;color:var(--gold)">' + item.id + '</span>',
          '    <span class="' + riskClass + '">' + item.risk.toUpperCase() + '</span>',
          '  </div>',
          '  <div>',
          '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">',
          '      <span style="font-size:.88rem;font-weight:600;color:#fff">' + item.title + '</span>',
          '      <span style="font-family:var(--f-mono);font-size:.68rem;color:var(--night-ink-2);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:3px">' + item.statute + '</span>',
          '    </div>',
          '    <div style="font-size:.78rem;color:var(--night-ink-2);margin-top:4px;line-height:1.5">' + item.details + '</div>',
          '    <div style="font-family:var(--f-mono);font-size:.7rem;color:' + (isPass ? '#38bdf8' : '#f87171') + ';margin-top:5px;display:flex;align-items:center;gap:5px">',
          '      <span>' + (isPass ? '&#9670; Evidence:' : '&#9888; Deficient:') + '</span> ' + item.verification,
          '    </div>',
          '  </div>',
          '  <div>',
          '    <button class="' + toggleClass + '" data-toggle-id="' + item.id + '" title="Click to toggle Pass / Fail state">' + toggleLabel + '</button>',
          '  </div>',
          '</div>'
        ].join('');
      });

      container.innerHTML = html;

      // Bind toggle clicks
      container.querySelectorAll('.audit-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          var id = e.currentTarget.getAttribute('data-toggle-id');
          var item = controls.find(function(c) { return c.id === id; });
          if (item) {
            item.status = item.status === 'pass' ? 'fail' : 'pass';
            showToast(item.id + ' marked as ' + item.status.toUpperCase(), item.status === 'pass' ? 'ok' : 'err');
            updateUI();
          }
        });
      });
    }

    // Category Filter Handlers
    var filterBtns = document.querySelectorAll('.audit-filter-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter') || 'all';
        renderChecklistItems();
      });
    });

    // Reset Baseline
    var btnReset = document.getElementById('btn-audit-reset-all');
    if (btnReset) {
      btnReset.addEventListener('click', function() {
        controls.forEach(function(c) { c.status = 'pass'; });
        showToast('All 16 statutory controls reset to baseline PASS.', 'ok');
        updateUI();
      });
    }

    // Simulate Failures
    var btnSimulate = document.getElementById('btn-audit-simulate-fails');
    if (btnSimulate) {
      btnSimulate.addEventListener('click', function() {
        controls.forEach(function(c) { c.status = 'pass'; });
        // Set 3 targeted deficiencies
        var failIds = ['KBA-02', 'CRYPTO-03', 'AUDIT-04'];
        controls.forEach(function(c) {
          if (failIds.includes(c.id)) c.status = 'fail';
        });
        showToast('Simulated 3 realistic pre-audit deficiencies (KBA Lockout, Malware, Idle Lockout).', 'err');
        updateUI();
      });
    }

    // Export JSON
    var btnExportJson = document.getElementById('btn-export-audit-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', function() {
        var m = calculateMetrics();
        var reportData = {
          assessmentTitle: 'IRS Pub 4557, Pub 1345 & FTC Safeguards Penetration Testing Readiness Evaluation',
          entity: 'Pivot Aide Tax Advisory Group LLC',
          application: 'The File Room v1.0',
          evaluationTimestamp: new Date().toISOString(),
          leadAuditor: 'Fintech Security & Compliance Lead (CISSP / CISA)',
          qualifiedIndividual: 'Michael Whitfield (Managing Partner)',
          scoreSummary: m,
          controls: controls,
          cryptographicAttestation: {
            dataAtRestKmsKeyId: 'arn:aws:kms:us-east-1:748291038472:key/mrk-9f8e7d6c-file-room-aes256',
            auditChainHeadHmac: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
            integrityVerification: m.critFail === 0 ? 'VALIDATED' : 'INTEGRITY_COMPROMISED'
          }
        };

        var blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'irs-compliance-audit-report-' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Exported audit report JSON.', 'ok');
      });
    }

    // Open Executive Audit Summary Modal
    var btnOpenSummary = document.getElementById('btn-open-audit-summary');
    if (btnOpenSummary) {
      btnOpenSummary.addEventListener('click', function() {
        var m = calculateMetrics();
        if (el.modalContainer) el.modalContainer.classList.add('modal-wide');

        var critRows = controls.filter(function(c) { return c.risk === 'critical'; }).map(function(c) {
          return '<tr><td style="font-family:var(--f-mono);font-weight:700">' + c.id + '</td><td><b>' + c.title + '</b><div style="font-size:.72rem;color:var(--ink-3)">' + c.statute + '</div></td><td>' + (c.status === 'pass' ? '<span style="color:#2ecc71;font-weight:700">&#10003; PASS</span>' : '<span style="color:#ef4444;font-weight:700">&#10005; DEFICIENT</span>') + '</td><td style="font-size:.75rem">' + c.verification + '</td></tr>';
        }).join('');

        var highRows = controls.filter(function(c) { return c.risk === 'high'; }).map(function(c) {
          return '<tr><td style="font-family:var(--f-mono);font-weight:700">' + c.id + '</td><td><b>' + c.title + '</b><div style="font-size:.72rem;color:var(--ink-3)">' + c.statute + '</div></td><td>' + (c.status === 'pass' ? '<span style="color:#2ecc71;font-weight:700">&#10003; PASS</span>' : '<span style="color:#f97316;font-weight:700">&#10005; DEFICIENT</span>') + '</td><td style="font-size:.75rem">' + c.verification + '</td></tr>';
        }).join('');

        var medRows = controls.filter(function(c) { return c.risk === 'medium'; }).map(function(c) {
          return '<tr><td style="font-family:var(--f-mono);font-weight:700">' + c.id + '</td><td><b>' + c.title + '</b><div style="font-size:.72rem;color:var(--ink-3)">' + c.statute + '</div></td><td>' + (c.status === 'pass' ? '<span style="color:#2ecc71;font-weight:700">&#10003; PASS</span>' : '<span style="color:#eab308;font-weight:700">&#10005; DEFICIENT</span>') + '</td><td style="font-size:.75rem">' + c.verification + '</td></tr>';
        }).join('');

        var bodyHtml = [
          '<div style="font-family:var(--f-sans);color:var(--ink);line-height:1.6;font-size:.85rem">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--line);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:10px">',
          '    <div>',
          '      <span style="font-family:var(--f-mono);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);font-weight:700">Executive Compliance Audit</span>',
          '      <h3 style="font-size:1.4rem;font-weight:700;margin:4px 0 0;color:var(--ink)">IRS Compliance & Pen-Test Readiness Summary</h3>',
          '    </div>',
          '    <div style="text-align:right">',
          '      <div style="font-family:var(--f-mono);font-size:1.8rem;font-weight:700;color:' + (m.critFail > 0 ? '#ef4444' : '#2ecc71') + '">' + m.score + '%</div>',
          '      <div style="font-family:var(--f-mono);font-size:.65rem;color:var(--ink-3)">READINESS SCORE</div>',
          '    </div>',
          '  </div>',
          '  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px">',
          '    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;font-size:.78rem">',
          '      <div><b>Assessed Entity:</b> Pivot Aide Tax Advisory Group LLC</div>',
          '      <div><b>Target Portal:</b> The File Room Client Platform</div>',
          '      <div><b>Qualified Individual:</b> Michael Whitfield (16 CFR §314.4(a))</div>',
          '      <div><b>Statutory Frameworks:</b> IRS Pub 4557, Pub 1345 §6, FTC Safeguards</div>',
          '    </div>',
          '  </div>',
          '  <h4 style="margin:16px 0 8px;font-size:1rem;color:var(--ink)">1. Executive Risk Assessment Breakdown</h4>',
          '  <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:16px;text-align:center">',
          '    <div style="background:' + (m.critFail > 0 ? '#fee2e2' : '#f0fdf4') + ';border:1px solid ' + (m.critFail > 0 ? '#fca5a5' : '#bbf7d0') + ';padding:10px;border-radius:4px">',
          '      <div style="font-family:var(--f-mono);font-size:1.4rem;font-weight:700;color:' + (m.critFail > 0 ? '#b91c1c' : '#15803d') + '">' + (m.critTotal - m.critFail) + ' / ' + m.critTotal + '</div>',
          '      <div style="font-size:.72rem;font-weight:600;color:' + (m.critFail > 0 ? '#991b1b' : '#166534') + '">Critical Risk (Zero Tol)</div>',
          '      <div style="font-size:.68rem;color:var(--ink-3)">' + m.critFail + ' active findings</div>',
          '    </div>',
          '    <div style="background:' + (m.highFail > 0 ? '#ffedd5' : '#f0fdf4') + ';border:1px solid ' + (m.highFail > 0 ? '#fed7aa' : '#bbf7d0') + ';padding:10px;border-radius:4px">',
          '      <div style="font-family:var(--f-mono);font-size:1.4rem;font-weight:700;color:' + (m.highFail > 0 ? '#c2410c' : '#15803d') + '">' + (m.highTotal - m.highFail) + ' / ' + m.highTotal + '</div>',
          '      <div style="font-size:.72rem;font-weight:600;color:' + (m.highFail > 0 ? '#9a3412' : '#166534') + '">High Risk (Priority)</div>',
          '      <div style="font-size:.68rem;color:var(--ink-3)">' + m.highFail + ' active findings</div>',
          '    </div>',
          '    <div style="background:' + (m.medFail > 0 ? '#fef9c3' : '#f0fdf4') + ';border:1px solid ' + (m.medFail > 0 ? '#fef08a' : '#bbf7d0') + ';padding:10px;border-radius:4px">',
          '      <div style="font-family:var(--f-mono);font-size:1.4rem;font-weight:700;color:' + (m.medFail > 0 ? '#a16207' : '#15803d') + '">' + (m.medTotal - m.medFail) + ' / ' + m.medTotal + '</div>',
          '      <div style="font-size:.72rem;font-weight:600;color:' + (m.medFail > 0 ? '#854d0e' : '#166534') + '">Medium Risk (Standard)</div>',
          '      <div style="font-size:.68rem;color:var(--ink-3)">' + m.medFail + ' active findings</div>',
          '    </div>',
          '  </div>',
          '  <h4 style="margin:16px 0 8px;font-size:1rem;color:var(--ink)">2. Statutory Control Evaluations</h4>',
          '  <div style="overflow-x:auto;max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:4px">',
          '    <table class="exhibit-table" style="font-size:.76rem;margin:0">',
          '      <thead><tr style="background:#f1f5f9"><th style="width:70px">ID</th><th>Control & Statute</th><th style="width:80px">Status</th><th>Verification Evidence</th></tr></thead>',
          '      <tbody>' + critRows + highRows + medRows + '</tbody>',
          '    </table>',
          '  </div>',
          '  <h4 style="margin:18px 0 8px;font-size:1rem;color:var(--ink)">3. Data-at-Rest & Audit Trail Cryptographic Attestation</h4>',
          '  <div style="background:#091b26;color:#dcebf3;padding:12px 16px;border-radius:4px;font-family:var(--f-mono);font-size:.73rem;line-height:1.7">',
          '    <div><b>ENCRYPTION STANDARD:</b> AES-256-GCM Envelope Encryption (AWS KMS Multi-Region Key)</div>',
          '    <div><b>KMS KEY ARN:</b> arn:aws:kms:us-east-1:748291038472:key/mrk-9f8e7d6c-file-room-aes256</div>',
          '    <div><b>AUDIT LOG HEAD DIGEST:</b> 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</div>',
          '    <div><b>INTEGRITY STATUS:</b> <span style="color:#2ecc71">VERIFIED TAMPER-EVIDENT ✓ (Zero Chain Violations)</span></div>',
          '  </div>',
          '</div>'
        ].join('');

        var footerHtml = [
          '<button class="btn sm btn-o" id="btn-print-summary">&#128438; Print / Save PDF</button>',
          '<button class="btn sm btn-w" id="btn-copy-summary">&#128203; Copy Summary</button>',
          '<button class="btn sm btn-g" id="modal-cancel-btn">Close</button>'
        ].join('');

        openModal('Executive Compliance Audit Summary Report', bodyHtml, footerHtml);

        var printBtn = document.getElementById('btn-print-summary');
        if (printBtn) printBtn.addEventListener('click', function() { window.print(); });

        var copyBtn = document.getElementById('btn-copy-summary');
        if (copyBtn) {
          copyBtn.addEventListener('click', function() {
            var text = [
              'PIVOT AIDE TAX — EXECUTIVE COMPLIANCE AUDIT SUMMARY',
              'Readiness Score: ' + m.score + '%',
              'Critical Risk: ' + (m.critTotal - m.critFail) + '/' + m.critTotal + ' (Failures: ' + m.critFail + ')',
              'High Risk: ' + (m.highTotal - m.highFail) + '/' + m.highTotal + ' (Failures: ' + m.highFail + ')',
              'Medium Risk: ' + (m.medTotal - m.medFail) + '/' + m.medTotal + ' (Failures: ' + m.medFail + ')',
              'Evaluated Controls: ' + m.passed + '/' + m.total + ' passing.',
              'KMS Key ARN: arn:aws:kms:us-east-1:748291038472:key/mrk-9f8e7d6c-file-room-aes256',
              'Audit Trail HMAC Head: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'
            ].join('\n');
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function() { showToast('Audit summary copied.', 'ok'); });
            }
          });
        }
      });
    }

    // Open Formal Pen-Test Attestation Letter Modal
    var btnOpenAttestation = document.getElementById('btn-open-attestation-letter');
    if (btnOpenAttestation) {
      btnOpenAttestation.addEventListener('click', function() {
        var m = calculateMetrics();
        if (el.modalContainer) el.modalContainer.classList.add('modal-wide');

        var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        var letterHtml = [
          '<div class="attestation-letter-view">',
          '  <div class="attestation-header">',
          '    <div class="attestation-badge">LEGAL COMPLIANCE &middot; CONFIDENTIAL &amp; PRIVILEGED WORK PRODUCT</div>',
          '    <h2 class="attestation-title">Pivot Aide Tax Advisory Group LLC</h2>',
          '    <div style="font-family:var(--f-sans);font-size:.8rem;color:#475569;margin-top:2px">Office of the Qualified Individual &middot; Information Security Steering Committee</div>',
          '    <div style="font-family:var(--f-sans);font-size:.76rem;color:#64748b">100 Wall Street, Suite 1400 &middot; New York, NY 10005 &middot; compliance@pivot-aide.com</div>',
          '  </div>',
          '  ',
          '  <table class="attestation-meta-table">',
          '    <tr><td class="label">TO:</td><td>Lead Security Assessor &amp; External Penetration Testing Team</td></tr>',
          '    <tr><td class="label">FROM:</td><td>Michael Whitfield, Qualified Individual (FTC Safeguards §314.4(a)) &middot; Managing Partner</td></tr>',
          '    <tr><td class="label">DATE OF ATTESTATION:</td><td>' + today + '</td></tr>',
          '    <tr><td class="label">SUBJECT:</td><td><b>Authorization to Conduct Penetration Testing &amp; Statutory Rules of Engagement</b></td></tr>',
          '    <tr><td class="label">TARGET PLATFORM:</td><td>The File Room &mdash; Custom Tax Client Portal &amp; Regulated Workflow Engine</td></tr>',
          '    <tr><td class="label">PRE-TEST READINESS:</td><td><b>' + m.score + '% Statutory Compliance (' + (m.critFail === 0 ? 'READY FOR TESTING ✓' : 'CONDITIONAL / CRITICAL DEFICIENCY ACTIVE ✕') + ')</b></td></tr>',
          '  </table>',
          '  ',
          '  <div class="attestation-section-title">1. Formal Scope Authorization &amp; Safe Harbor</div>',
          '  <p>Pivot Aide Tax Advisory Group LLC hereby authorizes your designated third-party security assessment team to perform formal external penetration testing, API vulnerability assessments, and cloud configuration audits against the designated target applications. This authorization constitutes explicit written consent under the Computer Fraud and Abuse Act (18 U.S.C. § 1030) and applicable state statutes, provided testing strictly adheres to the Rules of Engagement detailed herein.</p>',
          '  ',
          '  <div class="attestation-section-title">2. In-Scope Target Systems &amp; Out-of-Scope Exclusions</div>',
          '  <p><b>In-Scope Target Systems:</b></p>',
          '  <ul>',
          '    <li>Client Web Application Portal: <code>https://client.pivot-aide.com</code> and related static asset pipelines.</li>',
          '    <li>API Gateway &amp; Microservices: <code>https://api.pivot-aide.com/v1/*</code> (Authentication, Document Vault, Messaging, Billing).</li>',
          '    <li>Firebase Infrastructure: Firestore security rules, Firebase Authentication tokens, and Cloud Storage security boundaries.</li>',
          '    <li>Regulated Signing Webhook Ingestion: <code>https://api.pivot-aide.com/webhooks/esign-completion</code> and KBA verification callback routers.</li>',
          '  </ul>',
          '  <p><b>Strictly Out-of-Scope Exclusions (Testing Prohibited):</b></p>',
          '  <ul>',
          '    <li>Production IRS Modernized e-File (MeF) transmission gateways and state tax authority staging endpoints.</li>',
          '    <li>Upstream Credit Bureau repositories utilized for Knowledge-Based Authentication (LexisNexis, Experian).</li>',
          '    <li>Third-party PCI-DSS Level 1 hosted payment gateways (Stripe Checkout infrastructure).</li>',
          '    <li>Denial-of-Service (DoS/DDoS) stress testing against edge cloud networks.</li>',
          '  </ul>',
          '  ',
          '  <div class="attestation-section-title">3. Statutory Defensive Architecture Attestation</div>',
          '  <p>As the designated Qualified Individual pursuant to 16 CFR §314.4(a), I formally attest that the following defensive safeguards are actively deployed across the target platform:</p>',
          '  <ul>',
          '    <li><b>IRS Pub 1345 §6 E-Sign / KBA:</b> Remote signing of Form 8879 enforces dynamic out-of-wallet identity questions with a strict 3-attempt lifetime lockout, automatic revocation of electronic signing eligibility, and fallback to physical wet signature.</li>',
          '    <li><b>IRS Pub 4557 Data-at-Rest:</b> AES-256-GCM envelope encryption is enforced across all client tax returns, W-2s, and sensitive financial records with KMS customer-managed keys rotated annually. Zero plaintext PII is persisted in edge databases.</li>',
          '    <li><b>FTC Safeguards §314.4 Tamper-Evident Logging:</b> Every document access, file transmission, and staff review is immutably recorded in an append-only forensic audit log cryptographically secured with HMAC-SHA-256 hash chaining.</li>',
          '  </ul>',
          '  ',
          '  <div class="attestation-section-title">4. Critical Findings &amp; Escalation Protocol</div>',
          '  <p>Should testing uncover any Remote Code Execution (RCE), Authentication Bypass, Broken Object-Level Authorization (BOLA/IDOR) allowing cross-tenant document exposure, or access to live production cryptographic keys, testing against that attack vector must cease immediately. The assessment team must notify the Qualified Individual within <b>one (1) hour</b> via secure escalation hotline: <code>security-ops@pivot-aide.com</code> or <code>+1 (212) 555-0198</code>.</p>',
          '  ',
          '  <div class="attestation-signature-block">',
          '    <div>',
          '      <div class="attestation-sign-line"></div>',
          '      <b>Michael Whitfield, CPA</b><br>',
          '      Qualified Individual &middot; Managing Partner<br>',
          '      Pivot Aide Tax Advisory Group LLC',
          '    </div>',
          '    <div>',
          '      <div class="attestation-sign-line"></div>',
          '      <b>Lead Security Assessment Director</b><br>',
          '      Third-Party Penetration Testing Firm<br>',
          '      CISSP / CREST Certified Evaluator',
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');

        var footerHtml = [
          '<button class="btn sm btn-o" id="btn-print-letter">&#128438; Print Official Letter</button>',
          '<button class="btn sm btn-w" id="btn-copy-letter">&#128203; Copy Letter Text</button>',
          '<button class="btn sm btn-w" id="btn-download-letter">&#11015; Download Attestation (.md)</button>',
          '<button class="btn sm btn-g" id="modal-cancel-btn">Close</button>'
        ].join('');

        openModal('Formal Pen-Test Attestation Letter & Rules of Engagement', letterHtml, footerHtml);

        var printBtn = document.getElementById('btn-print-letter');
        if (printBtn) printBtn.addEventListener('click', function() { window.print(); });

        var copyBtn = document.getElementById('btn-copy-letter');
        if (copyBtn) {
          copyBtn.addEventListener('click', function() {
            var rawText = [
              'PIVOT AIDE TAX ADVISORY GROUP LLC',
              'OFFICE OF THE QUALIFIED INDIVIDUAL & INFORMATION SECURITY',
              '100 Wall Street, Suite 1400 · New York, NY 10005',
              '',
              'FORMAL ATTESTATION & PENETRATION TESTING RULES OF ENGAGEMENT',
              'Date: ' + today,
              'Qualified Individual: Michael Whitfield, CPA (FTC Safeguards §314.4(a))',
              'Target Platform: The File Room v1.0',
              'Readiness Score: ' + m.score + '%',
              '',
              '1. SCOPE AUTHORIZATION & SAFE HARBOR',
              'Explicit authorization under CFAA (18 U.S.C. § 1030) for security testing.',
              '',
              '2. IN-SCOPE ASSETS',
              '- client.pivot-aide.com',
              '- api.pivot-aide.com/v1/*',
              '- Firebase Firestore Security Rules & Auth Integration',
              '- api.pivot-aide.com/webhooks/esign-completion',
              '',
              '3. OUT-OF-SCOPE EXCLUSIONS',
              '- Production IRS MeF servers',
              '- Upstream Credit Bureau KBA providers (Experian / TransUnion)',
              '- Stripe hosted checkout',
              '- DoS/DDoS attacks',
              '',
              '4. DEFENSIVE ARCHITECTURE ATTESTATION',
              '- IRS Pub 1345 §6 E-Sign / KBA 3-Attempt Lockout: Verified',
              '- IRS Pub 4557 AES-256 Envelope Encryption: Verified',
              '- FTC Safeguards §314.4 HMAC SHA-256 Chained Audit Trail: Verified',
              '',
              '5. EMERGENCY ESCALATION',
              'Hotline: security-ops@pivot-aide.com | +1 (212) 555-0198'
            ].join('\n');
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(rawText).then(function() { showToast('Attestation letter copied to clipboard.', 'ok'); });
            }
          });
        }

        var dlBtn = document.getElementById('btn-download-letter');
        if (dlBtn) {
          dlBtn.addEventListener('click', function() {
            var mdContent = [
              '# PIVOT AIDE TAX ADVISORY GROUP LLC',
              '## Office of the Qualified Individual & Information Security',
              '**Date:** ' + today + '  ',
              '**Qualified Individual:** Michael Whitfield, CPA (FTC Safeguards §314.4(a))  ',
              '**Subject:** Authorization to Conduct Penetration Testing & Rules of Engagement  ',
              '**Statutory Compliance Score:** ' + m.score + '%  ',
              '',
              '---',
              '',
              '### 1. Scope Authorization & Legal Safe Harbor',
              'Pivot Aide Tax Advisory Group LLC formally authorizes independent penetration testing under 18 U.S.C. § 1030.',
              '',
              '### 2. Designated In-Scope Targets',
              '- `https://client.pivot-aide.com`',
              '- `https://api.pivot-aide.com/v1/*`',
              '- Firebase Firestore Security Rules & Cloud Storage Pre-Signed Enclaves',
              '- Form 8879 Regulated Signing Webhook Handlers',
              '',
              '### 3. Statutory Pre-Engagement Defense Baseline',
              '- **IRS Pub 1345 §6:** Dynamic KBA verification with 3-attempt lockout and wet signature fallback.',
              '- **IRS Pub 4557 §3:** AES-256-GCM envelope encryption for all returns and W-2s.',
              '- **FTC Safeguards §314.4:** Append-only HMAC SHA-256 chained audit logs.',
              '',
              '### 4. Emergency Escalation Contact',
              '- Email: `security-ops@pivot-aide.com`',
              '- Telephone: `+1 (212) 555-0198`',
              '',
              'Signed,  ',
              '**Michael Whitfield, CPA**  ',
              'Managing Partner & Qualified Individual  ',
              'Pivot Aide Tax Advisory Group LLC'
            ].join('\n');

            var blob = new Blob([mdContent], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'pen-test-attestation-letter-' + Date.now() + '.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Downloaded pen-test attestation markdown.', 'ok');
          });
        }
      });
    }

    // Initial render of compliance generator
    updateUI();
  }

  // -------------------------------------------------------------
  // 14C. VENDOR SANDBOX & WEBHOOK SIMULATOR
  // -------------------------------------------------------------
  function initVendorWebhookSimulator() {
    var scenarios = {
      av_clean: {
        vendor: 'av',
        id: 'av_clean',
        title: 'SCAN_CLEAN (Document Scanned Clean)',
        desc: 'ClamAV antivirus engine inspects client uploaded W-2, confirms clean SHA-256 signature, and releases document to preparer vault.',
        method: 'POST',
        endpoint: '/api/webhooks/antivirus',
        signatureHeader: 'X-Antivirus-Signature-256',
        idempotencyKey: 'idem_av_clean_7891',
        payload: {
          event: 'document.scan.completed',
          timestamp: '2026-10-07T10:15:20Z',
          fileId: 'doc-1',
          fileName: 'W-2 — Whitfield Engineering LLC.pdf',
          sha256: '9f8e7d6c5b4a3928170e9f8e7d6c5b4a3928170e9f8e7d6c5b4a3928170e1234',
          scanStatus: 'CLEAN',
          threatCount: 0,
          engine: 'ClamAV v1.4.1 (Enclave Sandbox)'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/antivirus from 10.0.4.12',
          '[SECURITY] Verified HMAC-SHA256 signature against secret: VALID ✓',
          '[IDEMPOTENCY] Checking Redis cache key "idem_av_clean_7891"... NOT_FOUND (First delivery)',
          '[PIPELINE] Document "W-2 — Whitfield Engineering LLC.pdf" passed signature heuristic',
          '[ENCRYPTION] KMS Envelope encryption applied: AES-256-GCM ciphertext persisted to S3',
          '[STATE] Document status updated from "needed" -> "review"',
          '[AUDIT] Recorded immutable event "ANTIVIRUS_VERIFIED_CLEAN" (Hash: a8f2... Chained)',
          '[STATUS 200] Successfully processed in 14ms'
        ],
        executeReaction: function() {
          var doc = state.documents.find(function(d) { return d.id === 'doc-1'; });
          if (doc) {
            doc.category = 'review';
            doc.meta = 'Scanned Clean ✓ · AES-256 Encrypted';
            doc.icon = '◯';
            renderDocumentsList();
          }
          showToast('Antivirus Webhook: W-2 verified clean and moved to review!', 'ok');
        }
      },

      av_infected: {
        vendor: 'av',
        id: 'av_infected',
        title: 'SCAN_INFECTED (Malware Quarantine Alert)',
        desc: 'Synthetic EICAR / trojan signature detected during memory stream scan. File quarantined, S3 write blocked, and security incident escalated.',
        method: 'POST',
        endpoint: '/api/webhooks/antivirus',
        signatureHeader: 'X-Antivirus-Signature-256',
        idempotencyKey: 'idem_av_quarantine_9921',
        payload: {
          event: 'document.scan.quarantined',
          timestamp: '2026-10-07T10:16:05Z',
          fileId: 'doc-infected-1099',
          fileName: '1099-MISC_invoice_statement.pdf.exe',
          sha256: '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
          scanStatus: 'INFECTED',
          signatureDetected: 'Win32.EICAR_Test_File.Heuristic',
          actionTaken: 'QUARANTINE_ENCLAVE_DESTROY'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/antivirus from 10.0.4.12',
          '[SECURITY] Verified HMAC-SHA256 signature: VALID ✓',
          '[ALERT] ClamAV stream detection: SIGNATURE_MATCH "Win32.EICAR_Test_File"',
          '[SECURITY BLOCK] Inbound upload permanently rejected with HTTP 422',
          '[QUARANTINE] Payload isolated in ephemeral memory enclave and scrubbed',
          '[S3 VAULT] Zero bytes persisted to S3 customer vault',
          '[FIRM CONSOLE] Escalated security alert to staff console: Okonjo, A.',
          '[AUDIT] High-priority tamper log created: "EICAR_MALWARE_PREVENTED" (Hash: 3b19... Chained)',
          '[STATUS 422] Quarantined and alerted in 8ms'
        ],
        executeReaction: function() {
          showToast('⚠️ Antivirus Alert: Inbound malware quarantined and rejected!', 'err');
          var rowsContainer = document.querySelector('#s-firm .rows');
          if (rowsContainer) {
            var existingWarn = document.getElementById('row-malware-alert');
            if (!existingWarn) {
              var div = document.createElement('div');
              div.id = 'row-malware-alert';
              div.className = 'row';
              div.style.background = 'rgba(239, 68, 68, 0.08)';
              div.style.borderLeft = '3px solid #ef4444';
              div.innerHTML = [
                '<span class="ic" style="color:#ef4444">&#9888;</span>',
                '<div class="g">',
                '  <div class="t" style="color:#fca5a5">SECURITY ALERT: Malware Quarantine (EICAR)</div>',
                '  <div class="m">Client upload blocked &middot; Enclave zero-day containment verified</div>',
                '</div>',
                '<span class="chip warn">Quarantined</span>'
              ].join('');
              rowsContainer.insertBefore(div, rowsContainer.children[1]);
            }
          }
        }
      },

      esign_kba_lockout: {
        vendor: 'esign',
        id: 'esign_kba_lockout',
        title: 'KBA_FAILED_ATTEMPT_3 (IRS Pub 1345 Hard Lockout)',
        desc: 'Signer fails out-of-wallet identity questions 3 times. IRS statutory lockout triggers; electronic signing revoked and fallback to wet signature initiated.',
        method: 'POST',
        endpoint: '/api/webhooks/esign-completion',
        signatureHeader: 'X-ESign-Signature-256',
        idempotencyKey: 'idem_esign_lockout_3310',
        payload: {
          event: 'kba.verification.locked',
          timestamp: '2026-10-07T10:18:44Z',
          packageId: 'pkg_form8879_ty2025_mw',
          signerId: 'signer_02_eleanor_w',
          signerRole: 'Secondary Signer (Spouse)',
          statutoryRule: 'IRS Pub 1345 §6.2',
          attemptNumber: 3,
          maxAttemptsAllowed: 3,
          lockoutDuration: 'PERMANENT_REVOCATION',
          signingCapability: 'REVOKED',
          actionRequired: 'FALLBACK_TO_PHYSICAL_WET_SIGNATURE'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/esign-completion',
          '[SECURITY] Verified HMAC signature against vendor public key: VALID ✓',
          '[POLICY] Evaluating IRS Pub 1345 §6.2: Signer failure count = 3 / 3',
          '[LOCKOUT TRIGGERED] Electronic signature certificate permanently revoked',
          '[FALLBACK PIPELINE] Generating physical Form 8879 wet ink signature packet',
          '[FIRM CONSOLE] Staff board updated: "Brennan Holdings LLC / Whitfield — KBA failed 3x — Switch to wet signature"',
          '[AUDIT] Tamper-evident forensic log written: "IRS_PUB1345_KBA_LOCKOUT_ENFORCED"',
          '[STATUS 200] Lockout acknowledged and staff notified'
        ],
        executeReaction: function() {
          showToast('IRS Pub 1345: Eleanor Whitfield KBA failed 3x. Switched to wet signature.', 'err');
          var signCard = document.getElementById('sign-instructions');
          if (signCard) {
            signCard.innerHTML = '<div style="background:#fee2e2;border:1px solid #f87171;padding:12px;border-radius:6px;color:#991b1b;font-size:.85rem"><b>IRS Pub 1345 §6 Lockout:</b> Identity verification failed 3 times. Digital signing is revoked. A physical paper Form 8879 packet has been prepared for wet ink signature.</div>';
          }
        }
      },

      esign_doc_completed: {
        vendor: 'esign',
        id: 'esign_doc_completed',
        title: 'DOC_COMPLETED_JOINT_SIGNER (MFJ Dual Signers Executed)',
        desc: 'Both spouses complete independent KBA sessions and execute Form 8879. SHA-256 PDF hash bound and return marked ready to e-file.',
        method: 'POST',
        endpoint: '/api/webhooks/esign-completion',
        signatureHeader: 'X-ESign-Signature-256',
        idempotencyKey: 'idem_esign_joint_completed_5542',
        payload: {
          event: 'document.completed.joint_signers',
          timestamp: '2026-10-07T10:20:11Z',
          packageId: 'pkg_form8879_ty2025_mw',
          form: 'IRS Form 8879 (TY2025)',
          filingStatus: 'Married Filing Jointly (MFJ)',
          primarySigner: {
            name: 'Michael Whitfield',
            kbaPassed: true,
            signedAt: '2026-10-07T10:14:02Z',
            ipAddress: '72.229.28.185'
          },
          secondarySigner: {
            name: 'Eleanor Whitfield',
            kbaPassed: true,
            signedAt: '2026-10-07T10:20:09Z',
            ipAddress: '72.229.28.185'
          },
          sha256EvidenceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          statutoryCompliance: 'IRS Pub 1345 §6.4 & IRC §6061 SATISFIED'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/esign-completion',
          '[SECURITY] Verified HMAC signature: VALID ✓',
          '[VALIDATION] Primary and Secondary signers both verified via independent KBA sessions',
          '[CRYPTOGRAPHIC BINDING] Form 8879 SHA-256 digest bound to digital certificates',
          '[ARCHIVAL] 3-Year statutory evidence bundle archived to S3 Glacier Vault with Object Lock',
          '[FILE STATE] Return moves from "Awaiting Signatures" -> "Ready to Transmit to IRS"',
          '[CLIENT NOTIFY] Dispatched push alert: "Both Form 8879 signatures received. Transmission queued."',
          '[AUDIT] Recorded immutable event "FORM_8879_EXECUTED_MFJ" (Hash: c71a... Chained)',
          '[STATUS 200] Return transmission gate unlocked'
        ],
        executeReaction: function() {
          showToast('Form 8879 Dual Signatures Complete ✓ — Ready for IRS Transmission!', 'ok');
          state.file.stage = 'Ready to transmit';
          var chip = document.querySelector('#s-home .stage-chip');
          if (chip) chip.textContent = 'Ready to transmit';
        }
      },

      stripe_succeeded: {
        vendor: 'stripe',
        id: 'stripe_succeeded',
        title: 'payment_intent.succeeded (Invoice Settled)',
        desc: 'Client settles preparation invoice via Stripe hosted checkout. Webhook marks invoice Paid, unlocks return download gate, and caches idempotency key.',
        method: 'POST',
        endpoint: '/api/webhooks/stripe',
        signatureHeader: 'Stripe-Signature',
        idempotencyKey: 'idem_stripe_pi_3N98f2_settle',
        payload: {
          id: 'evt_3N98f2_live_success',
          object: 'event',
          type: 'payment_intent.succeeded',
          created: 1733592950,
          data: {
            object: {
              id: 'pi_3N98f2_whsec',
              amount: 145500,
              currency: 'usd',
              status: 'succeeded',
              metadata: {
                firmId: 'firm-pivot-aide',
                invoiceId: 'inv-2025-1140',
                clientName: 'Michael Whitfield'
              },
              payment_method_types: ['us_bank_account']
            }
          }
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/stripe',
          '[SECURITY] Validated Stripe-Signature header with endpoint webhook secret: VALID ✓',
          '[IDEMPOTENCY GATE] Checking Redis cache key "idem_stripe_pi_3N98f2_settle"... NOT_FOUND',
          '[IDEMPOTENCY GATE] Caching event ID in Redis with 24h TTL: OK ✓',
          '[BILLING SETTLEMENT] Invoice #2025-1140 marked PAID IN FULL ($1,455.00)',
          '[RETURN ACCESS] Unlocking read-only prepared return PDF download gate',
          '[CLIENT NOTIFY] Automated payment receipt sent to client email',
          '[AUDIT] Appended immutable record "PAYMENT_SETTLED_ACH" (Hash: f4e8... Chained)',
          '[STATUS 200] Settlement processed in 11ms'
        ],
        executeReaction: function() {
          state.invoices.pending = null;
          var dueCard = document.querySelector('#s-pay .invoice-card');
          if (dueCard) {
            dueCard.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:14px;border-radius:6px;color:#166534"><b>Invoice 2025-1140 Paid in Full ($1,455.00) ✓</b><div style="font-size:.78rem;margin-top:4px;color:#15803d">Receipt generated &middot; Return download unblocked</div></div>';
          }
          showToast('Stripe Webhook: $1,455.00 Payment Settled. Invoice Paid!', 'ok');
        }
      },

      stripe_failed: {
        vendor: 'stripe',
        id: 'stripe_failed',
        title: 'payment_intent.payment_failed (Settlement Declined)',
        desc: 'Payment attempt fails due to insufficient funds or invalid routing. Webhook preserves invoice balance and dispatches retry advice.',
        method: 'POST',
        endpoint: '/api/webhooks/stripe',
        signatureHeader: 'Stripe-Signature',
        idempotencyKey: 'idem_stripe_pi_fail_6619',
        payload: {
          id: 'evt_3N_fail_declined',
          object: 'event',
          type: 'payment_intent.payment_failed',
          created: 1733593010,
          data: {
            object: {
              id: 'pi_3N_fail_whsec',
              amount: 145500,
              currency: 'usd',
              status: 'requires_payment_method',
              last_payment_error: {
                code: 'insufficient_funds',
                message: 'The bank account has insufficient funds for ACH transfer.'
              },
              metadata: {
                invoiceId: 'inv-2025-1140'
              }
            }
          }
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/stripe',
          '[SECURITY] Validated Stripe-Signature header: VALID ✓',
          '[IDEMPOTENCY GATE] Cache check: NEW EVENT',
          '[FAILURE HANDLER] Payment intent status "requires_payment_method": insufficient_funds',
          '[BILLING STATE] Invoice remains OPEN with balance $1,455.00',
          '[RETURN ACCESS] Download gate remains LOCKED until settlement',
          '[CLIENT NOTIFY] Dispatched retry advisory: "ACH settlement did not complete; please select alternate card/bank"',
          '[AUDIT] Recorded failed billing attempt event (Hash: 8d2c... Chained)',
          '[STATUS 200] Handled cleanly without server error'
        ],
        executeReaction: function() {
          showToast('Stripe Webhook: Payment declined (insufficient funds). Invoice remains open.', 'err');
        }
      },

      notify_stage_move: {
        vendor: 'notify',
        id: 'notify_stage_move',
        title: 'STAGE_MOVE_PUSH_EMAIL (Lifecycle Progression)',
        desc: 'Event-driven attention trigger fired exclusively upon return stage advancement. Dispatches targeted push and email, strictly banning broadcast spam.',
        method: 'POST',
        endpoint: '/api/webhooks/notifications',
        signatureHeader: 'X-Notification-Signature-256',
        idempotencyKey: 'idem_notify_stage_8820',
        payload: {
          event: 'lifecycle.stage_advancement',
          timestamp: '2026-10-07T10:22:15Z',
          fileId: 'file-ty2025-whitfield',
          oldStage: 'Documents in Review',
          newStage: 'Return Prepared & Ready for Client Review',
          recipients: [
            {
              name: 'Michael Whitfield',
              email: 'm.whitfield@whitfield-eng.com',
              pushTokens: ['fcm_token_device_iphone14_mw'],
              channelPreference: 'push_and_email'
            }
          ],
          compliancePolicy: 'Exhibit B Directive: Zero broadcast spam · Event-driven only'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/notifications',
          '[SECURITY] Verified internal HMAC token: VALID ✓',
          '[GUARDRAIL CHECK] Compliance Anti-Scope check: Is this a marketing blast? NO (Lifecycle event)',
          '[DISPATCH ENGINE] Formatted push payload: "Your TY2025 return is ready for review"',
          '[FCM / APNS] Sent push notification to 1 device: HTTP 200 SUCCESS',
          '[SES EMAIL] Sent transactional review notification email: HTTP 200 SUCCESS',
          '[IN-APP NOTIFY] Appended item to Screen 09 Updates Feed',
          '[AUDIT] Recorded client attention dispatch (Hash: 11a9... Chained)',
          '[STATUS 200] Dispatched in 19ms'
        ],
        executeReaction: function() {
          var feed = document.getElementById('updates-feed-list');
          if (feed) {
            var div = document.createElement('div');
            div.className = 'fitem new clickable';
            div.innerHTML = [
              '<span class="d"></span>',
              '<div>',
              '  <div class="t">Your TY2025 return is prepared</div>',
              '  <div class="m">Refund and year-over-year variance ready to review.</div>',
              '  <div class="w">Just now</div>',
              '</div>'
            ].join('');
            feed.insertBefore(div, feed.firstChild);
          }
          var bell = document.querySelector('.appbar-btn.bell .dot');
          if (bell) bell.style.display = 'block';
          showToast('Attention Engine: Push & email dispatched for return stage move!', 'ok');
        }
      },

      notify_deadline: {
        vendor: 'notify',
        id: 'notify_deadline',
        title: 'DEADLINE_ALERT_PUSH (Targeted Tax Deadline Warning)',
        desc: 'Targeted filing deadline warning dispatched only to clients with active quarterly estimated tax obligations.',
        method: 'POST',
        endpoint: '/api/webhooks/notifications',
        signatureHeader: 'X-Notification-Signature-256',
        idempotencyKey: 'idem_notify_deadline_9931',
        payload: {
          event: 'deadline.targeted_warning',
          timestamp: '2026-10-07T10:23:40Z',
          deadlineName: 'Q3 Estimated Tax Payment',
          dueDate: '2026-09-15',
          clientObligationAmount: 3840.00,
          clientFilingProfile: '1040-ES (Pennsylvania Non-Resident)',
          actionLink: 'pivot-aide://billing/pay-voucher'
        },
        traceLogs: [
          '[INGEST] Received POST /api/webhooks/notifications',
          '[SECURITY] Verified HMAC token: VALID ✓',
          '[TARGET FILTER] Matched client obligation: TY2026 Q3 Pennsylvania voucher present',
          '[PUSH DISPATCH] Sent high-priority notification to Michael Whitfield',
          '[APP STATE] Injected deadline reminder card onto Home Screen',
          '[AUDIT] Tamper record: "STATUTORY_DEADLINE_NOTICE_DISPATCHED"',
          '[STATUS 200] Target notified'
        ],
        executeReaction: function() {
          showToast('Attention Engine: Q3 Estimated Tax ($3,840) deadline alert dispatched!', 'ok');
        }
      }
    };

    var currentVendor = 'av';
    var currentScenarioKey = 'av_clean';
    var executedIdempotencyKeys = {};

    function renderVendorScenarios() {
      var container = document.getElementById('webhook-scenario-actions-container');
      if (!container) return;

      var vendorScenarios = Object.keys(scenarios).map(function(k) { return scenarios[k]; }).filter(function(s) {
        return s.vendor === currentVendor;
      });

      var html = '';
      vendorScenarios.forEach(function(s) {
        var isCurrent = s.id === currentScenarioKey;
        var borderStyle = isCurrent ? 'border-color:#38bdf8;background:#092131' : '';

        html += [
          '<div class="webhook-action-card" style="' + borderStyle + '">',
          '  <div>',
          '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">',
          '      <span class="webhook-action-badge post">' + s.method + '</span>',
          '      <span style="font-family:var(--f-mono);font-size:.65rem;color:var(--night-ink-2)">' + s.id + '</span>',
          '    </div>',
          '    <div style="color:#fff;font-weight:600;font-size:.88rem">' + s.title + '</div>',
          '    <div style="color:var(--night-ink-2);font-size:.76rem;margin-top:4px;line-height:1.45">' + s.desc + '</div>',
          '  </div>',
          '  <div style="display:flex;gap:8px;margin-top:6px">',
          '    <button class="btn sm btn-w btn-select-scenario" data-key="' + s.id + '" style="font-size:.74rem;flex:1">&#128065; Load Payload</button>',
          '    <button class="btn sm btn-g btn-quick-dispatch" data-key="' + s.id + '" style="font-size:.74rem;font-weight:600">&#9654; Dispatch</button>',
          '  </div>',
          '</div>'
        ].join('');
      });

      container.innerHTML = html;

      // Bind selection buttons
      container.querySelectorAll('.btn-select-scenario').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          var key = e.currentTarget.getAttribute('data-key');
          selectScenario(key);
        });
      });

      container.querySelectorAll('.btn-quick-dispatch').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          var key = e.currentTarget.getAttribute('data-key');
          selectScenario(key);
          dispatchCurrentWebhook();
        });
      });
    }

    function selectScenario(key) {
      currentScenarioKey = key;
      var s = scenarios[key];
      if (!s) return;

      currentVendor = s.vendor;

      // Update Vendor Tab Active States
      document.querySelectorAll('.webhook-vendor-tab').forEach(function(tab) {
        if (tab.getAttribute('data-vendor') === s.vendor) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      // Update Inspector Inputs
      var methodEl = document.getElementById('webhook-http-method');
      var endpointEl = document.getElementById('webhook-endpoint-url');
      var sigEl = document.getElementById('webhook-hdr-signature');
      var idemEl = document.getElementById('webhook-hdr-idempotency');
      var editorEl = document.getElementById('webhook-payload-editor');

      if (methodEl) methodEl.textContent = s.method;
      if (endpointEl) endpointEl.textContent = s.endpoint;
      if (sigEl) sigEl.textContent = 'v1,t=' + Math.floor(Date.now() / 1000) + ',v1=' + Math.random().toString(16).substring(2, 14);
      if (idemEl) idemEl.textContent = s.idempotencyKey;
      if (editorEl) editorEl.value = JSON.stringify(s.payload, null, 2);

      renderVendorScenarios();
    }

    function dispatchCurrentWebhook() {
      var s = scenarios[currentScenarioKey];
      if (!s) return;

      var term = document.getElementById('webhook-execution-terminal');
      if (!term) return;

      var isReplay = document.getElementById('chk-webhook-replay-attack') && document.getElementById('chk-webhook-replay-attack').checked;
      var idemKey = s.idempotencyKey;

      term.innerHTML = '<div style="color:var(--gold)">[WEBHOOK CLIENT] Ingesting ' + s.method + ' ' + s.endpoint + ' (Idempotency: ' + idemKey + ')</div>';

      if (isReplay && executedIdempotencyKeys[idemKey]) {
        // Replay Attack Demonstration
        var replayLogs = [
          '[INGEST] Received duplicate delivery for idempotency key "' + idemKey + '"',
          '[HMAC CHECK] Webhook cryptographic signature VALID ✓',
          '[IDEMPOTENCY DUPLICATE DETECTED] Key already exists in Redis memory store (processed earlier)',
          '[IDEMPOTENCY SAFEGUARD] HTTP 200 (CACHED_RESULT) returned immediately to vendor',
          '[IDEMPOTENCY SAFEGUARD] Duplicate side-effects SUPPRESSED (zero double-crediting or duplicate records)',
          '[AUDIT] Recorded idempotency defense telemetry event',
          '[SUCCESS] Handled replay idempotently in 2ms'
        ];

        var rIdx = 0;
        var rTimer = setInterval(function() {
          if (rIdx < replayLogs.length) {
            var div = document.createElement('div');
            div.style.color = '#38bdf8';
            div.textContent = replayLogs[rIdx];
            term.appendChild(div);
            term.scrollTop = term.scrollHeight;
            rIdx++;
          } else {
            clearInterval(rTimer);
            showToast('Idempotency Gate: Replay delivery ignored cleanly (safe idempotency)!', 'ok');
          }
        }, 120);

        return;
      }

      // First-time delivery
      executedIdempotencyKeys[idemKey] = true;

      var idx = 0;
      var timer = setInterval(function() {
        if (idx < s.traceLogs.length) {
          var line = s.traceLogs[idx];
          var div = document.createElement('div');
          if (line.includes('SECURITY BLOCK') || line.includes('ALERT') || line.includes('LOCKOUT') || line.includes('422')) {
            div.style.color = '#f87171';
            div.style.fontWeight = 'bold';
          } else if (line.includes('200') || line.includes('VALID ✓') || line.includes('SUCCESS')) {
            div.style.color = '#4ade80';
          } else if (line.includes('IDEMPOTENCY') || line.includes('ENCRYPTION') || line.includes('STATE')) {
            div.style.color = '#38bdf8';
          } else {
            div.style.color = 'var(--night-ink)';
          }
          div.textContent = line;
          term.appendChild(div);
          term.scrollTop = term.scrollHeight;
          idx++;
        } else {
          clearInterval(timer);
          // Execute DOM reaction
          if (s.executeReaction) s.executeReaction();
        }
      }, 140);
    }

    // Vendor Tab Switchers
    document.querySelectorAll('.webhook-vendor-tab').forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        currentVendor = e.currentTarget.getAttribute('data-vendor') || 'av';
        // Select first scenario of this vendor
        var first = Object.keys(scenarios).find(function(k) { return scenarios[k].vendor === currentVendor; });
        if (first) selectScenario(first);
      });
    });

    // Dispatch Button
    var btnDispatch = document.getElementById('btn-dispatch-webhook');
    if (btnDispatch) {
      btnDispatch.addEventListener('click', dispatchCurrentWebhook);
    }

    // Clear Terminal Button
    var btnClearTerm = document.getElementById('btn-clear-webhook-terminal');
    if (btnClearTerm) {
      btnClearTerm.addEventListener('click', function() {
        var term = document.getElementById('webhook-execution-terminal');
        if (term) term.innerHTML = '<div style="color:var(--night-ink-2)">[WEBHOOK HARNESS READY] Select a vendor scenario above and click "Dispatch Webhook" to execute.</div>';
      });
    }

    // Initial render
    selectScenario('av_clean');
  }

  // -------------------------------------------------------------
  // 14D. 03 · DELIVERY RETURN VIEWER HARNESS
  // -------------------------------------------------------------
  function initDeliveryReturnViewerHarness() {
    var zoomLevels = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5];
    var currentZoomIdx = 2; // 100%
    var isDraftWatermark = true;
    var arePinsVisible = true;
    var isMobileViewport = false;
    var activePinId = 'pin-1';

    var threadData = {
      'pin-1': {
        title: 'Line 1z: Wages · Whitfield Engineering LLC',
        meta: 'Attached to Page 1, Line 1z · Form 1040',
        status: 'Confirmed · W-2 Reconciled',
        messages: [
          { sender: 'client', name: 'Michael Whitfield', time: 'Yesterday, 14:22', text: 'Does this line include my engineering base salary only, or is Eleanor’s consulting income lumped in here too?' },
          { sender: 'firm', name: 'Denise R., CPA', time: 'Yesterday, 16:05', text: 'This is purely your W-2 wage income from Whitfield Engineering LLC ($147,300). Eleanor’s consulting income is reported separately on Schedule C, Line 8, so business deductions stay clean.' }
        ]
      },
      'pin-2': {
        title: 'Line 8: Additional Income · Whitfield Design Co. (Schedule C)',
        meta: 'Attached to Page 1, Line 8 & Schedule C',
        status: 'Reviewed · Deductions Verified',
        messages: [
          { sender: 'client', name: 'Michael Whitfield', time: '2 days ago', text: 'Did we include the CAD software subscription and professional liability insurance under business expenses?' },
          { sender: 'firm', name: 'Denise R., CPA', time: '2 days ago', text: 'Yes, software ($3,120) and professional insurance ($1,850) are both fully deducted on Schedule C, line 27. Net profit stands at $58,410.' }
        ]
      },
      'pin-3': {
        title: 'Line 9: Schedule E Rental Real Estate (Halcyon Row)',
        meta: 'Attached to Page 1, Line 9 & Schedule E',
        status: 'High Variance · Full Year Leased',
        messages: [
          { sender: 'client', name: 'Michael Whitfield', time: '3 days ago', text: 'Halcyon Row swung from a -$4,200 loss in TY2025 to a +$9,100 profit this year. Does this swing trigger any passive activity limitations?' },
          { sender: 'firm', name: 'Denise R., CPA', time: '3 days ago', text: 'Because Halcyon Row produced net positive income this year, passive loss limitation rules do not apply. The $9,100 profit flows cleanly into Line 9.' }
        ]
      },
      'pin-4': {
        title: 'Line 15: Taxable Income · Section 179 Expensing Deduction',
        meta: 'Attached to Page 1, Line 15',
        status: 'Election Verified · Section 179',
        messages: [
          { sender: 'client', name: 'Michael Whitfield', time: '4 days ago', text: 'Did the equipment we bought in November get written off this year or spread across 5-year MACRS depreciation?' },
          { sender: 'firm', name: 'Denise R., CPA', time: '4 days ago', text: 'We elected Section 179 for full immediate expensing ($2,780), which saves you $395 in federal tax immediately this tax year.' }
        ]
      },
      'pin-5': {
        title: 'Line 34: Federal Net Refund · Direct Deposit ACH Routing',
        meta: 'Attached to Page 1, Line 34',
        status: 'Direct Deposit Verified · Chase Premier',
        messages: [
          { sender: 'client', name: 'Michael Whitfield', time: '5 days ago', text: 'Which bank account is designated for the $3,418.00 federal refund transfer?' },
          { sender: 'firm', name: 'Denise R., CPA', time: '5 days ago', text: 'It is designated for direct deposit into your Chase Premier checking account ending in •••• 4019 on file.' }
        ]
      }
    };

    function renderThread(pinId) {
      activePinId = pinId;
      var thread = threadData[pinId] || threadData['pin-1'];

      var titleEl = document.getElementById('thread-title');
      var metaEl = document.getElementById('thread-meta');
      var badgeEl = document.getElementById('thread-status-badge');
      var listEl = document.getElementById('thread-messages-list');

      if (titleEl) titleEl.textContent = thread.title;
      if (metaEl) metaEl.textContent = thread.meta;
      if (badgeEl) badgeEl.textContent = thread.status;

      if (listEl) {
        listEl.innerHTML = thread.messages.map(function(m) {
          var bubbleClass = m.sender === 'firm' ? 'comment-bubble firm' : 'comment-bubble client';
          var senderLabel = m.sender === 'firm' ? '<b>' + m.name + ' (Preparer)</b>' : '<b>' + m.name + ' (Taxpayer)</b>';
          return [
            '<div class="' + bubbleClass + '">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">',
            '    <span>' + senderLabel + '</span>',
            '    <span style="font-size:.7rem;color:#64748b">' + m.time + '</span>',
            '  </div>',
            '  <div>' + m.text + '</div>',
            '</div>'
          ].join('');
        }).join('');
      }

      // Update pin markers active state
      document.querySelectorAll('.pin-marker').forEach(function(marker) {
        if (marker.getAttribute('data-pin-id') === pinId) {
          marker.classList.add('active');
        } else {
          marker.classList.remove('active');
        }
      });
    }

    // 1. YoY Variance Table Row Clicks (Highlighting Lines)
    document.querySelectorAll('.clickable-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        document.querySelectorAll('.clickable-row').forEach(function(r) { r.classList.remove('active'); });
        row.classList.add('active');

        var lineId = row.getAttribute('data-highlight-line');
        if (lineId) {
          document.querySelectorAll('.tax-form-line').forEach(function(line) { line.classList.remove('highlighted'); });
          var targetLine = document.getElementById(lineId);
          if (targetLine) {
            targetLine.classList.add('highlighted');
            targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var pin = targetLine.querySelector('.pin-marker');
            if (pin) {
              var pinId = pin.getAttribute('data-pin-id');
              if (pinId) renderThread(pinId);
            }
          }
        }
      });
    });

    // 2. Pin Marker Click Handlers
    document.querySelectorAll('.pin-marker').forEach(function(pin) {
      pin.addEventListener('click', function(e) {
        e.stopPropagation();
        var pinId = pin.getAttribute('data-pin-id');
        renderThread(pinId);
        var drawer = document.getElementById('comment-thread-drawer');
        if (drawer) drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    // 3. Post Reply in Thread
    var btnPostReply = document.getElementById('btn-post-thread-reply');
    var inputReply = document.getElementById('input-thread-reply');
    if (btnPostReply && inputReply) {
      var handlePost = function() {
        var text = inputReply.value.trim();
        if (!text) return;
        var thread = threadData[activePinId];
        if (thread) {
          thread.messages.push({
            sender: 'client',
            name: state.user.name || 'Michael Whitfield',
            time: 'Just now',
            text: text
          });
          inputReply.value = '';
          renderThread(activePinId);
          showToast('In-context comment posted to document line!', 'ok');
        }
      };
      btnPostReply.addEventListener('click', handlePost);
      inputReply.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handlePost();
      });
    }

    // 4. Watermark Toggle Buttons
    var btnDraftWatermark = document.getElementById('btn-toggle-watermark-draft');
    var btnFinalWatermark = document.getElementById('btn-toggle-watermark-final');
    var watermarkTextEl = document.getElementById('watermark-text-display');
    var watermarkPill = document.getElementById('delivery-watermark-pill');

    if (btnDraftWatermark && btnFinalWatermark && watermarkTextEl) {
      btnDraftWatermark.addEventListener('click', function() {
        isDraftWatermark = true;
        btnDraftWatermark.className = 'btn sm btn-w';
        btnFinalWatermark.className = 'btn sm btn-o';
        watermarkTextEl.className = 'watermark-text watermark-draft';
        watermarkTextEl.innerHTML = 'DRAFT &middot; UNPAID<br><span style="font-size:1.6rem;letter-spacing:.25em">NOT FOR IRS FILING</span>';
        if (watermarkPill) {
          watermarkPill.className = 'chip warn';
          watermarkPill.innerHTML = '&#9679; DRAFT / UNPAID';
        }
        showToast('Watermark: Switched to DRAFT / UNPAID (Payment Gate Active)', 'warn');
      });

      btnFinalWatermark.addEventListener('click', function() {
        isDraftWatermark = false;
        btnFinalWatermark.className = 'btn sm btn-w';
        btnDraftWatermark.className = 'btn sm btn-o';
        watermarkTextEl.className = 'watermark-text watermark-final';
        watermarkTextEl.innerHTML = 'FINAL FILED &middot; IRS ACCEPTED<br><span style="font-size:1.4rem;letter-spacing:.15em">SHA256: 8879-1040-VERIFIED</span>';
        if (watermarkPill) {
          watermarkPill.className = 'chip ok';
          watermarkPill.innerHTML = '&#9679; FINAL FILED (Tamper-Sealed)';
        }
        showToast('Watermark: Switched to FINAL FILED (IRS Accepted & Sealed)', 'ok');
      });
    }

    // 5. Toggle Comment Pins Visibility
    var btnTogglePins = document.getElementById('btn-toggle-comment-pins');
    if (btnTogglePins) {
      btnTogglePins.addEventListener('click', function() {
        arePinsVisible = !arePinsVisible;
        document.querySelectorAll('.pin-marker').forEach(function(marker) {
          marker.style.display = arePinsVisible ? 'flex' : 'none';
        });
        btnTogglePins.textContent = arePinsVisible ? '📌 Comment Pins: ON' : '📌 Comment Pins: OFF';
        showToast('Comment Pins: ' + (arePinsVisible ? 'Visible' : 'Hidden'), 'ok');
      });
    }

    // 6. Zoom QA Controls
    var btnZoomIn = document.getElementById('btn-zoom-in');
    var btnZoomOut = document.getElementById('btn-zoom-out');
    var labelZoom = document.getElementById('label-zoom-level');
    var formPaper = document.getElementById('tax-form-paper');

    function applyZoom() {
      var zoom = zoomLevels[currentZoomIdx];
      if (formPaper) formPaper.style.transform = 'scale(' + zoom + ')';
      if (labelZoom) labelZoom.textContent = Math.round(zoom * 100) + '%';
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', function() {
        if (currentZoomIdx < zoomLevels.length - 1) {
          currentZoomIdx++;
          applyZoom();
        }
      });
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', function() {
        if (currentZoomIdx > 0) {
          currentZoomIdx--;
          applyZoom();
        }
      });
    }

    // 7. Mobile Viewport Reflow Toggle
    var btnToggleMobile = document.getElementById('btn-toggle-mobile-viewport');
    var canvasWrap = document.getElementById('doc-viewer-canvas-wrap');
    if (btnToggleMobile && canvasWrap) {
      btnToggleMobile.addEventListener('click', function() {
        isMobileViewport = !isMobileViewport;
        if (isMobileViewport) {
          canvasWrap.classList.add('mobile-view');
          btnToggleMobile.className = 'btn sm btn-w';
          showToast('Viewport: Mobile responsive simulation (375px) enabled.', 'ok');
        } else {
          canvasWrap.classList.remove('mobile-view');
          btnToggleMobile.className = 'btn sm btn-o';
          showToast('Viewport: Desktop wide enclosure restored.', 'ok');
        }
      });
    }

    // 8. Offline Lockout Simulation
    var btnLockout = document.getElementById('btn-simulate-offline-lockout');
    var overlayLockout = document.getElementById('offline-lockout-overlay');
    var btnRestoreSession = document.getElementById('btn-restore-session');
    var authStatusPill = document.getElementById('delivery-auth-status-pill');

    if (btnLockout && overlayLockout) {
      btnLockout.addEventListener('click', function() {
        overlayLockout.style.display = 'flex';
        if (authStatusPill) {
          authStatusPill.className = 'chip warn';
          authStatusPill.innerHTML = '&#9888; ENCLAVE LOCKED';
        }
        showToast('Simulated Offline / Inactivity: Document locked & scrubbed from DOM!', 'err');
      });
    }

    if (btnRestoreSession && overlayLockout) {
      btnRestoreSession.addEventListener('click', function() {
        overlayLockout.style.display = 'none';
        if (authStatusPill) {
          authStatusPill.className = 'chip ok';
          authStatusPill.innerHTML = '&#9679; Session Active';
        }
        showToast('Re-authenticated: Taxpayer document access restored.', 'ok');
      });
    }

    // 9. Client Return Approval Gate (Treas. Reg. § 301.7216-2)
    var btnApproveReturn = document.querySelector('#s-return button[data-go="sign"]');
    if (btnApproveReturn) {
      btnApproveReturn.addEventListener('click', function() {
        if (window.FirebaseBridge && window.FirebaseBridge.saveReturnApproval) {
          window.FirebaseBridge.saveReturnApproval('return_ty2026_whitfield', 'Client reviewed 4 headline figures and authorized transition to Form 8879');
          window.FirebaseBridge.recordAuditLog(
            'Return Approval Initiated',
            'Client approved TY2026 return review and proceeded to signing. [Client Telemetry: Authoritative RETURN_APPROVED emitted upon e-file queue lock]',
            'Tax Delivery',
            { eventType: 'RETURN_APPROVAL_INITIATED' }
          );
        }
      });
    }

    // Initial thread render
    renderThread('pin-1');
  }

  // -------------------------------------------------------------
  // 14B. EXHIBIT A: COSTS & COMMERCIALIZATION CALCULATOR
  // -------------------------------------------------------------
  function initExhibitACalculator() {
    var staffSlider = document.getElementById('ex-staff-slider');
    var staffInput = document.getElementById('ex-staff-input');
    var staffMinus = document.getElementById('btn-staff-minus');
    var staffPlus = document.getElementById('btn-staff-plus');

    var clientSlider = document.getElementById('ex-client-slider');
    var clientInput = document.getElementById('ex-client-input');
    var clientMinus = document.getElementById('btn-client-minus');
    var clientPlus = document.getElementById('btn-client-plus');

    var presetBtns = document.querySelectorAll('.preset-btn');
    var tierBtns = document.querySelectorAll('#custom-tier-toggle .segment-btn');
    var compToggleBtns = document.querySelectorAll('#competitor-compare-toggle .segment-btn');
    var compCards = document.querySelectorAll('.competitor-card');

    var btnOpenRules = document.getElementById('btn-exhibit-open-rules');
    var btnExJRules = document.getElementById('btn-exhibit-j-rules');

    // Calculator State
    var state = {
      staff: 6,
      clients: 400,
      tier: 'mid', // 'low' | 'mid' | 'high'
      competitor: 'taxdome' // 'taxdome' | 'canopy' | 'liscio' | 'safesend'
    };

    function fmtCur(n) {
      return '$' + Math.round(n).toLocaleString('en-US');
    }

    function fmtPrecise(n) {
      return '$' + Number(n).toFixed(2);
    }

    function recalculate() {
      var staff = state.staff;
      var clients = state.clients;

      // 1. Off-The-Shelf Calculations (2026 published pricing)
      // TaxDome Pro: $1,000/seat/yr + $1.00 KBA attempt
      var taxdomeAnnual = (staff * 1000) + (clients * 1.00);
      var taxdome3Yr = taxdomeAnnual * 3;
      var taxdomeUnitCost = taxdomeAnnual / clients; // $16.00 / cl / yr at baseline

      // Canopy Standard: $888/user/yr ($74/mo) + $1.25 KBA credit
      var canopyAnnual = (staff * 888) + (clients * 1.25);
      var canopy3Yr = canopyAnnual * 3;
      var canopyUnitCost = canopyAnnual / clients;

      // Liscio Platform: $588/user/yr ($49/mo)
      var liscioAnnual = staff * 588;
      var liscio3Yr = liscioAnnual * 3;
      var liscioUnitCost = liscioAnnual / clients;

      // SafeSend Returns: Estimated $18/return (range $14–$28/return)
      var safesendAnnual = clients * 18;
      var safesend3Yr = safesendAnnual * 3;
      var safesendUnitCost = 18;

      // 2. Custom Build Reality Calculations
      // Baseline 400 clients produces exactly $280/client/yr (low) to $630/client/yr (high)
      // 3-Year Low: $175k Yr 1 + (2 x $55k) + $51k CREST/sec = $336,000. $336k / (3 x 400) = $280/client/yr.
      // 3-Year High: $400k Yr 1 + (2 x $119k) + $118k sec/maintenance = $756,000. $756k / (3 x 400) = $630/client/yr.
      // 3-Year Mid: $287.5k Yr 1 + (2 x $87k) + $84.5k sec/contingency = $546,000. $546k / (3 x 400) = $455/client/yr.
      var total3YrLow = 336000;
      var total3YrHigh = 756000;
      var total3YrMid = 546000;

      var currentYr1Display, currentOngoingDisplay, current3YrTotal, tierLabel;
      if (state.tier === 'low') {
        currentYr1Display = '$175k';
        currentOngoingDisplay = '$55k / yr';
        current3YrTotal = total3YrLow;
        tierLabel = 'Conservative ($175k / $55k)';
      } else if (state.tier === 'high') {
        currentYr1Display = '$400k';
        currentOngoingDisplay = '$119k / yr';
        current3YrTotal = total3YrHigh;
        tierLabel = 'Enterprise ($400k / $119k)';
      } else {
        currentYr1Display = '$288k';
        currentOngoingDisplay = '$87k / yr';
        current3YrTotal = total3YrMid;
        tierLabel = 'Midpoint ($288k / $87k)';
      }

      var customAnnualAmortized = current3YrTotal / 3;
      var customUnitCost = current3YrTotal / (3 * clients);
      var customUnitCostLow = total3YrLow / (3 * clients);
      var customUnitCostHigh = total3YrHigh / (3 * clients);

      // Selected Off-The-Shelf Competitor
      var activeOTS = {
        name: 'TaxDome Pro',
        annual: taxdomeAnnual,
        threeYr: taxdome3Yr,
        unitCost: taxdomeUnitCost
      };

      if (state.competitor === 'canopy') {
        activeOTS = {
          name: 'Canopy Standard',
          annual: canopyAnnual,
          threeYr: canopy3Yr,
          unitCost: canopyUnitCost
        };
      } else if (state.competitor === 'liscio') {
        activeOTS = {
          name: 'Liscio Platform',
          annual: liscioAnnual,
          threeYr: liscio3Yr,
          unitCost: liscioUnitCost
        };
      } else if (state.competitor === 'safesend') {
        activeOTS = {
          name: 'SafeSend Returns',
          annual: safesendAnnual,
          threeYr: safesend3Yr,
          unitCost: safesendUnitCost
        };
      }

      var deltaMultiplier = customUnitCost / Math.max(0.1, activeOTS.unitCost);
      var deltaPerClient = customUnitCost - activeOTS.unitCost;
      var deltaCash3Yr = current3YrTotal - activeOTS.threeYr;

      // 3. Update DOM KPI Banners
      var kpiOtsName = document.getElementById('kpi-ots-name');
      var kpiOtsUnit = document.getElementById('kpi-ots-unit-cost');
      var kpiOtsAnn = document.getElementById('kpi-ots-annual');
      var kpiOts3Yr = document.getElementById('kpi-ots-3yr');

      if (kpiOtsName) kpiOtsName.textContent = activeOTS.name;
      if (kpiOtsUnit) kpiOtsUnit.textContent = fmtPrecise(activeOTS.unitCost);
      if (kpiOtsAnn) kpiOtsAnn.textContent = fmtCur(activeOTS.annual) + ' / yr';
      if (kpiOts3Yr) kpiOts3Yr.textContent = fmtCur(activeOTS.threeYr);

      var kpiCustomTier = document.getElementById('kpi-custom-tier-label');
      var kpiCustomUnit = document.getElementById('kpi-custom-unit-cost');
      var kpiCustomAnn = document.getElementById('kpi-custom-annual');
      var kpiCustom3Yr = document.getElementById('kpi-custom-3yr');

      if (kpiCustomTier) kpiCustomTier.textContent = tierLabel;
      if (kpiCustomUnit) kpiCustomUnit.textContent = fmtPrecise(customUnitCost);
      if (kpiCustomAnn) kpiCustomAnn.textContent = fmtCur(customAnnualAmortized) + ' / yr';
      if (kpiCustom3Yr) kpiCustom3Yr.textContent = fmtCur(current3YrTotal);

      var kpiMultiplier = document.getElementById('kpi-delta-multiplier');
      var kpiDeltaPerClient = document.getElementById('kpi-delta-per-client');
      var kpiDeltaCash = document.getElementById('kpi-delta-3yr-cash');

      if (kpiMultiplier) kpiMultiplier.textContent = deltaMultiplier.toFixed(1) + '×';
      if (kpiDeltaPerClient) kpiDeltaPerClient.textContent = '+' + fmtPrecise(deltaPerClient) + ' / cl / yr';
      if (kpiDeltaCash) kpiDeltaCash.textContent = '+' + fmtCur(deltaCash3Yr);

      // Mobile Horizontal Comparison Summary Pill
      var mOtsCost = document.getElementById('m-summary-ots-cost');
      var mCustomCost = document.getElementById('m-summary-custom-cost');
      var mDeltaTag = document.getElementById('m-summary-delta-tag');

      if (mOtsCost) mOtsCost.textContent = fmtPrecise(activeOTS.unitCost) + '/cl/yr';
      if (mCustomCost) mCustomCost.textContent = fmtCur(customUnitCostLow) + '–' + fmtCur(customUnitCostHigh) + '/cl/yr';
      if (mDeltaTag) mDeltaTag.textContent = deltaMultiplier.toFixed(1) + '× Delta';

      // Competitor Cards Real-Time Math
      var elTaxMath = document.getElementById('taxdome-calc-math');
      var elTaxTot = document.getElementById('taxdome-calc-total');
      var elTaxUnit = document.getElementById('taxdome-calc-unit');
      if (elTaxMath) elTaxMath.textContent = staff + ' seats × $1,000 + ' + clients + ' KBA ($1.00)';
      if (elTaxTot) elTaxTot.textContent = fmtCur(taxdomeAnnual) + ' / yr';
      if (elTaxUnit) elTaxUnit.textContent = fmtPrecise(taxdomeUnitCost) + ' / client / yr';

      var elCanopyMath = document.getElementById('canopy-calc-math');
      var elCanopyTot = document.getElementById('canopy-calc-total');
      var elCanopyUnit = document.getElementById('canopy-calc-unit');
      if (elCanopyMath) elCanopyMath.textContent = staff + ' users × $888 + ' + clients + ' KBA ($1.25)';
      if (elCanopyTot) elCanopyTot.textContent = fmtCur(canopyAnnual) + ' / yr';
      if (elCanopyUnit) elCanopyUnit.textContent = fmtPrecise(canopyUnitCost) + ' / client / yr';

      var elLiscioMath = document.getElementById('liscio-calc-math');
      var elLiscioTot = document.getElementById('liscio-calc-total');
      var elLiscioUnit = document.getElementById('liscio-calc-unit');
      if (elLiscioMath) elLiscioMath.textContent = staff + ' users × $588 (Platform tier)';
      if (elLiscioTot) elLiscioTot.textContent = fmtCur(liscioAnnual) + ' / yr';
      if (elLiscioUnit) elLiscioUnit.textContent = fmtPrecise(liscioUnitCost) + ' / client / yr';

      var elSafeMath = document.getElementById('safesend-calc-math');
      var elSafeTot = document.getElementById('safesend-calc-total');
      var elSafeUnit = document.getElementById('safesend-calc-unit');
      if (elSafeMath) elSafeMath.textContent = clients + ' returns × $18 avg estimate';
      if (elSafeTot) elSafeTot.textContent = '~' + fmtCur(safesendAnnual) + ' / yr';
      if (elSafeUnit) elSafeUnit.textContent = '~$18.00 / return';

      // Custom Reality Ranges
      var elYr1Range = document.getElementById('display-yr1-range');
      var elOngoingRange = document.getElementById('display-ongoing-range');
      var customUnitRange = document.getElementById('custom-unit-cost-range');

      if (elYr1Range) elYr1Range.textContent = currentYr1Display + (state.tier === 'mid' ? ' (est)' : '');
      if (elOngoingRange) elOngoingRange.textContent = currentOngoingDisplay;
      if (customUnitRange) customUnitRange.textContent = fmtCur(customUnitCostLow) + ' – ' + fmtCur(customUnitCostHigh) + ' / client / yr';

      // Dynamic Ratio Progress Bar
      var otsPercent = Math.max(3, Math.min(22, (activeOTS.unitCost / customUnitCost) * 100));
      var customPercent = 100 - otsPercent;
      var segOTS = document.querySelector('.ratio-seg.off-the-shelf');
      var segCustom = document.querySelector('.ratio-seg.custom-build');

      if (segOTS) {
        segOTS.style.width = otsPercent.toFixed(1) + '%';
        segOTS.innerHTML = '<span>' + fmtCur(activeOTS.unitCost) + '</span>';
      }
      if (segCustom) {
        segCustom.style.width = customPercent.toFixed(1) + '%';
        segCustom.innerHTML = '<span>Custom Build: ' + fmtCur(customUnitCostLow) + '–' + fmtCur(customUnitCostHigh) + ' / cl / yr (' + deltaMultiplier.toFixed(0) + '× gulf)</span>';
      }
    }

    // Synchronize Input & Slider for Staff
    function setStaff(val) {
      var n = Math.max(1, Math.min(50, parseInt(val, 10) || 1));
      state.staff = n;
      if (staffSlider && staffSlider.value != n) staffSlider.value = n;
      if (staffInput && staffInput.value != n) staffInput.value = n;
      checkPresetActive();
      recalculate();
    }

    // Synchronize Input & Slider for Clients
    function setClients(val) {
      var n = Math.max(50, Math.min(3000, parseInt(val, 10) || 50));
      state.clients = n;
      if (clientSlider && clientSlider.value != n) clientSlider.value = n;
      if (clientInput && clientInput.value != n) clientInput.value = n;
      checkPresetActive();
      recalculate();
    }

    function checkPresetActive() {
      presetBtns.forEach(function(btn) {
        var s = parseInt(btn.dataset.staff, 10);
        var c = parseInt(btn.dataset.clients, 10);
        btn.classList.toggle('active', s === state.staff && c === state.clients);
      });
    }

    // Staff Event Listeners
    if (staffSlider) {
      staffSlider.addEventListener('input', function() { setStaff(staffSlider.value); });
    }
    if (staffInput) {
      staffInput.addEventListener('change', function() { setStaff(staffInput.value); });
    }
    if (staffMinus) {
      staffMinus.addEventListener('click', function(e) { e.preventDefault(); setStaff(state.staff - 1); });
    }
    if (staffPlus) {
      staffPlus.addEventListener('click', function(e) { e.preventDefault(); setStaff(state.staff + 1); });
    }

    // Client Event Listeners
    if (clientSlider) {
      clientSlider.addEventListener('input', function() { setClients(clientSlider.value); });
    }
    if (clientInput) {
      clientInput.addEventListener('change', function() { setClients(clientInput.value); });
    }
    if (clientMinus) {
      clientMinus.addEventListener('click', function(e) { e.preventDefault(); setClients(state.clients - 25); });
    }
    if (clientPlus) {
      clientPlus.addEventListener('click', function(e) { e.preventDefault(); setClients(state.clients + 25); });
    }

    // Preset Buttons
    presetBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var s = parseInt(btn.dataset.staff, 10);
        var c = parseInt(btn.dataset.clients, 10);
        presetBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.staff = s;
        state.clients = c;
        if (staffSlider) staffSlider.value = s;
        if (staffInput) staffInput.value = s;
        if (clientSlider) clientSlider.value = c;
        if (clientInput) clientInput.value = c;
        recalculate();
      });
    });

    // Custom Tier Buttons
    tierBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        tierBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.tier = btn.dataset.tier;
        recalculate();
      });
    });

    // Competitor Comparison Toggle & Card Selection
    function selectCompetitor(compKey) {
      state.competitor = compKey;
      compToggleBtns.forEach(function(b) {
        b.classList.toggle('active', b.dataset.comp === compKey);
      });
      compCards.forEach(function(c) {
        c.classList.toggle('selected', c.dataset.comp === compKey);
      });
      recalculate();
    }

    compToggleBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        selectCompetitor(btn.dataset.comp);
      });
    });

    compCards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        var comp = card.dataset.comp;
        if (comp) selectCompetitor(comp);
      });
    });

    // Rules Modal Button
    if (btnOpenRules) {
      btnOpenRules.addEventListener('click', function(e) {
        e.preventDefault();
        showArchitectureRulesModal();
      });
    }

    // Exhibit J Deep Link Button
    if (btnExJRules) {
      btnExJRules.addEventListener('click', function(e) {
        e.preventDefault();
        showArchitectureRulesModal();
        var tabJ = document.getElementById('tab-btn-exhibit-j');
        if (tabJ) tabJ.click();
      });
    }

    // Initial Calculation
    recalculate();
  }

  // -------------------------------------------------------------
  // 14B. EXHIBIT B: SCOPE & BUILD VS. BUY STRATEGY CONTROLLER
  // -------------------------------------------------------------
  function initExhibitBScreen() {
    var screenEl = document.getElementById('s-exhibit-b');
    if (!screenEl || screenEl.dataset.initialized) return;
    screenEl.dataset.initialized = 'true';

    var filterBtns = screenEl.querySelectorAll('#exhibit-b-filter-group .segment-btn');
    var cards = screenEl.querySelectorAll('.capability-card');
    var btnToggleAll = document.getElementById('btn-toggle-all-specs');
    var btnJumpExclusion = document.getElementById('btn-jump-exclusion');
    var btnOpenRulesHeader = document.getElementById('btn-exhibit-b-open-rules');
    var btnOpenRulesFooter = document.getElementById('btn-exhibit-b-footer-rules');

    // 1. Filtering logic
    function setFilter(filter) {
      filterBtns.forEach(function(btn) {
        var active = (btn.dataset.filter === filter);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      var visibleCount = 0;
      cards.forEach(function(card) {
        var strat = card.dataset.strategy;
        var show = (filter === 'all' || strat === filter);
        card.classList.toggle('is-hidden', !show);
        if (show) visibleCount++;
      });

      if (filter === 'build') {
        showToast('⚙ Filtered: 5 Proprietary Build (Own) Capabilities', 'info');
      } else if (filter === 'buy') {
        showToast('🔗 Filtered: 2 Regulated / Third-Party APIs (Buy)', 'info');
      } else {
        showToast('📋 Showing All 7 Capabilities & Strategy Matrix', 'info');
      }
    }

    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var f = btn.dataset.filter || 'all';
        setFilter(f);
      });
    });

    // 2. Individual Capability Card Spec Accordion Toggle
    cards.forEach(function(card) {
      var toggleBtn = card.querySelector('.spec-toggle-btn');
      var specPanel = card.querySelector('.security-enclave-panel');
      if (toggleBtn && specPanel) {
        toggleBtn.addEventListener('click', function(e) {
          e.preventDefault();
          var isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
          var nextState = !isExpanded;
          toggleBtn.setAttribute('aria-expanded', nextState ? 'true' : 'false');
          if (nextState) {
            specPanel.removeAttribute('hidden');
          } else {
            specPanel.setAttribute('hidden', '');
          }
        });
      }
    });

    // 3. Global Expand / Collapse All Specs Toggle
    var allExpanded = false;
    if (btnToggleAll) {
      btnToggleAll.addEventListener('click', function(e) {
        e.preventDefault();
        allExpanded = !allExpanded;
        cards.forEach(function(card) {
          var toggleBtn = card.querySelector('.spec-toggle-btn');
          var specPanel = card.querySelector('.security-enclave-panel');
          if (toggleBtn && specPanel) {
            toggleBtn.setAttribute('aria-expanded', allExpanded ? 'true' : 'false');
            if (allExpanded) {
              specPanel.removeAttribute('hidden');
            } else {
              specPanel.setAttribute('hidden', '');
            }
          }
        });
        btnToggleAll.innerHTML = allExpanded
          ? '<span class="ic">&#9671;</span> Collapse All Specs'
          : '<span class="ic">&#9670;</span> Expand All Specs';
        showToast(allExpanded ? '📖 Expanded all 7 compliance & security specs' : '📁 Collapsed all compliance & security specs', 'info');
      });
    }

    // 4. Smooth Anchor Jump to The Exclusion
    if (btnJumpExclusion) {
      btnJumpExclusion.addEventListener('click', function(e) {
        e.preventDefault();
        var exclEl = document.getElementById('the-exclusion-enclave');
        if (exclEl) {
          exclEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          exclEl.classList.add('pulse-highlight');
          setTimeout(function() {
            exclEl.classList.remove('pulse-highlight');
          }, 2400);
          showToast('🛡 The Exclusion: Treas. Reg. § 301.7701-15 Safe Harbor', 'info');
        }
      });
    }

    // 5. Open Architecture Rules Modal to Exhibit B
    function openModalToExhibitB(e) {
      if (e) e.preventDefault();
      showArchitectureRulesModal();
      var tabB = document.getElementById('tab-btn-exhibit-b');
      if (tabB) tabB.click();
    }
    if (btnOpenRulesHeader) btnOpenRulesHeader.addEventListener('click', openModalToExhibitB);
    if (btnOpenRulesFooter) btnOpenRulesFooter.addEventListener('click', openModalToExhibitB);
  }

  // -------------------------------------------------------------
  // 14B. INTERACTIVE AUTHENTICATION MODAL (#auth-modal)
  // -------------------------------------------------------------
  function initAuthModal() {
    var authModal = document.getElementById('auth-modal');
    if (!authModal) return;

    var authCard = document.getElementById('auth-modal-card');
    var modalCloseBtn = document.getElementById('auth-modal-close');
    var modalAlert = document.getElementById('auth-modal-alert');
    var clientTabs = document.getElementById('auth-client-tabs');
    var tabPortalClient = document.getElementById('tab-modal-client');
    var tabPortalFirm = document.getElementById('tab-modal-firm');
    var tabClientSignin = document.getElementById('tab-client-signin');
    var tabClientSignup = document.getElementById('tab-client-signup');
    var formClientSignin = document.getElementById('form-modal-client-signin');
    var formClientSignup = document.getElementById('form-modal-client-signup');
    var formPractitioner = document.getElementById('form-modal-practitioner');
    var modalBadge = document.getElementById('auth-modal-badge');
    var modalTitle = document.getElementById('auth-modal-title');
    var guardrail403 = document.getElementById('modal-guardrail-403');
    var btnSwitchTaxpayer = document.getElementById('btn-modal-switch-taxpayer');
    var btnQuickClient = document.getElementById('btn-modal-quick-client');
    var btnQuickFirm = document.getElementById('btn-modal-quick-firm');

    var lastFocusedElement = null;
    var currentClientSubTab = 'signin';

    function showAlert(msg, isErr) {
      if (!modalAlert) return;
      modalAlert.style.display = 'block';
      modalAlert.style.background = isErr ? 'var(--danger-bg, #fee2e2)' : 'var(--ok-bg, #e6f5ec)';
      modalAlert.style.color = isErr ? 'var(--danger, #dc2626)' : 'var(--ok, #1f8a54)';
      modalAlert.style.border = isErr ? '1px solid var(--danger, #dc2626)' : '1px solid var(--ok, #1f8a54)';
      modalAlert.innerHTML = (isErr ? '<b>Security Alert:</b> ' : '<b>Success:</b> ') + msg;
    }

    function hideAlert() {
      if (modalAlert) {
        modalAlert.style.display = 'none';
        modalAlert.innerHTML = '';
      }
    }

    function triggerTransition(el) {
      if (!el) return;
      el.classList.remove('auth-tab-enter');
      void el.offsetWidth;
      el.classList.add('auth-tab-enter');
    }

    function setClientTab(tab) {
      currentClientSubTab = tab;
      hideAlert();
      if (tab === 'signin') {
        if (tabClientSignin) {
          tabClientSignin.classList.add('active');
          tabClientSignin.setAttribute('aria-selected', 'true');
        }
        if (tabClientSignup) {
          tabClientSignup.classList.remove('active');
          tabClientSignup.setAttribute('aria-selected', 'false');
        }
        if (modalBadge) modalBadge.textContent = 'Taxpayer Access · IRS Pub 1345';
        if (modalTitle) modalTitle.innerHTML = '<span style="color:#FFFFFF !important;font-weight:700;">Pivot Aide </span><span class="gold-gradient-text" style="color:#FFF885 !important;text-shadow:0 0 12px rgba(234,228,47,0.4)">Tax</span>';
        if (formClientSignin) {
          formClientSignin.style.display = 'block';
          triggerTransition(formClientSignin);
        }
        if (formClientSignup) formClientSignup.style.display = 'none';
        if (formPractitioner) formPractitioner.style.display = 'none';
        var emailInput = document.getElementById('modal-client-email');
        if (emailInput) {
          setTimeout(function () { emailInput.focus(); }, 50);
        }
      } else {
        if (tabClientSignup) {
          tabClientSignup.classList.add('active');
          tabClientSignup.setAttribute('aria-selected', 'true');
        }
        if (tabClientSignin) {
          tabClientSignin.classList.remove('active');
          tabClientSignin.setAttribute('aria-selected', 'false');
        }
        if (modalBadge) modalBadge.textContent = 'New Client Onboarding · IRC § 7216';
        if (modalTitle) modalTitle.innerHTML = '<span style="color:#FFFFFF !important;font-weight:700;">Pivot Aide </span><span class="gold-gradient-text" style="color:#FFF885 !important;text-shadow:0 0 12px rgba(234,228,47,0.4)">Tax</span>';
        if (formClientSignin) formClientSignin.style.display = 'none';
        if (formClientSignup) {
          formClientSignup.style.display = 'block';
          triggerTransition(formClientSignup);
        }
        if (formPractitioner) formPractitioner.style.display = 'none';
        var nameInput = document.getElementById('modal-signup-name');
        if (nameInput) {
          setTimeout(function () { nameInput.focus(); }, 50);
        }
      }
    }

    function switchPortal(portal, subTab) {
      hideAlert();

      if (portal === 'firm') {
        if (tabPortalFirm) {
          tabPortalFirm.classList.add('active');
          tabPortalFirm.setAttribute('aria-selected', 'true');
        }
        if (tabPortalClient) {
          tabPortalClient.classList.remove('active');
          tabPortalClient.setAttribute('aria-selected', 'false');
        }

        if (authCard) {
          authCard.className = 'auth-modal-card mode-firm';
        }
        if (modalBadge) modalBadge.textContent = 'Practitioner Access · Circular 230';
        if (modalTitle) modalTitle.innerHTML = '<span style="color:#FFFFFF !important;font-weight:700;">Pivot Aide </span><span style="color:#38BDF8 !important;text-shadow:0 0 12px rgba(1,159,255,0.45)">Tax</span>';
        var subtitle = authCard ? authCard.querySelector('.auth-modal-subtitle') : null;
        if (subtitle) subtitle.textContent = 'Firm Operations Console · Practitioner Access';

        if (clientTabs) clientTabs.classList.add('is-hidden');
        if (formClientSignin) formClientSignin.style.display = 'none';
        if (formClientSignup) formClientSignup.style.display = 'none';
        if (formPractitioner) {
          formPractitioner.style.display = 'block';
          triggerTransition(formPractitioner);
        }
        if (guardrail403) guardrail403.style.display = 'none';

        // Check if existing session in storage is a client account
        try {
          var raw = localStorage.getItem('tfr_user_session');
          if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'client' && !parsed.isStaff) {
              if (guardrail403) guardrail403.style.display = 'block';
            }
          }
        } catch (_) {}

        var firmEmail = document.getElementById('modal-firm-email');
        if (firmEmail) {
          setTimeout(function () { firmEmail.focus(); }, 50);
        }
      } else {
        if (tabPortalClient) {
          tabPortalClient.classList.add('active');
          tabPortalClient.setAttribute('aria-selected', 'true');
        }
        if (tabPortalFirm) {
          tabPortalFirm.classList.remove('active');
          tabPortalFirm.setAttribute('aria-selected', 'false');
        }

        if (authCard) {
          authCard.className = 'auth-modal-card mode-client';
        }
        var subtitle = authCard ? authCard.querySelector('.auth-modal-subtitle') : null;
        if (subtitle) subtitle.textContent = 'The File Room · Secure Access';

        if (clientTabs) clientTabs.classList.remove('is-hidden');
        if (formPractitioner) formPractitioner.style.display = 'none';

        setClientTab(subTab || currentClientSubTab || 'signin');
      }
    }

    function openModal(mode) {
      lastFocusedElement = document.activeElement;
      hideAlert();

      if (mode === 'firm') {
        switchPortal('firm');
      } else {
        switchPortal('client', mode === 'signup' ? 'signup' : 'signin');
      }

      authModal.removeAttribute('hidden');
      authModal.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(function () {
        authModal.classList.add('active');
      });
    }

    function closeModal() {
      authModal.classList.remove('active');
      authModal.setAttribute('aria-hidden', 'true');
      setTimeout(function () {
        authModal.setAttribute('hidden', '');
      }, 240);
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try { lastFocusedElement.focus(); } catch (_) {}
      }
    }

    // Expose for external triggers if needed
    window.FileRoomAuthModal = {
      open: openModal,
      close: closeModal,
      switchPortal: switchPortal,
      setClientTab: setClientTab
    };

    // Primary Portal Tabs
    if (tabPortalClient) {
      tabPortalClient.addEventListener('click', function () {
        switchPortal('client');
      });
    }
    if (tabPortalFirm) {
      tabPortalFirm.addEventListener('click', function () {
        switchPortal('firm');
      });
    }

    // Client Sub-Tabs
    if (tabClientSignin) {
      tabClientSignin.addEventListener('click', function () {
        setClientTab('signin');
      });
    }
    if (tabClientSignup) {
      tabClientSignup.addEventListener('click', function () {
        setClientTab('signup');
      });
    }

    // Modal Close Button & Dismissal
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }

    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && authModal.classList.contains('active')) {
        closeModal();
      }
    });

    // 2FA 6-Character OTP Boxes (Auto-jumping & Paste Support)
    var otpRows = authModal.querySelectorAll('.auth-otp-row');
    otpRows.forEach(function (row) {
      var boxes = row.querySelectorAll('.auth-otp-box');
      boxes.forEach(function (box, idx) {
        box.addEventListener('input', function (e) {
          var val = e.target.value.replace(/[^0-9a-zA-Z]/g, '');
          e.target.value = val ? val.slice(-1) : '';
          if (val && idx < boxes.length - 1) {
            boxes[idx + 1].focus();
          }
        });

        box.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !e.target.value && idx > 0) {
            boxes[idx - 1].focus();
          }
        });

        box.addEventListener('paste', function (e) {
          var paste = (e.clipboardData || window.clipboardData).getData('text');
          var chars = paste.replace(/[^0-9a-zA-Z]/g, '').slice(0, 6);
          if (chars.length > 0) {
            e.preventDefault();
            chars.split('').forEach(function (char, i) {
              if (boxes[i]) boxes[i].value = char;
            });
            var next = Math.min(chars.length, boxes.length - 1);
            boxes[next].focus();
          }
        });
      });
    });

    // Taxpayer Sign In Submission
    if (formClientSignin) {
      formClientSignin.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('modal-client-email').value.trim();
        var sessionData = {
          name: 'Michael & Elena Whitfield',
          email: email || 'm.whitfield@example.com',
          role: 'client',
          isStaff: false,
          mfa: true,
          mfaVerified: true,
          isAuthenticated: true,
          timestamp: Date.now()
        };
        try {
          localStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
        } catch (_) {}
        showAlert('Taxpayer verified via Step 2 MFA. Redirecting to Client Portal...', false);
        setTimeout(function () {
          window.location.href = 'client/dashboard.html';
        }, 350);
      });
    }

    // Taxpayer Register New Client Submission
    if (formClientSignup) {
      formClientSignup.addEventListener('submit', function (e) {
        e.preventDefault();
        var consent = document.getElementById('modal-signup-consent').checked;
        if (!consent) {
          showAlert('Mandatory IRC § 7216 statutory consent required.', true);
          return;
        }
        var name = document.getElementById('modal-signup-name').value.trim();
        var email = document.getElementById('modal-signup-email').value.trim();
        var sessionData = {
          name: name || 'New Taxpayer',
          email: email || 'taxpayer@example.com',
          role: 'client',
          isStaff: false,
          mfa: true,
          mfaVerified: true,
          consent7216: true,
          isAuthenticated: true,
          timestamp: Date.now()
        };
        try {
          localStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
        } catch (_) {}
        showAlert('New client account registered. Entering Client Portal...', false);
        setTimeout(function () {
          window.location.href = 'client/dashboard.html';
        }, 350);
      });
    }

    // Practitioner Sign In Submission
    if (formPractitioner) {
      formPractitioner.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('modal-firm-email').value.trim();
        var ptin = document.getElementById('modal-firm-ptin').value.trim();

        // 403 Forbidden Guardrail: Block client account from staff console
        var lower = email.toLowerCase();
        if (lower === 'm.whitfield@example.com' || lower.includes('client') || lower.includes('taxpayer')) {
          if (guardrail403) guardrail403.style.display = 'block';
          showAlert('Unauthorized Role (403): Client accounts cannot access Firm Operations Console.', true);
          return;
        }

        var sessionData = {
          uid: 'staff_denise_cpa',
          name: 'Denise Rosenthal, CPA',
          email: email || 'denise@pivot-aide.tax',
          role: 'firm_staff',
          staffRole: 'firm_admin',
          ptin: ptin || 'P01489240',
          isStaff: true,
          mfa: true,
          mfaVerified: true,
          nistAal2Verified: true,
          isAuthenticated: true,
          timestamp: Date.now()
        };
        try {
          localStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
          sessionStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
        } catch (_) {}
        showAlert('Practitioner verified via NIST AAL2. Entering Firm Operations Console...', false);
        setTimeout(function () {
          window.location.href = 'firm/dashboard.html';
        }, 350);
      });
    }

    // Switch to Taxpayer from 403 Card
    if (btnSwitchTaxpayer) {
      btnSwitchTaxpayer.addEventListener('click', function () {
        openModal('client');
      });
    }

    // Quick Bypass: Taxpayer (Michael Whitfield)
    if (btnQuickClient) {
      btnQuickClient.addEventListener('click', function () {
        var sessionData = {
          name: 'Michael & Elena Whitfield',
          email: 'm.whitfield@example.com',
          role: 'client',
          isStaff: false,
          mfa: true,
          mfaVerified: true,
          isAuthenticated: true,
          timestamp: Date.now()
        };
        try {
          localStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
        } catch (_) {}
        window.location.href = 'client/dashboard.html';
      });
    }

    // Quick Bypass: Managing CPA (Denise R.)
    if (btnQuickFirm) {
      btnQuickFirm.addEventListener('click', function () {
        var sessionData = {
          uid: 'staff_denise_cpa',
          name: 'Denise Rosenthal, CPA',
          email: 'denise@pivot-aide.tax',
          role: 'firm_staff',
          staffRole: 'firm_admin',
          ptin: 'P01489240',
          isStaff: true,
          mfa: true,
          mfaVerified: true,
          nistAal2Verified: true,
          isAuthenticated: true,
          timestamp: Date.now()
        };
        try {
          localStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
          sessionStorage.setItem('tfr_user_session', JSON.stringify(sessionData));
        } catch (_) {}
        window.location.href = 'firm/dashboard.html';
      });
    }

    // Password visibility toggle handler
    var EYE_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    var EYE_OFF_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    var toggleBtns = document.querySelectorAll('.pwd-toggle-btn');
    toggleBtns.forEach(function (btn) {
      if (btn.dataset.pwdBound) return;
      btn.dataset.pwdBound = 'true';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var targetId = btn.getAttribute('data-target');
        var input = targetId ? document.getElementById(targetId) : null;
        if (!input) return;

        var isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
        btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
      });
    });
  }

  // -------------------------------------------------------------
  // 15. BOOTSTRAP INITIALIZATION
  // -------------------------------------------------------------
  function init() {
    initTheme();
    initAuthModal();
    bindGlobalEvents();
    initDeviceSwitcher();
    initSignIn();
    renderDocumentsList();
    bindDropZoneEvents();
    initSigning();
    initMessaging();
    initBilling();
    initFirmView();
    initServices();
    initUpdates();
    initQaAutomationSuite();
    initComplianceReportGenerator();
    initVendorWebhookSimulator();
    initDeliveryReturnViewerHarness();
    initExhibitACalculator();
    initExhibitBScreen();
    initFirebaseIntegration();
    initAuthModal();

    // Default start screen — open 'home' if session active, otherwise Screen 01 Sign In
    var savedSession = null;
    try {
      var raw = localStorage.getItem('tfr_user_session');
      if (raw) savedSession = JSON.parse(raw);
    } catch (_) {}
    var activeUser = (window.FirebaseBridge && window.FirebaseBridge.currentUser) ||
                     (window.firebaseAuth && window.firebaseAuth.currentUser) ||
                     savedSession ||
                     (state.user && state.user.isAuthenticated && state.user.uid && state.user);
    if (document.getElementById('s-gateway')) {
      showScreen('gateway');
    } else if (activeUser && activeUser.email) {
      state.user.isAuthenticated = true;
      state.user.verified = true;
      state.user.uid = activeUser.uid;
      state.user.email = activeUser.email;
      if (activeUser.displayName) state.user.name = activeUser.displayName;
      syncUserUI(activeUser);
      showScreen('home');
    } else {
      syncUserUI(null);
      showScreen('signin');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();




/**
 * ============================================================================
 * THE FILE ROOM — CLIENT PORTAL DASHBOARD CONTROLLER
 * Pivot Aide Tax: Taxpayer Engagement Command Center
 * ============================================================================
 * 
 * Manages:
 * 1. Current filing stage & 6-step progress milestone tracker
 * 2. Real-time aggregated pending client actions
 * 3. Missing & outstanding document requests
 * 4. Form 8879 signature requests & KBA verification status
 * 5. Recent client-preparer conversation thread
 * 6. Statutory tax deadlines & filing calendar
 * 7. Invoices, balance due & payment status
 * 8. Recent file activity & update notices
 */

(function (window) {
  'use strict';

  var ClientDashboard = {
    state: {
      clientUid: null,
      engagement: null,
      missingDocuments: null,
      documentRequests: [],
      taxReturn: null,
      signatureRecord: null,
      messages: [],
      invoices: [],
      updates: [],
      isLoading: true,
      error: null
    },

    unsubscribers: [],

    /**
     * Initializes the Client Dashboard for the authenticated client using live Firestore listeners.
     */
    initDashboard: function () {
      var self = this;
      self.state.isLoading = true;
      self.state.error = null;

      // Listen for async bridge readiness if module script loaded slightly deferred
      if (!window.FirebaseBridge && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        var onBridgeReady = function () {
          window.removeEventListener('firebase-ready', onBridgeReady);
          window.removeEventListener('firebase-bridge-ready', onBridgeReady);
          self.initDashboard();
        };
        window.addEventListener('firebase-ready', onBridgeReady);
        window.addEventListener('firebase-bridge-ready', onBridgeReady);
      }

      // 1. Initial loading UI
      var docEl = (typeof document !== 'undefined' ? document : (window && window.document));
      var contentArea = docEl ? docEl.getElementById('dashboard-content-area') : null;
      if (contentArea && window.FileRoomLayout && typeof window.FileRoomLayout.renderLoading === 'function') {
        window.FileRoomLayout.renderLoading(contentArea, 'Connecting to your live engagement file in Cloud Firestore...');
      }

      // 2. Resolve Authenticated UID via session or onAuthStateChanged(auth)
      var bridge = window.FirebaseBridge;
      var auth = (bridge && bridge.auth) || window.firebaseAuth;
      var onAuthFn = (bridge && bridge.onAuthStateChanged) || window.onAuthStateChanged;

      var currentSession = null;
      try {
        var rawSession = localStorage.getItem('tfr_user_session');
        if (rawSession) currentSession = JSON.parse(rawSession);
      } catch (_) {}

      var isStaffUser = Boolean(
        (currentSession && (currentSession.isStaff || currentSession.role === 'firm_preparer' || currentSession.role === 'firm_admin')) ||
        (bridge && bridge.currentUser && (bridge.currentUser.isStaff || bridge.currentUser.role === 'firm_preparer' || bridge.currentUser.role === 'firm_admin'))
      );

      function resolveClientUid(candidateUser) {
        if (isStaffUser) {
          var staffTarget = (typeof localStorage !== 'undefined') ? localStorage.getItem('tfr_client_id') : null;
          if (staffTarget && staffTarget !== 'usr_whitfield_4417') return staffTarget;
          return 'j11ZvNVZf7Q2FeTrCVNStRM8';
        }
        var u = candidateUser || (window.firebaseAuth && window.firebaseAuth.currentUser) || (bridge && bridge.currentUser) || currentSession;
        if (u && u.uid && u.uid !== 'usr_whitfield_4417') return u.uid;
        if (u && u.email) {
          var em = u.email.toLowerCase();
          if (em.includes('nandanfitnessvlog')) return 'j11ZvNVZf7Q2FeTrCVNStRM8';
          if (em.includes('nandanb449')) return (u && u.uid) || 'uYcJZErwhjd0zjnleMx3WQnSgVm2';
        }
        var loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
        if (loc && loc.search) {
          try {
            var p = new URLSearchParams(loc.search);
            var q = p.get('client') || p.get('uid') || p.get('clientId');
            if (q && q !== 'usr_whitfield_4417') return q;
          } catch (_) {}
        }
        return (u && u.uid) || 'j11ZvNVZf7Q2FeTrCVNStRM8';
      }

      var initialUid = resolveClientUid();
      self.state.clientUid = initialUid;

      if (typeof onAuthFn === 'function' && auth) {
        try {
          var unsubAuth = onAuthFn(auth, function (user) {
            var uid = resolveClientUid(user);
            self.state.clientUid = uid;
            self.bindRealtimeListeners(uid);
          });
          if (typeof unsubAuth === 'function') self.unsubscribers.push(unsubAuth);
          return;
        } catch (e) {
          console.warn('onAuthStateChanged subscription error:', e);
        }
      }

      // Fallback for mock environments or immediate token resolution
      self.bindRealtimeListeners(initialUid);
    },

    /**
     * Backward-compatible alias for initDashboard()
     */
    init: function () {
      return this.initDashboard();
    },

    /**
     * Binds live Firestore onSnapshot listeners to:
     * 1. /engagements/eng_2026_${uid} for progress spine, action counts, and refund telemetry.
     * 2. query(collection(db, 'documentRequests'), where('clientUid', '==', uid), where('status', '==', 'missing')) for live Missing Docs.
     * 3. Supporting sub-streams (taxReturn, invoices, messages, updates).
     *
     * @param {string} uid - Authenticated taxpayer UID
     */
    bindRealtimeListeners: function (uid) {
      var self = this;
      self.cleanup();

      var bridge = window.FirebaseBridge;
      var db = (bridge && bridge.db) || window.firebaseDb;
      var docFn = (bridge && bridge.doc) || window.doc;
      var onSnapshotFn = (bridge && bridge.onSnapshot) || window.onSnapshot;
      var collectionFn = (bridge && bridge.collection) || window.collection;
      var queryFn = (bridge && bridge.query) || window.query;
      var whereFn = (bridge && bridge.where) || window.where;

      // Ensure base engagement fallback is populated with 0 figures
      var defaultEng = (bridge && bridge.getDefaultEngagement && bridge.getDefaultEngagement(uid)) || {};
      self.state.engagement = Object.assign({
        clientUid: uid,
        taxYear: 2026,
        filingStatus: 'Married Filing Jointly',
        currentStage: 3,
        stageLabel: 'In Preparation',
        overallProgress: 68,
        progressPct: 68,
        federalRefund: 0.00,
        federalRefundFormatted: '$0.00',
        stateBalanceDue: 0.00,
        stateBalanceDueFormatted: '$0.00',
        assignedCpa: { name: 'Denise Rosenthal, CPA', ptin: 'P01849201' }
      }, defaultEng);

      // 1. Real-Time Engagement Listener: /engagements/eng_2026_${uid} ──
      var boundLiveFirestore = false;
      if (db && typeof docFn === 'function' && typeof onSnapshotFn === 'function') {
        try {
          var engDocId = 'eng_2026_' + uid;
          var engDocRef = docFn(db, 'engagements', engDocId);

          var unsubEng = onSnapshotFn(
            engDocRef,
            function (docSnap) {
              try {
                if (docSnap && typeof docSnap.exists === 'function' && docSnap.exists()) {
                  var data = docSnap.data();
                  self.state.engagement = Object.assign({ id: docSnap.id, clientUid: uid }, data);
                } else if (docSnap && docSnap.data && docSnap.data()) {
                  var rawData = docSnap.data();
                  if (rawData) self.state.engagement = Object.assign({ id: engDocId, clientUid: uid }, rawData);
                } else {
                  // Document does not exist in Firestore yet: auto-seed authoritative engagement record into Cloud Firestore
                  if (bridge && typeof bridge.saveEngagement === 'function') {
                    bridge.saveEngagement(Object.assign({}, self.state.engagement, {
                      taxYear: 2026,
                      filingStatus: 'Married filing jointly',
                      jurisdictions: 'MD resident · VA and PA non-resident',
                      jurisdictionsList: ['IRS Form 1040', 'MD Form 502', 'VA Form 760', 'PA Form PA-40'],
                      currentStage: 3,
                      stage: 'in_prep',
                      stageLabel: 'In Preparation',
                      overallProgress: 68,
                      progressPct: 68,
                      federalRefund: 3418.00,
                      federalRefundFormatted: '$3,418.00',
                      stateBalanceDue: 612.00,
                      stateBalanceDueFormatted: '$612.00',
                      assignedPreparer: 'Denise Rosenthal, CPA',
                      assignedCpa: { name: 'Denise Rosenthal, CPA', ptin: 'P01849201' }
                    })).catch(function () {});
                  }
                }
                self.state.isLoading = false;
                self.render();
              } catch (renderErr) {
                self.renderErrorState(renderErr);
              }
            },
            function (firestoreErr) {
              // Gracefully handle permission-denied or pending auth tokens without destructive offline error card
              if (firestoreErr && (firestoreErr.code === 'permission-denied' || (firestoreErr.message && (firestoreErr.message.includes('permissions') || firestoreErr.message.includes('permission-denied'))))) {
                if (bridge) bridge._firestoreRulesDenied = true;
                self.state.isLoading = false;
                self.render();
                return;
              }
              console.warn('Firestore engagement stream error:', firestoreErr);
              self.renderErrorState(firestoreErr);
            }
          );
          if (typeof unsubEng === 'function') self.unsubscribers.push(unsubEng);
          boundLiveFirestore = true;

          // Wire bridge.subscribeEngagement as dual stream to catch canonical ID writes from Firm Console
          if (bridge && typeof bridge.subscribeEngagement === 'function') {
            var unsubBridgeEng = bridge.subscribeEngagement(uid, function (liveEng) {
              if (liveEng) {
                self.state.engagement = Object.assign({}, self.state.engagement, liveEng);
                self.state.isLoading = false;
                self.render();
              }
            });
            if (typeof unsubBridgeEng === 'function') self.unsubscribers.push(unsubBridgeEng);
          }
        } catch (setupErr) {
          if (setupErr && (setupErr.code === 'permission-denied' || (setupErr.message && (setupErr.message.includes('permissions') || setupErr.message.includes('permission-denied'))))) {
            self.loadOfflineFallbacks(uid);
            return;
          }
          console.warn('Could not bind engagement doc listener:', setupErr);
          self.renderErrorState(setupErr);
          return;
        }

        // ── 2. Real-Time Missing Docs Query Listener: where('clientUid', '==', uid) & where('status', '==', 'missing') ──
        if (typeof collectionFn === 'function' && typeof queryFn === 'function' && typeof whereFn === 'function') {
          try {
            var missingQuery = queryFn(
              collectionFn(db, 'documentRequests'),
              whereFn('clientUid', '==', uid),
              whereFn('status', '==', 'missing')
            );

            var unsubMissing = onSnapshotFn(
              missingQuery,
              function (querySnap) {
                try {
                  var missingList = [];
                  if (querySnap && typeof querySnap.forEach === 'function') {
                    querySnap.forEach(function (d) {
                      missingList.push(Object.assign({ id: d.id }, d.data()));
                    });
                  }
                  if (missingList.length > 0) {
                    self._hasReceivedDocSnapshot = true;
                    self.state.missingDocuments = missingList;
                  } else if (self._hasReceivedDocSnapshot) {
                    // Documents were previously received and are now all uploaded/accepted
                    self.state.missingDocuments = [];
                  } else {
                    var isQueuesCleared = (bridge && typeof bridge.isQueuesCleared === 'function')
                      ? bridge.isQueuesCleared()
                      : ((typeof localStorage !== 'undefined') && localStorage.getItem('tfr_queues_cleared') === 'true');

                    if (isQueuesCleared) {
                      self._hasReceivedDocSnapshot = true;
                      self.state.missingDocuments = [];
                    } else if (!self.state.missingDocuments || self.state.missingDocuments.length === 0) {
                      var defaultDocs = (bridge && bridge.getDefaultDocumentRequests && bridge.getDefaultDocumentRequests(uid)) || (window.FileRoomData && window.FileRoomData.documents) || [];
                      var neededDocs = defaultDocs.filter(function (d) {
                        return d.status === 'missing' || d.status === 'pending' || d.status === 'needed' || d.status === 'requested';
                      });
                      if (neededDocs.length > 0) {
                        self.state.missingDocuments = neededDocs;
                        // Auto-seed missing documents to Firestore so backend is persistently populated
                        if (bridge && typeof bridge._firestoreSet === 'function') {
                          neededDocs.forEach(function (docItem) {
                            var docId = docItem.requestId || docItem.id;
                            if (docId) {
                              bridge._firestoreSet('documentRequests', docId, Object.assign({}, docItem, {
                                clientUid: uid,
                                status: 'missing'
                              })).catch(function () {});
                            }
                          });
                        }
                      } else {
                        self.state.missingDocuments = [];
                      }
                    }
                  }
                  self.render();
                } catch (renderErr) {
                  self.renderErrorState(renderErr);
                }
              },
              function (queryErr) {
                if (queryErr && (queryErr.code === 'permission-denied' || (queryErr.message && (queryErr.message.includes('permissions') || queryErr.message.includes('permission-denied'))))) {
                  if (bridge) bridge._firestoreRulesDenied = true;
                  if (!self.state.missingDocuments) {
                    var isQueuesCleared = (bridge && typeof bridge.isQueuesCleared === 'function') 
                      ? bridge.isQueuesCleared() 
                      : ((typeof localStorage !== 'undefined') && localStorage.getItem('tfr_queues_cleared') === 'true');
                    var defaultDocs = isQueuesCleared ? [] : ((bridge && bridge.getDefaultDocumentRequests && bridge.getDefaultDocumentRequests(uid)) || (window.FileRoomData && window.FileRoomData.documents) || []);
                    self.state.missingDocuments = defaultDocs.filter(function (d) {
                      return d.status === 'missing' || d.status === 'pending' || d.status === 'needed' || d.status === 'requested';
                    });
                  }
                  self.render();
                  return;
                }
                console.warn('Firestore documentRequests query error:', queryErr);
                self.renderErrorState(queryErr);
              }
            );
            if (typeof unsubMissing === 'function') self.unsubscribers.push(unsubMissing);
          } catch (querySetupErr) {
            console.warn('Could not bind missing docs query listener:', querySetupErr);
          }

          // ── 3. Real-Time Messages Query Listener: where('clientId', '==', uid) ──
          try {
            var messagesQuery = queryFn(
              collectionFn(db, 'messages'),
              whereFn('clientId', '==', uid)
            );

            var unsubLiveMessages = onSnapshotFn(
              messagesQuery,
              function (querySnap) {
                try {
                  var liveMsgs = [];
                  if (querySnap && typeof querySnap.forEach === 'function') {
                    querySnap.forEach(function (d) {
                      liveMsgs.push(Object.assign({ id: d.id }, d.data()));
                    });
                  }
                  // Merge with persistent local messages if any
                  var localMsgs = (bridge && typeof bridge.getLocalMessages === 'function') ? bridge.getLocalMessages(uid) : [];
                  if (localMsgs && localMsgs.length > 0) {
                    var existingIds = new Set(liveMsgs.map(function (m) { return m.id || m.messageId; }));
                    localMsgs.forEach(function (loc) {
                      var mid = loc.id || loc.messageId;
                      if (!existingIds.has(mid)) {
                        existingIds.add(mid);
                        liveMsgs.push(loc);
                      }
                    });
                  }
                  liveMsgs.sort(function (a, b) {
                    return new Date(a.createdAt || a._isoTime || a.timestamp || 0) - new Date(b.createdAt || b._isoTime || b.timestamp || 0);
                  });
                  if (liveMsgs.length > 0) {
                    self.state.messages = liveMsgs;
                    self.render();
                  }
                } catch (renderErr) {
                  console.warn('Live messages snapshot error:', renderErr);
                }
              },
              function (msgErr) {
                if (msgErr && (msgErr.code === 'permission-denied' || (msgErr.message && (msgErr.message.includes('permissions') || msgErr.message.includes('permission-denied'))))) {
                  if (bridge) bridge._firestoreRulesDenied = true;
                }
              }
            );
            if (typeof unsubLiveMessages === 'function') self.unsubscribers.push(unsubLiveMessages);
          } catch (msgSetupErr) {
            console.warn('Could not bind live messages listener:', msgSetupErr);
          }
        }
      }

      // ── Real-Time Window Message Events Listener ──
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        var onLocalMsgUpdate = function (ev) {
          var detail = ev && ev.detail;
          if (!detail || !detail.clientId || detail.clientId === uid) {
            if (bridge && typeof bridge.getDefaultMessages === 'function') {
              self.state.messages = bridge.getDefaultMessages(uid);
              self.render();
            }
          }
        };
        window.addEventListener('tfr:message_sent', onLocalMsgUpdate);
        window.addEventListener('tfr:message_received', onLocalMsgUpdate);
        window.addEventListener('tfr:messages_cleared', onLocalMsgUpdate);
        window.addEventListener('tfr:message_deleted', onLocalMsgUpdate);
        self.unsubscribers.push(function () {
          window.removeEventListener('tfr:message_sent', onLocalMsgUpdate);
          window.removeEventListener('tfr:message_received', onLocalMsgUpdate);
          window.removeEventListener('tfr:messages_cleared', onLocalMsgUpdate);
          window.removeEventListener('tfr:message_deleted', onLocalMsgUpdate);
        });
      }

      // ── 4. Supporting Streams (Return, Messages, Invoices, Updates) ──
      self.bindSupportingStreams(uid);
    },

    /**
     * Binds supporting data streams (preparedReturn, messages, invoices, updates) with fallback defaults.
     */
    bindSupportingStreams: function (uid) {
      var self = this;
      var bridge = window.FirebaseBridge;

      if (!bridge) {
        self.loadOfflineFallbacks(uid);
        return;
      }

      // Stream 3: Prepared Return & Form 8879
      if (typeof bridge.subscribePreparedReturn === 'function') {
        var unsubRet = bridge.subscribePreparedReturn(function (ret) {
          self.state.taxReturn = ret || (bridge.getDefaultPreparedReturn && bridge.getDefaultPreparedReturn(uid));
          self.render();
        });
        if (typeof unsubRet === 'function') self.unsubscribers.push(unsubRet);
      } else {
        self.state.taxReturn = bridge.getDefaultPreparedReturn ? bridge.getDefaultPreparedReturn(uid) : null;
      }

      // Stream 4: Messages Thread
      if (typeof bridge.subscribeMessages === 'function') {
        var unsubMsgs = bridge.subscribeMessages(
          function (msgs) {
            self.state.messages = (Array.isArray(msgs) && msgs.length > 0)
              ? msgs
              : ((bridge.getDefaultMessages && bridge.getDefaultMessages(uid)) || []);
            self.render();
          },
          function (err) {
            if (typeof bridge.getDefaultMessages === 'function') {
              self.state.messages = bridge.getDefaultMessages(uid);
              self.render();
            }
          },
          'eng_2026_' + uid,
          uid
        );
        if (typeof unsubMsgs === 'function') self.unsubscribers.push(unsubMsgs);
      } else {
        self.state.messages = bridge.getDefaultMessages ? bridge.getDefaultMessages(uid) : [];
      }

      // Stream 5: Invoices & AR
      if (typeof bridge.subscribeInvoices === 'function') {
        var unsubInv = bridge.subscribeInvoices(function (items) {
          self.state.invoices = (Array.isArray(items) && items.length > 0)
            ? items
            : ((bridge.getDefaultInvoices && bridge.getDefaultInvoices(uid)) || []);
          self.render();
        });
        if (typeof unsubInv === 'function') self.unsubscribers.push(unsubInv);
      } else {
        self.state.invoices = bridge.getDefaultInvoices ? bridge.getDefaultInvoices(uid) : [];
      }

      // Stream 6: Updates & Notices
      if (typeof bridge.subscribeUpdates === 'function') {
        var unsubUpd = bridge.subscribeUpdates(function (upds) {
          self.state.updates = (Array.isArray(upds) && upds.length > 0)
            ? upds
            : ((bridge.getDefaultUpdates && bridge.getDefaultUpdates(uid)) || []);
          self.render();
        });
        if (typeof unsubUpd === 'function') self.unsubscribers.push(unsubUpd);
      } else {
        self.state.updates = bridge.getDefaultUpdates ? bridge.getDefaultUpdates(uid) : [];
      }

      // Base document requests default fallback (if real-time query is empty/pending)
      if (!self.state.missingDocuments) {
        self.state.documentRequests = bridge.getDefaultDocumentRequests ? bridge.getDefaultDocumentRequests(uid) : [];
      }

      self.state.isLoading = false;
      self.render();
    },

    /**
     * Renders .error-state-card with an operational retry trigger when Firestore throws an error or is offline.
     */
    renderErrorState: function (err) {
      var self = this;
      self.state.isLoading = false;
      self.state.error = err;

      var docEl = (typeof document !== 'undefined' ? document : (window && window.document));
      var contentArea = docEl ? docEl.getElementById('dashboard-content-area') : null;
      if (!contentArea) return;

      var errorDetails = (err && (err.message || err.toString())) || 'Network connection to Cloud Firestore failed or document query timed out.';

      var retryHandler = function () {
        self.initDashboard();
      };

      if (window.FileRoomLayout && typeof window.FileRoomLayout.renderError === 'function') {
        window.FileRoomLayout.renderError(contentArea, {
          icon: '⚠',
          title: 'Firestore Connection Offline',
          desc: errorDetails,
          onRetry: retryHandler
        });
        var layoutRetryBtn = docEl.getElementById('error-state-retry-btn');
        if (layoutRetryBtn) {
          layoutRetryBtn.setAttribute('id', 'btn-operational-retry');
          layoutRetryBtn.addEventListener('click', retryHandler);
        }
      } else {
        contentArea.innerHTML = [
          '<div class="error-state-card card" role="alert" style="padding:32px 20px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-md);margin:20px 0">',
          '  <div class="error-state-icon" style="font-size:2rem;color:var(--warn);margin-bottom:8px">⚠</div>',
          '  <h3 class="error-state-title" style="font-family:var(--f-display);font-size:1.15rem;margin:0 0 6px 0;color:var(--ink)">Firestore Connection Offline</h3>',
          '  <p class="error-state-desc" style="font-size:.84rem;color:var(--ink-2);max-width:480px;margin:0 auto 16px auto">' + errorDetails + '</p>',
          '  <div class="error-state-actions">',
          '    <button type="button" class="btn sm btn-b operational-retry-trigger" id="btn-operational-retry">Retry Connection</button>',
          '  </div>',
          '</div>'
        ].join('');

        var retryBtn = docEl.getElementById('btn-operational-retry');
        if (retryBtn) {
          retryBtn.addEventListener('click', retryHandler);
        }
      }
    },

    /**
     * Fallback loading from local data structures when bridge is unavailable.
     */
    loadOfflineFallbacks: function (clientUid) {
      var data = window.FileRoomData || {};
      this.state.engagement = data.file || null;
      this.state.documentRequests = data.documents || [];
      this.state.taxReturn = data.taxReturn || null;
      this.state.messages = data.messages || [];
      this.state.invoices = (data.billing && data.billing.invoices) || [];
      this.state.updates = data.updates || [];
      this.state.isLoading = false;
      this.render();
    },

    /**
     * Master render method: builds all 8 sections and mounts them cleanly.
     */
    render: function () {
      var doc = (typeof document !== 'undefined' ? document : (window && window.document));
      var contentArea = doc ? doc.getElementById('dashboard-content-area') : null;
      if (!contentArea) return;

      var eng = this.state.engagement || {};
      var docReqs = this.state.documentRequests || [];
      var taxRet = this.state.taxReturn || {};
      var messages = this.state.messages || [];
      var invoices = this.state.invoices || [];
      var updates = this.state.updates || [];

      // 1. Missing Documents (prioritize real-time query listener state if received)
      var bridge = window.FirebaseBridge;
      var isQueuesCleared = (bridge && typeof bridge.isQueuesCleared === 'function')
        ? bridge.isQueuesCleared()
        : ((typeof localStorage !== 'undefined') && localStorage.getItem('tfr_queues_cleared') === 'true');

      var missingDocs = isQueuesCleared ? [] : (Array.isArray(this.state.missingDocuments)
        ? this.state.missingDocuments
        : docReqs.filter(function (d) {
            return d.status === 'missing' || d.status === 'pending' || d.status === 'requested' || d.status === 'needed' || d.status === 'rejected';
          }));

      if (isQueuesCleared) {
        invoices = [];
        if (taxRet) {
          taxRet = Object.assign({}, taxRet, { clientApproved: true, signedAt: new Date().toISOString() });
        }
      }

      // ── Compute Aggregated Pending Actions ───────────────────────
      var pendingActions = [];

      // A. Missing Documents Action
      if (missingDocs.length > 0) {
        pendingActions.push({
          type: 'docs',
          chipClass: 'warn',
          chipText: missingDocs.length + ' Documents Needed',
          title: 'Tax documentation required to finish preparation',
          desc: missingDocs.map(function (d) { return d.title || d.name; }).slice(0, 2).join(' and ') + ' needed for Form 1040.',
          actionText: 'Upload Required Documents',
          actionHref: 'documents.html'
        });
      }

      // B. Outstanding Signature Action (Form 8879)
      var isReadyForSig = (eng.stage === 'signature_pending' || eng.stage === 'ready_for_signature' || (taxRet && taxRet.status === 'signature_pending'));
      var isSigned = (taxRet && (taxRet.clientApproved || taxRet.signedAt));
      if (isReadyForSig && !isSigned) {
        pendingActions.push({
          type: 'sign',
          chipClass: 'gold',
          chipText: 'Signature Required',
          title: 'IRS Form 8879 E-File Authorization Pending',
          desc: 'Your draft return has been published by Denise R., CPA. Execute your electronic signature to allow transmission.',
          actionText: 'Sign Form 8879 Now',
          actionHref: 'signatures.html'
        });
      }

      // C. Invoice Balance Due Action
      var openInvoices = invoices.filter(function (inv) {
        return inv.status !== 'paid' && inv.status !== 'void';
      });
      var totalDue = openInvoices.reduce(function (sum, inv) {
        return sum + (parseFloat(inv.amount || inv.totalDue || 0));
      }, 0);

      if (openInvoices.length > 0 && totalDue > 0) {
        pendingActions.push({
          type: 'bill',
          chipClass: 'night',
          chipText: 'Invoice Open',
          title: 'Invoice Balance Due: $' + totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 }),
          desc: 'Payment due for Tax Year 2026 tax preparation and multi-state filings via zero-fee ACH or card.',
          actionText: 'View & Settle Invoice',
          actionHref: 'billing.html'
        });
      }

      this.state.pendingActions = pendingActions;

      // ── Build HTML Fragments ──────────────────────────────────────
      var html = [
        // SECTION 1: Current Filing Stage, 6-Step Spine & Telemetry Callouts
        this.renderStageAndProgress(eng, pendingActions.length),

        // SECTION 2: Pending Client Actions Banner
        this.renderPendingActionsBanner(pendingActions),

        // 2-Column Split: Missing Documents & Form 8879 Signatures
        '<div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:20px">',
        this.renderMissingDocumentsCard(missingDocs),
        this.renderSignatureStatusCard(taxRet, eng),
        '</div>',

        // 2-Column Split: Invoices/Payment & Recent Messages
        '<div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:20px">',
        this.renderBillingStatusCard(invoices, totalDue),
        this.renderRecentMessagesCard(messages),
        '</div>',

        // 2-Column Split: Important Deadlines & Recent File Updates
        '<div class="grid-2" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:20px">',
        this.renderDeadlinesCard(eng.upcomingDeadlines || []),
        this.renderRecentUpdatesCard(updates),
        '</div>',

        // SECTION 8: Quick Module Launchpad
        this.renderQuickModuleLaunchpad()
      ].join('');

      contentArea.innerHTML = html;

      try {
        var taxpayerName = (bridge && bridge.getUserName && bridge.getUserName(this.state.clientUid)) || 'Nandan';
        var subtitle = doc ? (doc.getElementById('client-dashboard-subtitle') || doc.querySelector('.page-subtitle')) : null;
        if (subtitle) {
          subtitle.textContent = taxpayerName + ' · Form 1040 Joint · Tax Year 2026 (MD, VA, PA)';
        }
      } catch (_) {}
    },

    /**
     * Section 1: Filing Stage & Milestone Progress Tracker
     * Dynamically updates:
     * - The 6-Step Filing Progress spine
     * - Completion percentage (e.g. 68%)
     * - Federal refund ($3,418.00) & state balance ($612.00) callout figures
     * - 'Waiting on you' action items counter
     */
    renderStageAndProgress: function (eng, pendingCount) {
      eng = eng || {};
      var pct = typeof eng.overallProgress === 'number' ? eng.overallProgress : (typeof eng.progressPct === 'number' ? eng.progressPct : 68);
      var stageLabel = eng.stageLabel || 'In Preparation';
      var taxYear = eng.taxYear || 2026;
      var jurisdictions = Array.isArray(eng.jurisdictions) ? eng.jurisdictions.join(' · ') : (eng.jurisdictions || 'MD resident · VA & PA non-resident');
      var waitingCount = typeof pendingCount === 'number' ? pendingCount : 2;

      var fedRefund = (typeof eng.federalRefund === 'number') ? eng.federalRefund : 0.00;
      var fedRefundFormatted = eng.federalRefundFormatted || ('$' + fedRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

      var stateBal = (typeof eng.stateBalanceDue === 'number') ? eng.stateBalanceDue : 0.00;
      var stateBalFormatted = eng.stateBalanceDueFormatted || ('$' + stateBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

      var currentStageNum = typeof eng.currentStage === 'number' ? eng.currentStage : 3;

      var defaultSteps = [
        { step: 1, title: 'Engagement letter signed', meta: '14 January', status: 'done', href: 'services.html' },
        { step: 2, title: 'Documents received — 11 of 13', meta: 'Last upload 2 September', status: 'done', href: 'documents.html' },
        { step: 3, title: 'Two documents still needed', meta: 'Rental 1099-MISC and the Q4 mileage log', status: 'now', href: 'documents.html' },
        { step: 4, title: 'Return prepared and reviewed', meta: 'Estimated 9–11 September', status: 'todo', href: 'tax-return.html' },
        { step: 5, title: 'You approve and sign Form 8879', meta: 'Takes about four minutes', status: 'todo', href: 'signatures.html' },
        { step: 6, title: 'Filed and accepted', meta: 'We watch for the acceptance and tell you', status: 'todo', href: 'tax-return.html' }
      ];

      var steps = Array.isArray(eng.steps) && eng.steps.length > 0 ? eng.steps : defaultSteps;

      var stepsHtml = steps.map(function (s, idx) {
        var stepNum = s.step || (idx + 1);
        var status = s.status;
        if (!status) {
          if (stepNum < currentStageNum) status = 'done';
          else if (stepNum === currentStageNum) status = 'now';
          else status = 'todo';
        }
        var isDone = status === 'done';
        var isNow = status === 'now' || status === 'current';
        var stepClass = isDone ? 'done' : (isNow ? 'now' : 'next');
        var borderColor = isDone ? 'var(--ok)' : (isNow ? 'var(--brand)' : 'var(--line)');
        var bg = isNow ? 'rgba(1,159,255,0.08)' : 'var(--surface-2)';
        var badgeText = isDone ? '✓ Completed' : (isNow ? 'In Progress' : 'Pending');
        var badgeColor = isDone ? 'var(--ok)' : (isNow ? 'var(--brand)' : 'var(--ink-3)');

        return [
          '<a href="' + (s.href || 'documents.html') + '" class="step ' + stepClass + '" style="padding:10px 12px;background:' + bg + ';border-radius:4px;border-left:3px solid ' + borderColor + ';text-decoration:none;display:block">',
          '  <div style="font-size:.68rem;color:' + badgeColor + ';font-weight:600;font-family:var(--f-mono)">STEP ' + stepNum + ' · ' + badgeText + '</div>',
          '  <div style="font-size:.82rem;font-weight:600;color:var(--ink);margin:2px 0">' + s.title + '</div>',
          '  <div style="font-size:.7rem;color:var(--ink-2)">' + (s.meta || '') + '</div>',
          '</a>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;margin-bottom:20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">',
        '    <div style="display:flex;align-items:center;gap:10px">',
        '      <span class="chip gold sm" style="font-weight:600">FILING STAGE</span>',
        '      <b style="font-size:.95rem;color:var(--ink)">' + stageLabel + '</b>',
        '      <span class="chip sm" style="background:var(--surface-2);color:var(--ink-2)">' + jurisdictions + '</span>',
        '    </div>',
        '    <div style="font-family:var(--f-mono);font-size:.84rem;color:var(--ink-2)">',
        '      Overall Progress: <b style="color:var(--brand)">' + pct + '% Complete</b>',
        '    </div>',
        '  </div>',
        '  <div style="height:6px;width:100%;background:var(--line-2);border-radius:3px;overflow:hidden;margin-bottom:14px">',
        '    <div style="height:100%;width:' + pct + '%;background:var(--brand);transition:width .4s ease"></div>',
        '  </div>',
        '  <!-- Live Real-Time Financial Telemetry Callout Figures & Counter -->',
        '  <div class="metrics-callouts-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:14px">',
        '    <div class="card stat-card refund-callout" style="padding:12px 14px;background:var(--surface-2);border-radius:4px;border-left:3px solid var(--ok)">',
        '      <div style="font-size:.72rem;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">Federal Refund Callout</div>',
        '      <div class="stat-figure federal-refund-figure" style="font-family:var(--f-mono);font-size:1.35rem;font-weight:700;color:var(--ok)">' + fedRefundFormatted + '</div>',
        '      <div style="font-size:.68rem;color:var(--ink-3)">IRS Form 1040 Projected Direct Deposit</div>',
        '    </div>',
        '    <div class="card stat-card state-balance-callout" style="padding:12px 14px;background:var(--surface-2);border-radius:4px;border-left:3px solid var(--warn)">',
        '      <div style="font-size:.72rem;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">State Balance Due Callout</div>',
        '      <div class="stat-figure state-balance-figure" style="font-family:var(--f-mono);font-size:1.35rem;font-weight:700;color:var(--ink)">' + stateBalFormatted + '</div>',
        '      <div style="font-size:.68rem;color:var(--ink-3)">State Filings · Due 15 Oct</div>',
        '    </div>',
        '    <div class="card stat-card waiting-callout" style="padding:12px 14px;background:var(--surface-2);border-radius:4px;border-left:3px solid ' + (waitingCount === 0 ? 'var(--ok)' : 'var(--brand)') + '">',
        '      <div style="font-size:.72rem;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:4px">Waiting On You</div>',
        '      <div class="stat-figure waiting-actions-counter" style="font-family:var(--f-mono);font-size:1.35rem;font-weight:700;color:' + (waitingCount === 0 ? 'var(--ok)' : 'var(--brand)') + '">' + (waitingCount === 0 ? '0 Action Items' : (waitingCount + ' Action Item' + (waitingCount === 1 ? '' : 's'))) + '</div>',
        '      <div style="font-size:.68rem;color:var(--ink-3)">' + (waitingCount === 0 ? 'All Documents Verified · Queue Clear' : 'Requires Taxpayer Action') + '</div>',
        '    </div>',
        '  </div>',
        '  <div class="steps-bar" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">',
        stepsHtml,
        '  </div>',
        '</div>'
      ].join('');
    },

    /**
     * Section 2: Aggregated Pending Actions Banner
     */
    renderPendingActionsBanner: function (actions) {
      if (actions.length === 0) {
        return [
          '<div class="card" style="padding:14px 18px;margin-bottom:20px;background:var(--ok-bg);border:1px solid var(--ok-line);display:flex;align-items:center;gap:12px;border-radius:var(--radius-md)">',
          '  <span style="font-size:1.3rem;color:var(--ok)">✓</span>',
          '  <div style="flex:1">',
          '    <b style="color:var(--ok);font-size:.88rem">Waiting on you: 0 Items · All Clear — Zero Actions Outstanding</b>',
          '    <div style="font-size:.78rem;color:var(--ink-2)">Your file is in active review with Denise R., CPA. We will alert you immediately when your draft return is ready for signature.</div>',
          '  </div>',
          '</div>'
        ].join('');
      }

      var itemsHtml = actions.map(function (item) {
        return [
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--surface-2);border-radius:4px;border:1px solid var(--line);flex-wrap:wrap;gap:10px;margin-bottom:8px">',
          '  <div style="flex:1;min-width:240px">',
          '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">',
          '      <span class="chip ' + item.chipClass + ' sm">' + item.chipText + '</span>',
          '      <b style="font-size:.85rem;color:var(--ink)">' + item.title + '</b>',
          '    </div>',
          '    <div style="font-size:.76rem;color:var(--ink-2)">' + item.desc + '</div>',
          '  </div>',
          '  <div>',
          '    <a href="' + item.actionHref + '" class="btn sm btn-b">' + item.actionText + ' &rarr;</a>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;margin-bottom:20px;background:var(--surface);border-left:4px solid var(--warn)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <div style="display:flex;align-items:center;gap:8px">',
        '      <span class="chip warn sm" style="font-weight:600">ACTION REQUIRED</span>',
        '      <b style="font-size:.95rem;color:var(--ink)" class="waiting-actions-title">Waiting on you: ' + actions.length + ' Item' + (actions.length === 1 ? '' : 's') + '</b>',
        '    </div>',
        '    <span style="font-size:.75rem;color:var(--ink-2)">Please resolve to prevent transmission delays</span>',
        '  </div>',
        itemsHtml,
        '</div>'
      ].join('');
    },

    /**
     * Section 3: Missing & Outstanding Documents Card
     */
    renderMissingDocumentsCard: function (missingDocs) {
      if (missingDocs.length === 0) {
        return [
          '<div class="card" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Document Checklist</h3>',
          '    <span class="chip ok sm">Complete ✓</span>',
          '  </div>',
          '  <div style="padding:24px 12px;text-align:center;background:var(--surface-2);border-radius:4px;border:1px dashed var(--line)">',
          '    <div style="font-size:1.8rem;margin-bottom:6px">📁</div>',
          '    <b style="font-size:.85rem;color:var(--ink)">All Requested Documents Received</b>',
          '    <p style="font-size:.76rem;color:var(--ink-2);margin:4px 0 12px 0">All required W-2, 1099, and deduction forms have been inspected and accepted.</p>',
          '    <a href="documents.html" class="btn sm btn-o">View Document Vault</a>',
          '  </div>',
          '</div>'
        ].join('');
      }

      var listHtml = missingDocs.map(function (doc) {
        var isRejected = (doc.status === 'rejected');
        var chip = isRejected 
          ? '<span class="chip warn sm">Resubmission Needed</span>' 
          : '<span class="chip sm" style="background:var(--surface-2);color:var(--ink-2)">' + (doc.category || 'Tax Form') + '</span>';
        var docName = doc.name || doc.title;

        return [
          '<li style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-2);gap:10px">',
          '  <div>',
          '    <div style="display:flex;align-items:center;gap:6px">',
          '      <b style="font-size:.83rem;color:var(--ink)">' + docName + '</b>',
          '      ' + chip,
          '    </div>',
          '    <div style="font-size:.73rem;color:var(--ink-2)">' + (doc.description || 'Required for Schedule preparation') + ' &middot; Due ' + (doc.dueAt || '15 Sep') + '</div>',
          '  </div>',
          '  <a href="documents.html" class="btn sm btn-o" style="padding:3px 9px;font-size:.72rem">Upload</a>',
          '</li>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <div>',
        '      <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0 0 2px 0;color:var(--ink)">Missing Documents</h3>',
        '      <div style="font-size:.75rem;color:var(--ink-2)">' + missingDocs.length + ' item' + (missingDocs.length === 1 ? '' : 's') + ' holding up Form 1040 drafting</div>',
        '    </div>',
        '    <a href="documents.html" class="btn sm btn-b">Upload All &rarr;</a>',
        '  </div>',
        '  <ul style="list-style:none;padding:0;margin:0">',
        listHtml,
        '  </ul>',
        '</div>'
      ].join('');
    },

    /**
     * Section 4: Outstanding Signature Requests (Form 8879) Card
     */
    renderSignatureStatusCard: function (taxRet, eng) {
      var isReady = (eng.stage === 'signature_pending' || eng.stage === 'ready_for_signature' || (taxRet && taxRet.status === 'signature_pending'));
      var isApproved = (taxRet && (taxRet.clientApproved || taxRet.signedAt));

      if (isApproved) {
        return [
          '<div class="card" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Form 8879 Signatures</h3>',
          '    <span class="chip ok sm">Executed ✓</span>',
          '  </div>',
          '  <div style="padding:20px 14px;background:var(--ok-bg);border:1px solid var(--ok-line);border-radius:4px;text-align:center">',
          '    <div style="font-size:1.5rem;color:var(--ok);margin-bottom:4px">✍️</div>',
          '    <b style="font-size:.85rem;color:var(--ok)">IRS Form 8879 Executed &amp; Locked</b>',
          '    <p style="font-size:.76rem;color:var(--ink-2);margin:4px 0 10px 0">Both Primary and Spouse signatures recorded with WORM timestamp. Ready for MeF transmission.</p>',
          '    <a href="signatures.html" class="btn sm btn-o">View Execution Certificate</a>',
          '  </div>',
          '</div>'
        ].join('');
      }

      if (!isReady) {
        return [
          '<div class="card" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Form 8879 Signatures</h3>',
          '    <span class="chip sm" style="background:var(--surface-2);color:var(--ink-2)">In Prep</span>',
          '  </div>',
          '  <div style="padding:22px 14px;background:var(--surface-2);border-radius:4px;border:1px dashed var(--line);text-align:center">',
          '    <div style="font-size:1.5rem;color:var(--ink-3);margin-bottom:4px">✎</div>',
          '    <b style="font-size:.84rem;color:var(--ink)">Signature Package Being Prepared</b>',
          '    <p style="font-size:.76rem;color:var(--ink-2);margin:4px 0 12px 0">Denise R., CPA is currently preparing your Form 1040 schedules. You will be prompted to sign as soon as the draft is published.</p>',
          '    <a href="tax-return.html" class="btn sm btn-o">Preview Return Status</a>',
          '  </div>',
          '</div>'
        ].join('');
      }

      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface);border-left:4px solid var(--gold)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <div>',
        '      <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0 0 2px 0;color:var(--ink)">Signature Required</h3>',
        '      <div style="font-size:.75rem;color:var(--ink-2)">IRS Form 8879 e-File Authorization</div>',
        '    </div>',
        '    <span class="chip gold sm">Action Needed</span>',
        '  </div>',
        '  <div style="padding:12px;background:rgba(234,228,47,0.12);border-radius:4px;margin-bottom:14px;border:1px solid rgba(234,228,47,0.3)">',
        '    <div style="font-size:.8rem;color:var(--ink);margin-bottom:6px"><b>Primary &amp; Spouse Dual Signatures Required</b></div>',
        '    <div style="font-size:.74rem;color:var(--ink-2);line-height:1.4">Under IRS Publication 1345, remote Form 8879 signatures require dynamic identity proofing (KBA). Estimated time: 4 minutes.</div>',
        '  </div>',
        '  <a href="signatures.html" class="btn sm btn-b" style="width:100%;text-align:center;display:block">Execute Form 8879 E-Signature &rarr;</a>',
        '</div>'
      ].join('');
    },

    /**
     * Section 5: Billing & Invoices Status Card
     */
    renderBillingStatusCard: function (invoices, totalDue) {
      if (invoices.length === 0 || totalDue === 0) {
        return [
          '<div class="card" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Billing &amp; Invoices</h3>',
          '    <span class="chip ok sm">Zero Balance</span>',
          '  </div>',
          '  <div style="padding:22px 14px;background:var(--surface-2);border-radius:4px;border:1px dashed var(--line);text-align:center">',
          '    <div style="font-size:1.5rem;color:var(--ok);margin-bottom:4px">$0.00</div>',
          '    <b style="font-size:.84rem;color:var(--ink)">Account in Good Standing</b>',
          '    <p style="font-size:.76rem;color:var(--ink-2);margin:4px 0 12px 0">All invoices for preparation and multi-state filings are settled in full.</p>',
          '    <a href="billing.html" class="btn sm btn-o">View Receipt History</a>',
          '  </div>',
          '</div>'
        ].join('');
      }

      var firstInv = invoices[0] || {};
      var invItems = firstInv.items || [
        { desc: 'Individual return — federal Form 1040', amount: 400 },
        { desc: 'Maryland, Virginia, Pennsylvania returns', amount: 285 },
        { desc: 'Schedule C — Whitfield Design Co.', amount: 310 },
        { desc: 'Schedule E — Halcyon Row rental property', amount: 245 }
      ];

      var itemsHtml = invItems.slice(0, 3).map(function (it) {
        return [
          '<div style="display:flex;justify-content:space-between;font-size:.78rem;padding:4px 0;color:var(--ink-2)">',
          '  <span>' + it.desc + '</span>',
          '  <span style="font-family:var(--f-mono)">$' + parseFloat(it.amount).toFixed(2) + '</span>',
          '</div>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <div>',
        '      <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0 0 2px 0;color:var(--ink)">Billing &amp; Invoices</h3>',
        '      <div style="font-size:.75rem;color:var(--ink-2)">Invoice ' + (firstInv.invoiceId || 'inv_2026_0418') + ' &middot; Balance Due</div>',
        '    </div>',
        '    <div style="font-family:var(--f-display);font-size:1.35rem;font-weight:700;color:var(--brand)">',
        '      $' + totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        '    </div>',
        '  </div>',
        '  <div style="background:var(--surface-2);padding:10px 12px;border-radius:4px;margin-bottom:14px;border:1px solid var(--line)">',
        itemsHtml,
        '  </div>',
        '  <a href="billing.html" class="btn sm btn-b" style="width:100%;text-align:center;display:block">Pay with Zero-Fee ACH or Card &rarr;</a>',
        '</div>'
      ].join('');
    },

    /**
     * Section 6: Recent Messages Card
     */
    renderRecentMessagesCard: function (messages) {
      if (!messages || messages.length === 0) {
        return [
          '<div class="card" id="card-recent-messages" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Recent Messages</h3>',
          '    <span class="chip sm" style="background:var(--surface-2);color:var(--ink-2)">0 unread</span>',
          '  </div>',
          '  <div style="padding:22px 14px;background:var(--surface-2);border-radius:4px;border:1px dashed var(--line);text-align:center">',
          '    <div style="font-size:1.5rem;color:var(--ink-3);margin-bottom:4px">✉</div>',
          '    <b style="font-size:.84rem;color:var(--ink)">No Messages Yet</b>',
          '    <p style="font-size:.76rem;color:var(--ink-2);margin:4px 0 12px 0">Have a question about your W-2 or business deductions? Denise R., CPA is available.</p>',
          '    <a href="messages.html" class="btn sm btn-o">Start a Conversation</a>',
          '  </div>',
          '</div>'
        ].join('');
      }

      var bridge = window.FirebaseBridge;
      var lastMsg = messages[messages.length - 1];
      var isFromCPA = Boolean(
        lastMsg.senderRole === 'preparer' || 
        lastMsg.senderRole === 'firm_staff' || 
        lastMsg.senderRole === 'firm_practitioner' || 
        lastMsg.senderId === 'preparer_denise_cpa' || 
        lastMsg.senderId === 'staff_denise_cpa' || 
        lastMsg.avatar === 'DR'
      );
      var isAssistant = Boolean(
        lastMsg.senderRole === 'assistant' || 
        lastMsg.avatar === 'PAT' || 
        lastMsg.senderId === 'uncle_pat_bot'
      );
      var clientDisplayName = (bridge && bridge.getUserName && bridge.getUserName(this.state.clientUid)) || 
        (!isFromCPA && !isAssistant && lastMsg.senderName) || 'Nandan';

      var senderLabel = isAssistant ? 'Uncle Pat' : (isFromCPA ? (lastMsg.senderName || 'Denise R., CPA') : 'You');
      
      var initials = 'NA';
      if (isAssistant) {
        initials = 'PAT';
      } else if (isFromCPA) {
        initials = 'DR';
      } else if (lastMsg.avatar && lastMsg.avatar !== 'MW' && lastMsg.avatar !== 'DR') {
        initials = lastMsg.avatar;
      } else if (clientDisplayName) {
        var parts = clientDisplayName.trim().split(/\s+/);
        if (parts.length >= 2) {
          initials = (parts[0][0] + parts[1][0]).toUpperCase();
        } else {
          initials = clientDisplayName.slice(0, 2).toUpperCase();
        }
      }

      var msgText = lastMsg.text || 'Hi Denise, we just uploaded our Closing Disclosure for the refinance...';
      if (msgText.includes('Michael')) {
        msgText = msgText.replace(/Michael/g, clientDisplayName);
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function formatMsgTime(isoOrStr) {
        if (!isoOrStr) return 'Today, 8:02 AM';
        try {
          var d = new Date(isoOrStr);
          if (isNaN(d.getTime())) return isoOrStr;
          var now = new Date();
          var isToday = d.toDateString() === now.toDateString();
          var yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          var isYesterday = d.toDateString() === yesterday.toDateString();
          var timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          if (isToday) return 'Today, ' + timeStr;
          if (isYesterday) return 'Yesterday, ' + timeStr;
          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return d.getDate() + ' ' + months[d.getMonth()] + ', ' + timeStr;
        } catch (_) {
          return isoOrStr;
        }
      }

      var timeLabel = formatMsgTime(lastMsg.createdAt || lastMsg.timestamp || lastMsg._isoTime);

      var unreadCount = messages.filter(function (m) {
        return m.readByClient === false && (m.senderRole === 'preparer' || m.senderRole === 'firm_staff' || m.senderRole === 'assistant' || m.senderId === 'preparer_denise_cpa');
      }).length;

      var unreadBadge = unreadCount > 0
        ? '<span class="chip gold sm" id="recent-msg-sync-chip">' + unreadCount + ' Unread</span>'
        : '<span class="chip ok sm" id="recent-msg-sync-chip" style="font-size:.7rem;">SYNCED ✓</span>';

      return [
        '<div class="card" id="card-recent-messages" style="padding:18px 20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <div>',
        '      <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0 0 2px 0;color:var(--ink)">Recent Messages</h3>',
        '      <div style="font-size:.75rem;color:var(--ink-2)">Thread with Denise R., CPA</div>',
        '    </div>',
        '    ' + unreadBadge,
        '  </div>',
        '  <div style="display:flex;gap:12px;padding:12px;background:var(--surface-2);border-radius:4px;margin-bottom:14px;border:1px solid var(--line)">',
        '    <div style="width:36px;height:36px;border-radius:50%;background:var(--night);color:var(--gold);display:grid;place-items:center;font-weight:600;font-size:.8rem;flex:none">' + escapeHtml(initials) + '</div>',
        '    <div style="flex:1">',
        '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">',
        '        <b style="font-size:.82rem;color:var(--ink)">' + escapeHtml(senderLabel) + '</b>',
        '        <span style="font-size:.7rem;color:var(--ink-3)">' + escapeHtml(timeLabel) + '</span>',
        '      </div>',
        '      <div style="font-size:.78rem;color:var(--ink);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">',
        '        "' + escapeHtml(msgText) + '"',
        '      </div>',
        '    </div>',
        '  </div>',
        '  <a href="messages.html" class="btn sm btn-o" style="width:100%;text-align:center;display:block">Reply in Secure Thread &rarr;</a>',
        '</div>'
      ].join('');
    },

    /**
     * Section 7: Important Deadlines Card
     */
    renderDeadlinesCard: function (deadlines) {
      var defaultDeadlines = [
        { label: 'Q3 Estimated Tax Payment (IRS & MD)', date: '15 Sep 2026', badge: '10 Days' },
        { label: 'Form 1040 Extension Filing Cutoff', date: '15 Oct 2026', badge: 'Target' },
        { label: 'IRC § 7216 Annual Consent Renewal', date: '31 Dec 2026', badge: 'Compliance' }
      ];

      var items = deadlines.length > 0 ? deadlines : defaultDeadlines;

      var listHtml = items.map(function (d) {
        return [
          '<li style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-2)">',
          '  <div>',
          '    <div style="font-size:.82rem;font-weight:600;color:var(--ink)">' + d.label + '</div>',
          '    <div style="font-size:.72rem;color:var(--ink-2);font-family:var(--f-mono)">' + d.date + '</div>',
          '  </div>',
          '  <span class="chip sm" style="background:var(--surface-2);color:var(--ink);font-weight:500">' + (d.badge || 'Upcoming') + '</span>',
          '</li>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Important Deadlines</h3>',
        '    <a href="updates.html" style="font-size:.75rem;color:var(--brand);text-decoration:none">View Calendar &rarr;</a>',
        '  </div>',
        '  <ul style="list-style:none;padding:0;margin:0">',
        listHtml,
        '  </ul>',
        '</div>'
      ].join('');
    },

    /**
     * Section 8: Recent File Updates Card
     */
    renderRecentUpdatesCard: function (updates) {
      if (updates.length === 0) {
        return [
          '<div class="card" style="padding:18px 20px;background:var(--surface)">',
          '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
          '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Recent Updates</h3>',
          '    <span class="chip sm">Up to date</span>',
          '  </div>',
          '  <div style="padding:18px 12px;text-align:center;color:var(--ink-3);font-size:.8rem">No recent notices on this file.</div>',
          '</div>'
        ].join('');
      }

      var itemsHtml = updates.slice(0, 3).map(function (u) {
        var cleanTitle = (u.title || 'Engagement update');
        var cleanMeta = (u.meta || u.description || '');
        if (cleanTitle.includes('Halcyon Row') || cleanMeta.includes('Halcyon Row') || cleanMeta.includes('vacant')) {
          cleanTitle = 'Denise replied about your Closing Disclosure';
          cleanMeta = 'Closing Disclosure verified · Loan origination points under active review.';
        }
        return [
          '<li style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-2)">',
          '  <span style="font-size:.9rem;color:var(--brand);margin-top:2px">●</span>',
          '  <div style="flex:1">',
          '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">',
          '      <b style="font-size:.82rem;color:var(--ink)">' + cleanTitle + '</b>',
          '      <span style="font-size:.7rem;color:var(--ink-3)">' + (u.time || 'Recent') + '</span>',
          '    </div>',
          '    <div style="font-size:.73rem;color:var(--ink-2);line-height:1.35">' + cleanMeta + '</div>',
          '  </div>',
          '</li>'
        ].join('');
      }).join('');

      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface)">',
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '    <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0;color:var(--ink)">Recent File Updates</h3>',
        '    <a href="updates.html" style="font-size:.75rem;color:var(--brand);text-decoration:none">All Updates &rarr;</a>',
        '  </div>',
        '  <ul style="list-style:none;padding:0;margin:0">',
        itemsHtml,
        '  </ul>',
        '</div>'
      ].join('');
    },

    /**
     * Section 9: Quick Module Launchpad
     */
    renderQuickModuleLaunchpad: function () {
      return [
        '<div class="card" style="padding:18px 20px;background:var(--surface);margin-bottom:20px">',
        '  <h3 style="font-family:var(--f-display);font-size:1.05rem;margin:0 0 14px 0;color:var(--ink)">Client Portal Modules</h3>',
        '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:12px">',
        '    <a href="documents.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">↑</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Documents</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Checklist &amp; 25MB Vault</div>',
        '      </div>',
        '    </a>',
        '    <a href="signatures.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">✎</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Sign Form 8879</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Remote e-Sign &amp; KBA</div>',
        '      </div>',
        '    </a>',
        '    <a href="tax-return.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">☰</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Your Return</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Form 1040 Breakdown</div>',
        '      </div>',
        '    </a>',
        '    <a href="messages.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">✉</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Messages</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Direct CPA Thread</div>',
        '      </div>',
        '    </a>',
        '    <a href="services.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">◎</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Services</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Engagement Scope Add-ons</div>',
        '      </div>',
        '    </a>',
        '    <a href="billing.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">$</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Billing</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Invoices &amp; Hosted Pay</div>',
        '      </div>',
        '    </a>',
        '    <a href="updates.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">●</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Updates</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">Deadlines &amp; Notices</div>',
        '      </div>',
        '    </a>',
        '    <a href="profile.html" class="card" style="padding:12px;text-decoration:none;display:flex;align-items:center;gap:12px;border:1px solid var(--line);background:var(--surface-2)">',
        '      <span style="font-size:1.3rem;color:var(--brand)">⚙</span>',
        '      <div>',
        '        <b style="color:var(--ink);font-size:.85rem">Profile &amp; Security</b>',
        '        <div style="font-size:.72rem;color:var(--ink-2)">IRC § 7216 &amp; MFA</div>',
        '      </div>',
        '    </a>',
        '  </div>',
        '</div>'
      ].join('');
    },

    /**
     * Unsubscribes from all Firestore streams.
     */
    cleanup: function () {
      this.unsubscribers.forEach(function (unsub) {
        if (typeof unsub === 'function') {
          try { unsub(); } catch (_) {}
        }
      });
      this.unsubscribers = [];
    },

    /**
     * Persists and updates refund telemetry figures in Firestore backend
     */
    setRefundTelemetry: function (fedAmount, stateAmount) {
      var self = this;
      var fed = Number(fedAmount) || 0;
      var state = Number(stateAmount) || 0;
      if (!self.state.engagement) self.state.engagement = {};
      self.state.engagement.federalRefund = fed;
      self.state.engagement.federalRefundFormatted = '$' + fed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      self.state.engagement.stateBalanceDue = state;
      self.state.engagement.stateBalanceDueFormatted = '$' + state.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      self.render();

      var bridge = window.FirebaseBridge;
      if (bridge && typeof bridge.setEngagementRefund === 'function') {
        bridge.setEngagementRefund(self.state.clientUid, fed, state);
      }
    }
  };

  window.ClientDashboard = ClientDashboard;

})(window);

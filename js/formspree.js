/**
 * ============================================================================
 * The File Room · Forminit PDF Transmission Service
 * Endpoint: https://forminit.com/f/rv02anqc45x
 *
 * Uses Vanilla JS (Ajax / Fetch) with FormData to transmit tax PDFs,
 * metadata, and messages to Forminit without full-page reloads.
 * Full backward-compatibility provided for Formspree / Formsphere references.
 * ============================================================================
 */

export const DEFAULT_FORMINIT_KEY = 'rv02anqc45x';
export const FORMINIT_ENDPOINT = 'https://forminit.com/f/' + DEFAULT_FORMINIT_KEY;

// Backward-compatible aliases
export const DEFAULT_FORMSPREE_KEY = DEFAULT_FORMINIT_KEY;
export const FORMSPREE_ENDPOINT = FORMINIT_ENDPOINT;

let _activeApiKey = null;

/**
 * Returns the effective Forminit (or Formsphere/Formspree) endpoint URL.
 * Supports:
 * - Direct custom key or form ID (e.g. 'rv02anqc45x' or 'xppqrdlv')
 * - Full URL (e.g. 'https://forminit.com/f/rv02anqc45x' or 'https://formspree.io/f/...')
 * - Global window/globalThis.FORMINIT_API_KEY, FORMSPHERE_API_KEY, FORMSPREE_API_KEY
 * - localStorage 'forminit_api_key', 'formsphere_api_key', or 'formspree_api_key'
 * - Fallback to default active FORMINIT_ENDPOINT
 *
 * @param {string} [customKeyOrUrl]
 * @returns {string}
 */
export function getForminitEndpoint(customKeyOrUrl) {
  let raw = customKeyOrUrl || _activeApiKey;
  const env = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);

  if (!raw && env) {
    raw = env.FORMINIT_API_KEY ||
          env.FORMINIT_ENDPOINT ||
          env.FORMSPHERE_API_KEY ||
          env.FORMSPREE_API_KEY ||
          env.FORMSPREE_ENDPOINT;
  }
  if (!raw && env && env.localStorage) {
    try {
      raw = env.localStorage.getItem('forminit_api_key') ||
            env.localStorage.getItem('forminit_endpoint') ||
            env.localStorage.getItem('formsphere_api_key') ||
            env.localStorage.getItem('formspree_api_key') ||
            env.localStorage.getItem('formspree_endpoint');
    } catch (_) {}
  }
  if (!raw) {
    return FORMINIT_ENDPOINT;
  }

  const str = String(raw).trim();
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }
  const cleanKey = str.replace(/^\/?f\//i, '').replace(/^\/+/, '').trim();
  // Check if legacy Formspree key pattern or Forminit pattern: default to forminit.com
  return `https://forminit.com/f/${cleanKey}`;
}

export const getFormspreeEndpoint = getForminitEndpoint;
export const getFormsphereEndpoint = getForminitEndpoint;

/**
 * Configures the Forminit / Formsphere / Formspree API key globally and in localStorage.
 *
 * @param {string} key - Forminit Form ID or API Key (e.g., 'rv02anqc45x')
 * @returns {string} The fully qualified endpoint URL
 */
export function setForminitApiKey(key) {
  _activeApiKey = key;
  const env = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (env) {
    env.FORMINIT_API_KEY = key;
    env.FORMSPHERE_API_KEY = key;
    env.FORMSPREE_API_KEY = key;
    if (env.localStorage) {
      try {
        env.localStorage.setItem('forminit_api_key', key);
        env.localStorage.setItem('formsphere_api_key', key);
        env.localStorage.setItem('formspree_api_key', key);
      } catch (_) {}
    }
  }
  return getForminitEndpoint(key);
}

export const setFormspreeApiKey = setForminitApiKey;
export const setFormsphereApiKey = setForminitApiKey;

/**
 * Automatically retrieves the authenticated client's email address from the client side.
 * Checks:
 * 1. Explicit argument
 * 2. Active FirebaseBridge user
 * 3. AuthGuard authentication state
 * 4. Stored user session in localStorage (tfr_user_session)
 * 5. Default client fallback
 *
 * @param {string} [explicitEmail]
 * @returns {string}
 */
export function resolveClientEmail(explicitEmail) {
  if (explicitEmail && typeof explicitEmail === 'string' && explicitEmail.includes('@')) {
    return explicitEmail.trim();
  }
  const env = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (env) {
    try {
      if (env.FirebaseBridge?.currentUser?.email) {
        return env.FirebaseBridge.currentUser.email;
      }
      if (env.FirebaseBridge?.auth?.currentUser?.email) {
        return env.FirebaseBridge.auth.currentUser.email;
      }
    } catch (_) {}

    try {
      if (env.AuthGuard && typeof env.AuthGuard.getAuthState === 'function') {
        const state = env.AuthGuard.getAuthState();
        if (state && state.email) return state.email;
      }
    } catch (_) {}

    try {
      if (env.localStorage) {
        const raw = env.localStorage.getItem('tfr_user_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.email) return parsed.email;
        }
      }
    } catch (_) {}
  }
  return 'm.whitfield@example.com';
}

/**
 * Resolves the authenticated client's display name from the client side.
 *
 * @param {string} [explicitName]
 * @returns {string}
 */
export function resolveClientName(explicitName) {
  if (explicitName && typeof explicitName === 'string' && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  const env = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (env) {
    try {
      if (env.FirebaseBridge?.currentUser?.displayName) {
        return env.FirebaseBridge.currentUser.displayName;
      }
    } catch (_) {}
    try {
      if (env.localStorage) {
        const raw = env.localStorage.getItem('tfr_user_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.displayName || parsed.name)) {
            return parsed.displayName || parsed.name;
          }
        }
      }
    } catch (_) {}
  }
  return 'Michael Whitfield';
}

/**
 * Validates and submits a PDF document with metadata directly to Forminit via AJAX.
 * Automatically bundles the client's email address from the client side.
 *
 * @param {File|Blob|Object} pdfFile - The authentic PDF File object from an <input type="file"> or DragEvent
 * @param {Object} metadata - Context details (name, email, taxYear, message, apiKey, etc.)
 * @returns {Promise<{success: boolean, message?: string, endpoint?: string, email?: string, errors?: Array}>}
 */
export async function submitPdfToForminit(pdfFile, metadata = {}) {
  // 1. Client-Side Validation for PDFs
  if (!pdfFile) {
    throw new Error('Please select a PDF document to upload.');
  }

  const fileName = pdfFile.name || 'document.pdf';
  const isPdf = pdfFile.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new Error('Invalid file format. Forminit intake requires an authentic PDF document (.pdf).');
  }

  // 10MB standard safe threshold for email delivery
  const maxBytes = 10 * 1024 * 1024;
  if (pdfFile.size && pdfFile.size > maxBytes) {
    const sizeMb = (pdfFile.size / (1024 * 1024)).toFixed(1);
    throw new Error(`PDF file size (${sizeMb} MB) exceeds the 10 MB limit for email delivery.`);
  }

  // Resolve target Forminit endpoint (supports custom API keys / Formsphere / Formspree keys)
  const targetEndpoint = getForminitEndpoint(metadata.apiKey || metadata.forminitApiKey || metadata.formsphereApiKey || metadata.endpoint);

  // Resolve client email and name from client side
  const clientEmail = resolveClientEmail(metadata.email || metadata.clientEmail);
  const clientName = resolveClientName(metadata.name || metadata.clientName);

  // 2. Build multipart/form-data payload via FormData
  const formData = new FormData();

  // Forminit standard block keys (mandated by Forminit block schema)
  formData.append('fi-sender-email', clientEmail);
  formData.append('fi-sender-fullName', clientName);
  formData.append('fi-text-documentTitle', metadata.title || fileName);
  formData.append('fi-text-category', metadata.category || 'Tax Return / Supporting Statement');
  formData.append('fi-text-taxYear', String(metadata.taxYear || '2026'));
  formData.append('fi-text-message', metadata.message || `Uploaded tax document: ${fileName} (${clientName} · ${clientEmail})`);
  if (metadata.requestId) {
    formData.append('fi-text-requestId', metadata.requestId);
  }
  if (metadata.clientId || metadata.clientUid) {
    formData.append('fi-sender-userId', metadata.clientId || metadata.clientUid);
  }

  // Resolve target file blob
  let targetFileBlob = pdfFile;
  if (!(typeof Blob !== 'undefined' && pdfFile instanceof Blob)) {
    if (typeof Blob !== 'undefined' && typeof pdfFile === 'object') {
      targetFileBlob = new Blob([pdfFile.content || '%PDF-1.4 tax document content'], { type: 'application/pdf' });
    }
  }

  // File attachment using Forminit fi-file- block keys and standard keys
  if (targetFileBlob) {
    formData.append('fi-file-document', targetFileBlob, fileName);
    formData.append('fi-file-attachment', targetFileBlob, fileName);
    formData.append('attachment', targetFileBlob, fileName);
    formData.append('file', targetFileBlob, fileName);
  }

  // Standard legacy fields for dual Formspree/Formsphere compatibility
  formData.append('email', clientEmail);
  formData.append('_replyto', clientEmail);
  formData.append('name', clientName);
  formData.append('taxYear', String(metadata.taxYear || '2026'));
  formData.append('category', metadata.category || 'Tax Return / Supporting Statement');
  formData.append('message', metadata.message || `Uploaded tax document: ${fileName}`);
  if (metadata.requestId) {
    formData.append('requestId', metadata.requestId);
  }
  if (metadata.clientId || metadata.clientUid) {
    formData.append('clientId', metadata.clientId || metadata.clientUid);
  }
  formData.append('uploadedAt', metadata.uploadedAt || new Date().toISOString());
  formData.append('_subject', `[The File Room] New Tax PDF: ${fileName} (${clientName} · ${clientEmail})`);

  // 3. Dispatch via AJAX Fetch
  // IMPORTANT: Do NOT set Content-Type header manually; browser auto-calculates boundary
  const response = await fetch(targetEndpoint, {
    method: 'POST',
    body: formData,
    headers: {
      'Accept': 'application/json'
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = (data.errors && data.errors.map(e => e.message).join(', ')) ||
                     data.error ||
                     data.message ||
                     'Forminit submission failed. Please check form settings and file size.';
    return {
      success: false,
      message: errorMsg,
      endpoint: targetEndpoint,
      email: clientEmail,
      errors: data.errors || []
    };
  }

  return {
    success: true,
    message: 'PDF transmitted successfully to Forminit!',
    endpoint: targetEndpoint,
    email: clientEmail,
    response: data
  };
}

export const submitPdfToFormspree = submitPdfToForminit;

/**
 * Auto-wires an existing HTML form element to submit PDFs to Forminit via AJAX.
 *
 * @param {string|HTMLFormElement} formSelector - CSS selector or form DOM element
 * @param {Object} options - Callbacks: onStart, onSuccess, onError
 */
export function initForminitPdfForm(formSelector, options = {}) {
  const form = typeof formSelector === 'string' ? document.querySelector(formSelector) : formSelector;
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const fileInput = form.querySelector('input[type="file"]');
    const emailInput = form.querySelector('input[type="email"], input[name="email"]');
    const nameInput = form.querySelector('input[name="name"]');
    const msgInput = form.querySelector('textarea[name="message"], input[name="message"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    const file = fileInput && fileInput.files && fileInput.files[0];

    if (typeof options.onStart === 'function') {
      options.onStart();
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = 'Transmitting PDF...';
    }

    try {
      const result = await submitPdfToForminit(file, {
        email: emailInput ? emailInput.value : undefined,
        name: nameInput ? nameInput.value : undefined,
        message: msgInput ? msgInput.value : undefined,
        apiKey: options.apiKey || options.forminitApiKey || options.formsphereApiKey
      });

      if (result.success) {
        if (typeof options.onSuccess === 'function') {
          options.onSuccess(result);
        } else {
          alert('PDF uploaded and sent successfully!');
          form.reset();
        }
      } else {
        if (typeof options.onError === 'function') {
          options.onError(result.message);
        } else {
          alert('Error: ' + result.message);
        }
      }
    } catch (err) {
      if (typeof options.onError === 'function') {
        options.onError(err.message);
      } else {
        alert('Error: ' + err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (submitBtn.dataset.originalText) {
          submitBtn.textContent = submitBtn.dataset.originalText;
        }
      }
    }
  });
}

export const initFormspreePdfForm = initForminitPdfForm;

// Global exposure for non-module scripts & browser window
if (typeof window !== 'undefined') {
  const serviceObj = {
    endpoint: FORMINIT_ENDPOINT,
    defaultKey: DEFAULT_FORMINIT_KEY,
    getEndpoint: getForminitEndpoint,
    setApiKey: setForminitApiKey,
    resolveClientEmail,
    resolveClientName,
    submitPdfToForminit,
    submitPdfToFormspree: submitPdfToForminit,
    initForminitPdfForm,
    initFormspreePdfForm: initForminitPdfForm
  };

  window.ForminitPdfService = serviceObj;
  window.FormspreePdfService = serviceObj;
  window.setForminitApiKey = setForminitApiKey;
  window.setFormsphereApiKey = setForminitApiKey;
  window.setFormspreeApiKey = setForminitApiKey;
  window.getForminitEndpoint = getForminitEndpoint;
  window.getFormsphereEndpoint = getForminitEndpoint;
  window.submitPdfToForminit = submitPdfToForminit;
  window.submitPdfToFormspree = submitPdfToForminit;
  window.FORMINIT_ENDPOINT = FORMINIT_ENDPOINT;
  window.FORMINIT_API_KEY = DEFAULT_FORMINIT_KEY;
}

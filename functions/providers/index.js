/**
 * ============================================================================
 * THE FILE ROOM — KBA PROVIDER FACTORY
 * functions/providers/index.js
 * ============================================================================
 */

'use strict';

const { KBA_STATUS, VALID_TRANSITIONS, isValidTransition } = require('./kba-interface');
const { PersonaAdapter } = require('./persona-adapter');
const { MockKbaAdapter } = require('./mock-adapter');

/**
 * Returns the configured provider adapter.
 * @param {Object} options
 * @param {string} [options.apiKey] - Provider API key from Secret Manager
 * @param {string} [options.templateId] - Provider template ID
 * @param {string} [options.providerName] - Override provider selection ('persona' | 'mock')
 * @returns {import('./kba-interface').KbaProviderAdapter}
 */
function getKbaProvider(options = {}) {
  const providerType = options.providerName || process.env.KBA_PROVIDER || 'persona';

  if (providerType === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[SECURITY FATAL] Cannot load mock KBA adapter in production.');
    }
    return new MockKbaAdapter();
  }

  // Default production enterprise adapter: Persona
  return new PersonaAdapter({
    apiKey: options.apiKey,
    templateId: options.templateId,
  });
}

module.exports = {
  getKbaProvider,
  KBA_STATUS,
  VALID_TRANSITIONS,
  isValidTransition,
};

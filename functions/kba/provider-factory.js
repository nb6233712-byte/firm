/**
 * ============================================================================
 * THE FILE ROOM — KBA PROVIDER FACTORY
 * ============================================================================
 * Instantiates the appropriate IdentityVerificationProvider adapter
 * based on configuration and server-side secrets.
 */

'use strict';

const PersonaAdapter = require('./adapters/persona-adapter');
const MockAdapter = require('./adapters/mock-adapter');
const LexisNexisAdapter = require('./adapters/lexisnexis-adapter');
const ExperianAdapter = require('./adapters/experian-adapter');

/**
 * Creates an IdentityVerificationProvider instance.
 * 
 * @param {Object} options
 * @param {string} [options.providerName] - 'persona', 'lexisnexis', 'experian', 'mock'
 * @param {string} [options.apiKey] - Provider API key from Google Cloud Secret Manager
 * @param {string} [options.templateId] - Provider template ID
 * @param {string} [options.apiBase] - Optional custom base URL
 * @returns {IdentityVerificationProvider}
 */
function createProvider(options = {}) {
  const providerName = (
    options.providerName ||
    process.env.KBA_PROVIDER ||
    (process.env.NODE_ENV === 'test' ? 'mock' : 'persona')
  ).toLowerCase();

  switch (providerName) {
    case 'persona':
      return new PersonaAdapter({
        apiKey: options.apiKey,
        templateId: options.templateId || process.env.KBA_TEMPLATE_ID,
        apiBase: options.apiBase || process.env.KBA_PROVIDER_URL
      });

    case 'lexisnexis':
      return new LexisNexisAdapter({
        apiKey: options.apiKey,
        orgId: options.orgId || process.env.LEXISNEXIS_ORG_ID,
        flowId: options.flowId || process.env.LEXISNEXIS_FLOW_ID
      });

    case 'experian':
      return new ExperianAdapter({
        clientId: options.clientId || process.env.EXPERIAN_CLIENT_ID,
        clientSecret: options.clientSecret || options.apiKey,
        subcode: options.subcode || process.env.EXPERIAN_SUBCODE
      });

    case 'mock':
      return new MockAdapter({
        simulatedOutcome: options.simulatedOutcome || 'passed'
      });

    default:
      throw new Error(`Unsupported identity verification provider: ${providerName}`);
  }
}

module.exports = {
  createProvider
};

/**
 * ============================================================================
 * THE FILE ROOM — DURABLE DOCUMENT DELIVERY QUEUE
 * functions/delivery-queue/backoff.js
 * ============================================================================
 * Exponential Backoff with Full Jitter & HTTP Error Classification
 *
 * Implements standard AWS Architecture Full Jitter algorithm:
 *   sleep = rand(0, min(max_backoff, base_backoff * 2^(attempt - 1)))
 *
 * Specific handling for HTTP 429 Retry-After header (seconds or RFC 7231 date)
 * and distinct treatment for 5xx vs non-retryable 4xx client errors.
 */

'use strict';

const { ERROR_CATEGORY, QUEUE_CONFIG } = require('./constants');

/**
 * Parses HTTP Retry-After header.
 * Supports:
 * - Integer seconds (e.g. "120")
 * - HTTP-date string (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
 *
 * @param {string|number|null} headerValue
 * @param {number} [nowMs]
 * @returns {number|null} Seconds to wait, or null if unparseable/missing
 */
function parseRetryAfterHeader(headerValue, nowMs = Date.now()) {
  if (headerValue == null || headerValue === '') return null;

  const str = String(headerValue).trim();

  // 1. Try parsing integer seconds
  const numericVal = parseInt(str, 10);
  if (!isNaN(numericVal) && String(numericVal) === str && numericVal >= 0) {
    return numericVal;
  }

  // 2. Try parsing HTTP-date format
  const parsedDate = Date.parse(str);
  if (!isNaN(parsedDate)) {
    const diffSeconds = Math.ceil((parsedDate - nowMs) / 1000);
    return Math.max(0, diffSeconds);
  }

  return null;
}

/**
 * Calculates exponential backoff with Full Jitter.
 * If Retry-After is present, backoff is bounded below by Retry-After.
 *
 * @param {number} attemptCount - 1-based attempt index of the current attempt
 * @param {Object} [options]
 * @param {number} [options.baseBackoffSeconds] - Default 5s
 * @param {number} [options.maxBackoffSeconds] - Default 300s
 * @param {string|number|null} [options.retryAfterHeader] - Optional Retry-After header value
 * @param {number} [options.nowMs] - Base timestamp
 * @param {Function} [options.randomFn] - RNG for deterministic unit testing (defaults to Math.random)
 * @returns {{ backoffSeconds: number, backoffMs: number, nextAttemptAt: string, retryAfterSeconds: number|null }}
 */
function calculateExponentialBackoff(attemptCount, options = {}) {
  const baseSec = options.baseBackoffSeconds || QUEUE_CONFIG.BASE_BACKOFF_SECONDS;
  const maxSec = options.maxBackoffSeconds || QUEUE_CONFIG.MAX_BACKOFF_SECONDS;
  const now = options.nowMs || Date.now();
  const rng = typeof options.randomFn === 'function' ? options.randomFn : Math.random;

  // Bounded exponential calculation: base * 2^(attempt - 1)
  const attemptIndex = Math.max(1, attemptCount);
  const rawExponentialSec = Math.min(maxSec, baseSec * Math.pow(2, attemptIndex - 1));

  // Full Jitter: Uniform random between 0 and rawExponentialSec
  const jitterFraction = rng();
  let jitteredSec = Math.round(jitterFraction * rawExponentialSec);
  // Ensure at least 1 second delay
  if (jitteredSec < 1) jitteredSec = 1;

  // Handle explicit Retry-After header
  const retryAfterSec = parseRetryAfterHeader(options.retryAfterHeader, now);
  let effectiveSec = jitteredSec;
  if (retryAfterSec !== null && retryAfterSec > 0) {
    // Honor downstream rate limiter by taking maximum of Retry-After and jittered backoff, capped at maxSec * 2
    effectiveSec = Math.min(maxSec * 2, Math.max(retryAfterSec, jitteredSec));
  }

  const backoffMs = effectiveSec * 1000;
  const nextAttemptAt = new Date(now + backoffMs).toISOString();

  return {
    backoffSeconds: effectiveSec,
    backoffMs,
    nextAttemptAt,
    retryAfterSeconds: retryAfterSec,
  };
}

/**
 * Classifies an HTTP response status code into retryable vs non-retryable error categories.
 *
 * @param {number|null} statusCode
 * @returns {{ retryable: boolean, category: string, isRateLimit: boolean, isServerError: boolean }}
 */
function classifyHttpStatus(statusCode) {
  if (statusCode == null) {
    return {
      retryable: true,
      category: ERROR_CATEGORY.NETWORK_TIMEOUT,
      isRateLimit: false,
      isServerError: false,
    };
  }

  const code = Number(statusCode);

  // HTTP 429: Rate Limited (Retryable)
  if (code === 429) {
    return {
      retryable: true,
      category: ERROR_CATEGORY.RATE_LIMITED_429,
      isRateLimit: true,
      isServerError: false,
    };
  }

  // HTTP 408: Request Timeout (Retryable)
  if (code === 408) {
    return {
      retryable: true,
      category: ERROR_CATEGORY.NETWORK_TIMEOUT,
      isRateLimit: false,
      isServerError: false,
    };
  }

  // HTTP 5xx: Server Errors (Retryable)
  if (code >= 500 && code <= 599) {
    return {
      retryable: true,
      category: ERROR_CATEGORY.SERVER_ERROR_5XX,
      isRateLimit: false,
      isServerError: true,
    };
  }

  // HTTP 4xx: Client Errors (400, 401, 403, 404, 413, 415, 422, etc.)
  // These indicate invalid payload, unauthorized credentials, or unsupported types: NOT retryable.
  if (code >= 400 && code < 500) {
    return {
      retryable: false,
      category: ERROR_CATEGORY.NON_RETRYABLE_CLIENT_ERROR,
      isRateLimit: false,
      isServerError: false,
    };
  }

  // 2xx: Success
  if (code >= 200 && code < 300) {
    return {
      retryable: false,
      category: 'SUCCESS',
      isRateLimit: false,
      isServerError: false,
    };
  }

  return {
    retryable: false,
    category: ERROR_CATEGORY.UNKNOWN,
    isRateLimit: false,
    isServerError: false,
  };
}

module.exports = {
  parseRetryAfterHeader,
  calculateExponentialBackoff,
  classifyHttpStatus,
};

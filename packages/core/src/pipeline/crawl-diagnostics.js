/**
 * Pure helpers that turn raw crawl outcomes into the diagnostics object
 * returned alongside the crawled pages. Kept separate from crawl.js (which
 * drives a browser) so the decision logic is unit-testable in isolation.
 */

/**
 * Decide the login diagnostic entry.
 *
 * @param {object} input
 * @param {boolean} input.attempted  Whether credentials were present and a
 *   login was tried at all.
 * @param {unknown} [input.error]    The error thrown by the login attempt, if
 *   it failed. Anything falsy means the attempt completed without throwing.
 * @returns {{attempted: boolean, success: boolean, reason: string|null}}
 */
export function summarizeLogin({ attempted, error = null }) {
  if (!attempted) {
    return { attempted: false, success: false, reason: null };
  }
  if (error) {
    const reason = String(error && error.message ? error.message : error).slice(0, 200);
    return { attempted: true, success: false, reason };
  }
  return { attempted: true, success: true, reason: null };
}

/**
 * Decide whether the crawl loop ended early, and why.
 *
 * @param {object} input
 * @param {number} input.pageCount         Pages actually captured.
 * @param {number} input.maxPages          Effective page cap for the run.
 * @param {boolean} input.deadlineExceeded Whether the overall time budget ran out.
 * @returns {{stoppedEarly: boolean, reason: 'maxPages'|'timeLimit'|null}}
 */
export function determineEarlyStop({ pageCount, maxPages, deadlineExceeded }) {
  if (pageCount >= maxPages) {
    return { stoppedEarly: true, reason: 'maxPages' };
  }
  if (deadlineExceeded) {
    return { stoppedEarly: true, reason: 'timeLimit' };
  }
  return { stoppedEarly: false, reason: null };
}

/**
 * A fully-populated diagnostics object with neutral defaults, so every field
 * is always present (never undefined) even when a crawl ends before any of
 * the corresponding events happened.
 */
export function emptyDiagnostics() {
  return {
    login: summarizeLogin({ attempted: false }),
    excludedUrls: [],
    failedPages: [],
    earlyStop: determineEarlyStop({ pageCount: 0, maxPages: Infinity, deadlineExceeded: false }),
  };
}

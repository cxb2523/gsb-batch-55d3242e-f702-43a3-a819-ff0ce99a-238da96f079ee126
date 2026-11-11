import { globToRegExp, isExcluded, normalize } from './url-utils.js';
import { summarizeLogin, determineEarlyStop, emptyDiagnostics } from './crawl-diagnostics.js';

/**
 * Same-origin site crawler (ported/adapted from the qaaas discovery flow).
 *
 * BFS over <a href> links from the homepage, capturing each page's URL, title,
 * and a snippet of visible text. Optional credential login runs first so the
 * crawl can reach authenticated app surfaces. The crawled pages feed Claude in
 * feature-detect.js.
 *
 * crawlSite returns `{ pages, diagnostics }`: the pages array is unchanged in
 * shape, and diagnostics records what happened along the way — login outcome,
 * excluded URLs, per-page navigation failures, and whether the run stopped
 * early (maxPages cap or the 5-minute overall deadline).
 */

export { globToRegExp, isExcluded, normalize };
export { summarizeLogin, determineEarlyStop };

// Playwright is imported lazily so this module (and its tests, which inject a
// stubbed browser via opts.launchBrowser) loads in environments where the
// playwright package — or its browser binaries — are unavailable.
async function defaultLaunchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

// Best-effort heuristic login using Playwright (the existing auth handler is
// Puppeteer-bound; here we keep the crawler self-contained on Playwright).
// Individual field interactions are tolerant, but unexpected errors propagate
// to crawlSite, which records them in diagnostics and keeps crawling.
async function tryLogin(page, { loginUrl, homepageUrl, user, password }, log) {
  await page.goto(loginUrl || homepageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

  const emailSel = 'input[type="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i]';
  const passSel = 'input[type="password"]';
  const email = page.locator(emailSel).first();
  const pass = page.locator(passSel).first();

  if (await email.count()) await email.fill(user, { timeout: 4000 }).catch(() => {});
  if (await pass.count()) await pass.fill(password, { timeout: 4000 }).catch(() => {});

  const submit = page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
    .first();
  if (await submit.count()) await submit.click({ timeout: 4000 }).catch(() => {});
  else await pass.press('Enter').catch(() => {});

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  log?.(`Attempted login as ${user}`);
}

/**
 * @param {object} opts
 * @param {string} opts.homepageUrl
 * @param {number} [opts.maxPages]
 * @param {{user,password,loginUrl?}|null} [opts.credentials]
 * @param {string[]} [opts.excludedPaths]
 * @param {(msg:string)=>void} [opts.log]
 * @param {()=>Promise<object>} [opts.launchBrowser]  Browser factory override
 *   (test stub); defaults to launching headless Chromium via Playwright.
 * @returns {Promise<{pages: Array<{url,title,text}>, diagnostics: {
 *   login: {attempted: boolean, success: boolean, reason: string|null},
 *   excludedUrls: string[],
 *   failedPages: Array<{url: string, reason: string}>,
 *   earlyStop: {stoppedEarly: boolean, reason: 'maxPages'|'timeLimit'|null},
 * }}>}
 */
export async function crawlSite(opts) {
  const maxPages = Math.min(opts.maxPages || 20, 40);
  const excludePatterns = (opts.excludedPaths ?? []).map((p) => p.trim()).filter(Boolean).map(globToRegExp);
  const log = opts.log;
  const launchBrowser = opts.launchBrowser || defaultLaunchBrowser;

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    const origin = new URL(opts.homepageUrl).origin;
    const deadline = Date.now() + 5 * 60 * 1000;

    const diagnostics = emptyDiagnostics();
    const excludedSeen = new Set();
    const noteExcluded = (url) => {
      if (!excludedSeen.has(url)) {
        excludedSeen.add(url);
        diagnostics.excludedUrls.push(url);
      }
    };

    const loginAttempted = Boolean(opts.credentials?.user && opts.credentials?.password);
    if (loginAttempted) {
      try {
        await tryLogin(page, { ...opts.credentials, homepageUrl: opts.homepageUrl }, log);
        diagnostics.login = summarizeLogin({ attempted: true });
      } catch (err) {
        // Login failure must not abort the crawl — record it and continue
        // unauthenticated (pages behind a login wall will just capture the
        // wall's text).
        diagnostics.login = summarizeLogin({ attempted: true, error: err });
        log?.(`Login failed, continuing unauthenticated: ${diagnostics.login.reason}`);
      }
    }

    const visited = new Set();
    const queue = [normalize(opts.homepageUrl)];
    const pages = [];

    while (queue.length && pages.length < maxPages && Date.now() < deadline) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      if (isExcluded(url, excludePatterns)) {
        noteExcluded(url);
        continue;
      }

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

        const title = await page.title();
        const text = (await page.locator('body').innerText({ timeout: 4000 }).catch(() => '')).slice(0, 1500);
        pages.push({ url, title, text });
        log?.(`Crawled ${title || url}`);

        const links = await page.evaluate(
          (org) =>
            Array.from(document.querySelectorAll('a[href]'))
              .map((a) => a.href)
              .filter((h) => {
                try {
                  return new URL(h).origin === org;
                } catch {
                  return false;
                }
              }),
          origin,
        );

        for (const link of links.map(normalize)) {
          if (isExcluded(link, excludePatterns)) {
            noteExcluded(link);
            continue;
          }
          if (!visited.has(link) && !queue.includes(link) && queue.length < maxPages * 3) {
            queue.push(link);
          }
        }
      } catch (err) {
        const reason = String(err && err.message ? err.message : err).slice(0, 120);
        diagnostics.failedPages.push({ url, reason });
        log?.(`Skipped ${url}: ${reason}`);
      }
    }

    diagnostics.earlyStop = determineEarlyStop({
      pageCount: pages.length,
      maxPages,
      deadlineExceeded: Date.now() >= deadline,
    });

    return { pages, diagnostics };
  } finally {
    await browser.close();
  }
}

import { expect } from 'chai';
import { globToRegExp, isExcluded, normalize } from '../../packages/core/src/pipeline/url-utils.js';
import { summarizeLogin, determineEarlyStop } from '../../packages/core/src/pipeline/crawl-diagnostics.js';
import { crawlSite } from '../../packages/core/src/pipeline/crawl.js';

/**
 * Build a Playwright-shaped stub browser over an in-memory site map:
 *   { 'https://x.com/': { title, text, links: [absolute urls] } }
 * A page entry with `error` makes goto() throw (navigation failure).
 * loginBehavior 'throw' makes the login-form locator throw (login failure).
 */
function makeStubLaunch(site, { loginBehavior = 'ok' } = {}) {
  return async () => {
    let currentUrl = null;
    const page = {
      async goto(url) {
        const entry = site[url];
        if (entry && entry.error) throw new Error(entry.error);
        currentUrl = url;
      },
      async waitForLoadState() {},
      locator(sel) {
        if (sel === 'body') {
          return { innerText: async () => (currentUrl && site[currentUrl] ? site[currentUrl].text : '') };
        }
        if (loginBehavior === 'throw') throw new Error('login DOM unavailable');
        return {
          first: () => ({
            count: async () => 0,
            fill: async () => {},
            click: async () => {},
            press: async () => {},
          }),
        };
      },
      async title() {
        return currentUrl && site[currentUrl] ? site[currentUrl].title : '';
      },
      async evaluate() {
        return currentUrl && site[currentUrl] ? site[currentUrl].links || [] : [];
      },
    };
    return {
      newContext: async () => ({ newPage: async () => page }),
      close: async () => {},
    };
  };
}

describe('crawl helpers', () => {
  it('converts a glob to an anchored regexp', () => {
    const re = globToRegExp('/blog/*');
    expect(re.test('/blog/hello')).to.equal(true);
    expect(re.test('/blogger')).to.equal(false);
    expect(re.test('/docs/blog/x')).to.equal(false);
  });

  it('excludes paths matching any pattern', () => {
    const patterns = ['/blog/*', '/legal/*'].map(globToRegExp);
    expect(isExcluded('https://x.com/blog/a', patterns)).to.equal(true);
    expect(isExcluded('https://x.com/legal/terms', patterns)).to.equal(true);
    expect(isExcluded('https://x.com/app/dashboard', patterns)).to.equal(false);
  });

  it('returns false when there are no patterns', () => {
    expect(isExcluded('https://x.com/anything', [])).to.equal(false);
  });

  it('strips the hash fragment when normalizing', () => {
    expect(normalize('https://x.com/a#section')).to.equal('https://x.com/a');
  });
});

describe('crawl diagnostics helpers', () => {
  it('marks login as not attempted without credentials', () => {
    expect(summarizeLogin({ attempted: false })).to.deep.equal({
      attempted: false,
      success: false,
      reason: null,
    });
  });

  it('summarizes a failed login with a reason', () => {
    const r = summarizeLogin({ attempted: true, error: new Error('boom') });
    expect(r.attempted).to.equal(true);
    expect(r.success).to.equal(false);
    expect(r.reason).to.contain('boom');
  });

  it('flags maxPages as the early-stop reason', () => {
    expect(determineEarlyStop({ pageCount: 2, maxPages: 2, deadlineExceeded: false })).to.deep.equal({
      stoppedEarly: true,
      reason: 'maxPages',
    });
  });

  it('flags the time limit only when the deadline was hit', () => {
    expect(determineEarlyStop({ pageCount: 1, maxPages: 5, deadlineExceeded: true })).to.deep.equal({
      stoppedEarly: true,
      reason: 'timeLimit',
    });
    expect(determineEarlyStop({ pageCount: 1, maxPages: 5, deadlineExceeded: false })).to.deep.equal({
      stoppedEarly: false,
      reason: null,
    });
  });
});

describe('crawlSite (stubbed browser)', () => {
  const site = {
    'https://x.com/': {
      title: 'Home',
      text: 'Welcome to the product',
      links: ['https://x.com/about', 'https://x.com/app/dashboard'],
    },
    'https://x.com/about': { title: 'About', text: 'About us', links: [] },
    'https://x.com/app/dashboard': { title: 'Sign in', text: 'Please log in to continue', links: [] },
  };

  it('returns { pages, diagnostics } with url/title/text per page', async () => {
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      launchBrowser: makeStubLaunch(site),
    });
    expect(pages).to.have.lengthOf(3);
    for (const p of pages) {
      expect(p).to.have.all.keys('url', 'title', 'text');
    }
    expect(pages[0]).to.deep.equal({ url: 'https://x.com/', title: 'Home', text: 'Welcome to the product' });
    expect(diagnostics).to.have.all.keys('login', 'excludedUrls', 'failedPages', 'earlyStop');
  });

  it('does not attempt login without credentials', async () => {
    const { diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      credentials: null,
      launchBrowser: makeStubLaunch(site),
    });
    expect(diagnostics.login).to.deep.equal({ attempted: false, success: false, reason: null });
  });

  it('marks a successful login as logged in', async () => {
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      credentials: { user: 'u@x.com', password: 'pw' },
      launchBrowser: makeStubLaunch(site),
    });
    expect(diagnostics.login).to.deep.equal({ attempted: true, success: true, reason: null });
    // the login-wall page is still captured as a normal page
    expect(pages.map((p) => p.url)).to.include('https://x.com/app/dashboard');
  });

  it('keeps crawling and reports the failure when login throws', async () => {
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      credentials: { user: 'u@x.com', password: 'pw' },
      launchBrowser: makeStubLaunch(site, { loginBehavior: 'throw' }),
    });
    expect(diagnostics.login.attempted).to.equal(true);
    expect(diagnostics.login.success).to.equal(false);
    expect(diagnostics.login.reason).to.contain('login DOM unavailable');
    expect(pages.length).to.be.greaterThan(0);
    expect(pages[0].url).to.equal('https://x.com/');
  });

  it('flags early stop when maxPages is reached', async () => {
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      maxPages: 2,
      launchBrowser: makeStubLaunch(site),
    });
    expect(pages).to.have.lengthOf(2);
    expect(diagnostics.earlyStop).to.deep.equal({ stoppedEarly: true, reason: 'maxPages' });
  });

  it('does not flag early stop when the queue drains first', async () => {
    const { diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      launchBrowser: makeStubLaunch(site),
    });
    expect(diagnostics.earlyStop).to.deep.equal({ stoppedEarly: false, reason: null });
  });

  it('records URLs excluded by excludedPaths', async () => {
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      excludedPaths: ['/app/*'],
      launchBrowser: makeStubLaunch(site),
    });
    expect(diagnostics.excludedUrls).to.deep.equal(['https://x.com/app/dashboard']);
    expect(pages.map((p) => p.url)).to.not.include('https://x.com/app/dashboard');
  });

  it('records navigation failures with a reason', async () => {
    const broken = {
      'https://x.com/': { title: 'Home', text: 'hi', links: ['https://x.com/dead'] },
      'https://x.com/dead': { error: 'net::ERR_CONNECTION_REFUSED' },
    };
    const { pages, diagnostics } = await crawlSite({
      homepageUrl: 'https://x.com/',
      launchBrowser: makeStubLaunch(broken),
    });
    expect(pages.map((p) => p.url)).to.deep.equal(['https://x.com/']);
    expect(diagnostics.failedPages).to.have.lengthOf(1);
    expect(diagnostics.failedPages[0].url).to.equal('https://x.com/dead');
    expect(diagnostics.failedPages[0].reason).to.contain('ERR_CONNECTION_REFUSED');
  });
});

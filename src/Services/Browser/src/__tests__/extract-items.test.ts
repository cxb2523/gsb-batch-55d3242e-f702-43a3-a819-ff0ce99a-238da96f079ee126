import { describe, it, expect, vi } from 'vitest';
import type { BrowserClaw, CrawlPage } from 'browserclaw';
import { extractItems, extractItemsFromUrls, MAX_CONCURRENCY } from '../skills/extract-items.js';

function mockPage(evaluateImpl: (expr: string) => unknown): CrawlPage {
  return {
    evaluate: vi.fn().mockImplementation((expr: string) => Promise.resolve(evaluateImpl(expr))),
  } as unknown as CrawlPage;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('extractItems', () => {
  it('returns empty when evaluator returns no records', async () => {
    const page = mockPage(() => ({ source: 'none', records: [] }));
    const result = await extractItems(page);
    expect(result.source).toBe('none');
    expect(result.count).toBe(0);
    expect(result.records).toEqual([]);
  });

  it('passes through records and counts them', async () => {
    const records = [
      { price: '$3,995', address: 'W 21st St', bedrooms: 'Studio', url: 'https://x/1' },
      { price: '$4,100', address: 'W 22nd St', bedrooms: '1', url: 'https://x/2' },
    ];
    const page = mockPage(() => ({ source: 'next-data', records }));
    const result = await extractItems(page);
    expect(result.source).toBe('next-data');
    expect(result.count).toBe(2);
    expect(result.records).toEqual(records);
    expect(result.truncated).toBe(false);
  });

  it('marks truncated when records exceed cap', async () => {
    const records = Array.from({ length: 60 }, (_, i) => ({ id: i, url: `https://x/${String(i)}` }));
    const page = mockPage(() => ({ source: 'dom', records }));
    const result = await extractItems(page);
    expect(result.truncated).toBe(true);
    expect(result.records).toHaveLength(50);
  });

  it('swallows evaluator errors and returns none', async () => {
    const page = mockPage(() => {
      throw new Error('page.evaluate failed');
    });
    const result = await extractItems(page);
    expect(result.source).toBe('none');
    expect(result.count).toBe(0);
  });

  it('returns none when evaluator returns non-object', async () => {
    const page = mockPage(() => 'weird string');
    const result = await extractItems(page);
    expect(result.source).toBe('none');
  });
});

interface FakeTabConfig {
  records?: Record<string, unknown>[];
  openError?: Error;
  waitError?: Error;
  waitMs?: number;
}

interface FakeBrowserHarness {
  browser: BrowserClaw;
  openedUrls: string[];
  closedTabIds: string[];
  peakOpenTabs: () => number;
}

function createFakeBrowser(configs: Record<string, FakeTabConfig> = {}): FakeBrowserHarness {
  const openedUrls: string[] = [];
  const closedTabIds: string[] = [];
  let openTabs = 0;
  let peakTabs = 0;
  let tabCounter = 0;

  const browser = {
    open: vi.fn((url: string) => {
      const config = configs[url] ?? {};
      if (config.openError !== undefined) return Promise.reject(config.openError);

      tabCounter += 1;
      openTabs += 1;
      peakTabs = Math.max(peakTabs, openTabs);
      openedUrls.push(url);
      const tabId = `tab-${String(tabCounter)}`;

      return Promise.resolve({
        id: tabId,
        waitFor: vi.fn(async () => {
          if (config.waitMs !== undefined && config.waitMs > 0) await delay(config.waitMs);
          if (config.waitError !== undefined) throw config.waitError;
        }),
        evaluate: vi.fn(() => Promise.resolve({ source: 'next-data', records: config.records ?? [] })),
      });
    }),
    close: vi.fn((id: string) => {
      closedTabIds.push(id);
      openTabs -= 1;
      return Promise.resolve();
    }),
  } as unknown as BrowserClaw;

  return {
    browser,
    openedUrls,
    closedTabIds,
    peakOpenTabs: () => peakTabs,
  };
}

describe('extractItemsFromUrls', () => {
  it('opens each URL, extracts items, aggregates with sourceUrl, closes tabs', async () => {
    const harness = createFakeBrowser({
      'https://x/1': { records: [{ price: '$3,000', beds: '1' }] },
      'https://x/2': { records: [{ price: '$4,000', beds: '2' }] },
    });

    const result = await extractItemsFromUrls(harness.browser, ['https://x/1', 'https://x/2'], {
      concurrency: 2,
    });

    expect(result.count).toBe(2);
    expect(harness.openedUrls).toEqual(['https://x/1', 'https://x/2']);
    expect(result.records[0]).toEqual({
      price: '$3,000',
      beds: '1',
      sourceUrl: 'https://x/1',
    });
    expect(result.records[1]).toEqual({
      price: '$4,000',
      beds: '2',
      sourceUrl: 'https://x/2',
    });
    expect(result.failedUrls).toEqual([]);
    expect(harness.closedTabIds).toHaveLength(2);
  });

  it('groups records by first-seen URL order even when later URLs finish first', async () => {
    const harness = createFakeBrowser({
      'https://x/slow': { records: [{ id: 'a1' }, { id: 'a2' }], waitMs: 30 },
      'https://x/fast': { records: [{ id: 'b1' }] },
      'https://x/mid': { records: [{ id: 'c1' }], waitMs: 10 },
    });

    const result = await extractItemsFromUrls(
      harness.browser,
      ['https://x/slow', 'https://x/fast', 'https://x/mid'],
      { concurrency: 3 },
    );

    expect(result.count).toBe(4);
    expect(result.records.map((r) => r.id)).toEqual(['a1', 'a2', 'b1', 'c1']);
    expect(result.records.map((r) => r.sourceUrl)).toEqual([
      'https://x/slow',
      'https://x/slow',
      'https://x/fast',
      'https://x/mid',
    ]);
    expect(harness.closedTabIds).toHaveLength(3);
  });

  it('reports readable failure reasons without aborting the batch and closes every opened tab', async () => {
    const harness = createFakeBrowser({
      'https://x/good-1': { records: [{ id: 'g1' }] },
      'https://x/bad-open': { openError: new Error('navigation failed') },
      'https://x/bad-wait': { waitError: new Error('page did not render') },
      'https://x/good-2': { records: [{ id: 'g2' }] },
    });

    const result = await extractItemsFromUrls(harness.browser, [
      'https://x/good-1',
      'https://x/bad-open',
      'https://x/bad-wait',
      'https://x/good-2',
    ]);

    expect(result.count).toBe(2);
    expect(result.records.map((r) => r.id)).toEqual(['g1', 'g2']);
    expect(result.failedUrls).toEqual([
      { url: 'https://x/bad-open', reason: 'navigation failed' },
      { url: 'https://x/bad-wait', reason: 'page did not render' },
    ]);
    // The failed open never created a tab; the other three tabs were all closed.
    expect(harness.openedUrls).toEqual(['https://x/good-1', 'https://x/bad-wait', 'https://x/good-2']);
    expect(harness.closedTabIds).toHaveLength(harness.openedUrls.length);
  });

  it('filters empty/non-string values, dedupes in first-seen order, and caps at 10 URLs', async () => {
    const unique = Array.from({ length: 15 }, (_, i) => `https://x/${String(i)}`);
    const configs = Object.fromEntries(
      unique.map((url, i) => [url, { records: [{ id: `r-${String(i)}` }] }]),
    ) as Record<string, FakeTabConfig>;
    const input = [
      unique[0],
      '',
      unique[1],
      unique[0],
      null,
      42,
      unique[2],
      unique[3],
      ...unique.slice(4),
    ] as unknown as string[];
    const harness = createFakeBrowser(configs);

    const result = await extractItemsFromUrls(harness.browser, input);

    const expectedUrls = unique.slice(0, 10);
    expect(harness.openedUrls).toHaveLength(10);
    expect(new Set(harness.openedUrls)).toEqual(new Set(expectedUrls));
    expect(result.count).toBe(10);
    expect(result.records.map((r) => r.id)).toEqual(
      expectedUrls.map((_, i) => `r-${String(i)}`),
    );
    expect(result.records.map((r) => r.sourceUrl)).toEqual(expectedUrls);
  });

  it('never opens more tabs at once than the hard concurrency cap', async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://x/c/${String(i)}`);
    const configs = Object.fromEntries(urls.map((url) => [url, { waitMs: 20 }])) as Record<
      string,
      FakeTabConfig
    >;

    // Oversized, zero, negative, non-finite and non-numeric values all fall back to the cap.
    for (const requested of [99, 10, 2.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const harness = createFakeBrowser(configs);
      await extractItemsFromUrls(harness.browser, urls, { concurrency: requested });
      expect(harness.peakOpenTabs()).toBe(MAX_CONCURRENCY);
      expect(harness.closedTabIds).toHaveLength(urls.length);
    }

    // A legal smaller value is honored; the cap is an upper bound, not a minimum.
    const smallHarness = createFakeBrowser(configs);
    await extractItemsFromUrls(smallHarness.browser, urls, { concurrency: 2 });
    expect(smallHarness.peakOpenTabs()).toBe(2);
    expect(smallHarness.closedTabIds).toHaveLength(urls.length);
  });

  it('still caps each URL at 50 records', async () => {
    const records = Array.from({ length: 60 }, (_, i) => ({ id: i }));
    const harness = createFakeBrowser({ 'https://x/many': { records } });

    const result = await extractItemsFromUrls(harness.browser, ['https://x/many']);

    expect(result.count).toBe(50);
    expect(result.records[0]).toEqual({ id: 0, sourceUrl: 'https://x/many' });
    expect(result.records).toHaveLength(50);
  });
});


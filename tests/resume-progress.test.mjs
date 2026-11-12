// Timeout progress summaries and cursor-based resumption for batch/crawl jobs,
// against a local stub of the Olostep API. No API key or network access needed.
// Run with: npm run build && npm run test:resume

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";

let server;
let handler;

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const { status = 200, body } = handler(url, request.method);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.OLOSTEP_API_URL = `http://127.0.0.1:${server.address().port}/v1`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const tools = async () => ({
  ...(await import("../build/tools/batchScrapeUrls.js")),
  ...(await import("../build/tools/getBatchResults.js")),
  ...(await import("../build/tools/createCrawl.js")),
  ...(await import("../build/tools/getCrawlResults.js")),
});

const parse = (result) => JSON.parse(result.content[0].text);
const text = (result) => result.content[0].text;

const entries = (total, cursor, limit) =>
  Array.from(
    { length: Math.max(0, Math.min(limit, total - cursor)) },
    (_, i) => ({ url: `https://a.com/${cursor + i}`, retrieve_id: `r${cursor + i}` }),
  );

const notFound = () => ({ status: 404, body: { error: "not found" } });

test("batch timeout reports upstream progress and its cursor resumes the listing", async () => {
  const { batchScrapeUrls, getBatchResults } = await tools();
  const id = "batch_progress_1";
  let status = "in_progress";

  handler = (url, method) => {
    if (method === "POST" && url.pathname.endsWith("/batches")) {
      return { body: { id, object: "batch", status: "in_progress" } };
    }
    if (url.pathname.endsWith(`/batches/${id}/items`)) {
      const cursor = Number(url.searchParams.get("cursor"));
      const limit = Number(url.searchParams.get("limit"));
      const page = entries(5, cursor, limit);
      return { body: { items: page, ...(page.length > 0 && { cursor: cursor + limit }) } };
    }
    if (url.pathname.endsWith(`/batches/${id}`)) {
      return {
        body:
          status === "completed"
            ? { id, status, total_urls: 5, completed_urls: 5 }
            : { id, status, total_urls: 5, completed_urls: 2 },
      };
    }
    if (url.pathname.endsWith("/retrieve")) {
      return { body: { markdown_content: `content-${url.searchParams.get("retrieve_id")}` } };
    }
    return notFound();
  };

  const timed = await batchScrapeUrls.handler(
    { urls: ["https://a.com/0"], output_format: "markdown", wait_for_completion_seconds: 1 },
    "key",
  );
  assert.equal(timed.isError, undefined);
  const summary = parse(timed);
  assert.equal(summary.batch_id, id);
  assert.equal(summary.status, "in_progress");
  assert.equal(summary.completed_urls, 2);
  assert.equal(summary.total_urls, 5);
  assert.equal(summary.cursor, 2);
  assert.match(text(timed), new RegExp(`get_batch_results.*${summary.cursor}`));

  // The job finishes; resume exactly after the two already-completed entries.
  status = "completed";
  const resumed = parse(
    await getBatchResults.handler({ batch_id: id, items_limit: 2, cursor: summary.cursor }, "key"),
  );
  assert.deepEqual(resumed.items.map((item) => item.url), ["https://a.com/2", "https://a.com/3"]);
  assert.equal(resumed.has_more, true);
  assert.equal(resumed.next_cursor, 4);

  const last = parse(
    await getBatchResults.handler({ batch_id: id, items_limit: 2, cursor: resumed.next_cursor }, "key"),
  );
  assert.deepEqual(last.items.map((item) => item.url), ["https://a.com/4"]);
  assert.equal(last.has_more, true);

  // The empty page the API returns after the last item ends the listing: no next cursor.
  const end = parse(
    await getBatchResults.handler({ batch_id: id, items_limit: 2, cursor: last.next_cursor }, "key"),
  );
  assert.deepEqual(end.items, []);
  assert.equal(end.has_more, false);
  assert.equal(end.next_cursor, undefined);
});

test("crawl timeout reports upstream progress and its cursor resumes the listing", async () => {
  const { createCrawl, getCrawlResults } = await tools();
  const id = "crawl_progress_1";
  let status = "in_progress";

  handler = (url, method) => {
    if (method === "POST" && url.pathname.endsWith("/crawls")) {
      return { body: { id, object: "crawl", status: "in_progress", max_pages: 4 } };
    }
    if (url.pathname.endsWith(`/crawls/${id}/pages`)) {
      const cursor = Number(url.searchParams.get("cursor"));
      const limit = Number(url.searchParams.get("limit"));
      const page = entries(4, cursor, limit);
      return { body: { pages: page, ...(page.length > 0 && { cursor: cursor + limit }) } };
    }
    if (url.pathname.endsWith(`/crawls/${id}`)) {
      return {
        body:
          status === "completed"
            ? { id, status, pages_completed: 4, pages_total: 4 }
            : { id, status, pages_completed: 1, pages_total: 4 },
      };
    }
    if (url.pathname.endsWith("/retrieve")) {
      return { body: { markdown_content: `content-${url.searchParams.get("retrieve_id")}` } };
    }
    return notFound();
  };

  const timed = await createCrawl.handler(
    { url: "https://a.com", output_format: "markdown", wait_for_completion_seconds: 1 },
    "key",
  );
  assert.equal(timed.isError, undefined);
  const summary = parse(timed);
  assert.equal(summary.crawl_id, id);
  assert.equal(summary.status, "in_progress");
  assert.equal(summary.pages_completed, 1);
  assert.equal(summary.pages_total, 4);
  assert.equal(summary.cursor, 1);
  assert.match(text(timed), new RegExp(`get_crawl_results.*${summary.cursor}`));

  status = "completed";
  const resumed = parse(
    await getCrawlResults.handler({ crawl_id: id, items_limit: 2, cursor: summary.cursor }, "key"),
  );
  assert.deepEqual(resumed.pages.map((page) => page.url), ["https://a.com/1", "https://a.com/2"]);
  assert.equal(resumed.has_more, true);
  assert.equal(resumed.next_cursor, 3);
});

test("a cursor past the upstream item count is an error, not an empty list", async () => {
  const { getBatchResults, getCrawlResults } = await tools();
  handler = (url) => {
    if (url.pathname.endsWith("/batches/batch_range_1")) {
      return { body: { id: "batch_range_1", status: "completed", total_urls: 3 } };
    }
    if (url.pathname.endsWith("/crawls/crawl_range_1")) {
      return { body: { id: "crawl_range_1", status: "completed", pages_total: 3 } };
    }
    return notFound();
  };

  const batch = await getBatchResults.handler({ batch_id: "batch_range_1", cursor: 99 }, "key");
  assert.equal(batch.isError, true);
  assert.match(text(batch), /cursor_out_of_range/);
  assert.match(text(batch), /99/);
  assert.match(text(batch), /3/);

  const crawl = await getCrawlResults.handler({ crawl_id: "crawl_range_1", cursor: 99 }, "key");
  assert.equal(crawl.isError, true);
  assert.match(text(crawl), /cursor_out_of_range/);
  assert.match(text(crawl), /99/);
});

test("crossing job kinds names the right results tool", async () => {
  const { getBatchResults, getCrawlResults } = await tools();

  // Obvious ids are rejected without a request; mismatched resources found by
  // probing the other endpoint are rejected too.
  handler = (url) => {
    if (url.pathname.endsWith("/crawls/crawl_prefix_1")) {
      return { body: { id: "crawl_prefix_1", object: "crawl", status: "in_progress" } };
    }
    if (url.pathname.endsWith("/batches/batch_prefix_1")) {
      return { body: { id: "batch_prefix_1", object: "batch", status: "in_progress" } };
    }
    if (url.pathname.endsWith("/crawls/job_alpha_1")) {
      return { body: { id: "job_alpha_1", object: "crawl", status: "in_progress" } };
    }
    if (url.pathname.endsWith("/batches/job_beta_1")) {
      return { body: { id: "job_beta_1", object: "batch", status: "in_progress" } };
    }
    return notFound();
  };

  const crawlAsBatch = await getBatchResults.handler({ batch_id: "crawl_prefix_1" }, "key");
  assert.equal(crawlAsBatch.isError, true);
  assert.match(text(crawlAsBatch), /is a crawl, not a batch/);
  assert.match(text(crawlAsBatch), /get_crawl_results/);

  const batchAsCrawl = await getCrawlResults.handler({ crawl_id: "batch_prefix_1" }, "key");
  assert.equal(batchAsCrawl.isError, true);
  assert.match(text(batchAsCrawl), /is a batch, not a crawl/);
  assert.match(text(batchAsCrawl), /get_batch_results/);

  const probedCrawl = await getBatchResults.handler({ batch_id: "job_alpha_1" }, "key");
  assert.equal(probedCrawl.isError, true);
  assert.match(text(probedCrawl), /get_crawl_results/);

  const probedBatch = await getCrawlResults.handler({ crawl_id: "job_beta_1" }, "key");
  assert.equal(probedBatch.isError, true);
  assert.match(text(probedBatch), /get_batch_results/);
});

test("a job that completes during the wait returns its content, not a summary", async () => {
  const { batchScrapeUrls, createCrawl } = await tools();

  handler = (url, method) => {
    const isCrawl = url.pathname.includes("/crawls");
    if (method === "POST") return { body: { id: isCrawl ? "crawl_complete_1" : "batch_complete_1" } };
    if (url.pathname.endsWith("/retrieve")) {
      return { body: { markdown_content: `content-${url.searchParams.get("retrieve_id")}` } };
    }
    if (url.pathname.endsWith("/items")) {
      return { body: { items: entries(2, 0, 20) } };
    }
    if (url.pathname.endsWith("/pages")) {
      return { body: { pages: entries(2, 0, 20) } };
    }
    if (isCrawl) {
      return { body: { id: "crawl_complete_1", status: "completed", pages_completed: 2, pages_total: 2 } };
    }
    return { body: { id: "batch_complete_1", status: "completed", total_urls: 2, completed_urls: 2 } };
  };

  const batch = parse(await batchScrapeUrls.handler(
    { urls: ["https://a.com/0"], output_format: "markdown", wait_for_completion_seconds: 1 },
    "key",
  ));
  assert.equal(batch.status, "completed");
  assert.deepEqual(batch.items.map((item) => item.url), ["https://a.com/0", "https://a.com/1"]);

  const crawl = parse(await createCrawl.handler(
    { url: "https://a.com", output_format: "markdown", wait_for_completion_seconds: 1 },
    "key",
  ));
  assert.equal(crawl.status, "completed");
  assert.deepEqual(crawl.pages.map((page) => page.url), ["https://a.com/0", "https://a.com/1"]);
});

test("waiting stops immediately when the upstream job fails", async () => {
  const { batchScrapeUrls, createCrawl } = await tools();
  const started = Date.now();

  handler = (url, method) => {
    if (method === "POST") return { body: { id: url.pathname.endsWith("/crawls") ? "crawl_fail_1" : "batch_fail_1" } };
    if (url.pathname.endsWith("/crawls/crawl_fail_1")) {
      return { body: { id: "crawl_fail_1", status: "failed", error: "start_url could not be reached" } };
    }
    if (url.pathname.endsWith("/batches/batch_fail_1")) {
      return { body: { id: "batch_fail_1", status: "failed", reason: "not enough resources" } };
    }
    return notFound();
  };

  // Both waits are 2s; an immediate failure must not run the clock out.
  const batch = await batchScrapeUrls.handler(
    { urls: ["https://a.com"], output_format: "markdown", wait_for_completion_seconds: 2 },
    "key",
  );
  const crawl = await createCrawl.handler(
    { url: "https://a.com", output_format: "markdown", wait_for_completion_seconds: 2 },
    "key",
  );
  assert.ok((Date.now() - started) / 1000 < 8, "failure should end the wait, not run it out");

  assert.equal(batch.isError, true);
  assert.match(text(batch), /"status": "failed"/);
  assert.match(text(batch), /not enough resources/);
  assert.doesNotMatch(text(batch), /still in_progress/);

  assert.equal(crawl.isError, true);
  assert.match(text(crawl), /"status": "failed"/);
  assert.match(text(crawl), /start_url could not be reached/);
  assert.doesNotMatch(text(crawl), /still in_progress/);
});

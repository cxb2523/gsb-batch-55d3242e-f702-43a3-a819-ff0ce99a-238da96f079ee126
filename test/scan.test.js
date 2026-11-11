import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "zht-scan-"));
process.env.ZHT_HOME = home;

const { scan } = await import("../src/scan.js");
const { SCAN_STATUS_FILE, SEEN_FILE, DATA_DIR } = await import("../src/lib.js");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// Each test starts without leftover state from the previous one.
function resetDataDir() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

const okSource = (id, price = 1200) => async () => ({
  fetched: 1,
  listings: [{ id, price }],
});

test("a failing source does not stop the others and is marked as failed", async () => {
  resetDataDir();
  const status = await scan({
    broken: async () => {
      throw new Error("wgzimmer search 503\nsecond line of the error");
    },
    good: okSource("good-1"),
  });

  assert.equal(status.sources.broken.ok, false);
  assert.equal(status.sources.broken.status, "error");
  // Only the first line of the failure reason is kept.
  assert.equal(status.sources.broken.error, "wgzimmer search 503");
  assert.deepEqual(status.sources.good, {
    ok: true,
    status: "ok",
    fetched: 1,
    count: 1,
  });

  // scan_status.json was still written, and seen.json has only the
  // listings that were actually counted.
  assert.deepEqual(readJson(SCAN_STATUS_FILE), status);
  const seen = readJson(SEEN_FILE);
  assert.ok(seen["good-1"].firstSeen);
  assert.equal(Object.keys(seen).length, 1);
});

test("an empty result and an all-filtered result are distinguishable", async () => {
  resetDataDir();
  const status = await scan({
    empty: async () => ({ fetched: 0, listings: [] }),
    filtered: async () => ({
      fetched: 2,
      listings: [], // both were over the price limit
    }),
    good: okSource("good-2"),
  });

  assert.deepEqual(status.sources.empty, {
    ok: false,
    status: "empty",
    fetched: 0,
    count: 0,
  });
  assert.deepEqual(status.sources.filtered, {
    ok: false,
    status: "filtered",
    fetched: 2,
    count: 0,
  });
  assert.equal(status.sources.good.status, "ok");

  // Nothing from the empty or filtered sources lands in seen.json.
  assert.deepEqual(Object.keys(readJson(SEEN_FILE)), ["good-2"]);
});

test("an existing seen.json entry keeps its firstSeen", async () => {
  resetDataDir();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    SEEN_FILE,
    JSON.stringify({
      "good-3": { firstSeen: "2026-01-01T00:00:00.000Z", price: 900 },
    }),
  );

  await scan({ good: okSource("good-3", 1500) });

  const seen = readJson(SEEN_FILE);
  assert.equal(seen["good-3"].firstSeen, "2026-01-01T00:00:00.000Z");
  assert.equal(seen["good-3"].price, 900);
});

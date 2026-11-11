/**
 * The plugin's HTTP routes, against a real directory.
 *
 * The listing is the only source of truth for a canvas written by executed code, which
 * `collect.ts` cannot see at all (see `OPAQUE_WRITE` in `client/canvas/auto-open.ts` — it is
 * what asks this route again). Nothing tested it until that landed, so "the listing already
 * knows" was an assumption about a route with no coverage.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANVAS_DIR } from "../src/contract.ts";
import { ASSET_PREFIX, WASM_PATH } from "../src/contract-assets.ts";
import { serveAsset, serveCanvas } from "../src/index.ts";

const cwd = mkdtempSync(join(tmpdir(), "ui4a-route-"));
mkdirSync(join(cwd, CANVAS_DIR), { recursive: true });
writeFileSync(join(cwd, CANVAS_DIR, "dice.ui4a.tsx"), "export default () => <div />");
writeFileSync(join(cwd, CANVAS_DIR, "背单词.ui4a.tsx"), "export default () => <div />");
writeFileSync(join(cwd, CANVAS_DIR, "notes.txt"), "not a canvas");
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

/** A minimal ServerResponse: the handler only ever calls writeHead/end. */
const call = async (query: string, live: ReadonlySet<string> = new Set([cwd])) => {
  let status = 0,
    body = "";
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return res;
    },
  };
  await serveCanvas(() => live, { method: "GET", url: `/x?${query}` } as never, res as never);
  return { status, body };
};

describe("canvas listing", () => {
  test("lists every canvas, non-ASCII ids included", async () => {
    const { status, body } = await call(`cwd=${encodeURIComponent(cwd)}`);
    expect(status).toBe(200);
    expect(JSON.parse(body).toSorted()).toEqual(["dice", "背单词"]);
  });

  test("a file that is not a canvas is not listed", async () => {
    expect(JSON.parse((await call(`cwd=${encodeURIComponent(cwd)}`)).body)).not.toContain("notes");
  });

  // The fence that makes the route safe to expose: a cwd the session does not own is refused
  // before any filesystem call, so the route cannot be used to read arbitrary directories.
  test("a workspace this session does not own is refused", async () => {
    expect((await call(`cwd=${encodeURIComponent(cwd)}`, new Set())).status).toBe(403);
  });

  // The claim the OPAQUE_WRITE relist rests on: a canvas that appears on disk mid-session,
  // named by nothing in any tool call, is visible to a second listing. Without this the relist
  // is an assumption — asking again is only worth anything if the answer sees what arrived.
  // Its own directory: this test adds a file permanently, and the shared `cwd` is asserted
  // exhaustively by the listing test above. Sharing it passes in file order and fails under
  // `--randomize` about one run in three — the suite was passing on alphabetical luck.
  test("a canvas that appears after the first listing shows up in the next one", async () => {
    const fresh = mkdtempSync(join(tmpdir(), "ui4a-late-"));
    mkdirSync(join(fresh, CANVAS_DIR), { recursive: true });
    // `live` must name it: an unregistered cwd is rejected, which is the guard working.
    const list = async () => JSON.parse((await call(`cwd=${encodeURIComponent(fresh)}`, new Set([fresh]))).body) as string[];
    expect(await list()).not.toContain("late-arrival");
    writeFileSync(join(fresh, CANVAS_DIR, "late-arrival.ui4a.tsx"), "export default () => <div />");
    expect(await list()).toContain("late-arrival");
    rmSync(fresh, { recursive: true, force: true });
  });

  test("a missing canvases directory lists empty rather than failing", async () => {
    const bare = mkdtempSync(join(tmpdir(), "ui4a-bare-"));
    const { status, body } = await call(`cwd=${encodeURIComponent(bare)}`, new Set([bare]));
    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual([]);
    rmSync(bare, { recursive: true, force: true });
  });
});

describe("sub-page reads", () => {
  test("a sibling specifier resolves to the child file", async () => {
    mkdirSync(join(cwd, CANVAS_DIR, "tarot"), { recursive: true });
    writeFileSync(join(cwd, CANVAS_DIR, "tarot", "deck.tsx"), "export const DECK = []");
    const { status, body } = await call(`cwd=${encodeURIComponent(cwd)}&id=tarot&child=${encodeURIComponent("./deck")}&from=${encodeURIComponent(`${CANVAS_DIR}/tarot/board.tsx`)}`);
    expect(status).toBe(200);
    expect(body).toBe("export const DECK = []");
  });

  // The fence. `canvasChildPath` is unit-tested, but nothing checked that the ROUTE refuses what
  // it rejects — and this is the parameter an attacker controls.
  //
  // Each escape must name a file that REALLY EXISTS and really is outside the child directory.
  // The first version of this test used `../../../../etc/passwd` and passed with the entire
  // fence deleted: relative to a tmpdir that path resolves to nothing, so the 404 looked like a
  // refusal. A traversal test that cannot reach a real file tests nothing.
  test("a specifier escaping the child directory is refused", async () => {
    writeFileSync(join(cwd, "secret.txt"), "SECRET");
    mkdirSync(join(cwd, CANVAS_DIR, "other"), { recursive: true });
    writeFileSync(join(cwd, CANVAS_DIR, "other", "private.tsx"), "OTHER CANVAS");
    const from = encodeURIComponent(`${CANVAS_DIR}/tarot/board.tsx`);
    for (const escape of ["../../../secret.txt", "../other/private", "./../other/private"]) {
      const { status, body } = await call(`cwd=${encodeURIComponent(cwd)}&id=tarot&child=${encodeURIComponent(escape)}&from=${from}`);
      expect(status).toBe(400);
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain("OTHER CANVAS");
    }
  });

  /**
   * The other half of the fence: `from` is a query parameter too.
   *
   * The test above varies the escape and always sends an honest `from`, which is the obvious
   * half. `from` decides WHERE the specifier is resolved relative to, so a `from` naming another
   * canvas is a second way to ask for the same file — and it reaches the same route from the
   * same page.
   */
  test("a hostile `from` cannot reach another canvas either", async () => {
    writeFileSync(join(cwd, "secret.txt"), "SECRET");
    mkdirSync(join(cwd, CANVAS_DIR, "other"), { recursive: true });
    writeFileSync(join(cwd, CANVAS_DIR, "other", "private.tsx"), "OTHER CANVAS");
    for (const from of [`${CANVAS_DIR}/other/board.tsx`, `/etc/${CANVAS_DIR}/tarot/x.tsx`, "..", "", `${CANVAS_DIR}/tarot`]) {
      const { status, body } = await call(`cwd=${encodeURIComponent(cwd)}&id=tarot&child=${encodeURIComponent("./private")}&from=${encodeURIComponent(from)}`);
      expect(body).not.toContain("OTHER CANVAS");
      expect(body).not.toContain("SECRET");
      expect([400, 404]).toContain(status);
    }
  });

  /**
   * `id` names which canvas, and no test ever varied it — every call above sends `tarot`.
   *
   * It reaches `canvasChildDir(id)` and then a file read, so a traversal here is the same
   * exposure as one in `child`. `%2e%2e` is included because `isCanvasId` ACCEPTS it: the
   * character class rejects a literal dot, not its encoding. It is safe only because
   * `searchParams.get` has already decoded once and nothing decodes again — which is a property
   * of the route worth holding rather than assuming.
   */
  test("a traversing `id` reaches nothing", async () => {
    writeFileSync(join(cwd, "secret.txt"), "SECRET");
    mkdirSync(join(cwd, CANVAS_DIR, "other"), { recursive: true });
    writeFileSync(join(cwd, CANVAS_DIR, "other", "private.tsx"), "OTHER CANVAS");
    for (const id of ["../other", "..", "tarot/../other", ".", "%2e%2e", "%252e%252e"]) {
      const { status, body } = await call(`cwd=${encodeURIComponent(cwd)}&id=${encodeURIComponent(id)}&child=${encodeURIComponent("./private")}`);
      expect(body).not.toContain("OTHER CANVAS");
      expect(body).not.toContain("SECRET");
      expect([400, 404]).toContain(status);
    }
  });

  test("a specifier naming no file is a 404, not a 200 with an empty body", async () => {
    const { status } = await call(`cwd=${encodeURIComponent(cwd)}&id=tarot&child=${encodeURIComponent("./missing")}&from=${encodeURIComponent(`${CANVAS_DIR}/tarot/board.tsx`)}`);
    expect(status).toBe(404);
  });
});

// Registered as a PREFIX route, so every path under it reaches this handler and only the
// pathname check keeps it to one file. Nothing else in the plugin has that shape.
describe("wasm asset route", () => {
  const fetchAsset = async (path: string) => {
    let status = 0,
      headers: Record<string, string> = {};
    const res = {
      writeHead(code: number, h?: Record<string, string>) {
        status = code;
        headers = h ?? {};
        return res;
      },
      end() {
        return res;
      },
    };
    await serveAsset({ method: "GET", url: path } as never, res as never, join(cwd, "fake.wasm"));
    return { status, headers };
  };

  test("serves the wasm as application/wasm", async () => {
    writeFileSync(join(cwd, "fake.wasm"), "\0asm");
    const { status, headers } = await fetchAsset(WASM_PATH);
    expect(status).toBe(200);
    // instantiateStreaming rejects anything else, and the failure is silent.
    expect(headers["content-type"]).toBe("application/wasm");
  });

  test("any other path under the prefix is a 404", async () => {
    for (const path of [`${ASSET_PREFIX}/../../etc/passwd`, `${ASSET_PREFIX}/anything.js`, ASSET_PREFIX]) {
      expect((await fetchAsset(path)).status).toBe(404);
    }
  });
});

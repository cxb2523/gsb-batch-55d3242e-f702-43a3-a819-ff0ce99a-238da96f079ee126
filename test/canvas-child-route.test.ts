/**
 * Reading a canvas's sub-page files through the real route, against a real temp workspace.
 *
 * The route is where the contract becomes a filesystem call: `child` and `from` are query
 * parameters any page can set, so a legal split must load and every escaping form must become
 * a 400 rather than a read somewhere else. The fixture is written here rather than taken from
 * the model, so the test exercises path resolution only.
 *
 * The two bases are both asserted explicitly: the entry writes `./<id>/board`, a child writes
 * `./types` for its sibling. An earlier resolver only had the first one, so a split canvas
 * silently dropped every cross-import.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANVAS_DIR, canvasPath } from "../src/contract.ts";
import { serveCanvas } from "../src/index.ts";

const cwd = mkdtempSync(join(tmpdir(), "ui4a-child-"));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

const file = (relative: string, content: string) => writeFileSync(join(cwd, relative), content);
const dir = (relative: string) => mkdirSync(join(cwd, relative), { recursive: true });

dir(`${CANVAS_DIR}/deck/nested`);
dir(`${CANVAS_DIR}/deck/folder`);
dir(`${CANVAS_DIR}/背单词`);
dir(`${CANVAS_DIR}/other`);

file(`${CANVAS_DIR}/deck.ui4a.tsx`, "entry");
file(`${CANVAS_DIR}/deck/board.tsx`, "BOARD");
file(`${CANVAS_DIR}/deck/types.tsx`, "TYPES");
file(`${CANVAS_DIR}/deck/nested/board.ts`, "NESTED BOARD");
file(`${CANVAS_DIR}/deck/nested/types.tsx`, "NESTED TYPES");
file(`${CANVAS_DIR}/deck/order.tsx`, "ORDER TSX");
file(`${CANVAS_DIR}/deck/order.ts`, "ORDER TS");
file(`${CANVAS_DIR}/deck/folder/index.tsx`, "INDEX TSX");
file(`${CANVAS_DIR}/deck/folder/index.ts`, "INDEX TS");
file(`${CANVAS_DIR}/deck/raw`, "RAW NO EXTENSION");
file(`${CANVAS_DIR}/deck/only.ts`, "ONLY TS");
file(`${CANVAS_DIR}/背单词.ui4a.tsx`, "CHINESE ENTRY");
file(`${CANVAS_DIR}/背单词/board.tsx`, "CHINESE BOARD");
file(`${CANVAS_DIR}/背单词/types.tsx`, "CHINESE TYPES");
file(`${CANVAS_DIR}/other/private.tsx`, "OTHER CANVAS");
// A file that really exists outside every canvas directory, so an escape that "404s because
// the path resolves to nothing" cannot be mistaken for the fence working.
file("secret.txt", "SECRET");

const ENTRY = canvasPath("deck");

/** A minimal ServerResponse that also remembers the headers, including `x-ui4a-filename`. */
const call = async (params: Record<string, string>) => {
  let status = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const res = {
    writeHead(code: number, h?: Record<string, string>) {
      status = code;
      headers = h ?? {};
      return res;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return res;
    },
  };
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  await serveCanvas(() => new Set([cwd]), { method: "GET", url: `/x?${query}` } as never, res as never);
  return { status, body, headers };
};

const read = (id: string, child: string, from?: string) => call({ cwd, id, child, ...(from === undefined ? {} : { from }) });

describe("the two bases", () => {
  test("a specifier beside the entry names the canvas's private child directory", async () => {
    const { status, body, headers } = await read("deck", "./deck/board", ENTRY);
    expect(status).toBe(200);
    expect(body).toBe("BOARD");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/board.tsx`);
  });

  // No `from` is the entry base too: the client only sends one when it knows the importer.
  test("a specifier beside the entry works without `from`", async () => {
    const { status, body } = await read("deck", "./deck/board");
    expect(status).toBe(200);
    expect(body).toBe("BOARD");
  });

  test("a specifier beside a child resolves to its sibling", async () => {
    const { status, body, headers } = await read("deck", "./types", `${CANVAS_DIR}/deck/board.tsx`);
    expect(status).toBe(200);
    expect(body).toBe("TYPES");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/types.tsx`);
  });

  test("a nested child keeps its own directory as the base", async () => {
    const { status, body, headers } = await read("deck", "./types", `${CANVAS_DIR}/deck/nested/board.ts`);
    expect(status).toBe(200);
    expect(body).toBe("NESTED TYPES");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/nested/types.tsx`);
  });
});

describe("extension fallback", () => {
  // The order is `.tsx`, `.ts`, `/index.tsx`, `/index.ts`, then no extension. Both files exist
  // in the first two cases so a reordering would be visible rather than merely still passing.
  test("a sibling prefers .tsx over .ts", async () => {
    const { status, body, headers } = await read("deck", "./deck/order", ENTRY);
    expect(status).toBe(200);
    expect(body).toBe("ORDER TSX");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/order.tsx`);
  });

  test("a directory prefers index.tsx over index.ts", async () => {
    const { status, body, headers } = await read("deck", "./deck/folder", ENTRY);
    expect(status).toBe(200);
    expect(body).toBe("INDEX TSX");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/folder/index.tsx`);
  });

  test("a lone .ts is found when no .tsx exists", async () => {
    const { status, body, headers } = await read("deck", "./deck/only", ENTRY);
    expect(status).toBe(200);
    expect(body).toBe("ONLY TS");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/only.ts`);
  });

  test("an extensionless file is the last candidate", async () => {
    const { status, body, headers } = await read("deck", "./deck/raw", ENTRY);
    expect(status).toBe(200);
    expect(body).toBe("RAW NO EXTENSION");
    expect(headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/deck/raw`);
  });

  test("a specifier naming no file is a 404", async () => {
    const { status } = await read("deck", "./deck/missing", ENTRY);
    expect(status).toBe(404);
  });
});

describe("refusals", () => {
  // Every escape must name a file that really exists and really is outside the child
  // directory, or a 404 from a path that resolves to nothing would masquerade as a fence.
  test("escaping specifiers are a 400, not a read", async () => {
    for (const escape of ["../secret.txt", "./deck/../../secret.txt", "./other/private", "/etc/passwd", String.raw`C:\w\secret.txt`, "./deck//board", "./"]) {
      const { status, body } = await read("deck", escape, ENTRY);
      expect(status).toBe(400);
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain("OTHER CANVAS");
    }
  });

  test("a hostile `from` cannot move the base out of the canvas directory", async () => {
    const froms = [
      `${CANVAS_DIR}/deck/../secret.txt`, // traversal in `from` itself
      `${CANVAS_DIR}/other/board.tsx`, // another canvas
      "Overview.tsx", // a bare filename is not a resolved referrer path
      `${CANVAS_DIR}/deck/`, // the directory, not a file in it
    ];
    for (const from of froms) {
      const { status, body } = await read("deck", "./types", from);
      expect(status).toBe(400);
      expect(body).not.toContain("SECRET");
      expect(body).not.toContain("OTHER CANVAS");
    }
  });
});

describe("non-ASCII ids", () => {
  test("a Chinese canvas id reads both its entry and its children", async () => {
    const entry = await call({ cwd, id: "背单词" });
    expect(entry.status).toBe(200);
    expect(entry.body).toBe("CHINESE ENTRY");

    const fromEntry = await read("背单词", "./背单词/types", `${CANVAS_DIR}/背单词.ui4a.tsx`);
    expect(fromEntry.status).toBe(200);
    expect(fromEntry.body).toBe("CHINESE TYPES");

    const fromChild = await read("背单词", "./types", `${CANVAS_DIR}/背单词/board.tsx`);
    expect(fromChild.status).toBe(200);
    expect(fromChild.body).toBe("CHINESE TYPES");
    expect(fromChild.headers["x-ui4a-filename"]).toBe(`${CANVAS_DIR}/背单词/types.tsx`);
  });
});

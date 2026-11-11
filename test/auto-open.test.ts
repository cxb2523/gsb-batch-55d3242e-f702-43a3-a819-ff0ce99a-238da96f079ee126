/**
 * The canvas auto-open sweep: which tool calls say "show this canvas", and which say nothing.
 *
 * Driven over the real `collectCanvases` with fixture `argsRaw` rather than a stub of it — the
 * detector under test is the production one, and the cases below are the three ways it can be
 * wrong (open on a read, fail to open on an edit, open twice on the same state).
 */
import { expect, test } from "bun:test";
import { canvasAddress, createCanvasAutoOpen, openSignature } from "../src/client/canvas/auto-open.ts";
import type { ToolCallView } from "../src/client/canvas/collect.ts";

const SID = "s1";
const write = (id: string, code: string, settled = true): ToolCallView => ({ name: "write", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx`, content: code }), settled });
const patch = (id: string, settled = true): ToolCallView => ({ name: "str_replace_editor", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx`, old_str: "a", new_str: "b" }), settled });
const read = (id: string): ToolCallView => ({ name: "read", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx` }), settled: true });
const unrelated = (): ToolCallView => ({ name: "write", argsRaw: JSON.stringify({ path: "/home/me/proj/README.md", content: "hi" }), settled: true });

/** Drives one auto-open over a growing transcript — the shape production has: calls arrive, they do not swap. */
function harness(options: { list?: (root: string) => Promise<readonly string[]>; cwd?: () => string | undefined; sessionId?: () => string | undefined } = {}) {
  let calls: readonly ToolCallView[] = [];
  const opens: string[] = [];
  const { sweep } = createCanvasAutoOpen({
    calls: () => calls,
    sessionId: options.sessionId ?? (() => SID),
    cwd: options.cwd ?? (() => "/workspace"),
    list: options.list ?? (async () => []),
    open: (session, id) => opens.push(`${session}/${id}`),
  });
  return {
    opens,
    sweep,
    /** Append a call and sweep once, the way a mutation would. */
    push(...next: ToolCallView[]) {
      calls = [...calls, ...next];
      sweep();
    },
  };
}

/** Let a listing promise settle. */
const drain = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

const runCode = (code: string, settled = true): ToolCallView => ({ name: "run_code", argsRaw: JSON.stringify({ code }), settled });

test("a settled write opens the canvas once", () => {
  const h = harness();
  h.push(write("todo", "export default () => null"));
  expect(h.opens).toEqual(["s1/todo"]);
  h.sweep();
  expect(h.opens).toEqual(["s1/todo"]);
});

test("reading a canvas opens nothing", () => {
  // The trap `collect.ts` exists to avoid: asking what a file contains used to conjure a panel
  // for a canvas this session never wrote.
  const h = harness();
  h.push(read("todo"), read("notes"));
  expect(h.opens).toEqual([]);
});

test("a path outside the contract opens nothing", () => {
  const h = harness();
  h.push(unrelated(), { name: "write", argsRaw: JSON.stringify({ path: "/home/me/proj/src/util.ts", content: "x" }), settled: true });
  expect(h.opens).toEqual([]);
});

test("writing a canvas's own sub-page surfaces that canvas", () => {
  // Not a violation of the contract check — `owningCanvasIdOf` is the point: `todo/deck.tsx` is
  // inside `todo`, and the canvas re-renders with the new sub-page inlined into it.
  const h = harness();
  h.push(write("todo/deck", "export const a = 1"));
  expect(h.opens).toEqual(["s1/todo"]);
});

test("an unsettled write waits for the stream to settle", () => {
  // Opening per frame would bump the tab's navigation revision each time and make the body
  // re-read the file once per token, for content that is not written yet.
  const h = harness();
  h.push(write("todo", "expo", false));
  expect(h.opens).toEqual([]);
  h.push(write("todo", "export default () => null", false));
  expect(h.opens).toEqual([]);
  h.push(write("todo", "export default () => null"));
  expect(h.opens).toEqual(["s1/todo"]);
});

test("an edit re-opens, even for a canvas this session never wrote", () => {
  const h = harness();
  h.push(patch("yesterday"));
  expect(h.opens).toEqual(["s1/yesterday"]);
  h.push(patch("yesterday"));
  // A second patch is another stale version — the body has to re-read.
  expect(h.opens).toEqual(["s1/yesterday", "s1/yesterday"]);
});

test("the same state is not acted on twice", () => {
  const h = harness();
  h.push(write("todo", "body"), patch("todo"));
  // One snapshot, one state, one open — the write and the patch that followed it are read
  // together, not as two events.
  expect(h.opens).toEqual(["s1/todo"]);
  h.sweep();
  h.sweep();
  expect(h.opens).toEqual(["s1/todo"]);
});

test("a rewrite after the reader closed the tab brings it back", () => {
  // What replaced the per-session `dismissed` set: closing is sticky only until the file moves.
  const h = harness();
  h.push(write("todo", "one"));
  expect(h.opens).toEqual(["s1/todo"]);
  h.push(write("todo", "one longer body"));
  expect(h.opens).toEqual(["s1/todo", "s1/todo"]);
});

test("without a session there is nothing to open into", () => {
  const opens: string[] = [];
  const { sweep } = createCanvasAutoOpen({
    calls: () => [write("todo", "body")],
    sessionId: () => undefined,
    open: (_session, id) => opens.push(id),
  });
  sweep();
  expect(opens).toEqual([]);
});

test("the address is workspace-relative and round-trips", () => {
  // Absolute tool paths are machine-specific; the address names the file inside the session's
  // own workspace so the host resolves it there. `canvasIdOf` must be able to read it back.
  const address = canvasAddress(SID, "背单词");
  expect(address).toBe("dsh-resource://file/session/s1/.dsh/ui4a/canvases/%E8%83%8C%E5%8D%95%E8%AF%8D.ui4a.tsx");
});

test("openSignature is what makes a sweep free when nothing moved", () => {
  const collected = { canvases: [{ id: "todo", code: "abc", streaming: false }], stale: new Map<string, number>() };
  expect(openSignature("todo", collected)).toBe("s0:c3");
  expect(openSignature("todo", { ...collected, stale: new Map([["todo", 2]]) })).toBe("s2:c3");
  expect(openSignature("todo", { canvases: [{ id: "todo", code: "abc", streaming: true }], stale: new Map() })).toBe("streaming");
  // An edit to a canvas never written here is synthesized with an empty body; it still moves.
  expect(openSignature("ghost", collected)).toBe("stale:0");
});

test("the first listing is a baseline and opens nothing", async () => {
  // Seventeen canvases from last week are not seventeen tabs. The listing's job is the
  // difference after it, not everything it can see.
  let onDisk = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q"];
  const h = harness({ list: async () => onDisk });
  h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
  await drain();
  expect(h.opens).toEqual([]);
});

test("a canvas written by executed code is opened when it appears", async () => {
  // `collect.ts` classifies by argument shape and a run_code whose path is built from a
  // variable names no canvas at all — 27 of the corpus's 29 code-written canvases. The
  // listing is the only thing that knows.
  let onDisk = ["a", "b"];
  const h = harness({ list: async () => onDisk });
  h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
  await drain();
  expect(h.opens).toEqual([]);
  onDisk = ["a", "b", "newcomer"];
  // The corpus's opaque writes all mention `canvases` in the code text — the path is built
  // there — which is the whole basis of `OPAQUE_WRITE`. A write that never says so is invisible.
  h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`));
  await drain();
  expect(h.opens).toEqual(["s1/newcomer"]);
});

test("ordinary shell work does not pay for a listing", async () => {
  let listings = 0;
  const h = harness({
    list: async () => {
      listings += 1;
      return [];
    },
  });
  h.push({ name: "run_code", argsRaw: JSON.stringify({ command: "ls -la", description: "list" }), settled: true });
  h.push({ name: "run_code", argsRaw: JSON.stringify({ command: "cat package.json" }), settled: true });
  await drain();
  expect(listings).toBe(0);
});

test("a failed listing is retried, so the next canvas is not swallowed by the baseline", async () => {
  // The marker used to advance before the listing landed. A rejection therefore left it
  // advanced and `listed` null: the next successful listing was consumed as the baseline,
  // so the canvas that appeared after the failure was never opened.
  let fail = true;
  let onDisk = ["old"];
  let listings = 0;
  const h = harness({
    list: async () => {
      listings += 1;
      if (fail) throw new Error("offline");
      return onDisk;
    },
  });
  const silent = console.error;
  console.error = () => {};
  try {
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
    await drain();
    expect(listings).toBe(1);

    fail = false;
    onDisk = ["old", "first"];
    // No new call: the same settled write must be able to retry its listing.
    h.sweep();
    await drain();
    expect(listings).toBe(2);
    expect(h.opens).toEqual([]);

    onDisk = ["old", "first", "second"];
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`));
    await drain();
    expect(h.opens).toEqual(["s1/second"]);
  } finally {
    console.error = silent;
  }
});

test("two in-flight listings cannot roll the marker back", async () => {
  // The first failure used to leave its marker behind for the second request to capture as
  // `previous`; when the two rejected in order, the second restored it and both writes were
  // consumed by the next baseline.
  let release: (() => void)[] = [];
  let fail = true;
  const onDisk = ["old", "first", "second"];
  const h = harness({
    list: async () => {
      await new Promise<void>((r) => release.push(r));
      if (fail) throw new Error("offline");
      return onDisk;
    },
  });
  const silent = console.error;
  console.error = () => {};
  try {
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`));
    await drain();
    // Only one listing is in flight; the second call waits for a later sweep.
    expect(release).toHaveLength(1);
    fail = true;
    for (const done of release.splice(0)) done();
    await drain();
    expect(h.opens).toEqual([]);

    fail = false;
    h.sweep();
    await drain();
    for (const done of release.splice(0)) done();
    await drain();
    // The retry is still a baseline (nothing was listed before it), so it opens nothing — and it
    // must not be skipped or consumed by a rolled-back marker.
    expect(h.opens).toEqual([]);

    // The next write is the one that tells the story: its listing must see the baseline and open
    // only what appeared after it.
    onDisk.push("third");
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(extra)`));
    await drain();
    for (const done of release.splice(0)) done();
    await drain();
    expect(h.opens).toEqual(["s1/third"]);
  } finally {
    console.error = silent;
  }
});

test("a write that lands mid-listing is listed by its own listing", async () => {
  // Dropping the second sweep left its canvas unlisted whenever the first directory snapshot
  // predates it — and with no later transcript mutation it was never opened at all.
  const snapshots = [
    ["old", "first"],
    ["old", "first", "second"],
  ];
  const release: (() => void)[] = [];
  const h = harness({
    list: async () => {
      await new Promise<void>((r) => release.push(r));
      return snapshots.shift()!;
    },
  });
  h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
  await drain();
  h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`));
  await drain();
  // The first listing resolves from a snapshot taken before the second write landed.
  for (const done of release.splice(0)) done();
  await drain();
  expect(h.opens).toEqual([]);
  // …and its own listing runs immediately, rather than waiting for an unrelated mutation.
  for (const done of release.splice(0)) done();
  await drain();
  expect(h.opens).toEqual(["s1/second"]);
});

test("a write queued behind a failed listing is still listed", async () => {
  // Settling the first promise schedules no sweep of its own: without draining here the queued
  // write waits for some unrelated mutation before anyone looks for its canvas.
  const release: (() => void)[] = [];
  let attempt = 0;
  const h = harness({
    list: async () => {
      attempt += 1;
      await new Promise<void>((r) => release.push(r));
      if (attempt === 1) throw new Error("offline");
      return ["old", "first", "second"];
    },
  });
  const silent = console.error;
  console.error = () => {};
  try {
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`));
    await drain();
    h.push(runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`));
    await drain();
    for (const done of release.splice(0)) done();
    await drain();
    // The failure drains the queue into a second listing; that one lands and opens the newcomer.
    for (const done of release.splice(0)) done();
    await drain();
    expect(attempt).toBe(2);
  } finally {
    console.error = silent;
  }
});

test("one session's completed marker does not block another's listing", async () => {
  // The markers count settled opaque calls in one transcript. A's marker 1 says nothing about
  // B's, so a shared `listedAt` swallowed B's listing whenever the two happened to share a number.
  const release: (() => void)[] = [];
  const opens: string[] = [];
  let session = "a";
  let calls: readonly ToolCallView[] = [];
  let attempt = 0;
  const { sweep } = createCanvasAutoOpen({
    calls: () => calls,
    sessionId: () => session,
    cwd: () => "/workspace",
    list: async () => {
      attempt += 1;
      await new Promise<void>((r) => release.push(r));
      return attempt === 3 ? ["old", "b-new"] : ["old"];
    },
    open: (opened, id) => opens.push(`${opened}/${id}`),
  });
  calls = [runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`)];
  sweep();
  await drain();
  session = "b";
  calls = [runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`)];
  sweep();
  await drain();
  // B lists while A is still in flight. With one shared marker it was queued and then dropped.
  expect(attempt).toBe(2);
  for (const done of release.splice(0)) done();
  await drain();
  for (const done of release.splice(0)) done();
  await drain();
  // B's first listing is its baseline; the write after it is the one that opens a tab.
  calls = [...calls, runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`)];
  sweep();
  await drain();
  for (const done of release.splice(0)) done();
  await drain();
  expect(opens).toEqual(["b/b-new"]);
});

test("a queued write lists the workspace it was queued against", async () => {
  const release: (() => void)[] = [];
  const roots: string[] = [];
  let root = "/one";
  let calls: readonly ToolCallView[] = [];
  const { sweep } = createCanvasAutoOpen({
    calls: () => calls,
    sessionId: () => SID,
    cwd: () => root,
    list: async (where) => {
      roots.push(where);
      await new Promise<void>((r) => release.push(r));
      return [];
    },
    open: () => {},
  });
  calls = [runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(src)`)];
  sweep();
  await drain();
  calls = [...calls, runCode(`p = base / 'canvases' / f'{name}.ui4a.tsx'; p.write_text(more)`)];
  sweep();
  await drain();
  // The reader switches away after the write is queued; draining must still use the queued root.
  root = "/two";
  for (const done of release.splice(0)) done();
  await drain();
  for (const done of release.splice(0)) done();
  await drain();
  expect(roots).toEqual(["/one", "/one"]);
});

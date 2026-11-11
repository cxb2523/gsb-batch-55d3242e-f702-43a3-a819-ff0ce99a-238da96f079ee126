/**
 * The `$dsh/*` stubs an exported page links against.
 *
 * They exist so a page keeps rendering with the harness gone, which only works if every stub
 * returns the SHAPE its real counterpart does. `bash` returned `undefined` for as long as it
 * existed, so `await bash(...)` then `.exitCode` — the exact line the skill tells cards to
 * write — threw on every exported page with a command card. Nothing noticed because nothing
 * awaited a stub.
 *
 * Asserted on the fields a card actually reads, not on the object's identity: a stub is allowed
 * to grow a field, and must not lose one.
 */
import { expect, test } from "bun:test";

const load = (group: string) => import(`../types/standalone/${group}.js`);

test("a command result carries every field a card reads", async () => {
  const { bash } = await load("exec");
  const result = await bash("git log --format=%s");
  expect(result.stdout.split("\n").filter(Boolean)).toEqual([]);
  expect(result.exitCode).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.truncated.stdout).toBe(false);
  expect(result.timedOut).toBe(false);
});

test("file reads return their own empty value, not undefined", async () => {
  const { readFile, readdir, readBytes, writeFile } = await load("fs");
  expect(await readFile("a.txt")).toBe("");
  expect(await readdir(".")).toEqual([]);
  expect((await readBytes("a.bin")).length).toBe(0);
  // The one member that genuinely returns nothing.
  expect(await writeFile("a", "b")).toBeUndefined();
});

// `streamText` is consumed with `for await`, so a plain function returning undefined would
// throw "is not async iterable" rather than doing nothing.
test("the model stream is iterable and empty", async () => {
  const { streamText } = await load("ai");
  const pieces: string[] = [];
  for await (const piece of streamText({ prompt: "hi" })) pieces.push(piece);
  expect(pieces).toEqual([]);
});

/**
 * Every binding has a stub, and every stub is exported. The generator enforces this at build
 * time; this catches a `types/standalone/` checked in stale against a newer `bindings.ts`.
 */
test("the stubs cover every capability the runtime binds", async () => {
  const { bind } = await import("../src/client/runtime/bindings.ts");
  for (const [group, members] of Object.entries(bind() as Record<string, object>)) {
    const stub = await load(group);
    expect(
      Object.keys(stub)
        .filter((k) => k !== "default")
        .toSorted(),
    ).toEqual(Object.keys(members).toSorted());
  }
});

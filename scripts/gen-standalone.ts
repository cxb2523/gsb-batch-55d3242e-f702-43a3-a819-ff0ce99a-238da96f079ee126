/**
 * Writes the `$dsh/*` standalone stubs — the import map `genui build` and `genui dev` need.
 *
 * Those two produce a page with no dsh around it, so the capabilities cannot work there: the
 * conversation, the model and the workspace all live in the harness. The stubs exist so a card
 * that imports one still *builds*, and say what happened in the console instead of throwing —
 * a half-working export beats a page that dies on the first click.
 *
 * Export names come from `bind()` rather than a second hand-written list, so a capability
 * added to the implementation cannot go missing here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CAPABILITY_PREFIX, capabilityModule } from "../src/contract.ts";

// Imported for its shape only: `bind()` reads a host that does not exist in this process, so
// calling a member would throw — but enumerating the keys never calls one.
const { bind } = await import("../src/client/runtime/bindings.ts");

const out = resolve(import.meta.dir, "../types/standalone");
await mkdir(out, { recursive: true });

/**
 * What each stub returns, so a caller that awaits or iterates the result does not crash on
 * `undefined` — which would make the page die at the first `await readFile(...)` and defeat
 * the whole point of stubbing quietly. Keyed by member name; anything unlisted returns
 * undefined, which is right for the void-returning ones.
 */
const EMPTY_RESULT: Record<string, string> = {
  readFile: '""',
  readdir: "[]", // DirEntry[]
  readBytes: "new Uint8Array()",
  writeFile: "undefined",
  streamText: "(async function* () {})()",
  // The shape the skill tells cards to read: `check exitCode, do not catch it`. Returning
  // undefined here made every exported page with a command card throw on `.exitCode` — the
  // exact crash the table exists to prevent, missed because the table was written from the two
  // members that had been added at the time and never revisited when `bash` and `readBytes`
  // arrived. Anything unlisted silently returns undefined, so a new member starts out broken.
  bash: '{ stdout: "", stderr: "", exitCode: 0, signal: null, truncated: { stdout: false, stderr: false }, timedOut: false }',
  // `sources` must be an ARRAY: every card that searches maps over it, and the whole point of a
  // quiet stub is that an exported page renders rather than throwing on `.map` of undefined.
  search: "{ sources: [], truncated: false }",
};
// Which stubs are `async`. Hand-written on purpose and NOT derived: the real members are arrow
// functions returning promises, so `constructor.name === "AsyncFunction"` sees only one of the
// five — a derived version silently made four stubs synchronous, which an `await` shrugs at and
// a `for await` does not. The `unlisted` gate below is what keeps this list honest instead.
// `streamText` returns an async ITERABLE rather than a promise, so it is correctly absent.
const ASYNC = new Set(["readFile", "readdir", "readBytes", "writeFile", "bash", "search"]);

/**
 * Groups that need no harness, and therefore ship their real implementation rather than a stub.
 *
 * `$dsh/state` is `localStorage` and React, both present outside dsh. Stubbing it would remove
 * working behaviour instead of standing in for missing behaviour — and it would break outright:
 * `usePersistedState` is a hook, so a stub returning `undefined` both crashes the destructuring
 * and changes the hook count on every render after it.
 */
const SELF_SUFFICIENT = new Set(["state"]);

const groups = bind() as Record<string, Record<string, unknown>>;
const imports: Record<string, string> = {};
/** Members of self-sufficient groups are never stubbed, so the stub gates below skip them. */
const stubbed = Object.entries(groups).filter(([group]) => !SELF_SUFFICIENT.has(group));

// A member added to `bindings.ts` and not to `EMPTY_RESULT` gets a stub returning `undefined`,
// which is correct for a void member and a crash for every other — `bash` shipped that way and
// made `.exitCode` throw on every exported page. There is no way to tell the two apart from the
// binding alone, so the choice has to be stated here rather than defaulted.
const VOID_MEMBERS = new Set(["sendMessage", "writeFile"]);
const unlisted = stubbed
  .map(([, members]) => members)
  .flatMap((members) => Object.keys(members))
  .filter((name) => EMPTY_RESULT[name] === undefined && !VOID_MEMBERS.has(name));
const notAsync = stubbed
  .map(([, members]) => members)
  .flatMap((members) => Object.keys(members))
  .filter((name) => !ASYNC.has(name) && !VOID_MEMBERS.has(name) && name !== "streamText");
if (notAsync.length > 0) {
  console.error(`gen-standalone: ${notAsync.join(", ")} is neither async nor void — add to ASYNC, or to VOID_MEMBERS if it returns nothing`);
  process.exit(1);
}
if (unlisted.length > 0) {
  console.error(`gen-standalone: no stub result for ${unlisted.join(", ")} — add to EMPTY_RESULT, or to VOID_MEMBERS if it really returns nothing`);
  process.exit(1);
}

for (const [group, members] of Object.entries(groups)) {
  const specifier = capabilityModule(group);
  if (SELF_SUFFICIENT.has(group)) {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, `../src/client/runtime/${group}.ts`)], target: "browser", external: ["react"] });
    await writeFile(resolve(out, `${group}.js`), await built.outputs[0].text());
    imports[specifier] = `./${group}.js`;
    continue;
  }
  const body = Object.keys(members).map((name) => {
    const warn = `  console.warn(${JSON.stringify(`[${specifier}] ${name}() did nothing: this page is not running inside dsh, so there is no harness to reach.`)}, ...args);`;
    const result = EMPTY_RESULT[name];
    const ret = result === undefined || result === "undefined" ? "" : `\n  return ${result};`;
    return `export ${ASYNC.has(name) ? "async " : ""}function ${name}(...args) {\n${warn}${ret}\n}`;
  });
  const source = [`// Generated by scripts/gen-standalone.ts — do not edit.`, `// Stands in for ${specifier} outside dsh, where the harness these forward to does not exist.`, ...body, `export default { ${Object.keys(members).join(", ")} };`, ""].join("\n");
  await writeFile(resolve(out, `${group}.js`), source);
  imports[specifier] = `./${group}.js`;
}

await writeFile(resolve(out, "importmap.json"), `${JSON.stringify({ imports }, null, 2)}\n`);
console.log(`wrote ${Object.keys(imports).length - SELF_SUFFICIENT.size} stubs and ${SELF_SUFFICIENT.size} real module(s) for ${CAPABILITY_PREFIX}/* → types/standalone/`);

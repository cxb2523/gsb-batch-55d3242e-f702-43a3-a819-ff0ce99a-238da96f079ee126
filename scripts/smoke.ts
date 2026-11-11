/**
 * Loads the built client bundle the way the shell's module loader does, without a browser.
 *
 * Catches the failure modes that otherwise only show up as a blank app with
 * "loaded without registering" in the UI: a syntax error anywhere in the bundle
 * (top-level `import.meta` is the classic one), a banner/footer wrapper that does
 * not call `load()`, and any bare `require()` the shell's module table cannot answer.
 */
import { resolve } from "node:path";
import { PLATFORM_MODULES } from "./platform.ts";

const PLATFORM = new Set(PLATFORM_MODULES);

// Follows `BUILD_OUTDIR`, so a check that built elsewhere (during a wave, which owns `lib/`)
// verifies the bundle it just produced rather than whatever `lib/` still holds — otherwise the
// check is green about a stale artefact, which is the failure mode it exists to prevent.
const source = await Bun.file(`${process.env.BUILD_OUTDIR ?? "lib"}/client.js`).text();
let registered: { id: string; factory: (require: (id: string) => unknown) => Record<string, unknown> } | null = null;

// Minimal stand-ins for what the bundle touches while its module bodies evaluate.
Object.assign(globalThis, {
  window: {
    __ModuleLoader__: {
      load: (m: typeof registered) => {
        registered = m;
      },
    },
  },
  document: { querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }), head: { prepend() {}, append() {} } },
});

/**
 * Capture every blob module the plugin synthesizes, so their source can be parsed below.
 *
 * These are the `$dsh/*` capability shims and the registry's re-export modules — strings built at
 * runtime and then `import`ed. Nothing type-checks them, and a syntax error in one fails
 * the way an unresolvable import fails: the whole module graph dies and the card renders
 * blank with no console error. That is exactly the class of defect this script exists for.
 */
const blobs: string[] = [];
Object.assign(globalThis, {
  // A constructor is the whole contract here — the bundle only ever does `new Blob([source])`.
  // oxlint-disable-next-line typescript/no-extraneous-class
  Blob: function Blob(this: unknown, parts: string[]) {
    blobs.push(parts.join(""));
  },
  URL: Object.assign(URL, { createObjectURL: () => `blob:smoke/${blobs.length}`, revokeObjectURL: () => {} }),
});

// The whole point is to evaluate the bundle exactly as the shell's loader does, including
// the banner that calls `__ModuleLoader__.load` — a syntax error here is the failure this
// script exists to catch.
// oxlint-disable-next-line no-eval
(0, eval)(source);

if (registered === null) throw new Error("bundle did not call window.__ModuleLoader__.load — check the banner/footer wrapper");
const { id, factory } = registered as NonNullable<typeof registered>;
if (id !== "dsh-generative-ui") throw new Error(`registered under the wrong id: ${id}`);

const asked: string[] = [];
const exports = factory((specifier) => {
  asked.push(specifier);
  if (!PLATFORM.has(specifier)) throw new Error(`require(${JSON.stringify(specifier)}) is not in the shell's module table`);
  return specifier === "react" || specifier === "react/jsx-runtime" ? require(specifier) : {};
});

if (typeof exports.apply !== "function") throw new Error("client bundle exports no apply()");

/**
 * Run `apply()` too, and report which effects it registered.
 *
 * Evaluating the module bodies only proves the bundle parses. Every effect this plugin has
 * is registered from `apply`, so a throw at the top of it — or an effect that never returns
 * — is invisible until the shell sits on "Loading plugins…" forever. That has happened: a
 * lint-driven edit hung the main thread and this script still printed ok.
 *
 * Browser APIs the effects reach for are deliberately NOT simulated. What is asserted is
 * that `apply` returns, and that each effect either registered or failed on a missing DOM
 * global rather than on the plugin's own logic — anything else is a real defect. Faithfully
 * emulating the DOM here would make this a worse browser than the browser test already run.
 */
const DOM_ABSENCE = /is not (defined|a function)|Cannot read propert|WebAssembly|fetch\(\) URL|doesn't parse/;
const registered_effects: string[] = [];
const dom_gaps: string[] = [];
const disposers: { name: string; dispose: () => unknown }[] = [];
const effect = (run: () => unknown, label?: string) => {
  const name = label ?? "(unlabelled)";
  registered_effects.push(name);
  try {
    const dispose = run();
    if (typeof dispose === "function") disposers.push({ name, dispose: dispose as () => unknown });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!DOM_ABSENCE.test(message)) throw new Error(`effect ${name} failed: ${message}`, { cause: error });
    dom_gaps.push(name);
  }
};
const injected: string[] = [];
const context: Record<string, unknown> = {
  effect,
  inject: (deps: readonly string[], callback: (scoped: unknown) => void) => {
    injected.push(...deps);
    // The proxied context, not the bare one: a nested scope reads the very services it just
    // declared, and handing it an object without the stub fallback makes every one of them
    // undefined — which reads as "the plugin is broken" rather than "the fake is thin".
    callback(proxied);
  },
};
// Anything else `apply` touches answers with a callable that keeps answering.
const stub = (): unknown => new Proxy(() => stub(), { get: () => stub(), apply: () => stub() });
const proxied = new Proxy(context, { get: (target, key) => (key in target ? target[key as string] : stub()) });

// Measured after the fact, not with a timer: a synchronously blocking `apply` never yields
// to the event loop, so a `setTimeout` guard would fire only once it had already returned.
const started = performance.now();
exports.apply(proxied);
const elapsed = performance.now() - started;
// Registering effects is bookkeeping; anything close to a second means work that belongs
// off the registration path, which is what left the shell on "Loading plugins…" before.
if (elapsed > 1000) throw new Error(`apply() blocked for ${Math.round(elapsed)}ms — registration must not do work`);

if (registered_effects.length === 0) throw new Error("apply() registered no effects");

/**
 * Run every disposer the effects returned.
 *
 * Registration was checked and teardown was not, so a cleanup that throws — a disposer reaching
 * for a DOM node it never got to create, an unpaired `revokeObjectURL` — shipped silently. The
 * shell calls these on every HMR round and on unload, and a throw there aborts the rest of the
 * teardown: the next effect's cleanup never runs, so the leak this file exists to catch happens
 * anyway. Reverse order, the way a scope unwinds.
 */
for (const { name, dispose } of disposers.toReversed()) {
  try {
    dispose();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!DOM_ABSENCE.test(message)) throw new Error(`disposing ${name} failed: ${message}`, { cause: error });
    dom_gaps.push(`${name} (dispose)`);
  }
}

/**
 * Build the blob modules the plugin synthesizes.
 *
 * They are lazy — nothing builds one until the first surface mounts, which needs a DOM —
 * so `localImports()` is what makes them exist here. It is the same call the renderer makes.
 */
if (typeof exports.localImports !== "function") throw new Error("client bundle exports no localImports()");
const imports = (exports.localImports as () => Record<string, string>)();
if (!("$dsh/chat" in imports) || !("$dsh/ai" in imports) || !("$dsh/fs" in imports)) throw new Error(`a $dsh capability is missing from the import map — generated code could not import it (got ${Object.keys(imports).join(", ")})`);
if (!("react" in imports)) throw new Error("react is missing from the import map — generated code would load a second React");

// Parse what those blob modules actually say. `new Function` rejects a syntax error the same
// way the browser's module parser would, minus the module grammar — so strip the import/export
// lines first and check the rest, which is where a real mistake would be.
for (const source of blobs) {
  const body = source
    .split("\n")
    .filter((line) => !line.startsWith("import ") && !line.startsWith("export "))
    .join("\n")
    // `import.meta.url` is the capability a shim reads for itself, and it is module-only grammar
    // that `new Function` has no view of. Stand it in with a literal: the point of this parse is
    // the rest of the body, not whether the module grammar is legal in a function body.
    .replaceAll("import.meta.url", '"blob:smoke"');
  try {
    // Constructed for the parse, not the function: a syntax error throws here, and that is the
    // whole check.
    // oxlint-disable-next-line no-new-func, no-new
    new Function(body);
  } catch (error) {
    throw new Error(`a synthesized blob module does not parse: ${error instanceof Error ? error.message : String(error)}\n${source}`, { cause: error });
  }
}
if (blobs.length === 0) throw new Error("no blob modules were synthesized — see the registry trigger above");
const gaps = dom_gaps.length === 0 ? "" : `, ${dom_gaps.length} needing a DOM`;
console.log(`smoke: ok — id ${id}, requires [${[...new Set(asked)].join(", ")}]`);
// "4 of 6 returned a disposer" reads as two effects having nothing to undo. They are in fact
// the two that could not RUN here — both reach for a DOM — and they are precisely the two that
// register into the process-wide listener set in `observe.ts`. Saying which is which keeps the
// line from claiming coverage it does not have.
const ran = registered_effects.filter((name) => !dom_gaps.includes(name));
const stateless = ran.filter((name) => !disposers.some((d) => d.name === name));
console.log(`       ${disposers.length} of ${ran.length} runnable effects returned a disposer, all torn down cleanly${stateless.length === 0 ? "" : ` (stateless: ${stateless.join(", ")})`}`);
if (dom_gaps.length > 0) console.log(`       ${dom_gaps.length} not run here, no DOM: ${dom_gaps.join(", ")} — their teardown is covered by test/, not by smoke`);
/**
 * The services the client half may depend on.
 *
 * The fake context answers everything, so a dependency that does not exist in any profile looks
 * exactly like one that does — and cordis would simply never run that callback, silently costing
 * whatever it registered. The list is short and changes rarely; a genuinely new dependency is a
 * one-line edit here and a deliberate one.
 *
 * `sidebarRightTabs` / `sidebarRight` / `slots` are the canvas tab's three (§3.6). They travel
 * together in one nested fiber, and the whole fiber is optional — a host without the right
 * Sidebar keeps inline cards and the prompt, and canvases simply have nowhere to render.
 */
const CLIENT_SERVICES = new Set(["conversation", "slots", "sidebarRightTabs", "sidebarRight"]);
const unknown = [...new Set(injected)].filter((name) => !CLIENT_SERVICES.has(name));
if (unknown.length > 0) throw new Error(`apply() injects ${unknown.join(", ")}, which no profile provides — that callback would never run. Add it to CLIENT_SERVICES if it is real.`);

/**
 * The STATIC `inject` is a hard dependency: cordis withholds the whole plugin until every name in
 * it resolves, so a service listed there and never read costs the entire client half on any host
 * that lacks it — silently, with no error naming the cause. The check above only sees
 * `ctx.inject(...)` CALLS, so this list went unexamined; `slots` sat in it unused, and the panel
 * had long since moved to a DOM portal because dsh has no additive slot for a whole column.
 *
 * Read as source text rather than by exercising the module: a name is used if it appears anywhere
 * beyond its own declaration, which is exactly the question, and a fake context cannot answer it.
 */
const clientSource = await Bun.file(resolve(import.meta.dir, "../src/client/index.ts")).text();
const declared = /export const inject = \[([^\]]*)\]/.exec(clientSource)?.[1] ?? "";
const staticInjects = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const unused = staticInjects.filter((name) => {
  const uses = [...clientSource.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
  return uses <= 1; // the declaration itself
});
if (unused.length > 0) {
  throw new Error(`static inject lists ${unused.join(", ")}, which nothing reads — a hard dependency on a service this plugin does not use, so a host without it loses the whole client half for nothing.`);
}

console.log(`       apply() registered ${registered_effects.length} effects${gaps} under injections [${[...new Set(injected)].join(", ")}]`);

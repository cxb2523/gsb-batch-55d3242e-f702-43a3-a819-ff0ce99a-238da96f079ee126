import { resolve } from "node:path";

/**
 * Where the two halves land. Overridable so a build can be a pure CHECK — see the wave guard
 * below, which is about writing `lib/`, not about compiling.
 */
const OUTDIR = process.env.BUILD_OUTDIR ?? "lib";

// A wave measures `lib/`, so REPLACING it while one runs changes the prompt under jobs that are
// already in flight: they come back `stale` (the eval guard catches those) or, worse, they come
// back with a VERDICT produced by a different prompt than the one the wave reported. That has
// happened five times, so the build refuses instead of relying on anyone remembering.
//
// The guard is on the OUTPUT, not on building: `bun run check` compiles to prove the tree is
// sound, and a check that cannot run during a wave means no push during a wave. `BUILD_OUTDIR=…`
// sends the artefacts elsewhere and the guard has nothing to protect.
//
// A LOCK FILE, not `pgrep`. Two pgrep patterns were tried and both matched things that were not a
// wave — a monitor shell waiting on one, a `tail | grep` of its log — because a command line that
// MENTIONS the script is indistinguishable from one that runs it. One of those blocked every
// build for half an hour after the wave had already died. The lock names the wave's own pid, so a
// dead wave's lock is detectably dead: `kill -0` answers the question `pgrep` was being asked to
// guess at.
if (OUTDIR === "lib" && !Bun.argv.includes("--force")) {
  const lock = Bun.file(resolve(import.meta.dir, "../.wave-running"));
  if (await lock.exists()) {
    const pid = Number((await lock.text()).trim());
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false; // ESRCH: the wave died and left its lock behind
    }
    if (alive) {
      console.error(`refusing to overwrite lib/: wave ${pid} is running, and replacing it moves the prompt under jobs already in flight.`);
      console.error("  to check the tree without touching it: BUILD_OUTDIR=/tmp/build-check bun run build");
      console.error("  or `bun run build --force` if you know this wave is already void.");
      process.exit(1);
    }
  }
}

// The panel stylesheet used to be compiled here into a string the plugin injected itself —
// `panel.css` → `panel-css.ts`. The canvas tab has no chrome of its own any more (CLAUDE.md
// §3.6), so there is nothing left to compile and no stylesheet this bundle ships.

/**
 * Two outputs, one package.
 *
 * - node half (lib/index.js, ESM): serves the tsx wasm. cordis and the dsh peers
 *   resolve at runtime from the profile tree, so they stay external.
 * - browser half (lib/client.js, CJS): a closure factory the shell's module loader
 *   materializes. Platform modules resolve through the injected `require`;
 *   everything else is bundled in.
 */

import { PLATFORM_MODULES } from "./platform.ts";

const PLUGIN_ID = "dsh-generative-ui";

/**
 * bun's `external` matches subpaths too, so listing `react-dom` (which IS a platform
 * module) also externalizes `react-dom/server` — which is NOT, and would die at
 * materialization with "missed the module table". Resolving it to an absolute path
 * here takes it out of specifier matching entirely, so it gets bundled.
 */
const bundleReactDomServer: import("bun").BunPlugin = {
  name: "bundle-react-dom-server",
  setup(build) {
    const resolved = Bun.resolveSync("react-dom/server.browser.js", resolve(import.meta.dir, ".."));
    build.onResolve({ filter: /^react-dom\/server$/ }, () => ({ path: resolved }));
  },
};

/**
 * partial-react's runtime imports `./compiler`, whose top-level `import.meta.resolve` is a
 * syntax error inside a CJS factory regardless of whether that branch runs. We ship our own
 * browser compiler anyway, so swap the module out at resolve time.
 */
const node = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: OUTDIR,
  target: "node",
  format: "esm",
  external: ["@deepseek-ai/*"],
  naming: "[dir]/[name].[ext]",
});

const client = await Bun.build({
  entrypoints: ["src/client/index.ts"],
  outdir: OUTDIR,
  target: "browser",
  format: "cjs",
  external: PLATFORM_MODULES,
  // partial-react's preflight imports `react-dom/server`, whose exports map only routes to
  // server.browser.js under the `browser` condition — without it the Node build comes in and
  // drags require("stream"/"url"/"util") into a browser bundle.
  conditions: ["browser"],
  plugins: [bundleReactDomServer],
  // Pinned, because otherwise the bundle depends on the CALLER'S environment. Bun picks the JSX
  // runtime from NODE_ENV and the `define` below does not reach the transform — it rewrites
  // strings in the code. Measured: `NODE_ENV=production bun run build` emits 0
  // `require("react/jsx-dev-runtime")`, `NODE_ENV=test` emits one per `.tsx` in the bundle.
  // `bun test` sets NODE_ENV=test for its children, and one test shells out to
  // `bun run build` — so running the test suite left `lib/` in a state where the shell's module
  // table has no `react/jsx-dev-runtime`, the client half failed to load, and dsh web showed
  // "Failed to load plugins" over a blank page. It cost two wrong diagnoses before the pattern
  // showed: the bundle was fine right after a build and broken right after a test.
  jsx: { runtime: "automatic", development: false },
  define: {
    // @esm.sh/tsx's entry reads `import.meta.url`, which does not exist in a CJS factory.
    // Only read on the branches taken when no wasm path was passed, and we always pass one.
    "import.meta.url": JSON.stringify("https://dsh-generative-ui.invalid/"),
    // Hard-coded, not `process.env.NODE_ENV ?? "production"`: `??` only covers an UNSET
    // variable, and the caller that actually breaks this sets it — `bun test` runs children
    // with NODE_ENV=test, and one test shells out to a build. That leaves `react-dom/server`
    // resolving to its DEVELOPMENT build, which reads `ReactDebugCurrentFrame` off the shell's
    // production React and dies with "cannot read properties of undefined (reading
    // 'getCurrentStack')" — reported to the model as "your card did not render", on a card that
    // is fine. A browser bundle we ship is production by definition; nothing here is debuggable
    // by shipping React's dev build to a reader.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  footer: "return module.exports; } });",
  sourcemap: "linked",
  naming: "[dir]/client.[ext]",
});

for (const [label, result] of [
  ["node", node],
  ["client", client],
] as const) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`${label} build failed`);
  }
  for (const output of result.outputs) console.log(`${label}: ${output.path.split("/").slice(-1)[0]} ${(output.size / 1024).toFixed(1)} kB`);
}

// The one thing a caller's environment could still poison, checked in the artefact rather than
// trusted from the config: React's DEV builds read internals the shell's production React does
// not carry, and the symptom is an unrelated TypeError blamed on the card that happened to be
// rendering. Cheap enough to run on every build.
const clientSource = await Bun.file(`${OUTDIR}/client.js`).text();
for (const marker of ["react-dom-server.browser.development", 'react/jsx-dev-runtime")']) {
  if (clientSource.includes(marker)) throw new Error(`client bundle carries a React development build (${marker}) — check NODE_ENV handling in this file`);
}

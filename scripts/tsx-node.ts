/**
 * The tsx compiler for scripts, loaded from disk.
 *
 * Not `src/client/runtime/compiler.ts`: that one initialises from `WASM_PATH`, an HTTP route
 * this plugin serves, which no Node script can fetch. The wasm is the same file either way —
 * only where it comes from differs, so this is a second loader rather than a second compiler.
 */
import { readdirSync } from "node:fs";

import initTsx, { transform } from "@esm.sh/tsx";
import { normalizeGeneratedTsxCompat } from "../src/client/runtime/normalize.ts";

let ready: Promise<unknown> | null = null;

export const initTsxFromDisk = () => (ready ??= Bun.file("node_modules/@esm.sh/tsx/pkg/tsx_bg.wasm").arrayBuffer().then(initTsx));

/** Compile one card the way the runtime does, minus the import-map rewrite. */
export const compileCard = (filename: string, code: string) => transform({ filename, code, target: "es2022", jsxImportSource: "react" });

/** The cards in a directory, sorted — the fixed input for the card checkers. */
/**
 * Compile a settled card the way `compiler.ts` does: normalize `final`, and on failure normalize
 * `streaming` and compile that.
 *
 * The fallback is not defensive padding: the two modes cut the same source differently, so a card
 * that fails under one can compile under the other. (`partial-tsx` 0.0.5 removed the `final`-mode
 * over-repair that first motivated this — `test/normalize-complete.test.ts` now pins that it does
 * not append to a complete card.) Shared because it was duplicated into two scripts and a third
 * would have drifted.
 */
export const compileSettled = (filename: string, source: string) => {
  try {
    return compileCard(filename, normalizeGeneratedTsxCompat(source, { mode: "final" }));
  } catch {
    return compileCard(filename, normalizeGeneratedTsxCompat(source, { mode: "streaming" }));
  }
};

export const cardsIn = (dir: string) =>
  readdirSync(dir)
    .filter((n) => n.endsWith(".tsx"))
    .toSorted();

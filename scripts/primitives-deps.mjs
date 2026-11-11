/**
 * The set of external packages `@deepseek-ai/dsh-client-ui-primitives` actually requires.
 *
 * Its manifest declares only `@deepseek-ai/cordis` as a peer while `lib/index.js` imports a
 * couple of dozen bare specifiers, so this repo has to declare them itself. This derives the
 * real set from the shipped bundle rather than trusting either manifest.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { nonMutatingSort } from "./non-mutating-sort.mjs";

const require = createRequire(import.meta.url);
const entry = require.resolve("@deepseek-ai/dsh-client-ui-primitives");
const source = readFileSync(entry, "utf8");

/** Bare specifiers, collapsed to their package name (`shiki/core` → `shiki`). */
const packageOf = (specifier) => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

const required = new Set();
for (const match of source.matchAll(/(?:from|require\()\s*["']([^"']+)["']/g)) {
  const specifier = match[1];
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) continue;
  required.add(packageOf(specifier));
}

if (required.size === 0) throw new Error("未解析到任何依赖；请检查上游 bundle 格式，而不是把空结果当作通过。");

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const declared = new Set([...Object.keys(manifest.devDependencies ?? {}), ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);

const primitivesManifest = JSON.parse(readFileSync(require.resolve("@deepseek-ai/dsh-client-ui-primitives/package.json"), "utf8"));
const upstreamDeclared = new Set([...Object.keys(primitivesManifest.dependencies ?? {}), ...Object.keys(primitivesManifest.peerDependencies ?? {})]);

const missing = nonMutatingSort([...required].filter((name) => !declared.has(name) && !upstreamDeclared.has(name)));
const upstreamFixed = nonMutatingSort([...required].filter((name) => upstreamDeclared.has(name) && name !== "@deepseek-ai/cordis"));

console.log(`primitives requires ${required.size} external package(s); this repo declares ${[...required].filter((n) => declared.has(n)).length}`);

if (upstreamFixed.length > 0) {
  console.log(`\nupstream now declares ${upstreamFixed.length} of them itself:\n  ${upstreamFixed.join("\n  ")}`);
  console.log("\n→ the workaround block in package.json can drop these. See scripts/primitives-deps.mjs and CLAUDE.md.");
}

if (missing.length > 0) {
  console.error(`\nUNDECLARED — primitives requires these and nobody declares them:\n  ${missing.join("\n  ")}`);
  console.error("\nThey resolve today only by hoisting accident. Add them to devDependencies.");
  process.exit(1);
}

console.log("\nok: every package primitives requires is declared by this repo or by upstream.");

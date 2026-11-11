/**
 * Compiles the cards in `test/cards/` (or a directory given as argv[2]) and screens them for the three failures that
 * compile cleanly and break at runtime (CLAUDE.md §4): a default export shadowing an import
 * (React #185, a blank card), a JSX subscript `<a[k] />` (illegal where `<a.b />` is fine),
 * and viewport units in something that is a component on someone else's page.
 *
 * The screens were verified against a deliberately broken card before being trusted — the
 * first version's subscript regex matched `useState<number[]>` and missed `<META[k].icon />`,
 * which is exactly backwards.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";

import { cardsIn, compileSettled, initTsxFromDisk } from "./tsx-node.ts";

import { REPLAY_CONTROLS, SCREENS } from "./screens.ts";

await initTsxFromDisk();
const dir = process.argv[2] ?? "test/cards";
const EXEMPT: Record<string, string> = { "piano.ui4a.tsx": "HARDCODED-BACKGROUND" };

let bad = 0;
for (const f of cardsIn(dir)) {
  const src = readFileSync(`${dir}/${f}`, "utf8");
  // One named exemption, mirroring `test/screens-exercised.test.ts`: a piano's keys are white by
  // definition rather than by theme, so `HARDCODED-BACKGROUND` is right about the pattern and
  // wrong about this card. Narrowing the screen to spare it would cost three real corpus hits.
  const exempt = EXEMPT[f];
  const screened = Object.entries(SCREENS)
    .filter(([name, hits]) => hits(src) && name !== exempt)
    .map(([name]) => name);
  // the shape a settled card takes: normalize final, then transform
  try {
    // `final`, then `streaming` — the same two-step `compiler.ts` performs, and for the same
    // reason: normalize sometimes APPENDS to a complete card and breaks it (see
    // `test/normalize-complete.test.ts`), and the streaming mode's cut-back recovers it.
    // Without the fallback this script reported a card as FAIL that a reader would have seen
    // render perfectly — the checker being stricter than production is a false alarm, and a
    // false alarm about a real card is how a checker stops being read.
    const out = compileSettled(f, src);
    // A relative import only resolves because `canvas/subpages.ts` rewrites it to a blob URL
    // before compiling — `blob:` cannot host one otherwise (CLAUDE.md §3). A card with one is
    // fine, but the file it names has to exist, and this compiles cleanly either way.
    const relatives = [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.[^"']*)["']/g)].map((m) => m[1]);
    const dangling = relatives.filter((specifier) => {
      const base = `${dir}/${specifier.replace(/^\.\//, "")}`;
      return ![".tsx", ".ts", "/index.tsx", "/index.ts", ""].some((suffix) => existsSync(base + suffix));
    });
    const flags = [...screened, dangling.length > 0 && `DANGLING-IMPORT ${dangling.join(" ")}`].filter(Boolean);
    console.log(`${f.padEnd(22)} ok  ${(out.code.length / 1024).toFixed(1)}kb  ${flags.length ? "⚠ " + flags.join(",") : ""}`);
    if (flags.length) bad++;
  } catch (e) {
    // Screens are text predicates, so they still apply to a card that did not compile — and a
    // card broken enough to fail is exactly where a second defect hides. Reporting only the
    // compile error here is what made this script's counts disagree with `corpus-rates.ts`.
    console.log(
      `${f.padEnd(22)} FAIL ${String((e as Error).message ?? e)
        .split("\n")[0]
        .slice(0, 80)}${screened.length ? "  ⚠ " + screened.join(",") : ""}`,
    );
    bad++;
  }
}
console.log(bad === 0 ? "\nall clean" : `\n${bad} with problems`);

// Every screen above, proven still live. `test/cards-negative/` holds one card per trap, each
// compiling cleanly and each *supposed* to be flagged — a checker that reports "all clean" over
// correct cards is indistinguishable from one that has stopped looking, and this project has
// already shipped two detectors that were silently blind. Only runs on the default directory.
const CONTROLS = {
  "jsx-subscript.tsx": "JSX-SUBSCRIPT",
  "jsx-subscript-attrs.tsx": "JSX-SUBSCRIPT",
  "long-hex-background.tsx": "HARDCODED-BACKGROUND",
  "fixed-overlay.tsx": "VIEWPORT-UNITS",
  "viewport-height.tsx": "VIEWPORT-UNITS",
  "shadowed-const.tsx": "SHADOWED-EXPORT",
  "exported-module-hook.tsx": "MODULE-SCOPE-HOOK",
  "shadowed-export.tsx": "SHADOWED-EXPORT",
  "module-scope-hook.tsx": "MODULE-SCOPE-HOOK",
  "blank-render.tsx": ["DESTRUCTURED-HOOK", "MISSING-REACT-IMPORT"],
  "missing-suspense.tsx": "MISSING-REACT-IMPORT",
  "missing-memo.tsx": "MISSING-REACT-IMPORT",
  "destructured-ref.tsx": "DESTRUCTURED-HOOK",
  "empty-result.tsx": "UNGUARDED-LAST-INDEX",
  "empty-first.tsx": "UNGUARDED-LAST-INDEX",
  "empty-second.tsx": "UNGUARDED-LAST-INDEX",
  "glob-in-jsx.tsx": "GLOB-IN-JSX",
  "no-focus-ring.tsx": "NO-FOCUS-RING",
  "unreachable-control.tsx": "UNREACHABLE-CONTROL",
  "brand-primary-fill.tsx": "BRAND-PRIMARY-FILL",
  "comma-in-style.tsx": "COMMA-IN-STYLE",
  "duplicate-style-key.tsx": "DUPLICATE-STYLE-KEY",
  "hardcoded-background.tsx": "HARDCODED-BACKGROUND",
  "ternary-background.tsx": "HARDCODED-BACKGROUND",
  "unguarded-async-handler.tsx": "UNGUARDED-ASYNC-HANDLER",
  "unguarded-number-input.tsx": "UNGUARDED-NUMBER-INPUT",
  "unlabelled-control.tsx": "UNLABELLED-CONTROL",
  "unstoppable-motion.tsx": "UNSTOPPABLE-MOTION",
  "hook-not-imported.tsx": "MISSING-REACT-IMPORT",
  "unquoted-css-unit.tsx": "UNQUOTED-CSS-UNIT",
  "unquoted-css-token.tsx": "UNQUOTED-CSS-UNIT",
  "regex-in-jsx-text.tsx": "REGEX-IN-JSX-TEXT",
  "and-into-arrow.tsx": "AND-INTO-ARROW",
  "transition-without-transform.tsx": "TRANSITION-WITHOUT-TRANSFORM",
  "unannounced-async-result.tsx": "UNANNOUNCED-ASYNC-RESULT",
  "swallowed-capability-failure.tsx": "SWALLOWED-CAPABILITY-FAILURE",
  "selection-without-state.tsx": "SELECTION-WITHOUT-STATE",
  "never-leaves-loading.tsx": "NEVER-LEAVES-LOADING",
  "self-shadowing-memo.tsx": "SELF-SHADOWING-MEMO",
  "toast-without-toaster.tsx": "TOAST-WITHOUT-TOASTER",
  "named-numberflow-import.tsx": "NAMED-NUMBERFLOW-IMPORT",
  "invented-capability.tsx": "INVENTED-CAPABILITY",
  "hardcoded-colour-class.tsx": "HARDCODED-COLOUR-CLASS",
  "brand-primary-fill-class.tsx": "BRAND-PRIMARY-FILL-CLASS",
} as const;
if (process.argv[2] === undefined) {
  for (const [name, want] of Object.entries(CONTROLS)) {
    const src = readFileSync(`test/cards-negative/${name}`, "utf8");
    for (const screen of Array.isArray(want) ? want : [want]) {
      if (SCREENS[screen](src)) console.log(`control ${name}: ok, ${screen} fires`);
      else {
        console.log(`control ${name}: DETECTOR BLIND — ${screen} no longer fires`);
        bad++;
      }
    }
  }
  // A screen with no control is one nothing would notice going quiet — the state every screen
  // here was in before `test/cards-negative/` existed, and the state a newly added one starts
  // in. Cheap to enforce, and it is the difference between "found nothing" and "stopped looking".
  const controlled = new Set(Object.values(CONTROLS).flat());
  // The other direction: a card in `test/cards-negative/` that no checker claims is a control
  // nothing runs — it looks like coverage in the directory listing and asserts nothing. The one
  // legitimate exception is `replay-stream.ts`'s, which owns its own control.
  const claimed = new Set<string>([...Object.keys(CONTROLS), ...REPLAY_CONTROLS]);
  for (const name of readdirSync("test/cards-negative")) {
    if (claimed.has(name)) continue;
    console.log(`card ${name}: ORPHANED — no screen claims it, so nothing runs it`);
    bad++;
  }
  for (const screen of Object.keys(SCREENS)) {
    if (controlled.has(screen)) continue;
    console.log(`screen ${screen}: NO CONTROL — add a card to test/cards-negative/ that it must flag`);
    bad++;
  }
}

// It has counted `bad` since it was written and never acted on it — a checker that only ever
// prints is one nothing can fail against.
if (bad > 0) process.exit(1);

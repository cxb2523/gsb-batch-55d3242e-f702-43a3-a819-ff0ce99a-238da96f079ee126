import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { SCREENS } from "../scripts/screens.ts";

/**
 * `test/cards-negative/` proves each screen FIRES. `screens-quiet-on-fix.test.ts` proves each
 * stays quiet on a minimal correct snippet. This proves the third thing: that a real, whole,
 * working card in `test/cards/` actually contains the construct the screen looks at.
 *
 * Without it a screen can be quiet across every reference card because none of them has a
 * `type="range"` or calls `bash` at all — coverage that looks identical to coverage that works.
 * Two screens were in exactly that state when this was written.
 */
const CONSTRUCTS: Record<string, RegExp> = {
  "BRAND-PRIMARY-FILL": /brand-primary/,
  "COMMA-IN-STYLE": /style=\{/,
  "DESTRUCTURED-HOOK": /useRef|useMemo/,
  "DUPLICATE-STYLE-KEY": /style=\{/,
  "GLOB-IN-JSX": /<code>/,
  "HARDCODED-BACKGROUND": /background/,
  // Read a colour utility, not a `background:` declaration — the whole point of the two class
  // screens is that a card written this way has no style object for the older ones to read.
  "HARDCODED-COLOUR-CLASS": /className="[^"]*\b(?:bg|text|border)-/,
  "BRAND-PRIMARY-FILL-CLASS": /className="[^"]*\bbg-/,
  "JSX-SUBSCRIPT": /\[\w+\]/,
  "MISSING-REACT-IMPORT": /Fragment|Suspense|memo/,
  "MODULE-SCOPE-HOOK": /useState/,
  "NO-FOCUS-RING": /outline/,
  "SHADOWED-EXPORT": /^import/m,
  "UNGUARDED-ASYNC-HANDLER": /streamText|bash\(/,
  "UNGUARDED-LAST-INDEX": /\[0\]|match\(/,
  "AND-INTO-ARROW": /&&/,
  "TRANSITION-WITHOUT-TRANSFORM": /transition/,
  "UNANNOUNCED-ASYNC-RESULT": /\$dsh\/(?:ai|fs|exec)/,
  "SWALLOWED-CAPABILITY-FAILURE": /catch/,
  "UNQUOTED-CSS-UNIT": /fontSize|font-size/,
  "REGEX-IN-JSX-TEXT": /\\d|\\w/,
  "UNGUARDED-NUMBER-INPUT": /type="number"/,
  "UNLABELLED-CONTROL": /type="range"/,
  "UNSTOPPABLE-MOTION": /@keyframes|transition:/,
  "UNREACHABLE-CONTROL": /<button|onClick/,
  "VIEWPORT-UNITS": /width|height/,
  "SELECTION-WITHOUT-STATE": /\.map\(/,
  "NEVER-LEAVES-LOADING": /useState\(true\)/,
  "SELF-SHADOWING-MEMO": /useMemo|useCallback/,
  "TOAST-WITHOUT-TOASTER": /<button/,
  "INVENTED-CAPABILITY": /\$dsh\//,
  "NAMED-NUMBERFLOW-IMPORT": /^import \{/m,
};

const cards = readdirSync(`${import.meta.dir}/cards`).filter((name) => name.endsWith(".tsx"));
const everything = cards.map((name) => readFileSync(`${import.meta.dir}/cards/${name}`, "utf8")).join("\n");

test("every screen has a construct entry", () => {
  expect(Object.keys(CONSTRUCTS).toSorted()).toEqual(Object.keys(SCREENS).toSorted());
});

test("some reference card contains the construct each screen looks at", () => {
  expect(
    Object.entries(CONSTRUCTS)
      .filter(([, re]) => !re.test(everything))
      .map(([name]) => name),
  ).toEqual([]);
});

/**
 * One exemption, named rather than screened around: a piano's keys are white BY DEFINITION, not
 * by theme, so `HARDCODED-BACKGROUND` fires on `piano.ui4a.tsx` and is right about the pattern
 * and wrong about the card. Narrowing the screen to spare it would cost the three real corpus
 * hits, which are ordinary surfaces.
 *
 * Listing it here keeps the cost visible. An exemption that grows is a screen that needs redoing.
 */
const EXEMPT: Record<string, string> = { "piano.ui4a.tsx": "HARDCODED-BACKGROUND" };

test("and every reference card is clean under all of them", () => {
  const dirty = cards.flatMap((name) => {
    const src = readFileSync(`${import.meta.dir}/cards/${name}`, "utf8");
    return Object.entries(SCREENS)
      .filter(([screen, fires]) => fires(src) && EXEMPT[name] !== screen)
      .map(([screen]) => `${name}: ${screen}`);
  });
  expect(dirty).toEqual([]);
});

test("every exemption is still needed", () => {
  const stale = Object.entries(EXEMPT).filter(([name, screen]) => !SCREENS[screen](readFileSync(`${import.meta.dir}/cards/${name}`, "utf8")));
  expect(stale).toEqual([]);
});

/**
 * A screen whose predicate names more than one element covers more than one construct, and every
 * per-screen map in this repo has silently confirmed only the first at some point today: the
 * rules→screens audit, `RULE_FOR_SCREEN`, and `PAIRS` all shipped as one-to-one and all grew a
 * second entry after a defect slipped through.
 *
 * This is the structural version — it reads the predicate rather than trusting a hand-maintained
 * list, so a screen that GAINS a construct fails until its maps grow too.
 */
// Comments are stripped first, so this counts elements the PREDICATE names, not ones its prose
// mentions. `BRAND-PRIMARY-FILL` and `UNGUARDED-NUMBER-INPUT` discuss a second element in their
// comments and match on one — which is the right answer, and is why reading the source by eye put
// them on this list wrongly.
const MULTI_CONSTRUCT = ["UNLABELLED-CONTROL", "UNREACHABLE-CONTROL"];

test("the screens naming two elements are the ones on the list", () => {
  const source = readFileSync(`${import.meta.dir}/../scripts/screens.ts`, "utf8").replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const found: string[] = [];
  for (const name of Object.keys(SCREENS)) {
    const start = source.indexOf(`"${name}":`);
    if (start === -1) continue;
    const next = source.indexOf('\n  "', start + 5);
    const body = source.slice(start, next === -1 ? source.length : next);
    const elements = new Set([...body.matchAll(/<(input|select|button|div|textarea|img|a)\b/g)].map((m) => m[1]));
    if (elements.size > 1) found.push(name);
  }
  expect(found.toSorted()).toEqual(MULTI_CONSTRUCT.toSorted());
});

/**
 * The screens, as named predicates rather than inline regexes — `test/cards-negative/` asserts
 * each one still fires, and a control that re-implements the rule it guards proves nothing.
 */
/**
 * Negative-control cards owned by `replay-stream.ts` rather than by a screen.
 *
 * Lives here because `compile-cards.ts` exempts them from its ORPHANED check and
 * `replay-stream.ts` is the thing that justifies the exemption — written as a literal in the
 * exempting file, it would outlive its owner silently. Both import it from here; neither
 * imports the other, which would run a script as a side effect of a check.
 */
import { capabilityModule } from "../src/contract.ts";
import { bind } from "../src/client/runtime/bindings.ts";

export const REPLAY_CONTROLS = ["late-hook.tsx"] as const;

/**
 * The JSX tag starting at `start`, ending at the `>` that closes it.
 *
 * Depth-counted, not `[^>]*`: a handler like `onChange={(e) => …}` puts a `>` INSIDE the tag, so
 * a regex stops there and never sees the attributes after it. Three screens had that bug, each
 * one reporting a card that had written `aria-label` or `role` in the position the regex could
 * not reach — and a screen that flags the model for following the rule is worse than none.
 */
export const tagAt = (source: string, start: number): string => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    else if (source[i] === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return "";
};

/**
 * Every `$dsh/…` specifier that resolves to something.
 *
 * Enumerated from `bind()` rather than listed again here: a group added to the implementation and
 * missed by a hand-written list would make this screen flag a *working* capability. Calling a
 * member needs a host, but enumerating the keys never calls one — the same trick
 * `gen-standalone.ts` uses to generate the standalone stubs.
 */
const CAPABILITIES = new Set(Object.keys(bind()).map(capabilityModule));

export const SCREENS = {
  // `export default function Pie` next to `import { Pie } from "recharts"`: the card renders
  // itself, and dies with no useful error.
  // Both spellings of the default export. 377 of 378 corpus cards write `export default
  // function X`, and the screen only knew that one — the 378th writes `const X = () => …;
  // export default X`, which shadows exactly the same way and was invisible.
  "SHADOWED-EXPORT": (src: string) => {
    const def = (/export default function (\w+)/.exec(src) ?? /export default ([A-Z]\w*)\s*;?\s*$/m.exec(src))?.[1];
    const imported = [...src.matchAll(/import\s*\{([^}]+)\}\s*from/g)].flatMap((m) =>
      m[1].split(",").map((x) =>
        x
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      ),
    );
    return def !== undefined && imported.includes(def);
  },
  // JSX only, not generics: `<Foo[k] />` is illegal, `useState<Foo[]>` is everywhere. An
  // immediate `]` was the original discriminator and it is not enough — `Record<Step["channel"],
  // string>` has an index expression too, and was the checker's only hit in 362 real cards.
  // What separates them is what comes after the bracket: a JSX tag continues into attributes or
  // closes, a type argument continues into `,` or `>`.
  "JSX-SUBSCRIPT": (src: string) => /<[A-Z]\w*\[[^\]]+\]\s*(\/?>|[a-zA-Z-]+=)/.test(src),
  // A CSS unit written unquoted in a style object: `fontSize: 11px`. `11px` is not a JS token,
  // so the file does not parse at all — the reader gets nothing, and the error points into JSX
  // (`Expected '</'`) rather than at the property. React wants either the bare number or the
  // string. One corpus card, on two lines of the same element; it never survived to render.
  // Must skip the card's own `<style>` block, where `font-size: 11px` is not just legal but
  // required — a naive match fired on 35 of 39 clean cards. The discriminator is camelCase:
  // a style OBJECT writes `fontSize`, CSS writes `font-size`, and no card mixes them up.
  // `const f = a > 0 && (i: number) => …` does not parse: the arrow binds looser than the `&&`.
  // Fatal, and the error names neither the `&&` nor the arrow.
  // Same line, and the parens must hold a PARAMETER LIST — `cond && (` opening a multi-line JSX
  // block whose body happens to contain a `.map((g) => …)` matched 8 of 39 clean cards otherwise.
  // A parameter list is identifiers, commas, and optional type annotations; JSX is not.
  // A type token must NOT itself match a trailing space: with ` ` inside the character class,
  // the run of spaces before a `,` or `)` could be split between it and the following `\s*`,
  // and the `(, param)*` loop turned that ambiguity exponential — `&& (a: T , a: T …)` with a
  // dozen params took ~800 ms. Interior spaces (`string | number`) still match, via the group.
  "AND-INTO-ARROW": (src: string) => /&&\s*\(\s*\w+(\s*:\s*[\w<>[\]|"]+(?: +[\w<>[\]|"]+)*)?(\s*,\s*\w+(\s*:\s*[\w<>[\]|"]+(?: +[\w<>[\]|"]+)*)?)*\s*\)\s*=>/.test(src),
  // Content that arrives asynchronously and never announces it. A sighted reader watches a
  // spinner become a list; a screen reader user is told nothing at all — the focus is still where
  // it was and the new content is somewhere below it, silent.
  //
  // **0 of 64 corpus cards and 0 of 13 fresh ones do this**, which is what makes it worth a
  // screen: the only defect measured today with a perfect record of being missed BOTH before and
  // after the rules. Everything else improved; this one never had a rule to improve under.
  //
  // One `aria-live` on the container the results land in is the whole fix, or `role="status"`,
  // which implies it. Scoped to cards that actually fetch: a card computing a value synchronously
  // has nothing to announce, and flagging those would make this noise.
  "UNANNOUNCED-ASYNC-RESULT": (src: string) => {
    const code = src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    if (!/\$dsh\/(?:ai|fs|exec)|streamText|await bash\(|await readFile\(|await readdir\(/.test(code)) return false;
    // A card that only WRITES has no arriving result to announce.
    if (!/set[A-Z]\w*\(/.test(code)) return false;
    // Presence only, deliberately. A region rendered INSIDE the conditional it announces enters
    // the DOM with the content and announces nothing — but **0 cards in 378 + 64 do that**, so
    // detecting it would guard a hypothetical. The skill warns about it in prose, which is where
    // a rule with no observed violation belongs. Verified the three post-rule cards have the
    // region in their FIRST server render, which is the property that makes it work.
    return !/aria-live|role="(?:status|alert|log)"/.test(code);
  },
  // A capability call whose failure the reader never learns about. `} catch {}` around a
  // `streamText` or a `bash`, then `setLoading(false)` — the spinner stops, the card is empty,
  // and nothing says why. 15 of 378, **14 of them `$dsh/ai` cards**, where a failed request is
  // the likeliest outcome worth explaining.
  //
  // Three things count as surfacing it, and all three were found by a version of this screen
  // firing on a card that was right: state named for the failure however spelled (`setErrMsg`,
  // `setStatus("error")`), a rethrow to the surface's error boundary (a strategy no corpus card
  // uses and three fresh ones do), and **rendering `stderr`** — for a command runner that is the
  // best possible form, not a missing message.
  //
  // Scoped to a `catch` that WRAPS the capability call: a card catching `JSON.parse` mid-stream
  // or a `localStorage` write is handling something explicitly non-fatal, and flagging those made
  // the first version fire on every fresh card that was correct.
  "SWALLOWED-CAPABILITY-FAILURE": (src: string) => {
    const code = src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    if (!/try\s*\{[^]{0,600}?(?:await\s+)?(?:bash|readFile|readdir|readBytes|writeFile|streamText)\s*\([^]{0,600}?\}\s*catch/.test(code)) return false;
    const surfaced = /set(?:Err|Error|ErrMsg|Failure|Status)\w*\(|错误|失败|出错|无法|error\s*(?:&&|\?)|status === "error"|\.stderr\b/i.test(code);
    const rethrown = /catch[^{]*\{[^}]{0,240}\bthrow\b/s.test(code);
    return !surfaced && !rethrown;
  },
  // Two spellings of one defect: a CSS *value* written bare where JS needs a string. `11px` is not
  // a token, and neither is `var(--x)` — both fail the parse, and the error points into the JSX
  // several lines away rather than at the property.
  //
  // The token arm is the one the prompt steers into: the colour rule says take every colour from
  // `--dsw-alias-*`, so a card writing `color: var(--dsw-alias-label-primary)` is following it and
  // forgetting the quotes. Anchored inside `style={{` because unquoted `var(--x)` is CORRECT in a
  // `<style>` block, which is where most cards write it and where the camelCase discriminator the
  // unit arm relies on cannot help — `color` is spelled the same in both.
  "UNQUOTED-CSS-UNIT": (src: string) => /[{,]\s*[a-z]+[A-Z]\w*:\s*-?[\d.]+(px|rem|em|vh|vw|deg)\b/.test(src) || /style=\{\{[^}]*?\b[a-zA-Z]+:\s*var\(--/.test(src),
  // A regex written as bare JSX text: `<div>^\w+@\w+\.\w{2,}$</div>`. JSX reads `{2,}` as an
  // expression and the parse fails on the comma. The card that did it was *showing* the pattern
  // to the reader, which is a reasonable thing to want — the fix is `{"…"}` or a code element,
  // not dropping the feature. Any brace-quantifier in text position is the tell.
  // Text position, and the opening tag is usually on the PREVIOUS line, so this cannot anchor
  // on `>`. Three discriminators, each found by a wrong version of this screen firing on cards
  // that were RIGHT: no `/` or `(` (that is a regex literal being passed to something), no
  // quote (a quoted `"\\w{2,}"` is a string — the correct way to SHOW a pattern, and all three
  // other corpus cards that display one do exactly that), and a single backslash (`\\w` in
  // source is an escaped string, `\w` bare is JSX text). Only the unquoted, unescaped form
  // reaches the JSX parser as `{2,}`.
  "REGEX-IN-JSX-TEXT": (src: string) => /^[^/("'`<>=\n]*(?<!\\)\\[dwsSWD][^/("'`<>\n]*\{\d+,\d*\}[^/("'`<>\n]*$/m.test(src),
  // A card is a component on someone else's page, so both halves are the same mistake: sizing
  // against the window rather than the container it was given. `100vh` is the two real hits in
  // 378; the `fixed` half has never fired on a corpus card and is kept because the prompt names
  // it as a rule — `test/cards-negative/fixed-overlay.tsx` is what keeps it from rotting.
  "VIEWPORT-UNITS": (src: string) => /100v[wh]|position:\s*["']?fixed/.test(src),
  // A hook called outside every function body. Compiles perfectly and dies at first render with
  // React error #321 — the class §4 says only rendering catches, except this one is visible in
  // the source: a hook at **column 0** is in no component by definition. Anchored there and
  // nowhere else; allowing leading whitespace matches the `useEffect` inside 109 of 378 cards.
  // `const [a, setA] = useMemo(…)`. Only `useState` and `useReducer` return a pair; the others
  // return one value, so destructuring throws "not iterable" at render and the card is blank.
  "DESTRUCTURED-HOOK": (src: string) => /(?:const|let)\s*\[[^\]]+\]\s*=\s*(?:useMemo|useCallback|useRef|useEffect)\s*\(/.test(src),
  // A React export used without importing it — `<Fragment>` with only `useState` imported.
  // Skipped entirely when the card does a namespace or default import, which brings everything.
  "MISSING-REACT-IMPORT": (src: string) => {
    if (/import\s+\*\s+as\s+\w+\s+from\s*["']react["']|import\s+React\s*(?:,|from)/.test(src)) return false;
    // Only the names normalize will NOT supply. Measured, because guessing it wrong twice cost an
    // afternoon: `normalizeGeneratedTsx` adds a missing react import line, AND extends an existing
    // one with any **hook** it finds used — but never with a JSX component. So `<Fragment>` beside
    // `import { useState }` reaches the reader as `Fragment is not defined`, while `useMemo` in
    // the same position is quietly repaired. `test/normalize-complete.test.ts` pins both halves.
    const REPAIRED = /^use[A-Z]/;
    const imported = new Set(
      [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']react["']/g)].flatMap((m) =>
        m[1].split(",").map((x) =>
          x
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim(),
        ),
      ),
    );
    // The JSX form for every name, not just `Fragment`. The `\s*[(<]` arm only sees a call or a
    // generic, so `<Suspense fallback={…}>` — the way Suspense is actually written — matched
    // nothing, and the screen was `Fragment`-only in practice.
    // Hooks too, not only the components. Zero of 378 corpus cards got this wrong and **2 of the
    // first 17 generated after this session's prompt edits did** — a card opening with a `const`
    // lookup table and calling `useState` below it throws `useState is not defined`, mounts, and
    // paints nothing. The old list of five names could not see it.
    const names = /<(Fragment|StrictMode|Suspense)\b|\b(Fragment|StrictMode|Suspense|memo|forwardRef|useState|useEffect|useMemo|useCallback|useRef|useReducer|useLayoutEffect)\s*[(<]/g;
    return [...src.matchAll(names)].map((m) => m[1] ?? m[2]).some((name) => !imported.has(name) && !REPAIRED.test(name));
  },
  // `xs[xs.length - 1].field` on an array that came from outside the card. A `!xs` guard passes
  // for `[]`, so an empty result — a repo with no commits, a failed command, an empty directory —
  // renders blank. Restricted to externally-filled arrays on purpose: three other cards in 378
  // index the last element of an array they built from a literal or a counted loop, which cannot
  // be empty, and flagging those is how a screen becomes noise.
  "UNGUARDED-LAST-INDEX": (src: string) => {
    // Both ends of the array, and EVERY match rather than the first. One card indexes `[0]` and
    // `[length - 1]`, so a screen that knew only one shape would go quiet the moment the author
    // reached for the other end — and taking only the first match lets one benign index on a
    // literal array hide every real one after it. Neither costs anything: the report is 1 of 378
    // either way, and the difference only shows up on a card not yet written.
    const names = [...[...src.matchAll(/(\w+)\[\s*(\w+)\.length\s*-\s*1\s*\]\s*\./g)].filter((m) => m[1] === m[2]).map((m) => m[1]!), ...[...src.matchAll(/(\w+)\[\s*0\s*\]\s*\./g)].map((m) => m[1]!)];
    // Externally-filled arrays only, on purpose: three other cards index the last element of an
    // array they built from a literal or a counted loop, which cannot be empty, and flagging
    // those is how a screen becomes noise.
    return /\$dsh\/(exec|fs|ai)/.test(src) && names.some((name) => new RegExp(`set${name[0]!.toUpperCase()}${name.slice(1)}\\b`).test(src) && !new RegExp(`${name}\\.length\\s*(===?\\s*0|>\\s*0|\\?)|!${name}\\.length`).test(src));
  },
  // A light surface colour written as a literal: `background: "#fff"`. The card has assumed a
  // white page, so it renders white-on-white in dark mode. Three of 378 corpus cards match, and
  // they are the dark-mode failures found by rendering — every other hardcoded colour in the
  // corpus is a chart series or an accent, not a surface.
  //
  // Backgrounds only, deliberately. Six corpus cards ignore the token rule entirely, but the
  // other three fail it with light *text* (`color: "#fff"` on a coloured button), which is
  // correct on both themes — widening this to any extreme luminance reports all six and three of
  // them are fine. It is the surface that has to come from the theme.
  //
  // The value is matched, not the line. A first version anchored on `background: "#` and missed
  // a third card whose surface is behind a multi-line ternary (`active ? "#dcfce7" : "#fff"`),
  // which is how a model actually writes a selected state.
  // The no-token half is load-bearing after all: 35 corpus cards paint a `#fff` surface *and*
  // use design tokens elsewhere, which is a deliberate light accent on a themed card. An earlier
  // version dropped this clause after measuring that it changed nothing — that measurement was
  // taken against the narrower regex, which never saw those 35.
  // An async EVENT HANDLER that awaits something slow and then setStates, with nothing to tell
  // it a newer run started. Click file A, click file B while A is still loading, and A's result
  // lands last and wins — the panel shows B selected with A's contents.
  //
  // `useEffect` has the `let cancelled = false` idiom and the corpus uses it; handlers mostly do
  // not (38 of 46 cards with such a handler, and 24 of those await `bash`, which has no bound).
  // Only slow awaits count: a `readFile` that returns in a millisecond cannot realistically be
  // overtaken, and screening it would report a third of the corpus for a race nobody can hit.
  "UNGUARDED-ASYNC-HANDLER": (src: string) => {
    const bodyAt = (open: number) => {
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") {
          depth -= 1;
          if (depth === 0) return src.slice(open, i + 1);
        }
      }
      return "";
    };
    // A guard is any comparison against a ref or flag a later run would have moved. Written to
    // accept either side of the `!==`: `id !== runId.current` is the spelling the corpus uses.
    //
    // `latest` and `stale` used to be alternations here, matching a BARE identifier — so any
    // handler that happened to name a variable `latest` cleared itself with no guard at all.
    // They matched 0 of 378 corpus cards, so they were pure speculation buying a false-negative
    // hole; removing them leaves every verdict on the corpus, the fresh cards, and the reference
    // set unchanged. A word is not a guard.
    const guarded = /cancelled|aborted|\bsignal\b|\.current\b[\s\S]{0,20}?[!=]==|[!=]==[\s\S]{0,20}?\.current\b/;
    return [...src.matchAll(/(?:const \w+ = async|async)\s*\([^)]*\)\s*=>\s*\{/g)].some((match) => {
      const body = bodyAt(match.index + match[0].length - 1);
      if (!/streamText|\bbash\(/.test(body) || !/set[A-Z]\w*\(/.test(body)) return false;
      return !guarded.test(body);
    });
  },
  // `Number(e.target.value)` straight into state from a `type="number"` field. Clearing it
  // yields `""`, and `Number("")` is **0** — so the reader cannot backspace to retype: the field
  // snaps to 0 the moment it empties. Typing a lone `-` gives `NaN`, which renders as blank and
  // takes every derived value with it.
  //
  // A `type="range"` slider cannot produce either (43 of the corpus's 74 occurrences are
  // sliders, and screening those would report a fifth of the corpus for an impossible input).
  // 16 of the 26 real cases already guard, which is what makes this a rule people can follow.
  "UNGUARDED-NUMBER-INPUT": (src: string) =>
    [...src.matchAll(/Number\((?:e|event)\.target\.value\)/g)].some((match) => {
      const before = src.slice(Math.max(0, match.index - 500), match.index);
      const tag = before.lastIndexOf("<input");
      if (tag === -1 || !/type="number"/.test(before.slice(tag))) return false;
      const handler = before.lastIndexOf("onChange");
      const window = src.slice(handler === -1 ? match.index - 120 : match.index - (before.length - handler), match.index + 160);
      return !/isNaN|Number\.isFinite|=== ""|\|\| 0|\?\?|parseFloat|value === ""/.test(window);
    }),
  // A `type="range"` or a `<select>` with no label of any kind. A screen reader announces "slider, 40" — the
  // number rendered beside it is a separate element and is not connected to the control.
  //
  // Ranges only: a text field usually has a placeholder to fall back on, and a `<label>` wrapping
  // the input labels it as well as `aria-label` does. Tag ends are found by brace depth, because
  // `onChange={e => …}` puts a `>` inside the tag and a `[^>]*` regex stops there — which is how
  // the first count of this came out at 241 instead of 61.
  // A group of `.map`ped buttons whose selected one differs only in styling. Sighted users see
  // which is picked; a screen reader is told three identical buttons, and so is a keyboard user
  // checking where they landed. 10 of 23 cards measured on 2026-08-24 — filter chips, mode
  // switchers, session pickers, time signatures, the same shape every time.
  //
  // Took three versions, each refuted by a real card rather than by review: a character budget
  // for the callback body is not a bound (900 missed one, 1500 missed another — sliced by brace
  // depth now); `aria-label` is not state, since a static one reads the same either way; and the
  // selection flag is rarely `===`, one tracker computing it with `.includes()`.
  "SELECTION-WITHOUT-STATE": (src: string) =>
    [...src.matchAll(/\.map\((?:\([^)]*\)|\w+)\s*=>\s*([{(])/g)].some((match) => {
      const open = match[1];
      const close = open === "{" ? "}" : ")";
      let depth = 0;
      let end = match.index + match[0].length - 1;
      for (; end < src.length; end += 1) {
        if (src[end] === open) depth += 1;
        else if (src[end] === close && (depth -= 1) === 0) break;
      }
      const block = src.slice(match.index, end);
      return (
        /(===|\.includes\(|\.has\()/.test(block) &&
        // Either spelling of "shown as selected": an inline style ternary or a conditional class.
        (/(background|border|color)\s*:\s*[^\n]*\?/.test(block) || /className=\{`[^`]*\$\{[^}]*\?/.test(block)) &&
        /<button/.test(block) &&
        // Disclosure buttons expose expansion state, not option selection. `open ? rotate : ""`
        // is the same visual ternary, but `aria-expanded` already gives assistive technology the
        // state and should not be reported as a missing selection contract.
        !/<Disclosure\b|aria-expanded=/.test(block) &&
        !/aria-(pressed|selected|checked|current)|role="(radio|tab|option|checkbox|switch)"/.test(block) &&
        // A label that switches on the same flag carries the state, less conventionally but audibly.
        !/aria-label=\{[^}]*\?/.test(block) &&
        // A key held down is momentary feedback, not a selection — announcing it would announce a
        // state that is over before it is read.
        !/onPointer(Down|Up)/.test(block)
      );
    }),
  // A card that starts in a loading state and never runs the thing that would leave it: no
  // `useEffect`, so nothing calls the loader it defined. It renders its skeleton forever, compiles
  // clean, and mounts without an error — the surface has nothing to complain about. 2 of the 5
  // cards that load anything asynchronously, measured 2026-08-24.
  // Matched by construct, never by an English word: an earlier version keyed on `/loading|pending/i`
  // anywhere in the source, which any card writing 加载 in a comment or "Loading…" in prose would
  // trip. What identifies the defect is the *declaration* — a boolean state initialised `true`
  // whose only writer is inside a function nothing calls.
  "NEVER-LEAVES-LOADING": (src: string) => {
    const flags = [...src.matchAll(/const \[(\w+), (\w+)\] = useState\(true\)/g)];
    if (flags.length === 0 || /useEffect/.test(src)) return false;
    // Only when something async exists to wait for — a card with a `true` boolean and no fetch is
    // just a card with an open panel.
    if (!/\b(bash|readFile|readdir|readBytes|streamText|fetch)\s*\(/.test(src)) return false;
    // And only when the setter is never reached from an event either: a button that starts the
    // load is a design choice, not a stuck card.
    return flags.some(([, , setter]) => !new RegExp(String.raw`on[A-Z]\w*=\{[^}]*\b${setter}\b`).test(src));
  },
  // `const weekDates = useMemo(() => weekDates(ref), [ref])` — the local const shadows the
  // top-level `function weekDates`, so the arrow calls itself inside its own TDZ and the card
  // throws `Cannot access 'weekDates' before initialization` on first render. `genui check` does
  // report it, buried among six `implicitly has an 'any' type` lines that genuinely are noise.
  "SELF-SHADOWING-MEMO": (src: string) => /^\s*const (\w+) = (?:useMemo|useCallback)\(\s*\(\)\s*=>\s*\1\(/m.test(src),
  // sonner renders nothing unless its Toaster is in the tree, and `toast()` alone throws nothing
  // and logs nothing — the card simply never confirms anything it does.
  "TOAST-WITHOUT-TOASTER": (src: string) => /\btoast[.(]/.test(src) && !/<Toaster\b/.test(src),
  // `@number-flow/react` exports the component as `default`; there is no named `NumberFlow`, so a
  // named import is `undefined` and a blank card with nothing in the console naming it. Measured:
  // a card wrote this 90 minutes after the rule against it landed.
  "NAMED-NUMBERFLOW-IMPORT": (src: string) => /import\s*\{[^}]*\bNumberFlow\b[^}]*\}\s*from\s*["']@number-flow\/react["']/.test(src),
  // A `$dsh/…` specifier outside the bound set resolves to nothing at render time, and ESM takes
  // the whole module down with it: `Failed to resolve module specifier`, a blank card, and every
  // other check reporting clean. Matches all three ways a specifier appears — `from "x"`, a
  // side-effect `import "x"`, and `import("x")`; the first version matched only `from` and let
  // both of the others through.
  "INVENTED-CAPABILITY": (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*["'](\$dsh\/[^"']+)["']/g)].some((m) => !CAPABILITIES.has(m[1])),
  "UNLABELLED-CONTROL": (src: string) => {
    // `<select>` has the same problem for the same reason — its options are its value, not its
    // name, so an unlabelled one announces "combo box, 每天". Six more corpus cards, and the
    // same fix, which is why it lives here rather than in a screen of its own.
    return [...src.matchAll(/<input\b|<select\b/g)].some((match) => {
      const tag = tagAt(src, match.index);
      const named = /aria-label|aria-labelledby|\bid=/.test(tag);
      if (named) return false;
      if (match[0] === "<input" && !/type="range"/.test(tag)) return false;
      // A `<label>` nearby is not evidence unless it names THIS control. Any `<label>` within
      // 250 characters used to clear the finding, so a card labelling its number input
      // correctly suppressed the report on an unlabelled slider two lines below — the corpus
      // case escaped only because its label happened to sit 1273 characters away.
      //
      // Two forms count: `htmlFor` pointing at an id this tag carries (but a tag with an `id`
      // is already cleared above), and a label WRAPPING the control, where the association is
      // implicit. The wrapping form is what the lookback is really for, so it is the one kept:
      // an unclosed `<label>` before the control and no `</label>` between them.
      const before = src.slice(Math.max(0, match.index - 250), match.index);
      const open = before.lastIndexOf("<label");
      return open === -1 || before.slice(open).includes("</label>");
    });
  },
  // Movement with no `prefers-reduced-motion` escape. The setting is not about taste: for people
  // with vestibular disorders a sliding or scaling element causes nausea, and the OS switch is
  // the only way they can say so.
  //
  // Movement, not every transition. 60 corpus cards transition only colour or opacity, which the
  // setting is not asking about — screening those reports a third of the corpus for a fade. What
  // is left is 47 cards transitioning `transform`/`all` and 16 with `@keyframes`, and **7 of 131
  // animating cards honour it at all**, the worst adherence rate measured here.
  "UNSTOPPABLE-MOTION": (src: string) =>
    // Two spellings of the guard, and the class one had to be added or this screen reported the
    // CORRECT card: probed, `animate-[…] motion-reduce:animate-none` fired identically to the
    // same keyframes with no guard at all, so the screen could no longer tell right from wrong.
    // A screen that fires on both is worse than one that fires on neither — it teaches the reader
    // to ignore it.
    !/prefers-reduced-motion|\bmotion-reduce:/.test(src) &&
    // `transition: all` is NOT enough on its own: 9 corpus cards write it on a button whose only
    // animated properties are colour and border, and `all` there means nothing moves. Requires a
    // transform to exist somewhere — either named in the transition, or present as a property the
    // `all` would pick up.
    (/@keyframes/.test(src) ||
      /transition(?:Property)?:\s*["']?[^;"'`}]*transform\b/.test(src) ||
      // The class spellings of the same thing: `transition-transform`, `animate-spin`, and the
      // arbitrary `animate-[…]`. Without these the screen only sees cards written with a style
      // object, which is no longer how a card is written.
      /\b(?:transition-transform|animate-(?:spin|ping|pulse|bounce|\[))/.test(src) ||
      (/transition(?:Property)?:\s*["']?[^;"'`}]*\ball\b/.test(src) && /transform:\s*(?:translate|scale|rotate|matrix)/.test(src))),
  // `transition: "transform .12s ease"` on an element whose transform is never set. The
  // transition animates nothing — it reads as polish and costs a repaint budget for a property
  // that does not change. Four of 378 corpus cards.
  //
  // A transform counts however it is applied, including imperatively: one card assigns
  // `e.currentTarget.style.transform = "scale(0.95)"` from `onMouseDown`, which is real motion
  // and was the first false positive a naive version of this produced.
  "TRANSITION-WITHOUT-TRANSFORM": (src: string) => {
    if (!/transition(?:Property)?:\s*["']?[^;"'`}]*\btransform\b/.test(src)) return false;
    // Everything except the transition declarations themselves — naming `transform` there is the
    // promise, not the thing promised. Comments go too: this screen's own negative control talks
    // ABOUT `style.transform = …` in a comment, which cleared it. A card explaining the fix in
    // prose is not a card applying it, and that is exactly the shape a control takes.
    const rest = src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replaceAll(/transition(?:Property)?:\s*["']?[^;"'`}]*/g, "");
    return !/\btransform\b\s*[:=]/.test(rest);
  },
  // The value stops at `;` as well as `,`, which is what ends a CSS declaration — without it the
  // match ran to the closing brace and swept in the NEXT property, so `background: var(--dsw-…);
  // color: #fff` read as a hardcoded background. That was 35 spurious hits, and it was masked by
  // a `!/dsw-alias/` escape that skipped any card using a token ANYWHERE.
  //
  // The escape is gone: it excused a whole file for one correct line, and it made the screen
  // catch 0 of 48 injected defects — a card that uses tokens once could hardcode every background
  // and never be seen. Stopping at `;` gives the same 3 of 378 with nothing excused. The braces
  // still have to be balanced, because `background: active ? cfg.color : "#fff"` is two of the
  // three real hits.
  //
  // A slider's `::-webkit-slider-thumb` is exempt, and so is anything a card CALLS a knob, thumb,
  // or handle: those are white the way a piano key is white, by physical convention rather than by
  // theme, and a themed one looks broken. Both fresh cards to trip this screen were styling one —
  // a range thumb, then a toggle switch knob, which the pseudo-element list could not cover.
  //
  // The split is clean and worth stating: **every corpus hit is an ordinary surface (5 of 5) and
  // every fresh hit is a knob (3 of 3)**, so the exemption costs nothing and the residue is real.
  // The same defect in the class syntax, where the old regexes are blind: a colour utility whose
  // value is a literal (`bg-[#fff]`, `text-[rgb(…)]`) or one of Tailwind's own fixed-palette
  // ramps (`bg-slate-800`), both of which pin the card to one theme. Measured on a probe: the two
  // screens below fired on NEITHER, because they read `background:` in a style object and a card
  // written with classes has none. `border-l1`/`border-l2` are ours and must not be caught, so
  // the ramp list is explicit rather than a `-\d00` pattern.
  "HARDCODED-COLOUR-CLASS": (src: string) => {
    const RAMPS = "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    return new RegExp(String.raw`\b(?:bg|text|border|ring|divide|from|to|via)-\[(?:#|rgb|hsl|oklch)`, "i").test(src) || new RegExp(String.raw`\b(?:bg|text|border|ring|divide|from|to|via)-(?:${RAMPS})-\d{2,3}\b`).test(src);
  },
  // `brand-primary` has no short class on purpose, so reaching it at all means an arbitrary value
  // — and as a FILL it is the foreground colour, which is the defect. Same rule as
  // `BRAND-PRIMARY-FILL` below, in the spelling a card can still write it.
  "BRAND-PRIMARY-FILL-CLASS": (src: string) => /\bbg-\[var\(--dsw-alias-brand-primary\)\]/.test(src),
  "HARDCODED-BACKGROUND": (src: string) =>
    [...src.matchAll(/background(?:Color)?\s*:\s*((?:[^,;{}]|\{[^{}]*\})*)/gi)].some(
      (match) => /#(?:fff|ffffff|fafafa|f8fafc|f9fafb|fefefe)\b/i.test(match[1]) && !/::(?:-webkit-slider-thumb|-moz-range-thumb|-webkit-slider-runnable-track|-moz-range-track)|\b(?:knob|thumb|handle)\b/i.test(src.slice(Math.max(0, match.index - 160), match.index)),
    ),
  // The same key twice in one `style={{…}}`: the last wins and the first is silently dropped.
  // Nothing fails, so it survives until someone edits the dead line — the skill names it as one
  // of the two mistakes worth a checker round trip, and no screen here caught it.
  //
  // Brace-matched, and depth-1 keys only. A regex bounded by `}}` stops at the first nested
  // object and reports two cards that are fine; counting `{...spread, background: …}` as a
  // duplicate reports a third. Checked against `@genui/cli`, which agrees on exactly one.
  "DUPLICATE-STYLE-KEY": (src: string) => {
    for (const start of [...src.matchAll(/style=\{/g)].map((m) => m.index + m[0].length - 1)) {
      let depth = 0;
      const keys: string[] = [];
      for (let i = start; i < src.length; i += 1) {
        const char = src[i]!;
        if (char === "{" || char === "(" || char === "[") depth += 1;
        else if (char === "}" || char === ")" || char === "]") {
          depth -= 1;
          if (depth === 0) break;
        } else if (depth === 2 && (src[i - 1] === "{" || src[i - 1] === ",")) {
          const key = /^\s*([a-zA-Z]\w*)\s*:/.exec(src.slice(i));
          if (key !== null) keys.push(key[1]!);
        }
      }
      if (new Set(keys).size !== keys.length) return true;
    }
    return false;
  },
  // `style={labelStyle, { marginTop: 14 }}` — a comma operator, not a merge. JavaScript
  // evaluates `labelStyle`, throws it away, and applies only the object after the comma, so the
  // element silently loses every style the named object carried. The author meant
  // `{...labelStyle, marginTop: 14}`. Nothing fails: the card renders, one label unstyled.
  //
  // Found by running `@genui/cli` over the corpus, which reports it as "Left side of comma
  // operator is unused and has no side effects" — a message that names the mechanism and not
  // the mistake, which is why it is worth a screen with the fix in its name.
  // Comments are stripped first: a card explaining this very trap (`test/cards/near-misses`)
  // contains the bad form in prose, and a screen that reads prose reports the documentation
  // rather than the code — the same false positive `skill.ts` produces for the mutation audit.
  "COMMA-IN-STYLE": (src: string) => /style=\{\s*(?!\{)[A-Za-z_$][\w$]*\s*,/.test(src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")),
  // `--dsw-alias-brand-primary` as a background with a light foreground on top. Despite the
  // name it is a *foreground* colour — it equals the body text colour in both themes (near-white
  // on dark, near-black on light), so a tile filled with it and white text on top is a white
  // square on dark and unreadable. The accent you fill with is `state-business-primary`.
  //
  // 50 of 378 cards fill with it and 12 pair it with a light foreground. Only the pairing is
  // screened: filling with it and putting `label-primary` on top is merely odd, while filling
  // with it and writing `#fff` is invisible half the time. The skill states this rule outright,
  // which makes it the clearest measure of a rule the prompt has not landed.
  "BRAND-PRIMARY-FILL": (src: string) => [...src.matchAll(/background(?:Color)?:\s*[^,;}]*brand-primary[^,;}]*/g)].some((match) => /color:\s*["']?(#fff\b|#ffffff\b|white\b|var\(--dsw-alias-bg-)/i.test(src.slice(match.index + match[0].length, match.index + match[0].length + 120))),
  // A control the keyboard cannot reach. Two shapes, both invisible to whoever wrote the card
  // because a mouse works either way: `onClick` on a `<div>` (no focus, no Enter, no Space), and
  // a button whose only content is an icon with no `aria-label` (a screen reader says "button").
  // 17 and 31 of 378 respectively — the two most common defects here after `BRAND-PRIMARY-FILL`.
  //
  // Comments stripped first, and the `<div>` arm requires the onClick to be on the DIV rather
  // than anywhere in its attributes, so `<div><button onClick=…>` is not a hit.
  "UNREACHABLE-CONTROL": (src: string) => {
    const code = src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    // A `<div onClick>` is only unreachable if nothing makes it focusable. No corpus card gets
    // this right (0 of 19), but a screen that cannot be satisfied would flag the fix too.
    // Tag ends found by brace depth, not `[^>]*`: `onClick={() => …}` puts a `>` INSIDE the tag,
    // so a regex stops there and never sees the `role`/`tabIndex`/`onKeyDown` that follow. A
    // freshly generated card doing everything right was reported for exactly this — the same bug
    // `UNLABELLED-CONTROL` was fixed for, left behind here.
    // ANY of the five clears it, not all of them — deliberately. `tabIndex` alone gives focus with
    // no Enter/Space, and `role="button"` alone announces without focus; both leave the row
    // half-reachable and both pass here. **0 cards in 378 + 70 do that**: a card either equips a
    // clickable div properly or not at all, so requiring the full set would guard a shape nobody
    // writes while adding a way for the screen to be wrong.
    if ([...code.matchAll(/<div\b(?=[^<]*\bonClick=)/g)].some((m) => !/tabIndex|onKeyDown|onKeyUp|onKeyPress|role=/.test(tagAt(code, m.index)))) return true;
    // An ICON element only. A `{expr}` body is not an icon — most are `{playing ? "暂停" : "播放"}`,
    // which announces fine, and matching those took the report from 17 to 41 of 378.
    return [...code.matchAll(/<button\b[^>]*>[\s\n]*<[A-Z]\w*[^>]*\/>[\s\n]*<\/button>/g)].some((match) => !match[0].includes("aria-label"));
  },
  // `outline: "none"` with nothing put back. 77 of 378 cards strip the focus ring and **0**
  // replace it, which makes this the most common single line here that breaks keyboard use:
  // tabbing through the card moves a cursor nobody can see. The replacement can be a
  // `:focus-visible` rule or a `boxShadow` driven by focus state, so both count.
  //
  // Deliberately NOT "has no focus ring": 237 interactive corpus cards define none, three times
  // what this catches, and they are fine — they keep the browser default, which is a real
  // affordance. Removing it is the defect; not styling it is a choice. Measured by stripping the
  // ring from 50 fresh cards, where the screen caught 5 — correct, since the other 45 fell back
  // to the default rather than suppressing it.
  "NO-FOCUS-RING": (src: string) => {
    const code = src.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    // A replacement need not be an outline: a `focused` flag driving borderColor is the same
    // affordance, and `beaa3fbf962b` in the corpus does exactly that — the one false positive
    // in 76. Anything that reads a focus state and paints a border or shadow from it counts.
    const replaced = /:focus-visible|outlineOffset|outline-offset|boxShadow[^,;}]*focus|focus[^,;}]*boxShadow/i.test(code) || /\bfocus(?:ed)?\b[\s\S]{0,80}?\b(?:border|borderColor|boxShadow|outline)\b|\b(?:border|borderColor|boxShadow|outline)\b[^\n]{0,80}?\bfocus(?:ed)?\b/i.test(code);
    return /outline:\s*["']none["']/.test(code) && !replaced;
  },
  // A glob written as JSX text: `<code>src/*.{ts,tsx}</code>`. Inside JSX those braces are an
  // expression, so `{ts,tsx}` is a comma expression over two identifiers that do not exist and
  // the card throws `ts is not defined` at render — a card explaining glob syntax breaks by
  // quoting a glob. I first recorded this as unscreenable; it is not. A real expression names
  // something **bound somewhere in the file**, and a glob's parts are bound nowhere. Requiring
  // a genuine binding site (declaration, parameter, import) rather than "the name appears on a
  // line with a keyword" is what takes this from 0 hits to exactly the one failing card.
  "GLOB-IN-JSX": (src: string) =>
    [...src.matchAll(/>[^<>{}]*\{([^{}]{1,40})\}[^<>{}]*</g)]
      .map((match) => match[1].trim())
      .filter((expression) => /^[a-zA-Z_$][\w$]*(?:\s*,\s*[a-zA-Z_$][\w$]*)+$/.test(expression))
      .some((expression) =>
        expression.split(",").every((part) => {
          const name = part.trim();
          return !new RegExp(`(?:const|let|var|function)\\s+${name}\\b|\\b${name}\\s*(?:,\\s*\\w+)?\\s*\\)\\s*=>|\\(\\s*${name}\\b[^)]*\\)\\s*=>|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*(?:=|from)`).test(src);
        }),
      ),
  // A hook called outside a component — it throws before anything renders. `export const` as
  // well as bare `const`: a card splitting its state into an exported helper writes the former,
  // and the screen's anchor would have walked straight past it.
  "MODULE-SCOPE-HOOK": (src: string) => /^(?:export\s+)?(?:(?:const|let|var)\s+[\w{}[\],\s:]+=\s*)?use[A-Z]\w*\s*\(/m.test(src),
} as const;

/**
 * One instance of every shape that is a *near miss* for a screen in `scripts/compile-cards.ts`
 * and must stay clean. The negative controls prove each screen fires; this proves it stays
 * quiet, which is the failure that costs more — a screen that flags a fifth of the corpus is one
 * nobody reads by the time it is right.
 *
 * Each line below was a real false positive at some point in a screen's history, or is the
 * nearest legal shape to one.
 */
import { useState, useRef, Fragment, memo, Suspense } from "react";
import { readdir } from "$dsh/fs";
import { bash } from "$dsh/exec";

// SHADOWED-EXPORT: a name that merely CONTAINS an imported one is not a shadow — the default
// export below is `SuspenseBoard`, which contains `Suspense`, and must not be flagged.
const FragmentList = memo(({ items }: { items: string[] }) => <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>);

// MODULE-SCOPE-HOOK: a module-scope const whose VALUE is a use-named identifier — not a call,
// so not a hook. Only the trailing `(` tells them apart.
const useStateLabel = "useState(…)";
const hookName = useStateLabel;

// COMMA-IN-STYLE: a spread merge, which is what `style={labelStyle, {...}}` was meant to be.
const labelStyle = { fontSize: 12, color: "var(--dsw-alias-label-secondary)" };

// JSX-SUBSCRIPT: a generic with an index type is not a subscripted tag.
type Channel = { channel: "a" | "b" };
const LABELS: Record<Channel["channel"], string> = { a: "A", b: "B" };

// UNGUARDED-LAST-INDEX: two near misses. `STEPS` is built from a literal so it cannot be empty;
// `tabs` has a setter but is filled from a literal too, with no `$dsh/*` anywhere near it — the
// screen is deliberately restricted to arrays filled from OUTSIDE, since three corpus cards
// index a counted array and flagging those is how a screen becomes noise.
//
// Its `$dsh/*` test is file-wide, though, so in a card that imports `$dsh/fs` for something
// ELSE, a literal-filled `useState` array indexed without a length check is still flagged.
// Building this card is what surfaced that; no corpus card has the shape, so the screen is
// left as it is rather than tightened against a case nobody writes.
const STEPS = ["one", "two", "three"];
const LAST = STEPS[STEPS.length - 1].toUpperCase();

// HARDCODED-BACKGROUND: a literal white as TEXT on a coloured fill reads on both themes.
// VIEWPORT-UNITS: a container query, not the viewport.
export default function SuspenseBoard() {
  // UNGUARDED-ASYNC-HANDLER: the reader can click this twice, and the ref guard means the older
  // run stops rather than overwriting the newer one. The screen must stay quiet on it.
  const runId = useRef(0);
  const reload = async () => {
    const id = ++runId.current;
    const out = await bash("ls");
    if (id !== runId.current) return;
    setRows(out.stdout.split("\n").map((name) => ({ name })));
  };
  const [rows, setRows] = useState<{ name: string }[]>([]);
  // UNGUARDED-LAST-INDEX again: externally filled, but guarded — the guard is what clears it.
  const newest = rows.length === 0 ? null : rows[0].name;
  return (
    <Fragment>
      {/* NO-FOCUS-RING: the ring is removed AND replaced, which is the whole point of the rule.
          `:focus-visible` shows it for the keyboard and not for the mouse. */}
      <style>{`.nm-row input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px }
        @container (min-width: 30rem) { .nm-row { grid-template-columns: 1fr 1fr; } }`}</style>
      <div className="nm-row" style={{ containerType: "inline-size", background: "var(--dsw-alias-bg-layer-1)", padding: 12 }}>
        <button
          onClick={() => readdir(".").then((entries) => setRows(entries.map((e) => ({ name: e.name }))))}
          style={{ background: "var(--dsw-alias-state-business-primary)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px" }}
        >
          {LABELS.a} · {LAST}
        </button>
        {/* `aria-live` on the container the async results land in — UNANNOUNCED-ASYNC-RESULT.
            A sighted reader watches the list appear; without this a screen reader is told
            nothing, and 63 of 378 corpus cards are in that state. */}
        <div aria-live="polite">
          <Suspense fallback={null}>
            <FragmentList items={rows.map((r) => r.name)} />
          </Suspense>
        </div>
        {/* HARDCODED-BACKGROUND used to be cleared for any card that mentioned a token anywhere,
            and this line asserted that "35 of 378 corpus cards do this and are correct". Both
            were wrong: the 35 were `background: var(--dsw-…); color: #fff`, where the match ran
            past the declaration and read the NEXT property. Measured with the match stopped at
            `;`, the real count is 0 — no corpus card uses tokens and hardcodes a background.
            The token here is the fix, not an accent. */}
        <span style={{ background: "var(--dsw-alias-bg-layer-1)", color: "#111", borderRadius: 4, padding: "0 4px" }}>{LABELS.b}</span>
        <span style={{ ...labelStyle, marginTop: 4 }}>merged</span>
        {/* BRAND-PRIMARY-FILL: `brand-primary` as a FOREGROUND is exactly what it is for, and
            `state-business-primary` is the colour you fill with. Neither is the mistake. */}
        <span style={{ color: "var(--dsw-alias-brand-primary)" }}>heading</span>
        {/* A fill with a DARK foreground: legible on light, and the screen only flags a fill
            paired with a light one. The `#fff` below belongs to a different element entirely —
            searching the whole file rather than the hundred characters after each fill reports
            17 of 378 instead of 11, and this card among them. */}
        <div style={{ background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-label-secondary)" }}>inverse</div>
        <button style={{ background: "var(--dsw-alias-state-business-primary)", color: "#fff", border: "none" }}>fill</button>
        {/* UNREACHABLE-CONTROL: a button whose body is an EXPRESSION announces its text fine —
            matching those took the report from 17 to 41 of 378. And a div with an onClick on a
            CHILD is not the div being clickable. */}
        <button type="button" onClick={reload}>{rows.length === 0 ? "载入" : "清空"}</button>
        <div className="wrap"><button aria-label="复制" onClick={() => setRows([])}><span>⧉</span></button></div>
        {/* A div that IS keyboard-reachable — role, tabIndex and a key handler. No corpus card
            does this, so without a card here the screen could have stayed unconditional on
            `<div onClick>` and nothing would have noticed it flags the fix as well as the bug. */}
        <div role="button" tabIndex={0} onClick={() => setRows([])} onKeyDown={(e) => e.key === "Enter" && setRows([])}>clear</div>
        <input aria-label="filter" style={{ border: "none", outline: "none", font: "inherit" }} />
        {/* GLOB-IN-JSX: a glob shown as a STRING in braces is the fix, not the bug. Without this
            no reference card contained a `<code>` pattern at all, so the screen had a negative
            control proving it fires and nothing proving it stays quiet on the correct spelling. */}
        <code>{"src/**/*.{ts,tsx}"}</code>
        <span style={{ color: "var(--dsw-alias-label-secondary)" }}>{newest ?? hookName}</span>
      </div>
    </Fragment>
  );
}

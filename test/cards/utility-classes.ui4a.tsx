/**
 * A card written the way the prompt now teaches: utility classes, generated at runtime.
 *
 * It exists because the class syntax made three screens blind at once. `HARDCODED-BACKGROUND`
 * and `BRAND-PRIMARY-FILL` read `background:` out of a style object, and a card written with
 * classes has no style object — probed, and both were silent on an arbitrary hex fill and on a
 * fixed-palette ramp. `HARDCODED-COLOUR-CLASS` and `BRAND-PRIMARY-FILL-CLASS` cover that spelling,
 * and this is the card that exercises the constructs they read.
 *
 * It is also the correct-usage side of the two defects measured on real cards this week, both of
 * which this syntax makes unspellable rather than merely discouraged:
 *
 *   - a `<style>` selector keyed on `aria-pressed` while the JSX wrote `aria-checked`, so the
 *     selected state never appeared. Here the state and its style are one token.
 *   - a root's `gap` written as `.r { … }` in `<style>` with `className="r"` landing on an
 *     `<input>`, so the blocks below it sat flush. Here the class is on the element it governs.
 */
import { useState } from "react";

const RANGES = [
  { id: "mild", label: "Mild", note: "Manageable, no change to your day" },
  { id: "moderate", label: "Moderate", note: "Noticeable, limits some activities" },
  { id: "severe", label: "Severe", note: "Hard to carry on as usual" },
];

export default function Severity() {
  const [picked, setPicked] = useState("moderate");
  const [servings, setServings] = useState(4);
  const note = RANGES.find((r) => r.id === picked)?.note ?? "";

  return (
    <div className="grid gap-4 p-4 text-label">
      <h2 className="m-0 text-lg font-semibold">How bad is it?</h2>

      {/* The selected state and the style it produces are one token, so they cannot drift. */}
      <div role="radiogroup" aria-label="Severity" className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            role="radio"
            aria-checked={r.id === picked}
            onClick={() => setPicked(r.id)}
            className="rounded-md border border-line-2 px-3 py-1.5 text-sm hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-checked:border-transparent aria-checked:bg-accent aria-checked:text-white"
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="m-0 text-sm text-muted">{note}</p>

      {/* Pseudo-elements are reachable from the class on the input itself. */}
      <label className="flex items-center gap-3 text-sm">
        <span className="whitespace-nowrap text-muted">Servings</span>
        <input
          type="range"
          min={1}
          max={12}
          value={servings}
          onChange={(e) => setServings(Number(e.target.value))}
          className="min-w-0 flex-1 appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line-2 [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-label"
        />
        <span className="w-8 text-right tabular-nums">{servings}</span>
      </label>

      {/* Not every list earns columns, and this one does not: three pairs across three columns
          put "Mild 1h" beside "Moderate 4h" with nothing marking where a pair ends, and across
          two it left a hole. Shot at 720 both ways before settling on neither. What wide space
          is for here is a max-width, so the label and its number stay near each other. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-layer">
        <div className="grid max-w-[28rem] gap-1 p-3 text-sm">
          {RANGES.map((r) => (
            <div key={r.id} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 text-left text-muted">{r.label}</span>
              <span className="text-right tabular-nums font-medium">{RANGES.indexOf(r) * 3 + 1}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

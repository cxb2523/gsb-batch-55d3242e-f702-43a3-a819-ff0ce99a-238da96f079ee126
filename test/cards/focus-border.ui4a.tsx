/**
 * A card that strips the outline and puts the ring back as a focus-driven BORDER — never as an
 * `:focus-visible` rule. `NO-FOCUS-RING` must stay quiet on it.
 *
 * It lives in its own file deliberately. `near-misses.ui4a.tsx` already carries a
 * `:focus-visible` block for a different rule, so it clears this screen under both the narrow
 * and the widened predicate and cannot witness the difference — a guard card only has teeth if
 * the thing it guards is the ONLY reason the screen stays quiet.
 *
 * Three corpus cards were reported by the narrow form: `9d5a008515d2` and `e38228c4050f` with
 * `:focus { border-color }`, and `beaa3fbf962b` with a `focused` flag driving the border.
 */
import { useState } from "react";

export default function FocusBorder() {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ padding: 16, color: "var(--dsw-alias-label-primary)" }}>
      <style>{`.fb-css { outline: none } .fb-css:focus { border-color: var(--dsw-alias-state-business-primary) }`}</style>
      <input
        aria-label="border ring, from state"
        style={{ outline: "none", padding: "8px 10px", borderRadius: 8, border: `1px solid ${focused ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l1)"}` }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <input aria-label="border ring, from css" className="fb-css" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l1)" }} />
    </div>
  );
}

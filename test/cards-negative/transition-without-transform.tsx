import { useState } from "react";

// TRANSITION-WITHOUT-TRANSFORM. The button promises to animate `transform` and never sets one,
// so the transition animates nothing — polish that reads as done and does not happen.
//
// The card holds ONLY the defect: a screen answers for a whole card, so an imperative
// `e.currentTarget.style.transform = …` anywhere in this file would clear it. That form is real
// motion and must stay quiet; it lives in `screens-quiet-on-fix.test.ts` instead, which is where
// a fix belongs.
export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <button style={{ transition: "transform .12s ease, border-color .12s ease" }} onClick={() => setN(n + 1)}>
      {n}
    </button>
  );
}

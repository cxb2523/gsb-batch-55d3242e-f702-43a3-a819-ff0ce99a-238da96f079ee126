import { useState } from "react";

// UNLABELLED-CONTROL. The `<span>` beside it renders "n = 3" for the eye, and a screen reader
// reads the two as unrelated: "n equals 3" then "slider, 3". Unlike a text field there is no
// placeholder and nothing inside the control to fall back on. 46 of 378 corpus cards.
export default function Sides() {
  const [n, setN] = useState(3);
  return (
    <div style={{ display: "flex", gap: 12, color: "var(--dsw-alias-label-primary)" }}>
      <span>n = {n}</span>
      <input type="range" min={1} max={6} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />
    </div>
  );
}

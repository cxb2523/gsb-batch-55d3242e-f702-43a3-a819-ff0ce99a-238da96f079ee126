import { useState } from "react";

// UNGUARDED-NUMBER-INPUT. `Number("")` is 0, so clearing the field snaps the value to 0 and the
// reader cannot backspace to retype — every keystroke fights them. A lone `-` gives NaN, which
// renders blank and takes every derived number with it. 10 of 378 corpus cards; 16 others guard.
export default function Portion() {
  const [servings, setServings] = useState(4);
  return (
    <label style={{ color: "var(--dsw-alias-label-primary)" }}>
      份数
      <input type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value))} />
      <span>{servings * 120} g</span>
    </label>
  );
}

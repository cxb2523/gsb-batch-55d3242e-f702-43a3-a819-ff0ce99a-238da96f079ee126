import { useState } from "react";

// AND-INTO-ARROW. The arrow binds looser than the `&&`, so this does not parse at all and the
// error (`An arrow function is not allowed here`) names neither operator. Put the guard in the body.
//
// The multi-line `cond && ( <div>…{xs.map((x) => …` below must stay quiet: an earlier version of
// the screen matched across the newline into that inner arrow and flagged 8 of 39 clean cards.
export default function Ranges() {
  const [cur] = useState({ lo: 0, hi: 3 });
  const inRange = cur.lo >= 0 && (i: number) => i >= cur.lo && i <= cur.hi;
  return (
    <div>
      {cur.hi > 0 && (
        <div style={{ padding: 4 }}>
          {[1, 2, 3].map((x) => <span key={x}>{inRange(x) ? "y" : "n"}</span>)}
        </div>
      )}
    </div>
  );
}

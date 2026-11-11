import { useState } from "react";

// REGEX-IN-JSX-TEXT. JSX reads the `{2,}` as an expression and fails on the comma, so the card
// never parses. Showing the pattern is a reasonable thing to want — the fix is `{"…"}` or a
// quoted string, which is what all three other corpus cards displaying a pattern actually do.
//
// The regex literal on the next line is CODE and must stay quiet: it is how every fresh card
// writes one, and an earlier version of the screen flagged all of them.
export default function Email() {
  const [v, setV] = useState("");
  const ok = /^\w+@\w+\.\w{2,}$/.test(v);
  return (
    <div>
      <div>
        ^\w+@\w+\.\w{2,}$
      </div>
      <input aria-label="邮箱" value={v} onChange={(e) => setV(e.target.value)} />
      <span>{ok ? "ok" : "no"}</span>
    </div>
  );
}

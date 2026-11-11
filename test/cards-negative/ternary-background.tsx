import { useState } from "react";

// The same trap as `hardcoded-background.tsx`, in the shape a model actually writes a selected
// state: the white surface is behind a multi-line ternary, so a screen anchored on
// `background: "#` never sees it.
export default function Picker() {
  const [picked, setPicked] = useState(0);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          onClick={() => setPicked(n)}
          style={{
            border: "2px solid #e5e7eb",
            background: picked === n
              ? "#dcfce7"
              : "#fff",
            color: "#111",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

import { useState } from "react";

// Compiles and renders fine in light mode; the panel is invisible in dark mode because the card
// paints its own white surface and never asks the host what the surface colour is.
export default function Notes() {
  const [text, setText] = useState("");
  return (
    <div style={{ background: "#fff", color: "#111", padding: 16, borderRadius: 10 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", minHeight: 80 }} />
      <div style={{ fontSize: 12 }}>{text.length} characters</div>
    </div>
  );
}

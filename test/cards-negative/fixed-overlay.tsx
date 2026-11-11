import { useState } from "react";

// The `position: fixed` half of VIEWPORT-UNITS, which has never fired on a real card. A card is
// a component on someone else's page: a fixed overlay escapes the chat column entirely and
// covers the app, and the reader cannot scroll it away.
export default function Details() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>details</button>
      {open ? <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)" }} onClick={() => setOpen(false)} /> : null}
    </div>
  );
}

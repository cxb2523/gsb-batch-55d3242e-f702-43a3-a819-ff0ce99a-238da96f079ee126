import { lazy, useState } from "react";

// The non-`Fragment` half of MISSING-REACT-IMPORT. `Suspense` is used and never imported, so
// the card compiles, mounts, and throws a ReferenceError with nothing on screen.
const Chart = lazy(() => import("./chart.tsx"));

export default function Answer() {
  const [open, setOpen] = useState(false);
  return <Suspense fallback={<div>loading…</div>}>{open ? <Chart /> : <button onClick={() => setOpen(true)}>show</button>}</Suspense>;
}

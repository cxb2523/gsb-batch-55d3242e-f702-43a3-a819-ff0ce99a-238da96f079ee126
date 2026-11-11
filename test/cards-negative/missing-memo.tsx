import { useState } from "react";

// The `memo` end of MISSING-REACT-IMPORT — the call form rather than a JSX tag. `memo(...)` with
// only `useState` imported is a ReferenceError at module evaluation, so the card never mounts at
// all: no error boundary, no partial render, nothing.
const Row = memo(({ label }: { label: string }) => <li>{label}</li>);

export default function Answer() {
  const [items] = useState(["a", "b"]);
  return <ul>{items.map((i) => <Row key={i} label={i} />)}</ul>;
}

import { useRef } from "react";

// The `useRef` end of DESTRUCTURED-HOOK. Only `useState` returns a pair; destructuring any
// other hook binds `undefined` to both names and the card fails on first use, not at compile.
export default function Timer() {
  const [start, setStart] = useRef(0);
  return <button onClick={() => setStart(Date.now())}>{String(start)}</button>;
}

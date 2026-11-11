import { useMemo } from "react";

// The `export const` spelling of MODULE-SCOPE-HOOK. A hook at module scope throws before
// anything renders, and the export prefix is what a card writes when it splits a derived value
// out for a sibling file to import.
export const ROWS = useMemo(() => [1, 2, 3].map((n) => ({ n })), []);

export default function Answer() {
  return <div>{ROWS.length}</div>;
}

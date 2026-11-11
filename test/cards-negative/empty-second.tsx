import { useEffect, useState } from "react";
import { bash } from "$dsh/exec";

// The unguarded index is the SECOND one. `COLUMNS[0].label` is safe — a literal array that
// cannot be empty — so a screen taking only the first match reads this card as clean.
const COLUMNS = [{ label: "hash" }, { label: "subject" }];

export default function Latest() {
  const [rows, setRows] = useState<string[] | null>(null);
  useEffect(() => {
    bash("git log --format=%s").then((r) => setRows(r.stdout.split("\n").filter(Boolean)));
  }, []);
  if (!rows) return <div>reading…</div>;
  return <div>{COLUMNS[0].label}: {rows[0].trim()}</div>;
}

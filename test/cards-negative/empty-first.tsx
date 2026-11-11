import { useEffect, useState } from "react";
import { bash } from "$dsh/exec";

// The `[0]` half of UNGUARDED-LAST-INDEX. `!rows` passes for `[]`, so a repo with no commits —
// or any command that printed nothing — throws on the very next line.
type Row = { hash: string; subject: string };

export default function Latest() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    bash("git log --format=%H%x09%s").then((r) => setRows(r.stdout.split("\n").filter(Boolean).map((l) => ({ hash: l.split("\t")[0]!, subject: l.split("\t")[1]! }))));
  }, []);
  if (!rows) return <div>reading…</div>;
  return <div>most recent: {rows[0].subject}</div>;
}

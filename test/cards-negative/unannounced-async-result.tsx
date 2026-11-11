import { useState } from "react";
import { bash } from "$dsh/exec";

// UNANNOUNCED-ASYNC-RESULT. The list arrives when the command finishes; a sighted reader watches
// it appear, and a screen reader is told nothing — focus has not moved and nothing announces.
//
// One `aria-live` on the container is the whole fix. 0 of 64 corpus cards and 0 of 13 fresh ones
// do it, which is the only defect measured on 2026-08-23 that neither population got right.
export default function Files() {
  const [rows, setRows] = useState<string[]>([]);
  return (
    <div>
      <button onClick={() => void bash("ls").then((r) => setRows(r.stdout.split("\n")))}>列出文件</button>
      <ul>
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

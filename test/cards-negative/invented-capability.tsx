// A capability the harness does not expose. `$dsh/state` is real; `$dsh/storage` is the name the
// model reached for five times in six before that module existed, and it is what an invented
// specifier looks like — plausible, adjacent to a real one, and fatal.
//
// ESM resolves the whole module graph before running anything, so this does not degrade: the
// import fails, the card's own code never runs, and the reader gets a blank surface with
// `Failed to resolve module specifier "$dsh/storage"` in a console they are not looking at.
// It compiles clean and every other screen reports nothing.
import { useState } from "react"
import { usePersistedState } from "$dsh/storage"

export default function Notes() {
  const [notes, setNotes] = usePersistedState<string[]>("notes", [])
  const [draft, setDraft] = useState("")
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
      <style>{`.n-in:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px }`}</style>
      <input className="n-in" aria-label="新笔记" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" onClick={() => { setNotes([...notes, draft]); setDraft("") }}>添加</button>
      <ul>{notes.map((n, i) => <li key={i} style={{ color: "var(--dsw-alias-label-primary)" }}>{n}</li>)}</ul>
    </div>
  )
}

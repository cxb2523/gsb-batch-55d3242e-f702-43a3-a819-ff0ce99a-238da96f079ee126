// `!commits` passes for `[]`, so an empty result — a repo with no commits, a command that
// returned nothing — makes `commits[-1].date` throw and the card renders blank. Found by
// mounting a real card whose data comes from `bash()`.
import { useEffect, useState } from "react"
import { bash } from "$dsh/exec"

type Commit = { hash: string; date: string }

export default function Log() {
  const [commits, setCommits] = useState<Commit[] | null>(null)
  useEffect(() => {
    void bash("git log --format=%H").then((r) => setCommits(r.stdout.split("\n").filter(Boolean).map((line) => ({ hash: line, date: line.slice(0, 10) }))))
  }, [])
  if (!commits) return <div>reading…</div>
  return <div>{commits[commits.length - 1].date}</div>
}

// Every trap `compile-cards.ts` screens for, in one card that compiles cleanly — the point is
// that compiling is not the same as working. A checker reporting "all clean" over a directory
// of correct cards cannot be distinguished from one that has stopped looking.
import { useState } from "react"

const PANELS = { a: () => <span>A</span>, b: () => <span>B</span> }

export default function Trap() {
  const [k] = useState<"a" | "b">("a")
  return (
    <div style={{ height: "100vh" }}>
      <PANELS[k] />
    </div>
  )
}

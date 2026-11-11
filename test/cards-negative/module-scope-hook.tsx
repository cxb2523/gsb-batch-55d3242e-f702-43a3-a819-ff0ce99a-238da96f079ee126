// A hook outside every component. Compiles, then dies at first render with React error #321 —
// found by mounting 378 real cards in a browser, which is the only thing that catches it.
import { useMemo } from "react"

const rows = useMemo(() => [1, 2, 3], [])

export default function Fib() {
  return <div>{rows.join(" ")}</div>
}

// Two ways a card compiles and renders nothing, both found by mounting 378 real cards.
// `useMemo` returns one value, so destructuring it throws "not iterable"; `Fragment` is used
// here without being imported. React catches both and renders an empty tree — no error boundary,
// no console message the reader sees, just a blank card.
import { useMemo, useState } from "react"

export default function Blank() {
  const [height, setHeight] = useMemo(() => [10, () => {}], [])
  const [n] = useState(0)
  return <Fragment>{height}{n}</Fragment>
}

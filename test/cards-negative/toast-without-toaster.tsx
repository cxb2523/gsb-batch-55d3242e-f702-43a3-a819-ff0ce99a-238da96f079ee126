// Real generated shape, minimised: sonner renders nothing unless its Toaster component is in the
// tree, and `toast()` alone throws nothing. The card looks finished and never confirms anything.
import { useState } from "react"
import { toast } from "sonner"

export default function Card() {
  const [items, setItems] = useState<string[]>([])
  return <button onClick={() => { setItems(x => [...x, "done"]); toast.success("已完成") }}>{items.length}</button>
}

import { useState } from "react";
import { Copy } from "lucide-react";

// Two controls a keyboard cannot reach. The div takes no focus and answers no Enter or Space;
// the icon button announces as "button" and nothing else. Both work with a mouse, which is why
// neither is noticed by whoever wrote the card.
export default function Answer() {
  const [picked, setPicked] = useState(0);
  return (
    <div>
      <div className="cell" onClick={() => setPicked(1)}>选我</div>
      <button onClick={() => navigator.clipboard.writeText("x")}><Copy size={14} /></button>
      <span>{picked}</span>
    </div>
  );
}

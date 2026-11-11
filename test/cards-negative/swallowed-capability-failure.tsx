import { useState } from "react";
import { streamText } from "$dsh/ai";

// SWALLOWED-CAPABILITY-FAILURE. The request fails, the catch is empty, `setLoading(false)` runs,
// and the reader is left with a card that stopped loading and shows nothing. 15 of 378 corpus
// cards do this and 14 of them call the model, where a failed request is the likeliest outcome.
//
// Three things count as surfacing it and must stay quiet: state named for the failure, a rethrow
// to the error boundary, and rendering `stderr`. Those live in `screens-quiet-on-fix.test.ts` —
// each was found by a version of this screen firing on a card that was right.
export default function Names() {
  const [names, setNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const go = async () => {
    setLoading(true);
    try {
      let all = "";
      for await (const chunk of streamText({ prompt: "五个猫名" })) all += chunk;
      setNames(all.split("\n"));
    } catch {}
    setLoading(false);
  };
  return (
    <div>
      <button onClick={go} disabled={loading}>换一批</button>
      <ul aria-live="polite">{names.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

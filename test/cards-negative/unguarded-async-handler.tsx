import { useState } from "react";
import { streamText } from "$dsh/ai";

// UNGUARDED-ASYNC-HANDLER. `generate` streams for seconds and setStates as it goes, with
// nothing to tell an earlier run that a newer one started. Click twice and both loops write
// `setLines` interleaved — the card shows two answers braided together, and the older one
// finishes last, so it wins. 23 of 378 corpus cards do this; 24 of the occurrences await
// `bash`, which has no bound at all.
export default function Ideas() {
  const [lines, setLines] = useState<string[]>([]);
  const generate = async (topic: string) => {
    setLines([]);
    let buffer = "";
    for await (const chunk of streamText({ prompt: `three ideas about ${topic}` })) {
      buffer += chunk;
      setLines(buffer.split("\n"));
    }
  };
  return <button onClick={() => generate("cats")}>{lines.length === 0 ? "生成" : lines[0]}</button>;
}

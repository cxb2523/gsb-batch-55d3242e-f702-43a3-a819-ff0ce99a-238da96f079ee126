## Generating content inside the card

`streamText` from `$dsh/ai` is for content whose **answer space is open**, and the trap is
that knowing the subject feels like the same thing as the data being fixed. It is not:

> "I know Tokyo, so the attractions are fixed knowledge — I don't need `streamText` here."

That sentence is from a real generation, and it produced five hardcoded itineraries. The
error is not the knowledge claim; it is that _three-day Tokyo itineraries_ is not a set of
five. Writing them out samples the space and presents the sample as the whole. Ask **could I
enumerate every answer**, not _do I know this topic_:

|           | Closed — no model call | Open — `streamText`                      |
| --------- | ---------------------- | ---------------------------------------- |
| Converter | 100°C is one number    |                                          |
| Timer     | one formula            |                                          |
| Itinerary |                        | any city, any length, any interest       |
| Recipe    |                        | whatever they have in the fridge         |
| Names     |                        | for a thing you have not been told about |

A closed answer has one right value per input. An open one has as many as the user has ideas,
and hardcoding it produces a card that demos beautifully and dead-ends the moment they want
something you did not think of. Yours is the interface; the content is theirs.

It inherits the app's model, so there is no key to ask for and no setup.

For an open answer space, make the first `streamText` call during the initial mount/effect and
render its streamed items as they arrive. A “regenerate” or “换一批” control may start another
request, but it cannot be the only path that produces the initial answer. Do not present a fixed
`SEED`/`POOL` as the requested result. If you keep fallback items, label them as fallback only
after a failed request, show the request error in the card, and let the reader retry. Filter empty
items, deduplicate them, and cap the final list to the requested count before rendering. If the
user requested a count, do not label fewer usable items as a completed batch.

Build the smallest working request-to-result path first: show loading, render the first usable
result, and keep visible empty/error/retry states. Add optional polish only after that path works;
do not spend the turn on checker experiments or speculative debugging before delivering a usable
card. Run one bounded source check after the first usable card exists, fix real source errors, and
do not loop on unchanged commands or known mapped-import diagnostics.

If the reader can select, revisit, or submit one of the generated items, the batch is card-owned
state too: persist it, or skip the initial request while a persisted batch is available. A
persisted selection must still be present in the displayed batch after a remount or regeneration;
do not pair an old selected answer with a newly generated list that no longer contains it. Keep a
preview draft and the one-time submitted answer separate. On regenerate, style, or filter changes,
clear the uncommitted draft, keep the last successful batch while the request runs, and show any
streamed items as provisional. Clear the draft **before starting the request**, not after the new
batch succeeds. In the submit handler, require a current successful batch whose stored filter matches
the active filter and whose items contain the draft choice; disable Submit while refreshing or showing
provisional items. Label a retained batch as previous while refreshing and prevent its
items from being submitted as new results; an explicit choice to use previous results is fine.
Replace the persisted batch when the new one succeeds; if it fails,
clear the current request's preview, show the error, and reveal the last successful batch. Store the
batch's generating style/filter with its items and compare it to the current filter after the same
normalization (for example, trim both). Label an old batch as old while a new filter is selected;
never imply those retained items match the new filter. Do not let a provisional item be
submitted as if it were in the persisted batch. A partial chunk must never clear or overwrite a
committed answer. After the answer is committed, disable replacement controls or require an explicitly
labelled new-question action; do not silently turn a sent answer back into an uncommitted choice.

**A second call must cancel the first.** Regenerating as the user types, or offering a Stop
button, means two generations in flight and the reader sees whichever finishes last — not the
newest. Pass an `AbortController`'s signal in the options and abort the previous one; that
stops the generation itself, not just your reading of it.

This combines cancellation, provisional parsing, and committing only a complete batch:

```tsx
import { streamText } from "$dsh/ai";
import { parse, Allow } from "partial-json";

const running = useRef<AbortController | null>(null);
const regenerate = async () => {
  running.current?.abort(); // the previous result is now stale
  const ctrl = (running.current = new AbortController());
  let buffer = "";
  setError("");
  setDraft(null);
  setPreview([]);
  try {
    for await (const chunk of streamText({ prompt, signal: ctrl.signal })) {
      if (ctrl.signal.aborted || running.current !== ctrl) return; // ignore a stopped or superseded request
      buffer += chunk;
      try {
        setPreview(normalizeItems(parse(buffer, Allow.ALL)?.items ?? []));
      } catch {} // incomplete frame only
    }
    if (ctrl.signal.aborted || running.current !== ctrl) return;
    const failure = buffer.match(/(?:^|\n\n)\[([^\n]+)\]\s*$/);
    if (failure) throw new Error(failure[1]); // host appends [reason] even after text when a 200 stream fails
    const next = normalizeItems(JSON.parse(buffer).items);
    if (!next.length || (requestedCount && next.length < requestedCount)) throw new Error("The batch is incomplete");
    setBatch(next); // persist only a complete success
  } catch (error) {
    if (running.current === ctrl && (error as Error).name !== "AbortError") setError(String(error));
  } finally {
    if (running.current === ctrl) {
      setPreview([]);
      running.current = null;
    } // reveal the previous batch on failure
  }
};
useEffect(
  () => () => {
    running.current?.abort();
    running.current = null;
  },
  [],
);
```

Ask for JSON with the fields you render. `normalizeItems` filters empty entries, deduplicates, and
caps the requested count. `setPreview` is transient and must never enable submission; `setBatch`
persists only complete usable results. The empty catch is only for parsing an incomplete frame:
never wrap `streamText` in `catch { setBatch(SEED) }`. A gateway, capability, or permission failure
must appear in a visible error state with `aria-live="polite"`, while the previous successful
batch remains available. An `AbortError` from a newer request or unmount may return quietly.
An HTTP 200 does not guarantee model success: the host can append `[reason]` or `[error: …]` after
partial text, or return only that marker (for example `[error: Insufficient Balance …]`). Show the
reason instead of reporting zero usable items or a generic JSON error. A valid JSON batch with too
few usable items is the separate incomplete-batch case.

**Every field is optional until the stream ends.** `partial-json` hands you the object as it
grows, so an item can arrive with a title and nothing else — and one `item.difficulty.includes(…)`
on that frame throws inside render, which unmounts the whole card mid-generation. Read every
streamed field defensively (`item.steps ?? []`, `item.difficulty === "简单" ? … : …`) and never
call a method on one without a fallback. This is the failure mode of this API, not an edge case.

One user turn per call — there is no conversation here. Anything the card knows from earlier
goes into the prompt it builds. And skip it entirely when the data is genuinely fixed: a
converter, a timer, a colour picker have nothing to generate.

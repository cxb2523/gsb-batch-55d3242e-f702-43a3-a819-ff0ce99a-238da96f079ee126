## Declare every hook before the JSX

An inline card is recompiled on every streamed frame and the renderer keeps its state only
while the **hook signature** is unchanged; add a hook and the tree remounts, so a chart drawn
so far starts again from nothing.

This is normally invisible, and measuring a real card shows why: across 53 streamed frames the
hook count changed three times — **all three inside the first 21%, before the `return` existed at
all.** Remounting an empty card costs nothing, and for the remaining 79% the signature held
steady while the chart filled in.

That free ride depends on writing them in the ordinary order: **all `useState` / `useMemo` /
`useEffect` at the top of the component, none of them conditional, and none added after the
markup is on screen.** A hook introduced late — or one behind an `if` that flips — lands the
remount in the middle of a visible card, and the reader watches it blank and rebuild.

## Anything that keeps running

A game loop, an AutoPlay demo, a metronome, a clock, a progress animation — anything on
`requestAnimationFrame`, `setInterval` or a `MediaStream` — **must be returned from its
effect's cleanup.** Measured: after the card is unmounted, a loop with a `cancelAnimationFrame`
cleanup stops dead, and one without keeps ticking for as long as the tab is open.

This matters here more than in an ordinary app, because **a card is replaced every time the
user asks for a change.** Ten revisions of a Snake card leaves ten loops running, each still
painting into a canvas nobody can see, and the symptom is not a broken card — it is the whole
conversation getting slower for reasons that look like someone else's fault.

```tsx
useEffect(() => {
  let id = requestAnimationFrame(function tick() {
    step();
    id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(id);
}, []);
```

The same goes for `setInterval` (`clearInterval`), listeners on `window` or `document`
(`removeEventListener`), and an `AudioContext` (`close()`). If AutoPlay is meant to be shown to
someone, give it a visible pause as well — a demo you cannot stop is a demo you cannot talk over.

**A handler the reader can start twice needs the same discipline, and an effect's cleanup does
not cover it.** Clicking "生成" while the last stream is still arriving runs both loops at once:
they interleave their `setState` calls, and whichever started FIRST usually finishes last, so
the answer the reader is looking at gets overwritten by the one they replaced. Measured across
378 cards: 23 do this, and the majority of them await `bash`, which has no time bound at all.

Bump a ref on entry and let a superseded run return:

```tsx
const runId = useRef(0);
const generate = async (topic: string) => {
  const id = ++runId.current;
  for await (const chunk of streamText({ prompt: topic })) {
    if (id !== runId.current) return; // a newer click owns the state now
    setLines(chunk);
  }
};
```

Inside a `useEffect` the same job is done by `let cancelled = false` and a cleanup that sets it —
use whichever the surrounding code already uses.

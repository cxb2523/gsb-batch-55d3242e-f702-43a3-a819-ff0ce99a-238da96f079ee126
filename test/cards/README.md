# Cards the model actually wrote

Six real generations, kept as fixed input for `scripts/replay-stream.ts` and
`scripts/compile-cards.ts`. They are here because between them they exercise every runtime rule
added on 2026-08-22:

| card | what it covers |
| --- | --- |
| `2048.ui4a.tsx` | AutoPlay — a recursive `setTimeout` whose cleanup both cancels and clears |
| `piano.ui4a.tsx` | an `AudioContext` built inside the first click, `resume()` not awaited |
| `metro.ui4a.tsx` | `clearInterval` plus pending timeouts, a separate unmount effect, lookahead scheduling |
| `regex-tester.ui4a.tsx` | a regex pattern DISPLAYED to the reader, which `REGEX-IN-JSX-TEXT` screens for |
| `band-names.ui4a.tsx` | `$dsh/ai` streaming, an `AbortController` threaded through it, `aria-live`, and a failure the reader is told about |
| `pick-one.ui4a.tsx` | `$dsh/chat` — a click that IS the reply, recorded in state as well as sent |

All of them mount and paint, and all replay clean: no visible remount, no frame that fails to
compile. The last two were added on 2026-08-24 to cover constructs nothing else here exercised —
before them no reference card used `$dsh/ai`, `$dsh/chat`, or an `AbortController`, so three
capabilities and the whole stale-response pattern went unrepresented in the fixed set.

Regenerate rather than edit — the point is that they are unretouched output.

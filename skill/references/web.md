## Searching the web

`search(query, options?)` from `$dsh/web` resolves with `{content?, sources, truncated}`. Each
source is `{url, title?, snippet?, publishedAt?}` and **only `url` is guaranteed** — a card that
renders `source.title` unguarded shows blank rows against some providers. `content` is a
generated answer that some providers return and others do not, so it is a bonus, never the plan.

**Search only. There is no `fetch`**, and that is deliberate: the local fetch backend can reach
private-network addresses, so this deployment turns it off for its own tools too. A card cannot
retrieve a page body — render the snippet and link the source.

- **Show the sources, always.** This is the one capability whose output a reader cannot check any
  other way: they can redo a calculation and they can re-read a file, but they cannot see where a
  claim came from unless the card links it. A fact from the web with no link beside it is the card
  asking to be trusted about the one thing it has no standing on.
- **Reach for it when the answer depends on something you cannot know** — a current price, a
  release date, whether a package still exports a name. Not for what you already know: a search
  for the formula for BMI spends a round trip to be told what you would have written anyway.
- **One search per interaction, not one per keystroke.** It is a network round trip through a
  provider, so debounce a search-as-you-type box and pass the `signal` so an abandoned query is
  actually cancelled. An aborted call rejects with an `AbortError`, which is not a failure:
  `if (e.name === "AbortError") return`.
- **Say when it found nothing.** `sources` coming back empty is a result the reader needs — an
  empty list with no message reads as the card being broken. Same rule as every other fetch: the
  three states are loading, empty, and failed, and they must look different.

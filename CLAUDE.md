# dsh-generative-ui

## DSH 0.1.7 host compatibility

Keep the legacy `settings.installSection` hookup only where that service still exposes it. New hosts own settings through profile `Config`: mark `allowExec` volatile, read the current reference, and rebuild the capability scope on the owning Loader's volatile update. A disabled command route and its prompt/skill documentation must disappear together. Do not change the product default.

The shell route uses `execute(spec).result()` on new hosts and `run(spec)` on old hosts, with explicit `onExpiry: "kill"`. Keep the session sandbox policy and per-stream output contract. Cancellation follows response-socket closure, not request-body completion; a response that is already destroyed when the body finishes starts no command at all, since there is nobody left to read the output. Both model requests and repair notices use the producer-owned `dsh-generative-ui` message source; they are not human input.

The command result forwards the executor's terminating `signal`, normalizing an omitted value to `null`. `exitCode: null` means no exit code was reported, and `signal: null` means no signal was reported; neither implies the other. `timedOut` remains independent: a deadline can expire before a process starts, so it does not promise a signal.

**This CLAUDE.md is the design doc, and `docs/` holds its evidence.** Change this file first, then the code — where they disagree, this file wins and the drift is a bug. The files under `docs/` carry the measurements and narratives behind its rules; where they disagree with this file, this file wins there too.

Everything here is written to be read before you act. Evidence, history and per-topic reference live in `docs/` — see the index at the bottom.

## In one sentence

A Web plugin for the DeepSeek Harness (dsh): the model writes TSX into the workspace, the Web half **compiles it as it streams and renders it with state preserved** into live UI — inline cards in the chat stream, canvas views as tabs in the host's right Sidebar.

The rendering stack is `partial-tsx` + `partial-react` + `@esm.sh/tsx`, the same as `../ui4a-playground`. **That one owns its host; this one is a guest in someone else's** — nearly all the difference lives in §2.

## 0. Toolchain

`bun run lint` scans the maintained `src`, `test`, `scripts`, `eval`, `website`, and `types` directories explicitly. Local worktrees and sibling checkouts nested at the repository root must not change its diagnostics.

**This package uses bun** (`bun install` / `bun run build`). dsh's pnpm only governs the profile directory — `dsh plugin --profile web add link:<path>` is dsh forwarding to pnpm, and it does not care how we install our own deps as long as `lib/*.js` exists.

`package.json`'s `prepare: bun scripts/build.ts` cannot be removed: installing from git gets you source with no `lib/`, and the plugin then silently fails to load.

## 1. Layers

| Layer | Where | Job |
| --- | --- | --- |
| Node half | `src/index.ts` | Host-only capabilities: wasm asset route, fs watching, session events |
| Browser half | `src/client/` | Slot registration, conversation node, render runtime |
| Render runtime | `src/client/runtime/` | Our own compiler + import-map + host-bridge |

One npm package, two exports (`.` and `./client`), declared through `package.json`'s `dsh` field. **Do not split the package** — dsh's model is one package with two halves.

## 2. What the host gives you and what it doesn't

Everything here was **measured**, not read out of a doc. Read it before changing anything; it saves a whole round of re-deriving.

### 2.1 The shared platform module table holds 11 entries, and it does not only shrink

`react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `@deepseek-ai/cordis` / `zod` / `@tanstack/react-virtual` / `@deepseek-ai/dsh-client-store` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` / `dsh-client-ui-dockkit`

The list moves in **both** directions, which is why the heading no longer promises one. rc.7 also had `dsh-client-web-react` / `dsh-client-ui-attachment` / `dsh-client-schema-form`; rc.8 dropped them and left 7; 0.2.1-rc.3 (measured 2026-10-26 off a running shell bundle) is back to 11, the four additions being `zod`, `@tanstack/react-virtual`, `dsh-client-store` and `dsh-client-ui-dockkit`. **So re-check it on every dsh upgrade**: listed = resolved at runtime via `require()` to the host's singleton; not listed = bundled into our own output; **listed but absent from the host = the `require()` fails and the whole client dies**. A *missing* entry fails the other way — silently, as a second copy of a host singleton — which is how our list sat four short from rc.2 without anything anywhere saying so. Inlining is what would hurt: two `dsh-client-store` copies do not share state. Measured, so the fix costs nothing today: building with the 7-entry list and with the 11-entry one produces a **byte-identical** `lib/client.js` and `lib/index.js`, because nothing in the dependency tree imports the four.

**Re-checking it is one command: `./scripts/platform-table.sh`** — verified 2026-10-26 against dsh 0.2.1-rc.3, printing "platform table matches (11 entries)". The table is **not in any installed package** (75 `@deepseek-ai` packages here, not one contains the string `"react/jsx-runtime"`, and `dsh-client-web` is not among them); it is compiled into the shell's own frontend bundle, so the script serves the app and fetches that bundle. Two host moves broke the probe silently before this was found, and both are handled now: the printed URL carries a `?token=` that answers **303** to a cookie a bare GET does not have (a bare GET answers 404), and the bundle is named by a plain `assets/index-*.js` string rather than a `src=` attribute. It exits 1 on a mismatch and **2 when the probe itself cannot read the bundle** — the first version reported "matches" with both sides empty because `rg` was not on the script's PATH.

It lives in `scripts/platform.ts` as `PLATFORM_MODULES`, and that one list has two consumers: `scripts/build.ts` externalizes exactly these, `scripts/smoke.ts` answers `require()` for exactly these and throws on anything else. They cannot drift apart any more — only the table needs changing.

**Neither `scheduler` nor `react-dom/server` is in the table.** The latter is required for preflight, so it has to be inlined, and **pinned to 18** to match the React bridged in.

### 2.2 React is 18.3.1, not 19

Measured on the host: `React 18.3.1` — **re-confirmed 2026-08-23** by fetching the shell's own `/assets/index-*.js` and grepping it: exactly one React version string (`"18.3.1"`), and the React 19-only APIs are all absent from the bundle (`useActionState`, `useOptimistic`, `useEffectEvent`, `use(` → 0 each) while the 18 APIs this plugin leans on are present (`useSyncExternalStore` ×4, `forwardRef`, `renderToString`). Repeat with `./scripts/platform-table.sh`'s fetch step if a dsh upgrade ever makes this look doubtful. Generated code reaches the host's **same** React instance through `host-bridge` — a second copy makes hooks fail silently.

Consequences:

- When writing components in this project, **React 19-only APIs are all off-limits** (`use()` / `useActionState` / `useOptimistic` / `cache` / `useEffectEvent` / ref-as-prop). Skip the whole `react19-*` section of `vercel-composition-patterns` — we still need `forwardRef`.
- `partial-react`'s peer is now `^18.3.0 || ^19.0.0` (widened in 0.0.5; it used to be `^19.0.0` only), and at runtime it only touches APIs 18 already has (measured — see MindLab-Research/macaron-genui-demo#1715). There used to be one spot in `runtime.ts:425` where `Promise<ReactNode>` wasn't assignable to 18's `ReactNode`; upstream has since fixed it with a cast.

  Note that **`skipLibCheck` does nothing here** — that option only skips `.d.ts`, and these two packages ship `.ts` source, so a value import really does compile them.

  This is why the packages' own source used to fail `tsc`; **`partial-react@0.0.6` fixed it** (see §2.6), so `typecheck` is plain `tsc --noEmit` again and there is nothing left to filter.
- `partial-tsx` / `partial-react` use `toSorted` / `findLast` / `toReversed`, so `lib` must be ≥ `ES2023`.

### 2.3 Non-JS assets only reach the browser through your own route

The `/plugins` route **hardcodes `/client.js` and `/client.js.map`**; everything else 404s. The static handler **used to** answer unmatched paths with index.html + 200 (not 404), so dropping wasm into its dist "looked like it worked" right up until `instantiateStreaming` reported a baffling magic-word error. **Re-measured 2026-08-23: that is fixed** — `/some/spa/route`, `/assets/missing.js`, `/missing.wasm` and an unmatched path under our own prefix all return **404 with a zero-length body**. The route we serve ourselves is unchanged and still correct: `200 · application/wasm · cache-control: immutable`.

The fix is a route from the Node half — `ctx.webServer.register({ kind: 'prefix', path: '/dsh-generative-ui/assets', ... })` — with the browser half hardcoding that URL. Measured: `200 · application/wasm · 2,610,857 B`.

Two constraints: the path **must be namespaced by package name** (a duplicate `(kind, path)` throws, and throwing during apply means the whole plugin silently fails to load); and **the Electron shape has no webServer routing**, so desktop needs another answer (or falls back to base64 inlining, +3.3MB).

`import.meta` doesn't exist in the CJS output, so upstream's bundler-agnostic `import.meta.resolve(...)` trick is unavailable — the URL has to be a hardcoded constant.

### 2.35 The `minimal` agent preset silences the whole Node half, and the client half survives it

A report that "the plugin does nothing" is very often a session on 极简模式: that preset's persona carries `complete: true`, so the resident prompt section is dropped and the `skill` tool is not present at all. The client half is unaffected — it renders a dictated fence whatever the preset. Nothing to fix in the plugin. **Ask which 模式 the session was on before debugging further.**

Measured end to end, including how to put the prompt back (it is a preset copy, not a prompt change), in [docs/host-notes.md](docs/host-notes.md).

### 2.4 Slots you may touch and slots you may not

| Slot | kind | Use |
| --- | --- | --- |
| `sidebar.right.pane.tab` | keyed, `scope: 'session'` | **Canvas tab body.** Keyed by the tab definition's `id`, not its `kind` |
| `sidebar.right.pane.tab.title` | keyed, `scope: 'session'` | The canvas tab's chip text; omit and the chip keeps the title captured at open |
| `conversation.chat.node` | keyed | **Inline cards.** Unregistered kinds degrade gracefully into a JsonBlock |
| `shell.overlay` | list | Frame-wide overlay, available if we need it |

**The canvas now lives in the right Sidebar as a registered tab type** (§3.6), which is the seam the
host actually ships for this: `dsh-client-ui-sidebar-right` owns a tab-type registry, and its own doc
says *"a tab type may ship from outside this repository"* with `priority: 'extension'` defined as *"a
type from outside the product"* — the band that outranks every viewer the product ships. The
`sidebar-files` / `browser` / `terminal` / `documentpreview` packages are all just tab types; so are we.

**`details` (the right-hand column) is off-limits — and as of 2026-08-23 the mechanism below can no longer be found.** Checked against rc.8: the shell bundle contains exactly one `kind:"single"` and it belongs to the `root` slot (`declaredBy: "(built-in)"`), while `conversation.details` appears **nowhere in any implementation or in the shell bundle** — only in two READMEs of `dsh-client-ui-conversation`, whose text describes tool presentation dispatching through `conversation.chat.node`, the slot we already use. So the specific chain recorded here cannot be reproduced. Kept as a prohibition anyway: it describes something we deliberately do not do, the priority mechanic that makes a `single` slot evictable is unchanged, and nothing was gained by registering there. **Treat the reasoning below as history, not as current fact.** It's `kind: 'single'` and currently held by ui-conversation's `DetailsPanel`. A dynamically loaded package gets a ctx facade that overrides priority (decrementing into the negatives per install), so **we necessarily beat the shipped 0** — registering silently evicts DetailsPanel, taking the `conversation.details.tool` sub-slot it declares with it, which **breaks tool-call inspection app-wide**. There is no handoff API.

Registration must be wrapped in `ctx.slots.inject(name, () => ...)`: these slots are declared by ui-conversation at runtime, and registering early throws `slot "..." is not declared`.

### 2.5 CSS has to mark itself

The loader's `claimStyles(id)` runs `document.querySelectorAll('style:not([data-plugin])')` and **claims every match** for whichever plugin is currently materializing. So every `<style>` this plugin appends must carry `data-plugin="dsh-generative-ui"` itself, or HMR and unload will tear each other's styles out. `injectStyles` is the one place that appends one.

**UnoCSS generates the cards' CSS in the browser; the canvas tab has no chrome to style.** The tab
strip, header, close control and width drag are the host's (§3.6), so there is no hand-written panel
stylesheet any more — `panel.css` and its compiled `panel-css.ts` went with the column they drew.
Everything a *card* writes goes
through `src/client/runtime/uno.ts`, which runs a real generator against the classes in the code
that just arrived. A build-time pass cannot do it: those classes are typed by the model seconds
ago and exist in no stylesheet of ours. Responsive is where that shows worst — a build-time sweep
generates no `@container` breakpoint at all, so every card is single-column at any width.

Five things about that setup are load-bearing, each measured rather than assumed:

- **`important` takes a SELECTOR STRING, and that is the scoping mechanism.** Every rule comes out
  `.ui4a-root :is(.gap-4){…}`. The runtime sheet is appended to `<head>` last, so an unscoped
  `hidden` from a card would beat the shell's own and make part of the app vanish — the playground
  has exactly that bug on record.
- **`preflights: { reset: false }`**, because presetWind4's reset is 3.5KB of `*, ::before,
  ::after { margin: 0; border: 0 solid }` aimed at the HOST's DOM. The `theme` layer survives it
  and is the half we need: `--spacing` is defined there and every `gap-*` / `h-*` / `p-*` resolves
  against it. Dropping preflights entirely makes those rules generate and compute to nothing.
- **The `theme` layer is on demand AND it is a preflight — so the streaming path has to ask for it
  on purpose, and then not re-append it.** Two halves, both measured, and they pull against each
  other. The empty-token preflight pass emits no variables at all (`trackedTheme` is empty, and
  Wind4's theme preflight returns early on that), and an incremental pass with `preflights: false`
  emits `padding: calc(var(--spacing) * 3)` against a sheet where `--spacing` was never defined —
  so `p-3` / `gap-2` / `rounded-2xl` compute to `0px` / `normal` / `0px` for the whole stream and
  jump when the settled pass rewrites the sheet. Measured in Chromium through the real
  `GenUISurface`, mid-stream vs settle. But the layer is **cumulative**: `trackedTheme` is a
  module-level set inside presetWind4, cleared only on `configResolved`, so `getLayer("theme")`
  returns the union of every variable the GENERATOR has ever been asked about. Appending that per
  frame wrote **96 `:root, :host` blocks and 16KB of a 42KB sheet** on one card streamed in 40-byte
  chunks — while only 8 of 103 generating frames had actually changed the layer. So: generate with
  preflights on, take `getLayers(undefined, ["preflights", "base", "theme"])` for the per-call
  utilities, and append the theme layer only when it differs from what is already in the sheet.
- **Form controls need their own scoped reset.** With the vendor reset gone, a `<button>` keeps the
  UA's `buttonface`, which is not theme-aware: measured in dark mode, two unselected buttons
  rendered as light grey blocks with black text while the rest of the card was dark.
- **`border: 0 solid` is the rest of that reset, and leaving it out made every bordered box
  invisible.** Wind4's `border` utility emits `border-width: 1px` and nothing else — it expects the
  vendor reset to have set the style. Nothing else in the document does: measured live in dsh web
  (2026-10-11), a plain `div` with `border-width: 1px` computes `border-style: none`, and none of
  the 143 stylesheets on that page carries a universal border rule (the host's own CSS is CSS
  Modules and spells `border: .5px solid var(--dsw-alias-border-l*)` on every rule). So
  `bg-layer border border-line` — the spelling §3.7 tells every card to write — computed
  **`border-width: 0px`, `border-style: none`**. In light theme, where all three layer tokens are
  `#fff`, that is a box with neither fill nor edge, which is what a reader reports as stray padding.
  `divide-*` and `ring-*` were immune because both set the style themselves, and form controls kept
  the `border: 0 solid` from the bullet above — which is why buttons and inputs had borders while
  every container `<div>` did not, and why a corpus of cards that looks right in dark hid it. It has
  to be the shorthand: a bare `border-style: solid` would leave the UA's initial
  `border-width: medium`, i.e. a 3px border on every element inside the scope.
- **A merged vendor rule has to be split, or Chromium drops the half it understands.** UnoCSS
  merges selectors that share a declaration, so a card styling a slider for both engines produces
  `…::-moz-range-thumb, …::-webkit-slider-thumb { height: … }` as ONE rule — and one unrecognised
  pseudo-element makes the browser discard the whole list. Measured on a real card: 75 of 87 rules
  survived parsing, the slider computed to `height: 0px`, and three controls were simply not
  there. Order is irrelevant; either vendor first gives zero surviving rules. The model writing
  both prefixes is correct, so `splitVendorRules` in `uno.ts` fixes it at generation time. **This
  is the shape to fear here**: it compiles, it renders, no screen fires, and only reading
  `getComputedStyle` off the real element shows it.

`ui4a-playground` runs the same design (`ui4a-playground/src/runtime/uno.ts`) and our file is a
port of it — diff the two rather than skimming, since ported files drift (§5).

**Responsiveness comes from the container, not the viewport.** The same block renders in a chat
column and in a panel the reader drags between 320 and 720px. `GenUISurface` gives the mount node
`container-type: inline-size` and the prompt teaches `@[30rem]:` prefixes. Measured: without
`container-type` the guarded declaration is simply inert, which reads as the model writing
something bad rather than as a missing container.

The trap still waiting: the host themes by ancestor (`body[data-ds-dark-theme]`), so if a rule
ever needs the theme in its selector, the scoping rewrite has to **hoist** it — `.dark .foo` →
`.dark .ui4a-root .foo` — and prefixing without hoisting breaks the moment the theme flips.

### 2.6 Four bundling settings you cannot skip

See `scripts/build.ts`. All four let the plugin **build fine and blow up at runtime**, with errors far from their cause, which is why `bun run smoke` catches every one of them without opening a browser:

- **`external` lists only the platform table, and mind that bun matches sub-paths too.** Verified 2026-08-23 by removing `bundleReactDomServer` from `plugins:` and rebuilding: `require("react-dom/server")` appears in `lib/client.js` and `renderToString` drops from 4 occurrences (the inlined implementation) to 1 (the call site alone). Put the plugin back and only the two platform modules are required. The one trap in this file that held exactly as written. Listing `react-dom` also externalizes `react-dom/server` — which is **not** in the platform table, so materialization throws `missed the module table`. A plugin that resolves it to an absolute path sidesteps specifier matching. (bun defaults to `--packages bundle`, so unlike tsdown there's no need for a reverse `noExternal`.)
- **The `browser` resolution condition must be explicit — and today it changes nothing, which is not a reason to drop it.** Measured 2026-08-23: removing `conditions: ["browser"]` and rebuilding produces a **byte-identical** `lib/client.js` (same md5, 295365 bytes, no `require("stream"/"url"/"util")`). The reason is the sibling fix above — `bundleReactDomServer` resolves straight to `server.browser.js` by absolute path, so the one dependency this condition was written for never consults exports conditions at all. It stays as a guard for the next dependency that ships a `browser` export: without it that one silently gets the Node build. `react-dom`'s `exports["./server"]` only points at `server.browser.js` under that condition; otherwise you get the Node build and drag `require("stream"/"url"/"util")` into a browser bundle.
- **`define` away `import.meta.url`.** `@esm.sh/tsx`'s entry reads it. We always pass the wasm path explicitly, so a constant is enough. Measured 2026-08-23 by removing the `define` block and rebuilding, and the consequences are worse than "CJS has no `import.meta`" suggests: the bundle goes **295365 → 616551 bytes**, bun resolves the specifier to **`file:///private/tmp/recover/node…` — the build machine's absolute path, baked into a file shipped to other machines** — and it drags in `require("react/jsx-dev-runtime")`, which is not in the platform table and therefore dies at materialization. The `import.meta` count stays 0 either way, so grepping for it is not how you check this.

**The upstream compiler no longer needs patching around** — `partial-react@0.0.6`
(2026-08-22, from macaron-genui-demo#1718) dropped the `import.meta.resolve` and `typeof Bun` its
`compiler.ts` used to carry. Three things were **deleted** together on release day: the build plugin
that swapped in a shim, `src/client/runtime/compiler-shim.ts` itself, and `scripts/typecheck.mjs`,
whose only job was filtering upstream's two type errors — `typecheck` is now plain `tsc --noEmit`.
None of the three exists any more; they are named here so the next reader recognises them in an
old diff.

Verified rather than assumed: `bun run check` green with no `[upstream, ignored]` line, bare
`tsc` exits 0, `import.meta` / `Bun.` / `import.meta.resolve` all read **0** in `lib/client.js`,
and all three cards in `test/cards` compile and paint in a real browser — that last one being what
the shim existed to protect. `lib/client.js` also lost 70KB, the shim's duplicate compiler.

### 2.7 Two traps in the type system

- `SlotMap` is stitched together from each package's `declare module`, and **the merge only happens for packages some file actually imports**. Measured 2026-08-23 by asking the type system directly: drop `import type {} from "@deepseek-ai/dsh-client-ui-layout/client"` (line 8 of `src/client/index.ts`) and `"conversation" extends keyof SlotMap` becomes **false** — the keys simply vanish. Note what does *not* happen: `tsc` stays green, because our own code never indexes `SlotMap` by those names. So the failure is silent until someone writes a slot registration that needs one. The entry used to claim TS2344 here; removing the *package* raises TS2307 (that same import names it), and removing only the import raises nothing at all. **A type-level trap has to be probed at the type level** — `tsc` passing says nothing about a merge that did not occur.
- `allowImportingTsExtensions` must be on, because the source imports across files with `.ts` / `.tsx` suffixes.
- **`ctx.slots` is not on cordis's `Context` at all.** No package's `declare module` puts it there — checked every `.d.ts` in the tree — while the service is plainly present at runtime and `sidebar-files` / `documentpreview` call `ctx.slots.register(...)` from their own JS. So `scoped.slots` is a type gap rather than a missing service, and it is narrowed to the service's own `SlotCore` (which keeps `register`'s generics checking the seat name and the composed props) plus a one-line structural type for `inject`, which lives on the wrapper rather than on `SlotCore`. Same precedent as §4's `as unknown as`: this dodges a client-side type hole, not the runtime inject check. `sidebarRight` / `sidebarRightTabs` **are** merged — `sidebar-right` declares both.

## 3. The ui4a contract

Inherited from `../ui4a-playground/src/fs/contract.ts`; **the only difference is that the files are real** (not a browser VFS):

```
<workspace>/.dsh/ui4a/
├── canvases/<id>.ui4a.tsx   # → a canvas view, one mini app
└── canvases/<id>/*.tsx      # → that mini app's sub-tree
```

**Sub-pages are inlined before compiling, because `blob:` cannot host a relative import.**
`src/prompt.ts` tells the model to keep a canvas's components in `<id>/` and import them with
relative paths, and the model does — `.dsh/ui4a/canvases/tarot.ui4a.tsx` ships a 26KB
`tarot/deck.ts`. That card was blank: a card is imported as a blob URL, and the browser rejects
`./tarot/deck` with *"Invalid relative url or base scheme isn't hierarchical"* before any import
map is consulted. Measured, so `setImportMap` is not the fix: **an import map keyed on the
relative specifier fails identically**, because resolution against the importer's URL happens
first. What works is rewriting the specifier to the child's own blob URL — an absolute URL has
no base to resolve against — and nesting works for the same reason. `canvas/subpages.ts` does
that, `serveCanvas`'s `child` branch reads the file through `canvasChildPath`, and the route
returns the resolved filename in `x-ui4a-filename` because **a specifier carries no extension
and the compiler picks its syntax from one** — passing `./tarot/deck` to it makes a `.ts` file
fail to parse.

**`.dsh/` is the harness's own project convention, not ours** — `dsh-skill-filesystem` reads
`join(projectRoot, ".dsh/skills")` and labels that source `project-dsh`. Sitting beside it
keeps a plain `ls` of the user's repo clean and puts these files where anyone would look for
something dsh wrote. `ui4a` goes *beneath* it because that names the format: this is a dsh
plugin writing ui4a files, not a ui4a project with a dsh corner.

`src/contract.ts` is the single place the contract is parsed. **Anything that needs to decide "is this a canvas file" must call it** — no ad-hoc regexes elsewhere.

The model writes these files with dsh's own `str_replace_editor` / `write` — **we define no new tools**. Diagnostics (telling the model it wrote something broken) would go through a `tools/post-execute` waterfall interceptor; it's purely additive and out of scope for v1.

## 3.5 How the inline fence works

Same protocol as the playground: **four backticks + `ui4a/tsx`**, module `export default`s a props-less component. Four isn't fussiness — generated TSX routinely contains triple-backtick strings, which would close a triple-backtick fence early.

Two separate concerns:

- **Teaching the model** splits in two, along the line of "what you pay for every turn."
  - `src/prompt.ts` is injected **permanently** via `ctx.systemPrompt.section()`: triggers, fence syntax, canvas paths, palette, and card guardrails. Keep its library claims consistent with the topic references: Headless UI `TabGroup` supports arrow-key navigation, while `Disclosure` has no controlled `open`/`onChange` API.
  - `skill/SKILL.md` is loaded **on demand** via `ctx.skills.register()`: it keeps the shared decision rules and routes the model to topic-specific files in `skill/references/`. The registration supplies the installed skill directory as `resourceBase`, so the model resolves those relative paths from the package rather than the workspace. `dsh-base`'s bundle ships the skill tooling by default (the installed package is `@deepseek-ai/dsh-skill`; this used to cite a `dsh-tool-skill` that does not exist under that name), so a runtime-registered skill lands in the model's `<available_skills>` catalog. The body is fetched when it calls the `skill` tool; referenced files are read only for the task at hand. Keep the full guidance in those files and include `skill/` in the published package.
  - Note the catalog carries **only `name` and `description`** (neither `whenToUse` nor the body). The description is therefore the sole routing signal — write triggers into it, not a summary of the contents.
  - Register it as `modelInvocable: true, userInvocable: false`: this is a spec written for the model, and exposing it as a user `/` command would just dump a long guide at the user.
  - Under the PTC profile every tool is called from inside `run_code`, so don't write a concrete call form like `` call `skill({name})` `` into the prompt (the model tries it directly once, gets `unknown tool`, then recovers). Just say "load the X skill first."
- **Rendering** is `src/client/runtime/inline-fence.ts` claiming code blocks in the DOM. dsh has **no** extension point that dispatches on markdown language (`CodeBlock`'s `lang` is a hint; unknown languages degrade to plain), so this is the only way. The handle is the hardcoded `md-code-block` class on the `CodeBlock` wrapper, plus the info string typed out character by character in the banner.

Details you have to get right:

- **Match on content, not on the info string.** The host's markdown parser truncates at the first non-identifier character, so the `ui4a/tsx` the model correctly wrote arrives in the DOM as `ui4a`; worse, the info string doesn't appear at all until the fence closes, so matching on it means never claiming anything until the stream ends. `matchSegment` therefore prefix-matches the rendered text against segments from the snapshot — code comes from the conversation snapshot, position comes from the DOM.
- **Unwrap a ui4a fence that Markdown rendered inside a wider fence.** The model sometimes writes a six-backtick wrapper around the real four-backtick block. `parseUi4aSegments` can still recover the inner segment, but CommonMark keeps the shorter closer inside the outer code block, so the DOM text starts with a literal ````ui4a/tsx` instead of the segment's first import. If `codeOf` does not normalize that wrapper, the segment is never claimed and every later card whose opening is its prefix can render the abandoned first card until the texts diverge. Only unwrap when the rendered block itself starts with a ui4a opener; generated TSX may legitimately mention the protocol later in its source.
- **Release the claim when the block gets reused for something else.** React reuses `.md-code-block` nodes by position, so one re-render can drop unrelated content into the node we hid. At that point `rendered` is no longer a prefix of `claim.code` — without releasing, a stale card stays on screen with the real code block `display: none`'d behind it, and nothing short of a refresh recovers. The test is the prefix relation, not merely "no segment found" (history scrolling out of the load window also finds nothing, and there the card must stay).
- **Hide the original block, don't remove it.** That node belongs to the host's React tree, and detaching a node React still holds gets you `NotFoundError` on the next commit.
- **Hide it when the card paints, not when the claim is made.** Compiling is not the same as having something to look at: mid-stream the default export usually exists while the body is still an empty shell, so hiding at claim time leaves a blank gap that fills in with a pop — with the source sitting right there the whole time. The signal is non-empty text or an `svg` in the mount node (icons and charts carry no text); a wrapper div with layout classes is not. Checked at most once per frame and torn down the moment it fires, because a streaming card mutates thousands of times and `textContent` walks the whole subtree. A card that never paints therefore keeps showing its source, which is the right fallback rather than a bug.
- **…but only once the card has had a moment to paint without it.** The source preview is a shiki-highlighted `CodeBlock` with `lang="tsx"`, and shiki tokenizes synchronously inside React's render. Measured 2026-10-14 in a real `dsh web`, switching back to a session holding two settled 7–8KB recharts cards: one **310ms** long task, all of it `findNextMatchSync`, landing right after the claim — while the same cards paint **20–25ms** after mount on a warm renderer. The preview meant to cover the wait was the wait, and it also held up the second card's claim behind it. So the preview is rendered only if the card has not painted `PREVIEW_DELAY_MS` after the claim: a warm card never shows its source at all, and a cold one (first wasm init plus a first esm.sh fetch, ~2.6s) still gets it. The host's block is then hidden by whichever of the two takes its place — the preview, or the card — never at claim time, so the delay costs no blank gap of its own.
- **Coalesce the MutationObserver into one frame.** A streaming reply fires dozens of mutations per second, and one sweep per mutation is the textbook way to burn the main thread.
- **A card is also stale when its session changed, not only when its text did.** React reuses a `.md-code-block` across a session switch, so both "nothing to do" checks in `sweep` must include the owning session — otherwise an unchanged card keeps the capability shims of the conversation it was claimed under and acts on a session the reader has left.

## 3.6 How the canvas tab works

**A canvas is a file kind in the host's right Sidebar, not a column we draw.** `dsh-client-ui-sidebar-right`
is a docking surface with a tab-type registry: multi-tab, split panes, float/dock, undo, and tab
state that survives a session switch. The product's own `sidebar-files` / `browser` / `terminal` /
`documentpreview` packages are nothing but registered tab types, and the registry's own doc says
*"a tab type may ship from outside this repository"* — `priority: 'extension'` is defined as *"a type
from outside the product"*, the band that outranks every viewer the product ships. That is us.

What that buys, all of it for free and none of it reimplemented: multiple canvases open at once
(`multiple: true`), floating and docking, split panes, undo of a layout change, tabs that survive
switching sessions, and a way back after closing one (the workspace file tree). Before 2026-10 this
was a hand-rolled `position: fixed` column with its own header, tab strip, close button, width drag
and a launcher listing every canvas id — ~1,273 lines of chrome for what the host already draws.

**Registration is two stages, and the second is keyed by the definition's `id`, not its `kind`.**
`sidebarRightTabs.register(definition)` declares what the type *is* (which addresses it recognises,
how it ranks, what the chip says). The body goes in the `sidebar.right.pane.tab` seat under the same
`id`. Writing the `kind` there instead is a silent failure — registered, and never receives a tab.
Both live in `ctx.slots.inject(name, () => …)` / `ctx.effect`, because those seats are declared at
runtime and registering early throws `slot "..." is not declared`.

We claim canvases by **address**, not by asking: `patterns: ["*.ui4a.tsx"]`. A pattern without `:`
matches the URI *path* at any depth, so this picks up
`dsh-resource://file/session/<id>/.dsh/ui4a/canvases/todo.ui4a.tsx` and leaves plain `*.tsx` alone.
`documentpreview`'s catch-all is `dsh-resource://file/**` at `priority: 'fallback'`; we are
`extension`, so we take those files off it — which is the point, since a canvas opened as a text
preview is a source listing where a running app should be.

**Two types, because a guide capsule opens its contributor BY KIND.** A type is either a resource
type (`patterns` — it recognizes addresses) or a page type (no `patterns` — opened by kind at
`sidebar://<kind>`), and the guide page's capsules always do the latter. So the capsule cannot
point at the file type: its address would never match `*.ui4a.tsx`, and `openResource` on an
address no type claims is a wiring mistake that throws. The browser is therefore a second, page
type (`ui4a-canvases`) whose body lists the workspace's canvases and opens one through the same
`openResource` the transcript uses. Two types need two `id`s — the seat is dispatched with the
definition's `id`, and sharing one would hand each body the other's tabs. The copy on the capsule
is localized (`locales.ts`): the guide draws no copy of its own, and a hardcoded language drops a
foreign word into a localized column.

**Every way into the canvas is already routed by the host.** `dsh-client-ui-chat` sends transcript
file links to `ctx.sidebarRight.openResource(url)`; the file tree opens rows the same way; the 产物
chips go through it too. We only supply the *viewer*. The one thing still ours is **auto-open when
the model writes one** — `collect.ts` finds the write in the transcript and calls
`openResource(fileAddressFor(sessionId, cwd, path))` itself. `openResource` is idempotent per
address (two opens of the same address are the same tab), so re-sweeping the transcript does not
stack tabs.

**Classify by argument shape, not by tool name.** `collect.ts` asks "does this call carry a canvas path" and "does it bring a whole file (`CONTENT_KEYS`), a patch (`PATCH_KEYS`), or neither." Enumerating tool names means the canvas silently dies the day the host renames one or adds another file tool. The easiest of the three to miss is the last: **reading a canvas must not open it** — `read` used to mark it dirty and conjure a panel for a canvas this session never wrote, so asking "what's in this file" popped the sidebar open by itself.

**The data source is tool calls, not a new session event.** The model writes `ui4a/canvases/<id>.ui4a.tsx` with the host's own `write`, and the client reads `root.call.argsRaw` off the snapshot's `tool-call` nodes. No `SessionEventMap` extension, no touching the persistence contract, zero involvement from the Node half.

**But the canvas gets no streaming under the web profile's default PTC mode** (measured 2026-08-20 with a probe inside `calls()`, 5000+ samples): under PTC every tool is called from `run_code`, and the host only exposes `write` as a subCall once `run_code` has **finished**, so the very first `write` frame we see is already `settled: true` with all 14388 characters. The outer `run_code`'s own `argsRaw` is just 165 characters (the calling code, not the file body). The tab therefore opens whole the moment the write lands — 490 samples on a real machine, **0** state changes. **Not re-verified 2026-08-23**, and worth saying why: the claim is about a code path that only exists inside a live PTC session, so it needs a canvas being written while something samples the store. `test/collect.test.ts` covers both branches of the logic (a settled write is not streaming, an unsettled one is), which is a different claim — that the *unsettled* branch is unreachable under PTC cannot be shown from a transcript after the fact. **Corrected an hour later:** the sessions do survive — 183 under `$DSH_HOME/sessions/`, the canvas-splitting run among them, because only the *working directory* is a `mktemp` and the session directory merely encodes its name. The real obstacle is more final: **`settled` is never persisted.** `collect.ts` derives it from a live snapshot's shape (`argsRaw` inline means running, wrapped in `call` means settled), so the 73 frames carrying a canvas path in that session contain no such field. This needs a probe in a live session, not an archive. The `streaming: !call.settled` code is itself correct and would work off-PTC where `write` is a top-level call; the default path just never reaches it. Inline is unaffected (see §3.5).

`edit`-class tools are the exception: their arguments are a patch, not the full text. Those calls only mark the canvas stale (with an incrementing version as the cache key), and the truth is read back from the file through the Node half's `/dsh-generative-ui/canvas` route. The file is the one source that stays correct under every way of changing it, including edits made outside the agent.

**The address is the only thing a body gets, and it is enough — but the cwd is not on it.**
`tab.contentId` is a `dsh-resource://file/session/<sessionId>/<path>` URI;
`parseFileAddress` (from `@deepseek-ai/dsh-util-workspace-path`) splits it into
`{scope, sessionId, path}`, and `owningCanvasIdOf(path)` takes the canvas id. The read route
validates `cwd` against every session's `header.cwd` (§4 — it is a whole-disk oracle otherwise), and
the address does not carry one, so the body resolves **the session named in the address**. Not the
current one: several sessions share a workspace, and resolving from "wherever the reader is" runs the
read under a stranger's allowlist. That is the same bug class §3.65 hit on `$dsh/fs`, where read-only
mode did not deny until the id was threaded through.

Five traps:

- **A `tool-call` node's data is `{root: {...}}`**, not the assistant's `blocks`.
- **Tool arguments carry absolute paths**, so contract matching looks for `ui4a/canvases/` as a path suffix and must not anchor at the start.
- **Decode the address before matching the contract.** `sessionFileAddress` percent-encodes every
  segment, so `背单词.ui4a.tsx` travels as `%E8%83%8C%E5%8D%95%E8%AF%8D.ui4a.tsx`. Running
  `canvasIdOf` on the raw URI returns **that encoded string**, which is all ASCII, passes
  `isCanvasId`, and names a file that does not exist — the chip shows mojibake and every read 404s,
  while the canvas is still "claimed". `parseFileAddress` decodes; the rule is *always through it,
  never on the URI*. This is §4.5's "Chinese canvas ids were silently rejected" one level up: the
  id rules were widened and the address layer mangles them instead. Found by a test, not in use.
- **Re-registering an unchanged namespace must keep its blob URL.** The document import map
  is installed once and names those blobs for the tab's life, so revoking one leaves every
  esm.sh package resolving `react` to a dead URL. ESM fails that by killing the whole module
  graph: a blank card, nothing in the console, and smoke green throughout. It cost a bisect
  to find, because the symptom is identical to "the model wrote something broken". The guard
  is an identity check in `registerModules` — only a genuine hot-swap invalidates.
- **`SlotMap` only knows `sidebar.right.pane.tab` if something imports the package that declares it.**
  The `declare module` lives in `dsh-client-ui-sidebar-right`, so a type-only
  `import type { … } from "@deepseek-ai/dsh-client-ui-sidebar-right/client"` is what merges the key
  in (it also carries every type we need: `SidebarRightTabDefinition`, `SidebarRightTabInfo`,
  `ISidebarRight`, `SidebarRightTabParamsMap`). Drop that import and the key vanishes from the map —
  and `tsc` stays green, because nothing indexes `SlotMap` by name until a registration does. Probe
  the type level at the type level: assert `"sidebar.right.pane.tab" extends keyof SlotMap`, and
  watch it flip when the import goes.

**A canvas is inset; an inline card is not.** The card is told to fill whatever holds it, so the two
surfaces have to differ in the *holder*, never in every generated component: inline sits in the
transcript and must share the prose's left edge (a margin there reads as an indent the surrounding
text does not have), while a canvas lives in a panel with its own chrome and its title otherwise
sits on the frame. `CanvasBody` therefore pads at **24px** — the host's own number, taken from the
Sidebar's guide tab body (`sidebar.right.tab.guide`, `padding: 0 24px`, the same seat family as
this one) rather than invented. The grid row is the old panel's `.dgu-body > * { min-height: 100% }`
without a stylesheet — one row at least as tall as the box and free to grow, so `height: 100%` still
has something to resolve against and `box-sizing: border-box` keeps that 100% inside the padding.

## 3.65 `$dsh/*`: what generated code can call back into

The playground gives generated code capability modules under `$ui4a/`. Here the prefix
is **`$dsh/`**: what these expose is the harness — its conversation, its model, its
filesystem — and none of it belongs to the ui4a rendering contract that the fence language
and the canvas paths define. Host-backed calls require dsh; `$dsh/state` is local-only. `contract.ts`
owns the prefix; nothing else should spell it out.

| Module | Here | Why |
| --- | --- | --- |
| `$dsh/chat` | **implemented** | `ctx.conversation.send(text)` is a public client service |
| `$dsh/fs` | **implemented** | Forwards to the host's `ctx.fs` carrying the session's `ctx.sandboxPolicy`. `readdir` gives `{name, type, size}` (the host had all three; we used to forward only the name, so a card could not draw a tree without probing) and `readBytes` exists because `readFile` UTF-8-decodes — a `.mid` or a wav read as text is silently corrupt |
| `$dsh/state` | **implemented** | `usePersistedState` stores private UI state in `localStorage`; it needs no host filesystem or session service |
| `$dsh/ai` | **implemented** | not through a client gateway — there is none — but through a route on our Node half onto `ctx.llm.stream()`, using `agentDefaultModel.currentSelection()`, so the card never sees a key |
| `$dsh/exec` | **implemented**, ours | not in the playground's set under that name — its `bash` lives inside `$ui4a/fs`. Split out here because running a command is not reading a file, and because the two carry different risks. `ctx.shell` takes the same `sandboxPolicy` `$dsh/fs` resolves, so it opens no door the model's own bash tool has not |
| `$dsh/web` | **implemented** | `search` forwards to the host's web provider; it does not expose the host's page-fetch capability |

The mechanism, ported from `ui4a-playground/src/runtime/bindings.ts`: the real implementation
is ordinary TypeScript in our bundle, registered under `$dsh/internal`, and each
`$dsh/<group>` is a few-line blob shim that imports it and re-exports that group's members.
The indirection exists because **a blob URL cannot carry a query string** — anything the
module needs to know about its caller has to be compiled into the body. Shims are cached per
owning session, and surfaces (including compiled sub-pages) use that session's import map.
The shared host resolves the named session's current workspace and policy on every call; it
must never fall back to the selected session when the owner disappears. React remains shared.

What a shim carries is an **opaque handle**, not a session id, and `$dsh/internal` is a private
blob that no import map names — so a card that reads its own shim learns its own handle and
nothing else, and `bindOwner` refuses any handle this module did not mint. Both halves matter:
the handle stops caller-controlled session selection, and keeping the module out of the map stops
it being invited into generated code at all.

**`conversation` is scope-addressed, and the scope is a fresh context.** Reading it off the
plugin's own context rejects with `requires a session scope — address one via
ctx.sessions.scope(id).conversation`. But `scope(id)` returns a context the *host* minted,
carrying its own inject set — so reading `conversation` off it throws the §4 access-time
error instead, and our outer declaration does not help. It takes both: resolve the scope,
then `inject(["conversation"], …)` on that context. Resolve per call, not once — the reader
switches sessions under us.

`conversation` also goes in a nested `ctx.inject`, not the static array — every static name is a
hard dependency (§4), and a profile without it would lose the whole plugin rather than one
capability.

**`$dsh/fs` inherits the session's access mode rather than defining its own.** Every call goes
through `ctx.fs` with the policy from `ctx.sandboxPolicy.resolve({ session })`, so a card may
do exactly what the composer says the session may do — under `Read Only` the write is refused
by the same fence that refuses the model's, with the same `FS_SANDBOX_DENIED`. Inventing a
narrower boundary here (I first proposed hard-coding `ui4a/`) would have meant a second policy
to keep in sync with the one the user can actually see and change.

Two things that boundary does *not* do, and should not be mistaken for holes: `workspace-write`
permits the platform temp area as well as the workspace (the same `writableRoots` set Seatbelt
grants, so bash and fs cannot drift), and the session must be addressed **by id** — several
sessions share one workspace, so resolving it from `cwd` silently runs the write under a
stranger's access mode. That was a real bug: read-only mode did not deny until the id was
threaded through.

Measured end to end (2026-08-21): asked for "a canvas that browses the .md files here, viewing
and editing them", the model imported all three of `readFile`/`writeFile`/`readdir`, wrapped
every call in try/catch, and surfaced a failed save as `保存失败: …` rather than silently. It
also wrote a `normalizeEntry` that accepts strings, `{path}`, `{file_path}`, `{fullPath}` and
`{name}` — a sign it could not tell from the prompt what `readdir` returns, which is worth
tightening if the shape ever matters.

**`send` is visible.** The playground's `sendMessage(content, visible = false)` can post a
turn the user never sees; `ctx.conversation.send` always writes their message into the
transcript. So a card's click has to read as something the user would have said — `我选 红`,
not a JSON payload.

## 3.7 Colors: name the tokens, in the spelling the model will write

Generated UI doesn't know the host is dark by default and will paint white cards onto a dark app.
The fix isn't runtime CSS rewriting — it's **naming the host's semantic tokens in the prompt** and
stating flatly that literal colours are never allowed. Measured on the inline-`style` era of that
rule: 106 token uses across the generated code, zero literal hex.

Since the UnoCSS switch the tokens are named as **classes** (`bg-layer`, `text-muted`,
`border-line`, `bg-accent`) mapped in `uno-config.ts` onto the same twelve `--dsw-alias-*`
variables. Two consequences worth keeping: a card can still reach any variable through an
arbitrary value (`bg-[var(--dsw-alias-bg-base)]`), and **`brand-primary` deliberately has no short
name** — it is a foreground colour that 50 of 378 corpus cards used as a fill, and leaving it out
of the map makes the commonest colour defect unspellable rather than merely discouraged. The two
screens that used to read `background:` out of a style object are blind to class syntax and were
replaced (`HARDCODED-COLOUR-CLASS`, `BRAND-PRIMARY-FILL-CLASS`); a probe confirmed the old pair
fired on neither `bg-[#fff]` nor a fixed-palette ramp.

**A colour name that collides with a Wind4 utility wins, silently.** The map used to call the
page ground `base`, so `text-base` — Wind4's *body font size*, and the commonest way a card writes
body text — resolved to `color: var(--dsw-alias-bg-base)`, which is `#ffffff` in light. Measured
live on a wave-2 card: `<h2 className="text-base font-semibold">` computed `color #ffffff`,
`font-size 24px`, `opacity 1`, sitting on a white card. The title was present, laid out, and
invisible; the shot showed an empty top row and **no probe could see it** — it does not overflow,
it is not crushed, the text is in the DOM. 18 corpus cards wrote `text-base`. Renamed to `page`
(8839ffb) with a test that every `text-<size>` still generates `font-size`. Any colour name added
later has to clear the same bar.

**In light theme the three background tokens are all pure white.** Measured on the real harness
at 440, computed values:

    light   base #ffffff   layer #ffffff   layer-2 #ffffff
    dark    base #151517   layer #232324   layer-2 #2c2c2e

So a card that separates a nested panel from its parent with a background token has *no*
separation in light and looks right in dark — the host's light theme separates with borders and
its dark theme with fills. Three of the five judges found this independently on wave 2 and read it
as a card defect ("`bg-layer-2` melts into the card"); it is not, and the model cannot know it.
Anything nested needs `border border-line` to read as nested. `bg-layer-2` stays correct for a
HOLE (an input, a well) because the border there carries the shape anyway — which is also why the
"an input is a hole in a surface" rule has been landing: the border was doing the work all along.

Data visualization is the stated exception — chart series need their own hues to be distinguishable — and **a thing's own identity is the same case**, which the wording did not originally cover. Measured 2026-08-23 on the three cards in `test/cards`: 12-22 token uses each, and the 24 literal hexes are all `TILE_COLORS` in 2048 (the game's own palette) and the black and white of piano keys. `metro` has zero. So the rule holds where it should: chrome takes tokens, the subject keeps its colours.

## 3.68 What `$dsh/*` does and does not defend against

Generated code runs **in the host's realm**, with the same reach to `globalThis`, the built-in
prototypes and the DOM as the plugin's own client half. That makes a boundary drawn *inside* this
realm a fight against an unbounded list: the shim body is built with `Array.prototype.join`,
`JSON.stringify`, `String.prototype.replace`, and any intrinsic used after a card runs can be
turned on us.

The design therefore keeps the capability **out of every string**, and keeps the minting
intrinsics **out of the realm's hands**:

- A shim's capability is **its own `import.meta.url`**, read in the shim itself. Nothing is
  compiled into the body, so intercepting the text of one reveals nothing.
- `URL.createObjectURL` and `Blob` are captured at first module load (with the entropy holder),
  so the URL only becomes visible where we decide — not to a wrapper a card installed earlier.
- **No realm-controlled call touches the capability surface or the shim source.** The shims are
  enumerated and assembled with the captured `Object.entries`/`keys`/`values` and index loops and
  `+`; a swapped-in `Object.keys` would otherwise be handed `bind()`'s unowned surface, and a
  swapped-in `join`/`map` is code injection into another surface's module.
- The holder is **fail-closed across an upgrade**: a build whose holder predates the minting
  intrinsics refuses to mint rather than recapturing them mid-page. The capture point *is* the
  property; it can only happen before generated code runs.
- `$dsh/internal` is a private blob no import map names; the bridge it reads is sealed under an
  unpredictable key.

Routes enforce the other half: `session` and `cwd` have to name the same session, so one request
cannot read or run in a workspace under another session's access mode.

What is still not defended: generated code and the plugin share a realm, so anything the plugin
does that is observable *after* a card has run is fair game. There is no secret a same-origin
page can hold and its own scripts cannot read, which is why the remaining answer is architectural
— give generated code its own realm, or move the capability check into the route layer behind a
token minted outside this realm. #82 carries that.

## 4. Known traps

- **An import retry owns one source revision and renderer lifetime.** A delayed retry must not replace a newer frame or touch a detached renderer. Only a frame that actually landed supersedes a scheduled retry — a settled update differing only in trailing whitespace delivers nothing and must leave it alone — and a paint invalidates a retry whose probe is already in flight. A probe that fails inside a retry takes the same `errorAction` as a renderer failure, so the retry budget covers CDN blips instead of reporting the first one. `GenUIRenderer.create` is terminal: report it as itself rather than parking it as a stranded streaming failure, which is flushed from an effect that never runs without a renderer.
- **Sub-page resolution belongs to a workspace and exact source revision, not its length.** Equal-length edits must not reuse old rewritten code. A rewrite's blob URLs are owned by the resolve pass that minted them and die with its effect cleanup — including when its state update is discarded (unmount before commit, or a later pass winning the same batch). The pass drops its rewrite as it dies too, so a source that edits away and back cannot answer with blobs the intervening pass already revoked.
- **AI and search cancellation follows the response, just like exec.** Consuming a POST body does not mean the reader left. Check `res.destroyed` before starting provider work, and abort only when the response closes before `writableEnded`.
- **A superseded card cannot cancel a pending report either.** Check the newest-card predicate before touching the shared pending timer, not only before retracting an already-sent failure. Otherwise an old card painting during the settle window silently suppresses the current card's error.
- **An empty canvas listing is a result, not a fallback for failed reads.** Missing files may return 404 while a write lands, and a missing canvas directory is an empty listing. Network, permission and server failures remain errors: the browser and canvas body show localized feedback with a retry action. A retry drops the retained body before refetching — `body` can still hold the source of a revision whose read failed, and rendering that while the retry is pending executes code the file no longer has. The auto-open listing's progress marker likewise advances only on a listing that landed, or a rejection consumes the next successful listing as the baseline and the canvas it found is never opened.

- **Intermediate streaming frames are supposed to fail compilation**, `No default export found` most often — partial-react explicitly treats these as transient and keeps the last good frame. That semantics must not leak to callers; `GenUISurface` filters them out while streaming, or the UI flashes red on every character the model types.
- **`GenUIRenderer.create` is async**, so the renderer must live in state, not a ref: in a ref, the first render's effect sees `null` and bails, and since `code` no longer changes it never re-runs — a surface that mounted and stays blank forever.
- **`preserveStateOnUpdate` only suits streaming growth — but a canvas does not need it off.** It decides reuse by hook signature, so the worry was that a whole-file replacement whose hooks happen to match would silently keep the old render. **Measured: it cannot.** Both of partial-react's reuse branches (`runtime.ts:317` and `:404`) require `updateMode === "push"`, and a canvas arrives whole, so it always runs in `"render"` and the edit lands either way. So the canvas keeps the default (`preserveState` on) — which is what lets `:426`'s stable slot wrapper hold the generated component's hooks on one fiber across a recompile and `:424` key the error boundary off the hook signature instead of the render round. This entry used to say the opposite and told the next reader to turn preserving off; the code carries the measurement in a comment beside the call.
- **Pick a signal that actually renders.** Verifying file readback, I wrote the marker into a TSX comment — comments never reach the UI, so the "it's broken" conclusion was entirely fake and cost a lot of time. Writing the marker into JSX text found the truth.
- **Preflight swaps the global `console.error` — and on 0.0.6 that is safe.** `partial-react/src/runtime.ts:211-224` replaces it with a collector and restores in `finally`. This was recorded here as a concurrency bug needing refcounting: with two cards, the inner `finally` would restore the *outer* collector and the host's console.error would be lost for good. **Measured on 2026-08-23: it cannot happen.** Each frame captures its own `previousConsoleError`, so nesting unwinds correctly, and interleaving would need a yield point between the swap and the `finally` — `canRenderComponent` has none (`renderToString` is synchronous, no `await` anywhere in 209-229, one call site at :404 inside a synchronous `renderComponent`). Driving two cards concurrently leaves `console.error === the real one`. Left as a note rather than deleted because it is exactly the shape that *would* break if upstream ever awaits inside that block — and because the entry as written would send the next reader to build refcounting nothing needs.
- **An `edit` to a canvas used to reset every `useState` in it, and no longer does.** `canvas/index.ts` re-reads the body off disk when a patch marks it stale, `code` changes, `GenUISurface` delivers it, `renderComponent` runs and increments `renderRound` — and with `preserveState={false}` the boundary key was `boundary:${renderRound}`, so the whole tree unmounted and a running timer went back to zero. **That was the bug `preserveState={false}` bought**, and the flag is gone (see the entry above). `localStorage` is still the right home for anything a *reload* must survive, which is a different failure than an edit.
- **HMR has no react-refresh**: React state inside the plugin is lost on every reload, and adding or removing a plugin requires restarting dsh.
- **wasm instances leak, and upstream offers no release.** `@esm.sh/tsx` exports only `transform`/`init`/`initSync` — no dispose, no free — so "release explicitly" is not an option; dropping the `initPromise` reference and waiting for GC is. **Each HMR round leaves another ~16MB instance behind**, dev-only — measured 2026-08-23 by compiling and instantiating the module four times in a fresh process: 15.9 → 48.5 → 64.6 → 80.1 → 88.5 MB rss, against a control that merely copies the same bytes four times and grows 11MB total. The figure here used to read ~2.5MB, which is the size of `tsx_bg.wasm` on disk (2610857 bytes) rather than the cost of an instance of it — **a file size standing in for a memory measurement, off by six times.** Both halves are wired now. The blob-URL half always was (`disposeRegistry` off a `ctx.effect` disposer); the wasm half **never had been** — `initPromise` was cleared only on failure, and `sharedCompiler` never at all, so every reload built a fresh instance while the previous stayed reachable through a module-level promise. `disposeCompiler` + `dropSharedCompiler` now hang off their own disposer. Found by auditing the trap that recorded it as an option and never took it.
- **One failed `import()` is a cold start, not a rule.** I once saw recharts fail to import inside the verification browser, recorded it here as "that browser cannot reach esm.sh", and nearly used the resulting blank card as evidence that streaming charts were broken. Re-measured later: three consecutive imports of the same URL all succeeded, ~270ms each, 101 exports. The first failure was the cold start §4's retry logic exists for. **Repeat a network measurement before writing it down** — and when a probe shows an empty card, `import()` the package by hand a few times before concluding anything about the code.
- **A dependency that fails to fetch looks exactly like broken code.** esm.sh cold-starts, and the symptom either way is a blank surface with nothing in the console. `GenUISurface` retries three times on backoff before letting the error through. `clear({ preserveVisualState: true })` is what makes it a real retry — the renderer skips an unchanged compile result, so re-delivering the same code without clearing is a no-op and the failed import is never re-attempted. Only retry a settled surface: while streaming, the next frame re-delivers anyway, and retrying there would replace the growing buffer with a stale prefix.
- **Bare specifiers need a fallback import map.** `registryImports()` only has the five React entries, so the moment the model writes `import { BarChart } from "recharts"` resolution fails — and ESM fails by killing the whole module import, so the surface goes **completely blank with no error at all** (onError doesn't fire either). `GenUISurface` calls `mergeFallbackImports` (`partial-react/import-map`) with the code's import set to probe esm.sh and fill the gaps. It costs ~36ms per run, so dedupe by specifier signature rather than recomputing per frame.
- **Every entry in `inject` is a hard dependency.** cordis's `Inject` type has no required/optional distinction (`registry.d.ts:13`) — one missing service and the entire fiber stays inactive, with not a single line of `apply()` running. That's why `webServer` and `skills` are nested fibers via `ctx.inject([...], cb)`: `dsh --profile headless` has no `webServer`, and listing it statically would leave the plugin unable to even teach the model there — which is precisely the profile batch evals run on. Only services that make the plugin pointless when absent (`systemPrompt`) belong in the static array.
- **The types this package ships for CARDS are not the types it ships for ITSELF, and a registry viewer will say so.** `types/*.d.ts` are the `$dsh/*` facades the checker's `-i` flag points at (§4.5); they describe what generated code may import, not what a consumer of this package imports. So `lib/` carried no declarations at all and npmx flagged `✗ Types` on 0.0.1 — correctly. Every dsh plugin on npm ships them (`@deepseek-ai/dsh-base` and `dsh-client-locale` both publish `exports["."].types → lib/types/index.d.ts`), so this was our drift, not a house style. Emitting them takes a second tsconfig: the base one sets `allowImportingTsExtensions`, which REQUIRES `noEmit`, and the two are reconciled by `rewriteRelativeImportExtensions` (it rewrites `./x.ts` to `./x.js` on the way out, which is what an emitted `.d.ts` must reference) plus an explicit `rootDir`, without which tsc refuses with TS5011. `types` must also come BEFORE `default` in each `exports` entry — resolution takes the first match.
- **publint's `client.js` warning cannot be fixed.** It wants the CJS `lib/client.js` renamed to `.cjs` (because `"type": "module"` makes it parse as ESM). But the host builds that URL as a hardcoded `/plugins/<id>/client.js`, so changing the extension means the plugin never loads. **Re-checked 2026-08-23: the package this used to name (`dsh-client-modules`) is not in the dependency tree at all, and `/plugins/` appears in no `@deepseek-ai` package here** — the name has moved or was read elsewhere. The conclusion still holds on its own evidence: `bunx publint` still emits exactly this one warning, and §2.3 records the hardcoded route independently. Cite the behaviour, not a package you cannot point at. That's a requirement of the host shape, not an oversight of ours.
- **cordis enforces `inject` at access time, not declaration time.** Reading an undeclared service (`ctx.sessions`) doesn't fail at apply; it throws `cannot get property "sessions" without inject` **inside the request handler**, which `dsh-host-webserver` turns into a **400 with no body and nothing in the logs**. It looks exactly like an unregistered route and is actually a missing dependency. Bypassing the type system (`as unknown as`) to dodge a client-side type conflict does not dodge this runtime check — the service still has to be declared, just inside a `ctx.inject([...])` scope.
- **`/dsh-generative-ui/canvas` must validate `cwd`.** The route answers **any** page the user has open (a plain GET skips preflight), so without validation it is a whole-disk file-existence oracle — `?cwd=/tmp/leak-probe` was measured returning file contents. The allowlist comes from each session's `header.cwd` in `ctx.sessions.list()`; the client only ever sends the current session's cwd, so nothing legitimate is caught by it.
- **A settings panel is impossible — right conclusion, wrong reason.** Measured 2026-08-23 in a real `dsh web`: `ctx.inject(["settings"], …)` **never fires its callback**, so the client ctx carries no `settings` service at all and there is nothing to be refused by. Every claim in the old wording was wrong: `settings-not-exposed` appears nowhere in the tree (`dsh-host-apiproxy` has `settings-rejected` and `settings-conflict`), and its `settingsNs` allowlist belongs to the **model provider directory**, not to plugin settings. Built-in plugins (`dsh-client-locale`, `dsh-client-ui-conversation`) do call `settings.register`, so the service exists somewhere — just not on the context a third-party client plugin is given. Configuration goes through `cordis.patch.yml`.
- **dsh is a developer preview** (devDependencies sat at `0.1.0-rc.8` when this was written; package.json is the source of truth) and openly warns about breaking changes. On every version bump, re-verify the platform table, slot names, and event signatures — rc.7→rc.8 already changed `ChatNodeSeat`'s props (`loadImage` → `renderMessageImages`), we just didn't use them. **rc.8→0.1.2-alpha.5 (measured 2026-09-02) moved the transcript from `session.getSnapshot().chat` to `uiConversation.binding(binding).target("chat").getSnapshot()` and cost every card in a real session.** `chatNodes` reads the new service opportunistically through `ctx.get()` and otherwise falls back to the legacy snapshot; a static `uiConversation` inject would disable compatible older hosts. It resolves the Session binding first because the new `uiConversation.binding(id)` throws when `sessions.list.current` briefly names a binding that has already gone.

## 4.9 Dependencies and releasing

**`^0.0.5` lets nothing through.** semver's caret on 0.0.x matches that exact version; to accept later patches you
need `~`. `partial-react`/`partial-tsx` used to be pinned exactly, which was equivalent to `^` and only served to
make renovate open a PR per patch.

**A high peerDependencies lower bound just cuts users off.** `^0.1.0-rc.7` was measured to already cover rc.8 through
the 0.1.x release (prerelease range behavior is easy to remember backwards — one `semver.satisfies` check is faster
than guessing). Bumping to `^0.1.0-rc.8` would only exclude hosts still on rc.7 — renovate leaves peerDeps alone by
default, and it's right to.

**A bundled `@deepseek-ai` helper stays in `devDependencies`, even though the source imports it.**
`dsh-util-workspace-path` (`parseFileAddress` / `sessionFileAddress`) is inlined into `lib/client.js` —
measured: zero `require()` for it, six inlined references — so nothing that installs this package ever
resolves it. Listing it under `dependencies` claims otherwise, keeps it out of the version SET every
other `@deepseek-ai` pin lives in, and makes `bun install` warn about a duplicate. It is a build-time
input, like the compiler plugins above it.

**Renovate groups packages by config, not by closing PRs manually.** One `groupName` plus
`matchPackageNames: ["/^@deepseek-ai//"]` in `.github/renovate.json` reopens 8 dsh packages as a single PR. Validate
with `bunx -p renovate renovate-config-validator` (`bunx --bun` crashes on the re2 native module; drop `--bun` and it
runs on node).

**pkg-pr-new must not be run through bunx in CI.** Its docs explicitly forbid `npx`/`bunx`/`dlx` — install it as a
dependency and run it from the lockfile (`bun run pkg-pr-new`).

**Add npm badges only once the package is actually published.** shields' `npm/v` and `npm/l` both read the registry
and render `package not found` when it doesn't exist — two red crosses at the top of the README are worse than none.

**A thin test fake reads as a broken plugin.** smoke's `ctx.inject` used to hand its callback
the bare context rather than the proxied one, so a nested scope saw `undefined` for the very
services it had just declared — reported as "effect failed", which is indistinguishable from
a real defect until you read the fake. If smoke accuses the plugin of something the browser
does not, suspect the stand-in first.

**Widening dependencies is only safe if CI can actually verify.** smoke used to call the module factory without
running `apply()`, so it let every "plugin fails to load" class of problem through (hit once: a lint change hung the
main thread and smoke stayed green). It now runs `apply()` and asserts both the effect count and the elapsed time.
All three failure modes were verified catchable: `apply` throwing, an effect throwing, and synchronous blocking
(blocking can't be guarded with `setTimeout` — on a single thread the callback queues behind the block and never
fires — so measure elapsed time instead).

## Working on this project

The general rules. The eval- and wave-specific ones — guards, freezes, in-flight measurements, model sampling — are in [docs/measuring.md](docs/measuring.md#68-working-on-this-project), each with the measurement that earned it.

- **Commit each verified step rather than batching.** The working copy is not the durable artefact;
  a macOS TCC grant for `~/Desktop` disappeared mid-session and recovery was `git clone`.
- **Anything you have done twice while intending not to needs a mechanism.** Two red pushes became
  a pre-push check and three commits with a failing record audit became `pre-commit`; both live in
  the one `pre-commit` now, because a slow commit was chosen over a slow push. Install with
  `scripts/hooks/install.sh` — `.git/hooks` is not versioned.
- **Name and close what you start.** A `dsh web` outlived its session by a day; seven
  `surface-harness.ts` processes pushed load average to 51 and made a timing test fail on its own
  timeout. A 200 on the port you asked for is not proof your server started.
- **Evals: concurrency ≤3.** The `macaron-v1` family stalls under sustained load and the eval chain
  has no fallback, so it arrives as 900 seconds of silence.
- **A prompt is not a neutral probe.** `现在到哪一步了` calls dsh's own `get_goal`; a fixture whose
  subject is absent measures the fixture. Whatever a prompt refers to must exist in the workspace
  *before* the run.
- **Read one card by hand before believing a surprising result.** Four times in one afternoon a
  measurement said something was wrong and one `grep -A3` said otherwise — including a "regression"
  that argued for reverting a rule and existed only in the regex.

## Where the rest of the design doc went

Only rules and invariants stay here — the things you need before you touch code. Evidence, narrative and per-topic reference are in `docs/`, and they are still part of the design doc. **Section numbers are unchanged**, so a citation into `§4.5` or `§6.4` still resolves; each number now names a heading in one of these files.

| Was | Now | Read it when |
| --- | --- | --- |
| §4.5 Why the trigger belongs in the resident layer | [docs/prompt-rules.md](docs/prompt-rules.md) | changing `prompt.ts` / `skill.ts`, or asking whether a request wants a card |
| §5 Reference implementations | [docs/reference-implementations.md](docs/reference-implementations.md) | porting from `ui4a-playground` or another renderer |
| §6.1–6.90 What measuring established | [docs/measuring.md](docs/measuring.md) | writing an eval, trusting a number, or about to believe a screenshot |
| §6.9 The tools | [docs/tools.md](docs/tools.md) | picking a script; every gate and probe is listed there |
| §2.35 narrative, dsh version checks, js-yaml pin | [docs/host-notes.md](docs/host-notes.md) | a dsh upgrade lands, or a dependency audit flags something |

Raw provenance — the 8,000-line session record — is [docs/measurements-log.md](docs/measurements-log.md). Per-card examples are [docs/examples.md](docs/examples.md).

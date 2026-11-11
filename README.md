# dsh-generative-ui

[![npm](https://img.shields.io/npm/v/dsh-generative-ui)](https://www.npmjs.com/package/dsh-generative-ui)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

Generative UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the agent answers with a live React interface instead of prose. It streams — the component renders while the model is still typing it.

Two places it shows up:

- **Inline** — a fenced ```` ```ui4a/tsx ```` block renders in place, between the paragraphs of the reply. Right for a chart, a form, a set of options to click, a calculation the reader will want to change a number in.
- **Canvas** — a file at `ui4a/canvases/<id>.ui4a.tsx` opens in a panel beside the conversation and stays there across turns. Right for a tool the user will come back to.

Generated code imports anything on npm (resolved from esm.sh at render time), shares the host's single React instance, and takes its colours from the app's own design tokens, so it follows the light/dark theme.

The `ui4a` in that fence is the harness this implements — **UI for Agent**, from Mind Lab: rather than coaxing an agent into a fixed UI schema, let it write ordinary frontend code and have the runtime enforce the boundaries. The reasoning, and the benchmarks behind it, are in [UI4A: A Component-Native Harness for Generative UI](https://www.mindlab.im/updates/ui4a-a-component-native-harness-for-generative-ui). This package is that harness wired into dsh's web client.

## Install

```sh
dsh plugin --profile web add dsh-generative-ui
```

Published npm releases carry provenance. To try an unreleased commit while preview publishing
is unavailable for the transferred repository, point the profile at a local checkout — `lib/` is
built by `prepare`, so the profile does not care that this package uses bun and dsh uses pnpm:

```sh
dsh plugin --profile web add link:/path/to/dsh-generative-ui
```

`dsh plugin` forwards to the profile's package manager, so any of these installs the package —
and adds it to `~/.dsh/profiles/web/package.json`'s `dsh.profile.bundles`, which is the list dsh
actually boots. Verified on a clean machine, the bundle list reads:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-generative-ui"
      ]
    }
  }
}
```

The `dependencies` entry beside it is whatever form you installed — and from the registry that is
a caret, which on a `0.0.x` version pins exactly: `^0.0.1` matches `0.0.1` and nothing later. Edit
it to `~0.0.1` if you want patches.

Start `dsh web` and it is there — or restart it if it was already running, since plugins are
mounted at boot and adding one has no hot-reload.

**If nothing happens, check which agent preset the session is on first.** Under `minimal`
(极简模式) the persona is declared `complete: true`, so nothing can append to the system prompt and
the `skill` tool is not in the preset — the model is never told this format exists. Measured: 45
characters of system prompt against 27524, and zero mentions of the fence. The rendering half still
works, so a card you paste by hand renders; the model just will not write one. Use `standard`, or
copy the preset and add `tool-skill` back.

## How it works

The package is one plugin with two halves, which is how dsh plugins reach the browser:

| | |
| --- | --- |
| `lib/index.js` (node) | injects the system-prompt section, registers the `generative-ui` skill, serves the compiler wasm and canvas file reads over its own `webServer` routes |
| `lib/client.js` (web) | claims `ui4a/tsx` code blocks in the transcript, compiles TSX in-browser, mounts the canvas panel |

The model is taught in two layers, split by what each costs:

- **`src/prompt.ts`** rides in every request, so it carries only the trigger, the fence syntax, the canvas path, and the colour tokens.
- **`skill/SKILL.md`** is registered through `ctx.skills.register()` and loads only when the model reaches for it. It carries the UI and inline/canvas decisions, then points to topic-specific files in `skill/references/` for the authoring details.

That split is measured, not assumed — see [CLAUDE.md](./CLAUDE.md) §4.5 for the 40-prompt evaluation behind it.

## Development

```sh
bun install
bun run check     # lint + typecheck + build + smoke
```

`bun run build` bundles both halves with `Bun.build`. [CLAUDE.md](./CLAUDE.md) is the design document — it records the host constraints this plugin was built against, all of them found the hard way.

## License

Apache-2.0

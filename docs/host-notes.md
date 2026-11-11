# Host notes: version upgrades and agent presets

Evidence behind [CLAUDE.md](../CLAUDE.md), kept out of the always-on layer because none of it is
needed before you act — you need it when a dsh upgrade lands, when a dependency audit flags
something, or when someone reports "the plugin does nothing".

The rules these produced live in CLAUDE.md; where the two disagree, CLAUDE.md wins.

### dsh-v0.2.0-rc.1 (checked 2026-09-28)

Peer ranges widened from `^0.1.5-rc.1` to `^0.1.5-rc.1 || ^0.1.6-0 || ^0.1.7-0 || ^0.2.0-0`. The union shape is deliberate, and it is not the same as `>=0.1.5-rc.1`: a plain `^0.1.5-rc.1` numerically REJECTS `0.2.0-rc.1` (minor bumps break `^` on 0.x), while a bare `>=` leaves every intermediate prerelease `unknown` under the dsh-doctor strict/numeric rule (`unknown is never compatible` — host-peer-declarations.md §4). One anchor per released prerelease line admits each line strictly. Verified against the published versions 0.1.5-rc.1 → 0.2.0-rc.1.

Three things measured for this host, not inferred:

- **`dsh-client-runtime` has no 0.2.0-rc.1** — the package was split (`api-session-controller/client` owns `ctx.sessions` now) and its last publish is `0.1.1-rc.2`. Our two `ClientContext` imports are `import type` only (it is `Context` from cordis), so it stays a type-time peer at `^0.1.1-rc.2` and the dev pin stays `0.1.1-rc.2`. Its `dsh.client.inject` row is tolerated as absent: the browser loader skips inject edges with no matching graph row (`arriveGraphRow` — `if (dependency !== undefined)`), and nothing in the built bundle `require()`s it. Do NOT drop the import or the inject row in the name of cleanup: the import carries `declare module` merges (§2.7) and the row orders factory arrival on the 0.1.5 hosts that still have the package.
- **PLATFORM_MODULES re-check (the one §2.1 asks for on every dsh upgrade): byte-identical between 0.1.5-rc.1 and 0.2.0-rc.1, and 11 entries on 0.2.1-rc.3** — measured 2026-10-26 off a running shell bundle: `zod`, `@tanstack/react-virtual`, `dsh-client-store` and `dsh-client-ui-dockkit` are all shared now. This bullet used to end at "our 7-entry list is a subset we actually `require()` (only `react` and `dsh-client-ui-primitives`), so no build change" — true, and it is why the drift was invisible, but it left the list four short across two minor lines. It is aligned to the full 11 now; the built `lib/client.js` and `index.js` are **byte-identical either way** (same md5, measured by building both), because nothing in our dependency tree imports the four.
- **The `dsh-generative-ui` message source already passes both writers.** The producer-owned bare kind survives v3 AND v4 `encodeCurrentEvent`, and the v3→v4 migration rewrites only the released `kind:"plugin"` wrapper (`rewriteV3MessageSource` passes direct kinds through with their metadata). No source change needed here — unlike dsh-py-codeact, which historically used the wrapper and has to switch per format generation.

Dev pins moved to `0.2.0-rc.1` as a set (the manifest is a version SET, not ten independent choices — mixing lines is how the primitives gap in the last paragraph stays invisible).

### js-yaml pin (CVE-2026-84375)

`js-yaml` is pinned to `4.3.2` through a bun `overrides` entry. The lock previously resolved `4.3.1`, which is inside the CVE's affected range (fixed in `3.15.2`/`4.3.2` — merge-key `<<` with empty mapping sources burns CPU past `maxTotalMergeKeys`). All four consumers (`cordis-plugin-include`, `dsh-agent-presets` at `^4.1.0`; `dsh-app-boot` at `^4.2.0`; `dsh-config-editor` at `^4.1.0`) admit `4.3.2` — verified with a semver probe — so the fix is range-compatible with everything the host pulls; the override is what makes it land in ONE hoisted resolution and keeps it there. A bare `bun update js-yaml` does the wrong thing: it hoists `5.x` as a phantom direct devDep and nests a still-vulnerable `4.3.1` under each consumer. `4.3.2` is same-major with no API removals (`load`/`dump`/`loadAll`/`DEFAULT_SCHEMA`/`YAMLException` all present); `5.x` would be a breaking jump for those consumers. Remove the override once the upstream packages widen past `4.3.x` or drop `js-yaml`; until then it is the only way to land the fix in one lock.

### 2.35 The `minimal` agent preset silences the whole Node half, and the client half survives it

Two user-supplied transcripts, same machine, same plugin, different preset:

|                                | `standard`            | `minimal`                            |
| ------------------------------ | --------------------- | ------------------------------------ |
| system prompt                  | 27524 chars           | **45 chars**                         |
| tools                          | 25, including `skill` | **2** (`bash`, `str_replace_editor`) |
| `ui4a` in the request header   | 6                     | **0**                                |
| `canvas` in the request header | 8                     | **0**                                |

`config/agent-presets/minimal/agent.cordis.yml` says why, in its own comment: the persona carries
`complete: true`, and _"the persona is the complete system prompt, so global identity, Web
orientation, tool guidance, and **later assembly listeners cannot add prompt text**"_. Our resident
section is exactly a later assembly listener (`ctx.systemPrompt.section()`), so it is dropped. The
skill is unreachable for a second, independent reason: the `skill` TOOL comes from the preset's own
`tool-skill` row, which `standard` has and `minimal` does not.

**The client half is unaffected, and that is measured, not inferred.** `src/client/index.ts`
injects only `slots` and `sessions` — both from the host composition, not the preset — and
`claimInlineFences` matches on rendered CONTENT (§3.5), never on a language tag or a prompt.
Verified in a real `dsh web` switched to 极简模式: asked to echo a four-backtick `ui4a/tsx` block
verbatim, the reply rendered as a card (a11y tree showed `heading` + `paragraph`, not a code
block), and the canvas launcher was still in the corner. So under `minimal` the model does not know
the format exists, but a user who dictates one still gets a rendered card.

**Putting it back is a preset copy, not a prompt change.** The instinct is to write the triggers
into `SKILL_DESCRIPTION` so the model loads the skill itself — but under `minimal` there is no
`skill` TOOL to call, so no description reaches anything. Both blocks have to be lifted, and both
live in the composition. Measured end to end:

    cp -R <dsh>/config/agent-presets/minimal ~/.dsh/.agent-presets/minimal-ui4a
    # in agent.cordis.yml: delete `complete: true`, append two rows —
    - id: skill-filesystem
      name: '@deepseek-ai/dsh-skill-filesystem'
    - id: tool-skill
      name: '@deepseek-ai/dsh-tool-skill'

`$DSH_HOME/.agent-presets` is the user root (`includeUserRoot` defaults true) and does not exist
until the first local preset is written. The new entry appeared in the composer's preset menu on
the next `dsh web`, and a session on it answered `帮我算下等额本息月供` with **a card**: the
transcript shows `上下文注入 · skill-catalog` and `Skill · generative-ui`, the input was **29.1K
tokens** where plain `minimal` would be a few hundred, and the reply rendered a mortgage panel with
the right figure (4,890.17), three stat blocks and three live inputs.

dsh ships a `创造模式` preset whose whole purpose is authoring these, which is the supported path
for a user; the copy above is the same thing done by hand.

Nothing to fix in the plugin: `minimal` is doing exactly what it says. Worth knowing before
debugging a report that "the plugin does nothing" — ask which 模式 the session was on first.

# Reference implementations

What to copy from where, for work that reaches outside this package. See also
[measuring.md](measuring.md) for how to check that what you copied actually works.

Where anything here disagrees with [CLAUDE.md](../CLAUDE.md), CLAUDE.md wins.

## 5. Reference implementations

Check which one you're copying from first — these repos solve different problems:

| For                                                                                             | Copy from                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| React singleton bridge, import-map, own compiler, path contract                                 | `../ui4a-playground/src/{runtime,fs}/`                      |
| wasm warmup, esm.sh fallback that avoids a second React                                         | `../genui-canvas/src/{genui-runtime,components/genui}/`     |
| CSS scoping + theme ancestor hoisting                                                           | `Ori-Replication/obsidian-ui4a-renderer`'s `src/styling.ts` |
| dsh plugin skeleton, how to split the two configs (it uses tsdown, we use `Bun.build` — see §0) | `liuup/dsh-latex-tools`                                     |
| How to organize a large client plugin                                                           | `omdsh-dev/DSH-better-sidebar`                              |

**A ported file keeps drifting after you port it.** `segments.ts` and `compiler.ts` both came from the playground
and both later grew fixes there that we did not have — the fence tolerances the model actually needs, and normalizing
the final frame. Neither showed up as a bug report here, because both failure modes look like the model wrote
something bad. When re-reading that repo, diff the files we ported rather than skimming its commit subjects, and run
its test cases against our copy: three of its nine fence cases failed here, and one of my own re-typed assertions
used `?.` and turned a failure into a pass.

**Don't copy** `../macaron-claude-code/web`'s zero-isolation approach (global UnoCSS runtime + global reset) — while
vendoring, it stubbed `useGenUIStyleScope` into a no-op, which pollutes the shell of any host that has its own design
system.

# Contributing To NextDJ

Thanks for helping improve NextDJ.

## Development Setup

```bash
nvm use
npm ci
npm run dev
```

The supported Node and npm versions are pinned in `.nvmrc` and
`package.json`. The repository rejects unsupported Node versions and uses the
committed `package-lock.json` for reproducible installs.

## Quality Gate

Before sending a change, run:

```bash
npm run check
npm run test:coverage
```

For performance-sensitive changes, also run:

```bash
npm run perf:snapshot -- --scenario deck-load --wait-ms 1000
```

For audio transport or recording changes, run the relevant additional snapshot:

```bash
npm run perf:snapshot -- --scenario deck-play --wait-ms 3000
npm run perf:snapshot -- --scenario deck-record --wait-ms 1000
```

## Pull Request Guidelines

- Keep UI changes intentional and visually validated.
- Preserve the `window.nextdj` bridge contract unless the migration is documented.
- Keep playlist import support service-neutral in this repository.
- Add regression tests for behavior changes when practical.
- Prefer small, focused changes over broad rewrites.
- Keep new files and heavily touched files around 500 lines or less when feasible.

## Commit Style

Use Conventional Commits:

```text
feat: add feature
fix: correct bug
refactor: improve structure without behavior changes
docs: update documentation
test: add or update tests
ci: change automation
build: change packaging or build setup
```

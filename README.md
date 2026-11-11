# Super Blocks

A lightweight, browser-based block puzzle game built with TanStack Start,
React, and Cloudflare Workers.

![Super Blocks](./public/og.png)

**Play online:** https://blocks.mksaas.link

## Features

- Classic endless mode
- Deterministic daily challenge
- Mouse, touch, and keyboard-friendly controls
- English and Chinese interfaces
- Local best scores and score history
- Session restore after refresh
- Music, sound, haptics, hints, and reduced-motion preferences
- Responsive desktop and mobile layouts

## Tech stack

- TanStack Start
- TanStack Router
- React 19
- TypeScript
- Cloudflare Workers
- Playwright
- Biome

## Development

Requirements:

- Node.js 22+
- pnpm 10+

```bash
pnpm install
pnpm dev
```

The local application is available at `http://localhost:3000`.

## Test

```bash
pnpm check
pnpm test
pnpm e2e
pnpm build
```

## Deployment

Log in to Cloudflare once:

```bash
pnpm exec wrangler login
```

Deploy the production Worker:

```bash
pnpm run deploy
```

The application does not require runtime environment variables or Worker
secrets. Wrangler uses your local Cloudflare CLI login to deploy; those
credentials must not be added to the Worker configuration or uploaded with
`wrangler secret put`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Game menu |
| `/play/classic` | Classic game |
| `/play/daily` | Daily challenge |
| `/ranking` | Local scores |
| `/settings` | Language and game preferences |
| `/how-to-play` | Rules and scoring |

## Related open-source games

This project belongs to the same small collection of standalone browser games:

- [game-poly](https://github.com/MkThingsHQ/mkgame-poly) — a browser port of the
  original level-based 8×8 block-fitting puzzle
- [game-sudoku](https://github.com/MkThingsHQ/mkgame-sudoku) — MimoDoku, a cozy
  cat-placement Sudoku with handcrafted and daily puzzles

## Author

[OpenFox](https://mksaas.link/fox-x) is an independent developer building products and developer tools. His products include:

- [TanStarter](https://tanstarter.dev) — Ship Faster with TanStack, Cost Less with Cloudflare.
- [MkSaaS](https://mksaas.com) — Make Your AI SaaS Product in a Weekend.
- [MkImage](https://mkimage.ai) — Make Any Images Possible.
- [MkDirs](https://mkdirs.com) — Launch AI-powered directory in 30 minutes.
- [MkDollar](https://mkdollar.com) — The all-in-one platform to help you make first dollar online.

## Build more with TanStarter

Super Blocks is intentionally kept small and focused, but it originally grew
out of a project built with [TanStarter](https://tanstarter.dev).

If you want to turn a game, tool, or product idea into a complete SaaS,
TanStarter provides a production-ready TanStack Start boilerplate with auth,
payments, AI, storage, email, newsletters, a blog, dashboard, i18n, SEO, and
Cloudflare Workers deployment.

**Ship Faster with TanStack, Cost Less with Cloudflare.**

- [TanStarter website](https://tanstarter.dev)
- [Live demo](https://demo.tanstarter.dev)
- [Documentation](https://docs.tanstarter.dev)
- [Video tutorials](https://www.youtube.com/@TanStarter)

## Asset notice

Some audio files were extracted from publicly obtainable application assets
and are included only for learning and research. Their original source paths
are documented in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). These
files remain subject to their respective rights holders; the MIT license does
not grant permission to copy, redistribute, modify, or otherwise use them
beyond any rights you independently obtain.

If you are a rights holder and believe an asset should be removed, please open
an issue or contact the repository maintainer. The asset will be reviewed and
removed when appropriate. If you fork or distribute this project, you are
responsible for removing or replacing third-party assets unless you have the
necessary authorization.

## License

Source code is released under the [MIT License](./LICENSE). Third-party assets
may be subject to separate rights described in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

# Webhook interface tests

Tests for the external-transcoder webhook endpoints:

- `GET /api/video/getNext` — task claiming (`getNext.test.mts`)
- `POST /api/video/updateStatus` — completion/failure reporting (`updateStatus.test.mts`)

## Run

```bash
npm test
```

The suite uses the Node.js built-in test runner
([`node:test`](https://node.dev/api/test.html)) with native TypeScript
type-stripping (`--experimental-strip-types`), so no extra test framework is
required. Node >= 22.6 (Node 24 recommended, matching `.nvmrc`) is needed.

## What is covered

### Authentication boundary (both endpoints)

- Server without `WEBHOOK_TOKEN` configured -> **500**, error explains the
  missing configuration, and **no database write occurs**.
- Missing `X-Webhook-Token` header or mismatched token -> **401**, no write.
- Token is verified **before** any database access, so an unauthorized request
  can never change video state.

### Claim endpoint

- Valid token claims one `UPLOADED` video, flips it to `PROCESSING` in a
  transaction and returns its `id`.
- Timed-out `PROCESSING` videos are reset to `UPLOADED` inside the same
  transaction before claiming; fresh `PROCESSING` videos are untouched.
- Explicit no-task response when nothing can be claimed.
- Concurrent claims never return the same id (row locking / `SKIP LOCKED`
  semantics, simulated by the in-memory fake).

### Report endpoint

- Strict body validation: only `id`, `status` (`DONE` | `FAILED`) and optional
  numeric `duration` are accepted; unknown fields, wrong types, malformed JSON
  and illegal statuses are rejected with **400** before any write.
- Reporting an unknown id returns a non-200 failure (**404**) and writes
  nothing.
- Valid reports update status (and duration, defaulting to 0).

Every failure-path test asserts both the HTTP status code and that the
repository's write counter stayed at zero / the row snapshot is unchanged.

## Test doubles

`helpers/in-memory-video-repository.mts` is an in-memory implementation of the
`VideoRepository` port (`lib/webhook/types.ts`). It models transaction
rollback, exclusive row locks and `SKIP LOCKED`, and counts every mutation, so
the tests need neither Postgres nor a running Next.js server. The real
persistence logic lives in `lib/webhook/kysely-video-repository.ts` behind the
same interface.

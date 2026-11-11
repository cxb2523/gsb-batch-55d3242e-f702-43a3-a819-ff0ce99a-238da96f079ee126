/**
 * Asset URLs shared by both halves. Kept apart from index.ts so the browser half
 * can import them without dragging node:fs and createRequire into its bundle.
 */
export const ASSET_PREFIX = "/dsh-generative-ui/assets";
export const WASM_PATH = `${ASSET_PREFIX}/tsx_bg.wasm`;

/** Reads one canvas file from the session's workspace: `?cwd=<workspace>&id=<canvas>`. */
export const CANVAS_READ_PATH = "/dsh-generative-ui/canvas";

/**
 * Streams one model call for a generated card: POST `{prompt|messages, system?}`.
 *
 * The host owns the credentials and the provider route, so this forwards to `ctx.llm`
 * rather than carrying a key of its own.
 */
export const AI_STREAM_PATH = "/dsh-generative-ui/ai";

/**
 * Filesystem access for a generated card: `?cwd=<workspace>&path=<path>`.
 *
 * GET reads (or lists, with `?list=1`), POST writes. Both go through the host's `ctx.fs`
 * and carry the session's own sandbox policy, so what a card may do is exactly what the
 * session may do — `read-only` denies the write at the fence rather than here.
 */
export const FS_PATH = "/dsh-generative-ui/fs";

/**
 * Runs one command for a generated card: `?cwd=<workspace>&session=<id>`, POST `{command}`.
 *
 * Under the session's own sandbox policy, exactly as `FS_PATH` is — a read-only session gets
 * a read-only shell rather than a different fence. Foreground only: a card that wants a
 * long-running process wants a different product.
 */
export const EXEC_PATH = "/dsh-generative-ui/exec";

/**
 * One web search for a generated card: `?cwd=<workspace>`, POST `{query, maxResults?}`.
 *
 * Search only. `ctx.web` also exposes `fetch`, and this deliberately does not forward it: the
 * deployment's own `tool-web` is configured `fetch: false`, and the doc says why — *"the local
 * backend does not block private-network targets; do not enable web_fetch where it can reach
 * sensitive internal ones."* A card is model-written code firing on a reader's keystrokes, so
 * re-opening from here what the host closed for its own tools is not ours to do.
 */
export const WEB_SEARCH_PATH = "/dsh-generative-ui/web-search";

/**
 * A card's surviving failure, reported by the browser half: `?session=<id>`, POST
 * `{message, phase}` to set it and `{}` to clear it.
 *
 * The detail does NOT come back as a chat message. It becomes a runtime-context snapshot
 * (`ui4a:card-failure`), which is re-evaluated per assembly and superseded by the next one, so a
 * card that gets fixed stops being mentioned instead of leaving a stale complaint in history. The
 * route only carries the state; `wakeAgent` is what asks the model to look at it.
 */
export const CARD_ERROR_PATH = "/dsh-generative-ui/card-error";

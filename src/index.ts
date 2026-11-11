/**
 * Host half — serves the @esm.sh/tsx wasm the browser half compiles TSX with.
 *
 * The shell's /plugins route hard-codes the `/client.js` and `/client.js.map`
 * suffixes and 404s everything else, and dsh-host-frontend-static owns the sole
 * fallback seat (and answers misses with index.html + 200, so dropping the wasm
 * there would fail as a confusing magic-word error). A plugin-owned webServer
 * route is the way to ship bytes; dsh-latex-tools serves MathJax the same way.
 * @module dsh-generative-ui
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-skill";
// A value import, unlike the others: `llm.stream` rejects a plain `{role, content}` object,
// and this is the constructor that stamps the identity and source tags it requires.
import { createUserMessage, type ContextFormed } from "@deepseek-ai/dsh-llm";
import { AI_STREAM_PATH, ASSET_PREFIX, CANVAS_READ_PATH, CARD_ERROR_PATH, EXEC_PATH, FS_PATH, WASM_PATH, WEB_SEARCH_PATH } from "./contract-assets.ts";
import { CANVAS_DIR, canvasChildPath, canvasIdOf, canvasPath, isCanvasId } from "./contract.ts";
import { CardFailures, CARD_FAILURE_CONTEXT, CARD_FAILURE_CONTEXT_ORDER, WAKE_SUMMARY, WAKE_TEXT } from "./card-failure.ts";
import { inlinePrompt, PROMPT_SECTION_NAME, PROMPT_SECTION_ORDER, type Capabilities } from "./prompt.ts";
import { skillEntry, skillPath, skillResourceBase, SKILL_DESCRIPTION, SKILL_NAME } from "./skill.ts";

/**
 * The one field of the assembling agent this plugin reads: its id, which IS the session id.
 *
 * Declared here rather than by importing `@deepseek-ai/dsh-agent`, which owns the real
 * augmentation. That package also augments cordis `Context` with the HOST's `sessions` service,
 * and the augmentation is global — pulling it in retyped `ctx.sessions` inside `src/client/`,
 * where the session store is the browser runtime's and has `getSnapshot`/`binding` instead.
 * Six type errors in files this change does not touch. One optional field is the whole
 * dependency, so it is cheaper to state it than to import the package that carries it.
 */
declare module "@deepseek-ai/dsh-system-prompt" {
  interface AssembleContext {
    agent?: { readonly id: string };
  }
}

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    "dsh-generative-ui": { kind: "dsh-generative-ui" } & ContextFormed;
  }
}

declare module "@deepseek-ai/cordis" {
  interface Events {
    "loader/volatile-update"(paths: readonly (readonly string[])[]): void;
  }
}

export const name = "dsh-generative-ui";
export const inject = ["systemPrompt"];

/** The settings section this plugin owns; the key under `dsh-generative-ui:` in settings.yaml. */
export const SETTINGS_NAMESPACE = name;

/**
 * Plugin settings. A schemastery schema, not a TypeScript type: the host validates the
 * `settings.yaml` section against it and builds the settings UI from it, so a plain interface
 * would be a switch nobody can find and nobody can check.
 *
 * `allowExec` is ON by default, and the trade it makes is worth stating rather than assuming.
 *
 * What it is NOT: an escape from the fence. The route resolves `ctx.sandboxPolicy` for the session
 * and hands it to `ctx.shell`, so a card's command opens nothing the agent's own bash has not
 * already opened, in a workdir pinned to a live session's workspace, killed after 15s and on the
 * reader closing the page.
 *
 * What it IS: the approval layer does not reach here. `approval.request()` needs an open turn and
 * an agent, and a card fires on a reader's keystroke long after its turn ended — so the per-command
 * fence is the sandbox policy alone. Under `workspace-write` a card can therefore delete inside the
 * workspace with nobody agreeing to it command by command. The prompt answers that where it can
 * ("observe, never change"; anything destructive belongs in a `sendMessage` the user agrees to),
 * which is guidance, not a fence.
 *
 * Turned on because the capability it gates is the ordinary case, not the exotic one: search
 * (`fd`, `rg`) that no `$dsh/fs` call expresses, `lint` / `check` / test runs whose output IS the
 * card, `git log`, and the twenty-`readdir` walks a single `ls -R` replaces. Off, a model reasoning
 * from a five-capability set writes those as file-by-file loops or does not write the card at all.
 */
export const Config = z.object({
  allowExec: z
    .boolean()
    .default(true)
    .description("Let generated cards run shell commands through `$dsh/exec`, under this session's own sandbox mode. Cards use it to search (`rg`, `fd`), run `lint`/`check`, and read `git`. The sandbox still applies; what does not is the per-command approval prompt, so turn this off for a session where that matters."),
});

// Old schemastery ignores this metadata; new hosts project it into SettingsForms
// and parse a stable reference. Keep the older peer floor without importing new-only APIs.
Object.assign(Config.dict!.allowExec!.meta, { volatile: true });
// `get(): boolean | undefined`, not `get(): boolean`: the volatile reference type is
// `Volatile<T | undefined>` when the field is merely `default`ed (schemastery 3.18.4's
// `SchemaOutput<T, 'volatile'>`, which 0.2.0-rc.1's dsh-settings types reach through), and a
// reference whose `get()` returns `boolean | undefined` is NOT assignable to one promising
// `boolean`. Structural widening here — rather than importing `Volatile` — is what keeps this
// compiling across the schemastery copies the tree can still carry (the manifest is a version
// SET: the direct dev pin is now `~3.18.4` so the export sits on ONE `Schema` identity, while
// an older transitive graph may still nest 3.18.2). The runtime already reads it as tri-state
// (`=== true`), so nothing changes at run time.
export type Config = { allowExec: boolean | { get(): boolean | undefined } };

type LegacySettings = {
  installSection?: (owner: Context, ns: string, schema: typeof Config, defaults: Config, options: { setSource: (source: () => Config) => void; onChange: () => void }) => unknown;
};

// Namespaced by package name because a duplicate (kind, path) throws, and a throw during apply silently fails the whole plugin.
export { ASSET_PREFIX, WASM_PATH } from "./contract-assets.ts";

/** Resolved from this module's own location so pnpm's nested install is anchored against the plugin, not the profile tree. */
const wasmFile = (importMetaUrl: string) => createRequire(importMetaUrl).resolve("@esm.sh/tsx/pkg/tsx_bg.wasm");

/**
 * An absolute path to one of the package's import maps, or undefined when it is not there.
 *
 * `existsSync` is the point. `fileURLToPath` only rejects a malformed URL — it happily returns a
 * path to a file that does not exist, which is what this used to do: installed in a shape where
 * the package root is not two levels up, the skill was handed a path that resolves to nothing
 * and told the model to pass it to `-i`. The failure then surfaces as `genui check` reporting
 * `Cannot find module "$dsh/fs"` on correct code, and the model "fixes" imports that were right.
 */
export const resolvedMap = (relative: string, importMetaUrl: string): string | undefined => {
  let path: string;
  try {
    path = fileURLToPath(new URL(relative, importMetaUrl));
  } catch {
    return undefined;
  }
  return existsSync(path) ? path : undefined;
};

/**
 * Absolute path of the import map that types `$dsh/*` for `genui check`.
 *
 * Resolved rather than hard-coded because the plugin lives wherever the profile installed it,
 * and the model runs the checker from the workspace — it has no way to guess that path.
 */
const typesImportMap = (importMetaUrl: string): string | undefined => resolvedMap("../types/importmap.json", importMetaUrl);

/** Absolute path of the runtime stub map `genui build` and `genui dev` resolve `$dsh/*` against. */
const standaloneImportMap = (importMetaUrl: string): string | undefined => resolvedMap("../types/standalone/importmap.json", importMetaUrl);

/** Exported for `test/routes.test.ts`: a prefix route that stops checking its pathname serves the whole prefix. */
export async function serveAsset(req: IncomingMessage, res: ServerResponse, file: string): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405).end();
  const pathname = new URL(req.url ?? "/", "http://x").pathname;
  if (pathname !== WASM_PATH) return void res.writeHead(404).end();
  // instantiateStreaming rejects anything whose content-type is not exactly application/wasm.
  res.writeHead(200, { "content-type": "application/wasm", "cache-control": "public, max-age=31536000, immutable" });
  res.end(await readFile(file));
}

/**
 * Serves one canvas file's current contents, or — with no `id` — the ids of every canvas
 * in the workspace.
 *
 * The client could reconstruct a canvas from `write` tool arguments alone, and does while
 * a write streams — but a model routinely follows a write with several `edit` calls, whose
 * arguments carry a patch rather than the file. Reading the file is the only source that
 * stays correct across every way it can change, including edits made outside the agent.
 *
 * Confined to the canvas directory by construction — the id is a path segment and the path
 * is built from the contract — and to a live session's own workspace by the `cwd` check.
 *
 * That check is the security boundary, not a formality. This route answers any page the
 * user has open: a simple GET triggers no preflight, so without it `?cwd=/anywhere` turns
 * the plugin into a file-existence oracle for the whole disk. The client only ever sends
 * the cwd it read off the current session, so matching against live sessions costs nothing.
 */
/** Exported for `test/routes.test.ts`: the listing is the launcher's only source of truth and had no test. */
export async function serveCanvas(liveWorkspaces: () => ReadonlySet<string>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") return void res.writeHead(405).end();
  const url = new URL(req.url ?? "/", "http://x");
  const cwd = url.searchParams.get("cwd");
  const id = url.searchParams.get("id");
  // The id is a path segment by contract; anything else cannot name a canvas.
  if (cwd === null || (id !== null && !isCanvasId(id))) return void res.writeHead(400).end();
  if (!liveWorkspaces().has(cwd)) return void res.writeHead(403).end();
  // No id: list the directory. A canvas outlives the session that wrote it, so the panel
  // needs a source beyond the current transcript to offer one written yesterday.
  if (id === null) {
    const ids = await readdir(join(cwd, CANVAS_DIR)).then(
      (names) =>
        names.flatMap((name) => {
          const found = canvasIdOf(`${CANVAS_DIR}/${name}`);
          return found === null ? [] : [found];
        }),
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        res.writeHead(500).end();
        return null;
      },
    );
    if (ids === null) return;
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return void res.end(JSON.stringify(ids));
  }
  // A relative specifier written inside the canvas. Resolved through the contract, which
  // confines it to this canvas's own child directory — see canvasChildPath.
  const child = url.searchParams.get("child");
  if (child !== null) {
    const path = canvasChildPath(id, child, url.searchParams.get("from") ?? undefined);
    if (path === null) return void res.writeHead(400).end();
    // A specifier carries no extension, so the server is what decides which file it names —
    // and the client needs to know, because the compiler picks its syntax from the extension.
    for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
      try {
        const body = await readFile(join(cwd, path + suffix), "utf8");
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-ui4a-filename": path + suffix });
        return void res.end(body);
      } catch {
        // Next candidate; a specifier that names none of them is a 404 below.
      }
    }
    return void res.writeHead(404).end();
  }
  try {
    const code = await readFile(join(cwd, canvasPath(id)), "utf8");
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end(code);
  } catch (error) {
    // A canvas whose write is still streaming has no file yet; the client keeps its own copy.
    res.writeHead((error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500).end();
  }
}

/** Context shape for the filesystem route; see the SessionStoreCtx note on why it is local. */
type FsCtx = {
  fs: {
    resolve: (path: string, opts?: { cwd?: string }) => Promise<FsTargetLike>;
    readText: (target: FsTargetLike) => Promise<string>;
    readBytes: (target: FsTargetLike, signal: AbortSignal | undefined, maxBytes: number) => Promise<Uint8Array>;
    listDir: (target: FsTargetLike) => Promise<{ name: string; type?: string; size?: number }[]>;
    writeText: (target: FsTargetLike, content: string, expected?: undefined, signal?: AbortSignal, policy?: unknown) => Promise<unknown>;
  };
  sandboxPolicy: { resolve: (request?: { session?: unknown }) => unknown };
  sessions: { list: () => readonly { id?: string; header: { cwd?: string } }[] };
};
type FsTargetLike = { targetKey: unknown; displayPath: string };

/**
 * Reads, lists, and writes on behalf of a generated card.
 *
 * Everything goes through the host's `ctx.fs` carrying the session's own
 * `ctx.sandboxPolicy`, so **a card may do exactly what the session may do** — under
 * `read-only` the write is refused by the same fence that refuses the model's, with the
 * same structured denial. Inventing a narrower boundary here would mean a second policy to
 * keep in sync with the one the user actually sees in the composer.
 *
 * The `cwd` allowlist is still required, for the reason the canvas route documents: any page
 * the user has open can call this, so without it the workspace is not the workspace.
 */
/** Exported for `test/fs-route.test.ts`. */
export async function serveFs(ctx: FsCtx, liveWorkspaces: () => ReadonlySet<string>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://x");
  const cwd = url.searchParams.get("cwd");
  const path = url.searchParams.get("path");
  if (cwd === null || path === null || path === "") return void res.writeHead(400).end();
  if (!liveWorkspaces().has(cwd)) return void res.writeHead(403).end();
  // Before ANY read as well as before a write. `cwd` selects the allowlist entry and `session`
  // selects the policy; left independent, a GET with someone else's workspace reads it and a POST
  // writes it under another session's access mode. Reads carry `session` too.
  const sessionId = url.searchParams.get("session");
  const session = sessionId === null ? undefined : ctx.sessions.list().find((entry) => entry.id === sessionId);
  if (session === undefined || session.header.cwd !== cwd) return void res.writeHead(400).end();

  const json = (status: number, body: unknown): void => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  // A denial is an answer, not a crash: the card needs to tell "you may not" from "it broke".
  const failed = (error: unknown): void => {
    const code = (error as { code?: string } | undefined)?.code;
    json(code === "FS_SANDBOX_DENIED" ? 403 : 404, { error: code ?? (error instanceof Error ? error.message : String(error)) });
  };

  try {
    const target = await ctx.fs.resolve(path, { cwd });
    if (req.method === "GET") {
      if (url.searchParams.get("list") !== null) {
        // Only the three fields a card can use. The host also returns its own `target` and a
        // `version` cache key (dev:ino:size:mtime:ctime — note mtime precedes ctime, which is
        // not the order the name suggests); neither is contract, so neither is forwarded.
        const entries = await ctx.fs.listDir(target);
        return json(200, { entries: entries.map(({ name, type, size }) => ({ name, type, size })) });
      }
      // `?bytes=1` reads the file as bytes and answers base64. A card that wants a .mid, a
      // wav, or an image cannot use the text path: `readText` decodes as UTF-8, so every byte
      // above 0x7f comes back as U+FFFD and the file is silently corrupt rather than refused.
      if (url.searchParams.get("bytes") !== null) {
        const bytes = await ctx.fs.readBytes(target, undefined, MAX_BINARY);
        return json(200, { base64: Buffer.from(bytes).toString("base64"), byteLength: bytes.byteLength });
      }
      return json(200, { content: await ctx.fs.readText(target) });
    }
    if (req.method !== "POST") return void res.writeHead(405).end();

    let body = "";
    for await (const chunk of req) {
      body += chunk as string;
      if (body.length > MAX_BODY) return void res.writeHead(413).end();
    }
    let content: string;
    try {
      ({ content } = JSON.parse(body) as { content: string });
    } catch {
      return void res.writeHead(400).end();
    }
    if (typeof content !== "string") return void res.writeHead(400).end();
    // The session's policy, not ours: the composer's access mode is what decides. The pair was
    // validated above, before anything could be read or written.
    await ctx.fs.writeText(target, content, undefined, undefined, ctx.sandboxPolicy.resolve({ session }));
    return json(200, { written: target.displayPath });
  } catch (error) {
    return failed(error);
  }
}

/** Context shape for the shell route. `resolve` fills the executor's own defaults and caps. */
type ExecResult = { exitCode: number | null; signal?: string | null; timedOut?: boolean; stdout: { text: string; truncated: boolean }; stderr: { text: string; truncated: boolean } };
type ExecCtx = {
  shell: {
    resolve: (request: { command: string; workdir?: string; timeoutMs?: number; onExpiry?: "kill"; sandboxPolicy?: unknown; signal?: AbortSignal }) => unknown;
  } & ({ execute: (spec: unknown) => Promise<{ result: () => Promise<ExecResult> }> } | { run: (spec: unknown) => Promise<ExecResult> });
  sandboxPolicy: { resolve: (request?: { session?: unknown }) => unknown };
  sessions: { list: () => readonly { id?: string; header: { cwd?: string } }[] };
};

/** Longest a card's command may run. The card is on the user's page, waiting on a fetch. */
const EXEC_TIMEOUT_MS = 15_000;

/**
 * Runs one command on behalf of a generated card.
 *
 * The whole point is that a card can answer questions only a command can answer — git
 * history, a test run, ripgrep across a big tree — without us re-implementing each one as a
 * route. It carries the session's own sandbox policy, so this opens no door the model's own
 * bash tool does not already have open, and a read-only session gets a read-only shell.
 *
 * A non-zero exit is a RESULT, not an error: a card wants to show `git status` failing in a
 * non-repo as much as it wants to show it succeeding. Only infrastructure failures reject.
 *
 * **Why this does not go through `ctx.approval`, which is the seam for "may this action
 * proceed?".** It is the right question and dsh's own `tool-bash` asks it — but the service
 * cannot answer it here. `approval.request()` takes an `agent` and throws outright when the
 * session has no open turn: *"approval.request() outside an open turn … Ask from inside the turn
 * that needs the decision."* A card's command is the opposite of that — it fires on the reader's
 * keystroke, long after the turn that wrote the card ended, with no agent on whose behalf to ask.
 * `ctx.userQuestions.ask()` DOES work outside a turn (its `agent` is optional), so a per-command
 * prompt is buildable; what stops it is that a card runs one command per keystroke, and a dialog
 * per keystroke is not a safety feature. The setting is therefore about whether the CAPABILITY
 * exists, and the per-command fence remains the session's own sandbox policy, which this passes
 * through unchanged. Anything genuinely destructive belongs in `sendMessage`, where the user's
 * next turn — and with it the whole approval machinery — is what runs it.
 */
/** Exported for `test/exec-route.test.ts`. */
export async function serveExec(ctx: ExecCtx, liveWorkspaces: () => ReadonlySet<string>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://x");
  const cwd = url.searchParams.get("cwd");
  if (cwd === null || !liveWorkspaces().has(cwd)) return void res.writeHead(cwd === null ? 400 : 403).end();
  if (req.method !== "POST") return void res.writeHead(405).end();

  const sessionId = url.searchParams.get("session");
  const session = sessionId === null ? undefined : ctx.sessions.list().find((entry) => entry.id === sessionId);
  // Same pairing rule as the fs route: a command runs under the policy of the session that owns
  // this workspace, never under one that merely happens to be live.
  if (session === undefined || session.header.cwd !== cwd) return void res.writeHead(400).end();

  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > MAX_BODY) return void res.writeHead(413).end();
  }
  let command: string;
  try {
    ({ command } = JSON.parse(body) as { command: string });
  } catch {
    return void res.writeHead(400).end();
  }
  if (typeof command !== "string" || command === "") return void res.writeHead(400).end();

  const json = (status: number, value: unknown): void => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  };
  try {
    // Kill the command when the caller goes away. A card that runs one command per keystroke
    // has no other way to cancel — `bash()` returns a promise, not a handle — so without this
    // a fast typist leaves a queue of doomed ripgreps competing for the machine.
    // Body consumption may finish with an already-destroyed response, before `close` fires.
    // Do not start a command for it; no await separates this check from listener registration.
    if (res.destroyed) return;
    const controller = new AbortController();
    // A completed request body is not a closed response socket.
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const spec = ctx.shell.resolve({ command, workdir: cwd, timeoutMs: EXEC_TIMEOUT_MS, onExpiry: "kill", sandboxPolicy: ctx.sandboxPolicy.resolve({ session }), signal: controller.signal });
    const result = "execute" in ctx.shell ? await (await ctx.shell.execute(spec)).result() : await ctx.shell.run(spec);
    return json(200, {
      stdout: result.stdout.text,
      stderr: result.stderr.text,
      exitCode: result.exitCode,
      signal: result.signal ?? null,
      // Per stream, not merged: a card that parses stdout needs to know whether *stdout* was
      // cut, and one boolean for both makes a full stdout look unreliable whenever a noisy
      // stderr overflowed.
      truncated: { stdout: result.stdout.truncated, stderr: result.stderr.truncated },
      timedOut: result.timedOut === true,
    });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Context shape for the search route. Only the two methods it calls, so a fake in a test is small. */
type WebCtx = {
  web: {
    search: (request: { query: string; maxResults?: number }, signal?: AbortSignal) => Promise<{ content?: string; sources: readonly { url: string; title?: string; snippet?: string; publishedAt?: string }[]; truncated: boolean }>;
  };
};

/** How many sources a card gets by default; the host's own tool-web default is 8. */
const SEARCH_MAX_RESULTS = 8;

/**
 * Runs one web search on behalf of a generated card.
 *
 * A card that wants live information — a price, a release date, what a package exports — otherwise
 * has nothing: `fetch` from inside the surface is not the shape (no credentials, no CORS, no
 * provider selection), and routing the question through `$dsh/ai` asks a model to recall rather
 * than to look. `ctx.web` already owns provider selection, the result shape, and the truncation
 * bound, so this forwards and does not re-decide any of it.
 *
 * SEARCH ONLY — see `WEB_SEARCH_PATH` for why `fetch` is not forwarded.
 *
 * `WebError` carries a `code` and the seam's own contract calls that set OPEN: a provider may
 * raise a code this build has never seen. So the error is passed through as text rather than
 * matched on, and the card decides what to show.
 */
/** Exported for `test/web-search-route.test.ts`. */
export async function serveWebSearch(ctx: WebCtx, liveWorkspaces: () => ReadonlySet<string>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://x");
  const cwd = url.searchParams.get("cwd");
  if (cwd === null || !liveWorkspaces().has(cwd)) return void res.writeHead(cwd === null ? 400 : 403).end();
  if (req.method !== "POST") return void res.writeHead(405).end();

  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > MAX_BODY) return void res.writeHead(413).end();
  }
  let query: string;
  let maxResults: number | undefined;
  try {
    ({ query, maxResults } = JSON.parse(body) as { query: string; maxResults?: number });
  } catch {
    return void res.writeHead(400).end();
  }
  if (typeof query !== "string" || query.trim() === "") return void res.writeHead(400).end();

  const json = (status: number, value: unknown): void => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  };
  try {
    // Same reason the exec route does it: a card that searches as the reader types has no other
    // way to cancel, and the seam forwards the signal to the provider.
    if (res.destroyed) return;
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const result = await ctx.web.search({ query, maxResults: maxResults ?? SEARCH_MAX_RESULTS }, controller.signal);
    return json(200, { content: result.content, sources: result.sources, truncated: result.truncated });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Context shape for the two services the AI route needs; see the SessionStoreCtx note. */
type LlmCtx = {
  llm: { stream: (options: { provider: string; model: string; messages: readonly unknown[]; system?: string; signal?: AbortSignal }) => AsyncIterable<{ type: string; text?: string; reason?: { kind: string; failure?: { message?: string } } }> };
  agentDefaultModel: { currentSelection: () => { provider: string; model: string } };
};

/** Largest request body accepted by either POST route, so a runaway card cannot exhaust memory. */
const MAX_BODY = 64 * 1024;

/** Byte cap on a binary read. Base64 inflates by a third, and this crosses a JSON response. */
const MAX_BINARY = 8 * 1024 * 1024;

/**
 * Streams one model call on behalf of a generated card.
 *
 * The card cannot call a provider itself — it has no credentials and should never be given
 * any. `ctx.llm` already owns the adapter registry, the retry policy and the keys, and
 * `agentDefaultModel` owns which model the app is set to, so this route is a forwarder:
 * it converts a small JSON request into `llm.stream` and pipes the text deltas back.
 *
 * Same `cwd` allowlist as the canvas route, and for the same reason: any page the user has
 * open can POST here, so without it this is an open model proxy for anything on the machine.
 */
/** Exported for `test/ai-route.test.ts`. */
export async function serveAi(ctx: LlmCtx, liveWorkspaces: () => ReadonlySet<string>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return void res.writeHead(405).end();
  const url = new URL(req.url ?? "/", "http://x");
  const cwd = url.searchParams.get("cwd");
  if (cwd === null) return void res.writeHead(400).end();
  if (!liveWorkspaces().has(cwd)) return void res.writeHead(403).end();

  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > MAX_BODY) return void res.writeHead(413).end();
  }

  let request: { prompt?: string; system?: string };
  try {
    request = JSON.parse(body) as typeof request;
  } catch {
    return void res.writeHead(400).end();
  }
  if (request.prompt === undefined || request.prompt === "") return void res.writeHead(400).end();
  // One user turn, deliberately: `llm.stream` will not take a bare `{role, content}` — a
  // message carries an identity and a source tag — and the assistant-side constructor wants
  // provider, model and replay state, which means a multi-turn API here would be forging
  // turns the model never produced. Anything a card needs from an earlier turn belongs in
  // the prompt it builds.
  const messages = [createUserMessage({ content: [{ type: "text", text: request.prompt }], source: { kind: "dsh-generative-ui" } })];

  const selection = ctx.agentDefaultModel.currentSelection();
  // Abort the model call when the reader navigates away or the card unmounts; without this
  // a closed tab leaves a generation running and billing.
  if (res.destroyed) return;
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
  try {
    for await (const chunk of ctx.llm.stream({ ...selection, messages, system: request.system, signal: controller.signal })) {
      if (chunk.type === "text-delta" && chunk.text !== undefined) res.write(chunk.text);
      // A failed call finishes rather than throwing, so without this the card sees a clean
      // empty 200 and reports "the model said nothing" — indistinguishable from a real
      // empty answer. Trailing the reason is the only channel left once the body has begun.
      // `reason` is an object with a `kind`, not a string: interpolating it directly writes
      // `[object Object]`, which is how this was first shipped.
      else if (chunk.type === "finish" && chunk.reason !== undefined && chunk.reason.kind !== "stop") res.write(`\n\n[${chunk.reason.kind}${chunk.reason.failure?.message === undefined ? "" : `: ${chunk.reason.failure.message}`}]`);
    }
  } catch (error) {
    // Headers are already out, so this cannot become a status code.
    res.write(`\n\n[error: ${error instanceof Error ? error.message : String(error)}]`);
  }
  res.end();
}

/** Live sessions' workspaces. Typed locally: a global `dsh-session` merge would also rewrite
 *  the client half's `ctx.sessions`, which is a different service entirely. */
type SessionStoreCtx = { sessions: { list: () => readonly { header: { cwd?: string } }[] } };

// `= Config({})` rather than a bare default: schemastery fills every declared default, so an
// omitted config is the same object the host would have built, and `allowExec` is true there.
// A host that calls `apply(ctx)` is not a hypothetical — the existing profile tests do.
export function apply(ctx: Context, config: Config = Config({})): void {
  // `current()` rather than a captured boolean: the section is live, and a user who turns
  // commands off in the settings UI means it now, not at the next restart.
  let current = () => config;
  // The prompt text and the exec route are both DECIDED at registration time, so a live setting
  // needs somewhere to re-decide them. A cordis scope is that somewhere: everything below hangs
  // off `configured`, and `onChange` disposes and rebuilds it, which re-registers the section
  // with the new text and adds or removes the route. Reading `current()` inside the effects
  // without this would change the value and leave the registrations as they were.
  // The mounted value rides ON the handle rather than in a second variable: the two would have to
  // be assigned in lockstep by hand, and an early return added between them later would desync the
  // dedup from what is actually mounted.
  let configured: { allowExec: boolean; fiber: { dispose: () => Promise<void> } } | null = null;
  const rebuild = () => {
    const value = current().allowExec;
    const allowExec = (typeof value === "boolean" ? value : value?.get()) === true;
    // `onChange` fires on every write to the section, and the section may grow other keys later.
    // Rebuilding on a value that did not move would tear down the prompt and both routes for
    // nothing — visible to a reader as a card losing its host mid-conversation.
    if (configured?.allowExec === allowExec) return;
    void configured?.fiber.dispose();
    configured = { allowExec, fiber: ctx.plugin({ name: "dsh-generative-ui:configured", apply: (scoped: Context) => applyWith(scoped, allowExec) }) };
  };
  // 无 settings 服务时下面的 inject 不执行，必须先用 entry 配置挂载；rebuild 内的值比较避免重复挂载。
  rebuild();
  // Profile edits update the reference before this owner-scoped event is emitted.
  // Legacy plain-boolean hosts keep their existing installSection callback below.
  if (typeof config.allowExec !== "boolean") ctx.on("loader/volatile-update", rebuild);
  ctx.inject(["settings"], (sctx) => {
    (sctx.settings as unknown as LegacySettings).installSection?.(ctx, SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source;
      },
      onChange: rebuild,
    });
  });
  ctx.effect(() => () => void configured?.fiber.dispose(), "dsh-generative-ui: settings scope");
}

/** Everything whose shape depends on `allowExec`; rebuilt when the setting changes. */
function applyWith(ctx: Context, allowExec: boolean): void {
  /**
   * The guidance is built from what this host actually mounted, not from what it might have.
   *
   * A capability whose route is not registered cannot be used, and the closed-set sentence in the
   * prompt is load-bearing: it is what stops the model reasoning its way to a plausible extra
   * import. Documenting one that is missing teaches a card whose import fails, and a failed import
   * takes the whole module down — a blank card with nothing naming the cause. This is the same rule
   * `allowExec` has always followed, generalised to the four host-backed capabilities.
   */
  const capabilities: Capabilities = { fs: false, ai: false, exec: false, web: false };
  // `ctx.effect` and `ctx.inject` hand back a fiber, not a plain disposer, so normalise both.
  const stop = (handle: unknown): void => {
    if (typeof handle === "function") return void (handle as () => void)();
    void (handle as { dispose?: () => unknown } | undefined)?.dispose?.();
  };
  let stopGuidance: unknown[] = [];
  const guidance = () => {
    for (const handle of stopGuidance) stop(handle);
    stopGuidance = [
      ctx.effect(() => ctx.systemPrompt.section({ name: PROMPT_SECTION_NAME, order: PROMPT_SECTION_ORDER, text: inlinePrompt(capabilities) }), "dsh-generative-ui: inline prompt"),
      ctx.inject(["skills"], (scoped) =>
        scoped.effect(
          () =>
            scoped.skills.register({
              name: SKILL_NAME,
              description: SKILL_DESCRIPTION,
              path: skillPath,
              resourceBase: skillResourceBase,
              content: skillEntry(typesImportMap(import.meta.url), standaloneImportMap(import.meta.url), capabilities),
              source: "runtime",
              invocation: { modelInvocable: true, userInvocable: false },
            }),
          "dsh-generative-ui: skill",
        ),
      ),
    ];
  };
  guidance();
  // A service can arrive after us, so each one folds into the set and restates the guidance.
  // Capabilities only ever appear, never disappear, so this converges on the mounted set.
  const mounted =
    (key: keyof Capabilities, ready: () => boolean = () => true) =>
    () => {
      if (!ready() || capabilities[key]) return;
      capabilities[key] = true;
      guidance();
    };
  ctx.inject(["fs"], mounted("fs"));
  ctx.inject(
    ["shell"],
    mounted("exec", () => allowExec),
  );
  ctx.inject(["web"], mounted("web"));
  ctx.inject(["llm", "agentDefaultModel"], mounted("ai"));
  // A card that will not render, as CONTEXT rather than as a message — see `card-failure.ts`.
  // The provider runs per assembly, so an empty string is how a fixed card stops being mentioned;
  // `agent.id` is the session id, which is what the browser half keys its reports on.
  const failures = new CardFailures();
  ctx.effect(() => ctx.systemPrompt.context({ name: CARD_FAILURE_CONTEXT, order: CARD_FAILURE_CONTEXT_ORDER, text: (assembly) => failures.text(assembly.agent?.id) }), "dsh-generative-ui: card failure context");
  // The nudge needs the agent registry, which a diagnostic or headless composition may not have.
  // Scoped, like every other capability here: without it the failure still reaches the model, just
  // on the next turn the user starts rather than on one of its own.
  let wake: ((session: string) => void) | null = null;
  ctx.inject(["agents"], (withAgents) => {
    wake = (session) => {
      const agent = (withAgents as unknown as { agents: { get: (id: string) => { followup: (message: ReturnType<typeof createUserMessage>) => void } | undefined } }).agents.get(session);
      // `source.kind` is what the transcript renders on: anything other than `"user"` is
      // classified as injected context rather than a chat bubble, which is why this can wake the
      // model without putting words in the reader's mouth. `form: "notice"` is the presentation.
      agent?.followup(createUserMessage({ content: [{ type: "text", text: WAKE_TEXT }], source: { kind: "dsh-generative-ui", form: "notice", summary: WAKE_SUMMARY } }));
    };
    return () => {
      wake = null;
    };
  });
  // Both routes only matter to a browser half that exists to consume them. Scoped rather than
  // required so the plugin still teaches the model on a profile with no web server at all —
  // `dsh --profile headless` has no `webServer`, and a required injection there means the
  // prompt and the skill go missing too, which is the whole plugin.
  //
  // `sessions` rides along because the canvas route needs it to authorize a workspace, and
  // cordis enforces injection at access time: reading `ctx.sessions` without declaring it
  // throws "cannot get property ... without inject" inside the request, which the host turns
  // into a bare 400. Declaring it here rather than in the static `inject` keeps the headless
  // profile working, same as the other two.
  ctx.inject(["webServer", "sessions"], (scoped) => {
    const file = wasmFile(import.meta.url);
    const liveWorkspaces = (): ReadonlySet<string> => {
      const sessions = (scoped as unknown as SessionStoreCtx).sessions.list();
      return new Set(sessions.flatMap((session) => (session.header.cwd === undefined ? [] : [session.header.cwd])));
    };
    scoped.effect(() => scoped.webServer.register({ kind: "prefix", path: ASSET_PREFIX, handler: (req, res) => serveAsset(req, res, file) }), "dsh-generative-ui: tsx wasm");
    scoped.effect(() => scoped.webServer.register({ kind: "exact", path: CANVAS_READ_PATH, handler: (req, res) => serveCanvas(liveWorkspaces, req, res) }), "dsh-generative-ui: canvas reads");
    // Beside the canvas route rather than under `fs`/`shell`/`llm`: reporting a broken card needs
    // nothing but a web server, and it is worth the least on the compositions that have the most
    // missing — a card whose capability module is absent is exactly the card that fails.
    scoped.effect(() => scoped.webServer.register({ kind: "exact", path: CARD_ERROR_PATH, handler: (req, res) => serveCardError(failures, () => wake, req, res) }), "dsh-generative-ui: card failures");
    // One level deeper again: a deployment can mount a web server without an LLM runtime, and
    // losing `$dsh/ai` there should not take the wasm and canvas routes down with it.
    // Same shape again: a deployment can serve the web without a sandboxed filesystem, and
    // losing `$dsh/fs` there should not cost the routes above it.
    scoped.inject(["fs", "sandboxPolicy"], (withFs) => {
      withFs.effect(() => withFs.webServer.register({ kind: "exact", path: FS_PATH, handler: (req, res) => serveFs(withFs as unknown as FsCtx, liveWorkspaces, req, res) }), "dsh-generative-ui: workspace files");
    });
    // And again for the shell: a host may compose a web server without a command executor — and
    // now also a host that has one but has not opted in. Both mean the same thing to a card, and
    // both are expressed the same way: no route.
    if (allowExec)
      scoped.inject(["shell", "sandboxPolicy"], (withShell) => {
        withShell.effect(() => withShell.webServer.register({ kind: "exact", path: EXEC_PATH, handler: (req, res) => serveExec(withShell as unknown as ExecCtx, liveWorkspaces, req, res) }), "dsh-generative-ui: commands");
      });
    // Same nesting as the rest: a host with no web capability loses `$dsh/web` and keeps
    // everything else. `dsh-base` composes `ctx.web` with `searchProvider: deepseek-official`.
    scoped.inject(["web"], (withWeb) => {
      withWeb.effect(() => withWeb.webServer.register({ kind: "exact", path: WEB_SEARCH_PATH, handler: (req, res) => serveWebSearch(withWeb as unknown as WebCtx, liveWorkspaces, req, res) }), "dsh-generative-ui: web search");
    });
    scoped.inject(["llm", "agentDefaultModel"], (withLlm) => {
      withLlm.effect(() => withLlm.webServer.register({ kind: "exact", path: AI_STREAM_PATH, handler: (req, res) => serveAi(withLlm as unknown as LlmCtx, liveWorkspaces, req, res) }), "dsh-generative-ui: model stream");
    });
  });
}

/**
 * Record or clear one session's failing card, and wake the model when the failure is news.
 *
 * `POST ?session=<id>` with `{message, phase}` to set it and `{}` to clear it. The detail never
 * comes back as a chat message — it becomes the `ui4a:card-failure` runtime context, which the
 * assembly re-reads each step. See `card-failure.ts` for why the two halves are split.
 *
 * The wake is looked up per request rather than captured: the agent registry is scoped, so the
 * function it hands out can go away while this route stays up, and a stale capture would call
 * into a disposed fiber.
 *
 * Exported for `test/card-error-route.test.ts`.
 */
export async function serveCardError(failures: CardFailures, wake: () => ((session: string) => void) | null, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return void res.writeHead(405).end();
  const url = new URL(req.url ?? "", "http://localhost");
  const session = url.searchParams.get("session");
  if (session === null || session === "") return void res.writeHead(400).end();

  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > MAX_BODY) return void res.writeHead(413).end();
  }
  let report: { message?: string; phase?: string };
  try {
    report = JSON.parse(body) as typeof report;
  } catch {
    return void res.writeHead(400).end();
  }

  // No message means the card recovered. Clearing is the whole point of routing this through
  // state instead of the transcript, so it is not an afterthought: without it the model keeps
  // reading about a card that has been fine for ten turns.
  if (report.message === undefined || report.message === "") {
    failures.clear(session);
  } else if (failures.set(session, { message: report.message, phase: report.phase ?? "compile" })) {
    // Only when the session went from healthy to failing. A settled card that fails re-renders on
    // every later frame of the transcript, and a turn per render is a loop the reader has to kill
    // — and a SECOND failure while the first is still open needs no nudge of its own, because the
    // notice says nothing but "read the context" and the context already holds the newer message.
    wake()?.(session);
  }
  res.writeHead(204).end();
}

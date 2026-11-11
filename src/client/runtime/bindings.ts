/**
 * The `$dsh/*` capability modules generated code may import.
 *
 * These are real TypeScript that lives in our bundle; generated code reaches them through
 * shared blob shims supplied through each renderer's import map. They are not document
 * import-map entries: `localImports` hands the URLs to `GenUIRenderer`'s own `importmap`.
 *
 * Filesystem, model, command and search calls reach plugin-owned Node routes; chat uses the
 * client conversation service, and persisted state uses localStorage without a host service.
 */
import { registryImports } from "./registry.ts";
import { AI_STREAM_PATH, EXEC_PATH, FS_PATH, WEB_SEARCH_PATH } from "../../contract-assets.ts";
import { capabilityModule } from "../../contract.ts";
import { registerRuntimeModules } from "./register.ts";
import { usePersistedState } from "./state.ts";

/** What the plugin's client half lends to generated code. Registered once, at apply. */
export type Ui4aHost = {
  /** Sends into the named owner; previews without an owner may use the current session. */
  send: (text: string, sessionId?: string) => void;
  /** Resolve the named session's current workspace; an unknown owner must return undefined. */
  cwd: (sessionId?: string) => string | undefined;
  /** The open session, so a write runs under the access mode the composer shows. */
  sessionId: () => string;
};

let host: Ui4aHost | null = null;

/**
 * Entropy captured once, before any generated code runs, and kept across HMR evaluations.
 *
 * `crypto.randomUUID` and `Math.random` are writable. Recapturing them on a reload would mean
 * capturing whatever a card left behind, making every later handle — and the next bridge key —
 * predictable. The holder is frozen and sealed under a fixed name; a card can read it but neither
 * replace it nor rewrite the functions on it.
 */
const ENTROPY_KEY = "__dsh_generative_ui_entropy__";
type Entropy = {
  uuid: (() => string) | undefined;
  random: () => number;
  define: typeof Object.defineProperty;
  create: typeof Object.create;
  entries: typeof Object.entries;
  keys: typeof Object.keys;
  values: typeof Object.values;
  objectURL: typeof URL.createObjectURL;
  blob: typeof Blob;
};
const entropy: Entropy = (() => {
  const existing = (globalThis as Record<string, unknown>)[ENTROPY_KEY] as Entropy | undefined;
  if (existing !== undefined) return existing;
  const crypto = globalThis.crypto;
  // `Object`'s methods are writable too, and a reload happens long after generated code has run —
  // so every intrinsic this module relies on is taken now, while the realm is still ours.
  // Plain `Object.*` here only: this branch runs on the first evaluation, before any generated
  // code exists. A reload takes the `existing` path above and never calls them.
  const fresh: Entropy = Object.freeze({
    uuid: crypto?.randomUUID?.bind(crypto),
    random: Math.random,
    define: Object.defineProperty,
    create: Object.create,
    entries: Object.entries,
    keys: Object.keys,
    values: Object.values,
    objectURL: URL.createObjectURL.bind(URL),
    blob: Blob,
  });
  Object.defineProperty(globalThis, ENTROPY_KEY, { value: fresh, writable: false, configurable: false, enumerable: false });
  return fresh;
})();
const { define, create, entries, keys, values, objectURL, blob } = entropy;
/**
 * An older build's holder has only the entropy and the two Object helpers. Minting with `undefined`
 * in place of `URL.createObjectURL` is a blank card; capturing them fresh at upgrade time would
 * mean capturing whatever a card left in the realm. So this fails closed instead: the capture
 * point is the property, and it can only happen before generated code runs. One page reload.
 */
export const intrinsicsReady = (holder: Partial<Entropy>): boolean => typeof holder.objectURL === "function" && typeof holder.blob === "function" && typeof holder.entries === "function" && typeof holder.keys === "function" && typeof holder.values === "function";
const requireIntrinsics = (): void => {
  if (intrinsicsReady(entropy)) return;
  throw new Error("[dsh-generative-ui] capability intrinsics predate this build; reload the page before rendering generated UI");
};

// Null-prototype tables, not `Map`: generated code shares this realm and can replace
// `Map.prototype.has`/`get`, which would make the capability check accept a caller-chosen token
// and hand back a victim's owner. With no prototype, `in` and `[]` dispatch nothing replaceable.
//
// The capability a shim carries is **its own `import.meta.url`**. Nothing secret is written into
// the shim's source, so intercepting the text of one tells you nothing, and the URL only becomes
// visible at the moment it is minted — which is why the minting intrinsics live in the entropy
// holder above rather than being looked up off the realm. A card can resolve its own shim through
// its own import map and get its own capability; nobody else's is obtainable that way.
const ownersByUrl: Record<string, string | undefined> = create(null);

const token = () => entropy.uuid?.() ?? `${Date.now().toString(36)}-${entropy.random().toString(36).slice(2)}`;

/** Named so the round trip can be tested against the real code rather than a copy of it. */
export function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function registerUi4aHost(next: Ui4aHost): () => void {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

/**
 * The capability surface, one group per `$dsh/<group>` module.
 *
 * A function rather than a constant so the host can be swapped (or torn down) without the
 * already-imported blob modules going stale — they close over `bind`, not over a host.
 */
/** What a synthesized shim imports. A handle it was minted with; anything else is refused. */
export function bindOwner(capability: string) {
  if (!(capability in ownersByUrl)) throw new Error("[dsh-generative-ui] no such capability");
  return bind(ownersByUrl[capability]);
}

export function bind(sessionId?: string) {
  const chat = {
    /**
     * Drives the next turn from inside a card. The text is what the user would have typed:
     * it lands in the transcript as their message, because a turn nobody can see arriving
     * reads as the app talking to itself.
     */
    sendMessage: (text: string) => {
      if (host === null) throw new Error("[dsh-generative-ui] no host bound");
      host.send(text, sessionId);
    },
  };
  const ai = {
    /**
     * Streams text from the app's own model, one piece per network chunk.
     *
     * Nothing here holds a credential: the Node half forwards to `ctx.llm`, which owns the
     * provider route and the keys. Reach for it when the *content* is the variable part —
     * the recipe, the five candidate names — and skip it when the data is genuinely fixed.
     */
    streamText: (options: Ui4aStreamOptions | string): AsyncIterable<string> => {
      if (host === null) throw new Error("[dsh-generative-ui] no host bound");
      const workspace = host.cwd(sessionId);
      if (workspace === undefined) throw new Error("[dsh-generative-ui] $dsh/ai needs a session workspace");
      const request = typeof options === "string" ? { prompt: options } : options;
      return streamFrom(workspace, request, request.signal);
    },
  };

  const fs = {
    /** The file's text. Throws when it does not exist or the session may not read it. */
    readFile: (path: string) => request<{ content: string }>("GET", path, undefined, undefined, sessionId).then((body) => body.content),
    /**
     * Directory entries: the name, whether it is a file or a directory, and a file's size.
     *
     * An array of objects rather than of names, because without `type` a card cannot draw a
     * tree — it would have to probe every entry with a second call to find out whether it
     * can be descended into. The host has all three already; we used to drop two of them.
     */
    readdir: (path: string) => request<{ entries: Ui4aDirEntry[] }>("GET", path, undefined, "list=1", sessionId).then((body) => body.entries),
    /**
     * The file's bytes, for anything that is not text.
     *
     * `readFile` decodes as UTF-8, so a .mid, a wav or a png read that way comes back with
     * every byte above 0x7f replaced by U+FFFD — corrupt, and silently so. Anything handed to
     * `decodeAudioData`, a MIDI parser or an image decoder has to come through here.
     */
    readBytes: (path: string) => request<{ base64: string }>("GET", path, undefined, "bytes=1", sessionId).then((body) => decodeBase64(body.base64)),
    /**
     * Writes the file, subject to the session's own access mode.
     *
     * Under `Read Only` this rejects exactly as the model's own `write` would — the fence
     * is the host's, not ours, so what a card may do never diverges from what the composer
     * says the session may do.
     */
    // `Promise<void>`, not the `Promise<undefined>` a bare `.then(() => undefined)` infers:
    // what a caller may do with the result is the contract, and `types/chat.d.ts` says void.
    writeFile: async (path: string, content: string): Promise<void> => {
      await request<{ written: string }>("POST", path, content, undefined, sessionId);
    },
  };

  const exec = {
    /**
     * Runs one command in the workspace and resolves with its output.
     *
     * A non-zero exit resolves rather than rejects: `git status` failing outside a repo is
     * something a card wants to show, not an outage. Only a failure to run at all rejects.
     * The session's own sandbox mode applies, so this is no wider than the model's own bash.
     */
    bash: (command: string, options?: { signal?: AbortSignal }): Promise<Ui4aExecResult> => {
      if (host === null) throw new Error("[dsh-generative-ui] no host bound");
      const workspace = host.cwd(sessionId);
      if (workspace === undefined) throw new Error("[dsh-generative-ui] $dsh/exec needs a session workspace");
      return execRequest(workspace, sessionId ?? host.sessionId(), command, options?.signal);
    },
  };

  const web = {
    /**
     * One web search, through whichever provider the host composed.
     *
     * Search only: `ctx.web` also does `fetch`, and this deployment turns that off for its own
     * tools because the local backend can reach private-network addresses. A card wanting a page
     * body should ask the user for it or search for a quotable source instead.
     */
    search: (query: string, options?: { maxResults?: number; signal?: AbortSignal }): Promise<Ui4aSearchResult> => {
      if (host === null) throw new Error("[dsh-generative-ui] no host bound");
      const workspace = host.cwd(sessionId);
      if (workspace === undefined) throw new Error("[dsh-generative-ui] $dsh/web needs a session workspace");
      return searchRequest(workspace, query, options);
    },
  };

  // No host behind this one — `localStorage` and React are both already in the page. It exists
  // because the model reaches for it unprompted: five of six habit-tracker runs wrote
  // `import { usePersistedState } from "$dsh/state"` against a module that did not exist, and a
  // reworded denial in the skill did not stop it. An unresolvable specifier takes the whole module
  // with it, so the card renders blank.
  const state = { usePersistedState };

  return { chat, ai, fs, exec, web, state };
}

/** What one search returns. Mirrors the seam's `WebSearchResult`, which is what the route forwards. */
export type Ui4aSearchResult = {
  /** A provider-generated answer or summary, when the provider makes one (Exa and DeepSeek do not). */
  content?: string;
  sources: readonly { url: string; title?: string; snippet?: string; publishedAt?: string }[];
  /** True when the seam cut `sources` down to the requested bound. */
  truncated: boolean;
};

async function searchRequest(cwd: string, query: string, options?: { maxResults?: number; signal?: AbortSignal }): Promise<Ui4aSearchResult> {
  const response = await fetch(`${WEB_SEARCH_PATH}?cwd=${encodeURIComponent(cwd)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, ...(options?.maxResults === undefined ? {} : { maxResults: options.maxResults }) }),
    signal: options?.signal,
  });
  const body = (await response.json().catch(() => ({}))) as Ui4aSearchResult & { error?: string };
  if (!response.ok) throw new Error(`[dsh-generative-ui] $dsh/web: ${body.error ?? response.statusText}`);
  return body;
}

/** Talks to the fs route, carrying the workspace and the session whose policy applies. */
async function request<T>(method: "GET" | "POST", path: string, content?: string, extra?: string, sessionId?: string): Promise<T> {
  if (host === null) throw new Error("[dsh-generative-ui] no host bound");
  const workspace = host.cwd(sessionId);
  if (workspace === undefined) throw new Error("[dsh-generative-ui] $dsh/fs needs a session workspace");
  const query = `cwd=${encodeURIComponent(workspace)}&session=${encodeURIComponent(sessionId ?? host.sessionId())}&path=${encodeURIComponent(path)}${extra === undefined ? "" : `&${extra}`}`;
  const response = await fetch(`${FS_PATH}?${query}`, content === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  // A denial is not an outage. Naming it lets the card say "this session is read-only"
  // rather than "something went wrong" — and `denied` carries that as a field, because the
  // alternative is every card string-matching our message, which then cannot be reworded.
  if (!response.ok) throw Object.assign(new Error(`[dsh-generative-ui] $dsh/fs ${path}: ${body.error ?? response.statusText}`), { code: body.error, denied: response.status === 403 });
  return body as T;
}

/** What a command left behind. `truncated` means the output was cut, not that it failed. */
export type Ui4aExecResult = { stdout: string; stderr: string; exitCode: number | null; signal: string | null; truncated: { stdout: boolean; stderr: boolean }; timedOut: boolean };

/** Talks to the exec route. Separate from `request` because the shape and the failure mode differ. */
async function execRequest(cwd: string, sessionId: string, command: string, signal?: AbortSignal): Promise<Ui4aExecResult> {
  const query = `cwd=${encodeURIComponent(cwd)}&session=${encodeURIComponent(sessionId)}`;
  // Aborting really kills the command: the route watches premature response-socket closure,
  // so dropping the request is what a polling card needs to not stack runs on a slow one.
  const response = await fetch(`${EXEC_PATH}?${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }), signal });
  const body = (await response.json().catch(() => ({}))) as Ui4aExecResult & { error?: string };
  if (!response.ok) throw new Error(`[dsh-generative-ui] $dsh/exec: ${body.error ?? response.statusText}`);
  return body;
}

/** One entry of a directory listing. `size` is absent for directories. */
export type Ui4aDirEntry = { name: string; type?: "file" | "directory"; size?: number };

/** One user turn plus an optional system prompt — see the route's note on why not more. */
export type Ui4aStreamOptions = { prompt: string; system?: string; signal?: AbortSignal };

/**
 * Decodes the route's plain-text stream into text chunks.
 *
 * Preserve multi-byte characters across network boundaries, yielding one decoded chunk rather
 * than forcing generated cards to re-render for every character.
 */
async function* streamFrom(cwd: string, request: Ui4aStreamOptions, signal?: AbortSignal): AsyncIterable<string> {
  // Aborting stops the model too, not just the reading: the route drops its own generation when
  // the request closes. A card that regenerates per keystroke needs that, or what the reader
  // ends up seeing is whichever of several in-flight calls happens to finish last.
  const response = await fetch(`${AI_STREAM_PATH}?cwd=${encodeURIComponent(cwd)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw new Error(`[dsh-generative-ui] $dsh/ai: ${response.status} ${response.statusText}`);
  if (response.body === null) throw new Error("[dsh-generative-ui] $dsh/ai: no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // `stream: true` so a multi-byte character split across chunks is not mangled — the
    // failure mode is a replacement character mid-word in any non-ASCII answer.
    //
    // `yield`, not `yield*`: spreading the string hands the consumer one character at a time,
    // which for a card that re-renders per piece is a setState per character. Measured on 560
    // characters of Chinese: 560 iterations spread, 27 by chunk, identical text either way.
    const text = decoder.decode(value, { stream: true });
    if (text !== "") yield text;
  }
}

/** Blob URLs are shared by surfaces with the same owner, never across different sessions. */
const cached: Record<string, Record<string, string>> = create(null);
/**
 * The internal blob is deliberately NOT in the module registry, so it is not in the document
 * import map nor in the map a renderer is handed. A generated card cannot write
 * `import { … } from "$dsh/internal"`; only our own shims name it, by literal blob URL.
 */
/**
 * The bridge a shim's blob reads. Named by a token this module minted, and sealed on first use.
 *
 * Both halves matter. Sealing alone is not enough: a card running before the blob evaluates could
 * put a wrapper under a well-known key and capture the handle a later session's shim passes
 * through. An unpredictable key cannot be pre-installed — and once this defineProperty runs the
 * property cannot be replaced either. Reading it is harmless: `bindOwner` still only resolves a
 * handle this module minted.
 *
 * A fresh key per module evaluation is what keeps HMR working: a reload mints another key and
 * seals another property, rather than tripping over the previous one.
 */
const INTERNAL_KEY = `__dsh_generative_ui_bind_${token()}`;
define(globalThis, INTERNAL_KEY, { value: bindOwner, writable: false, configurable: false, enumerable: false });
let internal: string | null = null;
const internalModule = (): string => {
  if (internal !== null) return internal;
  // Assembled with `+`, not `JSON.stringify`/`join`: this is module source, and a swapped-in
  // formatter is a way to inject code into someone else's surface.
  internal = objectURL(new blob(['export const bindOwner = globalThis["' + INTERNAL_KEY + '"];'], { type: "text/javascript" }));
  return internal;
};

export function bindingImports(sessionId?: string): Record<string, string> {
  requireIntrinsics();
  const key = sessionId ?? "";
  const existing = cached[key];
  if (existing !== undefined) return existing;
  // Built here rather than in `registerUi4aHost`: what the shims reach is `bindOwner`, which does
  // not depend on the host *value*. Hanging it off host registration meant a page with no host — a
  // preview, a harness, the first frame of a session, any profile without `conversation` — got
  // capability blobs importing an EMPTY internal module. The first mount reported
  // `Unresolvable imports` and every one after it rendered silently blank.
  const source = internalModule();
  const imports: Record<string, string> = {};
  const bound = bind();
  // Enumerated from `bind()`, not from a list beside it: a group added to the implementation and
  // missed here would simply have no blob module, and a card importing it renders blank with
  // nothing in the console — the failure mode this project spends the most effort on.
  //
  // Every step below avoids a realm-controlled call. `entries`/`keys` are the captured ones and
  // the loops are index loops, so a live capability object never reaches a function a card can
  // replace — that would hand it `bind()`'s unowned surface, which resolves to whichever session
  // is selected. The source is assembled with `+` for the same reason: a swapped-in `join` or
  // `map` is code injection into another surface's module.
  const groups = entries(bound);
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g][0];
    const names = keys(groups[g][1]);
    // One `export const` per name: ESM export names must be statically visible. The capability is
    // the shim's own URL, read in the shim itself — no secret is written into the body.
    let body = 'import { bindOwner } from "' + source + '";\nconst g = bindOwner(import.meta.url).' + group + ";\n";
    for (let n = 0; n < names.length; n += 1) body += "export const " + names[n] + " = g." + names[n] + ";\n";
    body += "export default g;";
    const url = objectURL(new blob([body], { type: "text/javascript" }));
    ownersByUrl[url] = sessionId;
    imports[capabilityModule(group)] = url;
  }
  cached[key] = imports;
  return imports;
}

export function releaseBindings(): void {
  const owners = values(cached);
  for (let i = 0; i < owners.length; i += 1) {
    const urls = values(owners[i]);
    for (let j = 0; j < urls.length; j += 1) URL.revokeObjectURL(urls[j]);
  }
  const cachedKeys = keys(cached);
  for (let i = 0; i < cachedKeys.length; i += 1) delete cached[cachedKeys[i]];
  const ownedUrls = keys(ownersByUrl);
  for (let i = 0; i < ownedUrls.length; i += 1) delete ownersByUrl[ownedUrls[i]];
  if (internal !== null) {
    URL.revokeObjectURL(internal);
    internal = null;
  }
}

/**
 * Every module generated code can import without reaching the network: the shell's React
 * family, plus the `$dsh/*` capabilities.
 *
 * Exported from the plugin's client entry as well, so `bun run smoke` can build the blob
 * modules and parse them. They are synthesized strings that nothing type-checks, and a
 * syntax error in one fails the way an unresolvable import does — the whole module graph
 * dies and the card renders blank with no console error.
 */
export function localImports(sessionId?: string): Record<string, string> {
  registerRuntimeModules();
  return { ...registryImports(), ...bindingImports(sessionId) };
}

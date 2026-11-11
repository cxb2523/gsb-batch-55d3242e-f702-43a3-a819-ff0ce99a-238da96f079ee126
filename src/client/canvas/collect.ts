/**
 * Finds canvases in the transcript's tool calls.
 *
 * The model writes `ui4a/canvases/<id>.ui4a.tsx` with the host's ordinary file tools — no
 * bespoke tool, no new session event, nothing for the node half to do. `argsRaw` grows
 * token by token while the call streams, which is what makes a canvas render as it is
 * written (the same "streaming from tool arguments" contract as ui4a-playground).
 *
 * Parsing has to survive half a JSON object. Rather than depend on a partial-JSON parser
 * for two fields, the two we need are pulled out directly: the path decides whether this
 * is a canvas at all, and the content is a JSON string literal we can decode up to
 * wherever the stream currently ends.
 */
import { owningCanvasIdOf } from "../../contract.ts";

/** One canvas as the transcript describes it: its id, the body the last write carried, and whether that write is still going. */
export type Canvas = { id: string; code: string; streaming: boolean };

/**
 * A call is classified by the SHAPE of its arguments, never by the tool's name.
 *
 * Enumerating names would mean a canvas silently stops rendering the day the host adds or
 * renames a file tool — no error, no stale marker, just an invisible no-op. What actually
 * matters is answerable from the arguments alone: does this call name a canvas path, and
 * does it carry the whole file or only a patch of it.
 */
const PATH_KEYS = ["path", "file_path", "filename", "file", "target_file"];

/**
 * Keys that carry a whole file body.
 *
 * Deliberately excludes the patch-shaped keys (`old_str`/`new_str`, `old_string`/
 * `new_string`, `diff`, `patch`): a call carrying one of those changes the canvas without
 * describing it, so the file on disk becomes the only correct source. `str_replace_editor`
 * is exactly this case — its `new_str` is the replacement snippet, not the file, and
 * treating it as a body replaces the whole canvas with a few lines.
 */
const CONTENT_KEYS = ["content", "contents", "text", "file_text"];

/**
 * Keys that mean "this call changed the file without saying what it now contains".
 *
 * The counterpart to CONTENT_KEYS, and the thing that separates an edit from a read: both
 * name a canvas path and neither carries a body, so without this a plain `read` would mark
 * the canvas stale and — for a canvas this session never wrote — open a panel the user
 * never asked for, just for looking at the file.
 */
const PATCH_KEYS = ["old_str", "new_str", "old_string", "new_string", "diff", "patch", "edits", "replacements"];

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };

/**
 * The value of whichever key appears EARLIEST in the arguments, from complete JSON or a
 * truncated prefix of it.
 *
 * Earliest position rather than first-in-`keys`: a file body routinely contains the
 * literal text of another candidate key (a canvas that renders the word `"content"`, say),
 * and scanning key by key would find that occurrence inside the body and decode the rest
 * of the body as if it were the value — silently rendering a fragment as the whole canvas.
 * The real key can only precede its own value, so the leftmost hit is the right one.
 */
function readString(argsRaw: string, keys: readonly string[]): string | undefined {
  let at = -1;
  let key: string | undefined;
  for (const candidate of keys) {
    const found = argsRaw.indexOf(`"${candidate}"`);
    if (found !== -1 && (at === -1 || found < at)) {
      at = found;
      key = candidate;
    }
  }
  if (key === undefined) return undefined;
  const colon = argsRaw.indexOf(":", at + key.length + 2);
  if (colon === -1) return undefined;
  const quote = argsRaw.indexOf('"', colon + 1);
  if (quote === -1) return undefined;
  // Walk the string literal by hand: it may simply stop mid-escape while streaming.
  let out = "";
  for (let i = quote + 1; i < argsRaw.length; i += 1) {
    const char = argsRaw[i];
    if (char === "\\") {
      const escape = argsRaw[i + 1];
      if (escape === undefined) return out;
      if (escape === "u") {
        const hex = argsRaw.slice(i + 2, i + 6);
        // A \u escape cut in half by the stream carries no character yet; the next frame has it.
        if (hex.length < 4) return out;
        out += String.fromCharCode(Number.parseInt(hex, 16) || 0);
        i += 5;
        continue;
      }
      out += ESCAPES[escape] ?? escape;
      i += 1;
      continue;
    }
    if (char === '"') return out;
    out += char;
  }
  return out;
}

export type ToolCallView = { name: string; argsRaw: string; settled: boolean };

/**
 * One call in the tree a `tool-call` node owns.
 *
 * A running call carries its arguments inline; a settled one wraps them in `call`. Either
 * may own `subCalls` — `run_code` dispatches the file tools as children, so a canvas
 * written from inside a code block is nested rather than top-level.
 */
export type CallBlock = {
  kind?: string;
  name?: string;
  argsRaw?: string;
  call?: { name?: string; argsRaw?: string };
  subCalls?: readonly CallBlock[];
};

/** The call's own identity, ignoring its children. */
function viewOf(block: CallBlock): ToolCallView | null {
  const name = block.call?.name ?? block.name;
  const argsRaw = block.call?.argsRaw ?? block.argsRaw;
  if (name === undefined || argsRaw === undefined) return null;
  // `tool-result` is the settled shape; anything else is still running.
  return { name, argsRaw, settled: block.kind === "tool-result" };
}

/**
 * Every call a `tool-call` node contains, parents before children.
 *
 * Flattening rather than reading only the root is what lets a canvas written through
 * `run_code` (or any other dispatching tool) be found: the write is a sub-call, and the
 * root's own arguments are the code that ran, not the file.
 */
export function toolCallsOf(data: unknown): ToolCallView[] {
  const root = (data as { root?: CallBlock } | undefined)?.root;
  if (root === undefined) return [];
  const found: ToolCallView[] = [];
  const walk = (block: CallBlock) => {
    const view = viewOf(block);
    if (view !== null) found.push(view);
    for (const child of block.subCalls ?? []) walk(child);
  };
  walk(root);
  return found;
}

/**
 * Latest canvas per id, in first-seen order.
 * @param calls - every tool call in the transcript, oldest first.
 */
export type CollectedCanvases = {
  canvases: Canvas[];
  /**
   * Canvases whose newest change was a patch, mapped to how many patches they have seen.
   * The count is a cache version: the caller re-reads the file when it changes, and
   * reuses what it already has when it does not.
   */
  stale: Map<string, number>;
};

export function collectCanvases(calls: readonly ToolCallView[]): CollectedCanvases {
  const byId = new Map<string, Canvas>();
  const stale = new Map<string, number>();
  for (const call of calls) {
    // Reads name a canvas too; only a call that writes one is interesting.
    const path = readString(call.argsRaw, PATH_KEYS);
    if (path === undefined) continue;
    const id = owningCanvasIdOf(path);
    if (id === null) continue;
    const code = readString(call.argsRaw, CONTENT_KEYS);
    const isWrite = code !== undefined && code !== "";

    if (!isWrite) {
      // A patch changed the file without describing it, so the body on disk is now the only
      // correct source. A call with neither a body nor a patch only read it — leave it alone.
      const patches = PATCH_KEYS.some((key) => call.argsRaw.includes(`"${key}"`));
      if (patches && call.settled) stale.set(id, (stale.get(id) ?? 0) + 1);
      continue;
    }
    // A later write to the same id replaces the earlier one; insertion order is kept.
    byId.delete(id);
    byId.set(id, { id, code, streaming: !call.settled });
    // A whole-file write supersedes every patch before it.
    stale.delete(id);
  }
  // An edit to a canvas never written in this session still deserves a panel.
  for (const id of stale.keys()) if (!byId.has(id)) byId.set(id, { id, code: "", streaming: false });
  return { canvases: [...byId.values()], stale };
}

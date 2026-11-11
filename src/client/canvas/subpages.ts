/**
 * Rewrites a canvas's relative imports into blob URLs, before the source is compiled.
 *
 * `src/prompt.ts` tells the model that a canvas's sub-pages live in `<id>/` and are imported
 * with relative paths, and the model does exactly that. But a card is imported as a blob URL,
 * and `blob:` is not a hierarchical scheme — the browser rejects `./tarot/deck` with
 * "Invalid relative url or base scheme isn't hierarchical" before any import map is consulted,
 * so `setImportMap` cannot help. Measured: an import map keyed on the relative specifier fails
 * identically, because resolution against the importer's URL happens first.
 *
 * Replacing the specifier with the child's own blob URL removes the question: an absolute URL
 * has no base to resolve against. Children may import their siblings, which works for the same
 * reason once they too have been rewritten.
 */
import { useEffect, useState } from "react";
import { canvasPath } from "../../contract.ts";
import { compiler } from "../runtime/GenUISurface.tsx";
import type { Canvas } from "./collect.ts";
import { readCanvasChild } from "./read.ts";
import { localImports } from "../runtime/bindings.ts";
/**
 * Matches the specifier of a static import or re-export; the second capture is the specifier.
 *
 * NOT global, and that is load-bearing. It was `/g`, shared by all three call sites, and `.test`
 * on a global regex leaves `lastIndex` past the match it found — so `importsSibling` returning
 * TRUE made the very next `matchAll` on the same string return ZERO. That is the order
 * the body calls them in: ask whether there are sibling imports, then go resolve them. The
 * panel found none to resolve and the card rendered without its sub-pages.
 *
 * `matchAll` requires `/g`, so it gets its own copy; the shared one stays sticky-free and no
 * caller has to remember to reset anything.
 */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*)["'](\.[^"']*)["']/;
const SPECIFIER_ALL = new RegExp(SPECIFIER, "g");

/**
 * Whether the card imports a sibling at all — the cheap question `useSubPages` asks before
 * paying for a resolve pass. It had its own copy of the regex, identical but for the `g` flag;
 * a widening applied to one and not the other means the panel never calls `inlineSubPages` and
 * the card silently renders without its sub-pages. Sharing one pattern fixed that and introduced
 * the `lastIndex` bug above — hence two derived regexes rather than two literals.
 */
export const importsSibling = (code: string) => SPECIFIER.test(code);

/**
 * @param read fetches one child by its specifier, returning its source and the real filename
 * it was found under — the compiler picks its syntax from the extension, and a specifier is
 * written without one, so passing the specifier makes a `.ts` file fail to parse.
 * @param compile turns one child's TSX into JS. Children go through the same compiler as the
 * card, so a sub-page may be TSX and may itself import a sibling.
 * @param urls collects every blob created, so the caller can revoke them with the surface.
 */
export async function inlineSubPages(code: string, entry: string, read: (specifier: string, from: string) => Promise<{ source: string; filename: string } | null>, compile: (filename: string, source: string) => Promise<string>, urls: string[]): Promise<string> {
  // Keyed by the RESOLVED filename, never by the specifier: `./types` written in two different
  // child files is two different targets, and a specifier-keyed map silently serves the first
  // one to both. Measured on a real split — the model gives every child a sibling import.
  const sources = new Map<string, { source: string; filename: string; specifiers: Map<string, string> }>();
  const missing = new Set<string>();

  const specifiersIn = (source: string) => new Set([...source.matchAll(SPECIFIER_ALL)].map((match) => match[2]));

  // Collected breadth-first, then compiled in one pass. Resolving a child's own imports
  // *during* its fetch deadlocks on a cycle — a imports b imports a, and each awaits the
  // other's URL forever. Measured: it hung. Reading every reachable child first, and only
  // then handing out URLs, has no such wait.
  let frontier: { specifier: string; from: string }[] = [...specifiersIn(code)].map((specifier) => ({ specifier, from: entry }));
  const entryTargets = new Map<string, string>();
  while (frontier.length > 0) {
    const bodies = await Promise.all(frontier.map(async (want) => [want, await read(want.specifier, want.from)] as const));
    const next: { specifier: string; from: string }[] = [];
    for (const [want, found] of bodies) {
      const targets = want.from === entry ? entryTargets : sources.get(want.from)?.specifiers;
      if (found === null) {
        missing.add(want.specifier);
        continue;
      }
      targets?.set(want.specifier, found.filename);
      if (sources.has(found.filename)) continue;
      sources.set(found.filename, { ...found, specifiers: new Map() });
      for (const specifier of specifiersIn(found.source)) next.push({ specifier, from: found.filename });
    }
    frontier = next;
  }

  // A blob's contents are fixed at creation, so a child can only be minted once every sibling
  // it imports already has a URL. Repeat until nothing moves: a cycle never becomes mintable
  // and keeps its original specifiers, failing exactly as it does today rather than hanging.
  const urlFor = new Map<string, string>();
  for (const filename of sources.keys()) urlFor.set(filename, "");

  // Rewrites through `SPECIFIER_ALL`, not `replaceAll`, so only an actual import position moves.
  // A bare `replaceAll("./board")` also rewrites the string in `const label = "./board"` — the
  // card then renders a blob URL as its label, or passes one where a path was meant. No corpus
  // card does this today; the regex that finds the imports already knows the difference, so
  // there is no reason to throw that away when putting them back.
  const rewrite = (source: string, specifiers: Map<string, string>) =>
    source.replace(SPECIFIER_ALL, (whole, lead: string, specifier: string) => {
      const url = urlFor.get(specifiers.get(specifier) ?? "");
      return url === undefined || url === "" ? whole : `${lead}${JSON.stringify(url)}`;
    });

  for (let progress = true; progress;) {
    progress = false;
    const ready = [...sources].filter(([filename, found]) => urlFor.get(filename) === "" && [...found.specifiers.values()].every((dep) => urlFor.get(dep) !== ""));
    const built = await Promise.all(ready.map(async ([filename, found]) => [filename, await compile(filename, rewrite(found.source, found.specifiers))] as const));
    for (const [filename, compiled] of built) {
      const url = URL.createObjectURL(new Blob([compiled], { type: "text/javascript" }));
      urlFor.set(filename, url);
      urls.push(url);
      progress = true;
    }
  }

  return rewrite(code, entryTargets);
}

/**
 * Whether this canvas needs the sub-page pass at all. Extracted from the effect because the
 * mutation audit could not constrain it there — flipping `streaming` or dropping the
 * `importsSibling` check survived every test, and both are load-bearing: resolving mid-stream
 * inlines a prefix that the next frame supersedes, and a canvas with no sibling imports would
 * pay a compile per frame to produce the code it already had.
 *
 * The `undefined` checks stay in the effect: a type predicate narrows only one parameter, and
 * moving them here would cost the compiler its knowledge that `cwd` and `id` are strings after.
 */
export const needsResolve = (code: string, streaming: boolean | undefined): boolean => !streaming && importsSibling(code);

/**
 * Revoke every blob URL in a list, exactly once each.
 *
 * Both callers hand it the SAME array — the disposer, and the resolve that lands after it. The
 * array is filled by `inlineSubPages` as it goes, so the two can see different lengths, and a
 * URL revoked twice is harmless while one revoked never is a leak per edit. Emptying the list
 * as it goes makes the pair idempotent regardless of which runs first or what arrived between.
 */
export const revokeAll = (urls: string[]): void => {
  while (urls.length > 0) URL.revokeObjectURL(urls.pop()!);
};

/**
 * Rewrites a canvas's relative sub-page imports into blob URLs before it is compiled.
 *
 * Only for a settled canvas: mid-stream the sibling files are usually not written yet, and a
 * canvas does not stream under the default PTC mode anyway (see CLAUDE.md §3.6). Until the
 * rewrite lands the original source is rendered, which fails exactly as it does today rather
 * than blanking a canvas that was working.
 */
type ResolvedSubPages = { cwd: string; id: string; source: string; code: string };

/**
 * Whether a rewrite is still the answer for what is being rendered.
 *
 * Matched by workspace and exact source, so equal-length edits never reuse an older rewrite.
 */
export const resolvedSubPageCode = (resolved: ResolvedSubPages | null, cwd: string | undefined, id: string, source: string) => (resolved !== null && resolved.cwd === cwd && resolved.id === id && resolved.source === source ? resolved.code : source);

export function useSubPages(cwd: string | undefined, canvas: Canvas | undefined, sessionId?: string) {
  const [resolved, setResolved] = useState<ResolvedSubPages | null>(null);
  // Destructured so the effect depends on scalars: the caller rebuilds `canvas` on every
  // sweep, and depending on the object would re-run the whole resolve for an unchanged canvas.
  const id = canvas?.id;
  const code = canvas?.code;
  const streaming = canvas?.streaming;

  useEffect(() => {
    if (cwd === undefined || id === undefined || code === undefined || !needsResolve(code, streaming)) return;
    let live = true;
    const urls: string[] = [];
    // Children compile against the owning session's import map, so they reach the same `$dsh/*`
    // shims the card itself does.
    const compile = async (filename: string, source: string) => (await compiler().compile(source, { filename, importMap: { imports: localImports(sessionId) } })).code;
    void inlineSubPages(code, canvasPath(id), (specifier, from) => readCanvasChild(cwd, id, specifier, from), compile, urls)
      .then((next) => {
        // Resolved after teardown: nobody will ever render these, so revoke them here — the
        // disposer already ran and cannot see urls the pass appended after it.
        if (!live) return void revokeAll(urls);
        setResolved({ cwd, id, source: code, code: next });
      })
      .catch((error: unknown) => {
        revokeAll(urls);
        if (live) console.error("[dsh-generative-ui] could not resolve canvas sub-pages", error);
      });
    return () => {
      live = false;
      // This pass owns its blobs for exactly as long as its rewrite can answer — no longer. A
      // rewrite whose state update was discarded (unmount before commit, or a later pass winning
      // the same batch) therefore still releases them: ownership is the effect's, not the state's.
      revokeAll(urls);
      // And it stops answering on the way out. The source can edit away and back (A -> B -> A), in
      // which case the older rewrite still matches by source while its blobs are already gone.
      setResolved(null);
    };
  }, [cwd, id, code, streaming, sessionId]);

  if (id === undefined || code === undefined) return "";
  return resolvedSubPageCode(resolved, cwd, id, code);
}

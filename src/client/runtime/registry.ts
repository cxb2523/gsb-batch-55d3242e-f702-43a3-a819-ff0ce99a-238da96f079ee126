/**
 * Generated TSX is imported as a blob URL, so an import map's targets must be real
 * URLs. Vite hosts can point at `/src/lib/react.ts`; dsh plugin bundles have no
 * such "source is a URL" escape hatch (and CJS factories have no `import.meta`).
 *
 * So this goes the other way round: register the module namespaces the shell has
 * already loaded, then synthesize, per specifier, a blob module that reads the
 * table and named-re-exports it. Export names are enumerated at runtime, so there
 * is no hand-written list to drift. React is a singleton for free — everyone
 * imports the same blob URL, and that URL reads the shell's instance.
 * (Ported from ui4a-playground/src/runtime/registry.ts.)
 */
const REGISTRY_KEY = "__DSH_GENERATIVE_UI_MODULES__";
type Registry = Record<string, Record<string, unknown>>;

const registry: Registry = ((globalThis as Record<string, unknown>)[REGISTRY_KEY] ??= {}) as Registry;
// Captured at module load, before any generated code runs: a card that wrapped the realm's
// `URL.createObjectURL` would otherwise see every blob this module mints — including the
// capability shims, whose URLs are the capability.
const objectURL = URL.createObjectURL.bind(URL);
const BlobCtor = Blob;
const urls = new Map<string, string>();

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Exported for `test/registry.test.ts`: it generates code, so a bug here is a blank card with an empty console. */
export function buildModuleSource(specifier: string): string {
  const namespace = registry[specifier] ?? {};
  const lines = [`const ns = globalThis[${JSON.stringify(REGISTRY_KEY)}][${JSON.stringify(specifier)}];`];
  // One `export const` per name rather than a spread: ESM export names must be statically visible.
  // Freezing getters into consts is safe here — every registered namespace is a settled module.
  for (const name of Object.keys(namespace)) {
    if (name !== "default" && IDENTIFIER.test(name)) lines.push(`export const ${name} = ns[${JSON.stringify(name)}];`);
  }
  lines.push("default" in namespace ? "export default ns.default;" : "export default ns;");
  return lines.join("\n");
}

export function registerModules(modules: Record<string, Record<string, unknown>>): void {
  for (const [specifier, namespace] of Object.entries(modules)) {
    // Re-registering the same namespace must keep the URL. The document import map is
    // installed once and points at these blobs for the tab's life, so revoking one leaves
    // every esm.sh package resolving `react` to a dead URL — the module graph dies and the
    // card renders blank with nothing in the console. Only a genuine hot-swap invalidates.
    if (registry[specifier] === namespace) continue;
    registry[specifier] = namespace;
    // A namespace that really changed: the old blob would re-export stale bindings.
    const stale = urls.get(specifier);
    if (stale !== undefined) {
      URL.revokeObjectURL(stale);
      urls.delete(specifier);
    }
  }
}

export function moduleUrl(specifier: string): string {
  const cached = urls.get(specifier);
  if (cached !== undefined) return cached;
  const url = objectURL(new BlobCtor([buildModuleSource(specifier)], { type: "text/javascript" }));
  urls.set(specifier, url);
  return url;
}

export const registryImports = (): Record<string, string> => Object.fromEntries(Object.keys(registry).map((specifier) => [specifier, moduleUrl(specifier)]));

/** Drops every synthesized blob. The plugin's dispose path must call this or each HMR round leaks one URL per specifier. */
export function disposeRegistry(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

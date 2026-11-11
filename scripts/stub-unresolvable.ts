/**
 * Rewrites the imports a card makes that this process cannot resolve.
 *
 * Its own module, not part of `paint-cards.ts`, because that file paints every reference card at
 * module level — importing it for this one function ran the whole check as a side effect, in the
 * test suite and anywhere else that wanted it.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The capability groups with a generated stub, read from the directory rather than listed here.
 *
 * A hand-written list went stale the moment `$dsh/state` was added: the card importing it was
 * reported as `skipped`, which reads exactly like a card using a package this process cannot
 * resolve — a silent hole in the one check that proves a reference card renders. The generator
 * writes one `.js` per group, so the directory IS the list.
 */
const STUBBED = new Set(
  readdirSync(resolve(import.meta.dir, "../types/standalone"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.slice(0, -3)),
);

export const stubUnresolvable = (source: string): string =>
  source
    .replaceAll(/(["'])\$dsh\/([\w-]+)\1/g, (whole, quote: string, group: string) => (STUBBED.has(group) ? `${quote}${resolve(import.meta.dir, `../types/standalone/${group}.js`)}${quote}` : whole))
    // `lucide-react` is icons and nothing else, so a Proxy returning an empty <svg> for any
    // name renders it faithfully enough for this check — and keeps a reference card from being
    // silently skipped in `bun run check`, which is the failure this whole script exists for.
    .replaceAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g, (_whole, names: string) =>
      names
        .split(",")
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim(),
        )
        .filter(Boolean)
        .map((n) => `const ${n} = () => null;`)
        .join(" "),
    )
    // `partial-json` parses a HALF-arrived JSON string; on a complete one it is `JSON.parse`,
    // and a first synchronous render only ever sees the initial state. 22 corpus cards import
    // it, and stubbing it faithfully is the difference between checking them and skipping them.
    //
    // `recharts` (51 cards) is deliberately NOT stubbed. A stub renders a chart as nothing,
    // which would make this check PASS a card showing a blank chart — a false negative is worse
    // than an honest skip, and the skip is counted.
    .replaceAll(/import\s*\{([^}]*)\}\s*from\s*["']partial-json["']/g, () => "const parse = (s) => { try { return JSON.parse(s) } catch { return undefined } }; const Allow = new Proxy({}, { get: () => 0 });");

/**
 * A real multi-file canvas, resolved the way the panel and the server actually do it.
 *
 * Nothing exercised this before, which is how a `lastIndex` bug that dropped EVERY sibling
 * import shipped: the unit tests each passed one hand-written specifier, and the shape that
 * broke needed two calls on the same string in production's order.
 *
 * The fixture is unretouched output — six files, one entry importing five sub-pages by
 * `./<id>/<name>`, and four of those importing `./ui` and `./data` as siblings of each other.
 * That second form is the one a bare filename in `from` silently rejects.
 */
import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { canvasChildPath } from "../src/contract.ts";
import { importsSibling, inlineSubPages } from "../src/client/canvas/subpages.ts";
import { compileCard, initTsxFromDisk } from "../scripts/tsx-node.ts";
import { stubUnresolvable } from "../scripts/stub-unresolvable.ts";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

const ROOT = `${import.meta.dir}/fixtures/canvas`;
const ID = "project-dashboard";
const ENTRY_PATH = `.dsh/ui4a/canvases/${ID}.ui4a.tsx`;

// The fixture lives beside this file rather than under a `.dsh` tree, so the contract's paths
// are mapped back onto it — the contract is still what decides which specifiers are legal.
const onDisk = (rel: string) => `${ROOT}/${rel.replace(`.dsh/ui4a/canvases/`, "")}`;

test("every file of a real multi-file canvas is inlined", async () => {
  await initTsxFromDisk();
  const entry = readFileSync(`${ROOT}/${ID}.ui4a.tsx`, "utf8");
  expect(importsSibling(entry)).toBe(true);

  const rejected: string[] = [];
  const urls: string[] = [];
  let minted = 0;
  const real = URL.createObjectURL;
  URL.createObjectURL = () => `blob:e2e/${(minted += 1)}`;
  try {
    const out = await inlineSubPages(
      entry,
      ENTRY_PATH,
      async (specifier, from) => {
        const path = canvasChildPath(ID, specifier, from);
        if (path === null) {
          rejected.push(`${specifier} from ${from}`);
          return null;
        }
        // The extension order and the full-path `filename` both mirror `src/index.ts`: `from`
        // must be the path the server resolved, not the bare basename, or a child's sibling
        // import resolves into another canvas's directory and is refused.
        for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
          if (existsSync(onDisk(path + suffix))) return { source: readFileSync(onDisk(path + suffix), "utf8"), filename: path + suffix };
        }
        return null;
      },
      async (filename, source) => compileCard(filename, source).code,
      urls,
    );
    expect(rejected).toEqual([]);
    expect(urls).toHaveLength(6);
    // The point of the whole pass: nothing relative survives into the browser, where it would
    // resolve to nothing and the canvas would render blank.
    expect(out.match(/from ["']\.[^"']*["']/g)).toBeNull();
  } finally {
    URL.createObjectURL = real;
  }
});

test("a child's sibling import needs the resolved path, not the basename", () => {
  const childDir = `.dsh/ui4a/canvases/${ID}`;
  expect(canvasChildPath(ID, "./ui", `${childDir}/Overview.tsx`)).toBe(`${childDir}/ui`);
  // What a bare filename does — and it fails silently, as null, exactly like a missing file.
  expect(canvasChildPath(ID, "./ui", "Overview.tsx")).toBeNull();
});

/**
 * A canvas is one card spread over files, and a screen asks a question about a CARD.
 *
 * `Tasks.tsx` writes `outline: "none"` and defines no replacement, so `NO-FOCUS-RING` fires on
 * it alone — correctly, for the file. The entry defines `button:focus-visible` once for every
 * sub-page, so the canvas is fine and the finding is noise. Screening a sub-page in isolation
 * asks the question of the wrong unit.
 *
 * `cardsIn` is non-recursive, so no gate does this today. This test is what makes that a
 * decision rather than an accident: a checker taught to walk canvases must concatenate first.
 */
test("a screen answers for the whole canvas, not one of its files", async () => {
  const { SCREENS } = await import("../scripts/screens.ts");
  const child = readFileSync(`${ROOT}/${ID}/Tasks.tsx`, "utf8");
  expect(SCREENS["NO-FOCUS-RING"](child)).toBe(true);

  const whole = [readFileSync(`${ROOT}/${ID}.ui4a.tsx`, "utf8"), child].join("\n");
  expect(SCREENS["NO-FOCUS-RING"](whole)).toBe(false);
});

/**
 * And it paints. Compiling proves the imports resolved; only rendering proves the canvas is a
 * card rather than six files that happen to typecheck.
 *
 * Children are inlined as `data:` URLs rather than `blob:` — same bytes, and importable outside
 * a browser, which `blob:` is not.
 *
 * One sub-page imports `recharts`, which `stubUnresolvable` deliberately leaves alone: a stubbed
 * chart renders as nothing, so stubbing it would make this test PASS a canvas showing a blank
 * chart. That page is dropped from the render instead — an honest hole rather than a false
 * negative, the same trade `paint-cards.ts` makes when it reports a skip.
 */
test("the resolved canvas renders", async () => {
  await initTsxFromDisk();
  const real = URL.createObjectURL;
  URL.createObjectURL = (blob: Blob) => `data:text/javascript;base64,${Buffer.from(Bun.peek(blob.text()) as string).toString("base64")}`;
  try {
    const out = await inlineSubPages(
      readFileSync(`${ROOT}/${ID}.ui4a.tsx`, "utf8"),
      ENTRY_PATH,
      async (specifier, from) => {
        const path = canvasChildPath(ID, specifier, from);
        if (path === null) return null;
        for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
          if (!existsSync(onDisk(path + suffix))) continue;
          const source = stubUnresolvable(readFileSync(onDisk(path + suffix), "utf8"));
          return { source: source.includes(`from "recharts"`) ? "export default () => null;" : source, filename: path + suffix };
        }
        return null;
      },
      async (filename, source) => compileCard(filename, source).code,
      [],
    );
    const { code } = compileCard("canvas.tsx", stubUnresolvable(out));
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const html = renderToString(createElement(mod.default as () => ReactNode));
    expect(html.replace(/<[^>]*>/g, "").trim().length).toBeGreaterThan(0);
  } finally {
    URL.createObjectURL = real;
  }
});

/**
 * `scripts/paint-cards.ts` paints every reference card at module level, so importing it for one
 * helper ran the whole check as a side effect — silently, inside the test suite. The helper lives
 * in `stub-unresolvable.ts` now; this keeps it there.
 *
 * The general hazard: a script that DOES something on import cannot also be a library. Guarding
 * with `import.meta.main` would work too, but a separate module says it in the file layout.
 */
test("importing the stub helper does not run a paint check", async () => {
  const source = readFileSync(`${import.meta.dir}/../scripts/stub-unresolvable.ts`, "utf8");
  expect(source).not.toContain("renderToString");
  expect(source).not.toContain("process.exit");
  // And nothing in test/ reaches for the script that does. Assembled rather than written out,
  // so this file does not match its own check.
  const forbidden = `from "../scripts/${"paint"}-cards.ts"`;
  for (const name of readdirSync(import.meta.dir).filter((n) => n.endsWith(".test.ts"))) {
    expect(readFileSync(`${import.meta.dir}/${name}`, "utf8")).not.toContain(forbidden);
  }
});

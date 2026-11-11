/**
 * That a retry actually reaches the network.
 *
 * The module registry caches a failed `import()` as a rejection for the page's lifetime, so
 * re-importing the same URL never re-fetches — measured in Chromium, 2 resource entries for 3
 * imports. `GenUISurface`'s retry therefore has to change the URL, and this holds the rule that
 * makes that work.
 *
 * A real browser is not needed for the part that can regress: the busting is a pure string
 * transform, and the property that matters is that consecutive attempts produce **different**
 * URLs for esm.sh entries and **identical** ones for local blobs.
 *
 * Imported, not re-declared. A test that copies the transform it guards only proves two copies
 * agree — which is how `compiler.test.ts` stayed green through six real mutations.
 */
import { describe, expect, test } from "bun:test";
import { bustFetchedImports, dispatchError, shouldRetry, unbundleFetchedImports } from "../src/client/runtime/GenUISurface.tsx";

const bust = (url: string, attempt: number) => bustFetchedImports({ x: url }, attempt).x;

describe("retry URL busting", () => {
  test("consecutive attempts produce different URLs", () => {
    const url = "https://esm.sh/recharts?target=es2022";
    expect(bust(url, 1)).not.toBe(bust(url, 2));
    expect(bust(url, 1)).not.toBe(url);
  });

  // A specifier with no query gets `?`, one with a query gets `&` — an esm.sh URL carrying
  // `?target=es2022&ui4a-retry=1` is what the fix actually sends, and `??` would 400.
  test("the separator matches what the URL already has", () => {
    expect(bust("https://esm.sh/minimatch", 1)).toBe("https://esm.sh/minimatch?ui4a-retry=1");
    expect(bust("https://esm.sh/recharts?target=es2022", 1)).toBe("https://esm.sh/recharts?target=es2022&ui4a-retry=1");
  });

  // Local blob URLs are minted fresh per render and must not be touched: appending a query to a
  // blob URL makes it unresolvable, which would break every card instead of fixing one.
  test("blob and relative URLs are left alone", () => {
    for (const url of ["blob:http://localhost:5173/8f2c-…", "/_ui4a/tsx_bg.wasm"]) expect(bust(url, 3)).toBe(url);
  });
});

/**
 * When a retry is worth doing at all.
 *
 * Retrying busts the esm.sh URLs and re-imports, which fixes exactly one thing: a dependency
 * that failed to arrive. `partial-react` reports that as the **compile** phase —
 * `importCompiledComponent` runs inside the compile `catch` (`runtime.ts:338`). The same
 * message from the render phase is the card's own `fetch` throwing inside its body, where
 * re-importing changes nothing and the three attempts cost the reader 2.4s of blank surface
 * before anyone tells them what happened. The phase check had been missing.
 */
describe("shouldRetry", () => {
  test("a dependency that failed to load is retried", () => {
    expect(shouldRetry("Failed to fetch", "compile", false, 0)).toBe(true);
    expect(shouldRetry("NetworkError when attempting to fetch resource.", "compile", false, 2)).toBe(true);
  });

  test("the same message from the card's own body is not", () => {
    expect(shouldRetry("Failed to fetch", "render", false, 0)).toBe(false);
    expect(shouldRetry("Failed to fetch", "transform", false, 0)).toBe(false);
  });

  test("a real code error is never retried", () => {
    expect(shouldRetry("item.difficulty is undefined", "compile", false, 0)).toBe(false);
  });

  // While streaming the next frame re-delivers on its own, and a retry would replace the
  // growing buffer with a stale prefix.
  test("a streaming surface is not retried", () => {
    expect(shouldRetry("Failed to fetch", "compile", true, 0)).toBe(false);
  });

  test("the attempts run out", () => {
    expect(shouldRetry("Failed to fetch", "compile", false, 3)).toBe(false);
  });
});

/**
 * The backoff has to outlast an esm.sh COLD BUILD, which is the failure it exists for.
 *
 * Measured 2026-08-26 on a package esm.sh had never built: **2.27s cold, 0.50s warm** for the
 * same URL. The old linear 0.4/0.8/1.2 spent 2.4s across all three attempts, so every one of
 * them landed inside a single unfinished build and the card reported `failed to fetch
 * dynamically imported module` for a package that resolves fine seconds later — seen twice in
 * one real session on `@headlessui/react`.
 *
 * So the property under test is a total, not a shape: three attempts must span comfortably more
 * than a cold build. Asserted as a floor rather than exact values, because the constants may be
 * retuned and only the floor is the reason they exist.
 */
test("three retries outlast an esm.sh cold build", () => {
  const waits: number[] = [];
  let attempts = 0;
  for (let i = 0; i < 3; i++) {
    dispatchError("retry", {
      attempts: () => attempts,
      setAttempts: (n) => {
        attempts = n;
      },
      schedule: (ms) => waits.push(ms),
      report: () => {
        throw new Error("must not report while retrying");
      },
    });
  }
  expect(waits).toHaveLength(3);
  // Strictly increasing: a flat or shrinking backoff spends its budget before the build finishes.
  expect(waits[1]).toBeGreaterThan(waits[0]!);
  expect(waits[2]).toBeGreaterThan(waits[1]!);
  // 2.27s was the measured cold build; leave real headroom above it.
  expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThan(8000);
});

// esm.sh serves two builds and only one of them can fail on its own: `?bundle` runs esbuild over
// the package's whole tree, and a version skew inside it is a hard 500. Measured on `mermaid`,
// three attempts, deterministic — the bundled URL answers `500 esbuild: No matching export in
// "node_modules/d3/src/index.js" for import "curveBumpX"` while the plain one answers 200. So a
// retry that only busts the query re-requests the identical broken artefact, and the card stays
// blank with nothing in the console.
describe("unbundleFetchedImports", () => {
  test("drops bundle and KEEPS external", () => {
    // The `external` list is what makes esm.sh emit a bare `import … from "react"` for the import
    // map to resolve onto the host's single instance. Dropping it here gave the package esm.sh's
    // own React and killed working cards with `Minified React error #31` — a far worse failure
    // than the bundle-side 500 this retry exists to route around, and one that only shows up on
    // the SECOND attempt. Asserted as an exact string so a future "simplification" cannot quietly
    // widen it back.
    expect(unbundleFetchedImports({ x: "https://esm.sh/mermaid?bundle&target=es2022&external=react,react-dom,scheduler" }).x).toBe("https://esm.sh/mermaid?target=es2022&external=react%2Creact-dom%2Cscheduler");
  });

  test("leaves a blob URL alone", () => {
    // Appending to a `blob:` URL makes it unresolvable, which breaks every card rather than one.
    const blob = "blob:http://localhost/abc-123";
    expect(unbundleFetchedImports({ x: blob }).x).toBe(blob);
  });

  test("leaves an already-unbundled entry byte-identical", () => {
    // Shared-instance packages (three, react-reconciler) are served unbundled ON PURPOSE so their
    // constructors match a dependent's. Re-serialising one is how that identity would be lost.
    const three = "https://esm.sh/three?target=es2022";
    expect(unbundleFetchedImports({ x: three }).x).toBe(three);
  });

  test("busting composes on top of it", () => {
    const once = unbundleFetchedImports({ x: "https://esm.sh/mermaid?bundle&target=es2022" });
    expect(bustFetchedImports(once, 2).x).toBe("https://esm.sh/mermaid?target=es2022&ui4a-retry=2");
  });
});

import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { resolvedSubPageCode, useSubPages } from "../src/client/canvas/subpages.ts";

test("only the workspace and source revision may reuse resolved sub-pages", () => {
  const source = 'import A from "./a";';
  const changed = 'import B from "./b";';
  expect(source.length).toBe(changed.length);
  const resolved = { cwd: "/one", id: "card", source, code: 'import A from "blob:a";' };
  expect(resolvedSubPageCode(resolved, "/one", "card", source)).toBe(resolved.code);
  expect(resolvedSubPageCode(resolved, "/one", "card", changed)).toBe(changed);
  expect(resolvedSubPageCode(resolved, "/two", "card", source)).toBe(source);
  expect(resolvedSubPageCode(resolved, "/one", "other", source)).toBe(source);
  expect(resolvedSubPageCode(null, "/one", "card", changed)).toBe(changed);
});

/**
 * `useSubPages` decides whether a canvas's source is rendered as written or rewritten with its
 * sibling imports resolved to blob URLs. Its guards were unconstrained: the mutation audit could
 * see them but nothing exercised them, because they live inside a hook inside a component.
 *
 * `renderToString` reaches the render path (effects do not run, which is exactly right here — the
 * question is what the FIRST paint shows while the resolve is still in flight).
 */
// The hook's return value comes back through the rendered markup rather than a captured
// variable: assigning to an outer `let` during render is the side effect lint rightly rejects,
// and a `<script type="application/json">` carries the string out untouched.
const render = (cwd: string | undefined, canvas: unknown) => {
  const Probe = () => createElement("script", { type: "application/json" }, useSubPages(cwd, canvas as never));
  const html = renderToString(createElement(Probe));
  // React escapes text content; undo it so the assertion compares the source, not its markup.
  return html
    .replace(/^<script type="application\/json">|<\/script>$/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");
};

test("no canvas yields nothing to render", () => {
  expect(render("/w", undefined)).toBe("");
});

test("a canvas with no code yields nothing", () => {
  expect(render("/w", { id: "a" })).toBe("");
});

/**
 * The property the whole hook exists for: until the rewrite lands, the ORIGINAL source renders.
 * Returning "" here instead would blank a canvas that was working, on every sweep, for as long
 * as the resolve takes.
 */
test("before the rewrite lands, the original source is what renders", () => {
  const code = `import Chart from "./chart.tsx";\nexport default () => <Chart/>;`;
  expect(render("/w", { id: "a", code })).toBe(code);
});

test("a canvas with no sibling imports renders as written", () => {
  const code = `export default () => <b>hi</b>;`;
  expect(render("/w", { id: "a", code })).toBe(code);
});

test("no cwd still renders the source rather than blanking", () => {
  const code = `export default () => <b>hi</b>;`;
  expect(render(undefined, { id: "a", code })).toBe(code);
});

/**
 * `canvasChildPath` and `owningCanvasIdOf` — where a relative import inside a card resolves.
 *
 * `routes.test.ts` says "`canvasChildPath` is unit-tested"; it was not. Two conditions had no
 * test that would notice them going, and both are the fence: one decides that a sibling-form
 * specifier written beside the entry must open with the canvas id, the other decides whether a
 * path is under the contract at all. Removing either widens what a route will read.
 */
import { expect, test } from "bun:test";
import { CANVAS_DIR, canvasChildDir, canvasChildPath, canvasPath, isCanvasId, owningCanvasIdOf } from "../src/contract.ts";

const id = "deck";

test("a specifier beside the entry file must open with the canvas id", () => {
  expect(canvasChildPath(id, "./deck/board")).toBe(`${canvasChildDir(id)}/board`);
  // Without the id it names nothing: the entry writes `./<id>/…`, so `./board` alone would
  // resolve into another canvas's directory if the leading segment were not checked.
  expect(canvasChildPath(id, "./board")).toBeNull();
  expect(canvasChildPath(id, "./other/board")).toBeNull();
});

// Written beside a CHILD, the id never appears — the sibling form is the whole point of `from`.
test("a specifier beside a child file resolves as a sibling", () => {
  expect(canvasChildPath(id, "./types", `${canvasChildDir(id)}/board.tsx`)).toBe(`${canvasChildDir(id)}/types`);
  expect(canvasChildPath(id, "./types", `${canvasChildDir(id)}/nested/board.tsx`)).toBe(`${canvasChildDir(id)}/nested/types`);
});

// The entry is the other base. Named explicitly it must behave exactly like the omitted form,
// and it must not be mistaken for a child file that merely happens to start with the id.
test("the entry file is a base whether named or omitted", () => {
  expect(canvasChildPath(id, "./deck/board", undefined)).toBe(`${canvasChildDir(id)}/board`);
  expect(canvasChildPath(id, "./deck/board", canvasPath(id))).toBe(`${canvasChildDir(id)}/board`);
  expect(canvasChildPath(id, "./deck/board", "deck.ui4a.tsx")).toBe(`${canvasChildDir(id)}/board`);
  // The bare id names the child directory, not a file inside it.
  expect(canvasChildPath(id, "./deck", canvasPath(id))).toBeNull();
});

// Every form that is not a plain `./` relative path is refused before any arithmetic happens.
test("absolute, bare, empty and backslash specifiers are refused", () => {
  for (const specifier of ["/etc/passwd", "../../secret", "types", "./", ".", "./deck//board", "./deck/board/", "./deck/../secret", "C:/w/x", String.raw`.\types`, String.raw`C:\w\x`]) {
    expect(canvasChildPath(id, specifier, canvasPath(id))).toBeNull();
  }
});

// A Chinese canvas id is a path segment too: the exclusion is separators and dots, not ASCII.
test("a Chinese id resolves for both bases", () => {
  const chinese = "背单词";
  expect(isCanvasId(chinese)).toBe(true);
  expect(canvasChildPath(chinese, `./${chinese}/types`)).toBe(`${CANVAS_DIR}/${chinese}/types`);
  expect(canvasChildPath(chinese, "./types", `${CANVAS_DIR}/${chinese}/board.tsx`)).toBe(`${CANVAS_DIR}/${chinese}/types`);
});

// `..` is rejected outright rather than normalised, so there is no arithmetic to defeat.
test("traversal is rejected rather than normalised", () => {
  expect(canvasChildPath(id, "./deck/../../secret")).toBeNull();
  expect(canvasChildPath(id, "./deck/..", `${canvasChildDir(id)}/board.tsx`)).toBeNull();
  expect(canvasChildPath("../etc", "./x")).toBeNull();
  // `from` is a query parameter too, so its own segments get the same treatment.
  expect(canvasChildPath(id, "./types", `${canvasChildDir(id)}/../secret`)).toBeNull();
  expect(canvasChildPath(id, "./types", `${canvasChildDir(id)}/nested/../../secret`)).toBeNull();
});

test("a path outside the canvases directory owns no canvas", () => {
  expect(owningCanvasIdOf(`/w/${CANVAS_DIR}/deck.ui4a.tsx`)).toBe(id);
  expect(owningCanvasIdOf(`/w/${CANVAS_DIR}/deck/board.tsx`)).toBe(id);
  expect(owningCanvasIdOf("/w/.dsh/ui4a/notes/deck.tsx")).toBeNull();
  expect(owningCanvasIdOf("/etc/passwd")).toBeNull();
});

/**
 * The `from` parameter is attacker-controlled too.
 *
 * The traversal tests above vary the *specifier*, which is the obvious half. `from` reaches the
 * same function from the same route, and it is used to locate the child directory by splitting
 * on it — so a `from` naming another canvas, an absolute path outside the workspace, or a
 * Windows path is worth stating rather than assuming. Every case either resolves inside this
 * canvas's own directory or returns null; none escapes.
 */
test("no `from` can move the resolution out of the canvas directory", () => {
  const root = canvasChildDir(id);
  const cases = [
    `${CANVAS_DIR}/other/board.tsx`, // another canvas's child
    `/etc/${root}/x.tsx`, // absolute, outside the workspace
    `C:\\w\\${root.replaceAll("/", "\\")}\\board.tsx`, // a Windows path
    `/w/${root}/nested/${root}/board.tsx`, // the root appearing twice
    root, // naming the directory rather than a file in it
    "",
  ];
  for (const from of cases) {
    const resolved = canvasChildPath(id, "./types", from);
    expect(resolved === null || resolved.startsWith(`${root}/`)).toBe(true);
  }
});

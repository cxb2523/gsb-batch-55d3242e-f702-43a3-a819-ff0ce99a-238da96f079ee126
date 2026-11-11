import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { compileSettled, initTsxFromDisk } from "../scripts/tsx-node.ts";

await initTsxFromDisk();

/**
 * A negative control proves its screen FIRES. That is not the same as proving the card is broken,
 * and the difference bit today: a control written for `MISSING-REACT-IMPORT` used a hook the
 * repair pass silently supplies, so the screen fired on a card that rendered perfectly — the
 * screen was wrong and the control agreed with it.
 *
 * The controls below claim a defect that stops the card rendering at all. Each must actually
 * throw or paint nothing, checked by rendering it. The rest of `cards-negative/` describe style,
 * accessibility and behaviour defects — a stripped focus ring renders fine and is still wrong —
 * and are deliberately not listed.
 */
const FATAL = ["blank-render.tsx", "destructured-ref.tsx", "exported-module-hook.tsx", "glob-in-jsx.tsx", "hook-not-imported.tsx", "jsx-subscript-attrs.tsx", "missing-memo.tsx", "missing-suspense.tsx", "module-scope-hook.tsx", "shadowed-const.tsx"];

const paints = (name: string) => {
  const src = readFileSync(`${import.meta.dir}/cards-negative/${name}`, "utf8");
  try {
    const { code } = compileSettled(name, src);
    const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    return import(url)
      .then((mod) => {
        if (typeof mod.default !== "function") return false;
        const html = renderToString(createElement(mod.default));
        return html.replace(/<[^>]*>/g, "").trim().length > 0 || html.length > 40;
      })
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
};

for (const name of FATAL) {
  test(`${name} really does fail to render`, async () => {
    expect(await paints(name)).toBe(false);
  });
}

test("every card listed as fatal exists", () => {
  const present = new Set(readdirSync(`${import.meta.dir}/cards-negative`));
  expect(FATAL.filter((name) => !present.has(name))).toEqual([]);
});

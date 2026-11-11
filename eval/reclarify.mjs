// Did a CLARIFICATION surface again later in the conversation?
//
// `later_card` counts any card at turn 3+, and a card there is often a result display — a diagram
// the reader asked for, a table of what was decided. The goal asks for something narrower: a new
// fork appearing deep in the conversation should get its own way to answer, the same way the first
// one did. So this counts a card at turn index >= 2 that OFFERS A CHOICE: two or more sibling
// controls wired to the same setter, or a <select>, or a radio group.
//
// Read off the stored sources, not the harness, so it applies to rounds already on disk.
//
//   node eval/reclarify.mjs <round-dir> [<round-dir> ...]
import { parse } from "@babel/parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const nm = (n) => n?.openingElement?.name?.name ?? n?.name?.name ?? "";

/** The setter an onClick calls, if it calls exactly one. */
function setterOf(el) {
  const on = (el.openingElement?.attributes ?? []).find((a) => a.type === "JSXAttribute" && a.name?.name === "onClick");
  const body = on?.value?.expression?.body;
  const call = body?.type === "CallExpression" ? body : (body?.body ?? []).map((x) => x.expression).find((x) => x?.type === "CallExpression");
  return call?.callee?.name ?? call?.callee?.property?.name ?? null;
}

function offersChoice(src) {
  let ast;
  try {
    ast = parse(src, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript"] });
  } catch {
    return false;
  }
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n.type !== "string") return;
    if (n.type === "JSXElement") {
      const kids = n.children.filter((c) => c.type === "JSXElement");
      if (kids.some((k) => nm(k) === "select")) found = true;
      const radios = kids.filter((k) => nm(k) === "input" && (k.openingElement.attributes ?? []).some((a) => a.type === "JSXAttribute" && a.name?.name === "type" && a.value?.value === "radio"));
      if (radios.length >= 2) found = true;
      const btns = kids.filter((k) => nm(k) === "button");
      if (btns.length >= 2) {
        const setters = btns.map(setterOf).filter(Boolean);
        // Same setter from two or more siblings = they are alternatives, not a toolbar.
        if (setters.length >= 2 && new Set(setters).size < setters.length) found = true;
      }
    }
    for (const k in n) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c));
      else if (v && typeof v === "object" && typeof v.type === "string") walk(v);
    }
  };
  walk(ast.program);
  return found;
}

for (const root of process.argv.slice(2)) {
  let runs = 0,
    early = 0,
    late = 0,
    lateChoice = 0;
  for (const a of readdirSync(root)) {
    const ad = join(root, a);
    if (!statSync(ad).isDirectory() || a === "plugin") continue;
    for (const b of readdirSync(ad)) {
      const bd = join(ad, b);
      if (!statSync(bd).isDirectory()) continue;
      const files = readdirSync(bd).filter((f) => /^turn-\d+\..*\.tsx$|^turn-\d+\.fence\d+\.tsx$/.test(f));
      if (!files.length) continue;
      runs++;
      let e = false,
        l = false,
        lc = false;
      for (const f of files) {
        const turn = Number(f.slice(5, 7));
        const choice = offersChoice(readFileSync(join(bd, f), "utf8"));
        if (turn <= 1) {
          e ||= true;
        } else {
          l ||= true;
          if (choice) lc ||= true;
        }
      }
      if (e) early++;
      if (l) late++;
      if (lc) lateChoice++;
    }
  }
  const name = root.split("/").pop();
  console.log(`${name}: 出过卡的 run ${runs}；第 3 轮后出过卡 ${late} (${((100 * late) / runs).toFixed(0)}%)；` + `其中带选择的 ${lateChoice} (${((100 * lateChoice) / Math.max(late, 1)).toFixed(0)}% of late, ${((100 * lateChoice) / runs).toFixed(0)}% of runs)`);
}

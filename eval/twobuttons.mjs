// Does a card that faces a plain binary choice answer it with two plain buttons?
//
// The rule: "The options speak for themselves (yes/no, this file or that one) — the click IS the
// answer. Two plain buttons, no card around them, `sendMessage` on click. Nothing to preview."
// Measured once by a throwaway script (1 of 211, recorded in `docs/measurements-log.md`) and never
// since, because **the corpus could not supply the population**: you cannot tell from a card
// whether the fork it answered was a plain binary or one that needed explaining, and that judgement
// is the whole rule.
//
// `binary-forks` supplies it. Every fork in that case is designed to have exactly two
// self-explanatory answers ("要不要保持旧链接" — 要 / 不要), so within it the population is every
// card, and a card that is NOT two plain buttons is the defect. That is why this reads one case
// rather than the round: the same detector pointed at `db-choice` would be counting cards that are
// correctly heavier than two buttons.
//
// Written before r007's data existed, deliberately. A detector built after the fact is one tuned
// to the numbers it is meant to judge.
//
//   node eval/twobuttons.mjs <round-dir> [--case=binary-forks] [--show]
import { parse } from "@babel/parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CLICKABLE = /^(button|a)$/i;
// Anything that is not a click: a binary answer needs neither.
const RICH = /^(input|select|textarea|canvas|svg|video|audio|iframe|table)$/i;

const nameOf = (n) => n?.openingElement?.name?.name ?? n?.name?.name ?? "";

function classOf(open) {
  for (const a of open?.attributes ?? []) {
    if (a.type !== "JSXAttribute" || a.name?.name !== "className") continue;
    const v = a.value;
    if (v?.type === "StringLiteral") return v.value;
    const e = v?.type === "JSXExpressionContainer" ? v.expression : null;
    if (e?.type === "TemplateLiteral") return e.quasis.map((q) => q.value.cooked ?? "").join(" ");
  }
  return "";
}

/** A wrapper that draws a box: the "no card around them" half of the rule. */
const isChrome = (cls) => /\b(border|rounded|shadow|bg-(layer|card|surface|elevated))\b/.test(cls);

function inspect(src) {
  const ast = parse(src, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript"] });
  let buttons = 0,
    rich = 0,
    chrome = 0,
    sends = 0;
  const walk = (n) => {
    if (n?.type === "JSXElement") {
      const nm = nameOf(n);
      if (CLICKABLE.test(nm)) buttons++;
      if (RICH.test(nm)) rich++;
      if (nm === "div" && isChrome(classOf(n.openingElement))) chrome++;
    }
    if (n?.type === "Identifier" && n.name === "sendMessage") sends++;
    for (const k in n) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c));
      else if (v && typeof v === "object" && v.type) walk(v);
    }
  };
  walk(ast.program);
  return { buttons, rich, chrome, sends };
}

const root = process.argv[2];
const wanted = (process.argv.find((a) => a.startsWith("--case=")) ?? "--case=binary-forks").split("=")[1];
const dir = join(root, wanted);
let total = 0,
  plain = 0,
  failed = 0;
const rows = [];
for (const model of statSync(dir, { throwIfNoEntry: false }) ? readdirSync(dir) : []) {
  const md = join(dir, model);
  if (!statSync(md).isDirectory()) continue;
  for (const f of readdirSync(md)) {
    if (!f.endsWith(".tsx")) continue;
    total++;
    let r;
    try {
      r = inspect(readFileSync(join(md, f), "utf8"));
    } catch {
      failed++;
      continue;
    }
    // The shape the rule asks for: exactly two clickables, both wired to send, nothing to preview,
    // and no box drawn around them.
    const ok = r.buttons === 2 && r.sends > 0 && r.rich === 0 && r.chrome === 0;
    if (ok) plain++;
    rows.push({ model, f, ...r, ok });
  }
}

if (!total) {
  console.log(`${root.split("/").pop()}: 用例 ${wanted} 还没有卡片`);
} else {
  console.log(`${root.split("/").pop()} · ${wanted}: ${total} 张卡片`);
  console.log(`  两个朴素按钮、点击即答案  ${plain} = ${((100 * plain) / total).toFixed(1)}%` + (failed ? `；解析失败 ${failed} 张` : ""));
  // Printed because a rate alone cannot say WHICH half of the rule was missed, and the two want
  // different fixes: too many controls is "you built a form for a yes/no", chrome is "you wrapped
  // it in a card the rule says not to".
  const why = { 控件多于两个: 0, 有需要预览的东西: 0, 包了一层卡片: 0, "没有 sendMessage": 0 };
  for (const r of rows.filter((r) => !r.ok)) {
    if (r.buttons !== 2) why["控件多于两个"]++;
    if (r.rich) why["有需要预览的东西"]++;
    if (r.chrome) why["包了一层卡片"]++;
    if (!r.sends) why["没有 sendMessage"]++;
  }
  for (const [k, v] of Object.entries(why)) if (v) console.log(`    ${k.padEnd(18)} ${v}`);
  if (process.argv.includes("--show")) {
    for (const r of rows.filter((r) => !r.ok).slice(0, 8)) console.log(`  ${r.model}/${r.f}  按钮=${r.buttons} 富控件=${r.rich} 卡片层=${r.chrome} send=${r.sends}`);
  }
}

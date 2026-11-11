// Deepest chain of JSX ancestors that each repeat the box recipe, read off the REAL AST.
//
// Two cheaper methods were tried first and both were wrong, in opposite directions:
//
//   a regex tag stack — cannot tell `<div ... />` from `<div ...>` across a multi-line attribute
//     list, and a pop that never happens leaves a phantom ancestor for the rest of the file. It
//     reported 7 on a file whose real depth is 3.
//   indentation — inflates through every `{cond ? (…) : (…)}` and `.map(x => (…))`, because those
//     add indentation without adding DOM nesting. It called the two branches of one ternary an
//     ancestor and its descendant.
//
// Both numbers reached a shipped prompt before either was checked. The AST cannot be fooled by
// either shape: `JsxElement` nesting IS the DOM nesting.
//
//   node eval/nesting.mjs <round-dir>            → one line per file: depth, path
//   node eval/nesting.mjs <round-dir> --deepest  → the deepest chain, class by class
//   node eval/nesting.mjs <round-dir> --grounds  → same walk, counting bg-* grounds instead of boxes
import { parse } from "@babel/parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { nonMutatingSort } from "../scripts/non-mutating-sort.mjs";

const GROUNDS = process.argv.includes("--grounds");
const BOX = (c) => (GROUNDS ? /\bbg-(page|layer|layer-2|layer-3)\b/.test(c) : (/\bborder\b|\bborder-[a-z]/.test(c) || c.includes("bg-layer")) && /\brounded/.test(c) && /\bp[xytrbl]?-/.test(c));

function classOf(open) {
  for (const a of open.attributes ?? []) {
    if (a.type !== "JSXAttribute" || a.name?.name !== "className") continue;
    const v = a.value;
    if (v?.type === "StringLiteral") return v.value;
    const e = v?.type === "JSXExpressionContainer" ? v.expression : null;
    if (e?.type === "TemplateLiteral") return e.quasis.map((q) => q.value.cooked ?? "").join(" ");
    if (e?.type === "StringLiteral") return e.value;
  }
  return "";
}

/** Walk the AST, carrying the chain of box-recipe JSX ancestors. Only JSXElement nesting extends
 *  it — a ternary branch, a `.map` callback and a fragment are all just expressions in between. */
function deepest(src) {
  const ast = parse(src, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript"] });
  let best = [];
  const walk = (node, chain) => {
    if (!node || typeof node.type !== "string") return;
    let next = chain;
    if (node.type === "JSXElement") {
      const cls = classOf(node.openingElement);
      if (BOX(cls)) {
        next = [...chain, cls];
        if (next.length > best.length) best = next;
      }
    }
    for (const k in node) {
      if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c, next));
      else if (v && typeof v === "object" && typeof v.type === "string") walk(v, next);
    }
  };
  walk(ast.program, []);
  return best;
}

const root = process.argv[2];
const files = [];
for (const a of readdirSync(root)) {
  const ad = join(root, a);
  if (!statSync(ad).isDirectory() || a === "plugin") continue;
  for (const b of readdirSync(ad)) {
    const bd = join(ad, b);
    if (!statSync(bd).isDirectory()) continue;
    for (const f of readdirSync(bd)) if (f.endsWith(".tsx")) files.push(join(bd, f));
  }
}
let best = { n: 0 };
const hist = {};
const failed = [];
for (const f of files) {
  let chain;
  try {
    chain = deepest(readFileSync(f, "utf8"));
  } catch (e) {
    failed.push([f, e.message.split("\n")[0]]);
    continue;
  }
  hist[chain.length] = (hist[chain.length] ?? 0) + 1;
  if (chain.length > best.n) best = { n: chain.length, f, chain };
}
const total = Object.values(hist).reduce((a, b) => a + b, 0);
const deep = Object.entries(hist)
  .filter(([k]) => +k >= 4)
  .reduce((a, [, v]) => a + v, 0);
console.log(`${files.length} 张卡片；链长≥4（祖先超过两个）${deep} 张 = ${((100 * deep) / total).toFixed(1)}%；最深 ${best.n}`);
if (failed.length) console.log(`解析失败 ${failed.length} 张 — 例: ${failed[0][1]}`);
console.log(`深度分布 ${JSON.stringify(Object.fromEntries(nonMutatingSort(Object.entries(hist), (a, b) => a[0] - b[0])))}`);
if (process.argv.includes("--deepest")) {
  console.log(`\n最深: ${best.f}`);
  best.chain.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
}

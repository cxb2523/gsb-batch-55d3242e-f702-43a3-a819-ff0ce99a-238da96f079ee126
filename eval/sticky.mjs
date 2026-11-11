// Does a card have the shape the sticky rule is about, and does it pin?
//
// The DENOMINATOR here disagrees with the one in `skill.ts` — this finds the shape in 78% of
// r003+r004's cards where the original sweep said 46% — and the disagreement is not resolved. Both
// are proxies for "something the reader still wants once they are deep in the list", and this one
// is the looser of the two: `isSteering` accepts any element carrying `font-medium`, which a row
// label satisfies as easily as a heading does. That is left alone deliberately. The read this
// script exists for is the PIN RATE ACROSS ROUNDS, and a proxy that is wrong the same way in every
// round still measures the change; tightening it now would reset the series to chase a number that
// is not the one being read.
//
// The shape: a list long enough to scroll — a `.map(…)` returning JSX — with something above it in
// the same parent that the reader still wants once they are inside the list: a heading, an input, a
// button row, a count. Detected off the syntax tree because "above" is a sibling relationship and a
// regex has no siblings; the sticky number is the one read that decides whether r005's main rule
// landed, so it should not rest on a proxy that cannot see order.
//
//   node eval/sticky.mjs <round-dir> [--show]
import { parse } from "@babel/parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HEADING = /^(h[1-6]|label|legend)$/i;
const CONTROL = /^(input|select|button|textarea)$/i;

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
const nameOf = (n) => n?.openingElement?.name?.name ?? n?.name?.name ?? "";

/** Does this subtree contain a heading, a form control, or text that reads as a title? */
function isSteering(node) {
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n.type !== "string") return;
    const nm = nameOf(n);
    if (HEADING.test(nm) || CONTROL.test(nm)) {
      found = true;
      return;
    }
    const cls = n.type === "JSXElement" ? classOf(n.openingElement) : "";
    if (/\bfont-(semibold|bold|medium)\b/.test(cls) || /\btext-(sm|base|lg|xl)\b.*\bfont-/.test(cls)) found = true;
    for (const k in n) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c));
      else if (v && typeof v === "object" && typeof v.type === "string") walk(v);
    }
  };
  walk(node);
  return found;
}

/** Does this child RENDER a list — `{items.map(…)}` anywhere inside it, not only at its top?
 *
 *  Requiring the `.map()` to be the heading's direct sibling was the first version and it found 13
 *  of 411 where the corpus has hundreds: almost every card wraps its rows in a `space-y-2` div, so
 *  the list the reader scrolls is a grandchild, not a sibling. What has to be a sibling is the
 *  CONTAINER, which is what the walk below checks. */
function rendersList(node) {
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n.type !== "string") return;
    if (n.type === "CallExpression" && n.callee?.property?.name === "map") {
      const body = n.arguments[0]?.body;
      if (body && (body.type === "JSXElement" || body.type === "JSXFragment" || JSON.stringify(body).includes('"JSXElement"'))) {
        found = true;
        return;
      }
    }
    for (const k in n) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c));
      else if (v && typeof v === "object" && typeof v.type === "string") walk(v);
    }
  };
  walk(node);
  return found;
}

/** Is `sticky` set anywhere in this subtree? */
function hasSticky(node) {
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n.type !== "string") return;
    if (n.type === "JSXElement" && /\bsticky\b/.test(classOf(n.openingElement))) {
      found = true;
      return;
    }
    for (const k in n) {
      if (k === "loc") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c));
      else if (v && typeof v === "object" && typeof v.type === "string") walk(v);
    }
  };
  walk(node);
  return found;
}

function inspect(src) {
  const ast = parse(src, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript"] });
  let shape = false,
    pinned = false;
  const walk = (n) => {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "JSXElement") {
      const kids = n.children.filter((c) => !(c.type === "JSXText" && !c.value.trim()));
      const at = kids.findIndex(rendersList);
      // Something ABOVE the list, in the same parent. Index order IS document order.
      const above = at > 0 ? kids.slice(0, at).filter((k) => k.type === "JSXElement") : [];
      if (above.some(isSteering)) {
        shape = true;
        if (above.some(hasSticky)) pinned = true;
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
  return { shape, pinned };
}

/** Per-run tallies, keyed `case/model`, so two rounds can be read paired. */
function scan(root) {
  const runs = new Map();
  let failed = 0;
  for (const a of readdirSync(root)) {
    const ad = join(root, a);
    if (!statSync(ad).isDirectory() || a === "plugin") continue;
    for (const b of readdirSync(ad)) {
      const bd = join(ad, b);
      if (!statSync(bd).isDirectory()) continue;
      let shaped = 0,
        pinned = 0,
        cards = 0;
      for (const f of readdirSync(bd)) {
        if (!f.endsWith(".tsx")) continue;
        cards++;
        let r;
        try {
          r = inspect(readFileSync(join(bd, f), "utf8"));
        } catch {
          failed++;
          continue;
        }
        if (r.shape) {
          shaped++;
          if (r.pinned) pinned++;
        }
      }
      if (cards) runs.set(`${a}/${b}`, { shaped, pinned, cards });
    }
  }
  return { runs, failed };
}

if (process.argv.includes("--paired")) {
  const [A, B] = [scan(process.argv[2]).runs, scan(process.argv[3]).runs];
  // Only runs that produced the shape on BOTH sides: a run with no list has no pin rate, and
  // counting it as 0% would let a round win by generating fewer lists.
  const keys = [...A.keys()].filter((k) => B.has(k) && A.get(k).shaped > 0 && B.get(k).shaped > 0);
  const d = keys.map((k) => B.get(k).pinned / B.get(k).shaped - A.get(k).pinned / A.get(k).shaped);
  const mean = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (d.length - 1));
  const se = sd / Math.sqrt(d.length);
  const [pa, sa] = keys.reduce(([p, s], k) => [p + A.get(k).pinned, s + A.get(k).shaped], [0, 0]);
  const [pb, sb] = keys.reduce(([p, s], k) => [p + B.get(k).pinned, s + B.get(k).shaped], [0, 0]);
  console.log(`配对 ${keys.length} 组（两侧都产出了这个形状的格子）`);
  console.log(`  钉住率  ${mean >= 0 ? "+" : ""}${mean.toFixed(3)} ± ${se.toFixed(3)}` + `  ${se > 0 && Math.abs(mean) >= 2 * se ? "← 过 2SE" : "(未过 2SE)"}`);
  console.log(`  同一批格子: 前 ${pa}/${sa} = ${((100 * pa) / sa).toFixed(1)}%   后 ${pb}/${sb} = ${((100 * pb) / sb).toFixed(1)}%`);
  process.exit(0);
}

const root = process.argv[2];
let total = 0,
  shaped = 0,
  pinned = 0,
  failed = 0;
const pins = [];
for (const a of readdirSync(root)) {
  const ad = join(root, a);
  if (!statSync(ad).isDirectory() || a === "plugin") continue;
  for (const b of readdirSync(ad)) {
    const bd = join(ad, b);
    if (!statSync(bd).isDirectory()) continue;
    for (const f of readdirSync(bd)) {
      if (!f.endsWith(".tsx")) continue;
      total++;
      let r;
      try {
        r = inspect(readFileSync(join(bd, f), "utf8"));
      } catch {
        failed++;
        continue;
      }
      if (r.shape) {
        shaped++;
        if (r.pinned) {
          pinned++;
          pins.push(join(a, b, f));
        }
      }
    }
  }
}
console.log(`${root.split("/").pop()}: ${total} 张卡片；有"列表之上有标题/控件"这个形状的 ${shaped} 张` + `；其中钉住的 ${pinned} 张 = ${shaped ? ((100 * pinned) / shaped).toFixed(1) : 0}%` + (failed ? `；解析失败 ${failed} 张` : ""));
if (process.argv.includes("--show")) pins.forEach((p) => console.log("  钉住: " + p));

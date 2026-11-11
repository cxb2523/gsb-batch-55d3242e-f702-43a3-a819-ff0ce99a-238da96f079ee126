import { parse } from "@babel/parser";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let cards = 0,
  neverRendered = 0;
const samples = [];
for (const root of process.argv.slice(2))
  for (const a of readdirSync(root)) {
    const ad = join(root, a);
    if (!statSync(ad).isDirectory() || a === "plugin") continue;
    for (const b of readdirSync(ad)) {
      const bd = join(ad, b);
      if (!statSync(bd).isDirectory()) continue;
      for (const f of readdirSync(bd)) {
        if (!f.endsWith(".tsx")) continue;
        const src = readFileSync(join(bd, f), "utf8");
        if (!/usePersistedState\s*\(/.test(src)) continue;
        let ast;
        try {
          ast = parse(src, { sourceType: "module", errorRecovery: true, plugins: ["jsx", "typescript"] });
        } catch {
          continue;
        }
        // 收集 const [x, setX] = usePersistedState(...) 里的 x
        const names = [];
        const collect = (n) => {
          if (!n || typeof n.type !== "string") return;
          if (n.type === "VariableDeclarator" && n.init?.type === "CallExpression" && n.init.callee?.name === "usePersistedState" && n.id?.type === "ArrayPattern") {
            const id = n.id.elements[0];
            if (id?.type === "Identifier") names.push(id.name);
          }
          for (const k in n) {
            if (k === "loc") continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && collect(c));
            else if (v && typeof v === "object" && typeof v.type === "string") collect(v);
          }
        };
        collect(ast.program);
        if (!names.length) continue;
        cards++;
        // 这些名字有没有在 JSX 内部被引用过
        const usedInJsx = new Set();
        const walk = (n, inJsx) => {
          if (!n || typeof n.type !== "string") return;
          const nowJsx = inJsx || n.type === "JSXElement" || n.type === "JSXFragment";
          if (nowJsx && n.type === "Identifier" && names.includes(n.name)) usedInJsx.add(n.name);
          for (const k in n) {
            if (k === "loc") continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && walk(c, nowJsx));
            else if (v && typeof v === "object" && typeof v.type === "string") walk(v, nowJsx);
          }
        };
        walk(ast.program, false);
        const missing = names.filter((n) => !usedInJsx.has(n));
        if (missing.length === names.length) {
          neverRendered++;
          if (samples.length < 4) samples.push([join(a, b, f), names]);
        }
      }
    }
  }
console.log(`用了 usePersistedState 的卡片 ${cards} 张；其中那个值从没在 JSX 里出现过的 ${neverRendered} (${((100 * neverRendered) / cards).toFixed(1)}%)`);
samples.forEach(([p, n]) => console.log(`  ${p}  变量: ${n.join(", ")}`));

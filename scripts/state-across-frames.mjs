/**
 * Does a streamed recompile keep a card's state? Root and child are asked separately.
 *
 * `preserveState` is documented as keeping React state across recompiles, and no test in the suite
 * exercises it — `rg preserveState test/` is empty. This renders one card twice, the way a stream
 * does, with a counter in the exported component and another in a component the card defines
 * itself, clicks both, pushes the next frame, and reads them back.
 *
 *   node scripts/state-across-frames.mjs [port]
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const PORT = Number(process.argv[2] ?? 47913);
const REPO = new URL("..", import.meta.url).pathname;

// Same host-resolution shape as `eval/card-driver.mjs`: pick by whether playwright RESOLVES, not
// by whether a package.json exists.
const resolveFrom = (dir) => {
  const url = new URL(`${dir}/package.json`, import.meta.url);
  if (!existsSync(url)) return null;
  try {
    const require = createRequire(url);
    require.resolve("playwright");
    return require;
  } catch {
    return null;
  }
};
const pwRequire = ["..", "../../macaron-genui-demo", "../../canvas-agent-probe"].map(resolveFrom).find(Boolean);
if (!pwRequire) throw new Error("playwright resolves from none of the candidate hosts");
const { chromium } = await pwRequire("playwright");

const FRAME_1 = `import { useState } from "react";

function Child() {
  const [n, setN] = useState(0);
  return <button data-testid="child" onClick={() => setN(n + 1)}>child:{n}</button>;
}

export default function App() {
  const [m, setM] = useState(0);
  return (
    <div>
      <button data-testid="root" onClick={() => setM(m + 1)}>root:{m}</button>
      <Child />
    </div>
  );
}
`;
// The next streamed chunk: strictly appends, exactly as `deliveryFor` requires for `append`.
const FRAME_2 = `${FRAME_1}\n// one more line arrives\n`;

const harness = spawn("bun", ["scripts/surface-harness.ts", String(PORT)], { cwd: REPO, stdio: "ignore" });
const done = () => {
  harness.kill();
};
process.on("exit", done);

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/surface.js`)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};
if (!(await ready())) {
  done();
  throw new Error("harness never came up");
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  page error:", e.message));
await page.goto(`http://127.0.0.1:${PORT}/`);

await page.evaluate(
  async ({ frame1 }) => {
    const { GenUISurface } = await import("/surface.js");
    const React = globalThis.React,
      ReactDOM = globalThis.ReactDOM;
    const host = document.createElement("div");
    document.body.appendChild(host);
    globalThis.__root = ReactDOM.createRoot(host);
    globalThis.__render = (code) => globalThis.__root.render(React.createElement(GenUISurface, { code, streaming: true }));
    globalThis.__render(frame1);
  },
  { frame1: FRAME_1 },
);

const read = async () =>
  page.evaluate(() => ({
    root: document.querySelector('[data-testid="root"]')?.textContent ?? null,
    child: document.querySelector('[data-testid="child"]')?.textContent ?? null,
  }));

const settle = async () => {
  for (let i = 0; i < 40; i++) {
    if ((await read()).root) return;
    await page.waitForTimeout(250);
  }
};
await settle();
console.log("第 1 帧渲染后:      ", await read());

await page.click('[data-testid="root"]');
await page.click('[data-testid="child"]');
await page.click('[data-testid="child"]');
console.log("点击后（root×1, child×2）:", await read());

await page.evaluate((code) => globalThis.__render(code), FRAME_2);
await page.waitForTimeout(1200);
const after = await read();
console.log("推下一帧之后:        ", after);

const rootKept = after.root === "root:1";
const childKept = after.child === "child:2";
console.log(`\n  根组件 state 保住了: ${rootKept}`);
console.log(`  子组件 state 保住了: ${childKept}`);
console.log(rootKept && !childKept ? "\n→ 确认：稳定 slot 只保根组件，卡片自己定义的子组件每帧换新身份被重挂" : "\n→ 与假设不符，需要重新解释");

// --- 场景 B：`render` 模式（settled 的 replace / 探测回来的 redeliver 都走这条）---
// `deliveryFor` 在 streaming=false 且内容变了时给 `replace`，`replace` 调 renderer.render()，
// 而 GenUISurfaceProps 说得很清楚：「the renderer's two reuse branches only fire in `push` mode」。
console.log("\n=== 场景 B：同样两帧，但走 render 模式（streaming=false）===");
await page.evaluate(
  async ({ frame1 }) => {
    const { GenUISurface } = await import("/surface.js");
    const React = globalThis.React,
      ReactDOM = globalThis.ReactDOM;
    document.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.appendChild(host);
    globalThis.__root2 = ReactDOM.createRoot(host);
    globalThis.__render2 = (code) => globalThis.__root2.render(React.createElement(GenUISurface, { code, streaming: false }));
    globalThis.__render2(frame1);
  },
  { frame1: FRAME_1 },
);
for (let i = 0; i < 40; i++) {
  if ((await read()).root) break;
  await page.waitForTimeout(250);
}
await page.click('[data-testid="root"]');
await page.click('[data-testid="child"]');
await page.click('[data-testid="child"]');
console.log("点击后（root×1, child×2）:", await read());
await page.evaluate((code) => globalThis.__render2(code), FRAME_2);
await page.waitForTimeout(1500);
const afterB = await read();
console.log("再 render 一次之后:  ", afterB);
console.log(`  根组件 state 保住了: ${afterB.root === "root:1"}`);
console.log(`  子组件 state 保住了: ${afterB.child === "child:2"}`);

// --- 场景 C：真实形状 —— 流式期间一个非注册裸标识符的 esm.sh 探测落地 ---
// `probeOutcome` 在 streaming 且 `delivered === probed` 时返回 "redeliver"，那会调
// renderer.render()，也就是场景 B 里丢子组件 state 的那条路。这一段问的是：它在真实的
// 「import 了外部库的卡 + 中途点击」下会不会真的擦掉读者刚点开的东西。
const C1 = `import { useState } from "react";
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";

function Group() {
  return (
    <Disclosure>
      <DisclosureButton data-testid="child">toggle</DisclosureButton>
      <DisclosurePanel><span data-testid="panel">open</span></DisclosurePanel>
    </Disclosure>
  );
}

export default function App() {
  const [m, setM] = useState(0);
  return (
    <div>
      <button data-testid="root" onClick={() => setM(m + 1)}>root:{m}</button>
      <Group />
    </div>
  );
}
`;
console.log("\n=== 场景 C：卡片 import 了 @headlessui/react，流式两帧，中间点开 Disclosure ===");
await page.evaluate(
  async ({ code }) => {
    const { GenUISurface } = await import("/surface.js");
    const React = globalThis.React,
      ReactDOM = globalThis.ReactDOM;
    document.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.appendChild(host);
    globalThis.__root3 = ReactDOM.createRoot(host);
    globalThis.__render3 = (c) => globalThis.__root3.render(React.createElement(GenUISurface, { code: c, streaming: true }));
    globalThis.__render3(code);
  },
  { code: C1 },
);
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(() => Boolean(document.querySelector('[data-testid="child"]')));
  if (has) break;
  await page.waitForTimeout(250);
}
const panelOpen = () => page.evaluate(() => Boolean(document.querySelector('[data-testid="panel"]')));
console.log("初始 panel 是否展开:", await panelOpen());
await page.click('[data-testid="root"]');
await page.click('[data-testid="child"]');
await page.waitForTimeout(300);
console.log("点开之后 panel 展开:", await panelOpen(), " root:", (await read()).root);
await page.evaluate((c) => globalThis.__render3(c + "\n// next chunk\n"), C1);
await page.waitForTimeout(2500);
console.log("下一帧到达之后 panel 仍展开:", await panelOpen(), " root:", (await read()).root);

await browser.close();
done();

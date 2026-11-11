/**
 * Click a card while it is still streaming, then keep streaming, and see whether the click held.
 *
 * Two-frame tests said state survives an `append`; the real thing arrives in dozens of frames and
 * the card under test renders a keyless list of locally-defined components. This streams a real
 * card file in small chunks, clicks the first disclosure the moment it exists, finishes the
 * stream, and reports whether the panel the reader opened is still open.
 *
 *   node scripts/click-midstream.mjs <card.tsx> [port] [chunks]
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const cardPath = process.argv[2];
const PORT = Number(process.argv[3] ?? 47925);
const CHUNKS = Number(process.argv[4] ?? 24);
// Click at a FIXED frame rather than at the first opportunity. The two causes this probe has to
// separate live in different parts of the stream: a hook-signature change remounts the boundary
// early (CLAUDE.md: all three changes inside the first 21%, before `return` exists), while an
// esm.sh probe for an unregistered import settles whenever the network says so. Clicking "as soon
// as possible" lands in the first window and cannot see past it.
const CLICK_AT = Number(process.argv[5] ?? 0);
const resolveFrom = (dir) => {
  const url = new URL(`${dir}/package.json`, import.meta.url);
  if (!existsSync(url)) return null;
  try {
    const r = createRequire(url);
    r.resolve("playwright");
    return r;
  } catch {
    return null;
  }
};
const pwRequire = ["..", "../../macaron-genui-demo"].map(resolveFrom).find(Boolean);
const { chromium } = await pwRequire("playwright");

const code = readFileSync(cardPath, "utf8");
const repo = new URL("..", import.meta.url).pathname;
const harness = spawn("bun", ["scripts/surface-harness.ts", String(PORT)], { cwd: repo, stdio: "ignore" });
process.on("exit", () => harness.kill());
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/surface.js`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.evaluate(async () => {
  const { GenUISurface } = await import("/surface.js");
  const host = document.createElement("div");
  host.id = "h";
  document.body.appendChild(host);
  globalThis.__root = globalThis.ReactDOM.createRoot(host);
  globalThis.__S = GenUISurface;
  globalThis.__push = (c, streaming) => globalThis.__root.render(globalThis.React.createElement(GenUISurface, { code: c, streaming }));
});

const step = Math.ceil(code.length / CHUNKS);
let clickedAt = null,
  openAfterClick = null;
// A disclosure counts as open when its panel has rendered content.
const openCount = () => page.evaluate(() => document.querySelectorAll('[id^="headlessui-disclosure-panel"]').length);

// Every frame streams, INCLUDING the last: production delivers the whole card as a streaming
// frame and only then settles it, and `deliveryFor` answers `nothing` for that settle because the
// two differ by trailing whitespace alone. An earlier version of this loop flipped `streaming` to
// false on the same step that added the final chunk, so the settle saw changed content, returned
// `replace`, and remounted the card — a remount this probe had manufactured and would have
// reported as the product's bug.
for (let i = 1; i <= CHUNKS; i++) {
  const prefix = code.slice(0, Math.min(i * step, code.length));
  await page.evaluate(({ c, s }) => globalThis.__push(c, s), { c: prefix, s: true });
  await page.waitForTimeout(400);
  if (clickedAt === null && i >= CLICK_AT) {
    // Only click a control that is FULLY FORMED. A partial frame can paint a `<button>` whose
    // attributes have not arrived yet; clicking that measures the harness, not the card, and the
    // first version of this probe did exactly that (`aria-expanded null -> null` at frame 3).
    const buttons = await page.$$('button[id^="headlessui-disclosure-button"][aria-expanded]');
    if (buttons.length) {
      // `aria-expanded` is headlessui's own state, so it separates "the click never registered"
      // from "it registered and a later frame wiped it" — which the panel count cannot.
      const before = await buttons[0].getAttribute("aria-expanded");
      await buttons[0].click().catch(() => {});
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.querySelector('button[id^="headlessui-disclosure-button"]')?.getAttribute("aria-expanded"));
      openAfterClick = await openCount();
      clickedAt = i;
      console.log(`  第 ${i}/${CHUNKS} 帧点击：aria-expanded ${before} → ${after}，展开面板数 = ${openAfterClick}`);
      globalThis.__clickedAria = after;
    }
  }
}
// The settle, as production does it: same code, streaming off.
await page.evaluate((c) => globalThis.__push(c, false), code);
await page.waitForTimeout(2500);
const finalOpen = await openCount();
const finalAria = await page.evaluate(() => document.querySelector('button[id^="headlessui-disclosure-button"]')?.getAttribute("aria-expanded"));
console.log(`  流式结束后：第一个按钮 aria-expanded = ${finalAria}，展开面板数 = ${finalOpen}`);
console.log(clickedAt === null ? "\n→ 整个流式过程中没等到可点的 disclosure" : finalOpen >= (openAfterClick ?? 0) && (openAfterClick ?? 0) > 0 ? "\n→ 点击保住了：流式期间点开的面板到最后仍是开的" : "\n→ 复现了：流式期间点开的面板被后续帧擦掉了");
await browser.close();
harness.kill();

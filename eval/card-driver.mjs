/**
 * A card held open in a browser, driven one command at a time.
 *
 * Every earlier screenshot tool in this repo mounts a card, photographs it, and exits — which can
 * only ever measure a first impression. The principles under test here are about what happens
 * when somebody USES the card: does clicking an option preview a result or fire the turn, does a
 * submit fire once, does a reload remember the choice instead of asking again. None of that is
 * visible in a still.
 *
 * So this is a REPL: JSONL commands on stdin, one JSONL response per line on stdout. dsh is not
 * in this process, so stdout is ours and needs no side channel.
 *
 *   node eval/card-driver.mjs <light-port> <dark-port> <shot-dir>
 *
 * with `bun scripts/surface-harness.ts <light-port>` and `THEME=dark … <dark-port>` already up.
 * Two harnesses rather than one because the theme is baked into the page's `:root` block at
 * serve time, and a card must be judged on the ground it will actually sit on.
 *
 * Commands: mount{code,width,theme} · probe · click{ref} · fill{ref,text} · shot{name,width,theme}
 *           reload · quit
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";

// This repo's own `node_modules` FIRST, then the sibling checkouts. Playwright is not a declared
// dependency here — it is 300MB of browser and only the eval needs it — so the original list
// borrowed it from whichever neighbour happened to have it. That makes the eval depend on the
// SHAPE OF THE PARENT DIRECTORY: run the same tree from anywhere else and every card-driver dies
// with `no sibling checkout with playwright`, which surfaces upstream as `ConnectionResetError`
// on the dsh channel and reads exactly like a flaky model. Measured when this repo was cloned to
// /tmp to work around a permissions failure: every run failed that way.
const PLAYWRIGHT_HOSTS = ["..", "../../macaron-genui-demo", "../../ui4a-playground", "../../genui-canvas"];
// Picked by whether playwright RESOLVES from there, not by whether a package.json exists. The
// first version tested `existsSync(package.json)` and so always chose `..` — this repo — which
// passes that test and does not have playwright unless someone installed it by hand. It worked
// only in the checkout where that had happened, and moving the tree broke every run with
// `ERR_MODULE_NOT_FOUND` inside chromium, one directory short of the neighbour that had it.
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
const pwRequire = PLAYWRIGHT_HOSTS.map(resolveFrom).find(Boolean);
if (!pwRequire) throw new Error(`playwright resolves from none of: ${PLAYWRIGHT_HOSTS.join(", ")}`);
const { chromium } = await pwRequire("playwright");

const [lightPort, darkPort, shotDir] = process.argv.slice(2);
mkdirSync(shotDir, { recursive: true });
const portOf = (theme) => (theme === "dark" ? darkPort : lightPort);

const browser = await chromium.launch();
/** One page per theme, kept open: a reload must be a RELOAD, not a fresh context that forgets localStorage. */
const pages = new Map();
let current = null;

async function pageFor(theme) {
  if (!pages.has(theme)) {
    const page = await browser.newPage({ viewport: { width: 440, height: 2400 }, deviceScaleFactor: 2 });
    page.errors = [];
    page.on("pageerror", (e) => page.errors.push(String(e).slice(0, 200)));
    await page.goto(`http://127.0.0.1:${portOf(theme)}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    pages.set(theme, page);
  }
  return pages.get(theme);
}

/** Icon names the card imports, so the lucide stand-in can declare them as static exports. */
const iconsOf = (code) => [...(code.match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/)?.[1] ?? "").matchAll(/[A-Z]\w*/g)].map((m) => m[0]);

const MOUNT = async ({ code, width, icons }) => {
  const { GenUISurface, registerModules, registerUi4aHost } = await import("/surface.js");
  const React = globalThis.React,
    { createRoot } = globalThis.ReactDOM;
  const icon = () => React.createElement("span", { "data-icon": "" });
  if (icons.length) registerModules({ "lucide-react": Object.fromEntries(icons.map((n) => [n, icon])) });
  // What the card's `$dsh/chat` reaches. Recording rather than sending is the whole point: the
  // orchestrator needs to know WHICH click produced a turn, and a click that produces none is
  // the preview interaction the principles ask for rather than a card that failed to wire up.
  window.__sent ??= [];
  registerUi4aHost({ send: (text) => window.__sent.push(text), cwd: () => "/tmp/ui4a-eval", sessionId: () => "ui4a-eval" });
  document.getElementById("shot-host")?.remove();
  const host = document.body.appendChild(document.createElement("div"));
  host.id = "shot-host";
  host.style.width = width + "px";
  host.style.containerType = "inline-size";
  window.__lastCode = code;
  createRoot(host).render(React.createElement(GenUISurface, { code, streaming: false }));
};

/**
 * What a person could do to this card right now.
 *
 * Refs are indices into the same query the click below re-runs, so they are only valid until the
 * DOM changes — every response carries a fresh list for that reason.
 */
const PROBE = () => {
  const host = document.getElementById("shot-host");
  if (!host) return { painted: false, text: "", controls: [], sent: window.__sent ?? [] };
  const sel = "button, [role=button], [role=tab], [role=option], [role=radio], [role=checkbox], [role=switch], a[href], input, select, textarea, [onclick], [tabindex]:not([tabindex='-1'])";
  const seen = new Set();
  const controls = [];
  for (const el of host.querySelectorAll(sel)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 120);
    controls.push({
      ref: controls.length,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? undefined,
      type: el.getAttribute("type") ?? undefined,
      label,
      state: { disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true", selected: el.getAttribute("aria-selected") ?? el.getAttribute("aria-checked") ?? (el.checked === true ? "true" : undefined), value: el.value === undefined ? undefined : String(el.value).slice(0, 80) },
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    });
  }
  // Content wider than the card, measured rather than eyeballed. A screenshot is clipped at the
  // host width, so the overflowing part is simply ABSENT from the picture and an absent column
  // reads as a design choice — this is the one defect a reader looking at the shot cannot name.
  // Ported from `shot-card.mjs`, including the reason it takes the single worst offender: one
  // pass, and the caller wants somewhere to look rather than a list to triage.
  const right = host.getBoundingClientRect().right;
  let worst = null;
  for (const el of host.querySelectorAll("*")) {
    // Elements INSIDE an <svg> are skipped: `getBoundingClientRect` on an SVG child returns its
    // transformed geometry, unclipped by the <svg> viewport. KaTeX draws a stretchy \sqrt as a
    // <path> and it reported 7690px of "overflow" on a formula rendering correctly inside a
    // scrolling container — four of r005's five worst, all in `formula-derive`, all arriving with
    // the round that first recommended katex: the rule's own success as the rule's own regression.
    // The <svg> element itself still counts, because a too-wide drawing IS this defect.
    if (el.ownerSVGElement) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > right + 1 && (worst === null || r.right - right > worst.px)) {
      worst = { px: Math.round(r.right - right), tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 60), text: (el.innerText || "").trim().slice(0, 40) };
    }
  }
  return { painted: host.getBoundingClientRect().height > 20, text: (host.innerText || "").trim().slice(0, 4000), controls, sent: window.__sent ?? [], overflow: worst };
};

const CLICK = (ref) => {
  const host = document.getElementById("shot-host");
  const sel = "button, [role=button], [role=tab], [role=option], [role=radio], [role=checkbox], [role=switch], a[href], input, select, textarea, [onclick], [tabindex]:not([tabindex='-1'])";
  const seen = new Set();
  const list = [];
  for (const el of host.querySelectorAll(sel)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    list.push(el);
  }
  const el = list[ref];
  if (!el) return { ok: false, error: `no control at ref ${ref} (have ${list.length})` };
  el.scrollIntoView({ block: "center" });
  el.click();
  return { ok: true };
};

const shot = async (page, name, width) => {
  const path = `${shotDir}/${name}.png`;
  await page.setViewportSize({ width, height: 2400 });
  await page.evaluate((w) => {
    const h = document.getElementById("shot-host");
    if (h) h.style.width = w + "px";
  }, width);
  await page.waitForTimeout(350);
  const box = await page.evaluate(() => {
    const host = document.getElementById("shot-host");
    if (!host) return null;
    let bottom = host.getBoundingClientRect().bottom;
    for (const el of host.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
    }
    return { x: 0, y: 0, width: Math.ceil(host.getBoundingClientRect().width), height: Math.min(2400, Math.max(40, Math.ceil(bottom))) };
  });
  if (!box) return { ok: false, error: "nothing mounted" };
  await page.screenshot({ path, clip: box });
  return { ok: true, path, height: box.height };
};

const rl = createInterface({ input: process.stdin });
const say = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

for await (const line of rl) {
  if (line.trim() === "") continue;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    say({ ok: false, error: `bad json: ${e.message}` });
    continue;
  }
  try {
    if (msg.cmd === "quit") break;
    if (msg.cmd === "mount") {
      current = { code: msg.code, width: msg.width ?? 440, theme: msg.theme ?? "light" };
      const page = await pageFor(current.theme);
      page.errors.length = 0;
      await page.evaluate(MOUNT, { code: current.code, width: current.width, icons: iconsOf(current.code) });
      // A card that imports from esm.sh needs the fetch to land before anything is true about it.
      await page.waitForTimeout(msg.settle ?? 2500);
      say({ ok: true, ...(await page.evaluate(PROBE)), errors: page.errors.slice(0, 5) });
    } else if (msg.cmd === "probe") {
      const page = await pageFor(current.theme);
      say({ ok: true, ...(await page.evaluate(PROBE)), errors: page.errors.slice(0, 5) });
    } else if (msg.cmd === "click") {
      const page = await pageFor(current.theme);
      const res = await page.evaluate(CLICK, msg.ref);
      if (!res.ok) {
        say(res);
        continue;
      }
      await page.waitForTimeout(msg.settle ?? 900);
      say({ ok: true, ...(await page.evaluate(PROBE)), errors: page.errors.slice(0, 5) });
    } else if (msg.cmd === "fill") {
      const page = await pageFor(current.theme);
      const ok = await page.evaluate(
        ({ ref, text }) => {
          const host = document.getElementById("shot-host");
          const el = [...host.querySelectorAll("input, textarea")][ref];
          if (!el) return false;
          const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
          setter.call(el, text);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },
        { ref: msg.ref, text: msg.text },
      );
      await page.waitForTimeout(300);
      say({ ok, ...(await page.evaluate(PROBE)) });
    } else if (msg.cmd === "reload") {
      // The refresh test. `usePersistedState` writes to localStorage, which survives a reload of
      // the SAME page — so a card that remembers its answer comes back answered, and one that
      // re-fires `sendMessage` on mount would restart a conversation the user already finished.
      const page = await pageFor(current.theme);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
      page.errors.length = 0;
      await page.evaluate(MOUNT, { code: current.code, width: current.width, icons: iconsOf(current.code) });
      await page.waitForTimeout(msg.settle ?? 2500);
      say({ ok: true, ...(await page.evaluate(PROBE)), errors: page.errors.slice(0, 5) });
    } else if (msg.cmd === "shot") {
      const theme = msg.theme ?? current.theme;
      const page = await pageFor(theme);
      if (theme !== current.theme) {
        await page.evaluate(MOUNT, { code: current.code, width: msg.width ?? current.width, icons: iconsOf(current.code) });
        await page.waitForTimeout(2000);
      }
      say(await shot(page, msg.name, msg.width ?? current.width));
    } else say({ ok: false, error: `unknown cmd ${msg.cmd}` });
  } catch (error) {
    say({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
await browser.close();

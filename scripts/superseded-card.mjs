/**
 * A broken card the model has already replaced: does it go on telling the model it is broken?
 *
 * Taken from a real session. The model wrote a card importing `Github` from `lucide-react`
 * (removed upstream), was told, and fixed it to `GitBranch` in its very next reply — and the
 * fail-to-render badge stayed up for the rest of the conversation, because the superseded card is
 * still in the transcript and re-compiles on every later frame. The model cannot act on that:
 * editing a reply it has already sent is not a thing it can do.
 *
 * Runs the REAL claim path — `claimInlineFences` over real `.md-code-block` nodes, a real
 * MutationObserver, the real compiler — because the question is about DOM order, and a hand-built
 * fixture is exactly the thing that cannot answer it. The lucide stand-in registered here declares
 * `GitBranch` and not `Github`, so the failure is the session's own error message and needs no
 * network to produce it.
 *
 *   node scripts/superseded-card.mjs [port]
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const PORT = Number(process.argv[2] ?? 47933);
const REPO = new URL("..", import.meta.url).pathname;

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

const BROKEN = `import { Github } from "lucide-react";
export default function App() { return <div><Github /> repo</div>; }
`;
const FIXED = `import { GitBranch } from "lucide-react";
export default function App() { return <div><GitBranch /> branch</div>; }
`;

const harness = spawn("bun", ["scripts/surface-harness.ts", String(PORT)], { cwd: REPO, stdio: "ignore" });
process.on("exit", () => harness.kill());
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/surface.js`)).ok) break;
  } catch {
    /* not up */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`  pageerror: ${e.message.slice(0, 160)}`));
await page.goto(`http://127.0.0.1:${PORT}/`);

const out = await page.evaluate(
  async ({ broken, fixed }) => {
    const { GenUISurface, claimInlineFences, reportCardError, cardRendered, registerModules } = await import("/surface.js");
    const React = globalThis.React;
    registerModules({ "lucide-react": { GitBranch: () => React.createElement("span", null, "⎇") } });

    const sent = [];
    const transcript = document.createElement("div");
    document.body.appendChild(transcript);

    // What the host's markdown renderer produces: `.md-code-block` wrapping a `<pre>` of the source.
    const addBlock = (code) => {
      const block = document.createElement("div");
      block.className = "md-code-block";
      const pre = document.createElement("pre");
      pre.textContent = code;
      block.appendChild(pre);
      transcript.appendChild(block);
      return block;
    };

    let segments = [];
    const dispose = claimInlineFences({
      segments: () => segments,
      t: (key) => key,
      subscribeLocale: () => () => {},
      owner: () => "s1",
      render: ({ code, streaming, last }) =>
        React.createElement(GenUISurface, {
          code,
          streaming,
          onError: (error, phase) => reportCardError((r) => sent.push(r), error.message, phase, last),
          onRendered: (restored) => cardRendered(restored, last),
        }),
    });

    const settle = (ms) => new Promise((r) => setTimeout(r, ms));

    // 1. The broken card arrives and is the newest thing in the transcript.
    segments = [{ code: broken, complete: true }];
    const first = addBlock(broken);
    await settle(5000);
    const afterBroken = sent.length;

    // 2. The model's next reply lands with the fix. The broken one stays where it was.
    segments = [
      { code: broken, complete: true },
      { code: fixed, complete: true },
    ];
    addBlock(fixed);
    await settle(5000);
    const afterFix = sent.length;
    const mounts = document.querySelectorAll("[data-ui4a-mount]").length;

    // 3. What actually happens on every later frame: the host re-renders its markdown, so the old
    //    block is a NEW node, its claim is released, and the card compiles — and fails — again.
    const replacement = first.cloneNode(true);
    replacement.removeAttribute("data-ui4a-claimed");
    replacement.style.display = "";
    first.replaceWith(replacement);
    await settle(5000);

    dispose();
    return { afterBroken, afterFix, total: sent.length, mounts, sent };
  },
  { broken: BROKEN, fixed: FIXED },
);

console.log(`  ① 坏卡片还是最后一个 ui4a block 时，上报 ${out.afterBroken} 次`);
console.log(`  ② 修好的卡片到达后，累计 ${out.afterFix} 次（mounts=${out.mounts}）`);
console.log(`  ③ 被顶掉的坏卡片重新编译、再次失败后，累计 ${out.total} 次`);
console.log(`  上报内容: ${JSON.stringify(out.sent)}`);

await browser.close();
harness.kill();

// Both halves, or the check passes on a probe that simply never fired: ① proves the reporter is
// wired and the card really does fail, ③ proves the superseded one is silent.
const ok = out.afterBroken >= 1 && out.mounts === 2 && out.total === out.afterFix;
console.log(ok ? "\nPASS — 只有最后一个 ui4a block 的报错会送到模型" : "\nFAIL");
process.exit(ok ? 0 : 1);

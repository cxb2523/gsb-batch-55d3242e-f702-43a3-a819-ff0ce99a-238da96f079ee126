/**
 * Builds the landing page: `website/index.genui.tsx` → `.site/index.html`.
 *
 * `genui build` inlines the CSS, the bundle and the server-rendered markup into one file, so the
 * deploy is a copy of `.site/` and nothing has to know the page is served from a sub-path
 * (`/dsh-generative-ui/`). `-i` points `$dsh/*` at `types/standalone/`, the stubs that let a page
 * outside dsh import a capability module and still build. Nothing on the page imports one today;
 * the flag is here so the first card that does — `$dsh/state` is real `localStorage` outside dsh —
 * builds instead of dying on a specifier nothing resolves.
 *
 * The CLI has no npm release (@genui/cli is a private workspace package of macaron-genui-demo), so
 * it comes from pkg.pr.new by URL — the same URL `src/skill.ts` hands the model. Pinned to `@main`
 * on purpose: this is a build of our own page, not something a user installs, and a pinned SHA
 * would rot silently.
 *
 * `--unocss static` is the default and the right one here: every class on the page is a literal, so
 * there is nothing for the in-browser generator to do.
 */
import { $ } from "bun";
import { resolve } from "node:path";
import { CLI_URL } from "../src/skill.ts";

const root = resolve(import.meta.dir, "..");
const entry = resolve(root, "website/index.genui.tsx");
const importMap = resolve(root, "types/standalone/importmap.json");

// `--dev` points the same command at a Vite server instead of a file, for iterating on the page.
// It is NOT a preview of the artifact: the CLI serves its own dev shell, so the title and lang are
// the shell's (`GenUI Dev`, `zh-CN`) and the substitutions below never run. Everything after
// `--dev` is forwarded, so `--port` and the rest stay reachable.
const argv = process.argv.slice(2);
const dev = argv.indexOf("--dev");
if (dev !== -1) {
  await $`bunx --yes genui@${CLI_URL} dev ${entry} -i ${importMap} ${argv.slice(dev + 1)}`;
  process.exit(0);
}

/** The two strings `genui build` hardcodes and the page has to own. */
const SHELL_FIXES = [
  ["<title>GenUI Export</title>", "<title>dsh-generative-ui — Generative UI for DeepSeek Harness</title>"],
  ['<html lang="zh-CN">', '<html lang="en">'],
] as const;

const out = resolve(root, ".site", "index.html");
await $`bunx --yes genui@${CLI_URL} build ${entry} -i ${importMap} -o ${out}`.quiet();

// `build` emits a fixed shell, and this pair plus the page's own `html,body` rule are one missing
// upstream API: the title, the lang and a light token painted onto `body`, none of them reachable
// by a flag (`GenUIHtmlExportOptions.title` exists — `build` just never sets it). Rewriting the
// artifact is the cheap fix for one page; it should be `--title`/`--lang` upstream once a second
// page or a second dark export exists.
//
// Each substitution is asserted on its own, not with one `patched === html` check: that test only
// fires when BOTH strings moved, so a shell that kept `lang="zh-CN"` while changing the title would
// ship a stale page with no signal.
let html = await Bun.file(out).text();
for (const [from, to] of SHELL_FIXES) {
  if (!html.includes(from)) throw new Error(`site: ${from} is no longer in the shell — re-derive the substitution`);
  html = html.replace(from, to);
}
// `genui build` catches an SSR throw, logs it, and falls back to client rendering — so a runtime
// failure still exits 0 and ships a blank page. It did exactly that while this page was written
// (a bad import name out of radix: React #130, white page, green build). The artifact is the whole
// deliverable, so its emptiness is asserted rather than noticed later in a browser.
if (html.includes('<div id="genui-root"></div>')) throw new Error("site: the page server-rendered empty — the render error is above");

const size = await Bun.write(out, html);

// No `.nojekyll`: nothing here goes through Jekyll (that is the deploy-from-a-branch path, and
// Actions uploads the artifact directly), and `upload-pages-artifact` tars with `--exclude=.[^/]*`
// unless `include-hidden-files` is set — so the file would never reach the artifact.
console.log(`.site/index.html · ${(size / 1024).toFixed(0)} KB`);

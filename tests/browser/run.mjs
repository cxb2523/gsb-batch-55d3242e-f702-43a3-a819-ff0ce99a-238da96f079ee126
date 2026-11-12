// Headless runner for the WebGL shader checks in tests/browser/glsl-check.ts.
//
// It starts the Vite dev server, drives a headless Chromium-based browser
// (Edge on Windows, Chrome/Chromium elsewhere) at the test page, and exits
// non-zero unless the page reports "ALL BROWSER CHECKS PASSED".
//
// Usage: npm run test:browser

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 5199;
const URL = `http://localhost:${PORT}/tests/browser/`;
const BROWSER_TIMEOUT_MS = 45_000;

const browserCandidates = [
  process.env.BROWSER_BIN,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const browser = browserCandidates.find((p) => existsSync(p));
if (!browser) {
  console.error(
    "No Chromium-based browser found. Set BROWSER_BIN to an Edge/Chrome binary.",
  );
  process.exit(2);
}

// Run vite through node directly so no shell is needed (avoids argument
// escaping issues and the DEP0190 shell-spawn warning).
const viteBin = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const vite = spawn(
  process.execPath,
  [viteBin, "--port", String(PORT), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);

const children = new Set([vite]);
vite.on("exit", () => children.delete(vite));

const cleanup = () => {
  for (const child of children) {
    child.kill();
  }
};
process.on("exit", cleanup);

try {
  // Wait for the dev server to accept connections.
  let up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await delay(250);
  }
  if (!up) throw new Error("vite dev server did not start");

  // Isolated profile so the run never touches the user's real browser state.
  const profileDir = mkdtempSync(join(tmpdir(), "skapa-glsl-"));
  const args = [
    "--headless=new",
    "--disable-gpu-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    "--virtual-time-budget=10000",
    "--dump-dom",
    URL,
  ];

  const result = await new Promise((resolve) => {
    const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    child.on("exit", () => children.delete(child));

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));

    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: -1, out, err: err + "\nbrowser timed out" });
    }, BROWSER_TIMEOUT_MS);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });

  rmSync(profileDir, { recursive: true, force: true });

  const match = result.out.match(/<pre id="results">([\s\S]*?)<\/pre>/);
  const body = match ? match[1] : "";
  console.log(body.replace(/&amp;/g, "&").trim());

  if (result.code === 0 && body.includes("ALL BROWSER CHECKS PASSED")) {
    console.log("\nbrowser checks: PASS");
    process.exitCode = 0;
  } else {
    if (!match)
      console.error("No test results found in page output.", result.err);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  cleanup();
}

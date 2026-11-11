/**
 * `loads` — the prompt reaches the request, checked without a model.
 *
 * This used to boot `dsh --profile headless` against a real provider and ask the model to quote a
 * rule back. That made the gate depend on a live key and on the model following an instruction
 * ("只答那个字符串" — it often did not), and it used whatever `DSH_HOME` happened to be set. All
 * three are gone: the provider is a local stub that records the request body, and the home is a
 * fresh temp directory holding only this package.
 *
 * Two things are checked, and neither needs an answer to come back:
 *
 * - **the loader accepts the section** — `dsh` rejects `{{…}}` in prompt text as a variable
 *   reference, and a rejected section is a plugin that silently stops teaching anything;
 * - **the section is in the request** — the stub sees the assembled prompt, which is a stronger
 *   signal than asking the model to recite it back.
 *
 * Needs the `dsh` binary. Without one this is a no-op, because CI has none: that is an
 * environment dependency, not an LLM one.
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Markers that appear only in the plugin's own prompt section.
 *
 * `ui4a/tsx` is NOT one of them: dsh puts the workspace's `CLAUDE.md` in the request too, and that
 * file mentions the fence language. Asserting on it would pass even if the section never arrived.
 */
const MARKERS = ["# Generative UI", "are the whole set"];
const REPO = process.cwd();

if (Bun.which("dsh") === null) {
  console.log("loads: skipped — no dsh on PATH");
  process.exit(0);
}

/** What the provider saw. The assertion is on these, not on anything the "model" says. */
const requests: string[] = [];
const stub = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const body = await request.text();
    requests.push(`${request.method} ${new URL(request.url).pathname}\n${body}`);
    // The provider speaks OpenAI-compatible completions and **streams**. The content is arbitrary
    // — nothing in this check reads it — but the stream has to end with a `finish_reason`, or the
    // harness reports `TRANSPORT: Stream ended without finish_reason`.
    const chunk = (delta: Record<string, unknown>, finish: string | null) => `data: ${JSON.stringify({ id: "loads-stub", object: "chat.completion.chunk", created: 0, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const stream = [chunk({ role: "assistant", content: "ok" }, null), chunk({}, "stop"), "data: [DONE]\n\n"].join("");
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  },
});

const home = mkdtempSync(join(tmpdir(), "dsh-loads-"));
let exit = 0;
try {
  const profile = join(home, "profiles/headless");
  mkdirSync(join(profile, "node_modules"), { recursive: true });
  // Symlink rather than install: `dsh` supplies the base bundles from its own binary, and the only
  // thing the profile needs is this plugin. A `node_modules/<name>` link is what the loader reads.
  symlinkSync(REPO, join(profile, "node_modules/dsh-generative-ui"));
  writeFileSync(join(home, "settings.yaml"), "");
  writeFileSync(
    join(profile, "package.json"),
    JSON.stringify(
      {
        name: "dsh-profile-headless",
        private: true,
        dependencies: { "dsh-generative-ui": `link:${REPO}` },
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "dsh-generative-ui"] } },
      },
      null,
      2,
    ),
  );
  // Point the provider at the stub. `apiKeyEnv` is only a name: the value is never read by us,
  // but the provider refuses to build a request without one.
  writeFileSync(
    join(profile, "cordis.patch.yml"),
    [
      "- id: agent-default-model",
      "  config: { provider: loads-stub, model: deepseek-flash }",
      "- id: llm-pi-ai",
      "  config:",
      "    providers:",
      "      loads-stub:",
      "        displayName: Loads stub",
      "        apiKeyEnv: LOADS_STUB_KEY",
      "        api: openai-completions",
      `        baseURL: http://127.0.0.1:${stub.port}/v1`,
      "        models:",
      "          - id: deepseek-flash",
      "            name: DeepSeek Flash",
      "            contextWindow: 65536",
      "            maxTokens: 4096",
      "            input: [text]",
      "",
    ].join("\n"),
  );

  // `spawnSync` would block this process's event loop, and the stub's handler could then never
  // answer: dsh connects and gets nothing. The server has to keep running while dsh does.
  const proc = Bun.spawn(["dsh", "--profile", "headless", "hi"], {
    cwd: home,
    env: { ...process.env, DSH_HOME: home, LOADS_STUB_KEY: "loads-stub" },
  });
  const timer = setTimeout(() => proc.kill(), 30_000);
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  // The loader failure the old check existed for. `{{…}}` is fatal anywhere in the section.
  const rejected = /malformed prompt|failed to load|UNKNOWN:/i.exec(stderr);
  if (rejected !== null) {
    console.error(`loads: FAILED — dsh rejected the prompt section\n${rejected[0]}`);
    exit = 1;
  } else if (exitCode !== 0) {
    console.error(`loads: FAILED — dsh exited ${exitCode}\nstdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 1500)}`);
    exit = 1;
  } else if (!MARKERS.every((marker) => requests.some((entry) => entry.includes(marker)))) {
    console.error(`loads: FAILED — the prompt section never reached the request\nrequests: ${requests.map((entry) => entry.slice(0, 500)).join("\n---\n") || "(none)"}\nexit: ${exitCode}\nstdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 1500)}`);
    exit = 1;
  } else {
    console.log(`loads: ok — section accepted, and the prompt is in the request seen by the provider`);
    if (stdout.trim() !== "") console.log(`loads: note — the stub's answer reached the transcript: ${stdout.trim().slice(0, 120)}`);
  }
} finally {
  stub.stop();
  rmSync(home, { recursive: true, force: true });
}
process.exit(exit);

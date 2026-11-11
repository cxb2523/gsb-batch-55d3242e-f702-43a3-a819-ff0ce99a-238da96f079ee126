import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `eval.sh` is the instrument every prompt measurement goes through, and it has been wrong in ways
 * that produced plausible numbers twice: it wrote its transcript into the workspace the model could
 * edit (and one run in six did edit it), and it had no timeout, so a hung run was indistinguishable
 * from a slow one. Neither failure announced itself.
 */
const script = readFileSync("scripts/eval.sh", "utf8");

test("the transcript lives outside the workspace", () => {
  // `out` must not be built from `$d`, the directory the model works in.
  expect(script).not.toMatch(/out=.*\$d/);
  expect(script).toMatch(/out=\$\(mktemp\)/);
});

test("a hung run is reported separately from a dead one", () => {
  expect(script).toContain('echo "timeout');
  expect(script).toContain('echo "crash');
  // Two crash causes, and they printed the same line — a run that produced a card reported
  // `crash` with no way to tell a missing transcript from an unfinished turn, and no path to go
  // and look at either. `run-fixtures.sh` still matches both with `crash*`.
  expect(script).toContain("crash/nosession");
  expect(script).toContain("crash/unfinished");
  expect(script).toContain('sess=""');
  expect(script).toContain("sess=$(ls -td");
  expect(script).toContain("session.v4.jsonl.zstd");
  expect(script).toContain('transcript="$sess/session.v4.jsonl.zstd"');
  // and with distinct exit codes, since callers branch on them
  expect(script).toMatch(/exit 3/);
  expect(script).toMatch(/exit 2/);
});

test("the reply path is printed, so a caller can read the card", () => {
  expect(script).toContain("reply=$visible");
  expect(script).toContain("raw=$out");
});

test("the measured reply comes from visible assistant text blocks", () => {
  expect(script).toContain('bun "$here/scripts/visible-reply.ts" - > "$visible"');
  expect(script).toContain("fences=$(awk");
  expect(script).toContain('"$visible")');
  expect(script).toContain('"$visible.canvases"');
});

test("a frozen eval plugin carries the progressive skill references", () => {
  expect(readFileSync("eval/wave.py", "utf8")).toContain('"skill"');
});

test("the trigger runner invokes the Bash evaluator and counts only complete four-backtick cards", () => {
  const triggers = readFileSync("scripts/triggers.sh", "utf8");
  expect(triggers).toContain('bash "$d/eval.sh"');
  expect(triggers).toContain("reply=$(print -r --");
  expect(script).toContain('if ($0 == "````ui4a/tsx")');
  expect(script).toContain('if ($0 == "````" && open)');
});

// A rule in the SKILL can only be measured on a run that loaded it. Three conclusions were written
// from runs that never called `skill` — the tool list carried it and was read past every time, so
// it is now the first word on the line.
test("whether the skill loaded is reported, not left in the tool list", () => {
  expect(script).toContain("skill=$skill");
  expect(script).toMatch(/skill=\$\(.*skillx/);
});

// The text assertions above check the shape; this checks the behaviour, because a script can
// contain `exit 3` and still never reach it. One second is enough — the run is killed before the
// model answers, which is exactly the case being tested.
// Skipped rather than failed where dsh is absent (CI). A skip is invisible in the pass count, so
// the three text assertions above deliberately overlap with this one: they hold everywhere.
const hasDsh = Bun.spawnSync(["which", "dsh"]).exitCode === 0;

// This test rebuilds, and `bun run build` refuses while a wave is running — for a good reason: a
// rebuild moves the prompt under jobs already in flight. So during a wave the test would fail on
// its own first line, reporting a guard doing its job as a broken suite. Skip instead, and say so:
// a skip is visible in the run's output, a red test on a tree nobody changed teaches nothing.
//
// Read the SAME evidence the build reads — `.wave-running`, holding the wave's own pid — rather
// than asking `pgrep` a second, differently-worded question. This line used to grep for
// `run-wave.py`; the script was renamed to `wave.py` and the guard went on answering "no wave" for
// every wave after that, so the test failed through a whole round with a red that meant nothing.
// The lock cannot drift out of step with the refusal, because it is what the refusal consults.
const waveLock = Bun.file(new URL("../.wave-running", import.meta.url).pathname);
const waveRunning = await (async () => {
  if (!(await waveLock.exists())) return false;
  try {
    process.kill(Number((await waveLock.text()).trim()), 0);
    return true;
  } catch {
    return false; // ESRCH: a dead wave's leftover lock, which the build ignores too
  }
})();
if (waveRunning) console.log("skipping the timeout test: a wave is running, so `bun run build` will refuse");

// Build first, deliberately. The staleness guard exits 4 BEFORE the timeout can fire, and `src/`
// goes "newer" than `lib/` for reasons that are not edits at all — a `git checkout` or a restored
// backup bumps an mtime. Without this the test measures which guard ran first, which is not what
// it is asking about, and it fails on a tree nobody has changed.
test.skipIf(!hasDsh || waveRunning)(
  "a run that exceeds EVAL_TIMEOUT reports timeout and exits 3",
  () => {
    // With BUILD_OUTDIR CLEARED, whatever the caller set. The `pre-push` hook sets it so a
    // running wave's `lib/` is not replaced under it — but this build exists to refresh `lib/`
    // itself, and inheriting the redirect sends it to a scratch directory and leaves `lib/`
    // exactly as stale as it was. `eval.sh` then exits 4 on the staleness guard and this asserts
    // 3, which reads as a flaky timeout test and is really the defence above quietly doing
    // nothing. Safe unconditionally: `waveRunning` has already skipped this test if a wave holds
    // the lock, so there is no `lib/` to protect here.
    // Only when `lib/` is actually behind. `test-shuffled.sh` runs this whole suite 20 times, so
    // an unconditional build here is 21 builds per `bun run check` to advance one mtime — the
    // first does the work and the other twenty repeat it. NOT a `touch`: this repo has lost an
    // afternoon to a `lib/` that was newer than `src/` without being built from it, and a test
    // that fakes freshness is how that comes back.
    const newest = (dir: string) => Math.max(...[...new Bun.Glob("**/*").scanSync(dir)].map((f) => statSync(`${dir}/${f}`).mtimeMs));
    if (newest("src") > statSync("lib/index.js").mtimeMs) {
      const { BUILD_OUTDIR: _redirected, ...env } = process.env;
      expect(Bun.spawnSync(["bun", "run", "build"], { env }).exitCode).toBe(0);
    }
    // A dummy credential, because `eval.sh` refuses (exit 4) when the variable its DSH_HOME names
    // is unset — with it unset, dsh opens a session and hangs with no error, and a whole wave was
    // spent that way.
    const keyenv = Bun.spawnSync(["bash", "-c", `grep -oE 'apiKeyEnv: *[A-Z0-9_]+' "\${DSH_HOME:-$HOME/.dsh}/settings.yaml" 2>/dev/null | head -1 | awk '{print $2}'`]);
    const varName = new TextDecoder().decode(keyenv.stdout).trim();
    // …and `EVAL_CMD`, because the dummy credential is exactly what makes `dsh` unusable HERE: the
    // gateway answers `AUTH: 401` in well under a second, so the process exits before the alarm
    // fires and the script reports `crash`, not `timeout`. Measured across six identical runs:
    // 142, 1, 142, 1, 1, 1 — the assertion was turning on gateway latency. A command that simply
    // outlasts the alarm makes the branch under test the alarm, not dsh. `perl -esleep(30)` rather
    // than `sleep 30`: this environment refuses a foreground `sleep`, and the refusal exits fast
    // enough to reproduce the very flake being fixed.
    const evalHome = mkdtempSync(join(tmpdir(), "dsh-eval-harness-"));
    mkdirSync(join(evalHome, "profiles/headless/node_modules"), { recursive: true });
    symlinkSync(process.cwd(), join(evalHome, "profiles/headless/node_modules/dsh-generative-ui"));
    writeFileSync(join(evalHome, "settings.yaml"), "");
    const proc = Bun.spawnSync(["bash", "scripts/eval.sh", "写一个非常复杂的看板应用"], {
      env: { ...process.env, DSH_HOME: evalHome, EVAL_TIMEOUT: "1", EVAL_CMD: "perl -esleep(30)", ...(varName === "" ? {} : { [varName]: "test-only-never-sent" }) },
    });
    rmSync(evalHome, { recursive: true, force: true });
    expect(proc.exitCode).toBe(3);
    // `toStartWith`, not `toContain`: an earlier version let SIGALRM kill the subshell, and the
    // shell announces that — `95054 Alarm clock: 14  perl -e …` arrives ahead of the verdict, so
    // anything reading the first line of a batch gets a job-control message instead of `timeout`.
    expect(new TextDecoder().decode(proc.stdout)).toStartWith("timeout");
    expect(new TextDecoder().decode(proc.stderr)).not.toContain("Alarm clock");
  },
  120_000,
);

// The failure that cost an afternoon: the profile's plugin was a symlink to a *different* checkout,
// so six prompt A/Bs in a row measured one unchanged prompt. Nothing about a stale build looks
// wrong — the runs succeed and produce exactly the numbers an ineffective rule would.
test("a plugin symlink pointing elsewhere is refused", () => {
  expect(script).toContain("stale  the headless profile loads");
  expect(script).toMatch(/exit 4/);
});

test("a build older than the source is refused", () => {
  expect(script).toContain("(node half) is newer than lib/index.js");
});

// The two halves are not the same failure, and conflating them cost a wave 67 of its 72 runs:
// three edited files under `src/client/` — which compile into `lib/client.js` and only change how
// a card RENDERS — were scanned against `lib/index.js`, the half that carries the prompt and the
// skill the eval is actually measuring. A render change means re-shoot the screenshots; it is not
// a reason to throw the verdicts away.
// Five waves were lost to the same thing: an edit to `src/` in another window while jobs were in
// flight. The `bun run build` guard stops the rebuild but cannot stop the edit, and the mtime
// check then calls every run stale — wave 5 lost 27 of 72 that way. So a wave now freezes the
// plugin into its own directory and points the eval homes there; a frozen copy cannot go stale,
// and the two mtime checks are about a tree that can still change.
test("a run against a frozen wave snapshot skips the staleness checks", () => {
  expect(script).toMatch(/\*\/waves\/w\[0-9\]\[0-9\]\[0-9\]\/plugin\)/);
  // Both checks must be gated, not just one: the node half is what makes a verdict void, and the
  // client half is what makes a screenshot void — a snapshot invalidates neither.
  expect([...script.matchAll(/\$exec_frozen" = no/g)].length).toBe(2);
});

// …and the pin must not become a way to measure the wrong tree: a link to any OTHER checkout is
// still refused, which is the failure that cost an afternoon of A/Bs before this guard existed.
test("a link somewhere other than a wave snapshot is still refused", () => {
  expect(script).toContain("the headless profile loads");
});

test("a stale client half is a note, not a refusal", () => {
  expect(script).toContain("RE-SHOOT the screenshots");
  // The node-half check must not see `src/client/` at all, or the note is unreachable.
  expect(script).toMatch(/-path "\$here\/src\/client" -prune/);
});

// A day of measuring left 2,143 `tmp.XXXXXXXX` conversations in the user's sidebar against 85 real
// ones: dsh writes one session per working directory, and this script makes a fresh one per run.
// The fix is an eval home, and it is only a fix while the default is unset — someone "simplifying"
// this back to `${DSH_HOME:-$HOME/.dsh}` would refill the sidebar with no test failing.
test("runs default to an eval home, not the user's", () => {
  expect(script).toContain('export DSH_HOME="$HOME/.dsh-eval"');
  // Symlinked rather than copied: a stale credential copy fails as an auth error that reads
  // exactly like a refused rule.
  expect(script).toContain("ln -sf");
});

// The grid must stop rather than record a stale run as a data point.
test("run-fixtures aborts on a stale plugin", () => {
  const grid = readFileSync("scripts/run-fixtures.sh", "utf8");
  expect(grid).toMatch(/stale\*\)/);
});

# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Run one wave: 12 turns x 3 models x 2 samples, each with its real conversation context.

The context matters and is not decoration. Half the corpus turns are unintelligible alone —
`nah bro that is from today` is a diet-log correction only because the previous ten turns were
adding up calories. Sampling first turns to dodge that measured a distribution nobody has.

The summary is handed to the model as PRIOR CONTEXT, clearly labelled, rather than replayed as
fake turns: dsh would otherwise believe it had itself said those things, and a card built on a
false memory of its own output is not what production does either.

Usage: uv run run-wave.py <wave-index> [samples]
"""
import concurrent.futures as cf, hashlib, re, json, os, pathlib, shutil, subprocess, sys

# Defaults under `~/.cache`, not `/tmp`: macOS reaps /tmp and took every wave from w001 to
# w019 with it — cards, screenshots and verdicts, all of it paid for in real model calls.
from wave_root import ROOT
REPO = pathlib.Path(__file__).resolve().parent.parent
# WHICH MODELS A WAVE SAMPLES.
#
# The first three are what dsh actually runs, so a rule is worth shipping when it holds on them.
# The other four are here for two reasons, and the second one matters more:
#
# 1. Throughput. `macaron-v1-*` share a backend capped at 3 concurrent, so a wave whose work is
#    mostly theirs runs 3-wide no matter how many workers exist — wave 5's retry was 27 macaron
#    jobs taking ~25 minutes with glm's three slots idle the whole time. Different upstreams fill
#    those slots instead of queueing behind a limit that is not theirs.
# 2. Evidence. A prompt rule that only holds on three models from two families is a rule about
#    those families. `font-semibold` going to zero is worth much more when it does so on Gemini,
#    Grok, GPT and Claude too — and a rule that holds on six models and fails on the seventh has
#    told you something specific, which one that holds on three cannot.
#
# Each needs its own eval home (`scripts/eval-home.sh <model>`), because a home carries exactly
# one default model and they must not share a settings.yaml.
DEFAULT_MODELS = ["macaron-v1-venti", "macaron-v1-coding-venti", "glm-5.2", "gemini-3.7-flash", "grok-4.6", "gpt-5.6-terra"]
# Overridable, because the panel is a QUESTION, not a constant. Comparing the four MoL LoRA arms
# (`macaron-v1-venti:l0`…`:l3`) asks whether an adapter changes what gets built, which the default
# six cannot answer and which copying this file to answer would fork the freeze, the gates and the
# cache. `WAVE_MODELS=a,b,c`; each still needs its own home from `eval-home.py`.
MODELS = [m.strip() for m in os.environ["WAVE_MODELS"].split(",")] if os.environ.get("WAVE_MODELS") else DEFAULT_MODELS
# No Anthropic model: the headless profile composes `tool-web`, and every claude-* on this gateway
# answers a request carrying it with `The use of the web search tool is not supported` (400).
# Measured on sonnet-5, sonnet-4-6 and opus-4-8 — a gateway capability gap, not a model one, so
# revisit if the gateway changes rather than assuming the family cannot be sampled.

# Which upstream a model queues behind; models sharing one share its concurrency budget.
def upstream_of(model):
    if model.startswith("macaron-v1"): return "macaron"
    if model.startswith("glm"): return "glm"
    if model.startswith("gemini"): return "gemini"
    if model.startswith("grok"): return "grok"
    if model.startswith("gpt"): return "gpt"
    return "anthropic"
WAVE = int(sys.argv[1])
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 2

outdir = ROOT / "waves" / f"w{WAVE:03d}"; outdir.mkdir(parents=True, exist_ok=True)
# Snapshot the wave into its own directory on first run and read it from there afterwards.
# `waves.json` is regenerated whenever the sample pool grows, and a wave that re-reads it
# mid-flight silently changes the questions under itself — this run lost 48 of its 72 runs
# that way, and the surviving 24 looked like a complete wave with a smaller denominator.
snap = outdir / "wave.json"
if not snap.exists():
    snap.write_text(json.dumps(json.loads((ROOT / "waves.json").read_text())[WAVE], ensure_ascii=False))
wave = json.loads(snap.read_text())

def prompt_for(r):
    prev = r["prev"].strip()
    turn = r["q"].replace("用户：", "").strip()
    return (f"以下是我们此前对话的摘要，供你了解上下文：\n\n{prev}\n\n"
            f"---\n\n（以上是此前的对话。现在是我这一轮说的话：）\n\n{turn}")

def keep_canvases(verdict, tag):
    """Copy a run's canvas sources into the wave, if the sandbox still holds them.

    `eval.sh` rescues them out of the run's `mktemp -d`, but only as far as a sibling of the reply
    — still under /var/folders, still reclaimed on the system's schedule. A canvas card's source is
    half a wave (wave 7: canvas=21, fence=22, and grok-4.6 wrote no fences at all), so without this
    every source-level statistic keeps covering the fence half only.
    """
    kept = re.search(r"canvases=(\S+)", verdict)
    if not (kept and pathlib.Path(kept.group(1)).is_dir()): return
    target = outdir / "canvases" / tag
    if not target.exists(): shutil.copytree(kept.group(1), target)

def run(job):
    i, model, s = job
    r = wave[i]
    tag = f"{i:02d}-{model}-s{s}"
    dest = outdir / f"{tag}.txt"
    # Cache only a POSITIVELY IDENTIFIED success. Enumerating failure strings was tried and it
    # leaked: `bash: ./scripts/eval.sh: Operation not permitted` is not `crash/` or `Terminated`
    # or `timeout after`, so 58 of wave 3's 72 runs were written to disk as legitimate "0 cards"
    # answers and cached forever. `eval.sh` emits exactly one shape on success — a line starting
    # `skill=` — and every failure path (stale, timeout, crash/*, and anything the SHELL says
    # before eval.sh even runs) is something else. So test for the success, not against the list.
    if dest.exists() and dest.read_text().startswith("skill="):
        # A cached run must still get its canvas sources copied. Returning here without doing so
        # was the bug dc9fb5a exists to prevent, reintroduced through the replay path: a wave
        # resumed after an interruption would carry canvases for the fresh runs only, and every
        # source-level statistic over it would quietly cover a subset. The sandbox may already
        # have been reclaimed, in which case there is nothing to rescue and nothing to report —
        # the copy is best-effort by nature.
        keep_canvases(dest.read_text(), tag)
        return tag, "cached"
    env = {**os.environ, "DSH_HOME": os.path.expanduser(f"~/.dsh-eval-{model}"), "EVAL_TIMEOUT": "900"}
    p = subprocess.run(["./scripts/eval.sh", prompt_for(r)], cwd=REPO, env=env,
                       capture_output=True, text=True, timeout=1200)
    dest.write_text(p.stdout + p.stderr)
    # `eval.sh` rescues the canvas sources out of the run's `mktemp -d`, but only as far as a
    # sibling of the reply — still under /var/folders, still reclaimed. A canvas card's source is
    # half the wave (wave 7: canvas=21, fence=22, and grok-4.6 wrote no fences at all), so without
    # this every source-level statistic keeps covering the fence half only.
    keep_canvases(p.stdout, tag)
    return tag, (p.stdout.strip().splitlines() or ["(empty)"])[0][:90]

jobs = [(i, m, s) for i in range(len(wave)) for m in MODELS for s in range(SAMPLES)]
# `lib/` is not in git (it is built by `prepare`), so a fresh clone has none — and every read of
# it below, starting with the fingerprint, would raise a bare FileNotFoundError traceback instead
# of naming the one command that fixes it. This is the first line that touches the directory.
for half in ("index.js", "client.js"):
    if not (REPO / "lib" / half).exists():
        sys.exit(f"wave {WAVE} refused to start — lib/{half} does not exist. Run `bun run build` first.")

# Fingerprint the halves separately. `lib/index.js` carries the prompt and the skill and is what
# decides whether a card is attempted at all — a change there mid-wave invalidates the run. A
# change in `lib/client.js` only alters how a card RENDERS, so the runs stay valid and the
# screenshots have to be retaken. `bun test` rebuilds both, so this moves more often than expected.
def fp():
    import hashlib
    return {f: hashlib.md5((REPO / "lib" / f).read_bytes()).hexdigest()[:8] for f in ("index.js", "client.js")}
before = fp()
# Freezing a STALE `lib/` freezes the wrong prompt, and `eval.sh` cannot catch it: its staleness
# check deliberately skips a frozen snapshot ("a frozen copy cannot change"), which is true and
# beside the point — what matters is whether `lib/` was current at the moment it was frozen.
# Measured: wave 9 froze a `lib/` three commits behind `src/`, because those commits landed while
# wave 8 held the build lock, so it silently tested none of the three rules it was started for.
# Asked HERE rather than beside the snapshot it protects: this costs two stat()s, and the live
# probe below costs a real model call per upstream — a stale tree should not pay for that first.
# `src/client/` is EXCLUDED, the same way `eval.sh` prunes it: the client half only decides how a
# card renders, so a stale one costs the screenshots and leaves every verdict standing. A wave once
# lost 67 of 72 runs to three edited files under it, and checking all of `src/` here reintroduced
# exactly that — the frozen snapshot a wave reads is the node half.
cutoff = (REPO / "lib" / "index.js").stat().st_mtime
client = REPO / "src" / "client"
newer = [q for q in (REPO / "src").rglob("*.ts*") if client not in q.parents and q.stat().st_mtime > cutoff]
if newer:
    sys.exit(f"wave {WAVE} refused to start — lib/index.js is older than {len(newer)} file(s) in src/ "
             f"(e.g. {newer[0].relative_to(REPO)}). Run `bun run build` first, or the wave freezes the wrong prompt.")

# `eval.sh`'s guards (stale build, wrong symlink, missing credential) exit 4 in milliseconds, and
# a wave that hits one does not fail — it "completes". Measured: waves 5 through 9 reported
# `WAVE DONE ... 72 runs` across four seconds, 360 files all reading `stale  src/ is newer than
# lib/`, and the reflection that followed was written about them. So ask the guards ONCE, before
# spending anything: a wave with nothing to measure should refuse to start, not finish instantly.
# FREEZE what the wave reads. Each eval home reaches the plugin through a symlink into this
# working copy, so every job re-reads `lib/` as it starts — and an edit to `src/` plus any rebuild
# lands under jobs already in flight. That has now cost five waves: the `bun run build` guard stops
# the rebuild but cannot stop the EDIT, and `eval.sh`'s mtime check then calls the run stale. This
# wave lost 27 of 72 that way while `$dsh/web` was being written in another window.
#
# So the wave gets its own copy and points the homes at it: `src/` is then free to move, the
# fingerprint below cannot change under the run, and the numbers are about one prompt. Restored in
# a `finally` — a wave that dies mid-flight must not leave the homes pointing into /tmp.
snapshot = ROOT / "waves" / f"w{WAVE:03d}" / "plugin"
if snapshot.exists(): shutil.rmtree(snapshot)
snapshot.mkdir(parents=True)
# WHAT to freeze comes from `package.json`'s own `files`, not a list beside it. The hand-written
# list said `lib, types, package.json` and missed `cordis.patch.yml` — which `dsh.bundle.patch`
# names, so dsh refused to boot through the snapshot and all 72 jobs died `crash/nosession` in
# under a minute. `files` is what npm publishes: anything the plugin needs at runtime is in it by
# construction, and a file added there later is picked up without anyone remembering this line.
frozen = json.loads((REPO / "package.json").read_text()).get("files", [])
for item in [*frozen, "package.json"]:
    src = REPO / item
    if not src.exists(): continue
    (shutil.copytree if src.is_dir() else shutil.copy2)(src, snapshot / item)
# `node_modules` is SYMLINKED, not copied: `lib/index.js` imports real packages (`schemastery`,
# the dsh peers) and a copy in /tmp resolves none of them — measured, every job of wave 6 died with
# `Cannot find package '@deepseek-ai/schemastery'` before reaching a model. A symlink is safe here
# where a copy of `lib/` is not: the wave never writes to node_modules, and installing into it
# mid-wave is the same mistake as rebuilding, caught by the same instinct rather than by this.
(snapshot / "node_modules").symlink_to(REPO / "node_modules")
LINK = "profiles/headless/node_modules/dsh-generative-ui"
homes = [pathlib.Path(os.path.expanduser(f"~/.dsh-eval-{m}")) / LINK for m in MODELS]
# Restore to the CHECKOUT, not to whatever the link happened to hold. Recording the current
# value looks equivalent and is not: a wave that dies before its `finally` leaves the homes
# pointing into its own snapshot, and every wave after it then faithfully "restores" them to
# that dead snapshot. Measured — six homes were still pointing at w006's plugin four waves
# later, and `eval.sh` cannot catch it because a `waves/wNNN/plugin` link is exempt from the
# stale check by design. The checkout is the only correct resting state.
restore = [(h, str(REPO)) for h in homes if h.is_symlink()]
for h, _ in restore:
    h.unlink(); h.symlink_to(snapshot)
# A REAL run, not a stubbed one, through the SNAPSHOT the jobs will read. The guards above are
# static checks and a stub would clear them while telling us nothing about the credential's
# VALUE: a key that is set but rejected produces `AUTH: 401` on every job, 72 times, and the wave
# still reports DONE. Measured — that is how the second attempt at wave 5 was lost, minutes after
# the stale-build guard had just been added for the first.
#
# AFTER the freeze and the relink, not before. Run before them it probed the CHECKOUT, and the
# snapshot it was vouching for was missing a file dsh boots through — 72 jobs, every one
# `crash/nosession`, wave "DONE" in under a minute. A probe that does not go through the same
# symlink is not a probe of this wave.
#
# One probe PER MODEL HOME, because that is the thing being checked. The first version ran a
# single probe under the default `DSH_HOME`, whose model is neither of the three — it failed on
# an unrelated upstream 400 and refused a wave that would have run fine. Each home carries its
# own settings.yaml and its own credential, so only its own turn can clear it.
#
# Concurrently: six independent homes, six independent upstreams, nothing shared. Serially the
# floor is the SUM of six timeouts — 18 minutes of nothing before the wave starts, if one upstream
# is hanging rather than answering — where in parallel it is the slowest single probe.
def probe_home(model):
    p = subprocess.run(["bash", str(REPO / "scripts" / "eval.sh"), "hi"], cwd=REPO,
                       env={**os.environ, "DSH_HOME": os.path.expanduser(f"~/.dsh-eval-{model}"), "EVAL_TIMEOUT": "180"},
                       capture_output=True, text=True)
    if p.returncode == 0: return None
    line = ((p.stdout + p.stderr).strip().splitlines() or [f"eval.sh exited {p.returncode}"])[0]
    return f"{model}: {line[:160]}"
# Tell `bun run build` a wave owns `lib/`. The pid is the point: a lock left behind by a wave that
# crashed answers `kill -0` with ESRCH, so it cannot block a build forever the way the earlier
# pgrep guard did. Removed in the same `finally` that restores the symlinks.
lock = REPO / ".wave-running"
lock.write_text(str(os.getpid()))
print(f"wave {WAVE}: {len(jobs)} runs  lib={before}  frozen at {snapshot}", flush=True)
# One budget per UPSTREAM, not one for the wave. `macaron-v1-*` share a backend that stalls above
# three concurrent requests — and stalling arrives as 900 seconds of silence, not an error — while
# `glm-5.2` is a different backend behind the same gateway and is not bound by that. A single pool
# of 3 would leave glm idle two thirds of the time for no reason.
import threading
# One budget per UPSTREAM, keyed by `upstream_of`. `macaron-v1-*` share a backend that stalls
# above three concurrent — and stalling arrives as 900 seconds of silence, not an error — while
# every other family is a different backend behind the same gateway and is not bound by that.
# A single shared pool would make the slowest upstream's limit everyone's: measured, wave 5's
# retry was 27 macaron jobs running 3-wide for ~25 minutes with every other slot idle.
GATES = {u: threading.Semaphore(3) for u in {upstream_of(m) for m in MODELS}}
def gated(job):
    with GATES[upstream_of(job[1])]: return run(job)
try:
    # Inside the `try`, so the `finally` below is what puts the homes back — a refusal here used
    # to restore them by hand, one more copy of the same three lines to keep in step.
    with cf.ThreadPoolExecutor(max_workers=len(MODELS)) as ex:
        refused = [r for r in ex.map(probe_home, MODELS) if r is not None]
    # Grouped by REASON, not listed per home: a missing credential is every home's answer at once,
    # and six copies of one sentence buries the case where only one upstream is actually down.
    if refused:
        by_reason = {}
        for model, reason in (r.split(": ", 1) for r in refused): by_reason.setdefault(reason, []).append(model)
        sys.exit(f"wave {WAVE} refused to start — " + "; ".join(f"{', '.join(ms)}: {why}" for why, ms in by_reason.items()))
    # Enough workers for every upstream to hold its full budget at once; the semaphores,
    # not the pool, are what keeps any one backend from being overrun.
    with cf.ThreadPoolExecutor(max_workers=3 * len(GATES)) as ex:
        for tag, line in ex.map(gated, jobs):
            print(f"  {tag}: {line}", flush=True)
finally:
    lock.unlink(missing_ok=True)
    for h, target in restore:
        if h.is_symlink(): h.unlink()
        h.symlink_to(target)
after = fp()
if after["index.js"] != before["index.js"]:
    print(f"CONTAMINATED: lib/index.js changed mid-wave ({before['index.js']} -> {after['index.js']}) — the prompt moved under the run", flush=True)
elif after["client.js"] != before["client.js"]:
    print(f"note: lib/client.js changed mid-wave ({before['client.js']} -> {after['client.js']}) — verdicts stand, RE-SHOOT the screenshots", flush=True)
print("WAVE DONE", WAVE, flush=True)

# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx~=0.28", "pyyaml~=6.0", "pillow~=11.0"]
# ///
"""One round: every case against every model, then the judge panel.

Three things this does that a plain `for case: for model:` would not.

**It freezes the plugin.** `lib/` is copied into the round's own directory and each eval home's
`dsh-generative-ui` symlink is repointed at that copy for the duration. Five waves in this repo's
history were lost to a `src/` edit in another window moving the prompt under jobs already running,
and every guard that watched the ACTION (building) missed an editor that simply saved a file.
Guarding the ARTEFACT needs one copy. Restored in a `finally`.

**It budgets by upstream, not by job.** Six of these models sit behind three gateways and one of
them (`mintcn`) 502s above three in flight; a single global limit either starves the fast ones or
melts the slow one. One semaphore per upstream, plus one for chromium, which is memory rather than
rate.

**It keeps partial runs.** A conversation cut off at turn six is six turns of evidence. The runs
that get discarded are the ones whose text says the process died, never the ones that ran short.
"""
import argparse, asyncio, importlib.util, json, os, pathlib, shutil, signal, subprocess, sys, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cases import CASES, BY_ID
import drive, judge

REPO = pathlib.Path(__file__).resolve().parent.parent
ROOT = pathlib.Path(os.environ.get("UI4A_ROOT", pathlib.Path.home() / ".cache" / "ui4a-suite"))
MODELS = ["macaron-v1-venti", "macaron-v1-coding-venti", "glm-5.2", "gemini-3.7-flash", "grok-4.6",
          "gpt-5.6-terra", "kimi-k3", "minimax-m3", "glm-5.3-flash", "step-3.7-flash"]
# Which gateway a model queues behind, and how many it will take. Read off `~/litellm_config.yaml`
# on the gateway host rather than guessed: `mintcn` carries the whole macaron family AND glm-5.2,
# and the macaron arms 502 under sustained double-digit concurrency.
UPSTREAM = {"macaron-v1-venti": ("mintcn", 3), "macaron-v1-coding-venti": ("mintcn", 3), "glm-5.2": ("mintcn", 3),
            "glm-5.3-flash": ("novita", 4), "minimax-m3": ("novita", 4), "step-3.7-flash": ("novita", 4),
            "kimi-k3": ("pi-api", 2), "gpt-5.6-terra": ("copilot", 3), "grok-4.6": ("copilot", 3),
            "gemini-3.7-flash": ("copilot-b", 3)}
# How many conversations are in flight at once. The binding resource is MEMORY, not rate: each run
# holds a dsh (node), a chromium with two pages, and a python — about 400MB together, so the cap is
# what can be added without making the machine thrash, not what the gateways would accept.
#
# **Thrashing does not look like thrashing.** At 8 the machine ran `vm.swapusage` down to 2.7 of
# 17.4 GB free and the round filled with `ConnectionResetError: Connection lost` (15) and
# `dsh exited before announcing a port` (3) — every one of which reads as an upstream or a model
# fault, and none of which is. No single process was large; the largest was 0.3 GB. The tell is
# swap, not anything visible in `ps`. Dropping to 5 cleared it, and the run that had just failed
# at 462s finished in 249s.
RUNS = int(os.environ.get("UI4A_RUNS", 5))


def freeze(round_dir: pathlib.Path) -> pathlib.Path:
    """Copy what dsh loads into the round, so an edit to `src/` cannot move it mid-run."""
    frozen = round_dir / "plugin"
    if frozen.exists(): return frozen
    frozen.mkdir(parents=True)
    # Exactly what `package.json`'s `files` and `dsh.bundle.patch` name. Copying only lib/ and
    # types/ left out `cordis.patch.yml`, and dsh refuses to boot at all without the overlay a
    # plugin declares — `failed to read overlay …: ENOENT`, before a single run reaches a model.
    for name in ("package.json", "cordis.patch.yml", "lib", "skill", "types"):
        source = REPO / name
        if not source.exists(): sys.exit(f"wave: {source} is missing — run `bun run build` first")
        (shutil.copytree if source.is_dir() else shutil.copy2)(source, frozen / name)
    # Dependencies are SYMLINKED, not copied. `lib/index.js` imports `@deepseek-ai/schemastery` and
    # friends, which resolve out of the plugin's own node_modules — a frozen copy without them does
    # not load at all. They are also not what a wave is protecting itself from: the thing that moves
    # mid-run is `src/`, and `node_modules` is 700MB that would be copied per round for nothing.
    (frozen / "node_modules").symlink_to(REPO / "node_modules")
    return frozen


def frozen_cases(round_dir: pathlib.Path) -> list[dict]:
    """The case list this round started with, frozen beside the plugin on first use.

    **The case list defines the round, and a resume used to re-read the live one.** r007 died at
    24/300 and the process that restarted it imported `cases.py` as it stood by then — three cases
    newer than the round. Adding was harmless; editing an existing case would have split the round
    between two versions of it with nothing in the output naming which cells got which. `freeze()`
    already protects what the MODEL reads; this protects what the round IS.

    Copied rather than dumped as JSON so a later reader can diff it against `eval/cases.py` and see
    exactly what a round asked, comments and personas included.
    """
    frozen = round_dir / "cases.py"
    if not frozen.exists():
        shutil.copy2(REPO / "eval" / "cases.py", frozen)
        return CASES
    spec = importlib.util.spec_from_file_location(f"cases_{round_dir.name}", frozen)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if [c["id"] for c in module.CASES] != [c["id"] for c in CASES]:
        print(f"wave: using the {len(module.CASES)} cases frozen at {frozen}, "
              f"not the {len(CASES)} in eval/cases.py", flush=True)
    return module.CASES


def repoint(models: list[str], target: pathlib.Path) -> dict[pathlib.Path, str]:
    """Point every eval home at `target`, returning what each link should be restored to.

    Restored to the REPO, not to whatever the link happened to say. A wave killed with SIGTERM
    never runs its `finally`, so the next wave reads a link still pointing at the previous round's
    frozen copy and faithfully puts it back on exit — leaving every home loading a snapshot the
    next round will delete. The canonical value is the checkout; a frozen path is debris.
    """
    was = {}
    for model in models:
        link = pathlib.Path.home() / f".dsh-ui4a-{model}" / "profiles" / "headless" / "node_modules" / "dsh-generative-ui"
        if not link.parent.is_dir(): sys.exit(f"wave: {link.parent} is missing — run `uv run eval/homes.py {model}`")
        current = os.readlink(link) if link.is_symlink() else ""
        was[link] = str(REPO) if current == "" or "/rounds/" in current else current
        if link.is_symlink(): link.unlink()
        elif link.exists(): sys.exit(f"wave: {link} is a real directory, not a link — refusing to replace it")
        link.symlink_to(target)
    return was


async def harnesses(light: int, dark: int) -> list[subprocess.Popen]:
    """The two surface servers, shared by every run: they hold no per-card state."""
    procs = []
    for port, theme in ((light, "light"), (dark, "dark")):
        log = open(ROOT / f"harness-{theme}.log", "ab")
        procs.append(subprocess.Popen(["bun", str(REPO / "scripts" / "surface-harness.ts"), str(port)],
                                      cwd=str(REPO), env={**os.environ, "THEME": theme}, stdout=log, stderr=log))
    import httpx
    async with httpx.AsyncClient(timeout=5) as client:
        for port in (light, dark):
            for _ in range(60):
                try:
                    if (await client.get(f"http://127.0.0.1:{port}/")).status_code == 200: break
                except Exception: pass
                await asyncio.sleep(0.5)
            else: sys.exit(f"wave: the surface harness never came up on {port}")
    return procs


async def judge_round(round_dir: pathlib.Path, metas: list[dict]) -> None:
    """The panel over one round's runs, writing `verdicts.json`.

    Split out so `--judge-only` re-scores a round that already ran. That is not a convenience: the
    judge's own message changed once already (the image budget), and a round judged before the
    change cannot be compared with one judged after — the cache keys on the image bytes, so the
    runs whose content did not change replay for free and only the affected ones cost anything.
    """
    print("\njudging…", flush=True)
    panel = asyncio.Semaphore(4)

    async def score(meta):
        out = round_dir / meta["case"] / meta["model"]
        async with panel:
            try: return {"case": meta["case"], "model": meta["model"], **(await judge.judge_run(out))}
            except Exception as error: return {"case": meta["case"], "model": meta["model"], "status": f"error: {error}"[:200]}

    verdicts = await asyncio.gather(*[score(m) for m in metas if m["turns"]])
    (round_dir / "verdicts.json").write_text(json.dumps(verdicts, ensure_ascii=False, indent=1))
    scored = [v for v in verdicts if v.get("status") == "ok"]
    print(f"scored {len(scored)}/{len(verdicts)}")
    if scored:
        keys = ["trigger", "clarify", "interaction", "hierarchy", "craft", "overall"]
        print("  " + "  ".join(f"{k}={sum(v['mean'][k] for v in scored) / len(scored):.2f}" for k in keys))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("round")
    ap.add_argument("--cases", default="", help="comma-separated ids; default all")
    ap.add_argument("--models", default="", help="comma-separated; default all ten")
    # 2700, because a round is only comparable to the one before it if the clock is the same.
    # r006 was run with `--timeout 2700` and r007 took this default of 1500 — the models were not
    # slower (r007's median run was 417s against r006's 464s), the clock was shorter, so r007
    # ended 20 runs early against r006's 1. That alone flipped the headline: `delta.py`'s clean
    # row drops any pair where either side was cut short, and in r006 "cut short" meant a model
    # producing garbage (28 of 29, mean 2.00) while in r007 it meant a good run hitting the wall
    # (20 of 24, mean 6.04). Conditioning on it removed 20 of r007's BEST runs and 28 of r006's
    # worst, and manufactured overall -0.520 +/- 0.161 out of a round that was flat (-0.002).
    ap.add_argument("--timeout", type=float, default=2700, help="per multi-turn run; single-turn gets a fifth")
    ap.add_argument("--light", type=int, default=47801); ap.add_argument("--dark", type=int, default=47802)
    ap.add_argument("--no-judge", action="store_true")
    ap.add_argument("--judge-only", action="store_true", help="re-score a round that already ran; runs nothing")
    args = ap.parse_args()

    round_dir = ROOT / "rounds" / args.round
    round_dir.mkdir(parents=True, exist_ok=True)
    cases = [BY_ID[c] for c in args.cases.split(",")] if args.cases else frozen_cases(round_dir)
    models = args.models.split(",") if args.models else MODELS
    ROOT.mkdir(parents=True, exist_ok=True)
    # Before `freeze`, deliberately: freezing copies the CURRENT `lib/` over the snapshot this
    # round was measured against, so a re-score would quietly rewrite the record of what ran.
    if args.judge_only:
        metas = [json.loads(p.read_text()) for p in sorted(round_dir.glob("*/*/meta.json"))]
        return await judge_round(round_dir, [m for m in metas if m["status"] in ("complete", "timeout")])
    # BEFORE `freeze`/`repoint`, and that ordering is the whole point. The first version of this
    # check sat after `repoint()` and its `sys.exit` skipped the `finally` that puts the model
    # homes back — so a guard written to stop a round being lost left every model's plugin symlink
    # pointing at a probe round that was then deleted, and killed the live wave it was meant to
    # protect. A pre-flight check must not be able to leave state behind, so it runs before there
    # is any state to leave.
    #
    # What it reads is what `dsh` reads at boot. macOS revokes a Desktop grant without warning and
    # without a prompt, and the symptom downstream is not "permission denied" anywhere useful — it
    # is every model appearing to produce nothing. Twice now a round has been lost to it
    # (`rounds/r001-POISONED-by-perm-loss` is the other). Refusing to start costs one syscall.
    # Sweep what the LAST wave left behind, before adding to it. `drive.run` spawns a dsh and a
    # chromium per run and closes them in its own `finally`; a wave killed hard never reaches that,
    # and the children are reparented to init and keep their memory. Measured: three killed waves
    # left **18 orphan dsh processes**, and that — not the gateways — is what produced the
    # connection-reset storm the `RUNS` note above describes.
    #
    # Safe to test by `ppid == 1` HERE and nowhere else: no legitimate wave is running yet, so
    # anything matching is stale. Mid-flight the same test is WRONG — `subprocess.Popen`'s harness
    # children also report `ppid 1` under asyncio, and sweeping on it killed the live round's two
    # servers, after which every card silently failed to mount.
    stale = [line.split() for line in subprocess.run(["ps", "-axo", "pid=,ppid=,command="], capture_output=True, text=True).stdout.splitlines()
             if ("dsh --profile headless" in line or "card-driver.mjs" in line) and line.split()[1] == "1"]
    for pid, *_ in stale:
        try: os.kill(int(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError): pass
    if stale: print(f"wave: swept {len(stale)} orphan process(es) from an earlier run", flush=True)

    try:
        drive.PATCH.read_bytes()
    except OSError as error:
        sys.exit(f"wave: cannot read {drive.PATCH} ({error.__class__.__name__}: {error}).\n"
                 f"      dsh reads this file at boot, so every run would die before reaching a model.\n"
                 f"      On macOS this is usually the Desktop/Documents grant disappearing: re-tick the\n"
                 f"      terminal under System Settings > Privacy & Security > Files and Folders.")

    frozen = freeze(round_dir)
    (round_dir / "manifest.json").write_text(json.dumps(
        {"cases": [c["id"] for c in cases], "models": models, "user_agent": drive.USER_AGENT_MODEL,
         "judges": judge.JUDGES, "timeout": args.timeout, "started": time.time()}, indent=1))

    # `eval/bin` FIRST on PATH, for every process this wave spawns. It holds a refusing `open`.
    # The models under test have bash, and one asked to build a layout reasonably decides to look
    # at what it built — on macOS `open foo.html` launches the machine owner's browser. Measured
    # during r004: a `css-layout` run opened its own `layout-demo.html` in the face of someone who
    # was not running the eval. An eval must not reach outside itself.
    os.environ["PATH"] = f"{REPO / 'eval' / 'bin'}{os.pathsep}{os.environ['PATH']}"

    gates = {name: asyncio.Semaphore(size) for name, size in {u: n for u, n in UPSTREAM.values()}.items()}
    inflight = asyncio.Semaphore(RUNS)
    lock = REPO / ".wave-running"
    # **Read it before writing it, and BEFORE `repoint`.** Two separate lessons in one guard.
    #
    # The lock has carried the owner's pid since it was added and nothing ever looked: `wave.py`
    # overwrote it, so a second wave on the same round started happily and two processes wrote the
    # same cells. That happened — a watchdog `rm -f`'d what it took for a crash leftover while the
    # owner was alive and mid-round, and only a `ps` afterwards found the pair. The information
    # needed to tell live from dead was inside the file the whole time. `ps -p` rather than
    # `kill -0`, which succeeds for a zombie, and matched against the command line so a recycled
    # pid belonging to something else does not read as a live wave.
    #
    # The placement is the second lesson, and this file already teaches it about the credential
    # pre-flight: a check whose `sys.exit` skips the `finally` must run before there is any state
    # to leave behind. The first version of THIS guard sat after `repoint`, and its refusal left
    # ten model homes pointed at a round's frozen plugin — caught only because the counterfactual
    # test that proved the guard works also proved it leaked.
    if lock.exists():
        owner = lock.read_text().strip()
        alive = owner.isdigit() and subprocess.run(["ps", "-p", owner, "-o", "command="],
                                                   capture_output=True, text=True).stdout.find("wave.py") >= 0
        if alive: sys.exit(f"wave: pid {owner} is already running a wave — refusing to start a second one")
        print(f"wave: clearing a lock left by dead pid {owner or '?'}", flush=True)
    restore = repoint(models, frozen)
    # The same lock `scripts/build.ts` already honours, naming this process so a dead wave's lock
    # is detectably dead. A round here is protected by its own frozen copy and would survive a
    # rebuild, but a `bun run build` in another window still churns `lib/` under whatever runs
    # next, and the pre-push hook rebuilt it mid-round once already.
    lock.write_text(str(os.getpid()))
    # A `finally` does not run when the process is killed, and every wave in this repo has ended by
    # hand at least once. Turning the signal into an exception is what lets the homes be put back.
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    servers = await harnesses(args.light, args.dark)
    done, started = 0, time.time()
    total = len(cases) * len(models)

    # ONE dead environment, not N dead runs. A wave lost its Desktop permission grant 42 runs in:
    # every `dsh` after that died in 0.1s on `EPERM` reading its own overlay, and the wave went on
    # to burn **173 of 220 slots** producing nothing but `error` rows over three hours. The failure
    # is not per-run and retrying it 173 times cannot help, so the first few teach us everything.
    #
    # Under a second means the model was never reached — a real run cannot finish that fast. Three
    # in a row is the trip, so a single flaky boot does not stop a wave.
    tripped: list[str] = []
    quick_deaths = 0

    async def one(case, model):
        nonlocal done, quick_deaths
        out = round_dir / case["id"] / model
        if (out / "meta.json").exists():
            meta = json.loads((out / "meta.json").read_text())
            # A cached run is replayed only if it actually ran. `error`/`running` mean the process
            # died, and caching that reads exactly like the model producing nothing.
            #
            # **A cached `timeout` was cut by whatever clock was in force THEN, not the one being
            # passed now** — and line 228 rewrites `manifest.json` with the new value regardless, so
            # a round can hold two clocks under a manifest asserting one. `delta.py` never reads the
            # clock, so nothing refuses the comparison. Raising `--timeout` to un-cut a round means
            # deleting its `timeout` cells first; this is what happened to r007 (moved aside to
            # `.r007-cut-at-1500`, not deleted, then re-run).
            if meta.get("status") in ("complete", "timeout"):
                done += 1
                return meta
        timeout = args.timeout if case["kind"] == "multi" else args.timeout / 5
        async with gates[UPSTREAM[model][0]], inflight:
            # INSIDE the semaphore, which is the only place this check means anything. It used to
            # sit above the `async with`, and that version fired its abort and then watched 60 more
            # runs fail anyway: `asyncio.gather` starts all 220 coroutines at once, so every one of
            # them ran past the check — finding `tripped` empty, because nothing had failed yet —
            # and then parked on the semaphore. By the time the trip happened they were all already
            # through the gate. Here, "the check" and "my turn to run" are the same moment.
            if tripped:
                return {"case": case["id"], "model": model, "status": "skipped", "turns": [], "elapsed": 0}
            meta = await drive.run(case, model, out, (args.light, args.dark), timeout)
        # Zero turns means the model was never reached — the signature of a boot that failed, and
        # the one thing a retry cannot change. This used to test `elapsed < 1`, which was true when
        # a dead boot returned in 0.1s and became FALSE the moment `drive.boot` learned to retry:
        # the same failure now takes ~90s, the guard stopped counting it, and **85 cells burned in
        # one 13-minute Desktop-grant outage with nothing stopping them**. A fix that slows a
        # failure down silently disables every guard that keyed on how fast it was.
        if meta.get("status") == "error" and not meta.get("turns"):
            quick_deaths += 1
            if quick_deaths >= 3 and not tripped:
                tripped.append(meta.get("error", "")[:300])
                print(f"\nWAVE ABORTED: three runs died before reaching the model. This is the environment, "
                      f"not the models — every queued run would fail the same way.\n{tripped[0]}\n", flush=True)
        else:
            quick_deaths = 0
        done += 1
        turns, cards = len(meta["turns"]), sum(len(t["cards"]) for t in meta["turns"])
        print(f"[{done}/{total}] {meta['status']:9} {case['id']:12} {model:24} turns={turns} cards={cards} {meta['elapsed']}s", flush=True)
        return meta

    try:
        metas = await asyncio.gather(*[one(c, m) for c in cases for m in models], return_exceptions=True)
    finally:
        # Ordered by what is expensive to get wrong, and each step guarded on its own, because a
        # cleanup that raises leaves every step after it undone. That happened: a TCC revocation
        # mid-round made `lock.unlink()` raise `PermissionError`, and because the lock came first
        # the ten model homes stayed pointed at this round's frozen plugin while the NEXT wave
        # refused to start against a lock whose owner was already dead. Homes first: a stranded
        # symlink silently changes what every later dsh loads, where a stranded lock only refuses
        # to start and says so.
        for link, was in restore.items():
            try:
                if link.is_symlink(): link.unlink()
                if was: link.symlink_to(was)
            except OSError as error: print(f"  could not restore {link}: {error}", flush=True)
        for proc in servers:
            try: proc.terminate()
            except OSError: pass
        try: lock.unlink(missing_ok=True)
        except OSError as error: print(f"  could not remove {lock}: {error} — delete it before the next wave", flush=True)

    ok = [m for m in metas if isinstance(m, dict)]
    print(f"\nWAVE {args.round}: {len(ok)}/{total} ran, {sum(1 for m in ok if m['status'] == 'timeout')} cut short, "
          f"{sum(1 for m in metas if not isinstance(m, dict))} failed, {round(time.time() - started)}s")
    for m in metas:
        if not isinstance(m, dict): print("  FAILED:", repr(m)[:200])

    if args.no_judge: return
    await judge_round(round_dir, ok)


if __name__ == "__main__":
    asyncio.run(main())

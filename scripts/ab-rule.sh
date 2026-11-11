#!/bin/bash
# A/B one rule on the logging family: same six turns, same three models, before and after.
# $1 = tag (e.g. "before" / "after"), $2 = probe json (default logging-probe.json).
set -u
TAG=$1
export AB_REPO=$(cd "$(dirname "$0")/.." && pwd)
PROBE=${2:?pass a probe json: [{prev, q}, …]}
. "$(dirname "$0")/wave-root.sh"
OUT=${AB_ROOT:-$WAVE_ROOT}/ab/$TAG; mkdir -p "$OUT"
python3 - "$OUT" "$PROBE" <<'PY'
import json, os, subprocess, sys, concurrent.futures as cf, threading
out = sys.argv[1]
REPO = os.path.dirname(os.path.dirname(os.path.abspath(sys.argv[0]))) if False else os.environ["AB_REPO"]
rows = json.load(open(sys.argv[2]))
MODELS = ["macaron-v1-venti", "macaron-v1-coding-venti", "glm-5.2"]
GATES = {"macaron": threading.Semaphore(3), "glm": threading.Semaphore(3)}
def prompt_for(r):
    return (f"以下是我们此前对话的摘要，供你了解上下文：\n\n{r['prev'].strip()}\n\n"
            f"---\n\n（以上是此前的对话。现在是我这一轮说的话：）\n\n{r['q'].replace('用户：','').strip()}")
def run(job):
    i, m = job
    dest = f"{out}/{i:02d}-{m}.txt"
    # A crashed or killed run must not cache as a result. `crash/nosession` and a `Terminated`
    # line are what eval.sh writes when the process dies, and both produce the same "0 cards" the
    # real answer produces — five of these cached silently and read as the rule having no effect.
    if os.path.exists(dest) and os.path.getsize(dest):
        body = open(dest).read()
        if "crash/" not in body and "Terminated" not in body and "timeout after" not in body:
            return f"{i}-{m}: cached"
    g = GATES["glm" if m.startswith("glm") else "macaron"]
    with g:
        p = subprocess.run([f"{REPO}/scripts/eval.sh", prompt_for(rows[i])], cwd=REPO,
                           env={**os.environ, "DSH_HOME": os.path.expanduser(f"~/.dsh-eval-{m}"), "EVAL_TIMEOUT": "900"},
                           capture_output=True, text=True, timeout=1200)
    open(dest, "w").write(p.stdout + p.stderr)
    return f"{i}-{m}: " + (p.stdout.strip().splitlines() or ["(empty)"])[0][:70]
jobs = [(i, m) for i in range(len(rows)) for m in MODELS]
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for line in ex.map(run, jobs): print(line, flush=True)
print("AB DONE")
PY

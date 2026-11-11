# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx~=0.28", "pyyaml~=6.0"]
# ///
"""Drive one conversation: one case, one model, an agent playing the user.

The shape of a run:

    dsh (turns-runner)  <-- one live Agent, many turns
        |  reply
        v
    card-driver (chromium)  <-- the card MOUNTED, clickable, screenshotted
        |  what a person could do to it, and what a click produced
        v
    user-agent (a model)  <-- decides: click that, or say this, or we're done
        |
        +-> next user turn

The click matters more than it looks. `$dsh/chat`'s `sendMessage` is recorded rather than sent, so
the run can tell three cases apart that a transcript cannot: a click that fired the turn, a click
that only previewed something, and a card whose buttons do nothing at all. Those are exactly the
distinctions the design principles are about.

Everything is written to disk as it happens. The overall timeout kills a run mid-conversation on
purpose — a conversation that got six turns in is still evidence, and waiting for the slowest
model to finish its tenth turn is how a wave spends an hour to add nothing.

    uv run eval/drive.py --case db-choice --model glm-5.3-flash --out /tmp/run
"""
import argparse, asyncio, json, os, pathlib, re, sys, time
import httpx, yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cases import BY_ID

REPO = pathlib.Path(__file__).resolve().parent.parent

# The overlay that turns `--profile headless` into a multi-turn session, written out rather than
# committed: the runner has to be named by an ABSOLUTE `file://` URL (a bare specifier would need
# it published as a package, and a relative one resolves against dsh's baseUrl, not ours), and a
# committed file carrying one machine's home directory is a file that works nowhere else.
#
# The bundle's own two rows are switched off rather than replaced. `headless-startup` parses the
# task positional and errors when there is none; `headless-runner` consumes it and exits after one
# turn. Both are exactly what a multi-turn run must not do.
PATCH_TEXT = f"""- id: headless-startup
  disabled: true

- id: headless-runner
  disabled: true

- insert:
    - id: turns-runner
      name: '{(REPO / "eval" / "turns-runner.mjs").as_uri()}'
"""
PATCH = REPO / "eval" / ".turns.patch.generated.yml"
PATCH.write_text(PATCH_TEXT)
GATEWAY = "http://34.177.103.253:4000/v1"
USER_AGENT_MODEL = os.environ.get("UI4A_USER_MODEL", "claude-sonnet-5")
# The closing fence must match the opening one in length: generated TSX contains triple-backtick
# template strings, which is why the contract asks for four and why `.*?` to the first ``` cuts
# the card off one line in.
FENCE = re.compile(r"^(?P<ticks>`{3,})ui4a/tsx\n(?P<code>.*?)\n(?P=ticks)\s*$", re.S | re.M)
# The same reply written with the wrong language tag. It is a known ~5% slip (CLAUDE.md §4.5) and
# counting it separately is the only way to tell "chose not to build UI" from "built it and lost it".
MISTAGGED = re.compile(r"^(?P<ticks>`{3,})(?:tsx|jsx|typescript)\n(?P<code>.*?export default.*?)\n(?P=ticks)\s*$", re.S | re.M)

def strip_fences(reply: str) -> str:
    """The reply as a PERSON saw it: the card stands where its source was."""
    out = FENCE.sub("〔一个可交互的界面卡片〕", reply)
    return MISTAGGED.sub("〔一段代码〕", out)


WIDTHS = [380, 720]
THEMES = ["light", "dark"]
MAX_CLICKS = 10


def gateway_key() -> str:
    """The :4000 master key, out of dsh's own credential store rather than the environment.

    `~/.dsh/.credentials.yaml` is where dsh keeps it and where the eval homes resolve `apiKeyEnv`
    from, so reading it here means one place holds the secret instead of two.
    """
    refs = yaml.safe_load((pathlib.Path.home() / ".dsh" / ".credentials.yaml").read_text()).get("refs", {})
    key = refs.get("LITELLM_4000_API_KEY")
    if not key: sys.exit("drive: LITELLM_4000_API_KEY is not in ~/.dsh/.credentials.yaml")
    return key


async def _drain(stream, log: pathlib.Path) -> None:
    """Keep a subprocess's pipe empty. An unread pipe is a 64KB fuse on the process behind it."""
    with open(log, "ab") as sink:
        while True:
            chunk = await stream.read(4096)
            if not chunk: return
            sink.write(chunk); sink.flush()


class Turns:
    """The live dsh agent, over the HTTP channel `eval/turns-runner.mjs` opens."""

    def __init__(self, proc, port, client): self.proc, self.port, self.client = proc, port, client

    @classmethod
    async def boot(cls, model: str, cwd: pathlib.Path, log: pathlib.Path, deadline: float):
        """Start dsh, retrying a boot that dies before it announces a port.

        **The retry exists because macOS revokes the Desktop grant for seconds at a time.** dsh
        reads its overlay out of `eval/` at boot; during a revocation that `open` returns EPERM and
        the process exits in 0.1s. Runs already past boot are untouched — the flap is short — so the
        only casualties are the handful unlucky enough to start inside the window. r007 lost three
        that way, twice, and each time the "three quick deaths" guard correctly aborted the whole
        round on the evidence available to it: three dead runs really is indistinguishable from a
        broken environment when the first one is not retried.

        Relocating the file would not fix it. `node_modules` is 700MB in the same protected tree,
        and `turns-runner.mjs` resolves `@deepseek-ai/*` as bare specifiers against it — so
        everything dsh needs is inside the grant, and the answer is to survive the gap rather than
        to move out of it.
        """
        last: Exception | None = None
        # 3+6+12+24+48 ≈ 93s. The first version stopped at 18s, and the outage that followed lasted
        # THIRTEEN MINUTES — so this is sized to absorb a flap and to give up on an outage, which is
        # the right split: a wave that keeps trying through a real outage is a wave burning cells.
        # `wave.py`'s three-dead-runs guard is what handles the long case, and it keys on zero turns
        # rather than on how fast the death was, so lengthening this cannot switch it off again.
        for attempt in range(6):
            try: return await cls._boot_once(model, cwd, log, deadline)
            except RuntimeError as error:
                last = error
                if "before announcing a port" not in str(error): raise
                await asyncio.sleep(3 * 2 ** attempt)
        raise RuntimeError(f"{last} (6 attempts over ~90s)")

    @classmethod
    async def _boot_once(cls, model: str, cwd: pathlib.Path, log: pathlib.Path, deadline: float):
        env = {**os.environ, "DSH_HOME": str(pathlib.Path.home() / f".dsh-ui4a-{model}"), "TURNS_PORT": "0"}
        # stderr to a FILE, never a pipe nobody drains. dsh logs the MCP servers booting and every
        # tool call there; a 64KB pipe buffer fills partway into the first real turn and the whole
        # process blocks on the write. The symptom is a run that reports `timeout` with zero turns
        # and a model that answers a one-shot of the same prompt in fourteen seconds.
        errlog = open(log, "ab")
        proc = await asyncio.create_subprocess_exec(
            "dsh", "--profile", "headless", "--patch", str(PATCH),
            cwd=str(cwd), env=env, stdout=asyncio.subprocess.PIPE, stderr=errlog)
        port = None
        while port is None:
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=120)
            if not line:
                raise RuntimeError(f"dsh exited before announcing a port; see {log}")
            text = line.decode()
            if text.startswith("TURNS_PORT="): port = int(text.split("=")[1])
        # Nothing reads dsh's stdout after this, and it keeps writing there too.
        asyncio.create_task(_drain(proc.stdout, log))
        # ONE deadline, the run's own. This used to be a flat 600s, and a second deadline tighter
        # than the first buys nothing: the run timeout already bounds the conversation, kills it
        # honestly (`status="timeout"`) and keeps every turn taken so far, while a turn that
        # outran the 600 came back empty and the run was labelled `complete`. Measured across
        # r003+r004: 31 runs died that way and **27 of them at exactly 600.0s** — the cliff, not a
        # hang. It cut into working turns too: 6 successful turns landed past 590s, and one ran 91
        # minutes and answered. Slow models now die on the run budget like everything else.
        #
        # `UI4A_TURN_DEADLINE` pins the old value for a round that must stay comparable to one taken
        # before this change: the twelve original cases are paired across every round so far, and a
        # harness edit is as much a second variable as a prompt edit.
        return cls(proc, port, httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", timeout=float(os.environ.get("UI4A_TURN_DEADLINE") or deadline)))

    async def turn(self, text: str) -> dict:
        return (await self.client.post("/turn", json={"text": text})).json()

    async def close(self):
        try: await self.client.post("/close", timeout=30)
        except Exception: pass
        try: self.proc.terminate()
        except ProcessLookupError: pass
        try: await asyncio.wait_for(self.proc.wait(), timeout=10)
        except asyncio.TimeoutError: self.proc.kill()
        await self.client.aclose()


class CardDriver:
    """The chromium half, one JSONL command at a time."""

    def __init__(self, proc, log): self.proc, self.log = proc, log

    @classmethod
    async def boot(cls, light: int, dark: int, shots: pathlib.Path, log: pathlib.Path):
        # Same pipe rule as `Turns`: playwright and chromium both write to stderr unprompted.
        errlog = open(log, "ab")
        proc = await asyncio.create_subprocess_exec(
            "node", str(REPO / "eval" / "card-driver.mjs"), str(light), str(dark), str(shots),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=errlog)
        return cls(proc, log)

    async def cmd(self, **msg) -> dict:
        self.proc.stdin.write((json.dumps(msg) + "\n").encode())
        await self.proc.stdin.drain()
        line = await asyncio.wait_for(self.proc.stdout.readline(), timeout=180)
        if not line:
            raise RuntimeError(f"card-driver died: {self.log.read_text(errors='replace')[-800:]}")
        return json.loads(line)

    async def close(self):
        try:
            self.proc.stdin.write(b'{"cmd":"quit"}\n'); await self.proc.stdin.drain()
            await asyncio.wait_for(self.proc.wait(), timeout=15)
        except Exception:
            try: self.proc.kill()
            except ProcessLookupError: pass


def cards_in(reply: str, ws: pathlib.Path, seen: dict[str, str]) -> list[dict]:
    """Every card this turn produced — fences in the reply, and canvases on disk.

    Counting fences alone misses a canvas entirely (CLAUDE.md §6.1): a canvas is a FILE and the
    reply about it is prose, so `fence=0` there is not the model declining to build UI.
    """
    out = [{"kind": "fence", "id": f"fence{i}", "code": m.group("code")} for i, m in enumerate(FENCE.finditer(reply))]
    out += [{"kind": "mistagged", "id": f"mistag{i}", "code": m.group("code")} for i, m in enumerate(MISTAGGED.finditer(reply))]
    canvases = ws / ".dsh" / "ui4a" / "canvases"
    if canvases.is_dir():
        for path in sorted(canvases.glob("*.ui4a.tsx")):
            code = path.read_text(encoding="utf-8", errors="replace")
            if seen.get(path.name) == code: continue   # unchanged since last turn: not new work
            seen[path.name] = code
            out.append({"kind": "canvas", "id": path.stem, "code": code})
    return out


USER_SYSTEM = """You are role-playing a HUMAN using a chat assistant. You are not an assistant.

Reply with ONE JSON object and nothing else:
  {"act":"click","ref":<n>,"why":"<short>"}   click a control in the card you were shown
  {"act":"say","text":"<what you type>"}      type a message
  {"act":"done","why":"<short>"}              your goal is met, or the assistant is stuck

Rules:
- If the assistant gave you a card with controls that fit what you want, CLICK it. A real person
  clicks the button instead of typing the same thing out.
- Write like a person: short, lowercase-ish, sometimes vague. Never explain that you are testing.
- Do not volunteer information the persona says you hold back until asked.
- Stay in the persona's language.
- Your persona names things you raise LATER in the conversation. Raise every one of them before
  you finish, in your own words, at the point it would naturally occur to you. Answer "done" only
  once they have all come up and been dealt with, or when the assistant is plainly stuck.
- Keep going past the first satisfying answer. Real use continues: you ask the follow-up the
  answer suggests, you change your mind, you push on the part that stayed vague.
"""


def user_prompt(case: dict, history: list[dict], card: dict | None, clicks: list[dict], push: str = "") -> str:
    lines = [f"WHO YOU ARE:\n{case['persona']}\n", "THE CONVERSATION SO FAR:"]
    for h in history:
        # A person never sees the TSX. Showing the source made the agent read 7KB of code as if it
        # were the assistant's answer, and reply to the code rather than to the interface.
        lines.append(f"[you] {h['user']}")
        lines.append(f"[assistant] {strip_fences(h['reply'])[:1200]}")
    if card is None:
        lines.append("\nThe assistant's last reply had NO interactive card — only text.")
    else:
        lines.append("\nThe assistant's last reply included a card. What it shows right now:")
        lines.append(card["text"][:2000])
        lines.append("\nControls you could click (ref → label):")
        for c in card["controls"]:
            state = " DISABLED" if c["state"].get("disabled") else ""
            sel = f" selected={c['state']['selected']}" if c["state"].get("selected") not in (None, "false") else ""
            lines.append(f"  {c['ref']}: <{c['tag']}> {c['label']!r}{state}{sel}")
        if not card["controls"]: lines.append("  (none — the card is not interactive)")
    if clicks:
        # Without this the agent re-clicked the same control five times: each call is stateless, and
        # a form whose selection is styled rather than announced looks unchanged from the outside.
        lines.append("\nYou have ALREADY clicked, this turn:")
        for c in clicks: lines.append(f"  ref {c['ref']} — {c['why']}")
        lines.append("Do not click the same thing again. Move on: pick the next question, press the")
        lines.append("submit/confirm control if you are happy, or type instead.")
    if push: lines.append(push)
    return "\n".join(lines)


async def ask_user_agent(client: httpx.AsyncClient, case: dict, history: list[dict], card: dict | None, clicks: list[dict], push: str = "") -> dict:
    for attempt in range(3):
        try:
            r = await client.post("/chat/completions", json={
                "model": USER_AGENT_MODEL, "max_tokens": 1200,
                "messages": [{"role": "system", "content": USER_SYSTEM}, {"role": "user", "content": user_prompt(case, history, card, clicks, push)}],
            })
            text = r.json()["choices"][0]["message"]["content"] or ""
            match = re.search(r"\{.*\}", text, re.S)
            if match: return json.loads(match.group(0))
        except Exception as error:
            if attempt == 2: return {"act": "done", "why": f"user-agent failed: {error}"}
        await asyncio.sleep(2 * (attempt + 1))
    return {"act": "done", "why": "user-agent produced no parsable action"}


async def run(case: dict, model: str, out: pathlib.Path, ports: tuple[int, int], timeout: float) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    ws = out / "workspace"; ws.mkdir(exist_ok=True)
    shots = out / "shots"; shots.mkdir(exist_ok=True)
    # BOTH clocks. 13 of r003's runs finished past their budget, one at 7.9x, and the two
    # explanations — asyncio's deadline not firing, and the machine sleeping so wall time runs
    # ahead of the loop's — are indistinguishable from `elapsed` alone, which is why that round
    # cannot say which happened. `asyncio.wait_for` counts in loop time; `time.time()` does not.
    # A run whose loop_elapsed sits at the budget while elapsed is triple it was asleep; one whose
    # loop_elapsed is also triple has a deadline that did not fire.
    meta = {"case": case["id"], "model": model, "started": time.time(), "loop_started": time.monotonic(),
            "turns": [], "status": "running"}
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

    api = httpx.AsyncClient(base_url=GATEWAY, headers={"Authorization": f"Bearer {gateway_key()}"}, timeout=300)
    agent = driver = None
    try:
        agent = await Turns.boot(model, ws, out / "dsh.log", timeout)
        driver = await CardDriver.boot(ports[0], ports[1], shots, out / "chromium.log")
        history, seen_canvases, next_text = [], {}, case["opening"]

        async def conversation():
            nonlocal next_text
            for index in range(case["turns"]):
                turn = {"n": index, "user": next_text, "clicks": [], "cards": []}
                # Per-phase timings. A round's wall clock is set by whichever of the three is
                # slowest, and without this the only way to find out is to guess.
                clock = time.time()
                try:
                    result = await agent.turn(next_text)
                except (httpx.TransportError, ConnectionResetError, BrokenPipeError) as error:
                    # One slow OR BROKEN turn must not discard the turns before it. Measured on
                    # glm-5.3-flash: a turn spent 616s inside the model and the exception reached
                    # `run()`, which marked the whole conversation `error` — throwing away another
                    # run's completed first turn AND the card it had already produced.
                    #
                    # The list started as `ReadTimeout, RemoteProtocolError` and that was too narrow: a
                    # machine under load DROPS the channel instead of stalling it, and
                    # `ConnectionResetError('Connection lost')` — raised by the asyncio transport,
                    # not by httpx — matched neither. **27 runs in one round** were discarded whole
                    # for it, each having already produced turns. The reason to keep the turns does
                    # not depend on which way the connection failed.
                    #
                    # `httpx.TransportError` is the base of every httpx connect/read/write/pool
                    # failure, so it covers the two original names and their siblings. NOT bare
                    # `OSError`: that would also swallow a failed `meta.json` write and end the run
                    # looking like a network blip — the same exception meaning two things, which is
                    # how a real bug hides for a round.
                    turn["reply"], turn["tools"], turn["skill"] = "", [], False
                    turn["reason"] = {"kind": "error", "error": {"code": "TURN_TIMEOUT", "message": f"{type(error).__name__}"}}
                    turn["t_model"] = round(time.time() - clock, 1)
                    meta["turns"].append(turn)
                    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
                    return
                turn["t_model"] = round(time.time() - clock, 1); clock = time.time()
                turn["reply"] = result.get("text", "")
                turn["tools"] = result.get("tools", [])
                turn["reason"] = result.get("reason")
                turn["skill"] = "skill" in (result.get("tools") or [])
                cards = cards_in(turn["reply"], ws, seen_canvases)
                (out / f"turn-{index:02d}.reply.md").write_text(turn["reply"], encoding="utf-8")
                # Recorded BEFORE the browser work and mutated in place afterwards. A hang in the
                # card half used to lose the model turn that preceded it, and a run then reported
                # `timeout turns=0` for a model that had in fact answered.
                meta["turns"].append(turn)
                (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

                shown = None
                for card in cards:  # noqa: the browser phase
                    (out / f"turn-{index:02d}.{card['id']}.tsx").write_text(card["code"], encoding="utf-8")
                    record = {"id": card["id"], "kind": card["kind"], "chars": len(card["code"])}
                    state = await driver.cmd(cmd="mount", code=card["code"], width=WIDTHS[0], theme="light")
                    record["painted"], record["errors"] = state.get("painted", False), state.get("errors", [])
                    # Measured at the NARROWEST width, which is where it happens: a pill or a badge
                    # that fits at 720 is pushed past the edge at 380, and the screenshot cannot
                    # show it because the clip ends at the card.
                    record["overflow"] = state.get("overflow")
                    record["controls"] = len(state.get("controls", []))
                    # Every width and both grounds, because a card is judged on all of them and a
                    # `@container` rule makes 380 and 720 two different designs.
                    # Theme OUTSIDE width: switching ground re-mounts the card and waits for it to
                    # settle, while a width change is a viewport resize. Interleaving them paid
                    # that re-mount three times per card instead of once.
                    for theme in THEMES:
                        for width in WIDTHS:
                            got = await driver.cmd(cmd="shot", name=f"t{index:02d}-{card['id']}-w{width}-{theme}", width=width, theme=theme)
                            if got.get("ok"): record.setdefault("shots", []).append(got["path"])
                    await driver.cmd(cmd="mount", code=card["code"], width=WIDTHS[0], theme="light")
                    turn["cards"].append(record)
                    if shown is None and state.get("painted"):
                        shown = state
                        # The card as DELIVERED, before anyone touched it. Three states are needed
                        # to read the persistence rule, and a boolean over two of them conflates
                        # opposite outcomes: `text unchanged after a reload` is a card that
                        # remembered its answer AND a card that never showed one — the skill's own
                        # rule has two halves ("send the result AND record what was chosen") and
                        # only three snapshots can tell which half is missing.
                        turn["card_text_initial"] = state.get("text", "")

                turn["t_cards"] = round(time.time() - clock, 1); clock = time.time()
                # The user acts. A click that sends ENDS the turn; a click that only previews does
                # not, which is the distinction the whole suite exists to see.
                said = None
                # `floor` refuses ONE early `done` per turn, and only on the cases that declare it. Both
                # halves matter. USER_SYSTEM has told the agent to raise every persona item before
                # finishing since the first round, and the median run still ends at six turns of a
                # declared ten — the prose does not land, exactly as CLAUDE.md 6.2 says prose does
                # not. And the twelve original cases carry no floor on purpose: they are paired
                # across every round taken so far, and changing what the model faces mid-series is
                # the one edit that makes a paired read mean nothing.
                pushed = False
                for _ in range(MAX_CLICKS):
                    action = await ask_user_agent(api, case, history + [{"user": turn["user"], "reply": turn["reply"]}], shown, turn["clicks"])
                    if action.get("act") == "click" and shown is not None:
                        before = list(shown.get("sent", []))
                        ref = int(action.get("ref", -1))
                        # The control's own LABEL, read before the click. Without it the transcript
                        # said `clicked control 1 (<the agent's reason>)` and a judge read the
                        # reason as the button's text — then reported the card as mislabelled.
                        label = next((c["label"] for c in shown.get("controls", []) if c["ref"] == ref), "?")
                        shown = await driver.cmd(cmd="click", ref=ref)
                        sent = shown.get("sent", []) if shown.get("ok") else []
                        turn["clicks"].append({"ref": ref, "label": label, "why": action.get("why", "")[:200],
                                               # The same measurement as the delivered card, taken AFTER the
                                               # click. A card that fits on arrival and pushes a revealed panel
                                               # past the edge once someone opens it is the shape the mount-time
                                               # probe cannot see — and it is the one a reader actually meets.
                                               "overflow": shown.get("overflow"),
                                               "sent": sent[len(before):], "ok": shown.get("ok", False)})
                        if len(sent) > len(before):
                            said = sent[-1]
                            break
                        continue
                    if action.get("act") == "say":
                        said = action.get("text", "").strip()
                        break
                    if not pushed and index + 1 < case.get("floor", 0):
                        pushed = True
                        push = ("\n\nYou just answered `done` at turn " + str(index + 1) + ". Re-read WHO YOU ARE: "
                                "it names things you raise LATER, and at least one of them has not come up yet. "
                                "Say the next one now, in your own words, with {\"act\":\"say\"}. Answer `done` "
                                "again only if the assistant is genuinely stuck or repeating itself.")
                        action = await ask_user_agent(api, case, history + [{"user": turn["user"], "reply": turn["reply"]}], shown, turn["clicks"], push)
                        if action.get("act") == "say":
                            said = action.get("text", "").strip()
                            turn["pushed"] = True
                            break
                    turn["done"] = action.get("why", "")
                    break
                else:
                    # TEN PREVIEW-ONLY CLICKS AND NOTHING SENT. Falling out of the loop left `said`
                    # empty, and `if not said: break` below then ended the whole conversation — with
                    # no `done` recorded, so the transcript looked like a persona that had finished
                    # rather than a budget that had run out, and `floor` never saw it because the
                    # push lives on the `done` branch. Measured on chess-open/kimi-k3: a run over at
                    # turn 3 of a declared 12, the card working correctly the whole time.
                    #
                    # A person who has finished poking at a card talks. So ask for words, with
                    # clicking off the table — and record the exhaustion either way, because a run
                    # that ends here ended for a reason no other counter shows.
                    turn["clicks_exhausted"] = True
                    action = await ask_user_agent(api, case, history + [{"user": turn["user"], "reply": turn["reply"]}], shown, turn["clicks"],
                                                  f"\n\nYou have clicked {MAX_CLICKS} times this turn and none of it sent anything back. "
                                                  "Stop clicking — it is not an option now. Say what you want in your own words with "
                                                  '{"act":"say"}, or answer `done` if you are genuinely finished.')
                    if action.get("act") == "say": said = action.get("text", "").strip()
                    else: turn["done"] = action.get("why", "") or f"{MAX_CLICKS} clicks, nothing sent"

                # A second set of shots AFTER the interaction. The first set is what the model
                # DELIVERED and is what it is graded on; this one is the only way a judge can see
                # whether a click previewed anything, and without it the panel was reading a
                # pre-click picture against a post-click narration and calling the difference a bug.
                if turn["clicks"] and turn["cards"]:
                    turn["after_shots"] = []
                    for theme, width in (("light", WIDTHS[0]), ("dark", WIDTHS[1])):
                        got = await driver.cmd(cmd="shot", name=f"t{index:02d}-after-w{width}-{theme}", width=width, theme=theme)
                        if got.get("ok"): turn["after_shots"].append(got["path"])

                turn["t_user"] = round(time.time() - clock, 1)
                # A reload after the last card of the turn. Three texts, not a boolean: what the
                # card said when it arrived, what it said once the person had finished with it,
                # and what it says after the page comes back.
                #
                #   recorded  = committed text differs from the delivered text
                #   persisted = the reloaded text still differs from the delivered text
                #
                # `text unchanged across the reload` was the first version and it scored a card
                # that never acknowledged the answer identically to one that remembered it.
                if turn["cards"] and shown is not None:
                    committed = shown.get("text", "")
                    after = await driver.cmd(cmd="reload")
                    reloaded = after.get("text", "")
                    initial = turn.get("card_text_initial", "")
                    turn["reload"] = {"text_same": reloaded == committed,
                                      "recorded": committed != initial,
                                      "persisted": reloaded != initial,
                                      "resent": after.get("sent", []),
                                      "text": reloaded[:300], "committed_text": committed[:300]}

                history.append({"user": turn["user"], "reply": turn["reply"]})
                (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
                if not said: break
                next_text = said

        try:
            await asyncio.wait_for(conversation(), timeout=timeout)
            meta["status"] = "complete"
            # `complete` only means the coroutine returned — which it also does when a turn times
            # out INSIDE the model. Keeping those turns is right (the ones before it are evidence),
            # labelling the run `complete` is not: measured across r003+r004, **31 of 209 runs**
            # ended on a `TURN_TIMEOUT` with an empty reply, and every one of them averaged in as a
            # legitimate zero-card run — a one-turn run that never got an answer sitting beside a
            # twelve-turn one in the same mean.
            #
            # Recorded BESIDE the status, not inside it. `wave.py` caches on the status vocabulary
            # (`complete`/`timeout`), so widening it mid-series would re-run rounds already banked.
            if meta["turns"] and (meta["turns"][-1].get("reason") or {}).get("kind") == "error":
                meta["cut"] = ((meta["turns"][-1]["reason"] or {}).get("error") or {}).get("code", "error")
        except asyncio.TimeoutError:
            # Kept, not discarded. Six turns of a ten-turn case is six turns of evidence, and the
            # alternative is every wave running at the pace of its slowest model.
            meta["status"] = "timeout"
    except Exception as error:
        meta["status"], meta["error"] = "error", f"{type(error).__name__}: {error}"[:500]
    finally:
        if driver is not None: await driver.close()
        if agent is not None: await agent.close()
        await api.aclose()
    meta["finished"] = time.time()
    meta["elapsed"] = round(meta["finished"] - meta["started"], 1)
    meta["loop_elapsed"] = round(time.monotonic() - meta["loop_started"], 1)
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", required=True); ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--timeout", type=float, default=300)
    ap.add_argument("--light", type=int, default=47801); ap.add_argument("--dark", type=int, default=47802)
    args = ap.parse_args()
    meta = await run(BY_ID[args.case], args.model, pathlib.Path(args.out), (args.light, args.dark), args.timeout)
    turns = len(meta["turns"])
    cards = sum(len(t["cards"]) for t in meta["turns"])
    clicks = sum(len(t["clicks"]) for t in meta["turns"])
    print(f"{meta['status']:9} {args.case:12} {args.model:24} turns={turns} cards={cards} clicks={clicks} {meta['elapsed']}s")


if __name__ == "__main__":
    asyncio.run(main())

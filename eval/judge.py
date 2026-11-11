# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx~=0.28", "pyyaml~=6.0", "pillow~=11.0"]
# ///
"""Score one run with a panel of vision models.

What a judge is shown is the whole point. A card is judged on the ground it sits on and at the
widths it will meet, so every card goes in at 380 and 720 in both themes — CLAUDE.md §6.6 records
four judges reading a `max-w` waste off the SOURCE that I could not see in a shot taken at one
width, and §3.7 records three of them calling a light-theme background a defect when it is the
host's own behaviour. And the conversation goes in as a conversation, including what the person
CLICKED and what that click did, because the rules under test are about interaction and a still
cannot show whether a button previewed something or fired the turn.

Two things this file refuses to do, both learned the hard way:

* The rubric never names a defect and asks whether it happened. Asked that way a panel invents one
  about two thirds of the time. It asks what the conversation was trying to do, shows what
  happened, and asks for a judgement.
* The cache key is the IMAGE BYTES, not the source. A render fix changes every screenshot without
  touching a byte of TSX, and a source-keyed cache would replay stale verdicts at full confidence
  — comparing a fix against itself.

Quorum: all judges start together; after the soft deadline a panel that has 2/3 of its verdicts
stops waiting for the rest. A run that cannot reach quorum by the hard deadline is reported as
`insufficient` rather than scored on one opinion.
"""
import argparse, asyncio, base64, hashlib, io, json, os, pathlib, re, sys, time
import httpx, yaml
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cases import BY_ID

GATEWAY = "http://34.177.103.253:4000/v1"
# The panel CLAUDE.md §6.6 characterised: strictness runs claude ≈ grok < gpt < gemini, and every
# pair holds its direction on 38-43 of 45 cards. Keeping the same four is what makes a paired
# before/after read comparable with the numbers already in that file.
JUDGES = ["claude-opus-5", "gpt-5.6-sol", "grok-4.6", "gemini-3.7-flash"]
SOFT_DEADLINE = float(os.environ.get("JUDGE_SOFT", 300))
HARD_DEADLINE = float(os.environ.get("JUDGE_HARD", 720))
MAX_IMAGES = 24
CACHE = pathlib.Path.home() / ".cache" / "ui4a-suite" / "judge"

RUBRIC = """You are reviewing a conversation between a person and an AI assistant that can answer with
LIVE INTERFACE CARDS as well as with text. You will see the conversation, what the person clicked,
and screenshots of every card at two widths (380px, 720px) in both light and dark themes.

The product this assistant belongs to holds these positions. They are the design intent, not a
checklist — judge how well this conversation embodies them, including where departing from them
was the right call:

- An interface is for a question with a shape: numbers someone would change, a multi-way
  comparison, a procedure to step through, an opaque expression someone is holding, or a request
  for several of something. A concept explanation or a single fact is fine as text.
- When the assistant needs to know something before it can help, asking with a few tappable
  options beats asking in prose. This applies to the FIFTH ambiguity as much as the first — a new
  fork later in the conversation deserves the same treatment.
- A plain two-way choice should be two plain buttons, nothing more.
- When the options need explaining, clicking one should PREVIEW what it means somewhere on the
  card, and a separate submit control should be what commits. Clicking an option should not fire
  the conversation forward before the person has looked.
- Anything that commits should commit once, and a card that has been answered should come back
  answered rather than asking again.
- The information hierarchy should be minimal and feel native to the app: no card wrapped in
  another card, no chrome the surrounding app does not itself draw.

Score each dimension 0-10 and reply with ONE JSON object, no prose around it:

{"trigger": <0-10>,       // did an interface appear where one was wanted, and stay away where it was not
 "clarify": <0-10>,       // were the things it needed to know asked as choices, every time they came up
 "interaction": <0-10>,   // preview-then-commit where it was warranted; commits that happen once
 "hierarchy": <0-10>,     // minimal, native, no card-in-card
 "craft": <0-10>,         // does it read well at both widths and on both grounds
 "overall": <0-10>,
 "best": "<one sentence: the strongest moment>",
 "worst": "<one sentence: the weakest moment>",
 "notes": "<two or three sentences>"}"""


def gateway_key() -> str:
    refs = yaml.safe_load((pathlib.Path.home() / ".dsh" / ".credentials.yaml").read_text()).get("refs", {})
    key = refs.get("LITELLM_4000_API_KEY")
    if not key: sys.exit("judge: LITELLM_4000_API_KEY is not in ~/.dsh/.credentials.yaml")
    return key


def encode(path: pathlib.Path) -> tuple[str, bytes]:
    """A screenshot small enough to send, still legible.

    The shots are taken at deviceScaleFactor 2 so 13px secondary labels survive; sent at that
    scale, twenty-four of them is more than ten megabytes of base64 per judge.
    """
    image = Image.open(path).convert("RGB")
    if image.width > 760 or image.height > 1500:
        scale = min(760 / image.width, 1500 / image.height)
        image = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "PNG", optimize=True)
    raw = buffer.getvalue()
    return base64.b64encode(raw).decode(), raw


def turn_text(turn: dict) -> str:
    """One turn, as prose a judge can line up against the pictures that follow it."""
    lines = [f"── turn {turn['n']} ──", f"PERSON: {turn['user']}"]
    for card in turn["cards"]:
        lines.append(f"ASSISTANT replied with a {card['kind']} card ({card['chars']} chars of TSX, "
                     f"{'painted' if card['painted'] else 'DID NOT RENDER'}, {card['controls']} interactive controls).")
    text_only = re.sub(r"^(`{3,})ui4a/tsx\n.*?\n\1\s*$", "", turn["reply"], flags=re.S | re.M).strip()
    if text_only: lines.append(f"ASSISTANT also wrote: {text_only[:1200]}")
    if not turn["cards"] and not text_only: lines.append("ASSISTANT: (nothing)")
    for click in turn["clicks"]:
        # The control's own label first, the person's reason second and clearly marked as theirs.
        # Run together they were read as one string and the reason was scored as button text.
        outcome = f'this sent the message {click["sent"][0]!r} and the conversation moved on' if click["sent"] else "nothing was sent; the card changed in place"
        lines.append(f'  PERSON CLICKED the control labelled "{click.get("label", "?")}" '
                     f'(their reason: {click["why"]}) — {outcome}')
    reload = turn.get("reload")
    if reload is not None:
        if not any(c["sent"] for c in turn["clicks"]):
            lines.append("  [the page was reloaded; nothing had been submitted from this card]")
        else:
            recorded = "the card showed the choice it had just sent" if reload.get("recorded") else "the card still looked untouched, as if nothing had been chosen"
            persisted = "came back showing the choice" if reload.get("persisted") else "came back asking the question again"
            resent = f", and re-sent {reload['resent']!r} by itself" if reload["resent"] else ""
            lines.append(f"  [after the submission {recorded}; after a page reload it {persisted}{resent}]")
    if turn.get("done"): lines.append(f"  [the person stopped here: {turn['done']}]")
    return "\n".join(lines)


def shots_for(turn: dict, first_or_last: bool) -> list[tuple[str, pathlib.Path]]:
    """Captioned screenshots for one turn: what was delivered, then what the clicks produced."""
    out: list[tuple[str, pathlib.Path]] = []
    for card in turn["cards"]:
        for shot in card.get("shots", []):
            path = pathlib.Path(shot)
            if not path.exists(): continue
            width, theme = path.stem.rsplit("-", 2)[-2:]
            # Both axes on every card; the full four only where a reader forms an impression.
            if not first_or_last and not (width == "w380" and theme == "light") and not (width == "w720" and theme == "dark"): continue
            out.append((f"turn {turn['n']} — the card AS DELIVERED, {width[1:]}px wide, {theme} theme", path))
    for shot in turn.get("after_shots", []):
        path = pathlib.Path(shot)
        if not path.exists(): continue
        width, theme = path.stem.rsplit("-", 2)[-2:]
        out.append((f"turn {turn['n']} — the SAME card AFTER the clicks above, {width[1:]}px wide, {theme} theme", path))
    return out


def build_content(meta: dict, case: dict) -> tuple[list[dict], str]:
    """The judge's message: the scenario, then each turn's prose immediately before its pictures.

    A flat list of images after a flat transcript cannot be attributed. Measured on the first run
    judged this way: a judge matched a post-click narration to a pre-click screenshot and reported
    the difference as a defect in the card.
    """
    head = (f"SCENARIO — {case['id']}: {case['expect']}\n"
            f"The person's situation: {case['persona'] or '(a one-off question, no ongoing context)'}\n"
            f"(This run ended `{meta['status']}` after {len(meta['turns'])} turn(s).)")
    content: list[dict] = [{"type": "text", "text": head}]
    parts: list[tuple[dict, pathlib.Path | None, int]] = []
    turns = meta["turns"]
    with_cards = [t["n"] for t in turns if t["cards"]]
    for turn in turns:
        parts.append(({"type": "text", "text": turn_text(turn)}, None, turn["n"]))
        edge = bool(with_cards) and turn["n"] in (with_cards[0], with_cards[-1])
        for caption, path in shots_for(turn, edge):
            parts.append(({"type": "text", "text": caption}, path, turn["n"]))

    # ONE PICTURE PER CARDED TURN FIRST, then fill in order. Taking the first MAX_IMAGES straight
    # through is what this used to do, and measured on r002 it bound on 12% of runs and dropped
    # 148 images — always the LAST turns (5 through 9). That is exactly where "a new fork later in
    # the conversation deserves its own interface" is judged, and the runs that overflow are the
    # longest ones, so the judge saw least evidence precisely where the model had done most work.
    imaged = [i for i, (_, path, _) in enumerate(parts) if path is not None]
    floor: dict[int, int] = {}
    for i in imaged: floor.setdefault(parts[i][2], i)
    picked = set(list(floor.values())[:MAX_IMAGES])
    for i in imaged:
        if len(picked) >= MAX_IMAGES: break
        picked.add(i)

    raw_bytes: list[bytes] = []
    for index, (part, path, _) in enumerate(parts):
        if path is None:
            content.append(part); continue
        if index not in picked: continue
        b64, raw = encode(path)
        content.append(part)
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
        raw_bytes.append(raw)
    # A missing picture and a card that was never built look identical to a judge. Say which ones
    # were left out rather than letting the gap be read as evidence.
    dropped = sorted({parts[i][2] for i in imaged if i not in picked})
    if dropped:
        content.append({"type": "text", "text": f"(Note: this conversation had more screenshots than fit. "
                        f"{len(imaged) - len(picked)} were left out — every turn below still has at least one "
                        f"picture, but turns {dropped} are shown at fewer widths/themes than the rest. "
                        f"Do not read a missing width as a card that was not built.)"})
    content.append({"type": "text", "text": "Now score this conversation."})
    digest = hashlib.md5(json.dumps([c for c in content if c["type"] == "text"], ensure_ascii=False).encode()
                         + b"".join(raw_bytes) + RUBRIC.encode()).hexdigest()
    return content, digest


async def one_judge(client: httpx.AsyncClient, model: str, content: list[dict], key: str) -> dict:
    cached = CACHE / f"{key}.{model}.json"
    if cached.exists(): return json.loads(cached.read_text())
    for attempt in range(3):
        try:
            r = await client.post("/chat/completions", json={
                "model": model, "max_tokens": 4000,
                "messages": [{"role": "system", "content": RUBRIC}, {"role": "user", "content": content}]})
            body = r.json()
            reply = (body.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            match = re.search(r"\{.*\}", reply, re.S)
            if match is None: raise ValueError(f"no JSON in {model}'s reply: {reply[:200]!r}")
            verdict = json.loads(match.group(0))
            verdict["judge"] = model
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(verdict, ensure_ascii=False))
            return verdict
        except Exception as error:
            if attempt == 2: raise
            await asyncio.sleep(4 * (attempt + 1))
    raise RuntimeError("unreachable")


async def judge_run(out: pathlib.Path) -> dict:
    meta = json.loads((out / "meta.json").read_text())
    case = BY_ID[meta["case"]]
    if not meta["turns"]:
        return {"status": "no-turns", "verdicts": []}
    content, digest = build_content(meta, case)
    images = [c for c in content if c["type"] == "image_url"]

    client = httpx.AsyncClient(base_url=GATEWAY, headers={"Authorization": f"Bearer {gateway_key()}"}, timeout=HARD_DEADLINE)
    tasks = {asyncio.create_task(one_judge(client, model, content, digest)): model for model in JUDGES}
    quorum = -(-2 * len(JUDGES) // 3)   # ceil(2/3 · n)
    verdicts, failures, started = [], {}, time.time()
    try:
        pending = set(tasks)
        while pending:
            elapsed = time.time() - started
            budget = (SOFT_DEADLINE if len(verdicts) < quorum else 0) - elapsed
            done, pending = await asyncio.wait(pending, timeout=max(1.0, min(budget if budget > 0 else 1.0, HARD_DEADLINE - elapsed)))
            for task in done:
                try: verdicts.append(task.result())
                except Exception as error: failures[tasks[task]] = f"{type(error).__name__}: {error}"[:200]
            if not pending: break
            elapsed = time.time() - started
            # The rule the user asked for: once two thirds have answered AND the soft deadline has
            # passed, the panel does not wait for the rest. A slow judge is not worth the wall clock
            # of every other run behind it.
            if len(verdicts) >= quorum and elapsed >= SOFT_DEADLINE: break
            if elapsed >= HARD_DEADLINE: break
    finally:
        for task in tasks:
            if not task.done(): task.cancel()
        await client.aclose()

    status = "ok" if len(verdicts) >= quorum else "insufficient"
    result = {"status": status, "quorum": quorum, "verdicts": verdicts, "failures": failures,
              "cut": [tasks[t] for t in tasks if t.cancelled()], "elapsed": round(time.time() - started, 1),
              "images": len(images)}
    if verdicts:
        keys = ["trigger", "clarify", "interaction", "hierarchy", "craft", "overall"]
        result["mean"] = {k: round(sum(float(v.get(k, 0)) for v in verdicts) / len(verdicts), 2) for k in keys}
    (out / "verdict.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
    return result


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run", help="a directory written by drive.py")
    args = ap.parse_args()
    result = await judge_run(pathlib.Path(args.run))
    print(f"{result['status']:12} judges={len(result['verdicts'])}/{len(JUDGES)} "
          f"cut={result.get('cut')} imgs={result.get('images')} {result.get('elapsed')}s  {result.get('mean')}")
    if result.get("failures"): print("  failures:", result["failures"])


if __name__ == "__main__":
    asyncio.run(main())

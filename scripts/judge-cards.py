# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx~=0.28", "pillow~=11.0"]
# ///
"""Grade a directory of cards on their SCREENSHOTS, with a panel of five vision models.

Every other check here reads the source or the DOM. None can see whether a card is any good to
look at — a board whose cells overlap by 91% passes all 30 screens, paints, and mounts. This is
the check that catches that, and it found exactly that on a reference card.

Each card is judged on six images (320 / 440 / 720 in both themes) plus its TSX, on four axes:
cognitive load, alignment and grid, colour and borders, and whether the layout responds at all.
Verdicts cache by md5(model + card + source + the image bytes), so a rerun costs nothing and a
re-shoot after a rendering fix is correctly a cache miss.

Usage, with the shots already taken by `scripts/shot-card.mjs`:

    LITELLM_KEY=... uv run scripts/judge-cards.py

    SHOTS_DIR   where <card>.<theme>.<width>.png live   (default /tmp/shots)
    CARDS_DIR   where <card>.tsx live                   (default /tmp/judgecards)

Refuses to grade a card whose images are missing or blank, and prints what it skipped: a verdict
about a dead harness reads exactly like a verdict about a bad card.
"""
import asyncio, base64, hashlib, json, os, pathlib, sys, httpx
from wave_root import ROOT

KEY = os.environ["LITELLM_KEY"]  # never hardcode: this is the user's gateway key
# The clhh gateway carries all five of the models below and was probed reading text off a real
# screenshot on each — worth doing before a run rather than after, because a model without vision
# answers the rubric from the SOURCE alone and its verdict reads exactly like a real one.
BASE = os.environ.get("LITELLM_BASE", "http://34.177.103.253:4000")
# `kimi-k3` was dropped 2026-08-26: it accepts the request and never answers, and a judge that
# hangs is worse than one that errors — the batch stays "in progress" and the missing verdicts
# read as cards nobody had anything to say about. Probe a candidate by asking it to READ TEXT off
# a real screenshot before adding it back; a model without vision answers the rubric from the
# source alone and its verdict is indistinguishable from a real one.
MODELS = ["gemini-3.7-flash", "grok-4.6", "claude-opus-5", "gpt-5.6-sol"]
WIDTHS = [320, 440, 720]
SHOTS = pathlib.Path(os.environ.get("SHOTS_DIR", "/tmp/shots"))
CARDS = pathlib.Path(os.environ.get("CARDS_DIR", "/tmp/judgecards"))
# Beside the waves, not in /tmp — same reason as OUT below.
CACHE = ROOT / "judge-cache"
CACHE.mkdir(parents=True, exist_ok=True)
# Named after the shots it graded, so two waves cannot overwrite each other. A fixed filename
# meant every run clobbered the last, and comparing two waves depended on remembering to `cp` the
# results out first — which is a step, and steps that exist only in someone's head get skipped.
# `JUDGE_OUT` overrides for a one-off.
# Beside the wave, not in /tmp: macOS reaps /tmp, and these verdicts cost one vision call per
# card per judge to produce.
OUT = pathlib.Path(os.environ.get("JUDGE_OUT") or (ROOT / "verdicts" / f"judge-{pathlib.Path(os.environ.get('SHOTS_DIR', 'shots')).name}.jsonl"))
OUT.parent.mkdir(parents=True, exist_ok=True)

# What counts as NOT a verdict, in one place. It was spelled out at three call sites — the cache
# guard, the progress mark and the final count — and the whole point of the count is that a
# failure must never pass for a verdict, which three copies of the rule cannot promise.
def failed(verdict: str) -> bool:
    return verdict.startswith(("HTTP", "ERR"))


# `shoot-wave.sh` strips the whole `.ui4a.tsx` suffix chain when it names shots, so a card looked
# up under its raw stem finds none of its own images and is skipped — which reads exactly like a
# card that rendered nothing. Wave 2 was reported as 27 unjudgeable cards for this reason alone.
def shot_stem(card: str) -> str:
    return card.removesuffix(".ui4a")


RUBRIC = """你在评审一个嵌在聊天流里的生成式 UI 卡片。它渲染在别人的应用里（不是整页），宽度由读者拖动，
所以下面给了三个断点 320 / 440 / 720，每个断点都有浅色和深色两版，最后是它的 TSX 源码。

只挑真正做得不够好的地方，按这四类给出具体、可执行的批评。**每一类都可能「无」**——
下面的问句是检查清单不是暗示，别为了填满四类而把正常的设计说成缺陷：

1. **认知负担**：信息是否一次性糊上来太多？有没有该折叠进二级菜单/详情/渐进展示的内容？层级是否清楚？
2. **对齐与排版**：有没有网格系统？该左对齐的是否居中了？间距是否成体系（4/8 的倍数）还是随手写的？
   行/列切分是否合理，宽度变大时版面是否用上了多出来的横向空间？
3. **配色与描边**：颜色是否太繁杂？对比度够不够？选中态是否只靠颜色表达？
   深色版是否只是把浅色反过来、没有单独调过？嵌套层级是否过深（框里套框）？
   注意：这个 app 的浅色主题里 `bg-page` / `bg-layer-1` / `bg-layer-2` **实际都是 #fff**，
   所以「同时写底色和边框」在这里是必须的、不是反模式——不要按通用设计常识批它。
4. **响应式**：三个断点之间布局有变化吗？还是同一套死布局被拉宽？窄的时候有没有挤压/换行/溢出？

要求：
- 每条批评必须指向图上或源码里具体的元素，并给出改法。不要泛泛而谈。
- 如果某一类确实没问题，直接写「无」，不要硬凑。
- 最后单独一行 `SCORE: N/10`（10 = 可以直接上线）。
- 简体中文，总共不超过 500 字。"""


# Shots are taken at deviceScaleFactor 3 so a judge can read a 13px label, which puts a single
# 320px card at ~1.7MB and six of them past every provider's per-request image budget. Measured
# on the panel: Anthropic answered 400 outright, and — worse — one model returned 200 with an
# EMPTY body, which lands in the results file looking like a card nobody had anything to say
# about. Halving the pixels keeps the labels legible and the request inside the limits.
#
# Scaling is by WIDTH, never by the long edge. Cards are tall — measured on one wave, 31% of the
# shots ran past 4000px and the tallest hit the 12000px capture ceiling — so "fit the long edge
# into 1600" turns a 960x12000 card into 128px wide and every label into mush. The judge is being
# asked to read 13px text, so the width is the dimension that must survive.
#
# Height is handled by CROPPING, not squashing: a card that keeps going below `MAX_H` is already
# failing the density rule, and the judge can say so from the top of it. The crop is announced in
# the prompt so a verdict never describes a truncation as if the card ended there.
#
# This lives in the consumer, not in `shot-card.mjs`: the shots are also read by eyes and by the
# diffing checks, and those want the full resolution.
MAX_W, MAX_H = 900, 2400

def downscaled(p: pathlib.Path) -> tuple[bytes, bool]:
    """The image as JPEG within the judge's budget, and whether it had to be cut short."""
    try:
        from PIL import Image
    except ImportError:
        return p.read_bytes(), False
    import io
    im = Image.open(p).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, max(1, round(im.height * MAX_W / im.width))), Image.LANCZOS)
    cut = im.height > MAX_H
    if cut: im = im.crop((0, 0, im.width, MAX_H))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return buf.getvalue(), cut


def b64(p):
    data, cut = downscaled(p)
    return base64.b64encode(data).decode(), cut


def content_for(card):
    parts = [{"type": "text", "text": RUBRIC + f"\n\n卡片：{card}"}]
    n = 0
    # The verdict is about the IMAGES, so the cache key has to be. Keyed on source alone, a config
    # fix that changed every card's rendering (a colour name was shadowing `text-base`, so titles
    # painted white on white) replayed every stale verdict at full confidence.
    shots = hashlib.md5()
    for w in WIDTHS:
        for theme in ("light", "dark"):
            f = SHOTS / f"{shot_stem(card)}.{theme}.{w}.png"
            if not f.exists(): continue
            data, cut = b64(f)
            note = "（图已在此截断——卡片实际更长，这本身就是密度问题）" if cut else ""
            parts.append({"type": "text", "text": f"\n{w}px {'浅色' if theme=='light' else '深色'}：{note}"})
            parts.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{data}"}})
            shots.update(f.read_bytes())
            n += 1
    src = (CARDS / f"{card}.tsx").read_text()
    parts.append({"type": "text", "text": f"\n源码：\n```tsx\n{src}\n```"})
    return parts, n, src + shots.hexdigest()  # third value is the CACHE KEY material, not the source


async def judge(c, model, card, parts, fp):
    # The RUBRIC is part of the key, and leaving it out has now cost two measurements.
    # A verdict is a function of (model, images, source, QUESTION ASKED) — change the question
    # and every cached answer is about a different question. Measured 2026-08-26: the rubric was
    # rewritten to drop a leading question that had been fabricating a defect in 73% of verdicts,
    # the re-run replayed 199 cached verdicts, and the paired difference came out **exactly
    # zero** — which reads like "the rewrite changed nothing" and was really "nothing ran".
    # §6.6 records the same trap one field over: the key once omitted the IMAGES, so a rendering
    # fix replayed 117 stale verdicts at full confidence.
    key = hashlib.md5((model + card + fp + RUBRIC).encode()).hexdigest()
    f = CACHE / f"{key}.json"
    if f.exists(): return json.loads(f.read_text())
    try:
        r = await c.post("/v1/chat/completions",
                         json={"model": model, "max_tokens": 8000, "messages": [{"role": "user", "content": parts}]})
        # A 200 whose `content` is null is not a verdict. Cached, it becomes a permanent empty
        # entry that silently narrows the denominator — worse than an error, which at least shows.
        # Nor is a TRUNCATED one: at 3000 tokens, claude-opus-5 ran out mid-sentence on 6 of its
        # 22 cards and the `SCORE:` line never arrived, so those cards were scored by three judges
        # and the fourth's silence read as agreement. It is not random which ones — a judge writes
        # most about the card it likes least, so the drop lands on the worst cards. 8000 is room
        # for the longest verdict seen plus half again; `length` still refuses rather than scores.
        if r.status_code != 200: out = f"HTTP {r.status_code}: {r.text[:200]}"
        else:
            choice = r.json()["choices"][0]
            out = choice["message"].get("content") or "ERR empty content"
            if choice.get("finish_reason") == "length": out = f"ERR truncated at max_tokens ({len(out)} chars, no SCORE line)"
    except Exception as e:
        out = f"ERR {type(e).__name__}: {e}"
    rec = {"model": model, "card": card, "verdict": out}
    if not failed(out): f.write_text(json.dumps(rec, ensure_ascii=False))
    return rec


async def main():
    cards = sorted(p.stem for p in CARDS.glob("*.tsx"))
    # Network-bound, not CPU-bound: each task uploads six images and waits. 6 was picked when the
    # panel was five models on one upstream; the gateway takes far more, and a wave of 86 cards is
    # 344 calls. `JUDGE_CONC` retunes it without an edit.
    sem = asyncio.Semaphore(int(os.environ.get("JUDGE_CONC") or 16))
    results = []
    async with httpx.AsyncClient(base_url=BASE, timeout=600, headers={"Authorization": f"Bearer {KEY}"}) as c:
        # One cheap call before spending hundreds: a wrong key answers every one of them
        # identically, and finding that out at the end costs the whole wave's judging. Same reason
        # `run-wave.py` probes before it starts. Its own short timeout — the 600s the judging
        # needs would turn an unreachable gateway into a ten-minute wait for a one-line refusal.
        probe = await c.get("/v1/models", timeout=30)
        if probe.status_code != 200: sys.exit(f"judge refused to start — {BASE} answered {probe.status_code}: {probe.text[:120]}")

        async def one(card, model, parts, fp):
            async with sem:
                r = await judge(c, model, card, parts, fp)
                mark = "!!" if failed(r["verdict"]) else "ok"
                print(f"{mark} {card:14} {model}", flush=True)
                return r
        tasks = []
        skipped = []
        for card in cards:
            parts, n, keymat = content_for(card)
            # A card judged on missing or blank images is a verdict about the harness. Refuse it
            # loudly rather than letting it quietly narrow the denominator — a dead harness port
            # and a card that renders nothing produce the same 40px image.
            if n < len(WIDTHS) * 2:
                skipped.append(f"{card} ({n}/{len(WIDTHS)*2} images)"); continue
            tiny = [w for w in WIDTHS
                    if (SHOTS / f"{shot_stem(card)}.light.{w}.png").stat().st_size < 5000]
            if tiny:
                skipped.append(f"{card} (blank at {tiny})"); continue
            # A card that streams its content through `$dsh/ai` is photographed mid-flight: the
            # harness forwards to a real model, and a reasoning model spends thousands of tokens
            # before its first content character (glm-5.2: 7432), so the shot is the card's own
            # loading state. Grading that is grading the harness — the same class of mistake as
            # judging a blank image, and the reason the check above exists. Measured on wave 3:
            # 6 of 11 canvases import this capability.
            src_text = (CARDS / f"{card}.tsx").read_text()
            if "$dsh/ai" in src_text:
                skipped.append(f"{card} (streams via $dsh/ai — shot is its loading state)"); continue
            fp = hashlib.md5((keymat + str(n)).encode()).hexdigest()
            print(f"# {card}: {n} images", flush=True)
            tasks += [one(card, m, parts, fp) for m in MODELS]
        if skipped:
            print("SKIPPED (not judged): " + "; ".join(skipped), flush=True)
        results = await asyncio.gather(*tasks)
    with OUT.open("w") as fh:
        for r in results: fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    # A failed call is not a verdict, and counting it as one is how a whole wave gets judged by
    # nobody and reported as judged. Measured: the key for :4000 was the key for :24000, every one
    # of 88 calls came back `HTTP 401: Invalid API key`, and this line said `JUDGEDONE 88
    # verdicts`. They are not cached (see `one`), so the count was the only place it could show.
    bad = [r for r in results if failed(r["verdict"])]
    ok = len(results) - len(bad)
    line = f"JUDGEDONE {ok} verdicts"
    if bad: line += f", {len(bad)} FAILED ({bad[0]['verdict'][:80]})"
    print(line + f" -> {OUT}", flush=True)
    # Non-zero on ANY failure, not only on total failure. A pass where a tenth of the calls died
    # still writes a file a caller will happily score, on a denominator nobody chose — the same
    # silently-narrowed denominator this whole function exists to stop. Failures are not cached,
    # so re-running costs only the ones that failed.
    if bad: sys.exit(f"{len(bad)} of {len(results)} judge calls failed — re-run to fill them in")

asyncio.run(main())

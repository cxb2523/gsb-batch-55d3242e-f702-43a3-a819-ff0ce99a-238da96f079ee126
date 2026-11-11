# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Build the live page: pull real cards out of the rounds, bake both themes, render them for real.

Two shapes, one page. With no arguments it is the before/after comparison — the same case and
model in two rounds, which is what says whether a prompt change did anything. With `--round rNNN`
it is that round's gallery: one section per case, one column per model, every card compiled and
mounted by the plugin's own `GenUISurface` so it can be clicked.

Both halves have to happen here rather than in the page. The **pairs** are read from the rounds'
own `meta.json`, so the sources shown are byte-for-byte what the model wrote — quoting them into
the page by hand is how a comparison stops being evidence. The **tokens** are inlined because the
harness only ever writes ONE theme into its own `/` page, and this page carries both on a toggle;
they go onto `body` and `body[data-ds-dark-theme]`, the host's own selectors, so a card sees
exactly what it sees in dsh.

    uv run eval/build-compare.py
    HARNESS_PAGE=/tmp/ui4a-live.html HARNESS_DATA=/tmp/ui4a-pairs.json bun scripts/surface-harness.ts 47311
    open http://127.0.0.1:47311/page
"""
import argparse, json, os, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
ROUNDS = pathlib.Path(os.environ.get("UI4A_ROUNDS", pathlib.Path.home() / ".cache/ui4a-suite/rounds"))
# (case, model, what the conversation is about). Each is a run where the two rounds differ on the
# one thing under test: the before card records the answer and loses it on reload, the after card
# keeps it. Verified pairs, not a sample — `eval/delta.py` is where the rate lives.
PAIRS = [("laptop-pick", "macaron-v1-venti", "选笔记本"), ("trip-plan", "grok-4.6", "安排旅行"),
         ("palette", "glm-5.2", "定配色"), ("db-choice", "grok-4.6", "挑数据库")]


def committed_card(round_name: str, case: str, model: str) -> dict | None:
    """The first turn of that run where a click actually sent something, with its card's source."""
    meta_path = ROUNDS / round_name / case / model / "meta.json"
    if not meta_path.exists():
        return None
    for turn in json.loads(meta_path.read_text())["turns"]:
        if not turn.get("reload") or not turn["cards"] or not any(click["sent"] for click in turn["clicks"]):
            continue
        source = meta_path.parent / f"turn-{turn['n']:02d}.{turn['cards'][0]['id']}.tsx"
        if not source.exists():
            continue
        return {"turn": turn["n"], "user": turn["user"], "code": source.read_text(errors="replace"),
                "recorded": turn["reload"].get("recorded"), "persisted": turn["reload"].get("persisted")}
    return None


def theme_block(selector: str, theme: str) -> str:
    tokens = json.loads((REPO / "test/fixtures" / f"dsw-tokens-{theme}.json").read_text())
    return selector + "{" + ";".join(f"{name}:{value}" for name, value in tokens.items()) + "}"


def best_card(round_name: str, case: str, model: str) -> dict | None:
    """The card worth showing for one run: the last turn that produced one that painted.

    The LAST rather than the first, because these conversations are built so the interesting fork
    arrives late — the first card is usually the opening question and the later ones are what the
    principles are actually about.
    """
    meta_path = ROUNDS / round_name / case / model / "meta.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text())
    if meta["status"] not in ("complete", "timeout"):
        return None
    for turn in reversed(meta["turns"]):
        for card in turn["cards"]:
            source = meta_path.parent / f"turn-{turn['n']:02d}.{card['id']}.tsx"
            if not card["painted"] or not source.exists():
                continue
            return {"turn": turn["n"], "user": turn["user"], "code": source.read_text(errors="replace"),
                    "label": model, "note": f"turn {turn['n']} · {card.get('controls', 0)} controls"}
    return None


def gallery(round_name: str) -> list[dict]:
    """One section per case, one column per model that produced a card."""
    sections = []
    for case_dir in sorted((ROUNDS / round_name).iterdir()):
        if not case_dir.is_dir() or case_dir.name == "plugin":
            continue
        cards = [c for c in (best_card(round_name, case_dir.name, m.name) for m in sorted(case_dir.iterdir()) if m.is_dir()) if c]
        if not cards:
            continue
        sections.append({"title": case_dir.name, "chips": [round_name, f"{len(cards)} models"],
                         "said": cards[0]["user"], "cards": cards})
    return sections


def comparison() -> list[dict]:
    sections = []
    for case, model, title in PAIRS:
        before, after = committed_card("r001", case, model), committed_card("r002", case, model)
        if before is None or after is None:
            print(f"  skipped {case}/{model} — no committed turn in {'r001' if before is None else 'r002'}")
            continue
        before |= {"label": "改之前 · r001", "note": "刷新后忘记"}
        after |= {"label": "改之后 · r002", "note": "刷新后记得"}
        sections.append({"title": title, "chips": [case, model], "said": before["user"], "cards": [before, after]})
    return sections


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--round", default="", help="show one round's cards instead of the r001/r002 comparison")
    args = ap.parse_args()

    sections = gallery(args.round) if args.round else comparison()
    data = pathlib.Path("/tmp/ui4a-pairs.json")
    data.write_text(json.dumps(sections, ensure_ascii=False))
    page = pathlib.Path("/tmp/ui4a-live.html")
    css = f"<style>{theme_block('body', 'light')}{theme_block('body[data-ds-dark-theme]', 'dark')}</style>"
    html = (REPO / "eval/live-compare.html").read_text().replace("<!--TOKENS-->", css)
    if args.round:
        # The template spells it lowercase. This replace looked for the uppercase form and so had
        # never once fired — every gallery ever built said "r001 → r002" above whatever round it
        # actually showed. Asserted rather than replaced blind: a silent no-op is how it survived.
        label = "ui4a · r001 → r002 · 现场渲染"
        assert label in html, "the page template's title bar changed; this replace would be a no-op again"
        html = html.replace(label, f"ui4a · {args.round} · 现场渲染")
    page.write_text(html)
    cards = sum(len(s["cards"]) for s in sections)
    print(f"{len(sections)} sections / {cards} cards -> {data} ({data.stat().st_size:,} B), page -> {page} ({page.stat().st_size:,} B)")


if __name__ == "__main__":
    main()

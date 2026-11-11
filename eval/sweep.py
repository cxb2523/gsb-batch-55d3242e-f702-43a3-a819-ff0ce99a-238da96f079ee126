# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""The corpus counters that `delta.py` cannot compute from `meta.json`.

`score.py` reads what the harness observed — a click sent or did not, a card painted or did not.
These are properties of the SOURCE the model wrote, and they were originally measured by
throwaway scripts. That is fine for deciding a rule is worth writing and useless for deciding it
worked: r005 and r006 have to be measured with the same instrument, and an instrument that lives
in `/tmp` among forty other files is not the same instrument twice.

Every counter here is deliberately narrow, and `--show` prints the hits. Six of the eleven original
sweeps were false positives (see `docs/measurements-log.md`) and every one of them looked like a
real defect until the hits were read. A number from this file is not evidence until that has
happened at least once per round.

    uv run eval/sweep.py <round-dir> [--show=collision|pre|silent|cjk] [--limit=5]
    node eval/nesting.mjs <round-dir>        ← nesting, which needs a parser
"""
import pathlib, re, sys, collections

CLASSNAME = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\})')
# Opening tag, closing tag, or self-closing. Good enough for generated TSX, which is formatted.
TAG = re.compile(r'<(/?)([A-Za-z][\w.]*)((?:[^<>"\']|"[^"]*"|\'[^\']*\')*?)(/?)>', re.S)

# Every spelling of "this one is the selected one". The first version of this list had five entries
# and reproduced 191 collisions where the original count said 308; adding the four below matched it
# exactly, so the disagreement was this list and not the counting. `focus:`/`active:` are
# deliberately NOT here — they describe a transient state during the interaction, not a selection
# that persists after it, and adding them only moves the number by 8.
PRESSED = ("aria-pressed:", "data-[state=on]:", "data-active:", "aria-selected:", "data-[selected]:",
           "aria-current:", "checked:", "data-[state=active]:", "data-[state=checked]:")
FAMILY = ("bg-", "text-", "border-", "ring-", "shadow-", "opacity-", "outline-")


def family_of(util: str) -> str | None:
    bare = util.split(":")[-1]
    return next((f[:-1] for f in FAMILY if bare.startswith(f)), None)


TERNARY = re.compile(r'\$\{[^{}]*?\?([^{}:]*?):([^{}]*?)\}')


def collisions(src: str) -> list[str]:
    """A property set by both a hover rule and a selected-state rule that apply at the same time.

    Two spellings, and the second is the common one — missing it is why an earlier count of this
    said 191 where the real number is larger:

    `hover:bg-hover` + `aria-pressed:bg-accent` — `:is()` gives both (0,2,0) and `hover` is emitted
    last, so source order decides and the selection repaints neutral under the pointer.
    `aria-pressed:hover:` is (0,3,0) and wins on specificity instead, so it clears the hit.

    `hover:bg-hover` outside a template's `${sel ? "bg-accent" : ""}` — now the selected colour is a
    PLAIN utility (0,1,0) and the hover rule is (0,2,0), so hover wins outright, order irrelevant
    and no variant can fix it. The same two utilities written INSIDE the two branches
    (`${sel ? "bg-accent" : "hover:bg-hover"}`) are mutually exclusive and are not a hit.
    """
    out = []
    for m in CLASSNAME.finditer(src):
        raw = m.group(1) or m.group(2) or ""
        # The literal part of a template is what applies unconditionally; the truthy branches of its
        # `${… ? … : …}` are what applies when selected.
        picked = " ".join(t for t, _ in (mm.groups() for mm in TERNARY.finditer(raw)))
        always = TERNARY.sub(" ", raw)
        hov, prs, fixed = set(), set(), set()
        for c in always.replace('"', " ").split():
            fam = family_of(c)
            if not fam: continue
            has_p = any(p in c for p in PRESSED)
            if has_p and "hover:" in c: fixed.add(fam)
            elif has_p: prs.add(fam)
            elif c.startswith("hover:"): hov.add(fam)
        # A colour in the truthy branch is a selected-state rule with NO variant, so nothing can
        # raise its specificity above the hover rule — it is a hit whenever hover sets the family.
        for c in picked.replace('"', " ").split():
            fam = family_of(c)
            if fam and not c.startswith(("hover:", "focus", "group-")): prs.add(fam)
        for fam in sorted((hov & prs) - fixed): out.append(f"{fam}: {' '.join(raw.split())[:150]}")
    return out


# Nesting is NOT measured here. Two versions of it lived in this file — a regex tag stack and an
# indentation walk — and both were wrong by more than 5x, in opposite directions, against the same
# corpus (see docs/measurements-log.md). It needs a real parser, so it lives in `eval/nesting.mjs`.
# Keeping a second, cheaper implementation next to it would only give a future round two numbers to
# choose between.

def hand_rolled_pre(src: str) -> bool:
    return "<pre" in src and "shiki" not in src


# A card whose content arrives after the first paint. Named by the calls that produce that shape
# rather than by "is it async", because `useEffect` with a timer is not the case the rule is about:
# the reader is waiting on something the card asked another system for.
FETCHES = ("streamText", "generateText", "generateObject", "$dsh/ai", "$dsh/exec", "bash(", "fetch(")


def announces(src: str) -> bool | None:
    """Whether a fetching card has a live region AT ALL. `None` for cards that never fetch.

    **Presence, not placement — so this is a FLOOR on the defect, not the defect rate.** The rule
    asks for the live region on the container the results land in; this cannot tell that from one
    on a toast three levels away, and 149 of r006's 943 cards carry `aria-live` for reasons having
    nothing to do with fetching. A card with none definitely does not announce; a card with one
    might. The skill's own figure (8 of 23 announce) measured placement and is the stricter number
    — the two bracket the truth rather than disagreeing, and neither should be restated as the other.

    `--show=silent` prints the population so the first error to look for stays visible: a card
    counted as silent that never fetched at all.
    """
    if not any(f in src for f in FETCHES): return None
    return "aria-live" in src or 'role="status"' in src or 'role="alert"' in src


CJK = re.compile(r"[一-鿿]")
# Cases whose conversation is not in Chinese. Any CJK in their cards is the defect the language
# rule names — and until one of these existed, that rule had no population in this suite at all:
# 28 of 28 cases were Chinese, against a real corpus of en 39% / es 31% / fr 12% / zh 0.2%.
NON_ZH = {"es-meal-plan"}


def main() -> None:
    root = pathlib.Path(sys.argv[1])
    show = next((a.split("=")[1] for a in sys.argv[2:] if a.startswith("--show=")), "")
    limit = int(next((a.split("=")[1] for a in sys.argv[2:] if a.startswith("--limit=")), 5))

    n = coll_cards = coll_total = pre_cards = code_cards = fetch_cards = silent_cards = foreign_cards = cjk_cards = 0
    samples = collections.defaultdict(list)
    for path in sorted(root.glob("*/*/turn-*.tsx")):
        src = path.read_text(errors="ignore"); n += 1
        hits = collisions(src)
        if hits:
            coll_cards += 1; coll_total += len(hits)
            samples["collision"].append((path, hits[0]))
        if "<pre" in src or "```" in src or "shiki" in src:
            code_cards += 1
            if hand_rolled_pre(src): pre_cards += 1; samples["pre"].append((path, ""))
        said = announces(src)
        if said is not None:
            fetch_cards += 1
            if not said: silent_cards += 1; samples["silent"].append((path, next(f for f in FETCHES if f in src)))
        if path.parent.parent.name in NON_ZH:
            foreign_cards += 1
            # A window around the match, not the character: one 汉字 on its own says nothing about
            # whether it is a button label the reader cannot use or a comment they never see.
            if (m := CJK.search(src)):
                cjk_cards += 1
                samples["cjk"].append((path, " ".join(src[max(0, m.start() - 60):m.start() + 40].split())))

    print(f"{root.name}: {n} 张卡片源码\n")
    print(f"  hover/pressed 同族碰撞      {coll_cards:4} 张卡片，共 {coll_total} 处")
    print(f"  手搓 <pre>（无 shiki）      {pre_cards:4} 张 / {code_cards} 张带代码的"
          f"{f' ({pre_cards/code_cards:.1%})' if code_cards else ''}")
    print(f"  会取数但无任何 live region {silent_cards:4} 张 / {fetch_cards} 张会取数的"
          f"{f' ({silent_cards/fetch_cards:.1%}，缺陷下界)' if fetch_cards else ''}")
    print(f"  非中文对话里出现 CJK      {cjk_cards:4} 张 / {foreign_cards} 张这类卡"
          f"{f' ({cjk_cards/foreign_cards:.1%})' if foreign_cards else '（本轮没有非中文用例）'}")

    if show:
        print(f"\n── {show} 的前 {limit} 个命中（计数之前先读它们）──")
        for path, note in samples[show][:limit]:
            print(f"  {path.relative_to(root)}\n    {note}")


if __name__ == "__main__": main()

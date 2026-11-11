# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Files the cases refer to. Written before a round, identical for every model.

`log-dig` is the only case whose expected answer RUNS something, and a case that names a file which
is not there does not measure a weaker answer — it measures nothing, identically for all eleven
models, while still costing a full run each. So the file is generated rather than assumed, and
generated deterministically: same bytes every round, or the case stops being comparable across
rounds for reasons that have nothing to do with the prompt.

No `random` seed, no timestamp of the moment — a fixture that differs per round is a second
variable. The clock below is a fixed window in the past, written out literally.

    uv run eval/fixtures.py
"""
import pathlib

ROOT = pathlib.Path("/tmp/ui4a-fixtures")

# One night's traffic for a small Node API. Three things are buried in here on purpose, because a
# case whose answer is visible in the first ten lines cannot tell a card that narrows from a card
# that dumps: the errors start at 02:14 and not before; they are dominated by ONE code
# (`ETIMEDOUT` on the payments upstream) with two decoys mixed in; and they are concentrated on a
# single `user=` value, which is only visible once something groups by it.
def build() -> str:
    lines = []
    for minute in range(0, 60, 3):  # 01:00–01:57, quiet
        lines.append(f"2026-08-28T01:{minute:02d}:11.204Z INFO  req GET /v1/orders user=u1042 status=200 ms=31")
        lines.append(f"2026-08-28T01:{minute:02d}:44.881Z INFO  req GET /v1/orders user=u2318 status=200 ms=27")
    for minute in range(14, 60, 2):  # 02:14 onward, the incident
        lines.append(f"2026-08-28T02:{minute:02d}:03.512Z ERROR req POST /v1/pay user=u7781 status=504 "
                     f"err=ETIMEDOUT upstream=payments-gw ms=30012")
        lines.append(f"2026-08-28T02:{minute:02d}:19.077Z INFO  req GET /v1/orders user=u1042 status=200 ms=34")
        if minute % 6 == 0:  # the decoys, rare enough that a `head` misses them
            lines.append(f"2026-08-28T02:{minute:02d}:41.330Z ERROR req GET /v1/orders user=u2318 status=500 "
                         f"err=ECONNRESET upstream=orders-db ms=118")
        if minute == 40:
            lines.append("2026-08-28T02:40:57.001Z WARN  pool exhausted size=32 waiting=17")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / "api.log"
    path.write_text(build())
    print(f"{path}  {len(build().splitlines())} lines")

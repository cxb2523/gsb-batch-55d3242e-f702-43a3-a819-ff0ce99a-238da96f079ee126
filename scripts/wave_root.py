"""The wave root, in one place for every Python script that needs it: `from wave_root import ROOT`.

Under ~/.cache, not /tmp: macOS reaps /tmp and took every wave from w001 to w019 with it — cards,
screenshots and verdicts, all of it paid for in real model calls.

One place per language rather than one per script. The value was written out in ten files, with the
same comment pasted beside it six times, and the two that FORGOT to read the variable at all
measured an empty directory and reported that as a result. `wave-root.sh` is this file's twin.

Importable because `uv run scripts/<name>.py` puts `scripts/` on `sys.path[0]`, whatever the cwd.
"""
import os, pathlib

ROOT = pathlib.Path(os.environ.get("WAVE_ROOT") or os.path.expanduser("~/.cache/genui-loop"))

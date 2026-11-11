"""Regression tests for the LUT / input allowed-roots boundary (PathPolicy.resolve_lut).

The video input and the 3D LUT are confined by two *separate* allowed-roots lists; these tests prove through the
real process boundary (the CLI's `plan` subcommand, --json) that the two are never mixed up:

- a .cube inside the input root but outside the LUT root is refused (PATH_NOT_ALLOWED), and accepted once it
  lives under the LUT root;
- with only --allowed-input set, the LUT roots fall back to the input roots (a LUT outside them is refused, one
  inside plans fine);
- a symlink inside the LUT root that points outside it is refused as an escape (reason outside_allowed_roots),
  not reported as a missing file;
- an explicitly empty LUT root list means "no usable root" (every LUT refused), while no roots at all still
  means any readable regular file.

Everything runs through `plan` against a stub ffmpeg-skill checkout: no real encoding is started and neither
ffmpeg nor ffprobe is needed. Failing assertions print the error code and details so it is immediately visible
whether the path policy or the request validation refused.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import request_doc

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))

from color_grading.adapter import FLAG_ALTERNATIVES, REQUIRED_FLAGS  # noqa: E402
from color_grading.errors import ColorError  # noqa: E402
from color_grading.security import PathPolicy  # noqa: E402

CUBE_TEXT = 'TITLE "t"\nLUT_3D_SIZE 2\n' + "".join(f"{r} {g} {b}\n" for r in (0, 1) for g in (0, 1) for b in (0, 1))


def _contract_doc():
    """A contract declaring exactly the flags the adapter requires, built from the adapter's own tables so this
    stub cannot silently drift from what the real ffmpeg-skill must offer."""
    tools = []
    for tool, flags in REQUIRED_FLAGS.items():
        props = {f: {} for f in flags}
        for group in FLAG_ALTERNATIVES.get(tool, {}).values():
            for f in group:
                props.setdefault(f, {})
        tools.append({"name": tool, "input_schema": {"properties": props}})
    return {"skill": {"id": "ffmpeg-skill", "version": "9.9.9"}, "contract_version": "1.0", "tools": tools}


def make_fake_ffmpeg_skill(root: Path) -> Path:
    """A minimal ffmpeg-skill stand-in: just enough of the contract / doctor / probe surface for `plan` to reach
    its path-policy checks. `color` aborts if it is ever invoked -- plan must never start an encode."""
    scripts = root / "scripts"
    scripts.mkdir(parents=True)
    contract = json.dumps(_contract_doc())
    doctor = json.dumps({"ffmpeg": "9.9.9", "ffprobe": "9.9.9", "available": ["filter:lut3d", "encoder:libx264"]})
    (scripts / "_contract.py").write_text("import sys\n" f"print({doctor!r} if 'doctor' in sys.argv else {contract!r})\n", encoding="utf-8")
    (scripts / "probe.py").write_text(
        "import json\n"
        'print(json.dumps({"duration": 1.0, "audio": None, "video": {"width": 16, "height": 16, "pix_fmt": "yuv420p", "codec": "h264",'
        ' "color_space": "bt709", "color_primaries": "bt709", "color_transfer": "bt709", "color_range": "tv"}}))\n', encoding="utf-8")
    (scripts / "color.py").write_text("raise SystemExit('ffmpeg-skill/color must never run under plan')\n", encoding="utf-8")
    return root


@pytest.fixture
def fake_skill(tmp_path) -> Path:
    return make_fake_ffmpeg_skill(tmp_path / "ffmpeg-skill")


@pytest.fixture
def ws(tmp_path) -> Path:
    """A workspace with a source video. The bytes are never decoded (the stub probe answers), but the file must
    exist, be a regular file and be readable -- that is all the path policy checks."""
    d = tmp_path / "ws"
    d.mkdir()
    (d / "sdr.mp4").write_bytes(b"not-really-video")
    return d


def plan(doc, *args):
    """Run `color-grading plan - --json <args>` in a subprocess and return (exit_code, response_doc, stderr)."""
    env = dict(os.environ)
    env["PYTHONPATH"] = str(HERE.parent / "src") + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.run([sys.executable, "-m", "color_grading.cli", "plan", "-", "--json", *args],
                          input=json.dumps(doc), capture_output=True, text=True, env=env)
    try:
        return proc.returncode, json.loads(proc.stdout), proc.stderr
    except ValueError:
        raise AssertionError(f"stdout is not exactly one JSON document (exit {proc.returncode})\nstdout:\n{proc.stdout}\nstderr:\n{proc.stderr}")


def lut_request(lut_path) -> dict:
    return request_doc([{"op_id": "l", "type": "LUT_APPLY", "input": "source", "parameters": {"lut_path": str(lut_path)}}])


def test_lut_root_and_input_root_are_not_interchangeable(tmp_path, ws, fake_skill):
    """Both roots set: a .cube inside the input root but outside the LUT root is refused; the same file under the
    LUT root plans successfully. A caller confined to reading footage must not read arbitrary .cube files as LUTs."""
    lut_root = tmp_path / "luts"
    lut_root.mkdir()
    sneaky = ws / "sneaky.cube"   # readable as *input material*, not as a LUT
    sneaky.write_text(CUBE_TEXT, encoding="utf-8")
    roots = ["--allowed-input", str(ws), "--allowed-lut", str(lut_root)]

    code, d, _ = plan(lut_request(sneaky), "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill), *roots)
    assert code != 0 and d["ok"] is False, d
    err = d["error"]
    assert err["code"] == "PATH_NOT_ALLOWED", err
    assert err["details"]["reason"] == "outside_allowed_roots", err
    # the LUT policy refused, not the input policy or request validation
    assert err["details"]["allowed_lut_roots"] == [str(lut_root.resolve())], err

    good = lut_root / "sneaky.cube"
    good.write_text(CUBE_TEXT, encoding="utf-8")
    code, d, _ = plan(lut_request(good), "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill), *roots)
    assert code == 0 and d["ok"] is True, d.get("error")
    assert d["dry_run"] is True
    luts = [s["lut"] for s in d["plan"]["steps"] if s["type"] == "LUT_APPLY"]
    assert luts and Path(luts[0]["path"]) == good.resolve(), d["plan"]["steps"]
    # plan is a dry run: nothing was written, no encode was started
    assert not (ws / "out").exists() and not (ws / ".color-grading").exists()


def test_lut_roots_fall_back_to_input_roots_when_unset(tmp_path, ws, fake_skill):
    """Only --allowed-input set: LUTs are confined to the input roots (never 'any file'), so a LUT outside them is
    refused while one inside plans fine."""
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    ext_lut = outside / "x.cube"
    ext_lut.write_text(CUBE_TEXT, encoding="utf-8")

    code, d, _ = plan(lut_request(ext_lut), "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill), "--allowed-input", str(ws))
    assert code != 0 and d["ok"] is False, d
    assert d["error"]["code"] == "PATH_NOT_ALLOWED", d["error"]
    assert d["error"]["details"]["reason"] == "outside_allowed_roots", d["error"]

    int_lut = ws / "x.cube"
    int_lut.write_text(CUBE_TEXT, encoding="utf-8")
    code, d, _ = plan(lut_request(int_lut), "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill), "--allowed-input", str(ws))
    assert code == 0 and d["ok"] is True, d.get("error")


def test_lut_symlink_pointing_outside_lut_root_is_refused(tmp_path, ws, fake_skill):
    """A symlink inside the LUT root whose target is outside it resolves before the root check: the refusal must
    say 'escaped the root' (outside_allowed_roots), not 'file missing' -- the link points at a real file."""
    lut_root = tmp_path / "luts"
    lut_root.mkdir()
    outside = tmp_path / "secret"
    outside.mkdir()
    target = outside / "secret.cube"
    target.write_text(CUBE_TEXT, encoding="utf-8")
    link = lut_root / "link.cube"
    try:
        link.symlink_to(target)
    except OSError as e:
        pytest.skip(f"this platform/user cannot create symlinks: {e}")

    code, d, _ = plan(lut_request(link), "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill), "--allowed-lut", str(lut_root))
    assert code != 0 and d["ok"] is False, d
    assert d["error"]["code"] == "PATH_NOT_ALLOWED", d["error"]
    assert d["error"]["details"]["reason"] == "outside_allowed_roots", d["error"]


def test_explicit_empty_lut_root_list_refuses_every_lut(tmp_path):
    """resolve_lut with allowed_lut_roots=[] must treat the list as 'no usable root', not as 'unset': no fallback
    to the input roots, no fallback to 'any readable file'."""
    ws = tmp_path / "ws"
    ws.mkdir()
    luts = []
    for path in (tmp_path / "anywhere.cube", ws / "inside-input-root.cube"):
        path.write_text(CUBE_TEXT, encoding="utf-8")
        luts.append(path)
    policies = [PathPolicy(str(ws), allowed_lut_roots=[]),
                PathPolicy(str(ws), allowed_input_roots=[str(ws)], allowed_lut_roots=[])]  # empty must not fall back to the input roots
    for policy in policies:
        for lut in luts:
            with pytest.raises(ColorError) as ei:
                policy.resolve_lut(str(lut))
            assert ei.value.code == "PATH_NOT_ALLOWED", ei.value.details
            assert ei.value.details["reason"] == "outside_allowed_roots", ei.value.details


def test_no_roots_at_all_still_allows_any_readable_regular_file(tmp_path):
    """Unset (None) LUT roots keep the long-standing CLI behaviour: any readable regular file may be a LUT."""
    ws = tmp_path / "ws"
    ws.mkdir()
    lut = tmp_path / "any.cube"
    lut.write_text(CUBE_TEXT, encoding="utf-8")
    policy = PathPolicy(str(ws))
    assert policy.allowed_lut_roots is None
    assert policy.resolve_lut(str(lut)) == lut.resolve()


def test_output_confinement_is_not_weakened_by_the_lut_fix(tmp_path, ws, fake_skill):
    """The write side of the policy is untouched: outputs must stay inside the workspace and may never be the
    input, through the same plan boundary."""
    doc = request_doc([{"op_id": "r", "type": "RETAG", "input": "source", "parameters": {"target": "bt709"}}],
                      outputs=[{"output_id": "o", "operation": "op:r", "path": "../escape.mp4", "format": "mp4"}])
    code, d, _ = plan(doc, "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill))
    assert code != 0 and d["ok"] is False, d
    assert d["error"]["code"] == "PATH_NOT_ALLOWED", d["error"]
    assert d["error"]["details"]["reason"] == "traversal", d["error"]
    assert not (tmp_path / "escape.mp4").exists()

    doc = request_doc([{"op_id": "r", "type": "RETAG", "input": "source", "parameters": {"target": "bt709"}}],
                      outputs=[{"output_id": "o", "operation": "op:r", "path": "sdr.mp4", "format": "mp4", "overwrite": True}])
    before = (ws / "sdr.mp4").read_bytes()
    code, d, _ = plan(doc, "--workspace", str(ws), "--ffmpeg-skill", str(fake_skill))
    assert code != 0 and d["ok"] is False, d
    assert d["error"]["code"] == "OUTPUT_ERROR", d["error"]
    assert d["error"]["details"]["reason"] == "input_output_collision", d["error"]
    assert (ws / "sdr.mp4").read_bytes() == before

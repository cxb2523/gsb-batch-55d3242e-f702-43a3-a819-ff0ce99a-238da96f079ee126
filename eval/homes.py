# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml~=6.0"]
# ///
"""Create one eval home per model under test, all pointed at the :4000 gateway.

`scripts/eval-home.py` makes homes for the wave suite and inherits whatever provider the shared
`~/.dsh/settings.yaml` names. That is `litellm-24000`, and this run cannot use it: the port is
closed (its uvicorn is wedged in `Waiting for connections to close`), while :4000 on the same host
answers and carries every model this suite samples, judges included.

So each home here declares its OWN `litellm-4000` provider, cloned from the 24000 block — same
model catalogue, same `defaultInput: [text, image]`, different base URL and key variable. Nothing
in `~/.dsh` is touched: the shared settings file is read, never written.

`settings.yaml` is a REAL FILE in every home. A symlink back to the shared one makes setting one
home's model set every home's, and the suite then measures one model N times while reporting N.

Usage: `uv run eval/homes.py` (all of them) or `uv run eval/homes.py <model> [...]`.
"""
import copy, pathlib, shutil, sys, yaml

MODELS = ["macaron-v1-venti", "macaron-v1-coding-venti", "glm-5.2", "gemini-3.7-flash", "grok-4.6",
          "gpt-5.6-terra", "kimi-k3", "minimax-m3", "glm-5.3-flash", "step-3.7-flash"]
SHARED = pathlib.Path.home() / ".dsh"
PREFIX = ".dsh-ui4a-"


def home_for(model: str) -> pathlib.Path:
    return pathlib.Path.home() / f"{PREFIX}{model}"


def build(model: str) -> pathlib.Path:
    home = home_for(model)
    (home / "profiles").mkdir(parents=True, exist_ok=True)
    if not (home / "profiles" / "headless").exists():
        shutil.copytree(SHARED / "profiles" / "headless", home / "profiles" / "headless", symlinks=True)
    # Symlinked, not copied: credentials rotate, and a stale copy fails as an auth error that
    # looks exactly like a model refusing the task.
    for name in (".credentials.yaml", ".anonymous-user-id"):
        link = home / name
        if (SHARED / name).exists():
            if link.is_symlink() or link.exists(): link.unlink()
            link.symlink_to(SHARED / name)

    # The shared profile's user layer inserts four personal MCP servers (exa, gh, py, web). Each
    # boots a process per run — a wave of ten is forty of them — and none of them has anything to do
    # with whether a card appears, while `gh` also carried a real token into every eval subprocess.
    (home / "profiles" / "headless" / "cordis.patch.yml").write_text(
        "# ui4a eval profile: no MCP servers. See eval/homes.py for why.\n[]\n")

    settings = yaml.safe_load((SHARED / "settings.yaml").read_text())
    providers = settings["llm-pi-ai"]["providers"]
    gw = copy.deepcopy(providers["litellm-24000"])
    gw["displayName"], gw["baseURL"], gw["apiKeyEnv"] = "litellm 4000", "http://34.177.103.253:4000/v1", "LITELLM_4000_API_KEY"
    providers["litellm-4000"] = gw
    settings["agent-default-model"] = {"provider": "litellm-4000", "model": model}
    # The shared home runs the `py-codeact` preset, which is the user's own tooling and not what
    # production sessions compose. `code` is the preset every earlier wave measured on.
    settings["agent-presets"] = {"default": "code"}
    (home / "settings.yaml").write_text(yaml.safe_dump(settings, allow_unicode=True, sort_keys=False))

    # Read back rather than trust the write — a home that silently names the wrong model measures
    # one model twice and reports two.
    got = yaml.safe_load((home / "settings.yaml").read_text())["agent-default-model"]
    if got != {"provider": "litellm-4000", "model": model}:
        sys.exit(f"homes: {home} wrote {got!r}")
    if model not in {m["id"] for m in gw["models"]}:
        sys.exit(f"homes: {model} is not declared in the provider catalogue — dsh would reject it")
    return home


if __name__ == "__main__":
    for m in (sys.argv[1:] or MODELS):
        print(build(m))

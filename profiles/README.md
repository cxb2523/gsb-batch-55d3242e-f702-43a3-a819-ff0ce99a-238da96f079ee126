# Running the fixtures against another model

`scripts/eval.sh` honours `DSH_HOME`, so a second model needs an isolated dsh home rather than
an edit to the user's own `~/.dsh/settings.yaml` — which is global and would change every
session's default.

```sh
mkdir -p /tmp/dsh-venti/profiles
cp -R ~/.dsh/profiles/headless /tmp/dsh-venti/profiles/
cp profiles/venti.patch.yml /tmp/dsh-venti/profiles/headless/cordis.patch.yml
cat > /tmp/dsh-venti/settings.yaml <<'YAML'
agent-default-model:
  provider: litellm-24000
  model: macaron-v1-venti
agent-presets:
  default: code
YAML

DSH_HOME=/tmp/dsh-venti LITELLM_24000_API_KEY=<key> ./scripts/eval.sh '帮我算下房贷'
```

Two things cost a round each:

- The patch layer alone is not enough. `agent-default-model` also appears in the **user** layer
  (`settings.yaml`), which is applied last, so a patch that names a different provider is
  silently overridden — the run still went to DeepSeek and reported its quota error.
- `reasoningEffort: high` is rejected outright by a hand-declared route unless the model
  declares `reasoningEfforts`. The gateway drops the parameter anyway, so omit it.

`UNSUPPORTED_REASONING_EFFORT` naming the new provider is the first sign the route is live.

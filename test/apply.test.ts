/**
 * The node half's registration, which nothing has ever run.
 *
 * `smoke.ts` loads the built CLIENT bundle and runs its `apply()`; the server half's is only
 * exercised in a real profile. Its structure is the whole of the plugin's degradation story —
 * every capability is a NESTED inject, deliberately, so a profile without `shell` loses
 * `$dsh/exec` and keeps everything else. A static `inject` naming all of them would take the
 * prompt and the skill down with it, which is the entire plugin.
 *
 * The context is a fake that records what was asked for and runs every callback, so this is
 * about which routes appear under which dependency, not about serving a request.
 */
import { expect, test } from "bun:test";
import { apply } from "../src/index.ts";

type Registration = { deps: readonly string[]; effects: string[] };

const applyWith = (available: readonly string[], config: unknown = {}) => {
  const registrations: Registration[] = [];
  const asked = new Set<string>();
  const effects: string[] = [];
  const stub = (): unknown => new Proxy(() => stub(), { get: () => stub(), apply: () => stub() });
  const make = (deps: readonly string[]): Record<string, unknown> => {
    const context: Record<string, unknown> = {
      effect: (run: () => unknown, label?: string) => {
        effects.push(label ?? "(unlabelled)");
        registrations.at(-1)?.effects.push(label ?? "(unlabelled)");
        try {
          run();
        } catch {
          /* the fake context cannot serve a request; registration is the subject */
        }
      },
      // `apply()` now mounts everything through one child plugin, so the fake has to run it —
      // the Proxy fallback would return a stub and the whole registration tree would go missing.
      plugin: (spec: { apply: (scoped: unknown) => void }) => {
        spec.apply(new Proxy(make(deps), { get: (target, key) => (key in target ? target[key as string] : stub()) }));
        return { dispose: async () => {} };
      },
      inject: (want: readonly string[], callback: (scoped: unknown) => void) => {
        // A dependency the profile does not have: cordis never runs the callback.
        for (const name of want) asked.add(name);
        if (!want.every((name) => available.includes(name))) return;
        registrations.push({ deps: want, effects: [] });
        callback(new Proxy(make([...deps, ...want]), { get: (target, key) => (key in target ? target[key as string] : stub()) }));
      },
    };
    return context;
  };
  const root = new Proxy(make([]), { get: (target, key) => (key in target ? target[key as string] : stub()) });
  apply(root as never, config as never);
  return { registrations, effects, asked };
};

const ALL = ["webServer", "sessions", "fs", "sandboxPolicy", "shell", "llm", "agentDefaultModel", "skills", "settings", "web", "agents"];

test("a full profile registers every route", () => {
  const { effects } = applyWith(ALL, { allowExec: true });
  for (const label of ["dsh-generative-ui: workspace files", "dsh-generative-ui: commands", "dsh-generative-ui: model stream", "dsh-generative-ui: skill"]) {
    expect(effects).toContain(label);
  }
});

// The route is the switch, so its absence is what "commands are off" MEANS. Note what this does
// NOT say: `applyWith` passes a bare `{}`, which never went through `Config`, so `allowExec` is
// absent rather than defaulted. The PRODUCT default (now on) is pinned in `allow-exec.test.ts`
// against the schema itself — asserting it from here would be asserting it about an object the
// host would never hand us.
test("an explicit off leaves the command route unregistered", () => {
  const { effects } = applyWith(ALL, { allowExec: false });
  expect(effects).not.toContain("dsh-generative-ui: commands");
  expect(effects).toContain("dsh-generative-ui: workspace files");
  expect(effects).toContain("dsh-generative-ui: skill");
});

// And the other direction, which nothing checked: the setting has to actually reach the route.
test("with commands on, the route is registered", () => {
  const { effects } = applyWith(ALL, { allowExec: true });
  expect(effects).toContain("dsh-generative-ui: commands");
});

/**
 * The point of the nesting: one missing capability costs one capability.
 *
 * A profile with no `shell` is a real deployment, not a hypothetical — it is what a read-only
 * or restricted profile looks like.
 */
test("a profile without `shell` loses only the command route", () => {
  const { effects } = applyWith(
    ALL.filter((name) => name !== "shell"),
    { allowExec: true },
  );
  expect(effects).not.toContain("dsh-generative-ui: commands");
  expect(effects).toContain("dsh-generative-ui: workspace files");
  expect(effects).toContain("dsh-generative-ui: model stream");
  expect(effects).toContain("dsh-generative-ui: skill");
});

// The skill and the prompt sit outside the webServer inject on purpose: a profile with no web
// server at all still tells the model how to write a card.
test("a profile with no web server still registers the prompt and the skill", () => {
  const { effects } = applyWith(["skills"]);
  expect(effects).toContain("dsh-generative-ui: skill");
  expect(effects).not.toContain("dsh-generative-ui: workspace files");
});

/**
 * Every service the node half asks for is one a profile can actually provide.
 *
 * cordis silently never runs a callback whose dependency is missing, so a typo'd or renamed
 * service costs whatever that callback registered — with no error anywhere. The client half has
 * the same check in `smoke.ts`; this is its counterpart, and the list is short enough that a
 * genuinely new dependency is a deliberate one-line edit here.
 */
test("apply() asks for no service that does not exist", () => {
  const { asked } = applyWith(ALL);
  expect([...asked].filter((name) => !ALL.includes(name))).toEqual([]);
});

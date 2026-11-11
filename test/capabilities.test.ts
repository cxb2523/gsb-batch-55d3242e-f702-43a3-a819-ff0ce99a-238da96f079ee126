import { expect, test } from "bun:test";
import { capabilityModule } from "../src/contract.ts";
import { bind } from "../src/client/runtime/bindings.ts";
import { inlinePrompt, type Capabilities } from "../src/prompt.ts";
import { skillBody } from "../src/skill.ts";

/**
 * The prompt used to say there was no persistence hook, and the model supplied one anyway —
 * `import { usePersistedState } from "$dsh/state"`, in 5 of 6 runs, surviving a reworded denial.
 * An unresolvable bare specifier fails the whole module import and leaves a blank card with
 * nothing in the console naming the cause, so the text telling the model what exists has to stay
 * in step with what actually exists.
 *
 * Enumerated from `bind()` rather than from a list beside it: a group added to the implementation
 * and missed here would be a capability nobody is told about, which is one nobody uses.
 */
const GROUPS = Object.keys(bind());

/**
 * Which groups this host actually mounted. Both directions matter and they fail differently:
 * naming one that is off teaches the model an import that will fail — and a failed import takes
 * the whole module down, so the reader gets a blank card naming nothing. Omitting one that is on
 * wastes it.
 *
 * `chat` and `state` need no service and are always mounted.
 */
const groupsFor = (capabilities: Capabilities) => GROUPS.filter((g) => g === "chat" || g === "state" || capabilities[g as keyof Capabilities]);
const SUBSETS: Capabilities[] = [];
for (const fs of [false, true]) for (const ai of [false, true]) for (const exec of [false, true]) for (const web of [false, true]) SUBSETS.push({ fs, ai, exec, web });

test("bind() exposes something to enumerate", () => {
  expect(GROUPS.length).toBeGreaterThan(0);
});

test("the prompt names every capability the host exposes", () => {
  for (const capabilities of SUBSETS) {
    const text = inlinePrompt(capabilities);
    for (const group of groupsFor(capabilities)) expect(text).toContain(capabilityModule(group));
  }
});

test("the skill names every capability the host exposes", () => {
  for (const capabilities of SUBSETS) {
    const body = skillBody(undefined, undefined, capabilities);
    for (const group of groupsFor(capabilities)) expect(body).toContain(capabilityModule(group));
  }
});

/**
 * The other direction, and the one that fails silently. `INVENTED-CAPABILITY` screens a card for
 * importing a `$dsh/…` that resolves to nothing — the prompt must not be the thing that taught it
 * the name. Every specifier either prompt mentions has to be one `bind()` actually returns.
 */
test("and no capability that does not exist — or that this host withheld", () => {
  for (const capabilities of SUBSETS) checkNamedCapabilities(capabilities);
});

function checkNamedCapabilities(capabilities: Capabilities) {
  const real = new Set(groupsFor(capabilities).map(capabilityModule));
  const both = inlinePrompt(capabilities) + skillBody(undefined, undefined, capabilities);
  // `$dsh/internal` is the private module the blob shims import; it is deliberately not a
  // capability and must not appear in anything the model reads.
  const named = new Set([...both.matchAll(/\$dsh\/[\w-]+/g)].map((m) => m[0]));
  expect([...named].filter((s) => !real.has(s))).toEqual([]);
}

// The module the model asked for before it existed. It is the answer to the persistence rule, so
// the rule has to name it by its import line — a capability described in prose but never spelled
// as an import is one the model has to guess the shape of.
test("the persistence rule shows the $dsh/state import", () => {
  expect(skillBody(undefined, undefined)).toContain(`import { usePersistedState } from "${capabilityModule("state")}"`);
});

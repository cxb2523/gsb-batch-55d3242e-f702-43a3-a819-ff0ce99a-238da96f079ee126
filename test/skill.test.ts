/**
 * The skill's generated paragraph about which import map serves which command.
 *
 * Three states, because the two maps have genuinely different lifetimes — the type map can
 * exist while the stub one does not. Nesting these interpolations inline is how this file
 * broke twice, and the failure mode is bad advice reaching the model rather than an exception:
 * a wrong `-i` flag makes every `$dsh/*` import report `Cannot find module`, and the model
 * then "fixes" imports that were correct.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import { CAPABILITY_PREFIX } from "../src/contract.ts";
import { CLI_URL, mapNotes, skillEntry, skillPath, skillResourceBase, SKILL_DESCRIPTION, SKILL_NAME } from "../src/skill.ts";

describe("mapNotes", () => {
  // No type map means no `-i` advice at all: telling the model to pass a flag pointing at a
  // file that does not exist is worse than saying nothing.
  test("without a type map the paragraph is empty", () => {
    expect(mapNotes(undefined, undefined)).toBe("");
    expect(mapNotes(undefined, "stub.json")).toBe("");
  });

  test("with only a type map, build and dev are called out as unsupported", () => {
    const notes = mapNotes("types.json", undefined);
    expect(notes).toContain(CAPABILITY_PREFIX);
    expect(notes).toContain("check <file> -i types.json");
    expect(notes).toContain("`build` and `dev` want runnable JS and will fail on it");
    // Nothing may promise a second map that is not there.
    expect(notes).not.toContain("-i stub.json");
  });

  test("with both maps, build gets the stub map by name", () => {
    const notes = mapNotes("types.json", "stub.json");
    expect(notes).toContain("check <file> -i types.json");
    expect(notes).toContain("-i stub.json");
    expect(notes).toContain("build <file>");
    // The earlier wording must not survive alongside the command that contradicts it.
    expect(notes).not.toContain("will fail on it");
  });

  // The tell for the interpolation bug this guards: an unevaluated `${` reaching the model.
  test("no state leaks a raw template placeholder", () => {
    for (const notes of [mapNotes("t.json", "s.json"), mapNotes("t.json", undefined), mapNotes(undefined, undefined)]) {
      expect(notes).not.toContain("${");
      expect(notes).not.toContain("undefined");
      expect(notes).not.toContain("[object Object]");
    }
  });
});

test("the packaged entrypoint and reference base agree with the registration", () => {
  const source = readFileSync(skillPath, "utf8");
  expect(SKILL_DESCRIPTION).toContain("adjustable calculation");
  expect(SKILL_DESCRIPTION).toContain("Always load this skill first");
  expect(SKILL_DESCRIPTION).toContain("learning plan or checklist");
  expect(SKILL_DESCRIPTION).toContain("recommendations or option requests");
  expect(SKILL_DESCRIPTION).toContain("saved checklists, reusable templates");
  expect(SKILL_DESCRIPTION).toContain("anything to save, reuse, or edit later");
  expect(SKILL_DESCRIPTION).toContain("之后每次复用");
  expect(SKILL_DESCRIPTION).toContain("改改再用");
  expect(SKILL_DESCRIPTION).toContain("unit conversion");
  expect(SKILL_DESCRIPTION).toContain("98°F 是多少摄氏度");
  expect(SKILL_DESCRIPTION).toContain("cron, glob, regex, chmod");
  expect(SKILL_DESCRIPTION).toContain("even when the user asks for one number or expects prose");
  expect(source).toContain(`name: ${SKILL_NAME}`);
  expect(source).toContain(`description: ${SKILL_DESCRIPTION}`);
  expect(readFileSync(join(skillResourceBase.path, "references/checking.md"), "utf8")).toContain(CLI_URL);
  const rendered = renderSkillContent({ name: SKILL_NAME, provider: "runtime", resourceBase: skillResourceBase, content: skillEntry("types.json", "standalone.json", true) });
  expect(rendered).toContain(`Base directory for this skill: ${skillResourceBase.path}`);
  expect(rendered).toContain("references/layout.md");
  expect(rendered).not.toContain("## Layout");
});

test("the progressive entrypoint hands durable requests to the first canvas write", () => {
  const entry = skillEntry("types.json", "standalone.json", true);
  expect(entry).toContain("immediately write the");
  expect(entry).toContain("first usable file to `.dsh/ui4a/canvases/<id>.ui4a.tsx`");
  expect(entry).toContain("another design/planning skill");
  expect(entry).toContain("每来一个新人都改改再用");
  expect(entry).toContain("An empty workspace does not change this");
  expect(entry).toContain("There is no `references/canvas.md`");
  expect(entry).toContain("must preserve edited titles, added items, and saved content");
  expect(entry).toContain("setBoard(cloneFresh(DEFAULT_BOARD))");
  expect(entry).toContain("behavior for a separately labelled");
  expect(entry).toContain("do not\nalso emit an inline `ui4a/tsx` fence");
  const lifetime = readFileSync(join(skillResourceBase.path, "references/lifetime.md"), "utf8");
  expect(lifetime).toContain("same id and path");
  expect(lifetime).toContain("usePersistedState");
  expect(lifetime).not.toContain("useState(OPTIONS[0].id)");
  expect(lifetime).toContain("Start `pick` at `null`");
  expect(lifetime).toContain('usePersistedState<string | null>("migration-plan-draft", null)');
  expect(lifetime).toContain('usePersistedState("miles-to-km:miles", "5")');
  expect(lifetime).toContain('usePersistedState("miles-to-km:km", "8.04672")');
  expect(lifetime).toContain("{miles} 英里 = {kmText} 公里");
  expect(lifetime).toContain("A mortgage with principal, years,");
  expect(lifetime).toContain("rate, and repayment method has four persisted values");
  expect(lifetime).toContain("Keep every existing id, edited title, template-owned field, and added item");
  expect(lifetime).toContain("template-owned field");
  expect(lifetime).toContain("include every user-editable field in the payload");
  expect(lifetime).toContain("must not share the next-person handler");
  expect(lifetime).toContain("option control must visibly write the draft");
  expect(lifetime).toContain("disclosure handler must not be the only handler");
  expect(lifetime).toContain("sent !== null");
  expect(lifetime).toContain("draft` and `committed` as separate persisted values");
  expect(lifetime).toContain("serialized snapshot of the complete persisted object");
  expect(lifetime).toContain("setDays(SEED)");
  expect(lifetime).toContain("Reuse is not permission to expand the visible schema");
  expect(lifetime).toMatch(/confirmation is an extra control and needs an explicit\s+request/);
});

test("the progressive entrypoint keeps the inline fence and reference-read contracts", () => {
  const entry = skillEntry("types.json", "standalone.json", true);
  expect(entry).toContain("## Authoring order");
  expect(entry).toContain("start the first generation on mount");
  expect(entry).toContain("do not emit an inline fence or an export/re-export fence");
  expect(entry).toContain("Do not send interim assistant text while working");
  expect(entry).toContain("exactly four backticks followed by `ui4a/tsx`");
  expect(entry).toContain("Do not call the `generative-ui` skill again with the same name");
  expect(entry).toContain("loan or mortgage calculations");
  expect(entry).toContain("BMI thresholds or calculators");
  expect(entry).toContain("unit conversions");
  expect(entry).toContain("Any unit conversion is still an inline card when the user gives only one input");
  expect(entry).toContain("several candidates, recommendations, or options");
  expect(entry).toContain("Before writing **any interactive card**");
  expect(entry).toContain("mortgage must persist principal, years, rate, and method separately");
  expect(entry).toContain("Source-check the card before sending");
  expect(entry).toContain("guard against a second send after the persisted answer");
  expect(entry).toContain("must not claim that the user already chose one");
  expect(entry).toContain("calculator mode or standard may use a sensible **persisted** default");
  expect(entry).toContain("a choice card must contain both `sendMessage` and `usePersistedState`");
  expect(entry).toContain("Persist every card-owned value the reader can edit in an inline card");
  expect(entry).toContain("Keep displayed values live");
  expect(entry).toContain("only the named data and controls");
  expect(entry).toContain("never `5 miles = {format(km)}`");
  expect(entry).toContain("Keep units and formulas on the same scale");
  expect(entry).toContain("A zero interest rate is valid");
  expect(entry).toContain("do not output its computed answer or numeric summary anywhere outside the fence");
  expect(entry).toContain("Keep status text readable in both themes");
  expect(entry).toContain("Do not use hex, rgb, or hsl utility colours");
  expect(entry).toContain("A hover-only action must remain visible");
  expect(entry).toContain("Run this source gate immediately before sending or writing");
  expect(entry).toContain("reset-for-next-person or reset-progress action transforms the current persisted object");
  expect(entry).toContain("bg-accent text-white");
  expect(entry).toContain('Every `<button>` has `type="button"`');
  expect(entry).toContain("Copy must match behavior");
  expect(entry).toContain("Never import `usePersistedState` from `react`");
  expect(entry).toContain("use tools needed to build or check the card");
  expect(entry).toContain("Do not promise a control that the card does not render or trigger");
  expect(entry).toContain("do not promise an automatic reply that it does not trigger");
  expect(entry).toContain("only calls `useState`, changes `openId`, or changes styling");
  expect(entry).toContain("This scan covers the whole reply");
  expect(entry).toContain("use `.has` only when the value is actually a `Set`");
  expect(entry).toContain("never turn a failed directory read into an empty successful listing");
  expect(entry).toContain("top-level capability failure must render a visible error");
  expect(entry).toContain("silent fallback to seed data is allowed only around parsing");
  expect(entry).toContain("complete reply must contain one opener and one closer");
  expect(entry).toContain("remove planning, self-review, scratch code");
  expect(entry).toContain("exactly one `ui4a/tsx` block");
  const files = readFileSync(join(skillResourceBase.path, "references/files.md"), "utf8");
  expect(files).toContain('`"file"` and `"directory"`');
  expect(files).toContain("prefer one bounded command listing");
  expect(files).toContain("A timed-out or failed command is an\nerror state");
  const ai = readFileSync(join(skillResourceBase.path, "references/ai.md"), "utf8");
  expect(ai).toContain("only for parsing an incomplete frame");
  expect(ai).toContain("visible error state");
  expect(ai).toContain("first `streamText` call during the initial mount/effect");
  expect(ai).toContain("the batch is card-owned\nstate too: persist it");
  expect(ai).toContain("clear the uncommitted draft, keep the last successful batch");
  const checking = readFileSync(join(skillResourceBase.path, "references/checking.md"), "utf8");
  expect(checking).toContain("complete assistant reply");
  expect(checking).toContain("numeric summary from prose before and after the fence");
  expect(entry).toContain("Fixed factual lookups");
  expect(entry).toContain("put the short introduction on its own line");
  expect(entry).toContain("start the exact four-backtick `ui4a/tsx` opener at the beginning of the next line");
  expect(entry).toContain("Never emit `。````ui4a/tsx`");
  expect(entry).toContain("leave one blank line");
  expect(entry).toContain("Do not call the `generative-ui` skill again with the same name");
  expect(entry).toContain("on its own line");
  expect(entry).toContain("required `file_path` argument");
  expect(entry).toContain("`file_path` is the only valid argument");
  expect(entry).toContain("or an empty read call");
  expect(entry).toContain("Before writing **any interactive card**");
  expect(entry).toContain("initialize every value that is visible on the first render");
  const accessibility = readFileSync(join(skillResourceBase.path, "references/accessibility.md"), "utf8");
  expect(accessibility).toContain("Contrast is part of the selected state");
  expect(accessibility).toContain("dsw-alias-label-primary-foreground");
  expect(accessibility).toContain("focus-visible:opacity-100");
  expect(accessibility).toContain("expanding a row is disclosure, not selecting a file");
  expect(accessibility).toContain("decorative loaders");
  expect(checking).toContain("Mechanical source audit before handoff");
  expect(checking).toContain("every user-editable expression");
  expect(checking).toContain("exact current draft snapshot");
  expect(checking).toContain("Compare the rendered schema with explicit scope words");
  expect(checking).toContain("If it also asks for one reset action");
});

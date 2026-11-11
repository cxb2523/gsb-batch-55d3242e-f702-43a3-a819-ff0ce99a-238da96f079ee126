import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { inlinePrompt } from "../src/prompt.ts";
import { skillBody } from "../src/skill.ts";

/**
 * A prompt that quotes an eval question has answered it in advance.
 *
 * Measured, and it cost a day of conclusions: the rule about long lists cited `你能使用哪些工具？`
 * as its example, that question was also in the wave, and it scored 48/48 — while two questions
 * of the SAME shape that were not quoted scored 23/48. Reworking a different rule moved the
 * quoted example from one wave question to another, and the two swapped scores: 19/23 → 1/24 as
 * one lost the citation, 6/20 → 14/21 as the other gained it. The rule had not changed for
 * either. Nothing in the numbers says "this is a citation effect" — they read exactly like a
 * rule that worked, which is why this has to be a test and not a habit.
 *
 * Examples still belong in the prompt; a rule with no example lands at 60-70% rather than near
 * 100%. What is forbidden is an example that is VERBATIM a question being measured. Describe the
 * question instead of quoting it: "a question asking what a runtime exposes" teaches the same
 * shape and can be scored honestly.
 */
test("no wave question appears verbatim in the prompt or the skill", () => {
  const waves = "/tmp/genui-loop/waves";
  let dirs: string[];
  try {
    dirs = readdirSync(waves).filter((d) => /^w\d{3}$/.test(d));
  } catch {
    return; // The corpus is not checked in; on a machine without it there is nothing to check.
  }
  const both = inlinePrompt(true) + skillBody("types.json", "standalone.json", true);
  const leaked: string[] = [];
  for (const dir of dirs) {
    let items: { q?: string }[];
    try {
      items = JSON.parse(readFileSync(`${waves}/${dir}/wave.json`, "utf8")) as { q?: string }[];
    } catch {
      continue;
    }
    for (const { q } of items) {
      // Short questions ("可以禁用吗") are common phrasings, not citations; a quoted example is
      // long enough to be recognisably one specific question.
      const text = q?.replace(/^用户：/, "").trim();
      if (text === undefined || text.length < 8) continue;
      const stripped = text.replace(/[？?！!。]+$/, "");
      if (both.includes(stripped)) leaked.push(`${dir}: ${text}`);
    }
  }
  expect(leaked).toEqual([]);
});

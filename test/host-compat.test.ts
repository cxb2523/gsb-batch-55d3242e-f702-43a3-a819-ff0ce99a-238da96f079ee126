import { expect, test } from "bun:test";
import { Context } from "@deepseek-ai/cordis";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apply, Config } from "../src/index.ts";
import { CARD_ERROR_PATH, EXEC_PATH } from "../src/contract-assets.ts";

// Real Cordis scopes with local host services; released SettingsForms/profile and
// LocalBashExecutor are additionally exercised by the external version matrix.
async function host(settings: object, config: Parameters<typeof apply>[1]) {
  const ctx = new Context();
  const routes = new Map<string, any>();
  const prompts = new Set<string>();
  const skills = new Set<{ content: string; resourceBase: { kind: "directory"; path: string } }>();
  const messages: any[] = [];
  ctx.provide("systemPrompt", {
    section({ text }: { text: string }) {
      prompts.add(text);
      return () => prompts.delete(text);
    },
    context() {
      return () => {};
    },
  } as never);
  ctx.provide("settings", settings as never);
  ctx.provide("webServer", {
    register(route: any) {
      expect(routes.has(route.path)).toBe(false);
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  } as never);
  ctx.provide("sessions", { list: () => [] } as never);
  ctx.provide("shell", {} as never);
  ctx.provide("sandboxPolicy", {} as never);
  ctx.provide("skills", {
    register(skill: { content: string; resourceBase: { kind: "directory"; path: string } }) {
      skills.add(skill);
      return () => skills.delete(skill);
    },
  } as never);
  ctx.provide("agents", { get: () => ({ followup: (message: unknown) => messages.push(message) }) } as never);
  let update!: () => void;
  await ctx.plugin({
    apply(owner: Context) {
      apply(owner, config);
      update = () => owner.emit("loader/volatile-update", [["allowExec"]]);
    },
  });
  await ctx.fiber.await();
  const check = (enabled: boolean) => {
    expect(routes.has(EXEC_PATH)).toBe(enabled);
    expect(prompts.size).toBe(1);
    expect(skills.size).toBe(1);
    expect([...prompts][0].includes("$dsh/exec")).toBe(enabled);
    const skill = [...skills][0];
    expect(skill.content.includes("references/commands.md")).toBe(enabled);
    expect(skill.content).not.toContain("## Running a command");
    expect(skill.resourceBase.kind).toBe("directory");
    expect(readFileSync(join(skill.resourceBase.path, "references/commands.md"), "utf8")).toContain("$dsh/exec");
  };
  const settled = async (enabled: boolean) => {
    // Parent fiber.await() does not await unloading descendants in older Cordis.
    const until = Date.now() + 1000;
    while (routes.has(EXEC_PATH) !== enabled && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 5));
    check(enabled);
  };
  return { ctx, routes, messages, update, check, settled };
}

test("profile references rebuild capability and documentation together without installSection", async () => {
  let enabled = true;
  const h = await host({}, { allowExec: { get: () => enabled } });
  try {
    h.check(true);
    const route = h.routes.get(EXEC_PATH);
    h.update();
    await h.ctx.fiber.await();
    expect(h.routes.get(EXEC_PATH)).toBe(route);
    for (const value of [false, true, false, true]) {
      enabled = value;
      h.update();
      await h.settled(value);
    }
    const req = {
      method: "POST",
      url: "?session=proof",
      async *[Symbol.asyncIterator]() {
        yield JSON.stringify({ message: "broken", phase: "compile" });
      },
    };
    const res = {
      writeHead() {
        return res;
      },
      end() {},
    };
    await h.routes.get(CARD_ERROR_PATH).handler(req, res);
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0].source).toMatchObject({ kind: "dsh-generative-ui", form: "notice" });
    expect(h.messages[0].source.summary).toBeTruthy();
  } finally {
    await h.ctx.fiber.dispose();
  }
  expect(h.routes.size).toBe(0);
});

test("legacy installSection keeps live disable and re-enable", async () => {
  let current = { allowExec: true };
  let changed!: () => void;
  const h = await host(
    {
      installSection(_owner: unknown, _name: string, _schema: unknown, _defaults: unknown, options: any) {
        options.setSource(() => current);
        changed = options.onChange;
      },
    },
    current,
  );
  try {
    h.check(true);
    for (const value of [false, true]) {
      current = { allowExec: value };
      changed();
      await h.settled(value);
    }
  } finally {
    await h.ctx.fiber.dispose();
  }
});

test("allowExec opts into native profile volatility", () => {
  expect(Config.dict!.allowExec!.meta).toHaveProperty("volatile", true);
});

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const parse = (records: unknown[]) => {
  const dir = mkdtempSync(join(tmpdir(), "visible-reply-"));
  const path = join(dir, "session.v4.jsonl");
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"));
  const proc = Bun.spawnSync(["bun", "scripts/visible-reply.ts", path]);
  rmSync(dir, { recursive: true, force: true });
  expect(proc.exitCode).toBe(0);
  return new TextDecoder().decode(proc.stdout);
};

const run = (records: unknown[]) => {
  const dir = mkdtempSync(join(tmpdir(), "visible-reply-"));
  const path = join(dir, "session.v4.jsonl");
  writeFileSync(path, records.map((record) => JSON.stringify(record)).join("\n"));
  const proc = Bun.spawnSync(["bun", "scripts/visible-reply.ts", path]);
  rmSync(dir, { recursive: true, force: true });
  return proc;
};

test("keeps assistant text and ignores reasoning, tools, and user content", () => {
  expect(
    parse([
      { type: "user/message", data: { message: { content: [{ type: "text", text: "98°F" }] } } },
      {
        type: "assistant/message",
        data: {
          message: {
            content: [
              { type: "reasoning", text: "scratch ```tsx 36.7" },
              { type: "tool-call", name: "read" },
            ],
          },
        },
      },
      { type: "tool/result", data: { message: { content: [{ type: "text", text: "reference" }] } } },
      {
        type: "assistant/message",
        data: {
          message: {
            content: [
              { type: "reasoning", text: "more scratch 36.7" },
              { type: "text", text: "intro\n\n````ui4a/tsx\nexport default function Card() {}\n````" },
            ],
          },
        },
      },
    ]),
  ).toBe("intro\n\n````ui4a/tsx\nexport default function Card() {}\n````");
});

test("concatenates visible text blocks from multiple assistant messages", () => {
  expect(
    parse([
      { type: "assistant/message", data: { message: { content: [{ type: "text", text: "before" }] } } },
      { type: "assistant/message", data: { message: { content: [{ type: "text", text: "after" }] } } },
    ]),
  ).toBe("beforeafter");
});

test("rejects a transcript that has no visible assistant text", () => {
  const proc = run([{ type: "assistant/message", data: { message: { content: [{ type: "reasoning", text: "scratch" }] } } }]);
  expect(proc.exitCode).not.toBe(0);
});

import { readFileSync } from "node:fs";

type ContentBlock = { type?: unknown; text?: unknown };
type TranscriptRecord = { type?: unknown; data?: { message?: { content?: unknown } } };

const inputPath = process.argv[2];
if (inputPath === undefined) throw new Error("usage: visible-reply.ts <session.v4.jsonl | ->");
const input = inputPath === "-" ? await new Response(Bun.stdin.stream()).text() : readFileSync(inputPath, "utf8");
let reply = "";
let assistantMessages = 0;
let visibleBlocks = 0;

for (const line of input.split(/\r?\n/)) {
  if (line.trim() === "") continue;
  let record: TranscriptRecord;
  try {
    record = JSON.parse(line) as TranscriptRecord;
  } catch (error) {
    throw new Error(`invalid transcript record: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (record.type !== "assistant/message") continue;
  assistantMessages++;
  const content = record.data?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const block of content as ContentBlock[])
    if (block.type === "text" && typeof block.text === "string") {
      visibleBlocks++;
      reply += block.text;
    }
}

if (assistantMessages === 0) throw new Error("transcript has no assistant/message record");
if (visibleBlocks === 0) throw new Error("completed turn has no visible assistant text block");
process.stdout.write(reply);

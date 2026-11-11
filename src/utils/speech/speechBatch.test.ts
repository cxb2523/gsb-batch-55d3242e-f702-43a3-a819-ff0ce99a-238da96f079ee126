import { it, expect, vi } from "vitest";
import { IAction } from "@fullstackcraftllc/codevideo-types";
import reducer, {
  addSpeechTake,
  initialSpeechState,
  SpeechLine,
} from "../../store/speechSlice";
import {
  createSingleFlight,
  generateSpeechBatch,
  missingSpeechTexts,
  speechBatchFailures,
  speechBatchSummary,
  SpeechBatchError,
  speechTextError,
  SPEECH_TEXT_ERROR,
} from "./speechBatch";

const speak = (
  value: string,
  name: IAction["name"] = "author-speak-before",
): IAction => ({
  name,
  value,
});

const take = {
  assetId: "take",
  mp3Url: "https://example.com/take.mp3",
  durationMs: 1200,
  provider: "kokoro" as const,
  voiceId: "af_heart",
  speed: 1,
  created: "",
};

it("selects only missing, unique speech lines", () => {
  const takes: Record<string, SpeechLine> = {
    Hello: { activeAssetId: "take", takes: [take] },
  };
  const actions: IAction[] = [
    speak("Hello"),
    speak("Missing", "author-speak-after"),
    speak("Missing"),
    { name: "editor-type", value: "Missing" },
    speak("Other"),
    speak("Other"),
  ];
  expect(missingSpeechTexts(actions, takes)).toEqual(["Missing", "Other"]);
});

it("records success and failure per line without stopping the batch", async () => {
  const seen: string[] = [];
  const generate = vi.fn(async (text: string) => {
    seen.push(text);
    if (text === "Bad") throw new Error("Service unavailable");
  });
  const results = await generateSpeechBatch(
    ["First", "Bad", "Third", "Fourth"],
    generate,
  );
  expect(results).toEqual([
    { text: "First", status: "success" },
    { text: "Bad", status: "failed", error: "Service unavailable" },
    { text: "Third", status: "success" },
    { text: "Fourth", status: "success" },
  ]);
  expect(generate).toHaveBeenCalledTimes(4);
  expect(seen.sort()).toEqual(["Bad", "First", "Fourth", "Third"]);
  expect(speechBatchFailures(results)).toHaveLength(1);
});

it("keeps results in input order even when later lines finish first", async () => {
  const releases = new Map<string, () => void>();
  const generate = (text: string) =>
    new Promise<void>((resolve) => releases.set(text, resolve));
  const request = generateSpeechBatch(["A", "B", "C"], generate);
  expect([...releases.keys()].sort()).toEqual(["A", "B"]);

  releases.get("B")?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(releases.has("C")).toBe(true);

  releases.get("C")?.();
  releases.get("A")?.();
  const results = await request;
  expect(results.map((result) => result.text)).toEqual(["A", "B", "C"]);
  expect(results.every((result) => result.status === "success")).toBe(true);
});

it("runs at most two speech requests at once", async () => {
  let active = 0;
  let peak = 0;
  const generate = (text: string) =>
    new Promise<void>((resolve, reject) => {
      active++;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active--;
        if (text === "Bad") reject(new Error("Bad line"));
        else resolve();
      }, 0);
    });
  const results = await generateSpeechBatch(
    ["A", "Bad", "C", "D", "E"],
    generate,
    { concurrency: 2 },
  );
  expect(peak).toBe(2);
  expect(results.map((result) => result.status)).toEqual([
    "success",
    "failed",
    "success",
    "success",
    "success",
  ]);
});

it("requests duplicated text only once", async () => {
  const actions: IAction[] = [speak("Repeat"), speak("Repeat")];
  const generate = vi.fn(async () => {});
  const texts = missingSpeechTexts(actions, {});
  expect(texts).toEqual(["Repeat"]);
  const results = await generateSpeechBatch(texts, generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(results).toEqual([{ text: "Repeat", status: "success" }]);

  const direct = await generateSpeechBatch(["Repeat", "Repeat"], generate);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(direct).toEqual([{ text: "Repeat", status: "success" }]);
});

it("coalesces concurrent requests for one text and allows a retry after failure", async () => {
  const run = createSingleFlight<void>();
  const calls: string[] = [];
  let release: () => void = () => {};
  const first = run("Same", () => {
    calls.push("first");
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const second = run("Same", async () => {
    calls.push("second");
  });
  expect(calls).toEqual(["first"]);
  release();
  await Promise.all([first, second]);
  expect(calls).toEqual(["first"]);

  await expect(
    run("Same", async () => {
      calls.push("fail");
      throw new Error("Temporary failure");
    }),
  ).rejects.toThrow("Temporary failure");
  await run("Same", async () => {
    calls.push("retry");
  });
  expect(calls).toEqual(["first", "fail", "retry"]);
});

it("leaves a failed line missing so the next batch can retry it", async () => {
  const actions: IAction[] = [speak("Retry me")];
  let takes: Record<string, SpeechLine> = Object.create(null);
  expect(missingSpeechTexts(actions, takes)).toEqual(["Retry me"]);

  const failed = await generateSpeechBatch(["Retry me"], async () => {
    throw new Error("Temporary failure");
  });
  expect(failed).toEqual([
    { text: "Retry me", status: "failed", error: "Temporary failure" },
  ]);
  expect(missingSpeechTexts(actions, takes)).toEqual(["Retry me"]);

  const retried = await generateSpeechBatch(["Retry me"], async (text) => {
    takes = reducer(
      { ...initialSpeechState, takesByText: takes },
      addSpeechTake({
        text,
        take: {
          ...take,
          assetId: "retry-take",
          created: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).takesByText;
  });
  expect(retried).toEqual([{ text: "Retry me", status: "success" }]);
  expect(missingSpeechTexts(actions, takes)).toEqual([]);
});

it("skips invalid text without requesting it and counts it as a failure", async () => {
  const empty = "   ";
  const long = "x".repeat(1001);
  const generate = vi.fn(async () => {});
  expect(speechTextError(empty)).toBe(SPEECH_TEXT_ERROR);
  expect(speechTextError(long)).toBe(SPEECH_TEXT_ERROR);
  expect(speechTextError("Hello")).toBeNull();

  const results = await generateSpeechBatch([empty, "Hello", long], generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate).toHaveBeenCalledWith("Hello");
  expect(results).toEqual([
    { text: empty, status: "skipped", error: SPEECH_TEXT_ERROR },
    { text: "Hello", status: "success" },
    { text: long, status: "skipped", error: SPEECH_TEXT_ERROR },
  ]);
  expect(speechBatchFailures(results)).toHaveLength(2);

  const error = new SpeechBatchError(results);
  expect(error.message).toBe(
    `2 speech lines could not be generated. ${SPEECH_TEXT_ERROR}`,
  );
  expect(error.results).toEqual(results);
  expect(error.failures).toHaveLength(2);

  const summary = speechBatchSummary(results);
  expect(summary).toContain("2 of 3 speech lines failed");
  expect(summary).toContain("(empty line)");
  expect(summary).toContain("skipped");
});

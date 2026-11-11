import type { IAction } from "@fullstackcraftllc/codevideo-types";
import type { SpeechBatchResult, SpeechLine } from "../../store/speechSlice";
import { activeTake } from "./speechAudio";

export const MAX_SPEECH_TEXT_LENGTH = 1000;
export const SPEECH_TEXT_ERROR = "Speech needs 1–1000 characters.";

/** Returns an error message when the text cannot be sent to text-to-speech. */
export function speechTextError(text: string): string | null {
  return !text.trim() || text.length > MAX_SPEECH_TEXT_LENGTH
    ? SPEECH_TEXT_ERROR
    : null;
}

/**
 * Collects the unique speech lines that still have no active take. Lines that
 * already have audio, and actions that are not speech actions, are ignored.
 */
export function missingSpeechTexts(
  actions: IAction[],
  takesByText: Record<string, SpeechLine>,
): string[] {
  return [
    ...new Set(
      actions
        .filter((action) => action.name.startsWith("author-speak-"))
        .map((action) => action.value),
    ),
  ].filter((text) => !activeTake(text, takesByText));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Speech generation failed.";
}

/**
 * Coalesces concurrent work for the same key. A failed request is removed from
 * the map when it settles, so the same text can be retried afterwards.
 */
export function createSingleFlight<T = void>() {
  const inFlight = new Map<string, Promise<T>>();
  return async function run(
    key: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = task();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  };
}

export const isSpeechBatchFailure = (result: SpeechBatchResult) =>
  result.status !== "success";

export const speechBatchFailures = (results: SpeechBatchResult[]) =>
  results.filter(isSpeechBatchFailure);

const preview = (text: string) => {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "(empty line)";
  return `"${compact.length > 40 ? `${compact.slice(0, 40)}…` : compact}"`;
};

/**
 * A human-readable summary of a finished batch, naming each line that did not
 * produce audio. Used for the toast shown to the author.
 */
export function speechBatchSummary(
  results: SpeechBatchResult[],
  maxLines = 5,
): string {
  const failures = speechBatchFailures(results);
  if (!failures.length) return "";
  const shown = failures.slice(0, maxLines).map((result) => {
    const kind = result.status === "skipped" ? "skipped" : "failed";
    return `${preview(result.text)} ${kind}: ${result.error ?? "Unknown error"}`;
  });
  const extra =
    failures.length > maxLines ? ` (+${failures.length - maxLines} more)` : "";
  return `${failures.length} of ${results.length} speech lines failed. ${shown.join(" · ")}${extra}`;
}

export interface GenerateSpeechBatchOptions {
  /** Maximum number of lines in flight at once. Defaults to 2. */
  concurrency?: number;
  onResult?: (
    result: SpeechBatchResult,
    done: number,
    total: number,
  ) => void;
}

/**
 * Generates every text with bounded concurrency. One line failing never stops
 * the rest: each line is recorded in input order as success, failed (with the
 * error message), or skipped (invalid text that was never sent to the API).
 */
export async function generateSpeechBatch(
  texts: string[],
  generate: (text: string) => Promise<void>,
  { concurrency = 2, onResult }: GenerateSpeechBatchOptions = {},
): Promise<SpeechBatchResult[]> {
  const unique = [...new Set(texts)];
  const results: SpeechBatchResult[] = new Array(unique.length);
  let next = 0;
  let done = 0;
  const workerCount = Math.max(
    1,
    Math.min(Math.floor(concurrency) || 1, unique.length),
  );

  async function worker() {
    while (next < unique.length) {
      const index = next++;
      const text = unique[index]!;
      let result: SpeechBatchResult;
      const validationError = speechTextError(text);
      if (validationError) {
        result = { text, status: "skipped", error: validationError };
      } else {
        try {
          await generate(text);
          result = { text, status: "success" };
        } catch (error) {
          result = {
            text,
            status: "failed",
            error: errorMessage(error),
          };
        }
      }
      results[index] = result;
      done++;
      onResult?.(result, done, unique.length);
    }
  }

  if (unique.length) {
    await Promise.all(
      Array.from({ length: workerCount }, () => worker()),
    );
  }
  return results;
}

export class SpeechBatchError extends Error {
  readonly results: SpeechBatchResult[];
  readonly failures: SpeechBatchResult[];

  constructor(results: SpeechBatchResult[]) {
    const failures = speechBatchFailures(results);
    super(
      `${failures.length} speech lines could not be generated. ${
        failures[0]?.error ?? ""
      }`,
    );
    this.name = "SpeechBatchError";
    this.results = results;
    this.failures = failures;
  }
}

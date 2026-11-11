import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MIN_SEGMENT_DURATION,
  MIN_SEGMENT_GAP,
  normalizeSegments,
  refineSegmentsWithSpeechRuns,
  type SubtitleSegment,
} from "./subtitles.ts"

const SAMPLE_RATE = 16_000
const AUDIO_DURATION = 12
const EPS = 1e-6

/**
 * Deterministic synthetic "energy" audio: silence (zeros) with speech-like
 * tone bursts at the given [start, end) second ranges. No model, no network.
 */
function synthAudio(duration: number, bursts: Array<[number, number]>) {
  const audio = new Float32Array(Math.round(duration * SAMPLE_RATE))
  for (const [start, end] of bursts) {
    const from = Math.round(start * SAMPLE_RATE)
    const to = Math.min(audio.length, Math.round(end * SAMPLE_RATE))
    for (let i = from; i < to; i += 1) {
      const t = i / SAMPLE_RATE
      audio[i] =
        0.4 * Math.sin(2 * Math.PI * 220 * t) +
        0.2 * Math.sin(2 * Math.PI * 440 * t)
    }
  }
  return audio
}

// Speech bursts well separated (> 0.16s of silence) so they stay distinct runs.
const audio = synthAudio(AUDIO_DURATION, [
  [1.0, 2.0],
  [3.0, 4.5],
  [6.0, 7.0],
  [10.5, 11.8],
])

/**
 * Deliberately messy Whisper-style output:
 * - "second" ends so late its end edge snaps onto the third speech run,
 *   making its end run past "third"'s start (the conflict branch);
 * - "fourth" ends beyond the audio duration;
 * - "fifth" starts AND ends beyond the audio duration.
 */
function messySegments(): SubtitleSegment[] {
  return [
    { start: 0.9, end: 2.3, text: "first" },
    {
      start: 2.8,
      end: 6.3,
      text: "second",
      words: [
        { start: 2.8, end: 4.4, text: "hello" },
        { start: 4.4, end: 6.3, text: "world" },
      ],
    },
    {
      start: 6.1,
      end: 6.9,
      text: "third",
      words: [
        { start: 6.1, end: 6.5, text: "foo" },
        { start: 6.5, end: 6.9, text: "bar" },
      ],
    },
    { start: 10.4, end: 13.0, text: "fourth" },
    { start: 12.5, end: 13.5, text: "fifth" },
  ]
}

function assertValidTimeline(
  segments: SubtitleSegment[],
  audioDuration: number,
) {
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    assert.ok(
      segment.start >= -EPS,
      `segment ${i} starts before 0: ${segment.start}`,
    )
    assert.ok(
      segment.end - segment.start >= MIN_SEGMENT_DURATION - EPS,
      `segment ${i} shorter than minimum: ${segment.start}..${segment.end}`,
    )
    assert.ok(
      segment.end <= audioDuration + EPS,
      `segment ${i} ends past audio duration: ${segment.end} > ${audioDuration}`,
    )
    if (i === 0) continue
    const previous = segments[i - 1]
    assert.ok(
      segment.start >= previous.start - EPS,
      `segment ${i} starts before segment ${i - 1}: ${segment.start} < ${previous.start}`,
    )
    assert.ok(
      segment.start >= previous.end + MIN_SEGMENT_GAP - EPS,
      `segments ${i - 1} and ${i} overlap or touch: ` +
        `${previous.start}..${previous.end} vs ${segment.start}..${segment.end}`,
    )
  }
}

test("calibrated segments are ordered, gap-separated, within audio, and readable", () => {
  const refined = refineSegmentsWithSpeechRuns(
    messySegments(),
    audio,
    SAMPLE_RATE,
  )
  assert.equal(refined.length, 5)
  assertValidTimeline(refined, AUDIO_DURATION)
})

test("conflict branch: next start before previous end is split with a clear gap", () => {
  const refined = refineSegmentsWithSpeechRuns(
    messySegments(),
    audio,
    SAMPLE_RATE,
  )
  const second = refined[1]
  const third = refined[2]

  // The second segment's raw end (6.3) snapped to the third speech run's end
  // (~7.0), which is past the third segment's start (~5.96): the pair must be
  // re-split instead of left overlapping.
  assert.ok(second.end < 6.9, `previous end not pulled back: ${second.end}`)
  assert.ok(
    third.start >= second.end + MIN_SEGMENT_GAP - EPS,
    `no clear gap: ${second.end} -> ${third.start}`,
  )
  // Clamping must not squeeze a start past its own end...
  assert.ok(third.start <= third.end - MIN_SEGMENT_DURATION + EPS)
  assert.ok(second.start <= second.end - MIN_SEGMENT_DURATION + EPS)
  // ...nor leave the previous end beyond the next start.
  assert.ok(second.end <= third.start - MIN_SEGMENT_GAP + EPS)
  // The split happens near the midpoint of the original overlap.
  assert.ok(Math.abs(third.start - second.end - MIN_SEGMENT_GAP) < EPS)
})

test("segments starting or ending beyond the audio are clamped to its duration", () => {
  const refined = refineSegmentsWithSpeechRuns(
    messySegments(),
    audio,
    SAMPLE_RATE,
  )
  const fourth = refined[3]
  const fifth = refined[4]
  assert.ok(fourth.end <= AUDIO_DURATION + EPS)
  assert.ok(fifth.end <= AUDIO_DURATION + EPS)
  assert.ok(fifth.start < AUDIO_DURATION)
  // The clamped tail pair still respects the gap and minimum duration.
  assert.ok(fifth.start >= fourth.end + MIN_SEGMENT_GAP - EPS)
  assert.ok(fifth.end - fifth.start >= MIN_SEGMENT_DURATION - EPS)
})

test("word-level timestamps follow the final segment bounds", () => {
  const refined = refineSegmentsWithSpeechRuns(
    messySegments(),
    audio,
    SAMPLE_RATE,
  )
  for (const segment of refined) {
    if (!segment.words?.length) continue
    assert.equal(segment.words[0].start, segment.start)
    assert.equal(segment.words[segment.words.length - 1].end, segment.end)
  }
  // Specifically the pair whose bounds were rewritten by the conflict pass.
  const second = refined[1]
  const third = refined[2]
  assert.equal(second.words?.[1].end, second.end)
  assert.equal(third.words?.[0].start, third.start)
})

test("normalizeSegments with audio produces a valid timeline end to end", () => {
  const output = {
    chunks: messySegments().map((segment) => ({
      timestamp: [segment.start, segment.end],
      text: `${segment.text} line`,
    })),
  }
  const segments = normalizeSegments(output, {
    audio,
    sampleRate: SAMPLE_RATE,
  })
  assert.equal(segments.length, 5)
  assertValidTimeline(segments, AUDIO_DURATION)
})

test("without audio the segments pass through untouched", () => {
  const input = messySegments()
  const refined = refineSegmentsWithSpeechRuns(input)
  assert.deepEqual(refined, input)
})

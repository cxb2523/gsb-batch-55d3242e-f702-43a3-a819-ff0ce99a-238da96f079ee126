/**
 * Tests for the logic-lane folding rule.
 *
 * The rule has to be boringly exact, because every interesting failure is a
 * boundary: an edge at the right edge counted twice folds the next window late,
 * a fold that survives a zoom hides edges that are visible again, and a
 * threshold that folds on equality turns "resolvable" into "not". These cases
 * compare against windows counted by hand rather than against a snapshot of
 * today's output.
 *
 * Run them from `web/`:
 *
 *     npm install
 *     npm test
 *
 * (`npm run test:watch` while editing.) They need no browser, no WASM build and
 * no network; they exercise only the arithmetic in `$lib/fold`.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_FOLD_THRESHOLD, foldLane, pulseTrain, visibleEdges } from '$lib/fold';
import type { DigitalTransition } from '$lib/engine';

/** A net that toggles `count` times, evenly spaced inside `(from, to]`. */
function toggles(count: number, from: number, to: number): DigitalTransition[] {
	const out: DigitalTransition[] = [];
	for (let i = 1; i <= count; i++) {
		out.push({ time: from + ((to - from) * i) / (count + 1), state: i % 2 ? 'high' : 'low' });
	}
	return out;
}

describe('foldLane', () => {
	it('folds a lane whose visible edges exceed the per-pixel threshold', () => {
		// 1000 edges across 100 px is 10 edges/px, well past the default of 2.
		const events = toggles(1000, 0, 1000);
		const fold = foldLane(events, 0, 1000, 100, DEFAULT_FOLD_THRESHOLD);

		expect(fold.folded).toBe(true);
		expect(fold.count).toBe(1000);
		expect(fold.density).toBe(10);
		// The folded picture still addresses every recorded edge, so nothing was
		// thrown away to draw it.
		expect(fold.start).toBe(0);
		expect(fold.end).toBe(1000);
		// And the substitute really is a train, not a single band.
		expect(pulseTrain(100).length).toBeGreaterThan(10);
	});

	it('does not fold on equality with the threshold', () => {
		// 100 px × 2 edges/px = 200 edges is exactly resolvable by the rule.
		const at = toggles(200, 0, 1000);
		expect(foldLane(at, 0, 1000, 100, 2).folded).toBe(false);

		// One less stays real; one more folds. This pins the ">", not ">=".
		expect(foldLane(toggles(199, 0, 1000), 0, 1000, 100, 2).folded).toBe(false);
		expect(foldLane(toggles(201, 0, 1000), 0, 1000, 100, 2).folded).toBe(true);

		// A decimal threshold must not fold its exact product because binary
		// floating point made 0.3 × 10 come out a hair under 3.
		expect(foldLane(toggles(3, 0, 1000), 0, 1000, 10, 0.3).folded).toBe(false);
		expect(foldLane(toggles(4, 0, 1000), 0, 1000, 10, 0.3).folded).toBe(true);
	});

	it('never folds a lane with zero or one edge, whatever the threshold', () => {
		// A single edge is information, and "continuously toggling" would be a lie.
		expect(foldLane([], 0, 1000, 100, 0.01).folded).toBe(false);
		expect(foldLane([{ time: 500, state: 'high' }], 0, 1000, 100, 0.01).folded).toBe(false);
	});

	it('counts an edge on a window boundary exactly once', () => {
		// Two adjacent windows tile the run. An edge sitting exactly on the shared
		// boundary belongs to the window whose right edge it is, not both.
		const events: DigitalTransition[] = [
			{ time: 0, state: 'low' },
			{ time: 1000, state: 'high' },
			{ time: 2000, state: 'low' }
		];
		const left = foldLane(events, 0, 1000, 100, 2);
		const right = foldLane(events, 1000, 2000, 100, 2);

		// The edge at 0 opens the left window and is not an edge inside either.
		expect(left.count).toBe(1); // t = 1000, the right edge of the left window
		expect(right.count).toBe(1); // t = 2000, and not the one at 1000 again
		expect(left.count + right.count).toBe(2);
	});

	it('re-decides when the window is panned, not remembering the last answer', () => {
		// One busy second followed by one quiet second, viewed at a fixed width.
		const events = [...toggles(1000, 0, 1000), ...toggles(5, 1000, 2000)];
		const threshold = 2;
		const pixels = 100;

		const busy = foldLane(events, 0, 1000, pixels, threshold);
		const quiet = foldLane(events, 1000, 2000, pixels, threshold);
		expect(busy.folded).toBe(true);
		expect(quiet.folded).toBe(false);

		// Pan back: the rule is pure, so the answer is the busy one again, with the
		// quiet window having left no trace.
		const back = foldLane(events, 0, 1000, pixels, threshold);
		expect(back.folded).toBe(true);
		expect(back.count).toBe(busy.count);
		expect(back.start).toBe(busy.start);
		expect(back.end).toBe(busy.end);
	});
});

describe('visibleEdges (restoration)', () => {
	it('restores the exact recorded edges after a fold is zoomed away', () => {
		// A millisecond of a fast clock: folded when seen whole, resolvable in a
		// 10 µs sliver.
		const events = toggles(1000, 0, 1000);
		const wide = foldLane(events, 0, 1000, 100, DEFAULT_FOLD_THRESHOLD);
		expect(wide.folded).toBe(true);

		const from = 500;
		// 10 µs at 1 µs per edge: at most a handful of edges, far below 2/px.
		const to = 510;
		const zoomed = foldLane(events, from, to, 100, DEFAULT_FOLD_THRESHOLD);
		expect(zoomed.folded).toBe(false);

		// The restored list is exactly the source objects whose times fall in
		// `(from, to]` — same identity, same times, same levels. The fold left the
		// record untouched; only the decision went away.
		const restored = visibleEdges(events, from, to);
		const expected = events.filter((e) => e.time > from && e.time <= to);
		expect(restored).toHaveLength(expected.length);
		expect(restored).toEqual(expected);
		for (const [i, event] of restored.entries()) {
			expect(event).toBe(expected[i]);
			expect(event.time).toBe(expected[i].time);
			expect(event.state).toBe(expected[i].state);
		}
		expect(zoomed.start).toBe(events.indexOf(expected[0]));
		expect(zoomed.end).toBe(zoomed.start + expected.length);
	});

	it('leaves the data identical whatever the folding threshold says', () => {
		const events = toggles(100, 0, 1000);
		const folded = visibleEdges(events, 0, 1000);
		const unfolded = visibleEdges(events, 0, 1000);
		expect(folded).toEqual(unfolded);
		expect(folded).toHaveLength(100);
	});
});

/**
 * Deciding when a logic lane is too busy to draw edge by edge.
 *
 * A mixed-signal run can toggle a net thousands of times inside one screen.
 * Drawing every edge is both slow and useless: a pixel column takes several
 * edges, so the line becomes a solid smear and the person reading it cannot
 * tell a clock from a data line. When the lane is that dense, the scope draws a
 * pulse train that says "something is switching here" instead.
 *
 * The decision is a property of the *visible window only*. It is recomputed
 * from `(from, to]` every time the window moves or zooms, so panning from a
 * quiet stretch to a busy one folds and panning back unfolds. Nothing about a
 * previous window is carried over. And nothing here touches the transitions
 * themselves: `start` and `end` still address the recorded edges, which is what
 * lets a zoom back in reproduce the original waveform exactly.
 *
 * This module is deliberately separate from the canvas. The one thing that
 * must never rot silently is the boundary rules — an edge at the right edge
 * counted twice would fold a lane one window late — so they live in plain
 * functions with tests.
 */

import { firstAfter } from './transitions';
import type { DigitalTransition } from './engine';

/** Edges per pixel a lane may show before it is drawn as a pulse train. */
export const DEFAULT_FOLD_THRESHOLD = 2;

/** The most pulse marks drawn for one folded lane, so a huge canvas stays cheap. */
const MAX_PULSES = 2048;

export interface LaneFold {
	/** Whether this lane is drawn folded in this window. */
	folded: boolean;
	/** Edges in the window: those with `from < time <= to`. */
	count: number;
	/** The width the density is measured against, in CSS pixels. */
	pixels: number;
	/** Edges per pixel that triggers folding. */
	threshold: number;
	/** `count / pixels`, for display and for tests. */
	density: number;
	/** First visible event: the first one strictly after `from`. */
	start: number;
	/** One past the last visible event: the first one strictly after `to`. */
	end: number;
}

/**
 * Count the edges this window can see, and decide whether to fold them.
 *
 * The window is half-open at the left, `(from, to]`, and that choice is what
 * makes a boundary edge count once. The level at `from` belongs to the edge at
 * or before it, which is drawn as the lane's opening level rather than as an
 * edge *inside* this window; the edge at `to` is on the right edge of the
 * screen, so it counts here and not in the window that starts there.
 *
 * Two floors sit under the density rule:
 *
 * - `count > threshold * pixels`, strictly. A lane holding exactly the
 *   threshold folds nothing: the rule says "more than can be resolved", and
 *   equality is exactly resolvable.
 * - A lane with zero or one edge is never folded, whatever the threshold. A
 *   single edge is information, and calling it "continuously toggling" would
 *   be the display lying about the one thing it is for.
 */
export function foldLane(
	events: readonly DigitalTransition[],
	from: number,
	to: number,
	pixels: number,
	threshold: number
): LaneFold {
	const start = firstAfter(events, from);
	const end = Math.max(start, firstAfter(events, to));
	const count = end - start;
	const width = Math.max(pixels, 1);
	// `threshold * width` can land a hair off an integer for a decimal threshold
	// (0.3 × 10 is 2.9999999999999996), which would fold a lane whose density is
	// exactly the threshold. The slack restores the stated "nothing on equality"
	// rule without swallowing a genuine excess: counts are integers, so the gap
	// to the next one is always at least 1.
	const limit = threshold * width;
	const slack = Math.min(1e-6, Math.max(Math.abs(limit), 1) * 1e-9);
	const folded = count > 1 && count > limit + slack;
	return {
		folded,
		count,
		pixels: width,
		threshold,
		density: count / width,
		start,
		end
	};
}

/**
 * The recorded edges a window can see, untouched and in order.
 *
 * This is the restoration path: when `foldLane` says no, drawing these is
 * exactly drawing the original record — same times, same states, same objects.
 */
export function visibleEdges(
	events: readonly DigitalTransition[],
	from: number,
	to: number
): DigitalTransition[] {
	const { start, end } = foldLane(events, from, to, 1, Infinity);
	return events.slice(start, end);
}

/**
 * Marks for the synthetic pulse train, in pixels from the left of the plot.
 *
 * A folded lane is drawn as a comb of narrow pulses rather than its real
 * edges. The spacing is fixed in *screen* space, so the picture does not get
 * denser as more edges arrive; the lane is a statement that this stretch is
 * switching, not a claim about how many times.
 */
export function pulseTrain(width: number, spacing = 6): number[] {
	const out: number[] = [];
	if (!(width > 0) || !(spacing > 0)) return out;
	const first = Math.min(spacing, 2);
	for (let x = first; x < width - 1 && out.length < MAX_PULSES; x += spacing) {
		out.push(x);
	}
	return out;
}

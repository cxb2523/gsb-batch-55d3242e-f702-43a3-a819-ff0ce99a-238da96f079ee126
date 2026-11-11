// Text to score, without a model.
//
// The generation path this package is built for runs a language model against
// `scoreSchema()`: that is what handles "she sits down heavily, thinks for a
// moment, then looks up". This module is the other lane, and it is a real one,
// not a stub. It reads a prompt for the things a motion is actually made of
// (actions and their order, a body part, a direction, a manner, a repeat count,
// what is negated) and composes beats from the same vocabulary the model
// authors against.
//
// It exists for three reasons, in order of how often they bite:
//
//   1. Latency. A known action ("wave", "nod", "shrug") is a keystroke, not a
//      round trip, and a UI that previews as you type needs the keystroke.
//   2. Determinism. The same prompt gives the same clip forever, which is what
//      makes a motion cacheable and a regression reproducible.
//   3. Availability. When no model is reachable the feature still works, at
//      lower expressiveness, instead of returning an error to somebody who
//      typed "wave".
//
// Anything it cannot recognize it says so about, and the caller decides whether
// to fall through to the model or surface the miss.

import { EFFORTS } from './vocabulary.js';

// Hands forward and low, counterweighting a dropped centre of mass: what a body
// does with its arms the moment it drops into a crouch.
const BRACED = Object.freeze({
	left: { at: 'front', up: -0.16, out: 0.06, forward: -0.02, palm: 'down', hand: 'relaxed', elbow: 'down' },
	right: { at: 'front', up: -0.16, out: 0.06, forward: -0.02, palm: 'down', hand: 'relaxed', elbow: 'down' },
});

// Both hands resting on the thighs: the shape a body makes sitting down or
// bracing on its legs, reused by every posture that needs it.
const HANDS_ON_THIGHS = Object.freeze({
	left: { at: 'thigh', forward: 0.04, palm: 'down', hand: 'relaxed', elbow: 'down' },
	right: { at: 'thigh', forward: 0.04, palm: 'down', hand: 'relaxed', elbow: 'down' },
});

/**
 * Actions this lane can build without a model. Each is a function of the
 * parsed modifiers, returning beats.
 */
const ACTIONS = {
	wave: ({ side, repeats, effort }) => {
		const other = side === 'left' ? 'right' : 'left';
		const up = { at: 'overhead', up: -0.08, out: 0.04, palm: 'forward', hand: 'open', elbow: 'out' };
		const beats = [
			{ label: 'ready', posture: 'easy', arms: { [side]: { at: 'side', hand: 'relaxed' }, [other]: { at: 'side', hand: 'relaxed' } }, in: 0.25, effort },
			{ label: 'hand up', posture: 'easy', arms: { [side]: up }, gaze: 'forward', face: 'smile', in: 0.36, hold: 0.06, effort },
		];
		for (let i = 0; i < repeats; i++) {
			beats.push({ label: 'out', posture: 'easy', arms: { [side]: { ...up, out: 0.2, up: -0.02 } }, face: 'smile', in: 0.22, effort });
			beats.push({ label: 'back', posture: 'easy', arms: { [side]: { ...up, out: -0.04, up: -0.1 } }, face: 'smile', in: 0.22, effort });
		}
		beats.push({ label: 'lower', posture: 'easy', arms: { [side]: { at: 'side', hand: 'relaxed' } }, in: 0.5, hold: 0.2, effort });
		return beats;
	},

	nod: ({ repeats, effort }) => {
		const beats = [{ label: 'level', posture: 'easy', gaze: 'forward', in: 0.2, effort }];
		for (let i = 0; i < repeats; i++) {
			beats.push({ label: 'down', posture: 'easy', gaze: { pitch: -17 }, torso: { lean: 3 }, in: 0.22, effort });
			beats.push({ label: 'up', posture: 'easy', gaze: { pitch: 4 }, in: 0.24, effort });
		}
		beats.push({ label: 'settle', posture: 'easy', gaze: 'forward', in: 0.28, hold: 0.2, effort });
		return beats;
	},

	shake: ({ repeats, effort }) => {
		const beats = [{ label: 'level', posture: 'easy', gaze: 'forward', in: 0.2, effort }];
		for (let i = 0; i < repeats; i++) {
			beats.push({ label: 'left', posture: 'easy', gaze: { yaw: 26 }, in: 0.24, effort });
			beats.push({ label: 'right', posture: 'easy', gaze: { yaw: -26 }, in: 0.24, effort });
		}
		beats.push({ label: 'centre', posture: 'easy', gaze: 'forward', face: 'doubt', in: 0.26, hold: 0.2, effort });
		return beats;
	},

	shrug: ({ effort }) => [
		{ label: 'neutral', posture: 'easy', arms: { left: { at: 'side', hand: 'relaxed' }, right: { at: 'side', hand: 'relaxed' } }, in: 0.22, effort },
		{
			label: 'up',
			posture: 'easy',
			torso: { lean: -3 },
			gaze: { pitch: 6 },
			face: 'doubt',
			arms: {
				left: { at: 'wide', up: -0.16, forward: 0.14, palm: 'up', hand: 'open', elbow: 'down' },
				right: { at: 'wide', up: -0.16, forward: 0.14, palm: 'up', hand: 'open', elbow: 'down' },
			},
			in: 0.34,
			hold: 0.45,
			effort,
		},
		{ label: 'drop', posture: 'easy', arms: { left: { at: 'side', hand: 'relaxed' }, right: { at: 'side', hand: 'relaxed' } }, in: 0.42, hold: 0.15, effort },
	],

	point: ({ side, direction, effort }) => {
		// Pointing down means aiming an arm at the floor, not putting a wrist on
		// it: the target stays inside the arm's reach and the finger does the rest.
		const at = direction === 'up' ? 'overhead' : 'front';
		return [
			{ label: 'ready', posture: 'easy', in: 0.2, effort },
			{
				label: 'point',
				posture: direction === 'down' ? 'lean_in' : 'easy',
				arms: { [side]: { at, up: direction === 'down' ? -0.24 : 0, forward: direction === 'forward' ? 0.12 : 0.02, palm: 'down', point: direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'forward', hand: 'point', elbow: 'down' } },
				gaze: direction === 'down' ? 'down' : direction === 'up' ? 'up' : 'forward',
				in: 0.3,
				hold: 0.6,
				effort,
			},
			{ label: 'lower', posture: 'easy', arms: { [side]: { at: 'side', hand: 'relaxed' } }, in: 0.45, hold: 0.15, effort },
		];
	},

	clap: ({ repeats, effort }) => {
		const apart = {
			left: { at: 'front', out: 0.16, forward: -0.06, palm: 'in', hand: 'flat', elbow: 'down' },
			right: { at: 'front', out: 0.16, forward: -0.06, palm: 'in', hand: 'flat', elbow: 'down' },
		};
		const together = {
			left: { at: 'front', out: -0.01, forward: 0.02, palm: 'in', hand: 'flat', elbow: 'down' },
			right: { at: 'front', out: -0.01, forward: 0.02, palm: 'in', hand: 'flat', elbow: 'down' },
		};
		const beats = [{ label: 'ready', posture: 'easy', arms: apart, face: 'smile', in: 0.3, effort }];
		for (let i = 0; i < repeats; i++) {
			beats.push({ label: 'clap', posture: 'easy', arms: together, face: 'grin', in: 0.14, ease: 'in', effort });
			beats.push({ label: 'open', posture: 'easy', arms: apart, face: 'smile', in: 0.18, effort });
		}
		beats.push({ label: 'rest', posture: 'easy', arms: { left: { at: 'side', hand: 'relaxed' }, right: { at: 'side', hand: 'relaxed' } }, in: 0.45, hold: 0.15, effort });
		return beats;
	},

	bow: ({ effort }) => [
		{ label: 'stand', posture: 'proud', gaze: 'forward', in: 0.28, effort },
		{ label: 'bow', posture: 'bow', gaze: 'down', arms: { left: { at: 'side', forward: 0.05, hand: 'flat' }, right: { at: 'side', forward: 0.05, hand: 'flat' } }, in: 0.6, hold: 0.5, effort },
		{ label: 'rise', posture: 'proud', gaze: 'forward', in: 0.7, hold: 0.2, effort },
	],

	sit: ({ effort }) => [
		{ label: 'stand', posture: 'easy', in: 0.25, effort },
		{ label: 'lower', posture: 'crouch', gaze: 'down', in: 0.55, effort },
		{ label: 'seated', posture: 'sit', torso: { lean: 24 }, gaze: 'forward', arms: { left: HANDS_ON_THIGHS.left, right: HANDS_ON_THIGHS.right }, in: 0.5, hold: 0.9, effort },
	],

	stand_up: ({ effort }) => [
		{ label: 'seated', posture: 'sit', torso: { lean: 24 }, arms: { left: HANDS_ON_THIGHS.left, right: HANDS_ON_THIGHS.right }, in: 0.25, effort },
		{ label: 'lean out', posture: 'sit', torso: { lean: 26 }, gaze: 'down', in: 0.4, effort },
		{ label: 'rise', posture: 'crouch', in: 0.45, effort },
		{ label: 'stand', posture: 'easy', gaze: 'forward', in: 0.5, hold: 0.3, effort },
	],

	crouch: ({ effort }) => [
		{ label: 'stand', posture: 'easy', in: 0.25, effort },
		{ label: 'down', posture: 'crouch', gaze: 'down', arms: { left: BRACED.left, right: BRACED.right }, in: 0.55, hold: 0.7, effort },
		{ label: 'up', posture: 'easy', gaze: 'forward', in: 0.6, hold: 0.2, effort },
	],

	jump: ({ effort }) => [
		{ label: 'stand', posture: 'easy', in: 0.2, effort },
		{ label: 'load', posture: 'crouch', arms: { left: { at: 'behind', hand: 'relaxed' }, right: { at: 'behind', hand: 'relaxed' } }, in: 0.3, effort },
		{ label: 'launch', posture: 'tiptoe', root: { rise: 0.18 }, arms: { left: { at: 'overhead', hand: 'open' }, right: { at: 'overhead', hand: 'open' } }, gaze: 'up', in: 0.22, ease: 'in', effort },
		{ label: 'land', posture: 'crouch', in: 0.24, ease: 'out', effort },
		{ label: 'recover', posture: 'easy', in: 0.4, hold: 0.2, effort },
	],

	walk: ({ repeats, effort }) => {
		const beats = [{ label: 'stand', posture: 'easy', in: 0.25, effort }];
		let travelled = 0;
		for (let i = 0; i < Math.max(2, repeats * 2); i++) {
			const leading = i % 2 === 0 ? 'left' : 'right';
			travelled += 0.34;
			beats.push({
				label: `${leading} step`,
				posture: 'stand',
				root: { forward: travelled, height: 0.985 },
				legs: { stance: leading === 'left' ? 'split' : 'split_right' },
				torso: { twist: leading === 'left' ? -6 : 6 },
				arms: {
					left: { at: 'side', forward: leading === 'left' ? -0.12 : 0.12, hand: 'relaxed' },
					right: { at: 'side', forward: leading === 'left' ? 0.12 : -0.12, hand: 'relaxed' },
				},
				in: 0.42,
				effort,
			});
		}
		beats.push({ label: 'stop', posture: 'easy', root: { forward: travelled + 0.16 }, in: 0.4, hold: 0.25, effort });
		return beats;
	},

	turn: ({ direction, effort }) => {
		const degrees = direction === 'right' ? -90 : 90;
		return [
			{ label: 'facing', posture: 'easy', in: 0.25, effort },
			{ label: 'look', posture: 'easy', gaze: direction === 'right' ? 'right' : 'left', in: 0.3, effort },
			{ label: 'turn', posture: 'easy', root: { turn: degrees }, gaze: 'forward', in: 0.55, hold: 0.3, effort },
		];
	},

	think: ({ side, effort }) => [
		{ label: 'still', posture: 'easy', in: 0.3, effort },
		{
			label: 'hand to chin',
			posture: 'easy',
			arms: { [side]: { at: 'chin', forward: 0.02, up: -0.03, palm: 'in', hand: 'loose', elbow: 'down' } },
			gaze: 'aside',
			face: 'focused',
			torso: { lean: 4 },
			in: 0.5,
			hold: 1.1,
			effort,
		},
		{ label: 'release', posture: 'easy', arms: { [side]: { at: 'side', hand: 'relaxed' } }, gaze: 'forward', in: 0.5, hold: 0.2, effort },
	],

	celebrate: ({ effort }) => [
		{ label: 'ready', posture: 'ready', in: 0.22, effort },
		{
			label: 'arms up',
			posture: 'tiptoe',
			arms: { left: { at: 'overhead', out: 0.12, hand: 'fist' }, right: { at: 'overhead', out: 0.12, hand: 'fist' } },
			gaze: 'up',
			face: 'grin',
			torso: { lean: -8 },
			in: 0.26,
			hold: 0.55,
			effort,
		},
		{ label: 'down', posture: 'easy', arms: { left: { at: 'side', hand: 'relaxed' }, right: { at: 'side', hand: 'relaxed' } }, face: 'smile', in: 0.5, hold: 0.2, effort },
	],

	reach: ({ side, direction, effort }) => [
		{ label: 'ready', posture: 'easy', in: 0.22, effort },
		{
			label: 'reach',
			posture: direction === 'down' ? 'crouch' : 'lean_in',
			arms: { [side]: { at: direction === 'up' ? 'overhead' : 'front', up: direction === 'down' ? -0.24 : 0, forward: direction === 'down' ? 0.02 : 0.1, palm: direction === 'down' ? 'down' : 'up', hand: 'open', elbow: 'down' } },
			gaze: direction === 'down' ? 'down' : direction === 'up' ? 'up' : 'forward',
			in: 0.5,
			hold: 0.4,
			effort,
		},
		{ label: 'return', posture: 'easy', arms: { [side]: { at: 'side', hand: 'relaxed' } }, gaze: 'forward', in: 0.5, hold: 0.15, effort },
	],

	breathe: ({ effort }) => [
		{ label: 'in', posture: 'easy', torso: { lean: -4 }, gaze: { pitch: 6 }, in: 1.1, hold: 0.35, effort },
		{ label: 'out', posture: 'slump', torso: { lean: 6 }, gaze: { pitch: -4 }, in: 1.4, hold: 0.5, effort },
		{ label: 'settle', posture: 'easy', gaze: 'forward', in: 0.9, hold: 0.4, effort },
	],

	idle: ({ effort }) => [
		{ label: 'settled', posture: 'easy', arms: { left: { at: 'side', hand: 'relaxed' }, right: { at: 'side', hand: 'relaxed' } }, in: 0.5, hold: 1.2, effort },
		{ label: 'weight shift', posture: 'easy', root: { side: 0.035 }, torso: { sideBend: -3 }, in: 1.6, hold: 1.1, effort },
		{ label: 'glance', posture: 'easy', root: { side: 0.035 }, gaze: 'aside', in: 0.8, hold: 0.7, effort },
		{ label: 'back', posture: 'easy', gaze: 'forward', in: 1.5, hold: 1.0, effort },
	],
};

/** Every action this lane can compose without a model. */
export const ACTION_NAMES = Object.freeze(Object.keys(ACTIONS).sort());

// What a prompt can call each action. Longest phrases first, so "stand up" wins
// over "stand" and "shake head" over "shake".
const SYNONYMS = Object.freeze([
	['stand up', 'stand_up'], ['get up', 'stand_up'], ['stand back up', 'stand_up'], ['rise', 'stand_up'],
	['shake head', 'shake'], ['say no', 'shake'], ['disagree', 'shake'], ['refuse', 'shake'],
	['nod', 'nod'], ['agree', 'nod'], ['say yes', 'nod'],
	['wave', 'wave'], ['greet', 'wave'], ['say hi', 'wave'], ['say hello', 'wave'], ['hello', 'wave'], ['goodbye', 'wave'], ['bye', 'wave'],
	['shrug', 'shrug'], ['dunno', 'shrug'], ["don't know", 'shrug'], ['no idea', 'shrug'],
	['applaud', 'clap'], ['clap', 'clap'],
	['point', 'point'], ['indicate', 'point'], ['gesture at', 'point'],
	['take a bow', 'bow'], ['bow', 'bow'],
	['sit down', 'sit'], ['sit', 'sit'], ['take a seat', 'sit'],
	['crouch', 'crouch'], ['duck', 'crouch'], ['squat', 'crouch'], ['kneel down', 'crouch'],
	['jump', 'jump'], ['leap', 'jump'], ['hop', 'jump'],
	['walk', 'walk'], ['step forward', 'walk'], ['stroll', 'walk'], ['pace', 'walk'],
	['turn around', 'turn'], ['turn', 'turn'], ['spin', 'turn'],
	['think', 'think'], ['ponder', 'think'], ['consider', 'think'], ['wonder', 'think'],
	['celebrate', 'celebrate'], ['cheer', 'celebrate'], ['victory', 'celebrate'], ['win', 'celebrate'],
	['reach', 'reach'], ['grab', 'reach'], ['pick up', 'reach'], ['take', 'reach'],
	['breathe', 'breathe'], ['sigh', 'breathe'], ['catch breath', 'breathe'],
	['idle', 'idle'], ['stand still', 'idle'], ['wait', 'idle'], ['do nothing', 'idle'],
]);

// Manner words, mapped to the effort presets they mean.
const MANNERS = Object.freeze([
	['excited', 'playful'], ['excitedly', 'playful'], ['playful', 'playful'], ['cheerful', 'playful'],
	['gently', 'gentle'], ['gentle', 'gentle'], ['softly', 'gentle'], ['slowly', 'sustained'], ['slow', 'sustained'],
	['calmly', 'sustained'], ['calm', 'sustained'], ['relaxed', 'sustained'],
	['sharply', 'sharp'], ['sharp', 'sharp'], ['quickly', 'sharp'], ['quick', 'sharp'], ['fast', 'sharp'], ['suddenly', 'sharp'], ['snap', 'sharp'],
	['heavily', 'heavy'], ['heavy', 'heavy'], ['hard', 'heavy'], ['forcefully', 'heavy'],
	['lightly', 'light'], ['light', 'light'], ['delicately', 'light'],
	['carefully', 'precise'], ['precisely', 'precise'], ['deliberately', 'precise'], ['carefully', 'precise'],
	['urgently', 'urgent'], ['frantically', 'urgent'], ['desperately', 'urgent'],
	['wearily', 'weary'], ['tired', 'weary'], ['exhausted', 'weary'], ['sadly', 'weary'], ['reluctantly', 'weary'],
]);

const NUMBER_WORDS = Object.freeze({ once: 1, twice: 2, two: 2, three: 3, four: 4, five: 5, six: 6, several: 3, a: 1, one: 1 });

// Every way a prompt can name an action, as one searchable list. Sorting by
// phrase length first (then by the order above) makes the longest intent win:
// "shake head" beats "shake", "take a bow" beats "take".
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASES = Object.freeze(
	[...SYNONYMS, ...ACTION_NAMES.map((action) => [action.replace(/_/g, ' '), action])]
		.map(([phrase, action], order) => ({
			action,
			order,
			phrase: phrase.toLowerCase(),
			pattern: new RegExp(`\\b${escapeRegExp(phrase).replace(/\s+/g, '\\s+')}\\b`, 'i'),
		}))
		.sort((a, b) => b.phrase.length - a.phrase.length || a.order - b.order),
);

// What separates one action from the next. "and" is a sequence word too:
// "nod and wave" is two motions, not one motion called "nod and wave".
const SEQUENCE = /\s*(?:;|,|&|\band\s+then\b|\bthen\b|\bafter\s+that\b|\bfollowed\s+by\b|\bafterwards\b|\band\b|\bbut\b)\s*/gi;

// These phrases contain "and" but describe one performance, not two. Masking
// them keeps "wave over and over" a single clause with a repetition count.
const AND_IDIOMS = Object.freeze([
	/\bover\s+and\s+over\b/g,
	/\bagain\s+and\s+again\b/g,
	/\bmore\s+and\s+more\b/g,
]);

// Negation words. A negator is only read as negating an action when it appears
// before that action's phrase, so idioms that are themselves the action
// ("don't know" -> shrug, "say no" -> shake) stay positive.
const NEGATION = /\b(?:don't|dont|do\s+not|does\s+not|doesn't|doesnt|did\s+not|didn't|didnt|won't|wont|would\s+not|wouldn't|could\s+not|couldn't|should\s+not|shouldn't|can't|cant|cannot|never|not|no)\b/g;

// An explicit acting side, tied to a body part rather than a direction:
// "left hand", "with your left arm", "on your left". A bare "left" remains a
// direction, except where the old lane already read it as a side ("wave left").
const EXPLICIT_SIDE = /\b(?:with|using|on)\s+(?:your\s+|the\s+)?(left|right)\b|\b(?:your|the)\s+(left|right)\s+(?:hand|arm|side)\b|\b(left|right)\s*(?:-| )\s*(?:hand|arm|side|handed)\b/;

/**
 * Read a prompt into a score, with no model involved.
 *
 * A prompt may name more than one action, joined by "then", "and then", "after
 * that", "followed by", a comma, a semicolon, or "and". Each clause is read on
 * its own, so its side, direction, manner and repetition count belong to that
 * action and not to the sentence as a whole. Actions run in the order they were
 * written; body travel is carried from one to the next so a sequence walks,
 * turns, and gestures in one continuous world instead of restarting at the
 * origin.
 *
 * A negated action ("don't clap", "do not nod") is not performed. If every
 * recognized action is negated, the result is a miss so the caller can escalate
 * to a model; if some actions are positive, only those are performed.
 *
 * @param {string} prompt
 * @param {{ name?: string, loop?: boolean, effort?: string }} [opts]
 * @returns {{ score: object|null, matched: string|null, reason: string|null }}
 *   `score` is a raw score, ready for `normalizeScore`. `matched` names the
 *   action recognized, or the actions joined with "+" when several run in
 *   sequence. `reason` explains a miss, for a caller deciding whether to
 *   escalate to a model.
 */
export function composeScore(prompt, opts = {}) {
	const original = String(prompt ?? '');
	const text = original.toLowerCase().replace(/[’‘]/g, "'").trim();
	if (!text) return { score: null, matched: null, reason: 'empty prompt' };

	const actions = [];
	const negated = [];
	for (const clause of actionClauses(text)) {
		const mention = findActionMention(clause);
		if (!mention) continue;
		if (isNegated(clause, mention.index)) {
			negated.push(mention.action);
			continue;
		}
		const manner = MANNERS.find(([word]) => new RegExp(`\\b${word}\\b`).test(clause));
		actions.push({
			action: mention.action,
			side: readSide(clause, mention.action),
			direction: readDirection(clause),
			effort: opts.effort && EFFORTS[opts.effort] ? opts.effort : (manner ? manner[1] : 'neutral'),
			repeats: readRepeats(clause),
		});
	}

	if (!actions.length) {
		if (negated.length) {
			return {
				score: null,
				matched: null,
				reason: `no known action to perform in "${original.trim()}": ${negated.join(', ')} ${negated.length === 1 ? 'is' : 'are'} negated`,
			};
		}
		return {
			score: null,
			matched: null,
			reason: `no known action in "${original.trim()}"; this lane covers ${ACTION_NAMES.join(', ')}`,
		};
	}

	// Build the actions in written order. Travel, side-step and turn accumulate
	// across the joins, so "walk then nod" nods where the walk stopped rather
	// than snapping back to the starting mark.
	const beats = [];
	let carried = { forward: 0, side: 0, rise: 0, turn: 0 };
	for (const plan of actions) {
		const actionBeats = ACTIONS[plan.action]({
			side: plan.side,
			direction: plan.direction,
			effort: plan.effort,
			repeats: plan.repeats,
		}).map((beat) => paced(beat, plan.effort));
		for (const beat of actionBeats) beats.push(carryRoot(beat, carried));
		const finalRoot = actionBeats[actionBeats.length - 1]?.root ?? {};
		carried = {
			forward: carried.forward + (finalRoot.forward ?? 0),
			side: carried.side + (finalRoot.side ?? 0),
			rise: carried.rise + (finalRoot.rise ?? 0),
			turn: carried.turn + (finalRoot.turn ?? 0),
		};
	}

	const stamp = actions
		.map((plan) => `${plan.action}:${plan.side}:${plan.direction}:${plan.effort}:${plan.repeats}`)
		.join('>');
	return {
		score: {
			version: 1,
			name: opts.name || original.trim().slice(0, 120),
			seed: `${stamp}:${opts.loop ? 'loop' : 'once'}`,
			loop: opts.loop === true,
			effort: actions[0].effort,
			beats,
		},
		matched: actions.map((plan) => plan.action).join('+'),
		reason: null,
	};
}

/** Split a prompt into action clauses, protecting idioms that contain "and". */
function splitClauses(text) {
	const holes = [];
	let masked = text;
	for (const idiom of AND_IDIOMS) {
		masked = masked.replace(idiom, (match) => {
			holes.push(match);
			return `\u0000${holes.length - 1}\u0000`;
		});
	}
	return masked
		.split(SEQUENCE)
		.map((clause) => clause.replace(/\u0000(\d+)\u0000/g, (_, index) => holes[Number(index)]))
		.map((clause) => clause.trim())
		.filter(Boolean);
}

/**
 * Clauses that each contain an action. A clause with modifiers but no action
 * ("wave twice, excitedly") belongs to the action beside it, not to a new
 * action of its own, so it is folded back into its neighbor.
 */
function actionClauses(text) {
	const groups = [];
	let pending = '';
	for (const clause of splitClauses(text)) {
		const mention = findActionMention(clause);
		if (mention) {
			groups.push(pending ? `${pending}, ${clause}` : clause);
			pending = '';
		} else if (groups.length) {
			groups[groups.length - 1] = `${groups[groups.length - 1]}, ${clause}`;
		} else {
			pending = pending ? `${pending}, ${clause}` : clause;
		}
	}
	return groups;
}

/** The first, longest action phrase in a clause. */
function findActionMention(clause) {
	let best = null;
	for (const entry of PHRASES) {
		const match = entry.pattern.exec(clause);
		if (!match) continue;
		const candidate = { action: entry.action, index: match.index, length: match[0].length };
		if (!best || candidate.index < best.index || (candidate.index === best.index && candidate.length > best.length)) {
			best = candidate;
		}
	}
	return best;
}

/** True when a negator sits before the action, not inside an idiom that names it. */
function isNegated(clause, actionIndex) {
	for (const match of clause.matchAll(NEGATION)) {
		if (match.index < actionIndex) return true;
	}
	return false;
}

function readSide(clause, action) {
	const explicit = EXPLICIT_SIDE.exec(clause);
	if (explicit) return explicit[1] ?? explicit[2] ?? explicit[3];
	// "turn left" names a heading, not the arm doing the turn.
	if (action !== 'turn' && /\bleft\b/.test(clause)) return 'left';
	return 'right';
}

function readDirection(clause) {
	if (/\b(down|downward|floor|ground)\b/.test(clause)) return 'down';
	if (/\b(up|upward|sky|ceiling)\b/.test(clause)) return 'up';
	if (/\bleft\b/.test(clause)) return 'left';
	if (/\bright\b/.test(clause)) return 'right';
	return 'forward';
}

/** Carry accumulated body travel into a beat that was authored from the origin. */
function carryRoot(beat, carried) {
	const keys = ['forward', 'side', 'rise', 'turn'];
	if (keys.every((key) => carried[key] === 0)) return beat;
	const root = { ...(beat.root ?? {}) };
	for (const key of keys) {
		if (root[key] != null || carried[key] !== 0) root[key] = (root[key] ?? 0) + carried[key];
	}
	return { ...beat, root };
}

/**
 * Scale a beat's authored timing by how sudden the effort is. The shapes an
 * action makes are the same whether it is performed sharply or wearily; what
 * changes is how long the body takes to get between them, and an action that
 * ignored that would read as the same motion at the same speed every time.
 */
function paced(beat, effort) {
	const factor = 1.45 - 0.9 * (EFFORTS[effort] ?? EFFORTS.neutral).time;
	const out = { ...beat };
	if (typeof out.in === 'number') out.in = round(out.in * factor);
	if (typeof out.hold === 'number') out.hold = round(out.hold * factor);
	return out;
}

const round = (n) => Math.round(n * 1000) / 1000;

function readRepeats(text) {
	const digits = text.match(/\b(\d{1,2})\s*(times|x)\b/);
	if (digits) return Math.min(6, Math.max(1, Number(digits[1])));
	for (const [word, value] of Object.entries(NUMBER_WORDS)) {
		if (new RegExp(`\\b${word}\\s+times\\b`).test(text)) return Math.min(6, value);
	}
	if (/\btwice\b/.test(text)) return 2;
	if (/\brepeatedly\b|\bover and over\b|\bseveral\b/.test(text)) return 3;
	return 2;
}

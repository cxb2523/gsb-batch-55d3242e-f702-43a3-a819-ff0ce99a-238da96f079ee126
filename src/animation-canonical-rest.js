// animation-canonical-rest: reference rest data for the canonical skeleton.
// ==========================================================================
// The canonical rig rests in a T-pose; every correction the retargeter
// applies is computed against these quaternions. Local and world rest are
// identical here because the canonical hierarchy carries no accumulated
// rotation. Values are `[x, y, z, w]` quaternion tuples.

import { CANONICAL_BONES } from './glb-canonicalize.js';

const IDENTITY_QUAT = [0, 0, 0, 1];

export const CANONICAL_REST = Object.freeze(
	Object.fromEntries(CANONICAL_BONES.map((bone) => [bone, Object.freeze([...IDENTITY_QUAT])])),
);

export const CANONICAL_REST_WORLD = Object.freeze(
	Object.fromEntries(CANONICAL_BONES.map((bone) => [bone, Object.freeze([...IDENTITY_QUAT])])),
);

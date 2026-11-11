// glb-canonicalize: bone-name canonicalization.
// =============================================
// Maps any humanoid rig's bone names (Mixamo, Avaturn/Wolf3D, VRM 0.x/VRoid,
// VRM 1.0, Daz/Genesis, MakeHuman, Unreal mannequin, HumanIK/Maya, Blender
// `.L`/`.R`, bare `shoulderL`-style names, and casing/separator variants of
// all of them) onto one frozen canonical skeleton — either on a parsed glTF
// JSON tree or byte-exactly inside a GLB ArrayBuffer.

// The humanoid-coverage gate: a rig whose canonical bone hits cover less than
// this fraction of CANONICAL_BONES is not a humanoid and must not be
// half-animated. Re-exported through animation-retarget for the public surface.
export const MIN_COVERAGE = 0.5;

const CENTER_STEMS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
const SIDED_STEMS = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'];
const SIDES = ['Left', 'Right'];
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

// The frozen 52-bone canonical humanoid set: 6 center bones, 8 sided stems
// per side, and 5 fingers × 3 joints per hand.
export const CANONICAL_BONES = Object.freeze([
	...CENTER_STEMS,
	...SIDED_STEMS.flatMap((stem) => SIDES.map((side) => `${side}${stem}`)),
	...SIDES.flatMap((side) =>
		FINGERS.flatMap((finger) => [1, 2, 3].map((n) => `${side}Hand${finger}${n}`))),
]);

const CANONICAL_SET = new Set(CANONICAL_BONES);
const CENTER_SET = new Set(CENTER_STEMS);

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const CANONICAL_LOOKUP = new Map(CANONICAL_BONES.map((b) => [normalize(b), b]));

// Normalized stem → canonical stem, for every rig convention we understand.
const STEM_ALIASES = new Map(Object.entries({
	// center
	hip: 'Hips', hips: 'Hips', pelvis: 'Hips',
	spine: 'Spine', spine01: 'Spine', abdomen: 'Spine', abdomenlower: 'Spine', waist: 'Spine', torso: 'Spine',
	spine1: 'Spine1', spine02: 'Spine1', chest: 'Spine1', abdomenupper: 'Spine1', chestlower: 'Spine1',
	spine2: 'Spine2', spine03: 'Spine2', upperchest: 'Spine2', chestupper: 'Spine2',
	neck: 'Neck', neck01: 'Neck', necklower: 'Neck', neckupper: 'Neck',
	head: 'Head',
	// sided
	shoulder: 'Shoulder', clavicle: 'Shoulder', collar: 'Shoulder', collarbone: 'Shoulder',
	arm: 'Arm', upperarm: 'Arm', upperarm01: 'Arm', shldrbend: 'Arm', shoulderbend: 'Arm',
	forearm: 'ForeArm', lowerarm: 'ForeArm', lowerarm01: 'ForeArm', forearmbend: 'ForeArm', elbow: 'ForeArm',
	hand: 'Hand', wrist: 'Hand',
	upleg: 'UpLeg', upperleg: 'UpLeg', thigh: 'UpLeg', thighbend: 'UpLeg', thigh01: 'UpLeg', upperleg01: 'UpLeg',
	leg: 'Leg', lowerleg: 'Leg', calf: 'Leg', shin: 'Leg', knee: 'Leg', shin01: 'Leg', lowerleg01: 'Leg',
	foot: 'Foot', ankle: 'Foot',
	toebase: 'ToeBase', toes: 'ToeBase', toe: 'ToeBase', toe01: 'ToeBase', ball: 'ToeBase',
}));

const FINGER_NAMES = {
	thumb: 'Thumb', index: 'Index', middle: 'Middle', mid: 'Middle',
	ring: 'Ring', pinky: 'Pinky', little: 'Pinky',
};
const FINGER_SEGMENT = { proximal: 1, intermediate: 2, distal: 3 };

// One bone name → canonical name. Returns the input unchanged when nothing
// recognizes it (passthrough), so callers can tell "kept as-is" apart from
// "mapped onto the canonical skeleton".
export function canonicalizeBoneName(raw) {
	if (typeof raw !== 'string' || raw.length === 0) return raw;
	const direct = CANONICAL_LOOKUP.get(normalize(raw));
	if (direct) return direct;

	let name = raw.trim();
	let m;

	// Mixamo namespace: "mixamorig:LeftArm", "mixamorigLeftArm".
	name = name.replace(/^mixamorig:?/i, '');

	// VRM 0.x / VRoid: "J_Bip_(L|R|C)_<part>". J_Sec_*/J_Aux_* are physics
	// springs, not skeleton — never touch them.
	let side = null;
	if ((m = /^J_Bip_([LRC])_(.+)$/i.exec(name))) {
		const s = m[1].toUpperCase();
		side = s === 'L' ? 'Left' : s === 'R' ? 'Right' : null;
		name = m[2];
	} else if (/^J_(Sec|Aux)_/i.test(name)) {
		return raw;
	}

	// Side suffixes: Blender "UpperArm.L", Unreal "upperarm_l", "hand-r".
	if (!side && (m = /^(.+?)[._\-\s]([LlRr])$/.exec(name))) {
		side = m[2].toUpperCase() === 'L' ? 'Left' : 'Right';
		name = m[1];
	}
	// Side prefixes: "LeftArm", "left_shoulder", "right-hand".
	if (!side && (m = /^(left|right)[._\-\s]?(.+)$/i.exec(name))) {
		side = m[1][0].toUpperCase() === 'L' ? 'Left' : 'Right';
		name = m[2];
	}
	// Daz/Genesis: "lShldrBend", "rHand".
	if (!side && (m = /^([lLrR])([A-Z].+)$/.exec(name))) {
		side = m[1].toUpperCase() === 'L' ? 'Left' : 'Right';
		name = m[2];
	}
	// Trailing camel-case side: "shoulderL", "handR".
	if (!side && (m = /^(.*[a-z])([LR])$/.exec(name))) {
		side = m[2] === 'L' ? 'Left' : 'Right';
		name = m[1];
	}

	// A prefix-stripped name may already be canonical ("mixamorig:LeftArm").
	const withSide = CANONICAL_LOOKUP.get(normalize(side ? `${side}${name}` : name));
	if (withSide) return withSide;
	const bare = CANONICAL_LOOKUP.get(normalize(name));
	if (bare) return bare;

	const normStem = normalize(name);

	// Fingers: "thumb1", "index_02_l" (stem), "little3", VRM 1.0 "ThumbProximal".
	const finger = /^(thumb|index|middle|mid|ring|pinky|little)0?([123])$/.exec(normStem)
		?? /^(thumb|index|middle|mid|ring|pinky|little)(proximal|intermediate|distal)$/.exec(normStem);
	if (finger && side) {
		const n = finger[2].length > 1 ? FINGER_SEGMENT[finger[2]] : Number(finger[2]);
		return `${side}Hand${FINGER_NAMES[finger[1]]}${n}`;
	}

	const stem = STEM_ALIASES.get(normStem);
	if (!stem) return raw;
	if (CENTER_SET.has(stem)) return stem;
	if (!side) return raw; // a side-less limb stem ("arm") can't be placed
	return `${side}${stem}`;
}

// Rename joints across a parsed glTF JSON tree, in place. Returns the stats
// canonicalizeGLBBones builds its report from: which nodes were renamed,
// which named nodes nothing recognized, and which canonical bones the rig
// covers.
export function canonicalizeJointNodes(json) {
	const renamed = [];
	const unrecognized = [];
	const canonicalHits = new Set();
	let totalNodes = 0;
	for (const node of json?.nodes ?? []) {
		totalNodes += 1;
		if (!node || typeof node.name !== 'string' || node.name.length === 0) continue;
		const canonical = canonicalizeBoneName(node.name);
		if (CANONICAL_SET.has(canonical)) {
			canonicalHits.add(canonical);
			if (canonical !== node.name) {
				renamed.push({ from: node.name, to: canonical });
				node.name = canonical;
			}
		} else {
			unrecognized.push(node.name);
		}
	}
	return { json, totalNodes, renamed, unrecognized, canonicalHits };
}

// Normalize armature up-axis quirks. Conservative by design: it tags
// single-purpose "Armature" wrapper nodes (no mesh, no skin) so downstream
// steps can recognize the rig root, and never rewrites transforms — a wrong
// guess here would corrupt every vertex that skins through the armature.
export function canonicalizeArmatureOrientation(json) {
	for (const node of json?.nodes ?? []) {
		if (!node || typeof node.name !== 'string') continue;
		if (/^armature$/i.test(node.name) && node.mesh === undefined && node.skin === undefined) {
			node.extras = { ...node.extras, canonicalArmature: true };
		}
	}
	return json;
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function toArrayBuffer(input) {
	if (input instanceof ArrayBuffer) return input;
	if (ArrayBuffer.isView(input)) {
		return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
	}
	throw new TypeError(
		`canonicalizeGLBBones: expected an ArrayBuffer or typed-array view, got ${input === null ? 'null' : typeof input}`,
	);
}

// The whole canonicalization pipeline on a GLB binary.
//
// Returns `{ buffer, report }`. `buffer` is byte-identical to the input when
// no node needed renaming; otherwise it is a rebuilt GLB whose non-JSON
// chunks (vertices, animations, …) are copied through untouched. `report`
// describes what happened: total node count, how many were renamed, which
// names nothing recognized, and whether the rig clears the MIN_COVERAGE
// humanoid gate (canonical bone hits / CANONICAL_BONES). Below the gate the
// report says so via `isHumanoid: false` — it never throws for that, and the
// buffer is still returned.
export function canonicalizeGLBBones(input) {
	const buffer = toArrayBuffer(input);
	if (buffer.byteLength === 0) {
		throw new Error('canonicalizeGLBBones: empty input — not a GLB file');
	}
	if (buffer.byteLength < 12) {
		throw new Error(
			`canonicalizeGLBBones: buffer too small for a GLB header (${buffer.byteLength} bytes, need 12)`,
		);
	}
	const view = new DataView(buffer);
	const magic = view.getUint32(0, true);
	if (magic !== GLB_MAGIC) {
		throw new Error(
			`canonicalizeGLBBones: bad magic 0x${magic.toString(16).padStart(8, '0')} — not a GLB file`,
		);
	}
	const version = view.getUint32(4, true);
	const declaredLength = view.getUint32(8, true);
	if (declaredLength > buffer.byteLength) {
		throw new Error(
			`canonicalizeGLBBones: GLB header declares ${declaredLength} bytes but the buffer holds ${buffer.byteLength} — truncated file`,
		);
	}
	if (declaredLength < 20) {
		throw new Error('canonicalizeGLBBones: GLB contains no chunks — expected a JSON chunk');
	}
	const jsonLength = view.getUint32(12, true);
	const jsonType = view.getUint32(16, true);
	if (jsonType !== CHUNK_JSON) {
		throw new Error(
			`canonicalizeGLBBones: first GLB chunk is 0x${jsonType.toString(16).padStart(8, '0')}, expected the JSON chunk`,
		);
	}
	if (20 + jsonLength > declaredLength) {
		throw new Error(
			`canonicalizeGLBBones: JSON chunk truncated — declares ${jsonLength} bytes but only ${declaredLength - 20} remain`,
		);
	}
	let json;
	try {
		json = JSON.parse(textDecoder.decode(new Uint8Array(buffer, 20, jsonLength)));
	} catch (err) {
		throw new Error(`canonicalizeGLBBones: unparseable glTF JSON chunk — ${err.message}`);
	}

	const stats = canonicalizeJointNodes(json);
	const canonicalHits = stats.canonicalHits.size;
	const coverage = canonicalHits / CANONICAL_BONES.length;
	const report = {
		totalNodes: stats.totalNodes,
		renamedCount: stats.renamed.length,
		renamed: stats.renamed,
		unrecognizedNames: stats.unrecognized,
		canonicalHits,
		canonicalBoneCount: CANONICAL_BONES.length,
		coverage,
		minCoverage: MIN_COVERAGE,
		isHumanoid: coverage >= MIN_COVERAGE,
	};

	// Nothing to change: hand the input back untouched, byte for byte.
	if (stats.renamed.length === 0) return { buffer, report };

	// Rebuild: fresh JSON chunk (padded with spaces to 4 bytes), every other
	// chunk copied verbatim.
	const jsonBytes = textEncoder.encode(JSON.stringify(json));
	const paddedJson = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4));
	paddedJson.set(jsonBytes);
	paddedJson.fill(0x20, jsonBytes.length);
	const rest = new Uint8Array(buffer, 20 + jsonLength, declaredLength - (20 + jsonLength));

	const out = new ArrayBuffer(12 + 8 + paddedJson.length + rest.length);
	const outView = new DataView(out);
	const outBytes = new Uint8Array(out);
	outView.setUint32(0, GLB_MAGIC, true);
	outView.setUint32(4, version, true);
	outView.setUint32(8, out.byteLength, true);
	outView.setUint32(12, paddedJson.length, true);
	outView.setUint32(16, CHUNK_JSON, true);
	outBytes.set(paddedJson, 20);
	outBytes.set(rest, 20 + paddedJson.length);
	return { buffer: out, report };
}

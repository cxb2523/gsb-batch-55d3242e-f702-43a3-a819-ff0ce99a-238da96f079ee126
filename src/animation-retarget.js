// animation-retarget: play canonical-space clips on any humanoid rig.
// ===================================================================
// Clips are authored against the canonical skeleton; each target rig's rest
// pose differs (A-pose vs T-pose, hip up-axis), so quaternion tracks are
// corrected per bone as q' = restTarget · restCanonical⁻¹ · q and hip
// translation is rescaled to the rig's rest hip height. Rigs below the
// MIN_COVERAGE humanoid gate come back with `clip: null` — never a
// half-puppet.

import {
	AnimationClip,
	Quaternion,
	QuaternionKeyframeTrack,
	Vector3,
	VectorKeyframeTrack,
} from 'three';
import { CANONICAL_BONES, MIN_COVERAGE, canonicalizeBoneName } from './glb-canonicalize.js';
import { CANONICAL_REST } from './animation-canonical-rest.js';

export { MIN_COVERAGE } from './glb-canonicalize.js';

const CANONICAL_SET = new Set(CANONICAL_BONES);
const IDENTITY_QUAT = new Quaternion();

function canonicalOf(name) {
	if (typeof name !== 'string' || name.length === 0) return null;
	if (CANONICAL_SET.has(name)) return name;
	const mapped = canonicalizeBoneName(name);
	return CANONICAL_SET.has(mapped) ? mapped : null;
}

// Object3D hierarchy → { canonicalBone: Object3D }.
export function canonicalNodeMapFromObject(root) {
	const map = {};
	if (!root || typeof root.traverse !== 'function') return map;
	root.traverse((node) => {
		if (!node || map[canonicalOf(node.name)]) return;
		const canonical = canonicalOf(node.name);
		if (canonical) map[canonical] = node;
	});
	return map;
}

// Rig-ish inputs (Skeleton, bone array, name→node map, Object3D) → same map.
export function canonicalNodeMapFromRig(rig) {
	if (!rig) return {};
	if (typeof rig.traverse === 'function') return canonicalNodeMapFromObject(rig);
	const nodes = Array.isArray(rig)
		? rig
		: Array.isArray(rig.bones)
			? rig.bones
			: Object.values(rig);
	const map = {};
	for (const node of nodes) {
		const canonical = node && canonicalOf(node.name);
		if (canonical && !map[canonical]) map[canonical] = node;
	}
	return map;
}

function restMapFromNodes(nodes) {
	const rest = {};
	for (const [canonical, node] of Object.entries(nodes)) {
		rest[canonical] = {
			position: node.position?.clone?.() ?? new Vector3(),
			quaternion: node.quaternion?.clone?.() ?? new Quaternion(),
			scale: node.scale?.clone?.() ?? new Vector3(1, 1, 1),
		};
	}
	return rest;
}

// { canonicalBone: { position, quaternion, scale } } at the rig's rest pose.
export function canonicalRestMapFromObject(root) {
	return restMapFromNodes(canonicalNodeMapFromObject(root));
}

export function canonicalRestMapFromRig(rig) {
	return restMapFromNodes(canonicalNodeMapFromRig(rig));
}

function worldRestMapFromNodes(root, nodes) {
	root?.updateWorldMatrix?.(true, true);
	const map = {};
	for (const [canonical, node] of Object.entries(nodes)) {
		map[canonical] = typeof node.getWorldQuaternion === 'function'
			? node.getWorldQuaternion(new Quaternion())
			: (node.quaternion?.clone?.() ?? new Quaternion());
	}
	return map;
}

// { canonicalBone: Quaternion } in world space at the rest pose.
export function canonicalWorldRestMapFromObject(root) {
	return worldRestMapFromNodes(root, canonicalNodeMapFromObject(root));
}

export function canonicalWorldRestMapFromRig(rig) {
	return worldRestMapFromNodes(rig?.parent ?? null, canonicalNodeMapFromRig(rig));
}

function resolveHips(source) {
	if (!source) return null;
	if (source.Hips) return source.Hips; // a canonical node map
	if (typeof source.traverse === 'function') return canonicalNodeMapFromObject(source).Hips ?? null;
	return null;
}

// World-space orientation of the hips' parent — the frame hip-space
// corrections are computed against.
export function hipsParentWorldQuat(hips) {
	const parent = hips?.parent;
	if (parent && typeof parent.getWorldQuaternion === 'function') {
		return parent.getWorldQuaternion(new Quaternion());
	}
	return new Quaternion();
}

// World-space rest height of the hips (root-motion scaling reference).
export function hipRestHeight(source) {
	const hips = resolveHips(source);
	if (!hips) return 0;
	if (typeof hips.getWorldPosition === 'function') return hips.getWorldPosition(new Vector3()).y;
	return hips.position?.y ?? 0;
}

// Local-space rest height of the hips.
export function hipRestLocalHeight(source) {
	const hips = resolveHips(source);
	return hips?.position?.y ?? 0;
}

// Lowest hips Y across a clip's hips position track (0 when there is none).
export function clipHipBaselineY(clip) {
	for (const track of clip?.tracks ?? []) {
		const dot = track.name.lastIndexOf('.');
		if (dot < 0 || track.name.slice(dot + 1) !== 'position') continue;
		if (canonicalOf(track.name.slice(0, dot)) !== 'Hips') continue;
		let min = Infinity;
		for (let i = 1; i < track.values.length; i += 3) min = Math.min(min, track.values[i]);
		if (min !== Infinity) return min;
	}
	return 0;
}

function splitTrackName(name) {
	const dot = name.lastIndexOf('.');
	if (dot < 0) return null;
	return { bone: name.slice(0, dot), property: name.slice(dot + 1) };
}

// Retarget a canonical-space clip onto a target described by
// `{ nodes, rest? }` (canonical bone → Object3D / rest transform). Returns
// `{ clip, coverage, matched, total, dropped, hipScale, face }`; `clip` is
// null when coverage falls below MIN_COVERAGE.
export function retargetClip(clip, target, opts = {}) {
	const nodes = target?.nodes ?? {};
	const rest = target?.rest ?? {};
	const canonicalRest = opts.canonicalRest ?? CANONICAL_REST;
	const face = opts.face ?? 1;

	const matchedBones = new Set();
	let dropped = 0;
	for (const track of clip?.tracks ?? []) {
		const parts = splitTrackName(track.name);
		const bone = parts && canonicalOf(parts.bone);
		if (bone && nodes[bone]) matchedBones.add(bone);
		else dropped += 1;
	}

	const matched = matchedBones.size;
	const total = CANONICAL_BONES.length;
	const coverage = matched / total;
	if (coverage < MIN_COVERAGE) {
		return { clip: null, coverage, matched, total, dropped, hipScale: 1, face };
	}

	const clipBaseline = clipHipBaselineY(clip);
	const targetHipY = rest.Hips?.position?.y ?? nodes.Hips?.position?.y ?? 0;
	const hipScale = opts.hipScale ?? (clipBaseline > 0 && targetHipY > 0 ? targetHipY / clipBaseline : 1);

	const tracks = [];
	for (const track of clip.tracks) {
		const parts = splitTrackName(track.name);
		const bone = parts && canonicalOf(parts.bone);
		if (!bone || !nodes[bone]) continue;
		const node = nodes[bone];
		const nodeName = node.name || node.uuid;
		if (parts.property === 'quaternion') {
			const restTarget = rest[bone]?.quaternion ?? IDENTITY_QUAT;
			const restCanonical = canonicalRest[bone] ?? [0, 0, 0, 1];
			const pre = new Quaternion().copy(restTarget)
				.multiply(new Quaternion(...restCanonical).invert());
			const values = new Float32Array(track.values.length);
			const q = new Quaternion();
			for (let i = 0; i < track.values.length; i += 4) {
				q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
				q.premultiply(pre);
				values[i] = q.x; values[i + 1] = q.y; values[i + 2] = q.z; values[i + 3] = q.w;
			}
			tracks.push(new QuaternionKeyframeTrack(`${nodeName}.quaternion`, Array.from(track.times), Array.from(values)));
		} else if (parts.property === 'position') {
			const scale = bone === 'Hips' ? hipScale : 1;
			const values = scale === 1 ? Array.from(track.values) : Array.from(track.values, (v) => v * scale);
			tracks.push(new VectorKeyframeTrack(`${nodeName}.position`, Array.from(track.times), values));
		} else {
			tracks.push(track.clone());
		}
	}

	return {
		clip: new AnimationClip(clip.name, clip.duration, tracks),
		coverage,
		matched,
		total,
		dropped,
		hipScale,
		face,
	};
}

export function retargetClipToRig(clip, rig, opts = {}) {
	return retargetClip(clip, {
		nodes: canonicalNodeMapFromRig(rig),
		rest: canonicalRestMapFromRig(rig),
	}, opts);
}

export function retargetClipToObject(clip, root, opts = {}) {
	return retargetClip(clip, {
		nodes: canonicalNodeMapFromObject(root),
		rest: canonicalRestMapFromObject(root),
	}, opts);
}

// Return a copy of the clip played `factor`× faster (times compressed).
export function scaleClipSpeed(clip, factor = 1) {
	if (!(factor > 0) || factor === 1) return clip;
	const tracks = clip.tracks.map((track) => {
		const copy = track.clone();
		for (let i = 0; i < copy.times.length; i += 1) copy.times[i] /= factor;
		return copy;
	});
	return new AnimationClip(clip.name, clip.duration / factor, tracks);
}

// AnimationClip.toJSON()-shaped data → AnimationClip.
export function parseClipJSON(json, name) {
	const clip = AnimationClip.parse(json);
	if (name) clip.name = name;
	return clip;
}

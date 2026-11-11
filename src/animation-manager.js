// animation-manager: the crossfading runtime.
// ============================================
// Owns the AnimationMixer: loads a clip library from a manifest, retargets
// each clip per-rig (refusing rigs and clips below the humanoid coverage
// gate), crossfades between states, and layers one-shot overlays over the
// base loop.

import { AnimationMixer, LoopOnce, LoopRepeat, Quaternion } from 'three';
import { CANONICAL_BONES, MIN_COVERAGE } from './glb-canonicalize.js';
import {
	canonicalNodeMapFromObject,
	parseClipJSON,
	retargetClipToObject,
} from './animation-retarget.js';

export class AnimationManager {
	constructor(opts = {}) {
		this.fetchImpl = opts.fetchImpl ?? null;
		this.root = null;
		this.mixer = null;
		this.defs = [];
		this.states = new Map();
		this.currentName = null;
	}

	attach(root) {
		this.root = root;
		this.mixer = root ? new AnimationMixer(root) : null;
		return this;
	}

	detach() {
		this.mixer?.stopAllAction();
		this.root = null;
		this.mixer = null;
		this.states.clear();
		this.currentName = null;
	}

	// True when the attached rig covers enough of the canonical skeleton to
	// animate honestly — the same MIN_COVERAGE gate as the retargeter.
	supportsCanonicalClips() {
		if (!this.root) return false;
		const hits = Object.keys(canonicalNodeMapFromObject(this.root)).length;
		return hits / CANONICAL_BONES.length >= MIN_COVERAGE;
	}

	setAnimationDefs(defs) {
		this.defs = Array.isArray(defs) ? [...defs] : [];
	}

	async loadAll() {
		if (!this.mixer || !this.root) {
			throw new Error('AnimationManager: attach(root) before loadAll()');
		}
		const fetcher = this.fetchImpl ?? globalThis.fetch;
		if (!fetcher) throw new Error('AnimationManager: no fetch implementation available');
		for (const def of this.defs) {
			const json = await (await fetcher(def.url)).json();
			const result = retargetClipToObject(parseClipJSON(json, def.name), this.root);
			if (!result.clip) continue; // below the coverage gate: refuse, never half-animate
			const action = this.mixer.clipAction(result.clip);
			action.setLoop(def.loop === false ? LoopOnce : LoopRepeat, Infinity);
			action.clampWhenFinished = def.loop === false;
			this.states.set(def.name, { action, def, result });
		}
		return this.states;
	}

	crossfadeTo(name, duration = 0.25) {
		const next = this.states.get(name);
		if (!next) return false;
		const prev = this.currentName ? this.states.get(this.currentName) : null;
		next.action.reset().fadeIn(duration).play();
		if (prev && prev !== next) prev.action.fadeOut(duration);
		this.currentName = name;
		return true;
	}

	// One-shot overlay (wave, jump) over the current base loop.
	playOverlay(name, duration = 0.2) {
		const overlay = this.states.get(name);
		if (!overlay) return false;
		overlay.action.reset().fadeIn(duration).play();
		return true;
	}

	update(dt) {
		this.mixer?.update(dt);
	}
}

// Diagnostic: the largest angle the hips' quaternion track reaches away from
// identity, in degrees — how far a retargeted clip tilts the hips.
export function measureHipsTiltDeg(clip, model, map) {
	const nodeMap = map ?? (model ? canonicalNodeMapFromObject(model) : {});
	const hipsName = nodeMap.Hips?.name ?? 'Hips';
	const track = (clip?.tracks ?? []).find((t) => {
		const dot = t.name.lastIndexOf('.');
		return dot > 0 && t.name.slice(dot + 1) === 'quaternion'
			&& (t.name.slice(0, dot) === 'Hips' || t.name.slice(0, dot) === hipsName);
	});
	if (!track) return 0;
	let max = 0;
	const q = new Quaternion();
	for (let i = 0; i + 3 < track.values.length; i += 4) {
		q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
		const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
		max = Math.max(max, (angle * 180) / Math.PI);
	}
	return max;
}

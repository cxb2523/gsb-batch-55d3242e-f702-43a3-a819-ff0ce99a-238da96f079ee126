// canonicalizeGLBBones: report + byte-safety tests.
// =================================================
// Self-contained GLB fixtures built in memory (no external assets): a fully
// recognizable Mixamo rig, a partial rig below the humanoid gate, a rig that
// needs no changes, and malformed inputs. Runs against dist/ (pretest builds).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CANONICAL_BONES,
	MIN_COVERAGE,
	canonicalizeGLBBones,
} from '../dist/index.mjs';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

function pad4(bytes, padByte) {
	const out = new Uint8Array(bytes.length + ((4 - (bytes.length % 4)) % 4));
	out.set(bytes);
	out.fill(padByte, bytes.length);
	return out;
}

// Build a minimal but valid GLB around a glTF JSON tree and optional BIN payload.
function makeGLB(json, bin = null) {
	const jsonChunk = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
	const binChunk = bin ? pad4(bin, 0x00) : null;
	const total = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0);
	const buffer = new ArrayBuffer(total);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	view.setUint32(0, GLB_MAGIC, true);
	view.setUint32(4, 2, true);
	view.setUint32(8, total, true);
	view.setUint32(12, jsonChunk.length, true);
	view.setUint32(16, CHUNK_JSON, true);
	bytes.set(jsonChunk, 20);
	if (binChunk) {
		view.setUint32(20 + jsonChunk.length, binChunk.length, true);
		view.setUint32(24 + jsonChunk.length, CHUNK_BIN, true);
		bytes.set(binChunk, 28 + jsonChunk.length);
	}
	return buffer;
}

// Re-parse a GLB: header, glTF JSON tree, and the remaining chunks verbatim.
function parseGLB(buffer) {
	const view = new DataView(buffer);
	assert.equal(view.getUint32(0, true), GLB_MAGIC, 'bad GLB magic');
	const total = view.getUint32(8, true);
	assert.equal(total, buffer.byteLength, 'declared length != buffer length');
	const jsonLength = view.getUint32(12, true);
	assert.equal(view.getUint32(16, true), CHUNK_JSON, 'first chunk is not JSON');
	const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
	const chunks = [];
	let offset = 20 + jsonLength;
	while (offset < total) {
		const length = view.getUint32(offset, true);
		const type = view.getUint32(offset + 4, true);
		chunks.push({ type, bytes: new Uint8Array(buffer, offset + 8, length).slice() });
		offset += 8 + length;
	}
	assert.equal(offset, total, 'chunk walk overran the declared length');
	return { json, chunks };
}

const MIXAMO_CORE = [
	'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
	'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
	'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
	'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
	'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];
const MIXAMO_FINGERS = [
	'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
	'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
	'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
	'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
];

test('fully recognizable rig: every node renamed, humanoid gate cleared, BIN chunk untouched', () => {
	const names = [...MIXAMO_CORE, ...MIXAMO_FINGERS]; // 34 canonical hits ≥ 26
	const json = {
		asset: { version: '2.0' },
		nodes: names.map((name) => ({ name: `mixamorig:${name}` })),
		scenes: [{ nodes: names.map((_, i) => i) }],
	};
	const bin = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	const input = makeGLB(json, bin);

	const { buffer, report } = canonicalizeGLBBones(input);

	// Report: every node recognized and renamed, gate cleared.
	assert.equal(report.totalNodes, names.length);
	assert.equal(report.renamedCount, names.length);
	assert.equal(report.unrecognizedNames.length, 0);
	assert.equal(report.canonicalHits, names.length);
	assert.equal(report.canonicalBoneCount, CANONICAL_BONES.length);
	assert.equal(report.coverage, names.length / CANONICAL_BONES.length);
	assert.equal(report.minCoverage, MIN_COVERAGE);
	assert.equal(report.isHumanoid, true);
	assert.deepEqual(report.renamed[0], { from: 'mixamorig:Hips', to: 'Hips' });

	// Buffer: rebuilt (JSON shrank), still a valid GLB with canonical names…
	assert.notEqual(buffer.byteLength, input.byteLength);
	const reparsed = parseGLB(buffer);
	assert.deepEqual(reparsed.json.nodes.map((n) => n.name), names);
	// …and the BIN chunk survived byte for byte.
	assert.equal(reparsed.chunks.length, 1);
	assert.equal(reparsed.chunks[0].type, CHUNK_BIN);
	assert.deepEqual(reparsed.chunks[0].bytes, bin);
});

test('partial rig below the gate: renames what it can, reports the rest, still returns a buffer', () => {
	const junk = ['Bone_001', 'Bone_002', 'spring_chain_01', 'IKTarget', 'meshNode', 'prop_sword', 'cameraPivot'];
	const known = ['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm'];
	const json = {
		asset: { version: '2.0' },
		nodes: [...known.map((n) => ({ name: `mixamorig:${n}` })), ...junk.map((name) => ({ name }))],
	};
	const input = makeGLB(json);

	const { buffer, report } = canonicalizeGLBBones(input);

	assert.equal(report.totalNodes, known.length + junk.length);
	assert.equal(report.renamedCount, known.length);
	assert.deepEqual(report.unrecognizedNames, junk);
	assert.equal(report.canonicalHits, known.length);
	assert.ok(report.coverage < MIN_COVERAGE, `coverage ${report.coverage} should be below the gate`);
	assert.equal(report.isHumanoid, false); // flagged, not thrown

	// The buffer still comes back as a valid GLB: known bones canonical, junk untouched.
	const reparsed = parseGLB(buffer);
	assert.deepEqual(
		reparsed.json.nodes.map((n) => n.name),
		[...known, ...junk],
	);
});

test('nothing to rename: buffer comes back byte-identical', () => {
	const json = {
		asset: { version: '2.0' },
		nodes: MIXAMO_CORE.map((name) => ({ name })), // already canonical
	};
	const bin = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);
	const input = makeGLB(json, bin);

	const { buffer, report } = canonicalizeGLBBones(input);

	assert.equal(report.renamedCount, 0);
	assert.deepEqual(report.renamed, []);
	assert.equal(report.unrecognizedNames.length, 0);
	assert.deepEqual(new Uint8Array(buffer), new Uint8Array(input));
});

test('no nodes at all: buffer comes back byte-identical', () => {
	const input = makeGLB({ asset: { version: '2.0' }, scenes: [{ nodes: [] }] });

	const { buffer, report } = canonicalizeGLBBones(input);

	assert.equal(report.totalNodes, 0);
	assert.equal(report.renamedCount, 0);
	assert.equal(report.canonicalHits, 0);
	assert.equal(report.isHumanoid, false);
	assert.deepEqual(new Uint8Array(buffer), new Uint8Array(input));
});

test('bad inputs throw readable errors instead of returning half-built output', () => {
	// Empty buffer.
	assert.throws(() => canonicalizeGLBBones(new ArrayBuffer(0)), /empty input/);

	// Not a GLB at all.
	const text = new TextEncoder().encode('this is definitely not a GLB file........');
	assert.throws(() => canonicalizeGLBBones(text.buffer), /not a GLB/);

	// Header claims more bytes than the buffer holds (truncated download).
	const truncated = makeGLB({ asset: { version: '2.0' }, nodes: [] }).slice(0, 16);
	assert.throws(() => canonicalizeGLBBones(truncated), /too small|truncated/i);

	// JSON chunk length overruns the declared GLB length.
	const overrun = new ArrayBuffer(30);
	const overrunView = new DataView(overrun);
	overrunView.setUint32(0, GLB_MAGIC, true);
	overrunView.setUint32(4, 2, true);
	overrunView.setUint32(8, 30, true);
	overrunView.setUint32(12, 100, true); // JSON chunk declares 100 bytes, 10 remain
	overrunView.setUint32(16, CHUNK_JSON, true);
	assert.throws(() => canonicalizeGLBBones(overrun), /JSON chunk truncated/);

	// JSON chunk that isn't JSON.
	const corrupt = new ArrayBuffer(24);
	const corruptView = new DataView(corrupt);
	corruptView.setUint32(0, GLB_MAGIC, true);
	corruptView.setUint32(4, 2, true);
	corruptView.setUint32(8, 24, true);
	corruptView.setUint32(12, 4, true);
	corruptView.setUint32(16, CHUNK_JSON, true);
	new Uint8Array(corrupt, 20, 4).set([0xff, 0xfe, 0x00, 0x01]);
	assert.throws(() => canonicalizeGLBBones(corrupt), /unparseable glTF JSON/);

	// Not even a buffer.
	assert.throws(() => canonicalizeGLBBones(null), TypeError);
	assert.throws(() => canonicalizeGLBBones('{}'), TypeError);
});

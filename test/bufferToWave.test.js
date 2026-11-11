"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { bufferToWave, normalizeAudioBuffer } = require("../lib/bufferToWave.js");
const { FakeAudioBuffer } = require("./fake-audio-buffer.js");

// Parse the WAV produced by the encoder and expose every header value that
// the task requires to stay consistent with the real frame/channel counts.
async function parseWav(blob) {
	let bytes = new Uint8Array(await blob.arrayBuffer());
	let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	let ascii = (offset, count) =>
		String.fromCharCode(...bytes.subarray(offset, offset + count));

	return {
		bytes,
		view,
		riffId: ascii(0, 4),
		riffSize: view.getUint32(4, true),
		waveId: ascii(8, 4),
		fmtId: ascii(12, 4),
		fmtSize: view.getUint32(16, true),
		audioFormat: view.getUint16(20, true),
		channels: view.getUint16(22, true),
		sampleRate: view.getUint32(24, true),
		byteRate: view.getUint32(28, true),
		blockAlign: view.getUint16(32, true),
		bitsPerSample: view.getUint16(34, true),
		dataId: ascii(36, 4),
		dataSize: view.getUint32(40, true),
		samples: (() => {
			let out = [];
			for (let p = 44; p + 2 <= bytes.length; p += 2)
				out.push(view.getInt16(p, true));
			return out;
		})()
	};
}

// Re-implement the legacy asymmetric 16-bit quantization for expectations.
function legacyQuantize(sample) {
	let clamped = Math.max(-1, Math.min(1, sample));
	return (0.5 + clamped < 0 ? clamped * 32768 : clamped * 32767) | 0;
}

test("mono: writes every frame with consistent headers and summary", () => {
	let buffer = new FakeAudioBuffer(1, 8, 44100);
	let data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++)
		data[i] = (i - 3.5) / 8; // values stay inside [-1, 1]

	let result = normalizeAudioBuffer(buffer, 8 / 44100);

	assert.equal(result.frameCount, 8);
	assert.equal(result.numberOfChannels, 1);
	assert.equal(result.clippedSamples, 0);
	assert.equal(result.truncated, false);

	return parseWav(result.blob).then(wav => {
		assert.equal(wav.riffId, "RIFF");
		assert.equal(wav.waveId, "WAVE");
		assert.equal(wav.fmtId, "fmt ");
		assert.equal(wav.dataId, "data");
		assert.equal(wav.audioFormat, 1);
		assert.equal(wav.channels, 1);
		assert.equal(wav.sampleRate, 44100);
		assert.equal(wav.bitsPerSample, 16);
		assert.equal(wav.byteRate, 44100 * 2);
		assert.equal(wav.blockAlign, 2);
		assert.equal(wav.dataSize, 8 * 1 * 2);
		assert.equal(wav.riffSize, 36 + wav.dataSize);
		assert.equal(wav.bytes.length, 44 + wav.dataSize);
		assert.deepEqual(wav.samples, Array.from(data, legacyQuantize));
	});
});

test("stereo: frames are channel interleaved and headers use 2 channels", () => {
	let buffer = new FakeAudioBuffer(2, 4, 48000);
	let left = buffer.getChannelData(0);
	let right = buffer.getChannelData(1);
	for (let i = 0; i < 4; i++) {
		left[i] = 0.1 * (i + 1);
		right[i] = -0.1 * (i + 1);
	}

	let result = normalizeAudioBuffer(buffer, 4 / 48000);

	assert.equal(result.frameCount, 4);
	assert.equal(result.numberOfChannels, 2);
	assert.equal(result.clippedSamples, 0);
	assert.equal(result.truncated, false);

	return parseWav(result.blob).then(wav => {
		assert.equal(wav.channels, 2);
		assert.equal(wav.sampleRate, 48000);
		assert.equal(wav.byteRate, 48000 * 2 * 2);
		assert.equal(wav.blockAlign, 4);
		assert.equal(wav.dataSize, 4 * 2 * 2);
		assert.equal(wav.riffSize, 36 + wav.dataSize);
		assert.equal(wav.bytes.length, 44 + wav.dataSize);

		let expected = [];
		for (let i = 0; i < 4; i++) {
			expected.push(legacyQuantize(left[i]));
			expected.push(legacyQuantize(right[i]));
		}
		assert.deepEqual(wav.samples, expected);
	});
});

test("clipping: out-of-range samples are clamped and counted per sample", () => {
	let buffer = new FakeAudioBuffer(1, 6, 22050);
	let data = buffer.getChannelData(0);
	[1.5, 1.0, 0.2, -1.25, -1.0, -0.4].forEach((v, i) => data[i] = v);

	let result = normalizeAudioBuffer(buffer, 6 / 22050);

	// only 1.5 and -1.25 are strictly outside [-1, 1]
	assert.equal(result.clippedSamples, 2);
	assert.equal(result.frameCount, 6);
	assert.equal(result.truncated, false);

	return parseWav(result.blob).then(wav => {
		assert.equal(wav.dataSize, 6 * 2);
		assert.deepEqual(wav.samples, Array.from(data, legacyQuantize));
		// clamped extremes encode to full-scale, never past it
		assert.equal(wav.samples[0], 32767);
		assert.equal(wav.samples[3], -32768);
	});
});

test("clipping count covers every channel of an interleaved buffer", () => {
	let buffer = new FakeAudioBuffer(2, 3, 44100);
	buffer.getChannelData(0).set([2, 0.5, -0.5]);
	buffer.getChannelData(1).set([0.5, -3, 0.5]);

	let result = normalizeAudioBuffer(buffer, 3 / 44100);
	assert.equal(result.clippedSamples, 2);
});

test("truncation: request longer than the buffer stops at the buffer end", () => {
	let buffer = new FakeAudioBuffer(2, 5, 44100);
	for (let c = 0; c < 2; c++) {
		let data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i++)
			data[i] = 0.5;
	}

	// ask for 10 frames worth of time; only 5 exist
	let result = normalizeAudioBuffer(buffer, 10 / 44100);

	assert.equal(result.frameCount, 5);
	assert.equal(result.truncated, true);
	assert.equal(result.clippedSamples, 0);

	return parseWav(result.blob).then(wav => {
		// header describes only the frames really written: no silent tail
		assert.equal(wav.dataSize, 5 * 2 * 2);
		assert.equal(wav.riffSize, 36 + wav.dataSize);
		assert.equal(wav.bytes.length, 44 + wav.dataSize);
		assert.equal(wav.samples.length, 5 * 2);
	});
});

test("request shorter than the buffer writes only the requested frames", () => {
	let buffer = new FakeAudioBuffer(1, 100, 44100);
	for (let i = 0; i < 100; i++)
		buffer.getChannelData(0)[i] = 0.1;

	let result = normalizeAudioBuffer(buffer, 10 / 44100); // 10 frames
	assert.equal(result.frameCount, 10);
	assert.equal(result.truncated, false);

	return parseWav(result.blob).then(wav => {
		assert.equal(wav.dataSize, 10 * 2);
		assert.equal(wav.bytes.length, 44 + 20);
	});
});

for (let bad of [0, -1, -0.001, NaN, Infinity, -Infinity]) {
	test(`illegal duration is rejected (${bad}) without producing a file`, () => {
		let buffer = new FakeAudioBuffer(1, 4, 44100);
		assert.throws(() => normalizeAudioBuffer(buffer, bad), RangeError);
	});
}

test("non-numeric duration is rejected", () => {
	let buffer = new FakeAudioBuffer(1, 4, 44100);
	assert.throws(() => normalizeAudioBuffer(buffer, "2"), RangeError);
	assert.throws(() => normalizeAudioBuffer(buffer, undefined), RangeError);
});

test("legacy bufferToWave stays compatible with the old encoding", () => {
	let buffer = new FakeAudioBuffer(2, 4, 44100);
	buffer.getChannelData(0).set([0.2, -0.4, 1.4, -1.4]);
	buffer.getChannelData(1).set([-0.2, 0.4, 0, 0.9]);

	let blob = bufferToWave(buffer, buffer.length);

	return parseWav(blob).then(wav => {
		assert.equal(wav.channels, 2);
		assert.equal(wav.dataSize, 4 * 2 * 2);
		assert.equal(wav.bytes.length, 44 + wav.dataSize);

		let expected = [];
		for (let i = 0; i < 4; i++) {
			expected.push(legacyQuantize(buffer.getChannelData(0)[i]));
			expected.push(legacyQuantize(buffer.getChannelData(1)[i]));
		}
		assert.deepEqual(wav.samples, expected);
	});
});

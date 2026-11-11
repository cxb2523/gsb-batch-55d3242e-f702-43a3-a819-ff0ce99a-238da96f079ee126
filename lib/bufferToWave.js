// https://www.russellgood.com/how-to-convert-audiobuffer-to-audio-file/

// Validate the requested render duration and resolve how many frames can
// actually be written without reading past the end of the AudioBuffer.
// Throws RangeError for 0, negative, non-finite or non-numeric durations,
// so callers never end up encoding an empty or bogus file.
function resolveWavFrameCount(abuffer, requestedSeconds) {
	if (typeof requestedSeconds != "number" || !isFinite(requestedSeconds)
		|| requestedSeconds <= 0)
		throw new RangeError("Invalid render duration: " + requestedSeconds);

	let requestedFrames = Math.round(requestedSeconds * abuffer.sampleRate);
	if (!isFinite(requestedFrames) || requestedFrames <= 0)
		throw new RangeError("Invalid render duration: " + requestedSeconds);

	let frameCount = Math.min(requestedFrames, abuffer.length);

	return {
		frameCount,
		// true when the request asked for more frames than the buffer holds
		truncated: requestedFrames > abuffer.length
	};
}

// Observable normalization step, safe to call on its own.
// Input: an AudioBuffer and the requested render length in seconds.
// It validates the duration, clamps the writable range to the buffer,
// counts every sample outside [-1, 1] before clamping it, and encodes the
// WAV in a single interleaved pass.
// Returns:
// {
//   blob:             Blob with the encoded "audio/wav" file,
//   frameCount:       number of frames actually written,
//   numberOfChannels: channel count taken from the buffer,
//   clippedSamples:   how many individual channel samples exceeded +/-1,
//   truncated:        true if the request was longer than the buffer
// }
function normalizeAudioBuffer(abuffer, requestedSeconds) {
	let { frameCount, truncated } = resolveWavFrameCount(abuffer, requestedSeconds);

	var numOfChan = abuffer.numberOfChannels,
		dataLength = frameCount * numOfChan * 2,
		length = dataLength + 44,
		buffer = new ArrayBuffer(length),
		view = new DataView(buffer),
		channels = [], i, sample,
		offset = 0,
		pos = 0,
		clippedSamples = 0;

	setUint32(0x46464952); // "RIFF"
	setUint32(length - 8);
	setUint32(0x45564157); // "WAVE"

	setUint32(0x20746d66); // "fmt "
	setUint32(16);
	setUint16(1); // PCM
	setUint16(numOfChan);
	setUint32(abuffer.sampleRate);
	setUint32(abuffer.sampleRate * 2 * numOfChan); // byte rate
	setUint16(numOfChan * 2); // block align
	setUint16(16);

	setUint32(0x61746164); // "data"
	setUint32(dataLength);

	for (i = 0; i < numOfChan; i++)
		channels.push(abuffer.getChannelData(i));

	// frameCount is clamped to abuffer.length, so no out-of-bounds reads
	while (offset < frameCount) {
		for (i = 0; i < numOfChan; i++) {
			sample = channels[i][offset];

			if (sample > 1 || sample < -1) {
				clippedSamples++;
				sample = Math.max(-1, Math.min(1, sample));
			}

			// asymmetric 16-bit quantization, kept identical to legacy output
			sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
			view.setInt16(pos, sample, true);
			pos += 2;
		}
		offset++;
	}

	return {
		blob: new Blob([buffer], { type: "audio/wav" }),
		frameCount,
		numberOfChannels: numOfChan,
		clippedSamples,
		truncated
	};

	function setUint16(data) {
		view.setUint16(pos, data, true);
		pos += 2;
	}

	function setUint32(data) {
		view.setUint32(pos, data, true);
		pos += 4;
	}
}

// Legacy entry point: len is a number of frames. Kept for backwards
// compatibility, it delegates to the normalization step so headers and
// quantization always match the observable path.
function bufferToWave(abuffer, len) {
	return normalizeAudioBuffer(abuffer, len / abuffer.sampleRate).blob;
}

if (typeof module != "undefined" && module.exports)
	module.exports = { bufferToWave, normalizeAudioBuffer };

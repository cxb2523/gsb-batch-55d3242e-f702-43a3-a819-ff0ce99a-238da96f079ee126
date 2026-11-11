"use strict";

// Minimal AudioBuffer stand-in for Node tests. It implements only the
// surface used by lib/bufferToWave.js: numberOfChannels, length,
// sampleRate and getChannelData().
class FakeAudioBuffer {
	constructor(numberOfChannels, length, sampleRate) {
		this.numberOfChannels = numberOfChannels;
		this.length = length;
		this.sampleRate = sampleRate;
		this._channels = [];

		for (let c = 0; c < numberOfChannels; c++)
			this._channels.push(new Float32Array(length));
	}

	getChannelData(channel) {
		return this._channels[channel];
	}
}

module.exports = { FakeAudioBuffer };

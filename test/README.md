# WAV export: normalization and local tests

The WAV export path no longer hands the raw rendered `AudioBuffer` straight to
the encoder. `lib/bufferToWave.js` now exposes an independently callable
normalization step that runs **before** any file is written.

## What the normalization step does

```js
const result = normalizeAudioBuffer(audioBuffer, requestedSeconds);
```

It returns:

| Field              | Meaning                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `frameCount`       | frames actually written = `min(requestedSeconds * sampleRate, buffer.length)` |
| `numberOfChannels` | channel count taken from the buffer                              |
| `clippedSamples`   | number of individual channel samples strictly outside `[-1, 1]`  |
| `truncated`        | `true` when the requested duration is longer than the buffer     |
| `blob`             | the encoded `audio/wav` file                                     |

Rules implemented:

- `requestedSeconds` of `0`, negative, `NaN`, `±Infinity` or non-number throws
  `RangeError` — no empty/bogus file is ever produced.
- The frame count is clamped to `buffer.length`, so the encoder never reads
  past the end of the buffer and no silent tail is appended.
- Every sample outside `[-1, 1]` is counted, then clamped. The 16-bit
  asymmetric quantization (`sample * 32768` on the negative half-axis,
  `sample * 32767` otherwise) is unchanged, so in-range output stays
  byte-identical to files written by the old encoder.
- Multi-channel data is interleaved per frame; RIFF/WAVE/fmt/data IDs,
  data size, byte rate and block align are all derived from the real frame
  and channel counts.

`bufferToWave(buffer, frameCount)` still exists and delegates to the new
step, so any other caller keeps working.

## Running the tests locally

Node 18+ is required (no dependencies are installed):

```sh
npm test
# or directly:
node --test "test/**/*.test.js"
```

`test/fake-audio-buffer.js` is a tiny stand-in for the browser `AudioBuffer`
(the Web Audio type does not exist in Node). The suite covers:

1. normal mono encoding with header/size/quantization checks,
2. stereo channel interleaving and 2-channel header values,
3. clipping count for out-of-range samples (including per-channel counting),
4. truncation when the requested duration exceeds the buffer,
5. shorter-than-buffer requests,
6. rejection of illegal durations (`0`, negatives, `NaN`, infinities,
   non-numbers),
7. byte-level compatibility of the legacy `bufferToWave` entry point.

## Verifying with one real export in the browser

1. Serve the repository over HTTP (the page uses modules/Workers, so opening
   the file directly can be blocked):

   ```sh
   npx serve .
   # or: python -m http.server 8000
   ```

2. Open `export.html` (e.g. <http://localhost:3000/export.html>), enter a
   duration and click **Start**. After rendering, a toast and the persistent
   status line under **Download WAV** show, for example:

   > 已写入 441000 帧、2 声道、裁剪 0 个采样、未截断

3. Click **Download WAV**, then parse the saved file in the same page's
   DevTools console (or any page) after dragging it onto the page, or simply
   run this snippet against the download link before clicking it:

   ```js
   // Run on export.html right after a successful export.
   const res = await fetch(document.getElementById("link-wav-download").href);
   const bytes = new Uint8Array(await res.arrayBuffer());
   const view = new DataView(bytes.buffer);
   const fourcc = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));

   console.log({
     riff: fourcc(0),
     wave: fourcc(8),
     fmt: fourcc(12),
     channels: view.getUint16(22, true),
     sampleRate: view.getUint32(24, true),
     byteRate: view.getUint32(28, true),
     blockAlign: view.getUint16(32, true),
     dataId: fourcc(36),
     dataSize: view.getUint32(40, true),
     totalSize: bytes.length,                 // must equal 44 + dataSize
     framesFromHeader: view.getUint32(40, true) / view.getUint16(32, true)
   });
   ```

   `framesFromHeader` must match the frame count in the toast/status text,
   `totalSize` must equal `44 + dataSize`, and `byteRate` must equal
   `sampleRate * blockAlign`.

### Forcing the two edge cases manually

- **Truncation:** in the console, call the encoder directly with a fake
  buffer shorter than the request:

  ```js
  const buf = new AudioContext().createBuffer(2, 10, 44100);
  console.log(normalizeAudioBuffer(buf, 1)); // 1 s asked, only 10 frames exist
  // -> { frameCount: 10, truncated: true, ... } and the status says 已截断
  ```

- **Clipping:** fill a buffer with values above `+1` / below `-1`:

  ```js
  const ctx = new AudioContext();
  const buf = ctx.createBuffer(1, 4, 44100);
  buf.getChannelData(0).set([1.5, -1.5, 0.2, -0.2]);
  console.log(normalizeAudioBuffer(buf, 4 / 44100)); // clippedSamples: 2
  ```

- **Illegal duration:** enter `0`, a negative number or leave the field
  empty (becomes `NaN`) and click **Start**. An alert reports the failure,
  no download is produced, and the Start button stays usable.

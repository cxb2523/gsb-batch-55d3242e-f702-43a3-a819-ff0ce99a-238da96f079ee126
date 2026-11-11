import { expect, test } from "bun:test";

/**
 * The `?bytes=1` round trip, both halves: the route answers `Buffer.toString("base64")`
 * and `readBytes` decodes it with an `atob` char loop. Anything fed to `decodeAudioData`,
 * a MIDI parser or an image decoder depends on this being byte-exact.
 */
import { decodeBase64 as decode } from "../src/client/runtime/bindings";

test("every byte value survives the round trip", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  expect([...decode(Buffer.from(all).toString("base64"))]).toEqual([...all]);
});

test("lengths either side of a base64 group", () => {
  for (const sample of [[], [0xff], [0x00, 0xff], [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]]) {
    const bytes = Uint8Array.from(sample);
    expect([...decode(Buffer.from(bytes).toString("base64"))]).toEqual(sample);
  }
});

// Why the route exists at all: the same file read as text is not merely different, it is
// longer — every byte above 0x7f becomes a replacement character.
test("reading the same bytes as text corrupts them", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  expect(new TextEncoder().encode(Buffer.from(all).toString("utf8")).length).not.toBe(256);
});

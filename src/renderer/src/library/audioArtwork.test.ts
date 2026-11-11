import { describe, expect, it } from 'vitest'
import { extractEmbeddedArtwork } from './audioArtwork'

function joinBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }

  return result
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0))
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
}

function synchsafe(value: number): Uint8Array {
  return Uint8Array.of((value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

describe('embedded audio artwork', () => {
  it('extracts ID3 APIC artwork', () => {
    const image = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
    const payload = joinBytes(Uint8Array.of(0), ascii('image/jpeg'), Uint8Array.of(0, 3, 0), image)
    const frame = joinBytes(ascii('APIC'), uint32(payload.length), Uint8Array.of(0, 0), payload)
    const tag = joinBytes(ascii('ID3'), Uint8Array.of(3, 0, 0), synchsafe(frame.length), frame)

    expect(extractEmbeddedArtwork(toArrayBuffer(tag))).toEqual({ data: image, mimeType: 'image/jpeg' })
  })

  it('extracts FLAC picture blocks', () => {
    const image = Uint8Array.of(0x89, 0x50, 0x4e, 0x47)
    const mime = ascii('image/png')
    const picture = joinBytes(
      uint32(3),
      uint32(mime.length),
      mime,
      uint32(0),
      uint32(100),
      uint32(100),
      uint32(24),
      uint32(0),
      uint32(image.length),
      image
    )
    const blockHeader = Uint8Array.of(0x80 | 6, 0, 0, picture.length)
    const flac = joinBytes(ascii('fLaC'), blockHeader, picture)

    expect(extractEmbeddedArtwork(toArrayBuffer(flac))).toEqual({ data: image, mimeType: 'image/png' })
  })

  it('extracts MP4 cover atoms', () => {
    const image = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)
    const data = joinBytes(uint32(16 + image.length), ascii('data'), uint32(13), uint32(0), image)
    const cover = joinBytes(uint32(8 + data.length), ascii('covr'), data)

    expect(extractEmbeddedArtwork(toArrayBuffer(cover))).toEqual({ data: image, mimeType: 'image/jpeg' })
  })

  it('returns null for files without supported artwork', () => {
    expect(extractEmbeddedArtwork(new ArrayBuffer(32))).toBeNull()
  })
})

export interface EmbeddedArtwork {
  data: Uint8Array
  mimeType: string
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x10000 + bytes[offset + 1] * 0x100 + bytes[offset + 2]
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0)
}

function readSynchsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  )
}

function findTerminator(bytes: Uint8Array, start: number, wide: boolean): number {
  for (let index = start; index < bytes.length - (wide ? 1 : 0); index += wide ? 2 : 1) {
    if (bytes[index] === 0 && (!wide || bytes[index + 1] === 0)) {
      return index + (wide ? 2 : 1)
    }
  }

  return bytes.length
}

function parseAttachedPicture(payload: Uint8Array): EmbeddedArtwork | null {
  if (payload.length < 5) {
    return null
  }

  const encoding = payload[0]
  const mimeEnd = payload.indexOf(0, 1)

  if (mimeEnd < 0 || mimeEnd + 2 >= payload.length) {
    return null
  }

  const mimeType = readAscii(payload, 1, mimeEnd - 1) || 'image/jpeg'
  const imageStart = findTerminator(payload, mimeEnd + 2, encoding === 1 || encoding === 2)
  const data = payload.slice(imageStart)
  return data.length > 0 && mimeType.startsWith('image/') ? { data, mimeType } : null
}

function extractId3Artwork(bytes: Uint8Array): EmbeddedArtwork | null {
  if (bytes.length < 10 || readAscii(bytes, 0, 3) !== 'ID3') {
    return null
  }

  const version = bytes[3]
  const tagEnd = Math.min(bytes.length, 10 + readSynchsafe(bytes, 6))
  let offset = 10

  while (offset + (version === 2 ? 6 : 10) <= tagEnd) {
    const frameId = readAscii(bytes, offset, version === 2 ? 3 : 4)
    const frameSize = version === 2
      ? readUint24(bytes, offset + 3)
      : version === 4
        ? readSynchsafe(bytes, offset + 4)
        : readUint32(bytes, offset + 4)
    const headerSize = version === 2 ? 6 : 10

    if (!frameId.trim() || frameSize <= 0 || offset + headerSize + frameSize > tagEnd) {
      break
    }

    if (frameId === 'APIC') {
      return parseAttachedPicture(bytes.subarray(offset + headerSize, offset + headerSize + frameSize))
    }

    offset += headerSize + frameSize
  }

  return null
}

function extractFlacArtwork(bytes: Uint8Array): EmbeddedArtwork | null {
  if (bytes.length < 8 || readAscii(bytes, 0, 4) !== 'fLaC') {
    return null
  }

  let offset = 4

  while (offset + 4 <= bytes.length) {
    const type = bytes[offset] & 0x7f
    const length = readUint24(bytes, offset + 1)
    const blockStart = offset + 4
    const blockEnd = blockStart + length

    if (blockEnd > bytes.length) {
      return null
    }

    if (type === 6 && length >= 32) {
      let cursor = blockStart + 4

      if (cursor + 4 > blockEnd) {
        return null
      }

      const mimeLength = readUint32(bytes, cursor)
      cursor += 4

      if (cursor + mimeLength + 4 > blockEnd) {
        return null
      }

      const mimeType = readAscii(bytes, cursor, mimeLength)
      cursor += mimeLength
      const descriptionLength = readUint32(bytes, cursor)
      cursor += 4 + descriptionLength + 16

      if (cursor + 4 > blockEnd) {
        return null
      }

      const imageLength = readUint32(bytes, cursor)
      cursor += 4

      if (mimeType.startsWith('image/') && cursor + imageLength <= blockEnd) {
        return { data: bytes.slice(cursor, cursor + imageLength), mimeType }
      }
    }

    offset = blockEnd
  }

  return null
}

function extractMp4Artwork(bytes: Uint8Array): EmbeddedArtwork | null {
  for (let index = 4; index + 12 < bytes.length; index += 1) {
    if (readAscii(bytes, index, 4) !== 'covr') {
      continue
    }

    const coverStart = index - 4
    const coverEnd = Math.min(bytes.length, coverStart + readUint32(bytes, coverStart))

    for (let child = index + 4; child + 16 <= coverEnd;) {
      const childSize = readUint32(bytes, child)

      if (childSize < 16 || child + childSize > coverEnd) {
        break
      }

      if (readAscii(bytes, child + 4, 4) === 'data') {
        const dataType = readUint32(bytes, child + 8)
        const data = bytes.slice(child + 16, child + childSize)
        const mimeType = dataType === 14 ? 'image/png' : 'image/jpeg'
        return data.length > 0 ? { data, mimeType } : null
      }

      child += childSize
    }
  }

  return null
}

export function extractEmbeddedArtwork(arrayBuffer: ArrayBuffer): EmbeddedArtwork | null {
  const bytes = new Uint8Array(arrayBuffer)
  return extractId3Artwork(bytes) ?? extractFlacArtwork(bytes) ?? extractMp4Artwork(bytes)
}

export function createEmbeddedArtworkUrl(arrayBuffer: ArrayBuffer): string | undefined {
  const artwork = extractEmbeddedArtwork(arrayBuffer)

  if (!artwork) {
    return undefined
  }

  const data = new Uint8Array(artwork.data.byteLength)
  data.set(artwork.data)
  return URL.createObjectURL(new Blob([data.buffer], { type: artwork.mimeType }))
}

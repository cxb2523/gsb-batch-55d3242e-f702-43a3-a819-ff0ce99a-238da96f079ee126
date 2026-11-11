export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(aif|aiff|flac|m4a|mp3|ogg|wav)$/i.test(file.name)
}

export function createTrackId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function readFileExtension(fileName: string): string {
  const match = /\.[a-z0-9]{2,5}$/i.exec(fileName)
  return match?.[0] ?? '.mp3'
}

const FILE_NAME_UNSAFE_CHARACTERS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

export function createPlaylistFileName(title: string, downloadedFileName: string): string {
  const cleanedTitle = title
    .split('')
    .map((character) => (FILE_NAME_UNSAFE_CHARACTERS.has(character) || character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return cleanedTitle ? `${cleanedTitle}${readFileExtension(downloadedFileName)}` : downloadedFileName
}

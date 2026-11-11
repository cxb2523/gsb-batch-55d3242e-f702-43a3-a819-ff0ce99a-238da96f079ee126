const DEFAULT_BASE_NAME = "subtitles"

export function prettifyBytes(bytes: number) {
  if (!bytes && bytes !== 0) return "-"

  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let i = 0

  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function baseFileName(
  file: Pick<File, "name"> | null | undefined,
  fallback = DEFAULT_BASE_NAME,
) {
  return (
    (file?.name || fallback)
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .toLowerCase() || fallback
  )
}

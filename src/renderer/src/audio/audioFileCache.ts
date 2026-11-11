const fileBuffers = new WeakMap<File, Promise<ArrayBuffer>>()

export function readCachedFileBuffer(file: File): Promise<ArrayBuffer> {
  const cached = fileBuffers.get(file)

  if (cached) {
    return cached
  }

  const read = file.arrayBuffer().catch((error) => {
    fileBuffers.delete(file)
    throw error
  })

  fileBuffers.set(file, read)
  return read
}

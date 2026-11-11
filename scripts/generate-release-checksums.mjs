/* global process */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const RELEASE_EXTENSIONS = ['.AppImage', '.deb', '.dmg', '.exe', '.zip']

function isReleaseAsset(fileName) {
  return RELEASE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

async function sha256(filePath) {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

const releaseDirectory = process.argv[2] ?? 'release'
const entries = (await readdir(releaseDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && isReleaseAsset(entry.name))
  .map((entry) => entry.name)
  .sort()

if (!entries.length) {
  throw new Error(`No release assets found in ${releaseDirectory}.`)
}

const lines = []

for (const fileName of entries) {
  const filePath = join(releaseDirectory, fileName)
  lines.push(`${await sha256(filePath)}  ${basename(filePath)}`)
}

await writeFile(join(releaseDirectory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)

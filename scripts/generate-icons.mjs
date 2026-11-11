/* global process */
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const buildDir = resolve(rootDir, 'build')
const sourceIcon = resolve(buildDir, 'icon-source.png')
const iconsetDir = resolve(buildDir, 'icon.iconset')

const iconsetSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe'
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
}

function hasCommand(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' }).status === 0
}

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing source icon: ${sourceIcon}`)
}

if (!hasCommand('sips') || !hasCommand('iconutil')) {
  throw new Error('Generating macOS icons requires sips and iconutil.')
}

if (!hasCommand('magick')) {
  throw new Error('Generating Windows icons requires ImageMagick magick.')
}

await mkdir(buildDir, { recursive: true })
await rm(iconsetDir, { force: true, recursive: true })
await mkdir(iconsetDir, { recursive: true })

for (const [fileName, size] of iconsetSizes) {
  run('sips', ['-z', String(size), String(size), sourceIcon, '--out', resolve(iconsetDir, fileName)])
}

run('iconutil', ['-c', 'icns', iconsetDir, '-o', resolve(buildDir, 'icon.icns')])
run('sips', ['-z', '512', '512', sourceIcon, '--out', resolve(buildDir, 'icon.png')])
run('magick', [
  sourceIcon,
  '-define',
  'icon:auto-resize=256,128,64,48,32,16',
  resolve(buildDir, 'icon.ico')
])

await rm(iconsetDir, { force: true, recursive: true })

process.stdout.write('Generated build/icon.icns, build/icon.ico, and build/icon.png\n')

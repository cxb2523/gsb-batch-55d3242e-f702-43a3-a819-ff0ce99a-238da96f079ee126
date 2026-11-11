/* global console, process */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

const REQUIRED_ENTITLEMENTS = [
  'com.apple.security.cs.allow-jit',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.device.audio-input',
  'com.apple.security.device.camera'
]

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${output.trim()}`)
  }

  return output
}

if (process.platform !== 'darwin') {
  throw new Error('macOS signature verification must run on macOS.')
}

const releaseDirectory = process.argv[2] ?? 'release'
const appPaths = readdirSync(releaseDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^mac(?:-.+)?$/.test(entry.name))
  .map((entry) => join(releaseDirectory, entry.name, 'NextDJ.app'))

if (!appPaths.length) {
  throw new Error(`No packaged macOS applications found in ${releaseDirectory}.`)
}

for (const appPath of appPaths) {
  await access(appPath)
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', appPath])

  const signature = run('codesign', ['--display', '--verbose=4', appPath])
  if (!signature.includes('Signature=adhoc')) {
    throw new Error(`${appPath} does not have the expected ad-hoc signature.`)
  }

  const entitlements = run('codesign', ['--display', '--entitlements', ':-', appPath])
  for (const entitlement of REQUIRED_ENTITLEMENTS) {
    if (!entitlements.includes(`<key>${entitlement}</key>`)) {
      throw new Error(`${appPath} is missing entitlement ${entitlement}.`)
    }
  }

  console.log(`Verified ad-hoc signature and entitlements: ${appPath}`)
}

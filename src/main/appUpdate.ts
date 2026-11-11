import { app, ipcMain, shell } from 'electron'
import type { AppUpdateInfo } from '../shared/nextdj.js'

const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/antoniolg/next-dj/releases/latest'
const RELEASE_PATH_PREFIX = '/antoniolg/next-dj/releases/'
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RELEASE_ASSETS = 100
const MAX_URL_LENGTH = 2_048

interface ReleaseAsset {
  name: string
  browserDownloadUrl: string
}

interface NormalizedRelease {
  version: string
  releaseUrl: string
  assets: ReleaseAsset[]
}

interface UpdateResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type UpdateFetch = (url: string, init: RequestInit) => Promise<UpdateResponse>
type OpenExternal = (url: string) => Promise<void>

interface AppUpdateServiceOptions {
  currentVersion: string
  platform: NodeJS.Platform
  arch: string
  fetchImpl?: UpdateFetch
  openExternal?: OpenExternal
}

function readString(value: unknown, maxLength: number): string {
  return typeof value === 'string' && value.length <= maxLength ? value.trim() : ''
}

function readVersion(value: unknown): string {
  const version = readString(value, 64).replace(/^v/, '')
  return /^\d+\.\d+\.\d+$/.test(version) ? version : ''
}

function isTrustedReleaseUrl(value: string, asset = false): boolean {
  try {
    const url = new URL(value)
    const expectedPrefix = asset ? `${RELEASE_PATH_PREFIX}download/` : `${RELEASE_PATH_PREFIX}tag/`
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(expectedPrefix)
  } catch {
    return false
  }
}

function normalizeRelease(value: unknown): NormalizedRelease {
  if (!value || typeof value !== 'object') {
    throw new Error('GitHub returned an invalid release response.')
  }

  const record = value as Record<string, unknown>
  const version = readVersion(record.tag_name)
  const releaseUrl = readString(record.html_url, MAX_URL_LENGTH)

  if (!version || !isTrustedReleaseUrl(releaseUrl)) {
    throw new Error('GitHub returned invalid release metadata.')
  }

  const rawAssets = Array.isArray(record.assets) ? record.assets.slice(0, MAX_RELEASE_ASSETS) : []
  const assets = rawAssets.flatMap((rawAsset): ReleaseAsset[] => {
    if (!rawAsset || typeof rawAsset !== 'object') {
      return []
    }

    const asset = rawAsset as Record<string, unknown>
    const name = readString(asset.name, 256)
    const browserDownloadUrl = readString(asset.browser_download_url, MAX_URL_LENGTH)

    return name && isTrustedReleaseUrl(browserDownloadUrl, true) ? [{ name, browserDownloadUrl }] : []
  })

  return { version, releaseUrl, assets }
}

function versionParts(version: string): [number, number, number] {
  const normalized = readVersion(version)

  if (!normalized) {
    throw new Error(`Invalid application version: ${version}`)
  }

  return normalized.split('.').map(Number) as [number, number, number]
}

export function isNewerVersion(candidateVersion: string, currentVersion: string): boolean {
  const candidate = versionParts(candidateVersion)
  const current = versionParts(currentVersion)

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== current[index]) {
      return candidate[index] > current[index]
    }
  }

  return false
}

function findDownloadUrl(release: NormalizedRelease, platform: NodeJS.Platform, arch: string): string {
  let suffix = ''

  if (platform === 'darwin' && (arch === 'arm64' || arch === 'x64')) {
    suffix = `-mac-${arch}.dmg`
  } else if (platform === 'win32' && (arch === 'arm64' || arch === 'x64')) {
    suffix = `-win-${arch}-setup.exe`
  }

  return release.assets.find((asset) => suffix && asset.name.endsWith(suffix))?.browserDownloadUrl ?? release.releaseUrl
}

export class AppUpdateService {
  private readonly currentVersion: string
  private readonly platform: NodeJS.Platform
  private readonly arch: string
  private readonly fetchImpl: UpdateFetch
  private readonly openExternal: OpenExternal
  private lastUpdate: AppUpdateInfo | null = null
  private pendingCheck: Promise<AppUpdateInfo> | null = null

  constructor({
    currentVersion,
    platform,
    arch,
    fetchImpl = fetch,
    openExternal = (url) => shell.openExternal(url)
  }: AppUpdateServiceOptions) {
    this.currentVersion = currentVersion
    this.platform = platform
    this.arch = arch
    this.fetchImpl = fetchImpl
    this.openExternal = openExternal
  }

  checkForUpdate(): Promise<AppUpdateInfo> {
    if (this.pendingCheck) {
      return this.pendingCheck
    }

    this.pendingCheck = this.fetchLatestRelease().finally(() => {
      this.pendingCheck = null
    })

    return this.pendingCheck
  }

  async openUpdateDownload(): Promise<void> {
    const update = this.lastUpdate ?? (await this.checkForUpdate())

    if (!update.available) {
      throw new Error('No application update is available.')
    }

    if (!isTrustedReleaseUrl(update.downloadUrl, update.downloadUrl.includes('/download/'))) {
      throw new Error('The update download URL is not trusted.')
    }

    await this.openExternal(update.downloadUrl)
  }

  private async fetchLatestRelease(): Promise<AppUpdateInfo> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await this.fetchImpl(LATEST_RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `NextDJ/${this.currentVersion}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`GitHub release check failed with status ${response.status}.`)
      }

      const release = normalizeRelease(await response.json())
      const available = isNewerVersion(release.version, this.currentVersion)
      const update: AppUpdateInfo = {
        available,
        currentVersion: this.currentVersion,
        latestVersion: release.version,
        downloadUrl: findDownloadUrl(release, this.platform, this.arch)
      }

      this.lastUpdate = update
      return update
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function registerAppUpdateIpc(
  service: Pick<AppUpdateService, 'checkForUpdate' | 'openUpdateDownload'> = new AppUpdateService({
    currentVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  })
): void {
  ipcMain.handle('app-update:check', () => service.checkForUpdate())
  ipcMain.handle('app-update:open-download', () => service.openUpdateDownload())
}

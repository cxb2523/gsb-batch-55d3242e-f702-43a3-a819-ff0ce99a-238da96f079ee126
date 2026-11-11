import { describe, expect, it, vi } from 'vitest'
import { AppUpdateService, isNewerVersion } from './appUpdate.js'

function createRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v0.1.2',
    html_url: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.2',
    assets: [
      {
        name: 'NextDJ-0.1.2-mac-arm64.dmg',
        browser_download_url:
          'https://github.com/antoniolg/next-dj/releases/download/v0.1.2/NextDJ-0.1.2-mac-arm64.dmg'
      },
      {
        name: 'NextDJ-0.1.2-win-x64-setup.exe',
        browser_download_url:
          'https://github.com/antoniolg/next-dj/releases/download/v0.1.2/NextDJ-0.1.2-win-x64-setup.exe'
      }
    ],
    ...overrides
  }
}

function createFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => payload }))
}

describe('application update service', () => {
  it('compares stable semantic versions', () => {
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false)
  })

  it('selects the native macOS installer and opens only the cached trusted URL', async () => {
    const fetchImpl = createFetch(createRelease())
    const openExternal = vi.fn(async () => undefined)
    const service = new AppUpdateService({
      currentVersion: '0.1.1',
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl,
      openExternal
    })

    await expect(service.checkForUpdate()).resolves.toEqual({
      available: true,
      currentVersion: '0.1.1',
      latestVersion: '0.1.2',
      downloadUrl:
        'https://github.com/antoniolg/next-dj/releases/download/v0.1.2/NextDJ-0.1.2-mac-arm64.dmg'
    })
    await service.openUpdateDownload()

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/antoniolg/next-dj/releases/download/v0.1.2/NextDJ-0.1.2-mac-arm64.dmg'
    )
  })

  it('falls back to the release page when the platform asset is unavailable', async () => {
    const service = new AppUpdateService({
      currentVersion: '0.1.1',
      platform: 'linux',
      arch: 'x64',
      fetchImpl: createFetch(createRelease())
    })

    await expect(service.checkForUpdate()).resolves.toMatchObject({
      available: true,
      downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.2'
    })
  })

  it('does not open a download when the latest release is already installed', async () => {
    const openExternal = vi.fn(async () => undefined)
    const service = new AppUpdateService({
      currentVersion: '0.1.2',
      platform: 'win32',
      arch: 'x64',
      fetchImpl: createFetch(createRelease()),
      openExternal
    })

    await expect(service.checkForUpdate()).resolves.toMatchObject({ available: false })
    await expect(service.openUpdateDownload()).rejects.toThrow('No application update is available.')
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('rejects malformed versions, untrusted URLs, and failed API responses', async () => {
    const invalidMetadata = new AppUpdateService({
      currentVersion: '0.1.1',
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: createFetch(createRelease({ html_url: 'https://example.com/update' }))
    })
    const failedRequest = new AppUpdateService({
      currentVersion: '0.1.1',
      platform: 'darwin',
      arch: 'arm64',
      fetchImpl: createFetch({}, false, 503)
    })

    await expect(invalidMetadata.checkForUpdate()).rejects.toThrow('invalid release metadata')
    await expect(failedRequest.checkForUpdate()).rejects.toThrow('status 503')
    expect(() => isNewerVersion('next', '0.1.1')).toThrow('Invalid application version')
  })
})

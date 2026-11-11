import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.1' },
  ipcMain: { handle: electronMock.handle },
  shell: { openExternal: vi.fn() }
}))

import { registerAppUpdateIpc } from './appUpdate.js'

describe('application update IPC', () => {
  beforeEach(() => {
    electronMock.handle.mockReset()
  })

  it('registers fixed channels without accepting renderer-provided URLs', async () => {
    const service = {
      checkForUpdate: vi.fn(async () => ({
        available: false,
        currentVersion: '0.1.1',
        latestVersion: '0.1.1',
        downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.1'
      })),
      openUpdateDownload: vi.fn(async () => undefined)
    }

    registerAppUpdateIpc(service)

    expect(electronMock.handle).toHaveBeenCalledWith('app-update:check', expect.any(Function))
    expect(electronMock.handle).toHaveBeenCalledWith('app-update:open-download', expect.any(Function))

    await electronMock.handle.mock.calls[0][1]({}, 'https://example.com/untrusted')
    await electronMock.handle.mock.calls[1][1]({}, 'https://example.com/untrusted')

    expect(service.checkForUpdate).toHaveBeenCalledWith()
    expect(service.openUpdateDownload).toHaveBeenCalledWith()
  })
})

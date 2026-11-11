import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeBrowserWindowInstance {
  loadURL: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  webContents: {
    on: ReturnType<typeof vi.fn>
  }
}

const browserWindowMock = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  instances: [] as FakeBrowserWindowInstance[]
}))

vi.mock('electron', () => {
  class FakeBrowserWindow {
    loadURL = vi.fn()
    loadFile = vi.fn()
    webContents = {
      on: vi.fn()
    }

    constructor(options: unknown) {
      browserWindowMock.constructorOptions.push(options)
      browserWindowMock.instances.push(this)
    }
  }

  return { BrowserWindow: FakeBrowserWindow }
})

import { createMainWindow } from './window.js'

function lastInstance(): FakeBrowserWindowInstance {
  const instance = browserWindowMock.instances.at(-1)

  if (!instance) {
    throw new Error('No BrowserWindow instance was created')
  }

  return instance
}

function lastConstructorOptions(): {
  webPreferences: { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean; preload: string }
} {
  const options = browserWindowMock.constructorOptions.at(-1)

  if (!options) {
    throw new Error('BrowserWindow was not constructed')
  }

  return options as {
    webPreferences: { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean; preload: string }
  }
}

function beforeInputEventListener(instance: FakeBrowserWindowInstance): (event: unknown, input: unknown) => void {
  const call = instance.webContents.on.mock.calls.find(([eventName]) => eventName === 'before-input-event')

  if (!call) {
    throw new Error('before-input-event listener was not registered')
  }

  return call[1] as (event: unknown, input: unknown) => void
}

describe('createMainWindow', () => {
  beforeEach(() => {
    browserWindowMock.constructorOptions = []
    browserWindowMock.instances = []
  })

  it('hardens webPreferences, loads the packaged file, and blocks the reload key outside dev', () => {
    createMainWindow({ dirname: '/x', isDev: false })

    const options = lastConstructorOptions()
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
    expect(options.webPreferences.preload.endsWith('preload/index.js')).toBe(true)

    const instance = lastInstance()
    expect(instance.loadFile).toHaveBeenCalled()
    expect(instance.loadURL).not.toHaveBeenCalled()
    expect(instance.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function))
  })

  it('loads the renderer URL in dev and does not register a reload-key blocker', () => {
    createMainWindow({ dirname: '/x', isDev: true, rendererUrl: 'http://localhost:5173' })

    const instance = lastInstance()
    expect(instance.loadURL).toHaveBeenCalledWith('http://localhost:5173')
    expect(instance.loadFile).not.toHaveBeenCalled()
    expect(instance.webContents.on).not.toHaveBeenCalledWith('before-input-event', expect.any(Function))
  })

  it('prevents the default action for a reload key combo, and lets plain "r" through', () => {
    createMainWindow({ dirname: '/x', isDev: false })

    const instance = lastInstance()
    const listener = beforeInputEventListener(instance)

    const preventDefaultOnCombo = vi.fn()
    listener({ preventDefault: preventDefaultOnCombo }, { key: 'r', meta: true, control: false })
    expect(preventDefaultOnCombo).toHaveBeenCalled()

    const preventDefaultOnPlainKey = vi.fn()
    listener({ preventDefault: preventDefaultOnPlainKey }, { key: 'r', meta: false, control: false })
    expect(preventDefaultOnPlainKey).not.toHaveBeenCalled()
  })
})

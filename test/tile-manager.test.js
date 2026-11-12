import { assert } from '@esm-bundle/chai'
import { TileManager } from '../src/layers/gis/TileLayer.js'

const WORLD = 20037508.34  // half the Web Mercator world width, in metres

// Minimal regl stand-in: records every texture so tests can assert destroys.
function createFakeRegl() {
  const textures = []
  const regl = {
    limits: { maxTextureSize: 2048 },
    texture(spec) {
      const tex = {
        spec,
        destroyed: false,
        destroy() { this.destroyed = true },
      }
      textures.push(tex)
      return tex
    },
  }
  return { regl, textures }
}

// Controllable image loader: every call registers a promise the test resolves
// or rejects explicitly, so no real network/Image is involved.
function createLoader() {
  const requests = []
  const loadImage = (url) => {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    requests.push({ url, resolve, reject, promise })
    return promise
  }
  return { requests, loadImage }
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createManager(overrides = {}) {
  const { regl, textures } = createFakeRegl()
  const { requests, loadImage } = createLoader()
  const xTexFns = [() => null]
  const yTexFns = [() => null]
  const imageTexFns = [() => null]
  const warnings = []

  const manager = new TileManager({
    regl,
    source: {
      type: 'xyz',
      url: 'https://tiles.test/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 6,
      crs: 'EPSG:3857',
    },
    tileCrs: 'EPSG:3857',
    plotCrs: 'EPSG:3857',
    tessellation: 1,
    xTexFns,
    yTexFns,
    imageTexFns,
    onLoad() {},
    loadImage,
    warn: msg => warnings.push(msg),
    ...overrides,
  })

  return { manager, requests, textures, xTexFns, yTexFns, imageTexFns, warnings }
}

async function resolveRequests(requests, from = 0, value = {}) {
  for (const req of requests.slice(from)) req.resolve(value)
  await flush()
}

describe('TileManager viewport handling', () => {
  it('recomputes tiles when only the canvas size changes', async () => {
    const { manager, requests } = createManager()
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]

    manager.syncTiles(xDomain, yDomain, { width: 256, height: 256 })
    assert.isAbove(requests.length, 0)
    const beforeResize = requests.length
    assert.include(requests[0].url, '/1/', '256px viewport selects zoom 1')

    await resolveRequests(requests)

    // Same axis ranges, larger canvas => a new (higher) zoom level is required.
    manager.syncTiles(xDomain, yDomain, { width: 512, height: 512 })
    const newRequests = requests.slice(beforeResize)
    assert.isAbove(newRequests.length, 0, 'resize must schedule new tiles')
    for (const req of newRequests) {
      assert.include(req.url, '/2/', '512px viewport selects zoom 2')
    }

    await resolveRequests(requests, beforeResize)
  })

  it('does not schedule work when neither the domain nor the viewport changed', async () => {
    const { manager, requests } = createManager()
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]
    const viewport = { width: 256, height: 256 }

    manager.syncTiles(xDomain, yDomain, viewport)
    const before = requests.length
    assert.isAbove(before, 0)

    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, before)
  })
})

describe('TileManager request de-duplication', () => {
  it('does not issue a second request for a key that is still loading', async () => {
    const { manager, requests } = createManager()
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]
    const viewport = { width: 256, height: 256 }

    manager.syncTiles(xDomain, yDomain, viewport)
    const before = requests.length
    assert.isAbove(before, 0)

    // Re-sync while every request is still pending.
    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, before, 'in-flight keys must not be requested twice')

    await resolveRequests(requests)
  })
})

describe('TileManager LRU cache', () => {
  const entrySpec = key => ({
    key,
    url: `https://tiles.test/${key}.png`,
    bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    type: 'xyz',
  })

  it('updates access order when a loaded tile is hit by syncTiles', async () => {
    const { manager, requests } = createManager()

    async function loadEntry(key) {
      const promise = manager._loadTile(entrySpec(key))
      requests[requests.length - 1].resolve({})
      await promise
    }

    await loadEntry('k0')
    await loadEntry('k1')
    assert.deepEqual(manager.accessOrder, ['k0', 'k1'])

    // Next sync only needs k0, so it becomes the most recently used tile.
    manager._computeNeededTiles = () => [entrySpec('k0')]
    manager.syncTiles([1, 2], [3, 4], { width: 256, height: 256 })

    assert.deepEqual(manager.accessOrder, ['k1', 'k0'])
  })

  it('evicts the least recently used tile and destroys its texture', async () => {
    const { manager, requests } = createManager()

    async function loadEntry(key) {
      const promise = manager._loadTile(entrySpec(key))
      const req = requests[requests.length - 1]
      req.resolve({})
      await promise
    }

    // Fill beyond the 50-entry cache: k0..k4 are evicted in order.
    for (let i = 0; i < 55; i++) await loadEntry(`k${i}`)
    assert.equal(manager.tiles.size, 50)
    for (let i = 0; i < 5; i++) assert.isFalse(manager.tiles.has(`k${i}`))

    // Access k5 (least-recently-used among the survivors); it must no longer
    // be the eviction candidate.
    manager._touchTile('k5')

    const k6Tex = manager.tiles.get('k6').imgTex
    await loadEntry('k55')

    assert.equal(manager.tiles.size, 50)
    assert.isTrue(manager.tiles.has('k5'), 'recently used tile survives')
    assert.isFalse(manager.tiles.has('k6'), 'next LRU tile is evicted')
    assert.isTrue(k6Tex.destroyed, 'evicted texture is destroyed')
  })
})

describe('TileManager failure handling', () => {
  it('retries failed tiles and abandons a key after 3 consecutive failures', async () => {
    const { manager, requests, warnings } = createManager({
      source: {
        type: 'xyz',
        url: 'https://tiles.test/{z}/{x}/{y}.png',
        minZoom: 0,
        maxZoom: 0,
        crs: 'EPSG:3857',
      },
    })
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]
    const viewport = { width: 256, height: 256 }

    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, 1)

    requests[0].reject(new Error('network down'))
    await flush()
    assert.equal(warnings.length, 0, 'first failure must not warn')

    // Same view => the failed key is retried.
    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, 2)
    requests[1].reject(new Error('network down'))
    await flush()
    assert.equal(warnings.length, 0, 'second failure must not warn')

    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, 3)
    requests[2].reject(new Error('network down'))
    await flush()
    assert.equal(warnings.length, 1, 'one summary warning after giving up')
    assert.match(warnings[0], /3 consecutive times/)
    assert.equal(requests[2].url, requests[0].url)

    // Abandoned for the rest of the session.
    manager.syncTiles(xDomain, yDomain, viewport)
    assert.equal(requests.length, 3, 'abandoned key is never retried again')
  })
})

describe('TileManager single-image sources', () => {
  it('keeps exactly the current WMS image and destroys the previous texture', async () => {
    const { manager, requests } = createManager({
      source: {
        type: 'wms',
        url: 'https://wms.test/map',
        layers: 'layer-a',
        format: 'image/png',
        version: '1.1.1',
        crs: 'EPSG:3857',
      },
    })

    manager.syncTiles([0, WORLD], [0, WORLD], { width: 256, height: 256 })
    assert.equal(requests.length, 1)
    await resolveRequests(requests)
    assert.equal(manager.tiles.size, 1)

    const oldKey = requests[0].url
    const oldTile = manager.tiles.get(oldKey)
    assert.isOk(oldTile)

    // A range change produces a new single WMS image.
    manager.syncTiles([WORLD * 0.05, WORLD * 1.05], [0, WORLD], { width: 256, height: 256 })
    assert.equal(requests.length, 2)
    assert.notEqual(requests[1].url, oldKey)

    await resolveRequests(requests, 1)
    assert.equal(manager.tiles.size, 1, 'only the current WMS image remains')
    assert.isFalse(manager.tiles.has(oldKey))
    assert.isTrue(oldTile.imgTex.destroyed, 'old WMS texture is destroyed')
  })

  it('recomputes a single WMS image when only the canvas size changes', async () => {
    const { manager, requests } = createManager({
      source: {
        type: 'wms',
        url: 'https://wms.test/map',
        layers: 'layer-a',
        format: 'image/png',
        version: '1.1.1',
        crs: 'EPSG:3857',
      },
    })
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]

    manager.syncTiles(xDomain, yDomain, { width: 256, height: 256 })
    const firstUrl = requests[0].url

    manager.syncTiles(xDomain, yDomain, { width: 512, height: 256 })
    assert.equal(requests.length, 2, 'resize must fetch a differently sized WMS image')
    assert.notEqual(requests[1].url, firstUrl)
    assert.include(requests[1].url, 'WIDTH=512')

    await resolveRequests(requests, 1)
  })

  it('keeps exactly the current COG image and destroys the previous texture', async () => {
    const cogCalls = []
    const loadCogData = async (_source, bbox, width, height) => {
      cogCalls.push({ bbox, width, height })
      return {
        data: new Uint8Array(width * height * 3),
        width,
        height,
        bands: 3,
        isFloat: false,
      }
    }
    const { manager } = createManager({
      source: { type: 'cog', url: 'https://cog.test/image.tif', crs: 'EPSG:3857' },
      loadCogData,
    })

    manager.syncTiles([0, WORLD], [0, WORLD], { width: 256, height: 256 })
    await flush()
    assert.equal(manager.tiles.size, 1)
    const oldKey = [...manager.tiles.keys()][0]
    const oldTile = manager.tiles.get(oldKey)

    manager.syncTiles([WORLD * 0.05, WORLD * 1.05], [0, WORLD], { width: 256, height: 256 })
    await flush()

    assert.equal(cogCalls.length, 2)
    assert.equal(manager.tiles.size, 1, 'only the current COG image remains')
    assert.isFalse(manager.tiles.has(oldKey))
    assert.isTrue(oldTile.imgTex.destroyed, 'old COG texture is destroyed')
  })

  it('refetches a COG image when only the canvas size changes', async () => {
    const cogCalls = []
    const loadCogData = async (_source, bbox, width, height) => {
      cogCalls.push({ bbox, width, height })
      return {
        data: new Uint8Array(width * height * 3),
        width,
        height,
        bands: 3,
        isFloat: false,
      }
    }
    const { manager } = createManager({
      source: { type: 'cog', url: 'https://cog.test/image.tif', crs: 'EPSG:3857' },
      loadCogData,
    })
    const xDomain = [0, WORLD]
    const yDomain = [0, WORLD]

    manager.syncTiles(xDomain, yDomain, { width: 256, height: 256 })
    await flush()
    const oldKey = [...manager.tiles.keys()][0]

    manager.syncTiles(xDomain, yDomain, { width: 512, height: 512 })
    await flush()

    assert.equal(cogCalls.length, 2)
    assert.equal(cogCalls[1].width, 512)
    assert.equal(cogCalls[1].height, 512)
    assert.equal(manager.tiles.size, 1)
    assert.isFalse(manager.tiles.has(oldKey), 'resolution change produces a new key')
  })
})

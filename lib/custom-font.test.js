import { beforeEach, describe, expect, test } from 'bun:test'
import {
  CUSTOM_FONT_FAMILY,
  CUSTOM_FONT_STYLE_ID,
  injectCustomFont,
} from './custom-font'

// Minimal fake DOM good enough for injectCustomFont.
function createFakeDocument({ loadResult = [{}], loadError = null } = {}) {
  const elements = new Map()
  const doc = {
    fonts: {
      loadCalls: [],
      async load(font) {
        this.loadCalls.push(font)
        if (loadError) throw loadError
        return loadResult
      },
      ready: Promise.resolve(),
      check: () => loadResult.length > 0,
    },
    head: {
      children: [],
      appendChild(el) {
        this.children.push(el)
        elements.set(el.id, el)
      },
    },
    createElement(tag) {
      return {
        tag,
        id: '',
        textContent: '',
        remove() {
          elements.delete(this.id)
          doc.head.children = doc.head.children.filter((c) => c !== this)
        },
      }
    },
    getElementById(id) {
      return elements.get(id) ?? null
    },
  }
  return doc
}

const FONT_A = 'data:font/ttf;base64,AAAA'
const FONT_B = 'data:font/ttf;base64,BBBB'

describe('injectCustomFont', () => {
  let doc

  beforeEach(() => {
    doc = createFakeDocument()
  })

  test('success: injects @font-face and waits for the font to be usable', async () => {
    const style = await injectCustomFont(FONT_A, doc)

    expect(style.id).toBe(CUSTOM_FONT_STYLE_ID)
    expect(doc.getElementById(CUSTOM_FONT_STYLE_ID)).toBe(style)
    expect(style.textContent).toContain(`font-family: '${CUSTOM_FONT_FAMILY}'`)
    expect(style.textContent).toContain(`src: url(${FONT_A})`)
    // The promise only resolves after the font actually loaded.
    expect(doc.fonts.loadCalls).toEqual([`16px ${CUSTOM_FONT_FAMILY}`])
  })

  test('failure: unparsable font restores previous state and rethrows', async () => {
    // First a valid font is applied...
    await injectCustomFont(FONT_A, doc)
    const previous = doc.getElementById(CUSTOM_FONT_STYLE_ID).textContent

    // ...then a broken one is dropped.
    doc.fonts.load = async () => []
    doc.fonts.check = () => false

    await expect(injectCustomFont(FONT_B, doc)).rejects.toThrow(
      'font could not be loaded'
    )

    // Previous @font-face content is restored, not the broken one.
    const style = doc.getElementById(CUSTOM_FONT_STYLE_ID)
    expect(style.textContent).toBe(previous)
    expect(style.textContent).not.toContain(FONT_B)
  })

  test('failure: rejects when document.fonts.load itself throws', async () => {
    doc = createFakeDocument({ loadError: new Error('network/parse error') })

    await expect(injectCustomFont(FONT_A, doc)).rejects.toThrow(
      'network/parse error'
    )

    // First-drop failure removes the style node entirely.
    expect(doc.getElementById(CUSTOM_FONT_STYLE_ID)).toBeNull()
  })

  test('repeat: dropping fonts repeatedly reuses a single style node', async () => {
    await injectCustomFont(FONT_A, doc)
    await injectCustomFont(FONT_B, doc)
    await injectCustomFont(FONT_A, doc)

    const styles = doc.head.children.filter(
      (el) => el.id === CUSTOM_FONT_STYLE_ID
    )
    expect(styles).toHaveLength(1)
    // Content reflects the latest drop.
    expect(styles[0].textContent).toContain(`src: url(${FONT_A})`)
  })
})

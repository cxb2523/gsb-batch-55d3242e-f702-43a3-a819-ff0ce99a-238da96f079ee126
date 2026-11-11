// The custom font dropped by the user is always exposed under this family
// name and injected through a single reusable <style> node, so repeated
// drops never stack up style elements.
export const CUSTOM_FONT_FAMILY = 'CustomFont'
export const CUSTOM_FONT_STYLE_ID = 'ascii-custom-font-face'

export const FONT_LOAD_ERROR_MESSAGE =
  'Failed to load the dropped font. The previous font was restored.'

// Injects the dropped font through a single reusable <style> node and waits
// until the font is actually usable (parsed and ready to render) before
// resolving, so callers can safely rebuild the characters texture. On
// failure the previous @font-face state is restored and the error is
// re-thrown — never swallowed.
//
// `doc` is injectable for testing.
export async function injectCustomFont(fontData, doc = document) {
  let styleElement = doc.getElementById(CUSTOM_FONT_STYLE_ID)
  const previousStyleContent = styleElement?.textContent ?? null

  try {
    if (!styleElement) {
      styleElement = doc.createElement('style')
      styleElement.id = CUSTOM_FONT_STYLE_ID
      doc.head.appendChild(styleElement)
    }

    styleElement.textContent = `
      @font-face {
        font-family: '${CUSTOM_FONT_FAMILY}';
        src: url(${fontData});
      }
    `

    // Wait for the font to be parsed and ready to render.
    const faces = await doc.fonts.load(`16px ${CUSTOM_FONT_FAMILY}`)
    await doc.fonts.ready

    if (faces.length === 0 || !doc.fonts.check(`16px ${CUSTOM_FONT_FAMILY}`)) {
      throw new Error('font could not be loaded')
    }

    return styleElement
  } catch (error) {
    // Restore the previous font state.
    if (styleElement) {
      if (previousStyleContent === null) {
        styleElement.remove()
      } else {
        styleElement.textContent = previousStyleContent
      }
    }
    throw error
  }
}

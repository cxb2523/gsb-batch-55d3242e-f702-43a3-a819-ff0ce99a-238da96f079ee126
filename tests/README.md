# Tests

The tests in this directory are intentionally independent of the app's Vite
build and run on Node's native TypeScript support (Node >= 22), so they need no
test framework or extra dev dependency.

## Unit tests (pure logic, no browser)

```
npm test
```

- `thickness.test.ts` — the outline-thickness computation
  (`src/rendering/effects/thicken/thickness.ts`): invariance under projected
  bounding-box scaling (zoom/rotation), the explicit diagonal derivation,
  device-pixel-ratio conversion, resize behavior, degenerate-projection
  guards, and the shader loop-bound clamp.
- `thicken-shader.test.ts` — a CPU reference implementation of the thicken
  fragment shader (`thicken-reference.ts`) used to assert the GPU semantics:
  continuous fractional thickness (no integer-loop rounding), dilating
  near-pure-black opaque pixels only, and never polluting the transparent
  background.

## Browser / WebGL shader tests

```
npm run test:browser
```

`browser/glsl-check.ts` is served as a static page by Vite and driven by a
headless Chromium-based browser (Edge on Windows, Chrome/Chromium elsewhere;
override the binary with `BROWSER_BIN`). It compiles the *actual*
`src/rendering/effects/thicken/frag.glsl` against a real WebGL2 context and
renders small textures through it, verifying the same fractional-thickness and
background-preservation guarantees on the GPU itself. The orchestration lives
in `browser/run.mjs`.

These files are deliberately not part of `tsconfig.json` (which scopes the app
type-check to `src/`): the node tests use built-in modules (`node:test`,
`node:assert`) without `@types/node`, and the browser test uses DOM/WebGL
types. Both are validated by their respective runners instead.

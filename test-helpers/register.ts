/**
 * Test-only ESM resolve hook registration.
 *
 * The source code uses extensionless relative imports (e.g. `./geometry`)
 * which Vite and the TypeScript bundler resolve transparently, but Node's
 * native ESM loader does not. The unit tests that only pull in standalone
 * modules never hit this; the item tests cross those boundaries, so this
 * hook teaches Node to try the `.ts` file when an extensionless relative
 * specifier cannot be resolved as-is.
 *
 * This file is only used through `node --import ./test-helpers/register.ts`
 * and has no effect on the build or on the published package. It lives
 * outside the `test/` directory so the test runner does not mistake it for a
 * test suite.
 */
import { register } from "node:module";

register(new URL("./tsExtensionResolver.ts", import.meta.url));

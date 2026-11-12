/**
 * ESM resolve hook used by the unit tests.
 *
 * The source code uses extensionless relative imports (e.g. `./geometry`)
 * which Vite and the TypeScript bundler resolve transparently, but Node's
 * native ESM loader does not. This hook redirects those specifiers to their
 * `.ts` file via `nextResolve`; keeping the default loader in charge of the
 * redirect means the built-in TypeScript transform still applies to the
 * resolved module.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-zA-Z0-9]+$/.test(specifier) &&
      context.parentURL
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(candidate.href, context);
      }
    }
    throw error;
  }
}

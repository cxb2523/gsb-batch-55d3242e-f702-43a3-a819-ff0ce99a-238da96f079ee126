/**
 * Everything generated code may import as a "local" module.
 *
 * The react family MUST be here: generated code shares the shell's single React
 * instance or hooks blow up with an invalid-hook-call. Four of the five come from
 * the shell's platform table (see platform.ts), so registering them costs no
 * bundle weight — it only republishes the instances we already received.
 *
 * `scheduler` is the fifth, and it is NOT a platform module (see platform.ts's own
 * comment) — build.ts bundles a real copy of it into this file. It still has to be
 * registered here, because `partial-react`'s `DEFAULT_ESM_SH_EXTERNALS` lists it
 * alongside `react`/`react-dom` and asks esm.sh to leave it unbundled in every
 * `@react-three/*`-shaped fallback fetch (`?...&external=react,react-dom,scheduler`).
 * Those packages' compiled output therefore contains a literal `import ... from
 * "scheduler"` that only resolves against the document import map this module
 * installs — omitting the entry here is a silent `Failed to resolve module
 * specifier "scheduler"` at the browser level, not a compile-time error.
 *
 * We otherwise pre-register no component library. Anything else resolves through
 * the esm.sh fallback at compile time.
 */
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as Scheduler from "scheduler";
import { registerModules, registryImports } from "./registry.ts";

let installed = false;

/**
 * Installs a real `<script type="importmap">`.
 *
 * Compile-time rewriting only covers the code we generate. Packages pulled from
 * esm.sh arrive as already-compiled JS whose `import ... from "react"` survives
 * verbatim, and the browser resolves those bare specifiers against the document
 * import map alone — without it, any generated UI that uses a third-party
 * package dies on `Failed to resolve module specifier "react"`.
 *
 * It can only be installed once, and only before the first module resolution.
 */
function installDocumentImportMap(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  // A host-owned map wins: overwriting it would break whoever installed it, and a
  // second map is ignored by the browser anyway.
  if (document.querySelector('script[type="importmap"]') !== null) {
    console.warn("[dsh-generative-ui] the shell already installs an import map; bare specifiers from esm.sh packages may not resolve");
    return;
  }
  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports: registryImports() });
  document.head.prepend(script);
}

export function registerRuntimeModules(): void {
  registerModules({
    react: React,
    "react/jsx-runtime": ReactJsxRuntime,
    "react/jsx-dev-runtime": ReactJsxRuntime,
    "react-dom": ReactDom,
    "react-dom/client": ReactDomClient,
    scheduler: Scheduler,
  });
  installDocumentImportMap();
}

export const hostReactVersion = React.version;

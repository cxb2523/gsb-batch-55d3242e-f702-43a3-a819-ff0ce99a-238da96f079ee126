/**
 * `warmCompiler` is called by `apply()` and awaited by nobody. If it threw — or returned a
 * promise that rejects — the plugin's registration would go down with it and the shell would
 * load forever. `WASM_PATH` is an HTTP route, so with no server behind it `initTsx` rejects:
 * a faithful stand-in for the unfetchable-wasm case the guard exists for.
 *
 * **In its own file deliberately.** The first version lived in `compiler.test.ts`, whose top
 * level already runs `initTsx` from disk — so the wasm was warm, `initCompiler` never failed,
 * and deleting the entire swallow still passed. A guard against a failure can only be tested
 * where the failure actually happens.
 */
import { expect, test } from "bun:test";
import { disposeCompiler, warmCompiler } from "../src/client/runtime/compiler.ts";

test("warmCompiler never rejects when the wasm cannot be fetched", async () => {
  await warmCompiler();
  // Again after a dispose: the failure path nulls the promise so a retry is possible, and the
  // retry must be just as safe as the first attempt.
  disposeCompiler();
  await warmCompiler();
  expect(true).toBe(true);
});

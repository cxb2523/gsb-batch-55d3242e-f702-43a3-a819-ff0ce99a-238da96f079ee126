/**
 * Asserts the hand-written `$dsh/*` declarations still describe what `bind()` returns.
 *
 * They are hand-written on purpose — a card should see the capability surface, not how it
 * reaches the host — but a surface nobody checks drifts, and the model would find out by
 * getting a false error from `genui check`. This file is type-only: `bun run typecheck` fails
 * if a signature moves without its declaration moving too.
 *
 * The declarations are IMPORTED, not transcribed. An earlier version restated them by hand and
 * said so: "editing a `.d.ts` alone changes nothing — replacing `bash(command: string)` with
 * `bash(command: number)` leaves `tsc` silent." That was true, and it made this file a check on
 * a copy rather than on the thing — the same shape as `compiler.test.ts` testing a
 * re-implementation of its own module. `types/` is on the tsconfig `include`, so the ambient
 * `declare module` blocks resolve here directly.
 */
import type * as Ai from "$dsh/ai";
import type * as Chat from "$dsh/chat";
import type * as Exec from "$dsh/exec";
import type * as Web from "$dsh/web";
import type * as Fs from "$dsh/fs";
import type { bind } from "../src/client/runtime/bindings.ts";

type Bound = ReturnType<typeof bind>;

type Declared = {
  chat: { sendMessage: typeof Chat.sendMessage };
  ai: { streamText: typeof Ai.streamText };
  fs: { readFile: typeof Fs.readFile; readdir: typeof Fs.readdir; readBytes: typeof Fs.readBytes; writeFile: typeof Fs.writeFile };
  exec: { bash: typeof Exec.bash };
  web: { search: typeof Web.search };
  state: { usePersistedState: <T>(key: string, initial: T | (() => T)) => [T, import("react").Dispatch<import("react").SetStateAction<T>>] };
};

// Both directions: a declaration narrower than the implementation hides capability, and one
// wider promises what the runtime will not do. Either way the model is told something untrue.
const _implementationSatisfiesDeclaration: Declared = null as unknown as Bound;
const _declarationCoversImplementation: Bound = null as unknown as Declared;
void _implementationSatisfiesDeclaration;
void _declarationCoversImplementation;

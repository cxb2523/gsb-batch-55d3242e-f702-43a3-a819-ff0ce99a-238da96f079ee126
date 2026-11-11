/**
 * The `$dsh/exec` route.
 *
 * Sandboxing is the session's, not ours. What is ours: that the command runs under the NAMED
 * session's policy, that a non-zero exit is a 200 (the card checks `exitCode`, it does not
 * catch), that truncation is reported per stream, and that a disconnected caller kills the
 * command rather than leaving it running.
 */
import { describe, expect, test } from "bun:test";
import { serveExec } from "../src/index.ts";

type Spec = { command: string; workdir?: string; timeoutMs?: number; sandboxPolicy?: unknown; signal?: AbortSignal };
const stream = (text = "", truncated = false) => ({ text, truncated });

const ctxWith = (result: Record<string, unknown> = {}, seen: Spec[] = []) => ({
  shell: {
    resolve: (request: Spec) => {
      seen.push(request);
      return request;
    },
    run: async () => ({ exitCode: 0, stdout: stream("out"), stderr: stream(), ...result }),
  },
  sandboxPolicy: { resolve: (request?: { session?: unknown }) => ({ forSession: request?.session }) },
  sessions: {
    list: () => [
      { id: "s1", header: { cwd: "/w" } },
      { id: "s2", header: { cwd: "/w" } },
    ],
  },
});

const call = async (query: string, opts: { method?: string; body?: string; ctx?: any; live?: Set<string>; onReq?: (req: any) => void; started?: Promise<void>; destroyDuringBody?: boolean } = {}) => {
  let status = 0,
    body = "";
  const handlers: Record<string, () => void> = {};
  const res = {
    writableEnded: false,
    destroyed: false,
    on(event: string, fn: () => void) {
      handlers[event] = fn;
      return res;
    },
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return res;
    },
  };
  const req: any = {
    method: opts.method ?? "POST",
    url: `/x?${query}`,
    on() {},
    async *[Symbol.asyncIterator]() {
      if (opts.body !== undefined) yield opts.body;
      // Model a response destroyed by the time body consumption completes.
      if (opts.destroyDuringBody === true) res.destroyed = true;
    },
  };
  const promise = serveExec((opts.ctx ?? ctxWith()) as never, () => opts.live ?? new Set(["/w"]), req, res as never);
  // Response `close` has to be fired while the command is genuinely in flight: the handler is registered
  // inside `serveExec` only after it has awaited the request body, and firing before that lands
  // in an empty handler table. `started` resolves when the ctx says `run` was reached — waiting
  // on the real event rather than guessing a number of microtask turns.
  if (opts.onReq !== undefined) {
    await opts.started;
    opts.onReq({ close: () => handlers.close?.() });
  }
  await promise;
  return { status, json: body === "" ? null : JSON.parse(body) };
};

const body = JSON.stringify({ command: "ls" });

describe("the fence", () => {
  test("a workspace this session does not own is refused", async () => {
    expect((await call("cwd=%2Fw&session=s1", { body, live: new Set() })).status).toBe(403);
  });

  test("only POST runs a command", async () => {
    expect((await call("cwd=%2Fw&session=s1", { method: "GET", body })).status).toBe(405);
  });

  // Addressed by id: several sessions share a workspace, and picking the first would run a
  // stranger's access mode.
  test("an unknown session is refused rather than defaulted", async () => {
    expect((await call("cwd=%2Fw", { body })).status).toBe(400);
    expect((await call("cwd=%2Fw&session=nope", { body })).status).toBe(400);
  });

  test("an empty or unparseable command is refused", async () => {
    expect((await call("cwd=%2Fw&session=s1", { body: JSON.stringify({ command: "" }) })).status).toBe(400);
    expect((await call("cwd=%2Fw&session=s1", { body: "not json" })).status).toBe(400);
  });
});

describe("running", () => {
  test("new hosts use execute(spec).result() without calling legacy run", async () => {
    const seen: Spec[] = [];
    const ctx = ctxWith({}, seen);
    let results = 0;
    Object.assign(ctx.shell, {
      run: async () => {
        throw new Error("legacy run must not be called");
      },
      execute: async (spec: Spec) => {
        expect(spec).toBe(seen[0]);
        return {
          result: async () => {
            results++;
            return { exitCode: 7, stdout: stream("out", true), stderr: stream("err"), timedOut: false };
          },
        };
      },
    });
    const { status, json } = await call("cwd=%2Fw&session=s2", { body, ctx });
    expect(status).toBe(200);
    expect(results).toBe(1);
    expect(json).toEqual({ stdout: "out", stderr: "err", exitCode: 7, signal: null, truncated: { stdout: true, stderr: false }, timedOut: false });
    expect(seen[0]).toHaveProperty("onExpiry", "kill");
  });

  test("the command runs under the named session's policy, with the timeout", async () => {
    const seen: Spec[] = [];
    await call("cwd=%2Fw&session=s2", { body, ctx: ctxWith({}, seen) });
    expect(seen[0].sandboxPolicy).toEqual({ forSession: { id: "s2", header: { cwd: "/w" } } });
    expect(seen[0].workdir).toBe("/w");
    // The card is on the user's page waiting on a fetch, so an unbounded command is a hang.
    expect(seen[0].timeoutMs).toBeGreaterThan(0);
    expect(seen[0]).toHaveProperty("onExpiry", "kill");
  });

  // `bash()` resolves on a non-zero exit and the prompt tells the model to check `exitCode`
  // rather than catch. A 500 here would turn every failed grep into a thrown error.
  test("a non-zero exit is a 200 carrying the code", async () => {
    const { status, json } = await call("cwd=%2Fw&session=s1", { body, ctx: ctxWith({ exitCode: 1, stderr: stream("no match") }) });
    expect(status).toBe(200);
    expect(json.exitCode).toBe(1);
    expect(json.stderr).toBe("no match");
  });

  // Per stream, not merged: a card parsing stdout needs to know whether *stdout* was cut, and
  // one boolean makes a complete stdout look unreliable whenever a noisy stderr overflowed.
  test("truncation is reported per stream", async () => {
    const { json } = await call("cwd=%2Fw&session=s1", { body, ctx: ctxWith({ stdout: stream("out", false), stderr: stream("err", true) }) });
    expect(json.truncated).toEqual({ stdout: false, stderr: true });
  });

  test("a timeout is reported rather than thrown", async () => {
    const { status, json } = await call("cwd=%2Fw&session=s1", { body, ctx: ctxWith({ timedOut: true, exitCode: null }) });
    expect(status).toBe(200);
    expect(json.timedOut).toBe(true);
    expect(json.signal).toBeNull();
  });

  for (const shape of ["run", "execute"] as const) {
    for (const result of [
      { exitCode: null, signal: "SIGTERM", timedOut: false },
      { exitCode: null, signal: "SIGKILL", timedOut: true },
      { exitCode: 0, signal: null, timedOut: false },
      { exitCode: null, timedOut: true },
    ]) {
      test(`${shape} forwards the reported signal ${result.signal ?? "(none)"} with timedOut=${result.timedOut}`, async () => {
        const ctx = ctxWith(result);
        if (shape === "execute") Object.assign(ctx.shell, { execute: async () => ({ result: ctx.shell.run }) });
        const { status, json } = await call("cwd=%2Fw&session=s1", { body, ctx });
        expect(status).toBe(200);
        expect(json).toMatchObject({ exitCode: result.exitCode, signal: result.signal ?? null, timedOut: result.timedOut });
      });
    }
  }

  // A card that runs one command per keystroke has no other way to cancel, so without this a
  // fast typist leaves a queue of doomed ripgreps competing for the machine.
  test("a disconnected caller aborts the command", async () => {
    // `run` must still be in flight when the caller goes away — an instantly-resolving stub
    // finishes the whole handler before anything can disconnect, which is how the first
    // version of this test failed while the code was correct.
    const seen: Spec[] = [];
    let release!: () => void, reachedRun!: () => void;
    const started = new Promise<void>((r) => {
      reachedRun = r;
    });
    const slow = {
      ...ctxWith({}, seen),
      shell: {
        resolve: (r: Spec) => {
          seen.push(r);
          return r;
        },
        run: async () => {
          reachedRun();
          await new Promise<void>((r) => {
            release = r;
          });
          return { exitCode: 0, stdout: stream(), stderr: stream() };
        },
      },
    };
    await call("cwd=%2Fw&session=s1", {
      body,
      ctx: slow,
      started,
      onReq: (r) => {
        r.close();
        release();
      },
    });
    expect(seen[0].signal?.aborted).toBe(true);
  });

  // A destroyed response must prevent execution, not just abort it on a later close event.
  for (const shape of ["run", "execute"] as const) {
    test(`a response destroyed during body consumption starts no command (${shape})`, async () => {
      const seen: Spec[] = [];
      let executions = 0;
      const ctx: any = ctxWith({}, seen);
      ctx.shell = {
        resolve: (r: Spec) => {
          seen.push(r);
          return r;
        },
        ...(shape === "run"
          ? {
              run: async () => {
                executions++;
                return { exitCode: 0, stdout: stream(), stderr: stream() };
              },
            }
          : {
              run: async () => {
                throw new Error("legacy run must not be called");
              },
              execute: async () => {
                executions++;
                return { result: async () => ({ exitCode: 0, stdout: stream(), stderr: stream() }) };
              },
            }),
      };
      const { status, json } = await call("cwd=%2Fw&session=s1", { body, ctx, destroyDuringBody: true });
      expect(seen).toEqual([]);
      expect(executions).toBe(0);
      // Nothing is written either: the socket is gone, so there is no status to report to anyone.
      expect(status).toBe(0);
      expect(json).toBeNull();
    });
  }

  test("a shell that throws is a 500 with the message, not a crash", async () => {
    const broken = {
      ...ctxWith(),
      shell: {
        resolve: (r: Spec) => r,
        run: async () => {
          throw new Error("shell exploded");
        },
      },
    };
    const { status, json } = await call("cwd=%2Fw&session=s1", { body, ctx: broken });
    expect(status).toBe(500);
    expect(json.error).toBe("shell exploded");
  });
});

test("a session that does not own the workspace cannot run there", async () => {
  const ctx = {
    ...ctxWith(),
    sessions: {
      list: () => [
        { id: "s1", header: { cwd: "/w" } },
        { id: "s2", header: { cwd: "/elsewhere" } },
      ],
    },
  } as never;
  expect((await call("cwd=%2Fw&session=s2", { body, ctx })).status).toBe(400);
});

import { expect, test } from "bun:test";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { serveAi, serveWebSearch } from "../src/index.ts";

for (const kind of ["ai", "search"] as const) {
  for (const disconnect of [false, true]) {
    test(`${kind}: request completion keeps work alive; response disconnect=${disconnect}`, async () => {
      const started = Promise.withResolvers<AbortSignal>();
      const release = Promise.withResolvers<void>();
      const handled = Promise.withResolvers<void>();
      const provider = async (signal: AbortSignal) => {
        started.resolve(signal);
        await release.promise;
      };
      const server = createServer((req, res) => {
        const work =
          kind === "ai"
            ? serveAi(
                {
                  agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
                  llm: {
                    async *stream(options) {
                      await provider(options.signal!);
                      yield { type: "text-delta", text: "ok" };
                    },
                  },
                },
                () => new Set(["/w"]),
                req,
                res,
              )
            : serveWebSearch(
                {
                  web: {
                    async search(_options, signal) {
                      await provider(signal!);
                      return { sources: [], truncated: false };
                    },
                  },
                },
                () => new Set(["/w"]),
                req,
                res,
              );
        void work.then(() => handled.resolve(), handled.reject);
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address() as { port: number };
      const client = request({ hostname: "127.0.0.1", port: address.port, path: "/?cwd=%2Fw", method: "POST" });
      client.on("error", () => {});
      const responseDone = new Promise<void>((resolve) =>
        client.on("response", (res) => {
          res.resume();
          res.on("end", resolve);
        }),
      );
      try {
        client.end(JSON.stringify(kind === "ai" ? { prompt: "hi" } : { query: "hi" }));
        const signal = await started.promise;
        expect(signal.aborted).toBe(false);
        if (disconnect) {
          const aborted = once(signal, "abort");
          client.destroy();
          await aborted;
          expect(signal.aborted).toBe(true);
        }
        release.resolve();
        await handled.promise;
        if (!disconnect) {
          await responseDone;
          expect(signal.aborted).toBe(false);
        }
      } finally {
        release.resolve();
        client.destroy();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    });
  }

  test(`${kind}: an already destroyed response starts no provider work`, async () => {
    let calls = 0;
    const req = Object.assign(
      (async function* () {
        yield JSON.stringify({ prompt: "hi", query: "hi" });
      })(),
      { method: "POST", url: "/?cwd=%2Fw" },
    );
    const res = { destroyed: true };
    if (kind === "ai")
      await serveAi(
        {
          agentDefaultModel: { currentSelection: () => ({ provider: "p", model: "m" }) },
          llm: {
            async *stream() {
              calls++;
              yield { type: "text-delta", text: "unexpected" };
            },
          },
        },
        () => new Set(["/w"]),
        req as never,
        res as never,
      );
    else
      await serveWebSearch(
        {
          web: {
            async search() {
              calls++;
              return { sources: [], truncated: false };
            },
          },
        },
        () => new Set(["/w"]),
        req as never,
        res as never,
      );
    expect(calls).toBe(0);
  });
}

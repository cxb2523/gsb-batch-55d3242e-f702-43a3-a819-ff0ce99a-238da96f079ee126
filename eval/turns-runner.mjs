/**
 * A multi-turn headless driver: one Agent held open across many user turns.
 *
 * `@deepseek-ai/dsh-headless` creates an Agent, feeds it ONE message, and exits — which is why
 * every eval in this repo so far has measured a first turn. The design principles being tested
 * are about the SECOND clarification and the tenth, and about whether a card's own click is what
 * produced the next turn, so the agent has to stay alive between turns while something outside
 * this process renders the card, looks at it, and decides what the user does next.
 *
 * The channel is HTTP rather than stdin/stdout because dsh logs to both, and a protocol sharing a
 * stream with a logger is a protocol that breaks the first time something warns. Port 0 by
 * default; the chosen port is printed as `TURNS_PORT=<n>` on stdout for the caller to read.
 *
 * Loaded by absolute `file://` specifier from `eval/turns.patch.yml`, so it resolves its
 * `@deepseek-ai/*` imports out of this repo's own node_modules — the same ones the plugin uses.
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

export const name = "turns-runner";
export const inject = ["agentDefaultModel", "agents", "sessions"];
export const Config = z.object({});

/** Everything one turn produced, read off the session events the turn appended. */
function summarize(events, firstSeq) {
  let started = false,
    text = "",
    reason,
    tools = [];
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") {
      started = true;
      continue;
    }
    if (!started) continue;
    if (event.type === "assistant/message") {
      const joined = event.data.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (joined !== "") text = joined;
    }
    // The skill load and every file write live here, not in the reply — `skill=no` is the one
    // fact that decides whether a skill-rule measurement may use the run at all.
    if (event.type === "tool/call") tools.push(event.data?.root?.call?.name ?? event.data?.name ?? "?");
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason, tools };
}

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      try {
        resolve(raw === "" ? {} : JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

async function start(ctx, io) {
  await ctx.get("loader")?.await();
  const agents = ctx.get("agents"),
    defaultModel = ctx.get("agentDefaultModel"),
    sessions = ctx.get("sessions");
  if (agents === undefined || defaultModel === undefined || sessions === undefined) return;
  const selection = defaultModel.currentSelection();
  const { agent } = await agents.create({
    sessionId: SessionId(`session-${randomUUID()}`),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
    },
  });
  await agent.whenIdle();

  // One turn at a time. The caller is sequential by construction, but a retry that arrives while
  // the previous turn is still running would interleave two `whenIdle` waits onto one agent and
  // report the first turn's reply as the second's.
  let busy = false;
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/ready") return json(res, 200, { ok: true, session: String(agent.id), model: selection.model });
      if (req.url === "/close") {
        await sessions.flush(agent.session);
        json(res, 200, { ok: true, session: String(agent.id) });
        setTimeout(() => io.exit(0), 50);
        return;
      }
      if (req.url !== "/turn") return json(res, 404, { error: "no such route" });
      if (busy) return json(res, 409, { error: "a turn is already running" });
      const { text } = await readBody(req);
      if (typeof text !== "string" || text.trim() === "") return json(res, 400, { error: "text is required" });
      busy = true;
      const firstSeq = agent.session.seq;
      agent.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }));
      await agent.whenIdle();
      // Flush every turn, not only at /close: a run killed by the wave's overall timeout still has
      // its transcript on disk, and a partial conversation is exactly what we said we would judge.
      await sessions.flush(agent.session);
      busy = false;
      json(res, 200, summarize(agent.session.events, firstSeq));
    } catch (error) {
      busy = false;
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(Number(process.env.TURNS_PORT ?? 0), "127.0.0.1", () => {
    io.stdout.write(`TURNS_PORT=${server.address().port}\n`);
  });
}

export function apply(ctx) {
  const exit = ctx.get("appExit");
  if (exit === undefined) throw new Error("turns-runner: the launcher must provide ctx.appExit before the tree mounts");
  const io = { stdout: process.stdout, stderr: process.stderr, exit };
  start(ctx, io).catch((error) => {
    io.stderr.write(`turns-runner: ${error instanceof Error ? error.stack : String(error)}\n`);
    io.exit(1);
  });
}

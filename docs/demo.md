# 演示脚本

九步，约 6.5 分钟生成时间，配讲解适合 25 分钟的场。

这份脚本的每一条选择都能追溯到 CLAUDE.md §4.5 的实测数据——用哪个开场、
哪些提问绝对不能上台、声音步骤为什么必须排在第六位、以及时间不够时按什么顺序砍。

写它的 agent 自己列的设计约束：

- **开场用唯一有 3/3 实测记录的触发形状**（用户手里拿着一个不透明的表达式）。
  最危险的一步是第一步，所以它坐在唯一有测量支撑的触发上。
- **绝不用实测会保持散文的形状开场**：单位换算（172 字推理，"no need for tools"）、
  汇率（取数吞掉整轮）、CORS（模型读了规则、引用了、然后合理地驳回）、闭包、今天星期几、
  以及"这仓库谁写的什么"（我们不加 `Co-Authored-By`，git 分不清）。
  这些里任何一个上台都是一分钟无法挽回的冷场。
- **流式是卖点的用 inline，持久是卖点的用 canvas**。永远不要嘴上承诺"canvas 会流式"——
  观众会看到它整个一下子出现，然后觉得你在撒谎。
- **一次点击解锁整个文档的 Web Audio**，所以声音步骤排在四次点击之后，
  而且它自己的触发是一个 Play 按钮——手势就是交互本身，不是变通。
- **第 8 步故意去编辑那个状态存在 localStorage 的 canvas**，
  好让「编辑会重置 useState」这个已知问题变成笑点而不是事故。

---

=== THE RUNBOOK ===
Setting: a real repo the presenter knows, with a README that has drifted, uncommitted changes, and ≥50 commits. Terminal already at that cwd, composer at workspace-write, panel closed, theme dark. Total generation time ≈ 6.5 min across 9 steps; a 25-minute slot with talking.

1. THE SKEPTIC'S OWN QUESTION — inline, no capabilities. ~20s.
   Prompt: `这条 rsync 我一直不敢按回车：rsync -avz --delete ./dist/ deploy@box:/srv/www`
   Audience sees: the reply starts as prose, then a card grows in place — each flag on its own row with what it actually does, and a source/destination pair where the trailing slash is a toggle. Flip it and the "what ends up on the server" column re-lays out; a red band lists what `--delete` removes.
   Why it's first: this is the §4.5 fourth trigger shape (an opaque expression the user is holding, where your answer is already a table) — the only trigger with a 3/3 measured flip. A skeptic types this without being coached, and nobody in the room believes a rsync flag table was pre-built.
   Not in examples.md: it has cron / regex-on-my-logs / glob / gitignore / curl, not rsync, and none of them turns the trailing slash into the control.
   Live risk: ~5% chance the fence language comes out `tsx` instead of `ui4a/tsx` and you get a source listing (§4.5, stable across two rounds of 40). Fallback: say "there's the code it wrote — watch what happens when it lands right", retype the same prompt. It is 20 seconds, and the re-run rate is 6/6.
   Second risk: a card that never paints keeps showing its source — by design (§3.5). That is a graceful fallback, not a crash; don't apologise for it.

2. IT IS RUNNING ON YOUR MACHINE — inline + $dsh/exec. ~25s.
   Prompt: `3000 端口到底被谁占着`
   Audience sees: a small card naming the process, pid, and how long it has been up, with the exact command it ran printed under it (`lsof -nP -iTCP:3000 -sTCP:LISTEN`), and a refresh that re-runs it. The kill button does NOT kill — it hands the pid to the chat.
   The line to say: "the command is on the card, and the destructive one is the only thing it refuses to do itself." That is the consent rule from §4.5, verified head-on the day it was written — the model chose sendMessage over rm unprompted and said why.
   Timing: under a second of exec, so the whole step is model latency.
   Live risk: nothing is on 3000 and the card is empty-but-correct. Fallback: start anything on 3000 before the talk, or ask the same about a port you know is busy. Do NOT let the room see an empty card at step 2.

3. IT IS ABOUT YOUR REPO — canvas #1, $dsh/fs + $dsh/exec. ~60s. FIRST PANEL.
   Prompt: `把 README 里写的命令逐条试一遍，看哪几条现在还能跑`
   Audience sees: nothing for about a minute — narrate this, the canvas does not stream under PTC (§3.6), the panel appears whole. Then the sidebar opens with one row per fenced command in the README: green for exit 0, red with the stderr's first line, grey for anything it declines to run itself. Each row shows the command verbatim and its exit code.
   Why this one: it is the strongest argument in the deck that the card is reading THEIR world — README rot is universal and nobody's slide deck has their README in it. examples.md has git/du/rg/status/blame cards; it has nothing that treats documentation as a thing you can execute.
   Live risk A: an install or build command in the README hits the 15s kill. That is the good failure — the row says "skipped, needs your go-ahead" and you get to explain the cap and the consent split. Rehearse which row does this so you can point at it.
   Live risk B: mutating commands in the README. The prompt rule routes them through sendMessage, but do the dry run once beforehand in the same repo; if your README's first command is `rm -rf dist`, pick a different repo, not a different prompt.
   Live risk C: a package import cold-starts on esm.sh and the surface is briefly blank; GenUISurface retries three times on backoff (§4). Wait it out — say "that's it fetching a package" — do not reload.

4. THE CLICK BECOMES THE PROMPT — $dsh/chat. ~35s. NO TYPING.
   Prompt: you don't type it. Click the red row's "让 agent 修" on the canvas from step 3, and the chat shows, as the user's own message: `README 第 3 条命令 (npm run dev) 已经不对了，帮我改成现在真能跑的那条`
   Audience sees: text they didn't type appear in their transcript, then the model edit README.md, then the row go green when they hit refresh.
   The line to say: "it didn't call a hidden API. It said something as me, in my transcript, where I can see it and take it back." Measured 5/5 in §4.5 — every run sent human-readable text, none sent a JSON payload, because `ctx.conversation.send` is always visible.
   Live risk: the model fixes it wrong and the row stays red. That is fine and arguably better — reply in chat and let it try again; the round-trip is the point.

5. IT ASKS THE MODEL, NOT ITS MEMORY — inline + $dsh/ai + $dsh/chat. ~30s, streaming.
   Prompt: `这个项目该叫什么、一句话怎么介绍，多给我几个方向`
   Audience sees: THE ONLY VISIBLY STREAMING STEP. Option cards materialise one at a time, half-written fields filling in — 47 state changes over 17.5s measured on a real machine. Clicking one sends `我选 <name>` into the chat.
   Two measured rules doing work at once: "asking for a few of something is asking for more of them" (the §4.5 fix for 给我五个猫名, which produced no UI at all before it), and the enumerability rule — repo names are not a set of five, so the model calls streamText instead of hardcoding, which is exactly the failure that was 0/5 before the closed/open table went in.
   Live risk: a streamed field arrives half-formed and something throws in render. The card paints `ERROR: …` rather than going blank (§4 — empty innerText means our bug, ERROR text means the generated code's). Say so out loud and retype; the skill's every-streamed-field-is-optional rule took a repeat run clean.
   Do this before the audio step so the room has clicked several times: Web Audio is now unlocked document-wide.

6. IT MAKES A SOUND — canvas #2, $dsh/exec + Web Audio. ~60s.
   Prompt: `把这个仓库的提交历史弹给我听`
   Audience sees: one `git log --numstat` on mount, then a horizontal strip of commits, and a Play button. Each commit is a note — pitch from how many files it touched, duration from the gap to the next one, so quiet weeks are literal silence and the day of the big refactor is a chord. A cursor sweeps; the commit under it lights with its subject line.
   Why it lands: examples.md's audio entries are instruments (简谱 player, tuner, sampler, drum machine, chord explorer) — all of them are about music. This is the only one where the sound IS their data, and the reason it works on stage is that everyone's repo sounds different and slightly embarrassing.
   Audio safety: the Play button is a real gesture, and the room has clicked in steps 2–5 anyway, so the context is already unlocked. `decodeAudioData`/`OfflineAudioContext` need no gesture, so the waveform strip can draw before anyone presses anything — that is why the card looks alive while silent.
   Live risk: a canvas that awaits `ctx.resume()` before a gesture never settles and hangs on the first frame. The skill covers it (ade9df6). If the panel is inert, click Play once, and if it is still inert, move on — do not debug audio in front of a room.

7. IT PLAYS ITSELF — canvas #3, autoplay game, no capabilities. ~60s. LEAVE IT RUNNING.
   Prompt: `做个自己会下的五子棋，我想插手的时候再插手`
   Audience sees: a board that starts playing immediately, two engines, a move counter, the last move ringed. Click any empty point and you take over that colour mid-game; a Hand back button returns it. Wins/losses persist.
   Why here: it is the only step that is interesting while nobody touches it, so it is what stays on screen through Q&A. examples.md's autoplay set is Conway-from-your-file-tree, sorting race, self-solving minesweeper, auto-battler — none is a two-engine game you can interrupt, and "insert yourself into an autoplaying game" is the bit people try themselves.
   Zero-dependency by construction: no esm.sh fetch, so this is the safest generation in the deck. If step 3 or 6 misfired, this one restores confidence.
   Live risk: React error #185 from an import shadowed by the default export — compiles clean, renders a card with height and zero children (§4). Symptom is a blank board with a normal-sized frame. Fallback: retype; it is a ~1-in-many event and the rule against it is resident in the prompt.

8. IT SURVIVES BEING CHANGED — edit the live canvas. ~40s.
   Prompt: `棋盘换成暖色系，别的别动`
   Audience sees: the panel redraw in the new palette. The board position resets — and the win/loss tally does not.
   Say this deliberately, do not let it look like a bug: an edit re-reads the file, `preserveState={false}` unmounts the whole tree, and every useState goes with it. localStorage survives; useState does not (§4, and it is why the skill requires persistence — 8/19 canvases had none in round 1, 17/19 after). The moment where the score is still there after a live code change is the moment the sidebar stops looking like a chat bubble.
   Live risk: the model also "improves" something you didn't ask for. `别的别动` is in the prompt for exactly that reason. If it rewrites the engine, don't fight it — the palette still changed and the tally still survived, which is the whole point.

9. THE SESSION LOOKS AT ITSELF — canvas #4, $dsh/exec + $dsh/fs + $dsh/ai. ~60s. FINALE.
   Prompt: `把我们刚才这半小时做成一张我能发出去的东西`
   Audience sees: one card holding the whole demo — the four canvases now sitting in `.dsh/ui4a/canvases/`, each with its line count and the prompt that produced it; the README line that changed, as a real diff; the commit range touched; and one AI-written sentence about what this session was actually about. The canvas list is live from `readdir`, so it includes the card being looked at.
   Why it ends here: the last artifact of the demo is the demo. Nobody has to be told what they just saw, and the strange feeling of a card that contains itself is what they describe to whoever wasn't in the room. It is also the only step whose data cannot exist before the talk starts, which retires the "this was pre-baked" objection permanently.
   Nearest neighbour in examples.md is the CLAUDE.md-harvest card and the morning-report card; this is neither — it is scoped to one session and its subject is the cards themselves.
   Live risk: it counts a canvas that did not get written because an earlier step failed. Let it — the card being honest about a four-step session instead of a five-step one is better than a claim nobody can check.
   Close on: leave step 7 autoplaying in the panel and take questions with it moving.

WHAT I DELIBERATELY LEFT OUT

- Any step that edits a running timer or stopwatch (state reset with nothing in localStorage to save it).
- `跑一下测试` in any form — 15s kill, and the doc already got called out for promising it.
- Anything that needs a third-party chart library in the first three steps: esm.sh cold start looks exactly like broken code (§4), and you cannot afford that ambiguity early.
- Any "is this repo mine or yours" framing — measured to correctly answer "git can't tell", which is a true answer and a dead demo.
- Any single prompt carrying two payoffs. Nine steps, nine things to look at.

CONTINGENCY IF THE ROOM IS COLD ON TIME
Cut in this order: 8, then 5, then 2. Never cut 1, 3, 4, or 9 — they are the trigger proof, the it's-your-machine proof, the consent loop, and the ending.

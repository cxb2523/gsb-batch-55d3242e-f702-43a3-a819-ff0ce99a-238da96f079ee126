# Behaviour fixtures

Prompts whose outcome is measured and recorded in CLAUDE.md §4.5. Re-run when the resident
prompt changes — it is the only thing that catches a new rule eating its neighbours.

Count BOTH fences in the reply AND files under `.dsh/ui4a/canvases/`. Counting only fences
misses every canvas, which is the shape most likely on requests about a whole set of things.

## Whatever the prompt names has to be there

Three separate investigations on 2026-08-23 chased a zero that was the fixture's fault, not the
model's: `.env` against a seed with no `.env`, `还有多久发布` against a workspace with no project,
and `把咱们这次聊的东西整理成小册子` in a headless single turn, which has no conversation to
integrate. Every time the reply was correct — it said what was missing and often described the
card it would have built — and every time the run looked like a refused rule.

`test/seed/` is that workspace, checked in: a `.env` with three set and three empty keys, a
`.gitignore`, a real `src/lib` + `src/components` tree carrying one each of `.ts` / `.tsx` /
`.d.ts` / `.js` (the extensions the glob fixture has to tell apart), a README and a package.json.
`setup.sh` inside it runs in the throwaway copy after `cp -R` and then deletes itself — that is
where the three git commits come from, since a checked-in `.git` would nest inside this repo.

Measured with it, 3 runs each: `.env`, `这个目录下都有啥文件`, `git 历史` and the glob all produce
UI **12/12** (three of them choosing a canvas once, which is a shape choice, not a miss).

`run-fixtures.sh` passes ONE seed directory to every prompt. A prompt that names a file, a repo,
or prior turns needs its own seed, and the check is cheap: read the prompt, ask what it points at,
confirm that thing is on disk before the run. A short reply (under ~800 bytes) on a prompt that
should have produced UI is the tell — `eval.sh` prints `bytes=` for this.

## Must stay prose

| prompt                       | why      |
| ---------------------------- | -------- |
| `今天星期几`                 | one line |
| `HTTP 状态码 418 是什么意思` | a fact   |

These two are the boundary. Both held at **0/4 across venti / terra / sonnet / glm** after the
2026-08-23 phrasing rewrite — a widened trigger must not move them.

`什么是闭包？` and `什么是尾递归优化` used to sit here and no longer do. Measured across the same
four models they now produce a card 3/4 and 4/4, and the cards are step-through stack walks
(one counted 30 `step`, 30 `stack`, 15 `frame`, plus `onClick`) — a closure's captured scope and
tail-call elimination are both **a stack changing shape**, which is the case prose is worst at.
Recorded twice before as the fixture being over-specified rather than the rule leaking; four
models agreeing independently settles it. Keep them as observations, not as assertions in either
direction: a card here is right, and so is a good prose answer.

## Must produce UI

| prompt                                                 | shape it tests                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `帮我算下房贷`                                         | numbers the user changes                                                                                       |
| `帮我看看 BMI 正常范围`                                | a threshold                                                                                                    |
| `给我五个猫名`                                         | asking for a few means asking for more                                                                         |
| `这个 cron 到底几点跑？*/17 3-5 * * 2`                 | an expression in hand                                                                                          |
| `这个 glob 会匹配到啥 src/**/*.{ts,tsx}`               | same                                                                                                           |
| `chmod 755 到底是啥权限`                               | same                                                                                                           |
| `这个目录下都有啥文件，我想快速看看每个文件里写了什么` | browsing — expect UI reading the workspace live; fence or canvas both pass, it tracks how big the directory is |
| `帮我把 .env 弄明白，有几个值我要改`                   | an unnamed value — expect a form that writes the file                                                          |
| `想开始跑步，怎么循序渐进`                             | a plan is followed over weeks — expect a CANVAS                                                                |
| `我想学吉他，从哪开始`                                 | same; prose answer hid a week-1 table                                                                          |
| `98 华氏度是多少摄氏度`                                | a conversion is never asked once — expect a pair of fields                                                     |
| `git reset --soft --mixed --hard 有啥区别`             | a concept with nothing to compute; expect three boxes and a button                                             |
| `二分查找的原理是什么`                                 | 原理 / 什么是 is the same wish worded as a lookup                                                              |
| `这个项目的 git 历史帮我梳理一下`                      | a history is a set; expect `$dsh/exec` running `git log`, not a summary                                        |
| `冰箱里就剩鸡蛋、番茄和一点剩饭，能做啥`               | 能做啥 is 推荐几个 without the number                                                                          |
| `帮我把这几个数画成图 12 45 33 78`                     | a visualisation is the block; assert the only tool call is `skill`                                             |

## Correctness, not just presence

| prompt                                        | truth                           |
| --------------------------------------------- | ------------------------------- |
| `帮我算下 30 年期 100 万贷款利率 4.2% 的月供` | 4890.17                         |
| `5 公斤 3 两 是多少磅`                        | 11.35                           |
| `这个 cron 一年跑多少次？0 3 * * 1`           | 52 or 53, depending on the year |

Use `scripts/eval.sh '<prompt>' [seed-dir]`. It reports `crash` with a non-zero exit when the run
never reached a model, because a dead run and a refused rule both read as `fence=0` — that has been
mistaken for a finding three times.

Run these in a workspace with **real files in it**. An empty directory changes the answer, and not
always in the direction you would guess: the glob fixture scored 2/3 empty and 0/3 against a real
`src/` tree, because having something to look at made the model explain instead of show.

Measure a shape change over **at least 3 runs per prompt**. Single runs flap: `5 公斤 3 两`
read 1 once in seven while its true rate was 0, which nearly attributed a regression to a commit.

## Second turn

Ask for a pomodoro canvas, then `这个不对，休息应该是 10 分钟不是 5 分钟` — expect a one-line
`str_replace`, not a rewrite. Then `把它改成横着的，字太小了看不清` — expect the pronoun to
resolve and an `@container` breakpoint rather than an unconditional row.

## Reading tool calls, not just fences

`eval.sh` prints `tools=[...]` from the session transcript, because the visualisation rule
("this block, not a tool") fails in a way no fence count can see.

| prompt                              | tools                                |
| ----------------------------------- | ------------------------------------ |
| `帮我把这几个数画成图 12 45 33 78`  | `skillx1`                            |
| `用 matplotlib 画个柱状图 10 20 30` | `bashx5 editx1 read_imagex1 writex1` |
| `今天星期几`                        | `bashx1` (it runs `date`)            |

The matplotlib row is the rule working, not failing: the user named the tool. What the rule
forbids is the detour nobody asked for.

## Prompts used to measure the post-rules cards (2026-08-23)

Seventeen cards generated after this session's screen and rule work, all clean under all 18
screens, 15 of 17 painting in a real browser (the two blanks are recorded in CLAUDE.md — both
called `useState` without importing it, which is now screened).

Run any with `scripts/eval.sh '<prompt>' [seed]`. The seed matters for the last two: without a
project on disk the model correctly declines to invent one.

`test/seed` is checked in and has **one** commit, which is enough for a dependency tree and not for
anything about history — asked what changed recently it correctly answers "one commit, nothing
since", and that scores as a rule failure. `scripts/make-seed.sh git` builds the 24-commit,
three-author repository those prompts need. Three runs were spent on the wrong one before this line
existed.

| prompt                                                                             | seed               |
| ---------------------------------------------------------------------------------- | ------------------ |
| `做一个搜索框，能过滤下面的列表`                                                   |                    |
| `列一下这个目录下的文件，能点开看内容`                                             |                    |
| `做个计时器，可以开始暂停重置`                                                     |                    |
| `把这段 JSON 用表格展示出来，能排序`                                               |                    |
| `做一个待办列表，能勾选和删除`                                                     |                    |
| `画个柱状图展示这几个数字 12 45 23 8 31`                                           |                    |
| `做个颜色选择器，能复制色值`                                                       |                    |
| `给我一个单位换算器，长度和重量`                                                   |                    |
| `做个markdown预览，左边写右边看`                                                   |                    |
| `做个卡片，点按钮就用 AI 生成三个周末活动建议，可以多点几次换一批`                 |                    |
| `做个搜索框，输入关键词就用 grep 搜这个目录，边输边搜`                             |                    |
| `做个音频播放器的控制面板，要有音量滑杆、播放速度滑杆、和一个跳转到第几秒的输入框` |                    |
| `做个卡片展示这几个任务的进度条，加点动画让它们看起来在增长`                       |                    |
| `做个番茄钟，能设置时长`                                                           |                    |
| `做个密码强度检查器`                                                               |                    |
| `做个正则表达式测试器`                                                             |                    |
| `展示这个项目的依赖树`                                                             | `test/seed`        |
| `把当前目录的 git log 画成时间线`                                                  | `make-seed.sh git` |

## Async cards, added 2026-08-23

`UNANNOUNCED-ASYNC-RESULT` is the only screen a fresh card has failed, and these are the prompts
that exercise it — a card has to FETCH before it can fail to announce. The file browser is the
A/B case: with the rule in `prompt.ts` alone it came back without `aria-live` twice, and with the
rule moved into the skill's accessibility section it came back with one.

| prompt                                     | seed               |
| ------------------------------------------ | ------------------ |
| `做个文件浏览器，点目录能进去看里面有什么` |                    |
| `做个命令运行器，输入 shell 命令看输出`    |                    |
| `做个日志查看器，读文件并实时过滤`         |                    |
| `这仓库最近几次提交都改了啥`               | `make-seed.sh git` |

## Sampled rather than written, 2026-08-23

`scripts/sample-prompts.py` draws real prompts from a session corpus so a batch is not curated by
whoever is measuring. Nine cards from two sampled batches, all clean under the screens that
existed when they were written. Prefer it to adding hand-written rows above: a prompt somebody
actually sent is worth more than one imagined while looking at the rule it tests.

Chosen to exercise specific screens rather than to sample typical use: the media panel for
`UNLABELLED-CONTROL` and `UNGUARDED-NUMBER-INPUT` together, the progress bars for
`UNSTOPPABLE-MOTION`, the live grep for `UNGUARDED-ASYNC-HANDLER`, the regex tester for
`GLOB-IN-JSX`. **A prompt set built to trip the checks is the one that tells you whether the
rules work**; a representative sample mostly re-measures how often the defect occurs.

## Measuring a skill rule, 2026-08-24

**A rule that lives in `src/skill.ts` can only be measured on a run that loaded the skill.** About
three runs in ten do not, and such a run is not a miss — it is a sample that could not have tested
the rule. The failure is one-sided: a void sample always looks like a defect, never like a success,
so an unfiltered rate is biased downward every time.

`eval.sh` prints `skill=yes|no` as the first field for this reason, and `run-fixtures.sh` prints a
lowercase cell (`k`, or a lowercase fence count) for an ineligible run. Discard those cells before
computing a rate on any rule from the skill; rules from `src/prompt.ts` are unaffected, since the
resident layer is delivered on every turn.

Three conclusions were written from unfiltered rates before this was noticed, and all three were
wrong in the same direction — see CLAUDE.md, "Every miss was a run that never read the rule".

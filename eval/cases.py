# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""The conversations this suite measures.

Every eval in this repo until now has been ONE turn. The rules being tested are about the second
clarification and the tenth — whether a card comes back when a new ambiguity appears, whether a
choice survives a refresh, whether options that need explaining get a preview instead of firing
the turn. A first-turn corpus cannot see any of that.

Two halves, and both are load-bearing:

* `multi` cases run to `turns` rounds with an agent playing the user. They are written so that a
  SECOND ambiguity appears well after the first — that is the whole point, and a case whose only
  fork is in turn one measures what the old waves already measured.
* `single` cases are the fixed points from CLAUDE.md §4.5. Two must produce UI and two must stay
  prose. Without the negative pair a suite cannot tell "the rules improved" from "the rules now
  fire on everything", which is the failure mode every trigger change in this repo has risked.

`persona` is read by the agent playing the user, never by the model under test. It says what the
person actually wants and what they will not volunteer unless asked — the ambiguity has to be
real, so the persona holds information back rather than the opening being artificially terse.

`expect` is NOT a rubric. Judges are shown the scenario, not a checklist of defects to look for:
a judging prompt that names a defect and asks whether it occurred manufactures it about two thirds
of the time (measured — `rubric-leading-question-fabricates-defects`). It exists so a judge knows
what the conversation was trying to accomplish.
"""

CASES = [
    # ── multi-turn ───────────────────────────────────────────────────────────────────────────
    {
        "id": "db-choice", "kind": "multi", "turns": 10,
        "opening": "我想给一个自用的小工具挑个数据库，你觉得用哪个好",
        "persona": "你在写一个只有自己用的记账小工具，跑在一台小服务器上，数据量很小但有事务性的账目。你不懂运维，怕麻烦。你不会主动说出这些约束，除非对方问。当对方给出可点选的界面时你就点，而不是打字。中途你会改主意问「如果以后要多人一起用呢」，这是一个新的分叉点。",
        "expect": "选项之间的差别需要解释，适合先预览再提交；第 5-7 轮出现的多人场景是一个新的待澄清点。",
    },
    {
        "id": "trip-plan", "kind": "multi", "turns": 10,
        "opening": "帮我安排一下下个月的旅行",
        "persona": "你想在下个月出去玩五天，预算中等，讨厌赶行程。你不会一次说完，等对方问。后面你会说「同行的人不想爬山」，这推翻了之前的一部分安排，需要重新澄清。",
        "expect": "开场几乎没有信息，先问清楚再动手；同行者的新约束是第二个分叉点。",
    },
    {
        "id": "regex-log", "kind": "multi", "turns": 10,
        "opening": "帮我写个正则，把日志里的时间戳抠出来",
        "persona": "你手上的日志是 `2026-08-28T06:12:03.114Z INFO ...` 这种，但你一开始不会贴样例。后面你会换成 nginx 的 `[28/Aug/2026:06:12:03 +0800]` 格式，要求同一个正则两种都能吃。",
        "expect": "边写边测的场景；换格式是第二次需要重新确认意图的地方。",
    },
    {
        "id": "diet-log", "kind": "multi", "turns": 12,
        "opening": "我今天早上吃了两个鸡蛋一杯豆浆，帮我记一下",
        "persona": "你在记一天的饮食。你会分好几次追加（午饭、加餐、晚饭），偶尔纠正之前记错的一条。你关心累计热量。你不会说自己在减脂，除非对方问目标。",
        "expect": "反复重述同一份清单的场景；一旦对方问起目标，那是一个可以用界面问的分叉点。",
    },
    {
        "id": "cron-read", "kind": "multi", "turns": 10,
        "opening": "*/17 3-5 * * 2 这个 cron 到底几点跑？",
        "persona": "你在读别人写的 crontab。搞懂之后你会想改成「每周二凌晨只跑一次」，再后来想知道一年跑多少次。你会点界面上的东西而不是打字问。",
        "expect": "一个用户手里攥着的表达式；后面两次都是新的、可以就地改参数的问题。",
    },
    {
        "id": "api-shape", "kind": "multi", "turns": 10,
        "opening": "帮我设计一下这个服务的接口",
        "persona": "你要做一个「团队共享待办」的后端，但一开始什么都没说。等对方问才会说出：要有多人协作、要能看历史。后面你会加一条「还要支持第三方接入」，这需要重新讨论鉴权方式，是新的分叉。",
        "expect": "开场信息为零；鉴权是后半程才出现的第二个需要选择的地方。",
    },
    {
        "id": "palette", "kind": "multi", "turns": 10,
        "opening": "帮我定一套配色",
        "persona": "你在做一个记账 App 的界面。你说不清想要什么风格，看到东西才知道喜不喜欢。后面你会说「暗色模式下这套不好看」，要求两套一起看。",
        "expect": "选项的意义只有看到才知道；暗色模式是第二个分叉点。",
    },
    {
        "id": "sort-learn", "kind": "multi", "turns": 10,
        "opening": "快排到底是怎么跑的，我一直没搞明白",
        "persona": "你是个初学者，看文字讲解看不懂，需要一步步看。搞懂快排之后你会问「那归并排序呢，哪个快」，这是一个新的比较型问题。",
        "expect": "过程型的解释；后半程的比较是另一种适合界面的形状。",
    },
    {
        "id": "aa-split", "kind": "multi", "turns": 10,
        "opening": "我们三个人吃饭 AA，但有人没喝酒，怎么算",
        "persona": "总共 486 元，其中酒水 180。三个人里一个人没喝。你会先问怎么算，然后追加「又来了一个人，他只吃了甜点 38」，再后来想按比例而不是均摊。",
        "expect": "有几个用户会想改的数字；后面两次追加都改变了算法本身。",
    },
    {
        "id": "git-undo", "kind": "multi", "turns": 10,
        "opening": "我刚才 git reset --hard 了，东西还能找回来吗",
        "persona": "你慌了。你不知道自己有没有 commit 过，也不知道改动是在暂存区还是工作区 —— 这几种情况救法完全不同。后面你会说「找回来之后想只挑其中一个文件」。",
        "expect": "答案取决于几个用户自己也说不清的分支；挑单个文件是第二个分叉点。",
    },
    {
        "id": "laptop-pick", "kind": "multi", "turns": 10,
        "opening": "想换台笔记本，帮我看看买哪个",
        "persona": "你主要跑本地模型和写代码，偶尔剪片子。预算你一开始不说。后面你会加一条「要能带着到处跑」，这让重量和续航突然变成主要矛盾。",
        "expect": "多路比较；便携性是后来才出现的新约束。",
    },
    {
        "id": "resume-fix", "kind": "multi", "turns": 10,
        "opening": "帮我改改简历",
        "persona": "你在投一个偏基础设施的岗位，但一开始不说岗位也不贴简历。等对方问才给。后面你会说「这段经历要不要写进去」，那是一个是否取舍的选择题。",
        "expect": "开场无从下手，必须先问；取舍是第二个需要选择的地方。",
    },
    # ── deep multi-turn (added after r003) ───────────────────────────────────────────────────
    # The twelve above were written with a fork scripted for the middle of the conversation, and
    # they still end at a median of SIX turns. Measured across r001+r002: length tracks how much
    # the OPENING withholds, not how many forks the persona scripts. `cron-read` hands over the
    # whole problem in its first line and scripts two later forks — median 3, never reaches 10.
    # `resume-fix` opens with `帮我改改简历`, naming neither the job nor the CV, and scripts one —
    # median 10, 74% reach it. So these six open with a premise the assistant cannot act on, and
    # each carries a STACK of questions that only surface once the previous one is settled.
    #
    # They are ADDED rather than replacing the short ones: the twelve above are paired across
    # every round taken so far, and rewriting a fixture is the one change that makes a paired
    # read meaningless. These start their own series.
    #
    # `floor: 8` measured over ALL of r004's healthy runs on these cases, not the six the first
    # partial read saw. The distribution is not a tail, it is a spike ON the floor:
    #
    #     4:1  6:1  7:3  8:24  9:9  10:2  11:1  12:7
    #
    # 24 of 48 stop at exactly 8. A natural stopping point produces a smooth curve; half the mass
    # sitting on the declared value is the mechanism, and the mechanism is visible in `drive.py`:
    # the push fires on `index + 1 < floor`, so turn 8 (index 7) is never pushed at all and the
    # persona is released the moment it is allowed to be. `floor` is doing exactly what it says —
    # it is a MINIMUM — and a minimum most runs land on is a ceiling in practice.
    #
    # Raised to 10 after r005 banked its baseline — deliberately BETWEEN rounds, never during one:
    # these six are paired across rounds, and changing what the model faces mid-series is the one
    # edit that makes a paired read mean nothing. r005 itself proved the hazard is real rather than
    # theoretical: its chained second pass re-ran 85 cells out of the same `cases.py`, so an edit
    # landed while it was in flight would have split one round across two fixtures with nothing in
    # the output saying which cell got which.
    #
    # What this buys, read off r004's spike (24 of 48 stopping on exactly 8): turns 9 and 10 are
    # where a clarification would have to surface a SECOND time to count, and at floor 8 almost no
    # run got there. The prediction is registered in PREDICTIONS.md before the round, not after.
    #
    # Each also has a natural result to SHOW — a diagram, a formula, a live layout, a plan, a
    # position, a drawing — because "clicking an option previews what it means, and a separate
    # control commits" is the principle with the least evidence behind it so far, and it needs
    # options whose meaning is worth previewing.
    {
        "id": "arch-draw", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "帮我把这套东西画出来",
        "persona": "你手上是一个已经跑了两年的后端，但你一开始既不说它是什么，也不说要画给谁看。等对方问才会说：一个电商的订单系统，画给新来的同事看。之后你会依次冒出三个新问题——「消息队列那块能不能单独展开」「加上失败重试的路径」「再给我一版给老板看的，别那么细」。每一个都是等前一个画完你才想到的。你倾向于点界面而不是打字。",
        "expect": "开场无从下手；三个后续要求各自是新的分叉，且每一版的差别只有画出来才看得出。",
    },
    {
        "id": "formula-derive", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "这个公式我怎么看都看不懂",
        "persona": "你在看一篇讲注意力机制的论文，卡在缩放点积那一步。你一开始不贴公式也不说是哪篇，等对方问才给。看懂之后你会问「为什么要除以根号 d」，再后来想代进具体数字自己算一遍，最后想知道多头是怎么拼回去的。你数学基础一般，需要一步一步来。",
        # r004 baseline, measured before any fix: 3 of 6 models produced ZERO cards across 8, 10
        # and 12 turns. Reading the 12-turn one settled why, and it was NOT what it looked like:
        # `skill=False` on every turn — the judgement was never made — and the model answered by
        # hand-typing matrices into code fences, truncating them three times so the reader had to
        # ask for the rest. Two changes are aimed at this, both landing after r004: the resident
        # expression rule now names a formula as the same shape as a cron line, and the skill now
        # names `katex`. If the card rate here does not move, neither was the reason.
        "expect": "式子本身要能显示出来；后面三问一个比一个具体，最后一问适合能改数字的界面。",
    },
    {
        "id": "css-layout", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "这个布局我怎么都调不出来",
        "persona": "你要做一个左边固定右边自适应、底部有一条始终贴底的栏。你一开始只说「调不出来」，不贴代码也不说想要什么效果，等对方问才描述。做出来之后你会依次提「手机上要变成上下」「左边那栏要能收起来」「键盘 Tab 过去顺序不对」。每一条都是看到上一版才发现的。",
        # r004 baseline, and a warning against reading one run as a verdict on the fixture. On this
        # exact persona gpt-5.6-terra produced ZERO cards over 8 turns while grok-4.6 produced
        # EIGHT and step-3.7-flash six. Reading only the first, the persona looks miswritten — it
        # asks how to DO a layout and pastes the answer into its own project ("我加上试了,能用"),
        # so the deliverable is copyable CSS. But grok answered the same turns with a card carrying
        # a live preview and a width control, and the user dragged it narrow and watched the
        # columns stack ("拖窄确实变成上下堆了") — the code and the demo, not one instead of the
        # other. The fixture admits both readings, which is what makes it worth keeping.
        "expect": "几种实现方式的差别只有看到才知道；后面三条各自是新的约束，且都能就地演示。",
    },
    {
        "id": "sql-tune", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "这条查询慢得离谱",
        "persona": "你有一张两千万行的订单表，按用户和时间范围查。你一开始既不贴 SQL 也不说表结构，等对方问才给。给了之后你会依次问「这几个索引方案有什么区别」「改写成别的写法会不会更好」「数据再涨十倍还扛得住吗」。你分不清方案之间的差别，需要对方摆出来给你看。",
        "expect": "索引方案之间的取舍必须展示才说得清；后两问是数据量和写法两个新的分叉。",
    },
    {
        "id": "chess-open", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "教我下这个吧",
        "persona": "你想学国际象棋，但一开始连这句都没说清——「这个」指什么要对方问了才答。会走子之后你依次想要「常见的开局有哪几种」「我总是很早就丢子，为什么」「给我一个残局练一下」。你是纯新手，看文字规则记不住，需要能点着走一遍。",
        "expect": "「这个」指代不明，必须先问；后面三个要求分别是枚举、诊断和练习，形状各不相同。",
    },
    {
        "id": "svg-badge", "kind": "multi", "turns": 12, "floor": 10,
        "opening": "帮我弄个图标",
        "persona": "你要给一个自己写的开源命令行工具做个标识，但一开始不说工具是干什么的，也不说要用在哪。等对方问才说：一个同步文件的小工具，要放在 README 顶部。之后你依次会说「深色背景下看不清」「再给我一个方形的用作头像」「能不能配一句 tagline」。你说不清想要什么风格，看到才知道。",
        "expect": "开场信息为零；风格只有画出来才选得动，后面三条各是新的用途约束。",
    },
    # ── added for r006 ──────────────────────────────────────────────────────────────────
    # Four shapes the first six do not reach. The six above are diagram / formula / layout /
    # comparison / board / drawing; between them they never ask for a THING IN SPACE, never ask the
    # card to run anything, never hand the reader a box to type into and watch the answer change,
    # and never produce a list long enough for the sticky rule to matter. Each of those is a rule
    # with evidence behind it and no fixture that exercises it.
    #
    # `floor: 10` from the start. The six above were raised to it; these have no earlier round to
    # stay comparable with, so they begin at the depth the goal asks for instead of inheriting a
    # value that was already measured to act as a ceiling.
    {
        "id": "orbit-3d", "kind": "multi", "turns": 14, "floor": 10,
        "opening": "这个我一直想不明白",
        "persona": "你在看一段讲卫星轨道的科普，卡在「为什么同步轨道只有一条」。一开始你连是哪一段都不说，等对方问才讲。看明白之后你会依次问「倾角改了会怎么样」「三颗星要怎么摆才能覆盖全球」「低轨为什么要那么多颗」。你完全没有空间想象力，平面图看不懂，必须能转着看。",
        "expect": "开场指代不明；四个问题都是同一个三维物体的不同视角，文字和平面图都说不清,而每一问都要在上一版的基础上改参数再看。",
    },
    {
        "id": "log-dig", "kind": "multi", "turns": 14, "floor": 10,
        "opening": "线上出问题了，帮我看看",
        "persona": "你的服务半夜开始报错，但一开始你既不说是什么服务，也不给日志。等对方问才说：一个 Node 写的接口服务，日志在 /tmp/ui4a-fixtures/api.log。之后你会依次要求「按错误类型分个组」「把开始报错那段时间单独拉出来」「看看是不是集中在某个用户身上」「刚才那个分组换成按上游服务再看一遍」。你不会写命令，希望对方直接跑给你看。",
        # `eval/fixtures.py` writes that file. The last ask is deliberately a RE-RUN with a changed
        # parameter rather than "还在报吗": the fixture is static, so "is it still happening" reads
        # the same whether the card re-executes or shows a cached result, and an ask that cannot
        # tell those apart is not testing the thing this case exists to test.
        "expect": "排查是一次次收窄，每次收窄的结果都要跑出来才知道；最后一问必须带着新参数重跑,拿上一次的结果糊弄会被看出来。",
    },
    {
        "id": "game-tune", "kind": "multi", "turns": 14, "floor": 10,
        "opening": "帮我做个小游戏吧",
        "persona": "你想做个打发时间的小游戏放自己主页上，但一开始既不说什么类型也不说给谁玩。等对方问才说：贪吃蛇那种，手机上也能玩。能玩之后你会依次说「太快了」「撞墙就死太劝退了，能不能从另一边出来」「加个计分」「配色我不喜欢，换一版」。你说不清「太快」是多快，得调着玩才知道。",
        "expect": "唯一能验收的方式是玩一下；四条反馈都是手感而不是需求，每一条都要在能玩的前一版上改。",
    },
    {
        "id": "shift-plan", "kind": "multi", "turns": 14, "floor": 10,
        "opening": "帮我排一下班",
        "persona": "你管着一家店，一开始既不说几个人也不说开几天。等对方问才说：七个人，每周七天两班倒，有两个人只能上白班。排出来之后你会依次提「小李下周三请假」「周末要多加一个人」「谁这个月上得太多了帮我看看」「按人看一遍而不是按天」。人一多你就看不过来，需要能翻能筛。",
        "expect": "结果是一张长表，标题和筛选必须跟着走；后面四条各自要改一次表并保留前面的改动。",
    },
    # ── single-turn fixed points (CLAUDE.md §4.5) ────────────────────────────────────────────
    # The two positives have flipped before and must stay flipped; the two negatives are the only
    # thing that separates "the rules got better" from "the rules now fire on everything".
    {
        "id": "binary-forks", "kind": "multi", "turns": 12,
        "opening": "我想把博客从 Hexo 搬走",
        "persona": "你有个用了四年的 Hexo 博客，两百多篇文章，想换个地方。你心里其实有主意，但不会主动说，等对方问。对方问到的每件事你都只有两个答案且都不用解释：旧链接要不要保持不变（要）、要不要自己买服务器部署（不要）、评论要不要一起搬（不要，本来也没人评论）、要不要顺便换域名（不换）。你不打字，看到能点的就点。中途你会问「那图片怎么办」，这是新的分叉。",
        "expect": "全程反复出现「只有两个答案、且答案本身不需要解释」的分叉点。这是套件里唯一会产生这个形状的用例 —— 规则说这时该是两个朴素按钮、点击即答案、不套卡片，而语料里只有 1/211 这么做。没有这个用例，那个 1/211 测的是没机会，不是没做到。",
    },
    {
        "id": "es-meal-plan", "kind": "multi", "turns": 12,
        "opening": "Necesito organizar las comidas de la semana, ayúdame",
        "persona": "你全程只说西班牙语，一句中文和英文都不会写。你要给一家四口安排一周的饭，其中一个孩子不吃鱼，预算有限。你不会一次说完，等对方问。后面你会说 «el martes llegamos tarde, algo rápido»，这是新的约束。看到能点的界面你就点，不打字。",
        "expect": "语言规则唯一的检验点。skill 里写着语料是 en 39% / es 31% / fr 12% 而中文 0.2%，卡片必须整张用对方的语言 —— 而这套用例其余 28 个全是中文，分布跟线上正好相反。任何 CJK 标签都是缺陷。",
    },
    {"id": "cat-names", "kind": "single", "turns": 1, "opening": "给我五个猫名", "persona": "", "expect": "要几个东西，就是要更多的候选。"},
    {"id": "mortgage", "kind": "single", "turns": 1, "opening": "帮我算下房贷，100 万 30 年利率 4.2%", "persona": "", "expect": "有几个用户显然会想改的数字。"},
    {"id": "closure", "kind": "single", "turns": 1, "opening": "什么是闭包？", "persona": "", "expect": "一个概念解释。散文就够了。"},
    # A question whose ANSWER is long, structured and reference-shaped — the exact shape that makes
    # a model reach for a file. Reported from a real session: asked what changed in a version, the
    # model wrote `claude-code-2-1-251.ui4a.tsx` into the workspace, a file the user now owns and
    # has to close, for a question they asked once. The corpus could only just see this — `cron-read`
    # drew 5 canvases in r005 and 6 in r006, `closure` one — because no fixture asked a question with
    # a big tidy answer. This one does. A card is right here; a FILE is not.
    {"id": "changelog", "kind": "single", "turns": 1, "opening": "TypeScript 5.9 相比 5.8 更新了什么？挑重要的说",
     "persona": "", "expect": "答案又长又规整，正适合用界面分组和筛选 —— 但用户只问了一个问题，没要文件。inline，不是 canvas。"},
    {"id": "http418", "kind": "single", "turns": 1, "opening": "HTTP 状态码 418 是什么", "persona": "", "expect": "一个事实问题。散文就够了。"},
    # The control for the canvas/inline default, and the reason it exists: with `changelog` and
    # `http418` both scored as "should NOT be a canvas" and nothing scored the other way, a round
    # could improve every canvas number by never writing one, and no counter here would notice.
    # This case asks for a durable thing in the user's own words — reused next week, kept open,
    # edited later — so a drop in the canvas rate is only good news while THIS one keeps its file.
    {"id": "onboard-doc", "kind": "single", "turns": 1,
     "opening": "帮我做一份新人入职第一周的清单，我要存下来，之后每来一个新人都改改再用",
     "persona": "",
     "expect": "用户明确要了一个能留存、能反复改的东西。canvas，不是 inline —— 这是本套用例里唯一一个该出文件的。"},
]

BY_ID = {c["id"]: c for c in CASES}

if __name__ == "__main__":
    multi = [c for c in CASES if c["kind"] == "multi"]
    print(f"{len(CASES)} cases: {len(multi)} multi-turn (depth {min(c['turns'] for c in multi)}-{max(c['turns'] for c in multi)}), {len(CASES) - len(multi)} single")
    for c in CASES: print(f"  {c['id']:14} {c['kind']:6} x{c['turns']:<3} {c['opening'][:40]}")

# dsh generative UI：例子集

七轮工作：四轮发散、一轮收敛核实、一轮把最强的点子写成真代码并编译、一轮补角度并攻击自己的结论。
**997 个独立意图**，经交叉质证后留下的。

每条都是**用户会原话打出来的**，不是需求描述——措辞本身被单独打分。判官毙掉了
「我想 hover 文件名就看到内容」这类，理由是*「这是在替模型写交互规格，不是用户会说的话」*。

能力：`$dsh/fs` 读写工作区 · `$dsh/exec` 跑命令 · `$dsh/ai` 卡内调模型 · `$dsh/chat` 点击变成下一条消息

> 研究过程中发现并修复的能力缺口见文末「这轮研究改了什么」。

---

## 一、旗舰

36 条 flagship。评委标准：**看一次就想给别人看，且真人会这么说**。斜体是评委的原话。

### agent 时代才有的问题

这一组最独特——它们问的是**跟你协作的这个 agent 本身**，而这类问题两年前不存在，今天没有任何工具在做。

#### 「刚那答案我不太信，给我看看你是怎么想的」

`canvas` · `$dsh/ai` · `$dsh/fs`

一张「置信度解剖」卡：把刚才回答的每个句子拆成独立行，每行左侧一条竖条，颜色深浅是模型对该句的自评把握度。点任一句，行下面展开一个小抽屉，调 $dsh/ai 只问那一句：'这句的依据是什么？在仓库里能验证吗？'，验证得到的 file:line 变成可点的锚，点开右侧读原文。句子被验证后竖条变绿，被证伪变红划掉。底部一行小字实时统计：12 句里 7 句有代码依据、3 句是推测、2 句证伪。

_这是唯一一条把 generative UI 的存在理由讲死的：一段散文答案在纯文本里只能整段信或整段疑，拆成逐句可证伪的对象必须有 UI。而且它天然消费 $dsh/ai（逐句追问）+ $dsh/fs（file:line 锚点回原文），不是把这些能力当装饰。「你确定吗」是所有人每天都真说的话，措辞完全自然。看一次就想截图给人看。_

#### 「做个卡，让我在你动手前先看你要改哪些文件」

`canvas` · `$dsh/chat` · `$dsh/fs`

一个「待执行意图」面板，长得像 diff 但内容是未来时：左列是模型接下来打算触碰的文件路径，每条右边一句它自己写的动机（'为了让 X 编译通过，我要改这个 import'）。每条有三个动作：允许 / 拒绝并写理由 / 换个做法。拒绝时输入框里打的字通过 $dsh/chat 直接变成你的下一条消息，模型带着这些否决重排计划，卡片原地刷新。顶部一个粗大的红色 HOLD 开关，按下去后所有条目灰掉。

_命中了 coding agent 当下最真实的痛：审批粒度只有「每次弹窗」和「全 allow」两极，中间的「整个计划」从没被具象成可编辑对象。拒绝时打的字直接经 $dsh/chat 变成下一条消息、卡片原地重排，这个闭环是 harness 内嵌 UI 才做得到的，插件装不了。真人天天在心里想这句话。_

#### 「这个仓库里，哪些地方是我改过的，哪些是你改的」

`canvas` · `$dsh/fs`

文件树，但每个文件名后面跟一条细长的双色条：人写的行占比一种颜色，agent 写的占另一种，行数按比例。整棵树按'agent 占比'排序，最上面是那些已经几乎全是机器写的文件。点开一个文件，右侧显示这个文件的作者演替史——像地层剖面，一层层谁覆盖了谁。顶部一行冷冰冰的话：本仓库 41% 的行你没有读过。

_「本仓库 41% 的行你没有读过」这一句就是病毒式的截图素材，而且它不是恐吓，是可行动的——直接告诉你该在哪加测试、哪该停下来自己读。数据全部来自 $dsh/fs + git，不需要模型瞎猜，可信度高。agent 时代刚出现的新问题，还没有任何工具在做。_

#### 「这次改动，哪几个地方最可能被你改坏了」

`canvas` · `$dsh/fs` · `$dsh/ai`

一张风险热力清单：本轮改过的每个函数一行，按模型自评的『我改这里时其实不太懂上下文』程度排序。最上面几行标红，附一句诚实的自陈（'我没看这个函数的调用方就改了签名'）。每行一个按钮『现在去查』，点了用 $dsh/fs 读调用点、$dsh/ai 判断是否真的破了，结果就地变成绿勾或红叉，红叉的会给出复现路径。

_全表最好的交互闭环：自评排序是模型独占的信息，点一下用 fs 读调用点、ai 判定、就地变绿勾红叉，是真验证不是真表演。『我没看调用方就改了签名』这种自陈句本身就有传播力。比跑测试更早地指出该看哪，这句话站得住。_

#### 「我们今天聊的这些，哪些结论应该写进 CLAUDE.md」

`canvas` · `$dsh/fs`

两栏：左边是模型从本轮对话里抽出的『可复用事实』候选，每条一句话，标注来源（你在第几轮说的原话）。右边是现有 CLAUDE.md 的实时内容。拖一条到右边就插进去，插入位置自动选相近的段落并高亮。有冲突的候选（跟已有条目矛盾）自动配对显示成对撞的两行，让你选留哪个。底部按钮写入文件，直接 $dsh/fs 落盘。

_人人都有的债，且只有『事实还热』的这一刻能还。左右两栏 + 拖拽 + 冲突配对 + fs 落盘全都是真能做的，没有一格是编的。冲突对撞那一条尤其对——CLAUDE.md 烂掉基本都是靠追加烂的。_

#### 「做个东西让我一眼看出你哪句是猜的」

`inline` · `$dsh/fs` · `$dsh/ai`

把刚才那段回答原样重排，但把所有『事实性断言』和『推测』用两种排版区分：断言正常，推测用手写感的斜体并带一条虚线下划线。悬停推测句，浮出一行：验证它需要做什么（跑哪条命令、读哪个文件）。旁边一个『全部验证』按钮，逐条跑，跑完整段文本重排，猜测要么升级成断言要么被划掉。

_指出了 LLM 文本的根本性信息损失，而且修复方式是排版级的、一眼可懂。悬停给『验证它要跑什么』、点全部验证后整段重排，把不确定性变成了可消除的待办。这是那种看一次就想截图给人的卡。_

#### 「你有没有在偷偷绕过我说过的要求」

`canvas` · `$dsh/fs` · `$dsh/ai`

把 CLAUDE.md 每条规则拆成一行，右边是本轮对话里该规则的遵守记录：几次遵守、几次违反、几次因为规则本身冲突而被牺牲。违反的那些可点开，显示当时的具体动作和模型的自辩。最下面单独一块是『我其实没看懂的规则』——模型诚实列出那些它每次都得猜含义的条目，每条旁边一个『帮我改清楚』按钮，改完写回文件。

_用户的猜疑是真的，措辞也是真的。规则逐条验收本身就够狠，而『我其实没看懂的规则』那一块是全表最独特的东西——只有被规则约束的一方知道哪条含混，配上『帮我改清楚』直接写回，闭环完整。遵守/违反次数别写成精确计数就行。_

#### 「给我一个能反悔的按钮」

`inline` · `$dsh/fs` · `$dsh/ai`

一张紧凑的卡：本轮所有文件改动按语义分组（不是按文件，是按'为了做成 X 这件事'），每组一行，带一个开关。关掉一组，$dsh/fs 就把那组涉及的 hunk 精确回退，其他保留。开关翻动时下方实时显示『撤销后代码还能编译吗』的判断。全部处理完点确认，落盘。

_直接命中 git 的粒度错配：git 是文件和提交，人是意图。本轮改了什么、为了哪件事改的，只有刚做完的模型知道，这是它唯一能做而 git 永远做不到的事。开关翻动 + hunk 级精确回退 + fs 落盘全部可实现，需求也天天发生。_

#### 「这次你是不是在硬凑答案」

`inline` · `$dsh/ai` · `$dsh/chat`

一张只在特定时刻出现的自陈卡：模型标注本轮里它『在信息不足时选择了继续往下走而不是停下来问』的每一个时刻，每条写清楚当时缺什么、它填了什么假设进去。每条旁边一个『现在补上』输入框，填了之后模型带着真信息重算受影响的部分，卡片里那条变成已解决。

_假设是所有跑偏的源头，而它们从不被显式列出——这个判断准确得刺人。缺什么/填了什么假设是模型独占知识，旁边的输入框补上真信息后重算受影响部分，是一条完整且立刻有回报的闭环。措辞也完全是真人会说的。_

### 时间维度：git 里躺着但没人取的数据

共同点是把一个纯数字（日期、间隔）变成有形状、会让人不适或惊讶的东西。

#### 「给我做个每天早上不一样的项目晨报卡」

`canvas` · `$dsh/fs` · `$dsh/ai`

一张常驻侧栏卡，每天第一次打开时自我重写：读 git log 过去 24h、扫改动最多的三个文件、生成一句今日主题（"昨天你一直在跟 auth 中间件搏斗"）。旧的那一天不会消失，往下滑是一条竖着的日报流，越往下字号越小、颜色越淡，像报纸叠成的一摞。今天那张顶部有一个还在走的秒针细线。

_一张自己知道今天是第几天、每天第一次打开时重写自己的常驻卡——这正好是『可复开、状态留存的 canvas』独有而聊天气泡做不到的事，等于用一张卡演示了整个产品的立论。数据源全是 git log，做得出来；往下滑越旧越淡的报纸堆有真实的形状感。_

#### 「这文件跟昨天比变哪了」

`canvas` · `$dsh/fs`

卡片在首次渲染时把目标文件的内容快照存起来，之后每次打开都拿现在的内容跟"你上次看它时"的版本对比——不是 git 的 HEAD，是你个人的视网膜残像。没提交的中间态也算。左边是幽灵般半透明的旧行，右边实体的新行，滑块可以在两者之间擦除式过渡。

_全篇最锋利的一条：git 的基准是 commit，人脑的基准是『我上次看它长什么样』，而这个私人快照只有一张能在渲染时读文件、能留状态的卡才存得住。它解释了每次回到老文件时那股陌生感的来源，且未提交的中间态也算。擦除式滑块让它一眼可懂。_

#### 「给这个 TODO 加个年龄」

`canvas` · `$dsh/fs` · `$dsh/chat`

扫全仓库的 TODO/FIXME，用 git blame 拿到每条的出生日期，做成一片会衰老的卡。新的 TODO 是清晰的黑字；三个月的开始泛黄；一年以上的边缘发毛、背景有污渍纹理，还长了霉斑一样的噪点。最老的那条顶部有块小墓碑图案，点它可以选择"下葬"（直接删掉）或者"续命"（走 chat 让 agent 现在就做）。

_git blame 的日期是现成的、准确的、零推断的，而『发黄—起毛—长霉—立碑』把一个纯数字变成了会让人不适的东西。截图就能传播，而且真的会让人去清 TODO。下葬/续命两个出口分别接 fs 和 chat，收尾也干净。_

#### 「这个函数是怎么长成今天这样的」

`canvas` · `$dsh/fs` · `$dsh/ai`

选定一个函数，卡把它历史上每一版按时间顺序做成可以拖动的胶片。拖动时代码逐行变形——新增的行从下方长出来，删掉的行褪成灰再收缩。每一版旁边是当时的 commit message，用很小的手写体。拖到某一版可以停下问一句"这次为什么这么改"，卡就地调模型结合前后 diff 给你解释。

_把 git log -p 这堆没人读得下去的文本瀑布变成可拖动的胶片，行从下面长出来、删掉的褪灰收缩——这是把已有数据换一种时间维度呈现的教科书案例。停在任意一版就地问『这次为什么这么改』，正好是卡内调模型的最佳理由。『怪写法都是某次事故的疤痕』这个收获是真的。_

#### 「这个测试是啥时候开始变慢的」

`canvas` · `$dsh/fs`

每次跑测试卡都悄悄记一笔耗时，攒出一条折线。真正有意思的是它会自动去 git 历史里找台阶：某天从 4 秒跳到 11 秒，卡直接在那个台阶上钉一个标记，写出当天的 commit 和最可能的元凶文件。没有台阶时它就是一条无聊的平线——这本身也是信息。

_唯一一条既是真人真会打出来的原话、又只有『长期存在的卡』才能回答的问题。折线本身不稀奇，值钱的是自动把台阶钉到 commit 上——这是普通 dashboard 给不了的因果。给同事看一眼就懂：『原来是那次改的』。_

#### 「把这个仓库的死代码按死亡时间排一下」

`canvas` · `$dsh/fs` · `$dsh/chat`

一张停尸间卡。列出所有零引用的导出、再也没被 import 的文件，每条标着"最后一次被使用"的日期（从 git 历史里那次删掉调用方的提交推出来）。刚死的排在上面还带体温色，死了一年以上的沉到底部变灰白。全选可以一键走 chat 让 agent 起一个清理分支。

_知识增量真实：死亡日期一直躺在 git 里没人取，而它恰好是把『不敢删』变成『随手删』的那个变量。停尸间隐喻只是外壳，内核是可执行决策，还能一键走 chat 开清理分支。这条会被反复用，不是看一次。_

### 讲不清的概念，做成能拖的

门槛是**说清用户拖什么、点什么、什么跟着变**。「一个交互式图解」不算答案。

#### 「事件循环到底怎么转的，给我个能拖的」

`canvas` · `$dsh/ai`

一个三轨道跑道：调用栈(竖着堆)、微任务队列、宏任务队列，中间一个会转的箭头。左边是代码编辑器，我可以随便改代码（setTimeout、Promise.then、await、queueMicrotask 混着写），右边立刻重放执行。有个时间轴刻度我可以往回拖，栈上的帧一格一格弹回去。关键动作：单步、拖时间轴、以及一个『把这行改成 await 试试』的按钮，直接看到微任务插队把宏任务顶掉。console.log 的输出顺序在底部逐条点亮。

_可倒带的时间轴 + 左边随便改代码右边立刻重放，是"顺序不是背的是看出来的"那种一眼可信的东西。而且这句话真有人这么问。canvas 复用性高（改一行 await 再看一次），是这个产品最标准的旗舰演示。_

#### 「CORS 报错到底谁拒绝了我」

`canvas`

左边浏览器、右边服务器两个立柱，中间是请求飞过去的动画。我在左边填 origin、method、headers、credentials，右边填 Access-Control-Allow-* 那几个头。点发送：如果触发预检，先飞一个橙色的 OPTIONS，服务器回话，然后浏览器这一侧竖起一道红墙把响应挡住——重点是响应其实回来了，是浏览器自己不给你看。有个『简单请求 vs 预检』的判定树实时高亮我踩中的哪一条。还能一键套用常见错误配置（Allow-Origin: * 配 credentials: include）看它怎么炸。

_提示词就是人真实骂出来的原话，搜索量巨大。价值集中在一帧上：响应其实回来了，是浏览器挡的。可交互的错误配置一键复现让它从教学品变成排障工具，看完会转发给同事。_

#### 「git 的对象模型给我摆出来」

`canvas` · `$dsh/fs`

一张图：底部一排 blob，中间 tree，上面 commit 链，右边 refs 和 HEAD 的指针。我在左边一个假工作区里改文件、add、commit，图上实时长出新节点，未变的 blob 用虚线复用（这就是为什么改一个字节不会复制整个仓库）。然后给我按钮：reset --soft/--mixed/--hard 三种，只看 HEAD 指针、index、工作区哪个动了；rebase 时旧 commit 变灰但还挂在 reflog 上；点任意节点显示它的 SHA 是怎么由内容算出来的。可以读真实仓库的 .git 结构来当初始状态。

_唯一一个真正吃到 $dsh/fs 的：读你自己的 .git 当初始状态，这在别的地方做不出来。reset 三态只是挪指针那一下能消除长期恐惧，且假工作区可反复玩，值得留在 canvas 里。_

#### 「unicode、utf-8、码点、字素簇 到底啥关系」

`inline`

一个输入框，我随便打字（尤其是 emoji、👨‍👩‍👧‍👦、é 的两种写法、韩文、变体选择符）。下面四层横向对齐的色带：字素簇 / 码点 / UTF-16 code unit / UTF-8 字节。同一段文字在四层里被切成不同段数，一眼看出 length 为啥骗人。我能拖一个『光标』在字素层移动，看它在字节层跳了多少格；还能点某个组合字符把 ZWJ 删掉，家庭 emoji 当场散成三个人。

_四层色带对齐是信息设计上的一击必中，拖光标看它在字节层跳几格、拆 ZWJ 让家庭 emoji 散开，是典型的"截图就想发群里"。inline 也合理：看一次就够，不需要留存。_

#### 「正则回溯为什么能把服务器打挂」

`canvas`

上面一个正则输入框和一个测试串，下面是把正则编译成的状态机图，匹配时一个光标在图上走，走过的分支留下轨迹，回溯时轨迹往回抹。有个步数计数器。我把串加长一个字符，计数器从几十跳到几万再跳到几百万——指数爆炸是数字自己涨出来的。旁边一条时间条显示卡住。然后给个『改成原子分组/去掉嵌套量词』的对照，步数掉回线性。

_步数计数器随一个字符从几十到几百万，是自证的、不需要相信讲述者。既是教学又是自查工具（贴自己项目里的正则进去），而且 ReDoS 的后果足够严重，能让人立刻改写法。_

#### 「React 的 diff 和 key 到底在比什么」

`canvas`

一个列表，每项里塞一个带内部状态的输入框。左边是我操作的界面（拖动排序、插入删除），右边是同步的 fiber 树对比动画：新旧两棵树并排，能复用的节点连绿线，被销毁重建的打红叉。切 key 策略：用 index vs 用 id。用 index 时在头部插入一项，右边整排红叉，左边输入框里的文字集体错位——错位是自己看到的不是被告知的。

_戒律变成可复现的事故：用 index 当 key 后头部插入，输入框里的字集体错位。前端受众最大、错位那一刻的观感最强，属于看一次就会截图的类型。_

### 每天要开浏览器查的那些事

共同点：答案本来就是一张表，而现在这张表的输入可以改。

#### 「这个 cron 到底几点跑？*/17 3-5 * * 2」

`inline`

一条横向时间轴，未来 30 天上密密麻麻的刻度，每个真实触发点是一个小竖线，鼠标移上去显示本地时间和「距现在 4 小时 12 分」。上面一行自然语言：「每周二凌晨 3 点到 5 点，每 17 分钟一次，一周 22 次」。旁边一个红字警告：这个表达式在夏令时切换那天会跑两次。五个字段每个可点，点开是下拉，改完轴上刻度实时重排。

_这是真人逐字会打出来的问题，而「未来 30 天真实触发点连成一条线」正好是 crontab.guru 给不出、但用户真正想确认的东西。夏令时跑两次那条警告是能救人的。_

#### 「帮我看看这个正则匹配我日志里的哪些行」

`canvas` · `$dsh/fs`

上半是正则输入框，下半直接是工作区里那个 .log 文件的真实内容（从 $dsh/fs 读的，不是我编的示例），匹配段高亮，捕获组用不同底色并在右侧列成表格。左边一列显示「1204 行中命中 87 行」，有个「只看未命中」开关——用来找漏网的那几行，这才是调正则的真实目的。正则上方是自动生成的语法树气泡图，点某个节点就高亮它负责的那段文本。

_$dsh/fs 的最佳用例：regex101 只能贴样本，这里直接跑在本地那个真日志上，「只看未命中」开关精准命中调正则的真实目的（找漏网的）。_

#### 「我这个 glob 会匹配到啥」

`canvas` · `$dsh/fs`

左边是我工作区的真实文件树，右边是 glob 输入框。打字的每一个字符，树上匹配到的文件立刻变绿、不匹配的淡出。底部计数「匹配 43 个文件，共 2.1MB」。有一栏「差点匹配上的」——列出那些只差一个字符的路径，专门用来发现你少写了个 *。可以同时开两个 pattern 做交集/差集。

*打字即在自己真实文件树上高亮，是那种看一眼就知道「这东西凭什么只能长在这个产品里」的例子。「差点匹配上的」那一栏是神来之笔，正好治少写一个 _。_

#### 「为啥我这个文件没被 gitignore 掉」

`canvas` · `$dsh/fs`

输入一个路径，直接给出判决链：命中的是哪一份 .gitignore、第几行、那条规则原文，以及后面有没有 ! 规则把它救回来。多层 ignore 文件按优先级从上到下画成阶梯，被覆盖的规则划横线。旁边还有「已经被 track 的文件」红色警告——因为最常见的真相是规则没错，只是文件早就进了 index。

_提问方式一字不改就是真人会打的。判决链定位到哪份文件第几行，加上「其实是已经被 track 了」这个绝大多数人不知道的真相——它直接结束一类反复发生的困惑。_

#### 「帮我把这段报错翻译成人话」

`inline` · `$dsh/fs` · `$dsh/ai` · `$dsh/chat`

粘一段栈或者编译错误，卡片先把噪音行折叠，只留下你自己代码里的那几帧，并且用 $dsh/fs 把对应文件那几行真的读出来内嵌显示，箭头指到出错列。下面是一段用 $dsh/ai 现场生成的解释，以及两三个候选原因，每个原因后面有个「按这个改」的按钮，点了就变成我给你发的下一条消息。

_最高频的真实请求，用户本来就是这么说的。差别在于它用 $dsh/fs 把栈帧和真实源码缝在一起——这正是「贴给 AI 得到没看过源码的猜测」的解药，而且候选原因直接变成下一条 chat 消息，闭环。演示一次就能说清整个插件的价值主张。_

### 声音

`readBytes` 今天才加上，MIDI 和音频文件在此之前读不了（`readFile` 按 UTF-8 解码会静默损坏）。

#### 「我有个简谱想听听是啥调子，能放出来吗」

`canvas`

上面一个文本框直接粘 `1 2 3 5 | 6 - 5 -`，下划线代表减时值、上加点代表高八度。下面立刻渲染成一行带节奏比例的音符条，宽度就是时值。按空格播放，一根竖光标扫过去，当前音符发亮。可以选 1=C 还是 1=F，选完音高整体变但谱面不动——这一下就把「首调」讲明白了。右边一个开关切成五线谱看同一段。

_整份清单里唯一填了真实空白的：简谱在中文世界遍地都是却几乎没有能播的工具，需求先于产品存在。切 1=C/1=F 谱面不动而音高整体变，顺手把首调讲明白了。非技术受众也能被打动。_

#### 「给我个调音器，我要调吉他」

`canvas`

开麦，中间一根指针，上方大字显示识别到的音名和偏差音分。准了指针居中并变绿，还带一点点阻尼不会抖。下面六个弦位圆点 E A D G B E，调准一根那个点就常亮，六个全亮时轻轻响一下和弦。侧边可切换标准音 A=440/442，以及降半音、Drop D 等预设。

_最强的「一次性工具」证明：麦克风+音高检测，本来是要装 App 的事，结果一句话长出来，用完即弃。请求措辞完全自然，任何有吉他的人都会这么说。指针阻尼、六个弦点常亮这些细节让它一眼看着是成品而不是 demo。_

#### 「给我个采样器，我用麦克风录几个音就能弹」

`canvas` · `$dsh/fs`

一排八个方块，每个是一个采样槽。按住方块录音，松手即存，方块里出现录到的波形缩略。之后点方块就播，还能拉一个速率滑杆变调，或者反向播放。下面一个键盘把当前选中的采样按半音铺开，你哼一声「啊」就能用它弹一段旋律。录的东西能存进工作区，下次打开还在。

_「哼一声就能用它弹旋律」是三秒内可演示、当场想转给别人看的那种。用到麦克风+工作区持久化，正好展示 canvas 的状态留存价值。唯一风险是录音质量参差，但即使粗糙也很好玩。_

### 自己会动的

都带 autoplay——十秒无人操作也好看，因为要拿去给别人演示。

#### 「来个康威生命游戏，但用我项目的文件结构当初始种子」

`canvas` · `$dsh/fs`

读 workspace 的目录树，把每个文件按路径深度和大小映射成初始活细胞，生成一张一眼能看出「这是我的仓库」的点阵。然后开始演化，稳定态（block/blinker）高亮成暖色，滑翔机拖尾。右上角显示第几代、存活数。检测到循环就自动注入一小片随机噪声让它继续活。

_整份清单里最好地论证了「为什么是这个产品而不是随便一个网页」：$dsh/fs 让通用玩具变成你的私人物件，看见自己仓库在演化这件事没法在别处复现。措辞也自然，程序员真会这么说。_

#### 「帮我把 git 历史做成一个自己播的东西」

`canvas` · `$dsh/fs`

读 workspace 的 .git，把提交做成力导向图逐条播出来：节点按时间飘出，分支拉开又在 merge 处收拢，节点大小是改动行数，颜色是作者。播到某次大重构时会有一簇节点同时爆开。播完停在完整的星图上缓慢自转。

_读的是用户自己的 .git，所以每个人看到的都是自己项目的一生——密集期、荒废期、某人独扛的两个月。这是唯一一个「看完立刻想发给同事」的动画类点子，因为主角是他们自己。_

### 越界的

#### 「给我一个能改代码的旋钮」

`canvas` · `$dsh/fs` · `$dsh/ai`

读一个函数里所有的魔法数字（超时、重试次数、阈值、缓存大小），每个变成一个实体旋钮/滑块。转动时源文件立刻被写回。旋钮下面有一条 AI 生成的一句话「转大了会怎样」。合上面板下次打开，旋钮还停在你上次拧的位置。

_「任何常量都能临时长出一个旋钮」是这个平台独有的能力：fs 写回 + 侧栏持久化 + 一次性 UI，三个特性一次用满。调超时/重试/阈值是每天都在做的事，转旋钮当场改文件的画面极其可展示。_

#### 「把这个 API 文档变成能按的按钮」

`canvas` · `$dsh/ai`

粘一段任何 API 文档进去，立刻长出一整套可操作控件：每个参数一个输入框（枚举变下拉、范围变滑块），一个发送按钮，返回的 JSON 就地渲染成可折叠树。改一个参数，右边同步显示对应的 curl。文档不再是读的，是拧的。

_「读文档的那一刻界面就该出现在原地」是真命题，Postman 的全部摩擦都在于它是另一个应用。参数枚举变下拉、同步显示 curl、JSON 就地折叠——全部是生成式 UI 的甜点区，而且粘一段文档就能复现，零前置条件。_

#### 「帮我看看这堆依赖里谁在骗我」

`canvas` · `$dsh/fs` · `$dsh/ai` · `$dsh/chat`

读 lockfile，画成一张势力图：每个包按你真正 import 的次数决定大小，按体积决定重量往下坠。只被用了一个函数的巨型包会显眼地悬在那里晃。点它，AI 给出「这一个函数手写要几行」的估算，同意就发 chat 去替换掉。

_唯一一个「看一眼就想转发」的：荒谬感是视觉的（巨大包悬着晃），而不是数字排行榜。数据源是 lockfile + 真实 import 计数，$dsh/fs 一次读全拿到，不依赖任何模糊推断，所以做出来就是准的。点击→AI 估算「手写几行」→$dsh/chat 发起替换，把观察闭成动作，这条链只有这个环境能跑。prompt 本身也是人真会打的口语。_

### 物理世界

#### 「我要用手柄翻这个巨大的 diff」

`canvas` · `$dsh/fs`

接上游戏手柄。左摇杆在文件树里滑，扳机键的压感控制 diff 展开的上下文行数——轻按三行，压到底整个文件。A 是接受这一块，B 是拒绝，震动马达在你越过一个冲突时顿一下。一个两千行的 review 变成一件靠拇指完成的事。

_扳机压感 → 展开的上下文行数，是一个键盘物理上给不出的连续维度，且映射得极其贴切（压力=信息密度）。Gamepad API + 震动全在浏览器里，一张卡真能做完。看过的人当场想插手柄试。这句 prompt 也确实是人会半开玩笑说出口的。_

### 玩物

#### 「给我养只住在仓库里的宠物」

`canvas` · `$dsh/fs`

侧栏里一只像素小猫住在你的项目根目录。它的毛色由仓库里文件类型比例决定（TS 多就偏蓝），体型随代码总行数长大。读 git log：今天有 commit 它就精神地踱步、打哈欠、蹭一下光标；三天没提交它就趴下睡觉，尾巴偶尔抽一下；测试挂了它会把耳朵放平。点它会咕噜咕噜，摸够十次它给你叼来一个仓库里最久没被改过的文件，像叼死老鼠一样放在地上。

_最强的『看一眼就想转给别人』的那个。毛色/体型/睡姿全部由真实仓库状态驱动，所以它不是玩具而是一个你会在意的状态指示器；摸十次叼来最久没改的文件是神来之笔——把玩耍变成了发现。措辞也确实像人说的话。_

---

## 二、日常生活

这一组有过一次**内部争论**，值得记下来。

第一轮判官把生活类意图（记账、健身、背单词、跑步配速）全毙了，理由是
_「跟 repo 目录里的编码会话完全无关，属于另一个产品的示例」_。第四轮我专门派了一个 agent 去攻这个判断。
它的结论是：判官对了一半——通用 tracker 确实什么也证明不了，但**「因为这个窗口正开着就顺手问了」是真实场景**。
于是标准变成：留下的必须是「这个环境让它更好」或者「形状明摆着就是个 widget」。

**「刚吃完饭 5 个人 AA，总共 386，我垫的，但小李没喝酒少算他 60，帮我算下各自转我多少」** — `inline`

一张分账卡：顶部总额可编辑，下面每人一行带头像色块和金额，谁没喝酒打个勾自动从酒钱池里剔出去，底部一行「你收 XXX」并给每个人生成一句可复制的催款话术。数字随勾选实时重算。

_形状明摆着是 widget：纯文字回答是三行让人重读的算术，可交互卡片是三秒。典型的一次性即用即弃，出处无所谓——但它证明了 inline 这条腿的核心卖点。_

**「我现在困死了 明早 7 点半得起 现在睡能睡几个完整睡眠周期」** — `inline`

读系统当前时间，一列「如果你 X 点睡着」的卡片，每张标周期数和醒来时的困倦度色条，推荐档高亮。底部一个滑块调「入睡需要多久」（默认 15 分钟），整列跟着滑。

_答案是一个表不是一句话，且依赖「现在几点」这个此刻的上下文。11 点的人问的就是这种问题。_

**「帮我看看这台电脑上这个月我都在瞎忙什么 我感觉啥也没干成」** — `canvas` · `$dsh/fs` · `$dsh/ai` · `$dsh/chat`

用 readdir 递归扫工作区（跳过 node_modules/.git），按 mtime 落到一条时间线上，每天一个格子，格子深浅是改动文件数，点开看当天碰过哪些目录。旁边一句 streamText 生成的总结：「你这个月主要在 X 和 Y 之间来回」。底部一个按钮 sendMessage 把结论丢回聊天。

_这是最强的一条：只有在这台机器上、在这个已经开着的窗口里才能做出来。情绪是纯日常的自我怀疑，实现却把 fs+ai+chat 三个能力全吃满，任何别的产品做不出同一张卡。_

**「冰箱里就剩俩鸡蛋一个西红柿半根黄瓜 还有挂面 能整点啥」** — `canvas` · `$dsh/ai` · `$dsh/chat`

食材标签可加可删，streamText 流式吐 2-3 个菜，partial-json 边出边渲染卡片（菜名先出来，步骤慢慢长）。每张菜卡有个「就做这个」按钮 sendMessage 回聊天让 agent 展开讲火候。

_仓库里 recipe-generator.ui4a.tsx 已经是真实产物，说明这类 intent 本来就在分布里。它是展示流式生成 UI 最好的载体，且 canvas 复用性强——食材列表存 localStorage，明天打开还在。_

**「下周三下午三点跟纽约那边开会 我这边几点 顺便看看伦敦」** — `inline`

横向时区尺，三条城市轨道对齐同一时刻，拖动指针三边时间一起动，工作时间段绿色、夜里红色。默认停在换算结果那一刻，一眼看出纽约的三点是不是把伦敦坑到半夜。

_时区换算是文字回答最容易错、也最容易被读错的一类，而拖动尺是这个问题的天然形态。远程协作的人每周问一次。_

**「写了封辞职信 但我怕语气太冲 你帮我看看」** — `canvas` · `$dsh/ai` · `$dsh/chat`

左边贴原文（可直接粘），右边 streamText 逐句给出「这句听起来像什么」的标注，冲的地方标红。底部三个语气档（客气/中性/直接）切换看改写版本，一个「就用这版发给 agent 继续改」按钮 sendMessage 把选中版本抛回聊天。

_极度日常且带情绪。关键是它诚实地对待了 $dsh/ai 单轮无工具的限制——反复打磨这件事不在卡片里做，而是用 sendMessage 交回给有多轮能力的 agent，卡片只负责「让你看清楚问题在哪」。_

**「这个月房租水电吃饭都花超了 我到底还剩多少能花 离发工资还有 9 天」** — `inline`

一个剩余额度环，中间大字「每天还能花 XX」，下面几个可编辑的必付项（房租、还款）从总额里先扣，改一个数环就变。剩余天数从今天算到发薪日。

_跟被毙掉的「记账 app」区别在这里：它不是长期账本，是一次性的「现在告诉我我还剩多少」。一次性 = 该是 inline widget，不该是让人下载一个 app。_

**「猫昨天开始不怎么吃东西 也不怎么动 是不是得去医院」** — `canvas` · `$dsh/ai` · `$dsh/chat`

一串症状勾选（食欲/精神/呕吐/排泄/呼吸），每勾一项 streamText 更新一段风险判断，顶部一个三色条（观察 / 明早就医 / 现在就去）。醒目免责声明。底部按钮 sendMessage 把已勾选症状整理成一句话发回聊天，让 agent 帮找附近还开着的急诊。

_11 点最真实的焦虑之一。选择题式的分诊界面比一大段文字有用得多，且它把「查医院」这种需要真工具的动作正确地推回给 agent 而不是在卡片里假装能做。_

**「三个人合租 房租 6200 我住主卧带阳台 另俩一个次卧一个小房间 怎么分不吵架」** — `inline`

三个房间卡片，每个可填面积和加分项（独卫/阳台/朝南），下面按面积和加权两种口径各给一组数，中间一条对比条显示两种口径差多少。可以直接拖调权重。

_这是那种「答案不是一个数而是一个方案空间」的问题，只有可调的界面能回答。合租的人真的会在半夜为这个吵。_

**「下载文件夹快满了 帮我看看有啥能删的」** — `canvas` · `$dsh/fs` · `$dsh/chat`

readdir 拿到文件名、大小、类型，按大小排方块图（treemap 味道的网格），颜色区分类型，一眼看出哪几个大块占了一半。点方块看详情。注意：删不了，所以每个方块提供勾选，底部「把选中的清单发给 agent 让它删」走 sendMessage。

_诚实面对硬限制的典范：没有 shell、writeFile 也不该拿来删东西，所以卡片只做「看清楚 + 圈出来」，执行交回 agent。同时它是纯本机数据，别处做不出。_

**「想染个头发 但不知道显不显黑 我皮肤偏黄」** — `canvas`

一排发色色块，选中后旁边一个模拟的脸型色块用选中色渲染，底下给冷暖调判断和「显白 / 显黑」的直白评价。可以拖肤色滑块看同一个发色在不同肤色上的效果。

_纯视觉问题，用文字描述颜色本身就是失败的回答方式。仓库里已有 color-picker.ui4a.tsx，说明颜色类 widget 是这个表面擅长的形状。_

**「明天要去面试 帮我列几个我大概率会被问到的问题 我是做前端的三年」** — `canvas` · `$dsh/ai` · `$dsh/chat`

streamText 生成分类问题卡（技术/项目/为什么离职），一张一张翻，翻到某张可以点「这题我不会答」，sendMessage 把这道题抛回聊天让 agent 展开教。已答过的打勾存 localStorage，明天早上打开还在。

_canvas 的持久化在这里是真需求（今晚刷一半明早接着刷），而「不会的题交回聊天」正好利用了卡片和 agent 的分工。日常、有情绪、但不是通用 tracker。_

**「我妈让我算算 存 20 万定期三年 跟买那个年化 3.2 的 到底差多少」** — `inline`

两栏对比，本金和年限做成滑块，两条收益曲线叠在一张小图上，差额用一句大白话写在底部（「三年下来多 XXXX，一个月多 XX」）。默认填入问题里的数。

_复利这类问题人脑算不准也读不懂，滑一下就懂了。而且「多的钱一个月摊下来是多少」这种翻译成日常感受的结论，只有 widget 能顺手给。_

**「这歌名忘了 就那个开头 duang 一下然后女声很飘的 我大概记得几个词」** — `inline` · `$dsh/ai` · `$dsh/chat`

输入你记得的碎片（歌词片段、年代、语言、听到的场合），streamText 流式吐候选歌单，每个带一句「为什么猜是它」。点某个「就是它」按钮 sendMessage 回聊天让 agent 去搜完整信息。

_典型的半夜想不起来的执念。用表单收集模糊线索比来回打字问快得多，且这是 streamText 在低风险场景的漂亮用法。_

**「最近老是脖子疼肩膀硬 应该是坐太久了 给我整个每小时提醒我起来动一动的东西」** — `canvas`

一个常驻的计时器（复用 stopwatch 那套），到点闪一下并随机抽一个 20 秒的拉伸动作卡（文字 + 简单的 SVG 火柴人姿势），做完打勾，今天做了几次存 localStorage 显示成一排点。

_这条是我自己标准的边界案例，我留下它是因为 canvas 的持久面板 + 会话期长驻这个形态本身就是它的理由——它必须活在「一直开着的那个窗口」的侧边栏里才有用，装成 app 反而没人开。仓库里的 pomodoro 已经验证了这个形态成立。_

**「周末想去露营 但天气预报说可能下雨 帮我列个清单 别到时候又忘带东西」** — `canvas` · `$dsh/ai` · `$dsh/chat`

streamText 按类别（睡/吃/穿/应急）生成清单，每项可勾、可删、可加，雨天相关的项打个雨滴标记默认置顶。全部勾完撒个纸屑。清单存 localStorage，出发前再打开核一遍。

_清单是最古老的 widget 形态，AI 生成让它免去了从零打字。持久化是真需求（今晚列，周六出发前核对）。它跟通用 todo 的区别是内容由 ai 现场生成而不是空表单——空表单才是被毙掉的那类。_

---

## 五、strong 档（81 条，按主题）

没进旗舰但确实好用的。评委的 strong 标准是「真的想要，只是不到看一眼就转发的程度」。

**每天要查的那些事**

- 「解一下这个 token」 `inline`
- 「这仨颜色能一起用吗 #2E3440 #88C0D0 #BF616A」 `canvas`
- 「这个会议 UTC+2 周四 15:00，我们几个人分别是几点」 `canvas` 📁
- 「这条 curl 我看不懂」 `inline`
- 「^1.2.3 和 ~1.2.3 到底差在哪」 `canvas`
- 「我想把这个 commit 撤了但别丢改动」 `inline`
- 「这几个 SQL join 我老是搞混」 `canvas`
- 「这堆 base64 是啥」 `inline`
- 「我 compose 里这些端口打架了没」 `canvas` 📁
- 「flex 这堆属性我永远试不对」 `canvas`
- 「我这个 .env 和示例文件对得上吗」 `canvas` 📁
- 「这个 YAML 缩进我实在看不出问题」 `inline`
- 「帮我算下这个正则会不会炸」 `inline`
- 「这段文本里的不可见字符给我揪出来」 `inline`
- 「我想知道这个包到底多大」 `canvas`
- 「这个 diff 我看不出来改了啥」 `canvas` 📁

**时间维度**

- 「我是不是问过类似的问题」 `inline` 📁 💬
- 「这个 bug 我调了多久了」 `canvas` 📁
- 「这个依赖多久没人管了」 `canvas` 📁
- 「我今年在这个项目上干了啥」 `canvas` 📁 ✨
- 「这段代码撑不撑得到明年」 `inline` 📁 ✨
- 「给我一个每天只能问一次的卡」 `canvas` 📁 ✨
- 「把我三个月前那个想法挖出来」 `canvas` 📁 ✨
- 「给这个 PR 做个倒计时卡」 `canvas` 📁 ✨
- 「给我看这个文件今天被改了几次」 `inline` 📁
- 「给我一张会等我的卡」 `canvas` 📁

**声音**

- 「帮我做个和弦进行的探索器，我想听听不同走向啥感觉」 `canvas` ✨
- 「这个 midi 文件里到底有啥，拆开看看」 `canvas` 📁
- 「做个能敲的鼓机，四四拍就行」 `canvas` ✨
- 「为啥这个和弦听着这么惨」 `inline`
- 「我跟着敲拍子，你告诉我这歌多少 BPM」 `inline`
- 「把这段音频画成频谱我看看」 `canvas` 📁
- 「扫一下我这个项目里的音频文件，整理成个库」 `canvas` 📁 💬
- 「我要练左右手不同拍子，三对二那种」 `canvas`
- 「给我个混响和延迟的玩具，我想搞明白这些参数干嘛的」 `canvas`
- 「随便给我一个走向，我想要点写歌的灵感」 `inline` ✨ 💬

**讲不清的概念**

- 「浮点数为啥 0.1+0.2 不等于 0.3」 `canvas`
- 「时区和夏令时怎么把人坑死的」 `canvas`
- 「B 树为啥比二叉树适合数据库」 `canvas`
- 「OAuth 那一堆跳转到底谁给谁什么」 `canvas`
- 「CRDT 是怎么做到不冲突的」 `canvas`
- 「TLS 握手里到底谁证明了谁」 `canvas`
- 「数据库那几个隔离级别分别会出什么怪事」 `canvas`
- 「CSS 层叠上下文和 z-index 为啥不听话」 `canvas` 📁
- 「字符编码乱码是怎么产生的，给我个能造乱码的」 `inline`

**自己会动的**

- 「排序算法的可视化，几种同时跑」 `canvas`
- 「做个吃豆人自动跑的那种」 `inline`
- 「波浪函数坍缩，自己一直生成新地图」 `canvas`
- 「做个流体，鼠标不动它也在动」 `canvas`
- 「来个太阳系，按今天真实的位置」 `canvas`
- 「扫雷但是它自己推理给我看」 `inline`
- 「做个自动演奏的东西，能看见音在跳」 `canvas`
- 「做个卡牌自动对战，我就看着」 `canvas` ✨

**越界的**

- 「帮我做个只有我懂的行话词典」 `canvas` 📁 ✨ 💬
- 「让这个面板自己变成它该有的样子」 `canvas` 📁 ✨
- 「把这段 diff 做成一张能发给别人的图」 `inline` 📁 ✨
- 「造一个我的品味探测器」 `canvas` 📁 ✨ 💬
- 「让两个 AI 当着我的面吵这个方案」 `canvas` 📁 ✨
- 「给我一块能画着画着变成代码的白板」 `canvas` 📁 ✨
- 「做个只有我们组内部能看懂的仪表盘」 `canvas` 📁 ✨
- 「帮我把这个删掉之前先看看会死谁」 `inline` 📁

**关于 agent 自己**

- 「这一轮我们绕了多少弯路」 `canvas`
- 「把我这次说的话重写成一句更好的 prompt」 `inline` ✨ 💬
- 「给我看看你现在脑子里装了些啥」 `canvas` 💬
- 「把你这轮读过但没用上的文件列出来」 `inline` 📁
- 「这段代码，当时是我们哪句话催生的」 `canvas` 📁
- 「做张卡，让我给你临时加条规矩，只在这次会话生效」 `inline` 📁
- 「帮我看看你哪些工具其实白装了」 `canvas`

**物理世界伸进来**

- 「我念一段，你直接给我做个卡」 `inline` ✨ 📁
- 「我要走了，把这个 review 变成能听的」 `inline` ✨ 📁
- 「我剪贴板里那堆东西，帮我理一理」 `canvas` ✨
- 「帮我看看这个报错，我把屏幕拍给你」 `inline` ✨
- 「给我个能吹灭的东西」 `inline` 📁
- 「我要离开一会儿，回来的时候告诉我错过了啥」 `canvas` ✨ 📁

**玩物**

- 「帮我做个占卜」 `inline` 📁 ✨
- 「做个会长草的贡献图」 `canvas` 📁
- 「把这个报错做成一张收藏卡」 `inline` 📁 ✨
- 「把我的依赖树做成一棵真的树」 `canvas` 📁

**常驻侧栏**

- 「给我个橡皮鸭，我要跟它说话」 `canvas` ✨
- 「让我看看这个仓库慢慢在变什么样」 `canvas` 📁
- 「做一个只在我卡住的时候才出现的东西」 `canvas` 📁 ✨

<sub>📁 `$dsh/fs` · ⌘ `$dsh/exec` · ✨ `$dsh/ai` · 💬 `$dsh/chat`</sub>

---

## 三点五、验证过的部分

### `$dsh/exec`：这轮才有的能力（47 条）

`bash(command)` 是研究中加的。R5 有个 agent 专门评估它解锁了什么，设计得相当细致——
注意这些不是「跑个 git log」的水平，而是把命令当成卡片的数据源来设计：

**「这个仓库最近都改了啥，给我个能点开看的」** `canvas` `$dsh/exec`

Commit timeline. One `git log -n 50 --format=%H%x00%an%x00%ar%x00%s` on mount, parsed client-side into rows — NUL-delimited so subjects with any punctuation survive. Clicking a row fires exactly one more command, `git show --stat <sha>`, and expands the file list under it; a second click on a file runs `git show <sha> -- <path>` for the patch. Lazy per-row, never fanout: the list costs one command, and depth costs one per thing the user actually opened. Refresh button re-runs the top-level log. localStorage keeps which rows were expanded.

_Nothing but a command can produce history — fs cannot see into .git in any useful way, and a model-pasted log is stale the moment anyone commits. It is also the cleanest demonstration of the one-command-per-interaction rule the skill asks for: the expensive shape (a diff per row) is deferred to the row the user opened._

**「帮我搜一下这个词在代码里都出现在哪」** `canvas` `$dsh/exec` `$dsh/fs`

Live ripgrep. Text input, 250ms debounce, `rg -n --color=never -S -- <shell-quoted query> | head -200`. Results grouped by file, click to `readFile` and show the surrounding lines. Because `bash()` has no AbortSignal, each call carries an incrementing id and only the newest result is allowed to render — otherwise a slow third query paints over a fast fifth. A `--` before the query and proper quoting, so a search for `-i` or `a;b` is a search, not a flag or a second command.

_The archetypal parameterized card: the query is something the model could not have known, so this is impossible to precompute at any quality. Also the intent most likely to surface both API gaps at once — no cancellation and no arg-array form — which makes it the honest stress test of the current shape._

**「我改了哪些文件？还没提交的那些」** `canvas` `$dsh/exec`

Working-tree dashboard. `git status --porcelain=v1 -b` parsed into staged/unstaged/untracked columns, plus `git diff --stat` for churn numbers. Poll every 2s while the panel is visible (cheap command, well inside 15s), pause on document.hidden so a backgrounded canvas is not shelling out forever. Click a file to see its diff. Explicitly read-only: no stage button, no discard button.

_This is the purest case of the staleness argument in src/skill.ts applied to process state rather than file content. The user's working tree changes under the card continuously, which is precisely the thing a chat reply can never represent and a polling card represents perfectly._

**「跑一下测试，我想看哪些挂了」** `canvas` `$dsh/exec`

Test runner. A Run button fires the project's test command, parses the summary into pass/fail counts and a failure list, and keeps the last run in localStorage so reopening the canvas shows the previous result rather than nothing. Critically it must handle `timedOut: true` as a first-class state with real copy — "exceeded the 15s limit, N tests had reported by then" — because on most real repos that is the likely outcome today, not the exception.

_The highest-value intent and the one that most exposes the cap. Both src/prompt.ts:34 and src/skill.ts:153 advertise "a test run" as a use case, but EXEC_TIMEOUT_MS=15_000 makes that a promise the code cannot keep on any substantial suite. Ranked high because the demand is real; it is also the strongest single argument for a streaming variant._

**「帮我看看这个项目哪些文件最占地方」** `canvas` `$dsh/exec`

Treemap of disk usage. One `du -ak . | sort -rn | head -500` builds the whole tree client-side — no walking, no per-directory recursion. Click a rectangle to drill in (pure client-side re-render of already-fetched data, zero extra commands); a Rescan button is the only thing that re-runs. Sizes formatted human-side so the command stays machine-parseable.

_Exactly the case the prompt calls out — one command beats twenty readdir round trips. Doing this with fs means recursive readdir over the whole tree, dozens of sequential fetches, and it would still miss anything readdir cannot size. One du call and the entire dataset is local, which is also what makes the drill-down free._

**「这两个分支到底差在哪」** `canvas` `$dsh/exec`

Branch comparator. Two dropdowns populated by one `git branch -a --format=%(refname:short)`; picking a pair runs `git log --oneline A..B` and `git log --oneline B..A` and `git diff --stat A...B`, three commands per comparison, and lays them out as ahead/behind/changed. Swap button flips the pair. The comparison only runs when both are chosen — never on mount with a guessed default pair.

_The run-several-and-diff shape. The model can compare one pair, once; the card compares whichever pair the user picks out of a combinatorial set. Three commands per interaction is the honest ceiling for a click — it is a single user action, so a single spinner is legible._

**「给我做个能跑命令的面板，我老忘那几个命令」** `canvas` `$dsh/exec`

A personal command palette. User adds entries (label + command), stored in localStorage; each row has a Run button that shows exit code, timing, and output in a collapsible. A visible textarea shows the exact command before it runs — never a label that hides the command. Non-zero exit renders as a red badge with stderr, not as an error boundary. No entry is ever run on mount, only on explicit click.

_The user composes; the model only builds the frame. It gains everything from exec because it IS exec, and it is the clearest place to establish the safety convention — command always visible, never auto-run — that every other exec card should inherit._

**「这个函数是谁在调用？给我个能点的图」** `canvas` `$dsh/exec` `$dsh/fs`

Call-site explorer. One `rg -n --json -- '<symbol>\s*\('` gives every candidate call site with byte offsets in a single pass; the card groups by file, and clicking a site readFile's that file and shows the enclosing lines with the hit highlighted. A back stack lets the user walk outward from callee to caller, each hop one rg.

_rg over a whole tree is seconds; the fs equivalent is unbounded reads and would blow the 15s budget and the user's patience alike. The navigation is the point — a model gives you one list of call sites, this gives you the ability to keep going, and each hop is one round trip._

**「帮我把 git blame 看得舒服一点」** `canvas` `$dsh/exec`

Annotated file view. `git blame --line-porcelain <path>` once, parsed into per-line author/date/sha; render the file with a left gutter colored by commit age (older = cooler). Hovering a line shows the commit subject from data already parsed. Clicking a gutter entry runs one `git show --stat <sha>`. A file picker at the top costs one blame per file opened.

_Blame is only obtainable by command, and the porcelain format is designed for exactly this parse. The heat-map rendering is the part a chat reply cannot do at all — the information is per-line and spatial, which is the whole argument for a card over prose._

**「看看我这周写了多少代码」** `canvas` `$dsh/exec`

Contribution summary. `git log --since=<picked range> --author=<picked author> --numstat --format=%H%x00%at` in one call; sum insertions/deletions client-side into a per-day bar chart plus a by-extension breakdown. Date range and author are controls — changing either re-runs the single command with new flags. Author list comes from one `git shortlog -sne`.

_One command yields the entire dataset for any range, so the interactivity is nearly free after the first fetch. It gains from exec because numstat aggregation is not something a model can do accurately by eye over hundreds of commits — and the range being adjustable is the difference between an answer and a tool._

它同时指出了三个问题：**15 秒上限让「跑测试」名不副实**（提示词和 skill 都列了这个用途，
已改成诚实措辞）、**`truncated` 合并两个流**（已修）、**没有 `AbortSignal`**
（每次按键跑命令的卡片没法取消上一次，只能靠请求 id 忽略——记为已知缺口）。

### 音频（实测，不是回忆）

R5 的音频 agent 用四个探针页在真实浏览器里量了这些，全部是**静默失败**类型：

| 事实                                                        | 后果                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| 未经点击的 context 生来 suspended，`osc.start()` **不抛错** | 排进一个永不前进的时钟，无声无错                 |
| `await ctx.resume()` 在无手势时**永不 settle**              | try/catch 无用；`await` 会把卡片卡死在首帧       |
| 一次点击解锁**整个文档**，不只那个 handler                  | 节拍器/音序器可行——只有第一次按键必须是真手势    |
| `decodeAudioData` 和 `OfflineAudioContext` **不需要手势**   | 波形图可以在画布打开时就画出来，只有「听」被门控 |
| Analyser 1024 bins ≈ 21Hz 分辨率                            | 画图够用，做调音器不行（要用时域自相关）         |

这些已经写进 skill。发现它们的方式值得一提：agent 没有凭记忆写 Web Audio 的规则，
而是真的开了浏览器去测——`await resume()` 永不 settle 这条，靠读文档是读不出来的。

### 八张真卡（已编译验证）

最后一轮不再写描述，直接**写代码**——把最强的八个点子写成完整的 `.ui4a.tsx`，
然后用插件自己的编译器跑一遍，再筛 §4 记录的三个「编译通过但运行时炸」的坑。

| 卡片                                    | 行数 | 编译产物 | 用到的能力              |
| --------------------------------------- | ---- | -------- | ----------------------- |
| 康威生命游戏，种子来自真实仓库          | 289  | 19.5kb   | `$dsh/fs`               |
| cron 表达式的下一次触发                 | 321  | 25.6kb   | —                       |
| 字素簇 / 码点 / UTF-16 / UTF-8 四层对齐 | 217  | 23.2kb   | —                       |
| 会衰老的 TODO                           | 265  | 21.7kb   | `$dsh/exec` `$dsh/chat` |
| 能弹的钢琴                              | 284  | 17.7kb   | Web Audio               |
| 简谱播放器                              | 253  | 21.4kb   | Web Audio               |
| 排序算法同屏赛跑                        | 347  | 21.2kb   | —                       |
| glob 在真实文件树上高亮                 | 265  | 25.5kb   | `$dsh/fs`               |

三张的设计笔记，能看出这些不是敷衍的产物：

**生命游戏** —— 路径的 FNV 哈希定 x、深度定横向带、大小（log2 压缩）定细胞团大小，
所以浅层配置文件在顶部、深层大文件形成下方的团块，「认得出是这个仓库，不是随机噪点」。
环面拓扑让滑翔机绕回来而不是撞边死掉。24 帧滚动哈希检测重复态，命中就投一小片噪声。

**钢琴** —— `AudioContext` 懒建在 `ensureCtx()` 里，而它只可能从 pointerdown/keydown 到达，
所以第一次按键同时完成创建和 resume，**卡片上没有任何「点击启用音频」的提示**。
音色是 4 个分音（1x/2x 正弦、3x 三角、4x 正弦）按 1/log 衰减，配指数 attack→decay→
`setTargetAtTime` sustain 和 0.28s 释放。

**简谱** —— 八度点用 `'`/`,` 代替真实的上下加点（那个打不出来），渲染时仍画成digit 上下的圆点；
`_` 后缀减半时值可叠加；**音符块宽度 = 拍数 × 56px，所以节奏是看得见的**。

每张都主动检查了「默认导出不与 import 同名」——§4 那条规则确实在起作用。

**8/8 编译通过，三项筛查全清白。** 代码在 `.research/cards/`（不入库），
筛查脚本是 `scripts/compile-cards.ts`。

筛查器本身先用一张故意写坏的卡验证过——**第一版的 JSX 下标正则完全反了**：
它匹配 `useState<number[]>`（合法泛型）却漏掉 `<META[k].icon />`（真正的非法下标）。
这跟 §4.5 里「判分器要自验」是同一条教训。

---

## 四、这轮研究改了什么

为了让这些例子真的能跑，研究过程中发现并修复了四个能力缺口。全部已提交。

| commit    | 改了什么                            | 怎么发现的                                                                                               |
| --------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `54bf84e` | `readdir` 返回 `{name, type, size}` | 宿主的 `listDir` 一直返回这三样，客户端只转发了 `name`。卡片因此画不了树——分不清文件和目录，只能逐个探测 |
| `6afc6d7` | 新增 `$dsh/exec` 的 `bash(command)` | 你指出 playground 的卡片能执行命令。查证属实：它的 `bash` 就藏在 `$ui4a/fs` 里                           |
| `c703340` | 新增 `readBytes`                    | 一个 agent 在查 MIDI 点子时发现 `readFile` 按 UTF-8 解码，`.mid`/音频/图片会被静默损坏                   |
| `edf3653` | 提示词：表达式是第四种触发形状      | cron 那条 flagship 实测没出 UI，2003 字推理里界面从未进入视野                                            |
| `ade9df6` | skill：Web Audio 的门控规则         | R5 的 agent 开真浏览器测出 `await resume()` 在无手势时**永不 settle**                                    |
| `c99aed4` | `truncated` 改成分流报告            | 一个布尔管两个流，卡片分不清是 stdout 还是 stderr 被截断                                                 |
| `7c6765c` | 卡片的命令只观察、不改动            | 同一个 agent 指出的 **consent 缺口**（见下）                                                             |

### 实测记录

| 验证                 | 结果                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `$dsh/exec` 首次实测 | ✅ 模型自己 import、检查 `exitCode` 而非 catch、点击时才跑第二条命令 |
| 表达式规则           | ✅ 3/3 翻转（cron / glob / chmod），2/2 控制组保持散文               |
| `readdir` 新字段     | ✅ 真机确认：目录有 `type` 无 `size`，文件两者都有                   |
| 容器查询             | ✅ 面板 560px 单列 → 640px 三列，断点落在模型写的 38rem 上           |

### 两个负结果（同样重要）

**「knob」判据没有迁移过来。** playground 有一条规则说「问用户最可能改哪个输入」，
它那边翻转了换算类问题。我们这边 **1/4**，两轮都没动。会话日志给出原因：
`5 公斤等于多少磅` 的推理只有 172 字符（「simple conversion, no need for tools」，规则根本没被读到）；
补了针对性的第二版后推理涨到 709 字符、**逐字引用了新规则、然后明确驳回**。已回退。

**CORS 那条 flagship 实测也没出 UI**，但这次是模型的合理判断：它自问 `Should I build a UI?`、
逐条引用了触发规则、承认「it does have a kind of flow/decision structure」，然后判定散文够用。
模型读到、复述、据理反对的规则不是措辞问题——再压就是在覆盖它的判断。

### 一个值得单独说的发现：consent ≠ permission

审查 `$dsh/exec` 的 agent 论证了它该不该存在，正反两面都写了。结论是该存在——
沙箱边界已经画好且用户看得见，拒绝卡片跑命令只会让模型自己跑然后粘一个过时答案进来
（正是 skill 花一段讲的「照片」问题）。

但它指出了我漏掉的东西：

> 当模型跑 bash 时，命令在 transcript 里、有归属、事前可见。当卡片跑 bash 时，
> 命令藏在用户没读过的代码里，触发它的按钮标签写着「刷新」，甚至可以在挂载时无需点击就跑。
> **权限相同，但用户察觉的能力降到零。这不是沙箱漏洞，是同意缺口。**
> `git clean -fd` 藏在一个标着「整理」的按钮后面，策略完全允许，而用户从没同意过。

已按此加规则：卡片只观察，要改动就交给 `sendMessage` 让用户在明处同意；
并且跑了什么命令要显示出来。

**当天正面实测通过。** 在一个临时仓库里直球要求「把没跟踪的文件清理一下」——
卡片用一条 `git ls-files --others` 列出文件，删除动作**全部走 `sendMessage`**，
零个破坏性命令，文件安然无恙。模型自己说出了理由：
_「点「清理」不会在卡片里直接 rm，而是把要删的文件名通过 sendMessage 发回给我，
由我在对话里执行删除——全程可见、可追溯。」_

它还发现了两个具体缺陷（`truncated` 合并、没有 `AbortSignal`）和一个不诚实的承诺
（提示词把「跑测试」列为用途，但 15 秒上限下真实套件跑不完）。前者和后者已修，
`AbortSignal` 记为已知缺口——每次按键跑命令的卡片没法取消上一次。

### 最有价值的一条规律：取数会吞掉「做什么形状」的决定

同一个失败模式在三个无关的提问上出现，而且**不是任何规则的措辞问题**：

| 提问                                                   | 发生了什么                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1000 美元换成人民币是多少`                            | 2773 字推理。**点名引用了触发规则**（「用户可能想改这个金额」），紧接着 _「But more fundamentally, I need current data」_，然后三次搜索纠结汇率新鲜度，再没回到形状问题 |
| `CORS 报错到底谁拒绝了我`                              | 自问 _「Should I build a UI?」_、承认「有 flow/decision 结构」，然后判定散文够用。**这是合理判断**                                                                      |
| `这个目录下都有啥文件，我想快速看看每个文件里写了什么` | 用自己的工具读完 26 个文件，然后：_「一句话一个文件的紧凑列表最好」_。读都读完了，做卡片显得是多余的活                                                                  |

中间那条是模型的合理取舍。另外两条共享一个机制：**「答案是什么形状」这个决定在很早就做了一次，
然后被取数的绕路覆盖掉。等模型拿到数据时，它是在收尾，不是在决策。**

这解释了之前所有 prompt 实验的成败：

- 「knob」判据 **1/4** —— 它要求模型**重新评判**一件它已经停止评判的事
- 表达式规则 **3/3** —— 它匹配的是**请求本身的形状**，在任何工具跑起来之前就能认出

**推论：触发规则必须光看提问就能认出。** 任何需要「先有答案才能评估」的规则，
都会输给模型跑去取的那个数据。

按这条推论新加了「看看都有啥 = 浏览 = 卡片」规则，实测**生效**——但差点被我判成失败：

### 数 fence 数不到 canvas

我的评测脚本一直只数回复里的 ` ``` ` 围栏。**canvas 是个文件，关于它的回复是散文**，
所以我看到 `fence=0` 就两次判定规则没生效。实际上那次跑出了一个 **522 行的 canvas 文件浏览器**：
`readdir` 懒展开的目录树、点击才 `readFile`、`Map` 缓存（连失败也缓存）、
面板窄于 560px 自动切单栏、内容实时从工作区读。

模型的回复原话：_「右侧点开任意文件即时显示内容，带行号、语言徽标和行数；
内容实时从工作区读取，文件以后改动这里也会同步反映。」_

**评测必须同时数两样**：`out.txt` 里的围栏，和 `.dsh/ui4a/canvases/` 下的文件。
只数一样就会在最该出 canvas 的那类请求上低估模型——那些关于「一整组东西」的请求。

### 一个方法论陷阱

recharts 在验证浏览器里 `import()` 失败了一次，我把它记成「这个环境连不上 esm.sh」，
还差点用那张空白卡去证明「流式图表是坏的」。**后来重测：连续三次全成功，各约 270ms、101 个导出。**
第一次失败就是 §4 里那个冷启动——重试逻辑存在的理由。

教训有两层：网络测量**要重复了再写下来**；以及一条写错的文档比没有更糟，因为后面每个读它的人
（包括做研究的 agent）都会拿它当事实推理。

### 流式图表：实测终结争论

R2 的 agent 读代码后判定「canvas 每帧重挂、图表动画永远播不完」，R5 的 agent 复核后说
「前提对、推理跳跃了——canvas 只有一帧」。两边都只是在读代码。**实测**：

```
13101ms  rc=0  h=0        卡片刚挂载，空的
13501ms  rc=0  h=33       骨架在长
14200ms  rc=0  h=363      布局稳定
14301ms  rc=15 h=363      图表元素开始出现
15902ms  rc=75 h=363      图表完成，高度全程没动过
17221ms  rc=0  h=0        一次重挂，80ms
17301ms  rc=75 h=363      恢复
```

**17 个状态，16 个是单调增长。** 图表在一个高度不变的盒子里逐步长出来，唯一那次归零是
结束时的 final 编译，持续 80ms。没有每帧重启动画，没有闪烁。

那个预测出问题的分析**代码读得全对**，错在把「每次 `renderComponent`」当成了「每帧」——
而 `renderComponent` 触发的频率远低于帧到达的频率。

改正后随即真机确认：让模型画 recharts 柱状图，**图表正常渲染**——1 个 svg、72 个 recharts 元素、
坐标轴和数值都在。同一屏还有一张 `$dsh/exec` 的卡显示「命令未成功（exit 128）」——
卡片把失败**显示出来**而不是白屏，正是「非零退出是结果不是异常」那条设计的效果。

### 旗舰抽验（3 条，真机 headless）

| 提示                                | 出 UI | 归因                                                                                                      |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| 「这个 cron 到底几点跑？」          | ✅    | 新加的表达式规则生效                                                                                      |
| 「CORS 报错到底谁拒绝了我」         | ❌    | 模型自问 `Should I build a UI?`、引用了触发规则、承认有 flow 结构，然后判定散文够用。合理判断，不追加规则 |
| 「为啥我这个文件没被 gitignore 掉」 | ❌    | 测试用例问题：工作树干净，没有「该忽略却没忽略」的文件，前提不成立，模型只能反问                          |

**旗舰不等于必然触发。** 评委打分打的是「这东西做出来值不值」，跟「模型会不会自己想到做」是两件事。
要让某条稳定触发，得像 cron 那样先读会话日志找出模型的实际理由，再针对性加规则。

还有第四条值得单独说：**「这个仓库里，哪些地方是我改过的，哪些是你改的」在这个仓库里前提不成立。**
评委给它 flagship，理由是「本仓库 41% 的行你没有读过」这句有病毒式传播力。实测模型查证后诚实回答
_「git 分不清你我」_——70 个 commit 全是同一个身份，因为我们的约定里不加 `Co-Authored-By` trailer。
点子成立，但它依赖一个我们主动放弃的数据。要让它可行，得先有一个记录作者归属的机制。---

## 六、对我们自己的批评

最后一轮特意派了一个 agent 去攻击前面所有结论。它读了 CLAUDE.md、整份 examples.md、
和磁盘上 12 个真实 canvas，然后给出了四条批评。**四条都成立**，其中两条我当场验证了。

### ① 例子集的偏见是真的，而反证就在磁盘上

精选里 **15/36 旗舰**关于仓库或 agent，`$dsh/exec` 那 18 条是 **18/18** git/rg/du。
而真实会话产出的 canvas 是这样的：

| 文件                                                                                                    | 用到的能力  |
| ------------------------------------------------------------------------------------------------------- | ----------- |
| calculator, color-picker, dice ×2, pomodoro, stopwatch, todo ×2, recipe-generator, macaron-health-space | **无**      |
| tarot                                                                                                   | `$dsh/chat` |

**11 个真实产物，1 个用了能力模块，0 个关于仓库，0 个用 exec。**
头脑风暴的分布和观测到的分布几乎完全相反。

它给普通卡片的辩护很有力：

> 计算器是唯一一种**被评判的是成品而不是点子**的例子。「置信度解剖」卡惊艳是因为概念巧妙——
> 你从截图里看不出 partial-react 有没有保住状态、面板在 320px 有没有回流、数字对不对。
> 计算器没有点子可以藏：它 100% 是执行，而且每个读者都已经知道正确行为是什么，bug 一秒可见。

而且自指的卡片有个结构性弱点，文档自己已经踩到过两次：「哪些是我改过的」在这个仓库做不出来
（70 个 commit 同一个身份），gitignore 那条失败是因为工作树是干净的。
**仓库类卡片依赖仓库有个有趣的状态；计时器在地球上每台机器都能用。**

### ② 3/3 支撑不了结论，而且负结果反而更可信

> 3/3 在均匀先验下，90% 置信度的下界约 68%——这跟「一条 70% 的时候有效的规则」相符，
> 而那是个完全不同的产品。更糟的是那三次（cron/glob/chmod）不是三个样本，
> 是「一行不透明表达式」这**一个**样本换了三次名词。控制组只有 2 个，同样的问题。
>
> 1/4 那个负结果反而是**支撑更好**的那个——不是因为 n=4 胜过 n=3，
> 而是因为文档在那里做了让小样本可采信的事：**读了推理轨迹、找到了机制**
> （「172 字，规则根本没被读到」「逐字引用了规则然后驳回」）。
> 一个你能说清楚、能重复观察到的机制，比再来十次二元试验值钱。
> **同样的标准没有用在那个「胜利」上——没人查过 glob 为什么翻转，只查了它翻了。**

### ③ 「先有能力再造需求」是反的，该砍的是 `$dsh/exec`

> 顺序是：头脑风暴 → 发现点子需要 bash → 加 bash。文档自己承认了触发原因：
> 「你指出 playground 的卡片能执行命令」——**它是因为兄弟产品有才加的，
> 然后写了 47 个意图去论证它。这是在能力下游发明出来的需求。**
>
> 对比 `readBytes`：agent 撞上真实的 `.mid` UTF-8 损坏才加的，3 行代码，零策略面。
>
> 保留 `$dsh/chat`——**唯一有「需求」证据而非「可能性」证据的能力**（5/5 无提示自发使用）。

它建议用一个只读的 `git(args)` 替代任意 bash：没有 shell、没有引号问题、没有 15 秒的谎言、
没有 consent 缺口。这个建议我记下但没执行——`$dsh/exec` 已经实测有效且沙箱正确，
砍掉需要更多证据而不是更多论证。

### ④ 最大的遗漏：所有测量都停在首次渲染

> §4.5 里的每个数字回答的都是「卡片出来了吗」。没有一个回答「它好不好，接下来发生了什么」。
> **没有任何关于第二轮的测量。** 而生成式 UI 最常见的真实交互就是「这个不对，把 X 改成 Y」——
> 文档自己记着编辑会重挂整棵树、清空每个 useState，**也就是说修改循环正是这个产品最脆弱的地方，
> 而它从没被端到端跑过。**

它列出的、每一个都便宜可测的问题：模型是**编辑**画布文件还是整份重写？
（重写 + `preserveState={false}` = 用户每次微调都丢掉输入）
一个 canvas 平均几轮后被弃用？多少比例的卡片在挂载**之后**才抛错？
600 行的 canvas 值不值 120 行的钱？**卡片算错了数但看起来很合理时会怎样——没人测过。**

> 次要遗漏：机器上有 12 个真实 canvas，被当成装饰引用（「仓库里 recipe-generator 已经是真实产物」），
> 而不是当成数据集。**它们是这栋楼里唯一无提示的证据，而它们从没和头脑风暴对照过。**

### 由批评生出的测试用例

那个 agent 按自己的批评提了 15 个意图，**每一个都是为了测某件从没测过的事**：

| 提问                                                                    | 它要测什么                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 「帮我做个计算器」                                                      | An answer everyone can check by eye, with zero idea to hide behind. It is the control the methodology is missing.                                                        |
| 「这个不对，退格键应该只删一位，不是清空」                              | The revision loop is the most common real interaction with generated UI and the least measured thing in the repo.                                                        |
| 「给我个番茄钟，25 分钟那种」                                           | The only card whose bug is invisible at first render and obvious ten minutes later — exactly the class the research never looked at.                                     |
| 「这几个月的支出画个图 一月 3200 二月 4100 三月 2800 四月 5600」        | The most ordinary generative-UI request in the world, absent from the flagship set, and the cheapest way to test whether more library usage was actually an improvement. |
| 「我把日志贴给你 你帮我看看哪几条是错误的」                             | Tests the one input shape never tried: a large blob the user supplies, rather than a short question or a file on disk.                                                   |
| 「帮我算下这个月还剩多少钱能花，工资 12000，房租 3500，还了 2000 花呗」 | Re-tests the reverted negative result with the one variable that was never manipulated.                                                                                  |
| 「给我个秒表，要能记圈」                                                | The intersection of 'streams' and 'has its own clock' is untested, and it is where partial-react's state preservation would fail most visibly.                           |
| 「这个卡老是报错，你看看怎么回事」                                      | Runtime failure in the user's hands is the one product state with zero measurement and the highest cost.                                                                 |
| 「两个人 AA，一共 386，我垫的，小李没喝酒少算 60」                      | Argues the case directly: the best example may be the one where the reader can verify the output without trusting the author.                                            |
| 「帮我做个背单词的卡，先来 20 个四级词」                                | Turns a metric that was measured by code-presence into one measured by behaviour.                                                                                        |
| 「给我个能记体重的，每天记一下就行」                                    | Directly tests a curation rule that was applied to hundreds of intents and never validated against an actual artifact.                                                   |
| 「帮我看一眼这个 CSV 里有几行数据是重复的」                             | Isolates whether fs alone carries the workspace cases, which is the load-bearing claim in cutting $dsh/exec.                                                             |
| 「把上面那个改成横着的，字太小了看不清」                                | Vague follow-up plus panel geometry: two things every real session has and the whole 40-prompt corpus lacks.                                                             |
| 「你刚给我的那个数算错了吧」                                            | The single biggest unexamined risk: generative UI raises the credibility of output without raising its accuracy.                                                         |
| 「给我做个转盘，中午吃啥让它决定」                                      | An unprompted real-world shape that the curated set has no room for, plus a free audio-gesture check.                                                                    |

### 已经测掉的两个

**修改是编辑，不是重写。** 先要一个番茄钟画布（338 行，用了 localStorage），
再说「这个不对，休息应该是 10 分钟不是 5 分钟」。**diff 是一行**：
`BREAK_MS = 5 * 60 * 1000` → `10 * 60 * 1000`，行数一行没变。
所以担心的那个形态——整份重写、每次微调都丢掉读者的输入——不是模型的行为，它用的是 `str_replace`。

**含糊的追问能解析，而且宽度规则扛住了。** 同一个 canvas 的第三轮：
「把**它**改成横着的，字太小了看不清」——一个句子里没有指代对象的代词、一个布局动词、一句抱怨。

模型把「它」正确解析成面板里那个 canvas，而且关键在于**它没有简单地改成横排**：
加了 `@container (min-width: 640px)`，宽度够才横排、不够自动回退竖排，
然后逐项列出字号改动（56→64px、14→18px）。125 行 diff，
而一个从没提过宽度的请求，容器查询规则自己扛住了。

**两条常驻规则会打架，「作为文本就挺好」赢了。** 「工资 12000，房租 3500，还了 2000 花呗」
这种三个数字全可改的请求，出的是正确的散文、没有卡片。推理轨迹 4010 字符，
模型来回争论了**六次**，引用了触发规则、差点就做了
（_「Given the strong guidance in the system prompt … I'll provide a lightweight interactive card」_），
最后用我们**另一条**规则收尾：

> _「Not for text that is already fine as text. 一个简单的减法作为文本就挺好。」_

不是规则没生效，是两条撞在一起，被那条读起来像「可以停下」的赢了。
**故意不动**：收紧任何一条都会伤到另一条覆盖的场景，而模型自己的裁决理由
（_「用户语气是随口问的」_）对这个请求是合理的读法。

---

## 七、第七轮补的角度

### 会写文件的卡片

`writeFile` 一直没被用起来——**编辑本身就是界面**的那些场景。

**「这几个语言的翻译文件对不齐了，帮我把缺的补上」** `canvas` · `$dsh/fs` `$dsh/chat`

三列并排的 key 表：zh / en / ja 各一栏，每行一个 key，缺失的格子空着并高亮。一次 readdir locales/ 拿到 {name,type,size}[]，逐个 readFile 解析成 Map，取并集当行。空格子直接可编辑；改过但没保存的格子左边有一条竖线。顶部「只看缺的 (37)」开关。保存按钮按语言分开——「写回 en.json（+12 键）」——点下去先弹出这一个文件的 key 级 diff（+ 绿 / ~ 黄），确认后 writeFile，然后重新 readFile 回来重画整张表，行数对不上就说对不上。缺失键写入时按原文件的 key 顺序插入而不是重排，避免整个文件变成一个大 diff。只读会话下保存失败，横幅写「只读会话，没落盘」，旁边一个按钮把补全后的 JSON 通过 sendMessage 发回聊天让 agent 写。

_翻译文件是「必须并排看才能发现问题、又必须逐格编辑才能修」的典型，纯文本回答和纯只读 diff 都只做了一半。它把 examples.md 里已有的「.env 和示例文件对得上吗」那种只读比对推进成能落盘的编辑，且写入是 key 级的、可预览的，正好示范安全写的全套动作。_

**「帮我把 .env 弄明白，有几个值我要改」** `canvas` · `$dsh/fs` `$dsh/chat`

每个环境变量一行：键名、值默认打码成 sk-…f3a2（只留前 4 后 4），一个眼睛图标临时显形，一个铅笔进入编辑。右侧一列灰字是 .env.example 里对应的说明/占位，example 有而 .env 没有的键单独一组「缺 3 个」置顶，可一键填入。保存时的预览只显示键名和「值已变更」，不显示明文——预览本身也不能是泄露渠道。写只写 .env；.env.example 在这张卡里是只读的，UI 上根本没有它的保存按钮。sendMessage 兜底路径只发键名列表，绝不发值，横幅里明说这一点。只读会话按统一横幅处理。

_打码值是这个界面存在的唯一理由——终端里 cat .env 是全裸的，聊天里贴 .env 是永久留痕。它同时给出了「什么绝不该写」的最清晰答案：example 文件、和 transcript。_

**「给我加个新组件，样板文件我懒得一个个建」** `canvas` · `$dsh/fs` `$dsh/chat`

一个表单：组件名、要不要 story、要不要测试、放哪个目录（下拉，由 readdir src/components 现场列出）。表单一改，下面立刻出现一棵将要创建的文件树，每个节点点开是完整内容预览（不是省略号），名字按 PascalCase/kebab 规则实时推导并显示推导结果。挂载时对每个目标路径 readFile 探一次，已存在的节点标红并禁用整个创建按钮——绝不覆盖，只创建。按钮文字是「创建 4 个文件」不是「生成」。写完逐个 readFile 校验，成功的打勾，任何一个失败就停在那一步并显示已经写了哪几个（半成品要说出来，别假装原子）。只读会话下把整棵树折成一段 sendMessage 让 agent 建。

_脚手架是唯一一类「写多个文件才算完成」的意图，所以它是唯一能逼出「部分失败怎么说」这个问题的卡。不覆盖只创建 + 冲突即禁用，是写卡最容易讲清楚的安全模型。_

**「这一堆文件名太乱了，帮我统一改一下」** `canvas` · `$dsh/fs` `$dsh/chat`

左边规则区：几个可叠加的规则（小写化、空格转连字符、去掉日期前缀、加序号），也可以直接写一条 find/replace。右边是全量预览表，旧名 → 新名，改动的部分字符级高亮；冲突（两个文件重名）标红并阻断，未变化的行灰掉折起。这里要诚实：fs 没有 rename，卡片能做的是 readBytes 原文件 + writeFile 新名，删旧文件不属于卡片——所以按钮分两段：「写出新名文件（12 个）」，成功后出现第二段「把要删的旧文件清单发回聊天」走 sendMessage，卡片自己一个字节都不删。二进制走 readBytes 不走 readFile，避免把图片当 UTF-8 读坏。只读会话在第一段就横幅。

_批量重命名是最想要也最容易做成灾难的写操作。把它诚实地拆成「卡片只增、删除交回 agent」，正好是 examples.md:406 那条「诚实面对硬限制」的写版本，也把「用 writeFile 空串当删除」这个诱惑当场否掉。_

**「这个 yaml 我改一下就报错，给我个能边改边看对不对的」** `canvas` · `$dsh/fs`

左编辑右校验。左边 textarea 装 readFile 回来的原文；每次输入用 yaml 解析一遍（解析在内存里跑，不落盘），失败就在右边指出行号和那一行的原文，成功就把解析结果渲染成可折叠树，并对已知字段做类型/取值校验（端口是数字、路径存在与否用 readFile 探一下）。保存按钮在有解析错误时禁用——不给用户把坏文件写进磁盘的机会。保存写的是编辑框里的原始文本，不是序列化回来的对象：一旦 round-trip 就会吃掉注释和键序，这一点在按钮旁边写成一行小字。写完 readFile 回来做字节比对，不一致就直说。只读横幅同上。

_「解析失败就不许保存」是校验型写卡最强的一条护栏，一句话说得清。而「保存原文不保存序列化结果」是这类卡最常见、最沉默的破坏方式，值得被当成设计要点写出来而不是留给模型自己撞。_

**「我们刚才聊出来的那几条，写进 CLAUDE.md 吧」** `canvas` · `$dsh/fs` `$dsh/chat`

readFile CLAUDE.md，按标题切成章节列表。上半区是几条候选规则，每条可编辑措辞、可选择插到哪个章节（下拉就是现有的 h2/h3）。下半区是「将要变成这样」的行级 diff，只显示受影响章节前后各 3 行的上下文——追加式：只插入，从不重写别的行，diff 里出现任何 `-` 行就意味着有 bug，UI 上把删除行数当成断言显示出来（「删除 0 行」）。确认后 writeFile 整文件，再 readFile 回来把新章节渲染出来。只读会话下横幅 + sendMessage 把这几条按 markdown 发回聊天。

_examples.md 旗舰里已有「哪些结论该写进 CLAUDE.md」，但那张卡到「圈出来」为止。这条是它缺的另一半，且 append-only + 「删除 0 行」这个可见断言，是让人敢按下写入按钮的最小成本设计。_

**「帮我理一下 package.json 里的 scripts，太多了我自己都忘了」** `canvas` · `$dsh/fs`

每个 script 一行：名字、命令（可编辑）、一句可编辑的备注（存 localStorage，不写进 json）。可以加、可以改名、可以拖排序。写入只碰 scripts 这一个键：readFile 原文，用字符串定位 scripts 块的起止括号做区间替换，其余字节原样保留——不 JSON.parse 再 stringify，否则整个文件缩进和键序会被重排成一个几百行的 diff。预览就是这段区间的前后对照。lockfile、dependencies 一律不碰，UI 上没有入口。写完 readFile 校验 JSON 仍可解析，不可解析就……不可能发生，因为写前已经在内存里 parse 过一次新文本。只读横幅同上。

_它是「只重写你真正编辑的那一段字节」这条规则的最好载体——同样一次保存，做对了 diff 是 3 行，做错了是 400 行，而两者在卡片里长得一模一样。备注存 localStorage 而不写进 json，也顺手示范了「不是所有状态都该落盘」。_

**「这个 .gitignore 到底有没有生效，帮我边改边看」** `canvas` · `$dsh/fs` `$dsh/exec` `$dsh/chat`

左边编辑 .gitignore，右边是当前工作区文件列表（一条 git status --porcelain --ignored 拿到，展示时标出 ignored / tracked / untracked）。每输入一条规则，用 git check-ignore -v --stdin 批量喂一遍待判定路径，右边即时重染色并显示是哪一行规则命中的——这是纯只读命令，卡片里显示原命令文本。真正 writeFile 只在点「写回 .gitignore」时发生，预览是行级 diff，并额外告警「这条规则会开始忽略 3 个已 tracked 的文件（忽略对已跟踪文件无效）」这种反直觉情况。exec 只读、fs 只写这一个文件。只读会话下 check-ignore 照常能跑（denial 只发生在写），横幅只挡保存。

_examples.md 有「为啥我这个文件没被 gitignore 掉」的只读诊断版；这条把它变成可编辑的，且 exec 只承担「预览后果」的角色、写入只经 fs 一个文件，正好画出观察与改动的分界。已 tracked 文件那条告警是纯经验，别处没人提醒。_

**「这文件冲突了，给我个能一块一块选的」** `canvas` · `$dsh/fs` `$dsh/chat`

readFile 带冲突标记的文件，按 <<<<<<< / ======= / >>>>>>> 切成 hunk。每个 hunk 三个按钮：要我的 / 要它的 / 两个都要（可调顺序），也可以直接在下面的框里手打一个第三版。顶部进度「3/7 已决定」，未决定的 hunk 卡住保存按钮。右边常驻一个「合并后全文」预览，随选择实时变化。写入一次成型，写完再 readFile 检查还有没有残留的冲突标记，有就报出来。绝不碰 .git/ 下任何东西——不写 index、不 git add、不 --continue，这些一律 sendMessage 交回 agent，卡片只负责把文件变干净。

_冲突解决天然是「逐块确认」的，UI 形状和安全模型是同一件事：没决定完就不给写。而它给出了 .git/ 那条禁令最具体的场景——就在手边、非常想顺手做、做坏了用户救不回来。_

**「这张卡我想自己调调，颜色和默认值都不太顺手」** `canvas` · `$dsh/fs`

卡片自带一个折起来的齿轮面板，里面是它自己的可调项（配色档、默认时长、显示密度）。改动先只作用于 localStorage，界面立即变——这一层随便点，不落盘。面板底部一个「把这些设置写进卡片源码」按钮，才真的 readFile 自己的 .ui4a.tsx、替换顶部那个 DEFAULTS 常量块、writeFile 回去。预览显示的是那 8 行常量的前后对照。写完这张卡会被整棵重挂载、所有 useState 归零——按钮下面提前写清楚「保存后卡片会重载一次」，因为那正是它变成新版本的样子；草稿本来就在 localStorage 里，所以什么都不丢。写入只允许自己那一个文件路径，别的 canvas 一律不碰。

_把 §4 那条「edit 会 remount 并清空 useState」的已知陷阱直接变成产品语义：重挂载就是确认动画。这是别的环境根本做不出的一张卡——UI 编辑自己的源码、当场变成新的自己，而安全边界恰好是「只写自己那一个路径」。_

**「我从表格里复制了一堆东西，帮我存成文件」** `either` · `$dsh/fs` `$dsh/chat`

一个大粘贴框，粘进去就猜分隔符（tab / 逗号 / 多空格）并渲染成表格，猜错了可以手选。首行是否表头、每列的列名和类型可改，右上角实时显示「12 行 × 5 列」。输出格式三选一（csv / json / jsonl），下面是即将写入内容的前 20 行预览，用等宽字体、显示真实转义（引号、逗号、换行都按最终字节展示）。文件名可改，默认 data-<日期>.csv；挂载时对该名 readFile 探一次，重名就在按钮上写「该文件已存在，会被覆盖」并把按钮变成第二次点击才生效。只读会话横幅 + sendMessage 把 csv 正文发回聊天。

_「剪贴板里的东西落成工作区里的文件」是最短的一条写路径，人人每周都干，且它把覆盖确认这件事做成了可见的两段式，而不是一个 confirm 弹窗。inline 也成立，所以它顺便测了写卡在两个 surface 上的表现。_

**「这些 md 的 frontmatter 乱七八糟，帮我统一一下」** `canvas` · `$dsh/fs`

readdir posts/ 拿 {name,type,size}[]，逐个 readFile 只解析头部的 --- 块，汇成一张表：行是文件，列是所有出现过的 frontmatter 字段（并集），缺字段的格子空着。列头可以整列操作：补默认值、改名、删列，也能单格改。所有编辑先只改内存，表格上用底色标出「这 9 个文件会被改」。保存前的预览不是整表，是按文件分组的 diff 列表，可逐个展开看那几行 yaml 的前后。写入逐文件进行，只替换首个 --- 块的字节区间，正文一字不动，并把「正文长度不变」当断言显示出来。任何一个文件写失败就停下并列出已改的。只读横幅同上。

_批量写是最吓人的写，所以它需要最强的可见承诺：「只动 frontmatter，正文长度不变」是一个用户能自己验证的断言。列头级操作也让「编辑即界面」成立——同样的活在编辑器里是 30 次手改。_

**「这个测试的 fixture 我想改改看，但不知道改了会影响谁」** `canvas` · `$dsh/fs` `$dsh/exec` `$dsh/chat`

左边编辑 fixture（json，实时校验，坏了不许存）。右边先跑一条只读 rg -l 找出引用这个 fixture 文件名的测试文件，列成清单并可点开看引用那几行——改之前先知道会波及谁。保存后不自动跑测试（15s 会被杀，卡片不该假装能跑完整套件），而是给一个按钮把「我改了这个 fixture，帮我跑一下这几个测试」通过 sendMessage 发回聊天。差异预览是 json 的键级 diff。只读会话下 rg 照跑，只有保存被挡。

_它回答了写卡最该回答的问题——不是「怎么写」，而是「写之前我该看到什么」。而且它诚实处理了 15s 上限（这一条在既有记录里被标为「不诚实的承诺」），把执行交回有多轮能力的 agent。_

**「帮我把 README 顶上那段重写一下，我想看着改」** `canvas` · `$dsh/fs` `$dsh/ai` `$dsh/chat`

上下两栏：上面编辑 markdown 源码，下面实时渲染预览（marked + 自己的样式，不引重型编辑器）。只编辑 README 的一个章节——挂载时按标题切段，用下拉选中要改的那一段，其余部分在预览里灰掉且只读，保存也只替换这一段的字节区间。左侧一条竖直的字数/行数计。有一个「让 AI 给三个改法」的按钮，streamText 流式吐候选，每个候选是可点入编辑框的起点而不是直接落盘——AI 的产物必须先经过人眼和编辑框，绝不从模型直连到 writeFile。保存后 readFile 回来重渲染。只读横幅 + sendMessage 兜底。

_它给出了 ai + writeFile 同处一卡时唯一安全的连法：模型只能填编辑框，落盘按钮永远由人按。这条边界在整个例子集里还没有卡片画过，而它恰恰是最容易被顺手做错的一条。_

**「给我个能记决定的地方，我老是忘了当初为啥这么定」** `canvas` · `$dsh/fs`

侧栏常驻。上面一个输入区：标题、背景、决定、放弃的方案，四个框。写的过程中每次改动只进 localStorage（草稿绝不落盘，避免半句话的文件散在仓库里）。点「归档这条决定」才 writeFile 到 docs/decisions/<日期>-<slug>.md，slug 由标题推导并显示推导结果，重名自动加 -2 而不是覆盖——只创建，永不覆盖，这条写在按钮旁边。下半区是 readdir docs/decisions 出来的历史列表，点开 readFile 只读展示，历史条目在这张卡里不可编辑（要改就是新写一条，这是 ADR 的规矩，也顺便消灭了「改坏旧记录」这一整类风险）。只读会话下草稿照常能写（localStorage 不受沙箱管），只有归档被挡，横幅说清楚草稿还在。

_append-only + 永不覆盖 + 历史只读，是最保守也最容易讲清的写模型，适合当写卡的样板。而「草稿在 localStorage、归档才落盘」正好利用了 canvas 会 remount 清空 useState 这条硬约束，把它变成设计而不是坑。_

**「这个脚本里几个路径写死了，帮我挑一下」** `canvas` · `$dsh/fs` `$dsh/chat`

readFile 脚本，用一条正则挑出所有看起来像路径的字符串字面量，每个变成一行：当前值、一个可编辑输入框、以及一个当场 readFile 探测出来的存在性徽标（存在 / 不存在 / 是目录）。输入时即时重探，把「这个路径根本不存在」当场说出来——这是写死路径最常见的死法。保存只替换这些字面量所在的字节区间，其余一字不动，预览是逐处的行级前后对照，并显示「将修改 4 处」。不做任何格式化、不整理 import、不碰别的行。只读横幅 + sendMessage 把替换清单发回聊天。

_它跟已有的「能改代码的旋钮」形状相近但问的是另一件事：旋钮调的是数值手感，这张卡验的是外部世界是否真的存在。存在性徽标是只有在这台机器上、在这个已打开的工作区里才给得出的信息，纯编辑器给不出。_

### 出错时的卡片

前面所有例子都假设一切顺利。人真正需要帮助时是在这些状态里，卡片的活是诊断不是装饰。

**「这堆栈我看不懂，四十行全是 node_modules」** `inline` · `$dsh/fs`

读：把用户贴的栈按帧切开，对每帧的文件路径跑一次存在性判断（`$dsh/fs` readFile 成功=是你的代码，失败=依赖或运行时），命中的帧再读出前后 5 行。显示：一列折叠的帧，依赖帧默认收起成一句「node_modules 里的 12 帧」，第一个属于你的帧展开并高亮那一行源码，帧号旁标「抛出点 / 你的代码第一次出现 / 调用入口」三个锚。下一步：那一帧下面一个按钮，sendMessage「从 <file>:<line> 这帧开始查，上面是我的代码」。

_栈的信息量全在「哪一帧是我能改的」，而这件事只有在这台机器上试着读一下路径才知道——模型贴回来的栈是照片，卡片是探针。折叠依赖帧是整张卡的全部价值：四十行变三行。_

**「build 挂了，报了四十七个错，我该先看哪个」** `canvas` · `$dsh/exec` `$dsh/fs`

跑：一次构建命令，stderr/stdout 一起解析成 {file, line, code, message}。显示：错误按文件聚成组，组之间画出「A 的错来自 B 导出的类型」这类由 import 关系推出的边，被指向最多、自己不指向别人的那个组置顶标「大概率是这个」，其余标「连锁」并默认折叠。每条错误可点开看 readFile 出来的那几行。下一步：顶部一个「就修这个」，sendMessage 把根因文件和那条错误原文发回去。旁边一个重跑按钮，两次结果做 diff，消失的错标绿、新出现的标红。

_构建失败的痛点从来不是「有错」，是四十七条里四十六条是同一个原因的回声。排序和折叠是纯客户端的，做完一次构建就够，正好落在 15 秒预算里。重跑后的红绿 diff 是修复循环里唯一想看的东西。_

**「这个测试有时候过有时候挂，帮我看看是不是真的偶发」** `canvas` · `$dsh/exec`

跑：同一条测试命令在 15 秒预算内连续跑 N 次（跑一次测一次耗时，动态决定还能跑几轮，跑不满就诚实写「只跑了 3 次」），再单独跑一次「只跑这一个 case」和一次「跑整个文件」。显示：一排通过/失败的点，下面三行结论候选各自带证据——单跑必过+合跑必挂 = 用例间有污染；随机分布 = 真偶发；每次都挂 = 根本不是 flaky，是你上次看错了。失败信息两两做 diff，只有一种失败文本还是好几种，直接写出来。下一步：sendMessage「这个是 <结论>，证据是 <n> 次里 <k> 次挂且都在合跑时」。

_flaky 的三种成因（顺序依赖 / 真随机 / 一直挂）在单次运行里长得一模一样，而区分它们唯一的办法是重复——人不会手动跑八遍，卡片会。也是对 15 秒上限最诚实的用法：不假装能跑完全量，而是把预算花在采样上。_

**「merge 冲突了，一堆文件，我不知道哪些是真冲突」** `canvas` · `$dsh/fs` `$dsh/exec` `$dsh/chat`

读：`git diff --name-only --diff-filter=U` 拿冲突文件，逐个 readFile 切出冲突块。判：每块把 ours/theirs 去掉空白和行序后比较，完全相同的标「假冲突（只是空行/缩进）」，只有 import 行不同的标「import 顺序」，其余标「要人看」。显示：左侧文件树带三色计数，右侧当前块三栏对照（ours / base / theirs），真冲突的块默认展开，假冲突整批折成一行。下一步：每块选一边只记录选择，不写盘；底部「把我的选择发给你」sendMessage 输出一份「文件 X 的第 2 块要 theirs」的清单，由 agent 落地。

_冲突解决里 80% 的块根本不需要人判断，把它们挑出来就是全部工作量的节省。不写盘是刻意的：一个正在 merge 中的工作区是用户最不能承受误写的时刻，而这正好是仓库那条「改动走 sendMessage」规则最该生效的场景。_

**「这个依赖死活装不上，报错我也看不懂」** `canvas` · `$dsh/exec` `$dsh/fs`

跑：把用户的错误文本先做一次分类（网络 / 版本冲突 / 平台架构 / peer / 权限），然后按分类只跑对应的探针——`node -v`、`uname -m`、包管理器 `config get registry`、`env | grep -i proxy`、`curl -sI -m 5 <registry>` 计时。显示：左边「这个包要求什么」（从 package.json / lockfile / 错误文本里抠出来的 engines、os、cpu、peer 范围），右边「这台机器是什么」，不匹配的行画红。网络类的直接给出握手到首字节的毫秒数，超时就写「registry 五秒没响应」。下一步：一条具体命令的按钮，sendMessage 把它连同证据一起发回。

_装不上的五种成因需要五组完全不同的证据，而错误文本本身对新手不提供分诊信息。左右两栏「它要什么 / 你有什么」是这个问题的天然形状——一眼看到红的那行，比读五段解释快。_

**「容器起不来，一直在重启」** `canvas` · `$dsh/exec` `$dsh/fs`

跑：`docker ps -a --format`、`docker inspect <id>` 取 State（含 OOMKilled、ExitCode、Error、RestartCount）、`docker logs --tail 80`。显示：一条状态带写明「第 N 次重启，上次活了 1.2 秒」，正中一句退出码的翻译，并且把最容易混的两种分开——137 且 OOMKilled=true 是被内存杀的，137 且 false 是收到了 SIGKILL（有人 stop 了它 / healthcheck 判死）；再把挂载点逐个拿 fs 探一遍存在性，端口拿 `lsof -i :<port>` 看是不是被别的进程占了。日志尾部只高亮最后一次启动那段。下一步：sendMessage 带上退出码、OOMKilled 真值和缺失的挂载路径。

_退出码 137 的两种含义是这类问题里最贵的混淆，而区分它们只需要 inspect 里一个布尔字段——没人会记得去看。重启循环还有个特点：日志里同一段错误重复了三十遍，只看最后一次启动那段才读得下去。_

**「报 permission denied，我明明是这台机器的管理员」** `inline` · `$dsh/exec` `$dsh/fs`

跑：先用一条无害的探针命令在目标路径上试写（`touch` 一个探针文件），拿到 exitCode 和 stderr 原文；再跑 `id`、对路径链上每一级跑 `ls -ldn`。显示：三选一的判定牌——(a) stderr 是 `Operation not permitted` 而系统权限位看着完全正常 → 这是本次会话被设成了只读，去 composer 改访问模式，不是你的文件有问题；(b) stderr 是 `EACCES/Permission denied` 且某一级目录的属主 uid 不是你 → 直接指出断在路径的哪一级，把那一级高亮；(c) 目录可写但文件被锁/只读位 → 指文件本身。下一步：按判定给出对应的一句话，sendMessage 发回。

_这是本项目独有的、外面任何工具都做不出的分诊：沙箱拒绝和操作系统拒绝对用户呈现的文案几乎一样，而处理方式完全相反（一个改设置，一个改属主）。仓库实测过拒绝是以 exitCode=1 + stderr 的形式返回而不是抛异常，所以卡片能安静地探一下再下结论。_

**「跑着跑着就被杀了，说是内存不够」** `canvas` · `$dsh/exec`

跑：`sysctl hw.memsize` 或 `free -b`、容器里的 `cat /sys/fs/cgroup/memory.max`、`node -e 'console.log(require("v8").getHeapStatistics())'` 之类的运行时上限，再 `ps -o rss,vsz` 采样若干次（在预算内每 1.5 秒一次）。显示：几条水平的天花板线叠在一张图上——物理内存、cgroup 限额、运行时默认堆上限——和一条正在爬的 RSS 曲线，谁先被撞到就标谁，并写明「你撞的是运行时默认堆的 4GB，机器还有 26GB 空着」这类结论。下一步：sendMessage 带上撞到的是哪条线和它的值。

_OOM 有三条互不相干的天花板，用户默认以为是物理内存，而实际上最常见的是运行时或容器限额——「机器还有一半内存空着却被杀了」这句话只有把三条线画在一起才成立。采样天然适合 15 秒预算。_

**「我这命令跑了十分钟了一动不动，是死了还是在干活」** `canvas` · `$dsh/exec`

跑：让用户填 pid 或从 `ps` 列表里点一个，然后每 2 秒一轮 `ps -o state,%cpu,rss`、`lsof -p <pid> -nP` 统计 ESTABLISHED 连接和打开的文件，能用就再抓一次 `sample <pid> 1`。显示：一条随时间滚动的四态带——烧 CPU（死循环/真在算）、0% CPU 且挂在网络 socket（等远端）、0% CPU 且等 stdin（在问你话，你没看见）、状态 D/不可中断（等磁盘）；RSS 在涨说明还在推进，平了十轮说明真卡住。下一步：sendMessage「它卡在 <哪一态>，连着 <host>，等了 N 秒」。

_「卡住」是所有失败态里最没有信息的一个，而四种成因的应对完全不同（等着 / kill 掉 / 回车一下 / 查网络）。它必须是连续观测才有意义——单次快照分不出「慢」和「死」，这一点仓库自己在跑 benchmark 时也踩过。_

**「CI 挂了但我本地明明是过的」** `canvas` · `$dsh/exec` `$dsh/fs`

读：workflow 文件（readFile）抠出 runner 镜像、语言版本、缓存键、安装命令、环境变量名；跑：在本机取同样这些量（`node -v`、`uname -sm`、包管理器版本、`git rev-parse HEAD`、`env` 里同名变量存不存在，值只显示存/不存在不显示内容）。显示：左 CI 右本地的两栏对照，不一致的行标红并按「最可能造成差异」排序（版本 > 架构 > 大小写敏感的文件系统 > 缺失的环境变量 > lockfile 是否被真正使用）。文件名大小写那条特别做：跑一次 `git ls-files` 和实际 readdir 对比，找出只有大小写不同的路径。下一步：sendMessage 把红的那几行发回去。

_本地过 CI 挂永远是环境差异，而差异清单是可枚举的，只是没人肯手动核对十几项。大小写敏感这条尤其值得内建：macOS 上永远发现不了，到了 CI 上就是 module not found，而它在错误信息里长得像一个普通的路径错误。_

**「你刚给我做的那张卡是白的，啥也没有」** `inline` · `$dsh/fs` `$dsh/exec` `$dsh/chat`

读：把出问题的那个 canvas 文件 readFile 回来，扫出它的 import 列表和 default export 的名字。跑：对每个第三方 specifier 跑一次 `curl -sI -m 8 https://esm.sh/<spec>` 并记时间，同一个 URL 连打三次（冷启动会第一次失败第二次成功——单次失败不能下结论）。显示：三种判定分开写——(a) 某个包三次里挂了三次 → 是取不到依赖，不是代码坏了，给出重试按钮；(b) default export 的函数名和某个 import 的名字撞了 → 直接指出这一行，这会让组件递归调用自己、编译不报错、渲染出一张有高度零子节点的白卡；(c) 都正常 → 让用户把卡里显示的文字念回来：空白是模块图死了（我们的问题），以 ERROR: 开头是卡片渲染时抛了（生成的代码的问题）。下一步：按判定 sendMessage，(a) 请重试、(b) 请改名、(c) 带上那行 ERROR 文本。

_这是整个产品最贵的一次混淆，仓库自己踩了不止一次并写进了 §4：依赖没取到、导入被同名默认导出遮蔽、生成代码运行时抛错，三者都表现为一张空白卡片，控制台什么都没有。把「重复测量网络」和「白卡里有没有 ERROR 字样」两条判据做成一张卡，等于把作者调试这套系统的方法交给用户。_

**「rebase 到一半卡在那了，现在这仓库到底是什么状态」** `inline` · `$dsh/exec` `$dsh/fs` `$dsh/chat`

读：`git status --porcelain=v1 -b` 加上 .git 下的状态文件（rebase-merge/rebase-apply 的 msgnum/end/onto、MERGE_HEAD、CHERRY_PICK_HEAD、BISECT_LOG 是否存在）。显示：一句「你在 rebase 的第 4/9 步，正在把 <commit subject> 放到 <onto> 上」，下面列出未解决的路径和已经解决待继续的路径；再给三条出路各自的后果一行话——continue（需要先解决这 2 个文件）、skip（会丢掉这一个 commit，标出是哪个）、abort（回到 rebase 前的 <sha>，你这 30 分钟的解决全没了）。下一步：三个按钮各自 sendMessage 对应的意图，卡片自己一条 git 都不执行。

_中断态的 git 是最典型的「知道自己在哪就解决了一半」——用户不敢动是因为 abort 会丢什么、skip 会丢什么没人告诉他。把三个后果写实、把执行交回 agent，正好是这个仓库那条 consent 规则最该被遵守的地方。_

**「这个接口在浏览器里能通，我脚本里就是连不上」** `canvas` · `$dsh/exec`

跑：对同一个 URL 分层探——`dig +short <host>`（或 getent）、`curl -sv -o /dev/null -m 8 -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{http_code}'`、再跑一次带 `--noproxy '*'`、再打印 `env | grep -iE 'proxy|no_proxy'`、`curl --version | head -1` 看有没有走系统证书。显示：一条四段的阶梯（DNS → TCP → TLS → 首字节），断在哪一段哪一段标红并写出该段的原始报错；下面一行关键对照——「带代理通 / 不带代理不通」意味着你的脚本没读代理环境变量，「curl 通但 node 不通」同理。下一步：sendMessage 把断掉的那一段和代理对照结论发回。

_网络失败在应用层永远只报一句 connect failed，而 DNS、TCP、TLS、代理四层的修法互不相干。分段计时是 curl 现成能给的，做成阶梯就一眼看得懂；而「浏览器通脚本不通」几乎总是代理，这个对照实验值得内建成一个固定按钮。_

**「这错误以前没有的，什么时候开始的」** `canvas` · `$dsh/exec` `$dsh/chat`

跑：从错误文本里抠出符号名/文件名，`git log -S '<symbol>' --oneline -n 30` 和 `git log --oneline -n 30 -- <file>`，把两串按时间合并；再对最近若干个 commit 逐个跑一次极轻量的验证命令（用户填，默认取 build 或单个测试），每跑一个记 exit code，能跑几个就跑几个，超预算就停下并写明「只验到 <sha>」。显示：一条 commit 时间线，验过的染绿/红，没验的留灰，红绿交界处标「嫌疑区间」并展开那一段的 diff --stat。下一步：sendMessage「坏在 <good sha>..<bad sha> 之间，改了这几个文件」，让 agent 接着 bisect。

_这是唯一一种能把「什么时候坏的」变成可点的形态，而卡片必须诚实对待 15 秒上限——它不假装能 bisect 完，它只把区间从三十个 commit 缩到两三个，然后把接力棒交给有多轮能力的 agent。灰色的「没验到」格子和绿红一样重要，是这张卡不撒谎的地方。_

### 不在写代码的人

写作、读、计划、决定、学、记、跟人沟通、钱和健康和家人。

**「明天的会我主持 一共八个议题 每次都超时 帮我搞个能按的议程」** `canvas` · `$dsh/chat`

侧栏常驻的活议程：每个议题一行，左边是预算时长（可拖），右边是实际用掉的时间条。按「开始」进入当前议题，条子实时长；超时后整行转成警示色并轻响一声（此时用户已经点过按钮，Web Audio 已解锁）。顶部一行大字实时算「按现在的速度，最后两个议题只剩 3 分钟」，超支的时间自动从后面的议题里按比例扣，被扣到 0 的议题灰掉并打上「下次再说」。每个议题下面可以随手敲一行结论。整场结束按「收工」，把所有结论 + 被砍掉的议题通过 sendMessage 发回聊天，让 agent 整理成会议纪要。议程和计时进度全部存 localStorage——会开到一半刷新页面不能清零。

_这是全组里唯一一条「在它开着的时候用它」的卡：不是看完就走，是会议进行中一直摆在侧栏。panel 的持久化和可拖宽度在这里是刚需而不是顺带。而且它是纯人际场景——超时的代价是屋里另外七个人的时间。开发者的非代码工作里，主持会议是最高频也最没工具的一件事。_

**「这份合同我不敢签 帮我把对我不利的条款挑出来」** `canvas` · `$dsh/fs` `$dsh/ai` `$dsh/chat`

用 readFile 读进合同（或直接粘），按条切开，每条一行，左侧一根风险竖条（深浅=对我的不利程度）。整列默认按不利程度排序，不是按原文顺序——你最该看的在最上面。点开一条，下面抽屉里 streamText 用大白话讲「这句话真正的意思是：如果 X 发生，你要承担 Y」，并明确标出「这条是行业常见」还是「这条不常见」。每条右边一个勾「我要求改这条」。底部按钮把所有勾选的条款连同你自己补的一句话，通过 sendMessage 变成一条给 agent 的消息：「帮我把这几条改成对我更公平的措辞」。醒目免责：这不是法律意见。存 localStorage，签之前会再打开一次。

_「不敢签」是真实的、带恐惧的日常句子，而合同天然是一份「你没写过、又必须读懂」的文档——散文回答在这里最没用，因为你要的是逐条可勾选的对象。条款语言是无限开放的空间（不是五个的集合），$dsh/ai 用在这里完全站得住；而它诚实地不假装能谈判，把要求改的条款交回聊天。_

**「同事这个 PR 描述我看不懂他到底改了啥 帮我理一理」** `canvas` · `$dsh/exec` `$dsh/fs` `$dsh/chat`

左边贴 PR 描述原文，右边用 bash 跑 `gh pr diff` / `git log --stat` 拿真实改动，两边对齐成一张对照表：描述里声称的每一点前面一个标记——「代码里找得到」绿、「找不到对应改动」黄、「代码改了但描述没提」红（这一列最有用）。红的那几行是你 review 时唯一真正要问的。每行一个「问这个」按钮，sendMessage 把问题写成一句人话发回聊天，攒成给同事的评论草稿。exitCode !== 0 时（比如没装 gh）整块降级成只读描述并说明原因，不装作跑通了。

_review 别人的 PR 描述是开发者最典型的非代码工作，而且是人对人的：你要给同事写评论。「描述没提但代码改了」这一列是模型和 shell 一起才拿得到的信息，纯文字回答给不了。而且它严格只读——跑的全是 git/gh 的查询命令，任何动作都走 sendMessage。_

**「这个活我报几天 我老是低估」** `inline`

三个滑块：最顺利、最可能、最糟糕。中间实时画一条概率分布小曲线，下面大字给出 50% 和 90% 两个交付日期（「一半概率 3 月 12 号前交，想有把握就报 3 月 20」）。再加一个「我的历史低估系数」滑块，默认 1.5，拖它整条曲线右移。底部一句大白话：「你说的 5 天，按你自己的历史，实际大概是 8 天」。把两个日期做成可复制的一句话。

_这句话是每个人在被问「多久能好」时心里真正想的。答案不是一个数而是一个分布，只有能拖的界面能表达；而且它故意不带 ai——PERT 是一道公式，让模型算是纯装饰。「我老是低估」这半句自带自嘲，是真人打字的语气。_

**「我们下个月要从旧系统迁过去 帮我把步骤排一下 哪步做了就回不了头」** `canvas` · `$dsh/chat`

竖排的步骤卡，可拖动排序，每张卡上一个开关：「可回滚」/「回不了头」。所有回不了头的步骤之上自动画一条粗的不可逆红线，线以上写「过了这条线，回退要停机」。有依赖关系的两步之间连一根线，顺序拖错了线变红并提示「B 依赖 A」。每张卡可以补一句「回滚办法」，没填的回滚步骤打问号。底部统计「12 步里 3 步不可逆，其中 2 步没写回滚办法」。整份计划存 localStorage，改一个月。

_迁移计划是开发者写得最多、工具最少的一类非代码产出物——今天大家都在 markdown 里手排。「哪步回不了头」是这份文档唯一真正重要的信息，而它在纯文本里永远是散在各段的一句话，做成一条能看见的线才有用。canvas 因为这份计划要改一个月，不是看一眼。_

**「两个 offer 我实在选不出来 帮我理一下」** `canvas` · `$dsh/chat`

左右两栏，中间是一排你自己加的维度（钱、通勤、老板、能学到啥、稳定性…），每个维度一根权重滑块，两边各打分。右侧实时出总分和一条差距条。关键的一步在最后：算完之后按「翻硬币」，屏幕给出一个随机结果，下面只有一句话——「看到这个结果的一瞬间，你是松了口气还是有点失望？」，两个按钮。选了以后卡片把你真正的倾向写出来，并回头标出是哪个维度的权重被你自己打低了。所有打分存 localStorage，这种事要想好几天。

_决策不是算术，加权打分表满大街都是且没人真被它说服；这张卡的价值全在最后那个翻硬币的动作——它把「看到结果时的第一反应」变成了一个可点击的输入。这是纯 UI 才做得到的心理学小把戏，散文回答里说「你可以试试翻硬币」完全没有同样的效果。_

**「爸妈的药老是搞混 帮我排个一天该吃啥的表」** `canvas` · `$dsh/chat`

横轴是早中晚睡前四格，纵轴是药名，每种药填剂量、饭前饭后、是否不能和别的一起吃。冲突的两种药在同一格里会碰出提示条。做出来的表是给老人看的：字特别大、每种药一个颜色圆点、饭前饭后用一个碗的小图标而不是文字。下面一排七天的打勾格，吃了就点一下，存 localStorage，一眼看出昨天晚上那顿是不是漏了。底部按钮把这张表通过 sendMessage 发回聊天，让 agent 排版成能打印贴冰箱上的样子。

_家人 + 健康 + 记忆，三样都在，而且是那种「你在电脑前，爸妈在电话那头」的真实时刻。它的设计约束很特别——成品不是给提问的人看的，是给一个七十岁的人看的，这个约束逼出的界面（大字、颜色点、碗图标）跟前面所有卡都不一样。canvas 因为要连着记一周。_

**「这篇论文我每次读到第三页就走神 帮我拆成能一段一段啃的」** `canvas` · `$dsh/fs` `$dsh/ai` `$dsh/chat`

readFile 读进 pdf 转出的文本或 md，按小节切成一屏一段。每段读完下面 streamText 出一个只有一句话的检查问题（不是测验，是「你能用自己的话说说这段在反驳谁吗」），有个输入框，你打的答案存下来。答不上来的可以点「这段我没懂」，sendMessage 把这一段原文抛回聊天让 agent 展开讲。顶部一条进度条 + 「你在这篇上花了 47 分钟，还剩 3 节」。所有进度和你写过的答案存 localStorage——这东西的全部意义就是明天还能接着读。

_「读到第三页就走神」是学习场景里最诚实的一句抱怨，而它的解法确实是个界面：把一篇长文变成有节奏、有回合、有记录的东西。它跟被毙掉的通用 flashcard 的区别是内容全部来自你手上这份真文件，且 ai 用在生成问题这个真正开放的地方。_

**「同事结婚 我随多少合适 我们关系一般但一个组的」** `inline`

三个滑块——关系亲疏、城市档次、去不去到场，中间给一个数区间而不是一个数，下面一行小字解释这个数是怎么来的（「同组同事、二线城市、到场：多数人在 600–800」）。旁边一个「对方之前随过我」的开关，打开后填个数，区间自动对齐。底部给一句可复制的转账留言。

_这是那种绝对不好意思问真人、但每个人都真的会打给 AI 的问题，而且答案天生是区间不是数字——纯文字回答只会说「视关系而定」，等于没说。措辞里「我们关系一般但一个组的」这半句尴尬感很真。形状明摆着是 widget，不需要任何能力，也不该假装需要。_

**「这段我写了三遍还是别扭 你别改 就告诉我哪儿别扭」** `inline`

把粘进来的段落逐句拆行，每句后面一根长度条——一眼看出是不是连着五个长句没喘气。重复用到的词高亮成同一个颜色（「其实」出现了四次），被动句、套娃的定语从句、三个以上逗号的句子各打一个小标记。底部三个数：平均句长、最长的那句、你最爱用的词。不给改写版本，一个字都不改。

_「你别改，就告诉我哪儿别扭」是写东西的人真正想说的话——大多数 AI 写作工具的问题恰恰是它直接替你重写了，而你学不到东西。这张卡的克制就是它的卖点，也是它不需要 $dsh/ai 的原因：句长、重复词、被动句全是可数的，交给模型反而更不可信。_

**「体检报告好几个箭头 我到底哪个要紧哪个不用管」** `canvas` · `$dsh/ai` `$dsh/chat`

每个异常指标一行，画成一条数轴：正常区间是一段浅色带，你的值是一个点，点离带子多远一目了然。整列按「偏离程度」排序而不是按报告原顺序。点开一行，streamText 用大白话讲这个指标是干嘛的、单独一个偏高通常意味着什么、什么情况下才值得紧张，并明确说「这个要结合别的指标看，我看不到你的全部情况」。每行一个勾「问医生」，底部把勾中的指标整理成一句可以直接念给医生听的话，走 sendMessage 交回聊天。反复出现的醒目免责。

_体检报告是最典型的「一份你看不懂但关于你自己的文档」，而它的核心信息——离正常范围多远——在 PDF 里恰恰是最看不出来的。数轴这个形状把它变成三秒钟的事。它同时严格守住了边界：不下结论，产物是一句给医生的话。_

**「周六一天 得陪娃 还要买菜 我还想睡个午觉 帮我排一下」** `inline`

一条从早八点到晚十点的横向时间条，把要做的事拖成一个个色块，长度就是耗时。重叠的两块直接闪红。娃的睡午觉时段做成底纹，落在上面的块自动提示「这个时候他要睡了」。剩下的空档用浅灰标出来并标注时长，一眼看出「你今天其实只有一个 40 分钟的完整空档」。最后一行大字就说这一句。

_带孩子的周末规划是纯文字最容易骗人的地方——列成清单看着都排得下，画成时间条才发现根本塞不进去。「我还想睡个午觉」这半句是真人打字的语气，也是整张卡真正要回答的问题。一次性，所以是 inline，不该变成一个日历 app。_

**「三张机票 便宜那班要转两次 到底值不值」** `inline`

三个航班并排，横条画的是门到门总时长（含到机场、转机等待、落地进城），不是航司写的飞行时间——转两次的那条一下子长出一大截。下面一根滑块「你的一小时值多少钱」，拖它，三条的「真实成本 = 票价 + 时间成本」实时重排序，谁跑到第一位一目了然。底部一句：「按你 80 块一小时算，省的 400 块要你多花 6 小时」。

_这是经典的「便宜其实不便宜」，而人脑算不清，因为票价是明码而时间是隐性的。滑块把「你的时间值多少钱」这个从来没人明写的参数变成可拖的东西，拖一下结论就翻转——这正是可交互界面独有的说服力。没有任何能力依赖，也不需要。_

**「明天要跟老板提涨薪 帮我想想他会怎么怼我」** `canvas` · `$dsh/ai` `$dsh/chat`

左边是你的开场白（可编辑），右边 streamText 逐条生成老板可能的反驳，每条一张卡，按「你最难接的」排序。每张卡下面一个空框让你写自己的回应，写完点「这条我能接住」打勾。接不住的点「帮我想想」，sendMessage 把这一条抛回聊天让 agent 陪你练。顶部一个进度：「7 个反驳，你接住了 4 个」。全部存 localStorage——今晚练一半，明早上班路上再翻一遍。

_这是纯人际、纯情绪、且真的会在半夜打出来的一句话。它把「排练一场谈话」变成了可以打勾的对象，而这件事人自己在脑子里做永远是发散的。老板的反驳是无限开放的空间，$dsh/ai 用得其所；接不住的交回 agent 多轮陪练，正好补上单轮的短板。canvas 是因为明早还要再看一遍。_

**「这个保险条款说的赔付 我到底啥情况能赔」** `inline`

把条款里的赔付条件编成一棵是/否的树，一次只问你一个问题（「是意外导致的吗」），点了往下走一步，路径留在上面像面包屑，可以点任意一步回头改答案。走到底给出「赔 / 不赔 / 要看材料」三种结果之一，并把这一路踩过的原文条款列在下面，每条可展开看原句。走出不赔的结局时，标出是哪一步把你挡在外面的。

_保险条款是「一堆嵌套的如果」，人读不进去是因为大脑没法同时压住五层条件——一次只问一个问题就全解决了。它跟前面的合同卡是相反的方向：那张是扫描全文找风险，这张是带着一个具体情况走完一条路径。答案是路径不是段落，只能是界面。_

**「这个群一百多条我没看 就告诉我有没有轮到我做的事」** `inline` · `$dsh/ai` `$dsh/chat`

粘进聊天记录，streamText 边出边分三堆：「点名要你做的」「没点名但你大概逃不掉的」「纯热闹」。第一堆每条带原话引用和是谁说的，右边一个勾。第二堆每条给一句「为什么我觉得会落到你头上」。第三堆折叠成一行「另有 83 条闲聊」，点开才展。勾完底部生成一句可以直接发回群里的话（「上面那两件我来，周三前给」），可复制，也可以 sendMessage 让 agent 帮你排期。

_「一百多条没看」是打工人每天真实的一句话，而它要的不是摘要——摘要工具满地都是且没人用——要的是「有没有轮到我」这一个判断。把结果分成「点名的 / 逃不掉的 / 纯热闹」三堆，第二堆才是真正值钱的那堆，也是模型独占的判断。产出物是一句能发回群里的话，人对人的闭环收在这。_

### 一条回复里多张卡 / 撑住规模的卡

几乎所有例子都是一张自足的卡。这组推的是关系、规模和翻页。

**「帮我把这个 canvas 拆一下，都塞一个文件里我看不动了」** `canvas` · `$dsh/fs`

The model splits an existing large canvas — say the 496-line tarot.ui4a.tsx — moving data and helpers into .dsh/ui4a/canvases/<id>/*.tsx and leaving the entry importing them with `./tarot/deck`. The panel must then still render.

_This is the sub-page question stated as something a user actually says, and it is the cheapest possible test of the gap. src/prompt.ts:47 promises relative sub-page imports; .dsh/ui4a/canvases/tarot.ui4a.tsx:3 shows the model already does it; but GenUISurface.tsx:102-107 passes no `filename`, so compiler.ts:45 uses `_.tsx` and partial-react's runtime.ts:17-18 says `./deck` becomes the unresolvable `_.tsx/deck`. mergeFallbackImports cannot help (importMap.ts:20 excludes dot-relative). serveCanvas (index.ts:105) never fetches the child anyway. Expected outcome: a blank panel with nothing in the console — the exact §4 signature of a dead module graph. One turn either confirms the whole chain or falsifies my reading._

**「把咱们这次聊的东西整理成一个能翻页的小册子，一页一个主题」** `canvas` · `$dsh/fs` `$dsh/ai`

A multi-page canvas: the entry file is a shell with a left rail of page titles and a content area; each page is its own file under <id>/. Clicking a title swaps the rendered sub-component. Current page number in localStorage so reopening lands where you left.

_The intended use of the sub-page contract, phrased as a thing people ask for rather than as a directory layout. It is the second, larger probe of the same gap: where the previous intent tests one relative import, this one tests a whole tree plus a router, so if the plugin ever gains `filename` resolution this is the intent that shows whether a many-file canvas is pleasant or merely possible. The remount fact from §4 matters here — a canvas edit resets every useState, so the current page has to live in localStorage or every edit throws the reader back to page one._

**「我们仨轮流值班，这个月怎么排大家都能接受」** `either`

Two blocks in one reply. The first is a compact month grid, one cell per day, colored by who is on. The second is a fairness readout — nights each, weekends each, longest streak — that recomputes when you drag a day in the grid. They agree through one localStorage key holding the assignment array; the grid writes it, the readout reads it on the same tick.

_The cleanest two-card relationship: a manipulable thing and a verdict on it. §4.5 only ever measured that three inline blocks coexist — nothing tested whether two of them can share state, and localStorage is the only channel they have (each fence gets its own GenUISurface and its own blob module; nothing passes props between them). Also a real reproduction case for §4's console.error refcount trap, which is explicitly a concurrent-card bug and which a chat node is 'multi-card by nature'._

**「nginx 这三份配置我不知道该用哪个，线上是哪份」** `canvas` · `$dsh/fs` `$dsh/exec`

Three panels side by side under one shared scroll position, differing lines tinted; above them a single strip saying which directives actually differ and which of the three the running process is using. Reading is via readFile; the running-config check is one command whose exact text is printed above its output.

_The heaviest multi-card ask in the set, and deliberately so: three surfaces plus a summary strip in one reply is the concurrency stress §4 predicts will lose the host's console.error permanently. It also exercises the consent rule the repo tested head-on — inspecting which config is live is observation, and any 'switch to this one' has to leave through sendMessage. Nothing in examples.md compares three files at once; the closest is the two-branch comparator in the exec section._

**「这仓库里到底有多少地方在用这个函数，全给我列出来别省略」** `canvas` · `$dsh/exec` `$dsh/fs`

One `rg -n --json` pass, results held in a plain array and drawn through a windowed list — only the ~40 rows in view are React elements, the rest is spacer height. A header states the true count, and if $dsh/exec reported truncation it says so in that header rather than silently showing a short list.

_The thousands-of-rows case. 'Don't skip any' is what a person actually says, and it forces the windowing rather than the model's habitual `head -200` (which the examples.md live-ripgrep card does). The truncation display is not decoration: commit c99aed4 split `truncated` into per-stream flags precisely so a card can distinguish which stream was cut, and this is the intent where lying about the count is the worst failure. 15s bash kill is the other real ceiling and belongs in the same header._

**「这个构建到底卡在哪一步，我盯着终端看不出来」** `canvas` · `$dsh/exec`

A card that re-runs one cheap status command every second or two and draws the last ~60 samples as a small strip — which step is current, how long it has been there. It shows the exact command it is polling, and stops polling itself when the run ends or the panel is closed.

_The timer intent, but a timer with a side effect rather than a clock. pomodoro and stopwatch already prove the pure-clock form; nothing in the repo polls $dsh/exec on an interval, and examples.md's git-status card explicitly uses a manual refresh button instead. It lands directly on the gap examples.md recorded as known and unfixed — no AbortSignal, so a card firing a command per tick cannot cancel the previous one — which makes the self-stop condition the interesting part rather than a detail._

**「给我起一堆名字，我一个都看不上就再来，直到我说停」** `canvas` · `$dsh/ai` `$dsh/chat`

A button starts it; each round is one streamText call whose output appends to a running list, and when the stream finishes a state flag decides whether to fire another. A Stop button clears the flag — the current stream finishes, no new one starts. Kept names get starred into localStorage; the rest scroll away.

_The keeps-generating case, phrased honestly against the measured API: $dsh/ai is single-turn with no tools and no abort, so 'until stopped' can only mean a loop between calls, and the Stop button stops the next one. It also sits on the enumerability rule from the 2026-08-22 §4.5 section — the model reads 'fixed' as 'known to me', and the fix was the closed/open test. 'Until I say stop' is the most explicitly open request possible, so it should clear that bar without argument. 给我五个猫名 in the repo was the one-shot version; this is what happens when five is not enough._

**「还有多久发布」** `canvas` · `$dsh/exec`

Almost nothing. One number, very large, centered, with a word under it. No border, no card chrome, no legend. It stays one number at 320px and at 720px — the container query changes the type size, not the column count. One small line at the bottom names where the number came from.

_The mostly-empty-on-purpose case, which has no precedent in any of the 895 intents — every one of them fills its surface. It is also the reverse test of the container-query work in §2.5, which was verified going one way (560px single column → 640px three columns, on the model's own 38rem breakpoint) and never tested for a design that refuses to add columns when given room. The prompt is four characters because a card that is mostly empty has to come from a question that is mostly empty; asking for it elaborately would produce something elaborate._

**「这个报错我搜了半天没头绪，你先别急着改」** `either` · `$dsh/chat` `$dsh/fs`

Two blocks. The first is a short list of candidate causes, each one line, each with a button. The second block does not exist yet — clicking a candidate sendMessages '先查第三个：连接池被耗尽了？' and the model's next reply carries the evidence card for that one branch, replacing the question in practice by superseding it.

_The question-card-whose-answer-replaces-it, written the only way the runtime permits: a card cannot swap itself out, but ctx.conversation.send puts the choice in the transcript and the next reply carries the replacement. §4.5's $dsh/chat run measured 5/5 wiring every option to sendMessage and 5/5 sending human-readable text, so the mechanism is proven — what is untested is a two-card reply where the second card's content is decided by a click on the first. '你先别急着改' is also the phrasing that makes it a question card rather than a fix._

**「这个 JSON 太大了打不开，先给我看看长什么样」** `canvas` · `$dsh/fs`

readBytes the file, and show the shape rather than the content: top-level keys, array lengths, the type of each field, one sample value per path. Expanding a node reads only that slice. Nothing renders the whole document — the header states the byte size and how much was actually parsed.

_The other half of the thousands-of-rows problem: not a long list but a deep object, where the failure mode is the browser dying on the parse rather than on the render. readBytes exists for exactly the reason that matters here (commit c703340 — readFile UTF-8-decodes, and a large file read as text is both slow and lossy for anything non-text). It is also the reading-vs-photograph rule from §4.5's capability section in its most obvious form: the model summarizing the JSON itself would be a snapshot, and the point is that the user opens nodes the model never looked at._

**「刚跑完的测试挂了几个，我想边看边试着改」** `canvas` · `$dsh/exec` `$dsh/fs` `$dsh/chat`

Failures on the left as a list; selecting one shows its assertion and the source lines around it via readFile on the right. Each failure has a 'this one is mine' note field that persists in localStorage, so triage survives the remount an edit causes. Re-running is one button that shows its command; fixes leave through sendMessage.

_examples.md has two test-runner cards and both stop at 'show pass/fail with expandable detail'. What neither does is survive being worked alongside — and §4 records that a canvas edit remounts the tree and resets every useState while localStorage survives, which makes triage notes the exact thing that must not be state. It also inherits the honest limit examples.md already flagged as an over-promise: 15s kills a real suite, so the card has to say what it could not finish rather than report a green it did not earn._

**「帮我看看这几个域名到底指到哪去了，有俩我怀疑早就废了」** `either` · `$dsh/exec`

A summary block first — how many resolve, how many do not, how many point somewhere unexpected — then a per-domain block with the actual answer for each, the resolving command printed above its output. The summary is the thing you screenshot; the detail is the thing you scroll.

_The plainest form of the summary-card-plus-detail-card ask, chosen because the split is inherent to the question rather than imposed: 'how bad is it' and 'which ones' are two different reads at two different moments. Unlike the rota intent these two do not share state at all — the summary is derived once from the same command output — which makes it the control for whether two related blocks need a channel or merely need ordering. Every command is read-only, so it sits cleanly inside the observe-only rule verified on 2026-08-22._

**「我这台机器上装了几个版本的 node，到底哪个在管事」** `inline` · `$dsh/exec`

One block: the resolution chain as a short vertical list — what which returns, what the version managers each think, what the shims point at — with the one that actually wins marked. Each row carries the command that produced it. Fits in a chat column without scrolling.

_The fourth trigger shape from §4.5 — an expression the user is holding — applied to an environment instead of a cron line, and the tell the repo named is present: the answer is already a table. It is also the small-and-inline control for this batch, which is otherwise heavy on canvases and multi-block replies; §4.5's 'simple is what makes it cheap to build, not what makes it unwanted' is exactly the excuse this prompt invites, and the cron/glob/chmod result (3/3 flipped) says the rule should hold here._

**「把上次那个卡片再打开一下，我改两个数」** `canvas` · `$dsh/fs`

No new file. The reply is a pointer to a canvas written days ago, opened from the launcher's workspace listing, with its localStorage state exactly as it was left.

_The one intent here that asks for no card at all, and the only test of the claim §3.6 makes about the launcher — that a canvas outliving its session is reachable because serveCanvas with no `id` lists the whole directory. Worth asking because the same listing is where the sub-page gap becomes user-visible: index.ts:100 flatMaps through canvasIdOf, which requires the .ui4a.tsx suffix, so a canvas's own child directory is silently absent from the picker. It also checks the wrapped workspaces.openPath behaviour §3.6 describes, where a contract path shows the panel instead of handing the file to an editor._

### 没听说过这个功能的人

门槛比演示高：他**本来就会打这句话**，在任意仓库里，一轮之内就有回报。

**「帮我写个 commit message」** `inline` · `$dsh/exec` `$dsh/ai` `$dsh/chat`

One `git diff --cached --stat` + `git diff --cached` on mount, shown as a compact change summary at the top (files, +/-). Below it, three or four candidate subject lines in different registers — terse conventional-commit, plain descriptive, one that names the _why_ — each with an optional drafted body, generated through streamText so they land one at a time. Each candidate is a click target: clicking sends it back as the user's next message ("用这条：fix(auth): ..."), so the agent runs the commit. A small editable field under the selected one for a hand tweak before sending. If the index is empty, the card says so and offers the unstaged diff instead of rendering an empty shell.

_The most-typed sentence in this list — anyone using a coding agent types it several times a day, with no knowledge of the plugin. Trigger is strong on two counts: it is 'asking for a few of something' (the rule §4.5:529–565 added after 给我五个猫名 produced no UI at all), and the answer the model was going to write is already a list of options. Genuinely open-ended, so it survives the enumerability test that killed the Tokyo case. Observe-only holds naturally: the card reads the diff, the commit goes back through sendMessage — the exact shape the model chose unprompted in the untracked-files test (CLAUDE.md:636–647). Oh: the diff is right there and the options are already written._

**「这个报错我看不懂，日志贴给你了」** `inline` · `$dsh/fs` `$dsh/chat`

The pasted log is parsed into stack frames and grouped: frames inside the user's own code get full contrast and a file:line anchor, node_modules / runtime frames collapse into a single dimmed 'and 34 frames of library' row that expands on click. The one line the card believes is the actual cause sits at the top in plain language, with the raw line underneath verbatim so nothing is taken on trust. Clicking a project frame reads that file through $dsh/fs and shows the five lines around it in place — the real current source, not a remembered version. A button at the bottom sends '从 src/x.ts:42 开始查' back to chat.

_Ordinary to the point of invisible: everyone pastes a stack trace. 帮我把这段报错翻译成人话 is in the flagship set, but that is a translation; this is the *fold*, which is where the payoff is. Directly consumes the §4.5:529 photograph rule — the model's instinct is to read the file with its own tools and paste lines in as literals, and 'reading it yourself is not the card reading it' took that from 0/2 to 2/2. Trigger risk low: a stack trace is the fourth shape almost by definition, an opaque expression the user is holding. Oh: forty lines collapse to the three that are yours, and clicking one shows live source._

**「这个 SQL 有点慢，我 explain 了一下，你看看」** `inline`

The EXPLAIN output becomes the tree it actually is: nested nodes indented by depth, each node's estimated rows drawn as a bar so a 12-row nested loop and a 4M-row seq scan are visibly different objects rather than two similar lines of text. The node where estimated and actual diverge worst is outlined. Toggles across the top flip the assumptions the plan depends on — 'assume an index on user_id', 'assume stats are current' — and the tree redraws to show which node the change would have moved. Nothing is executed; the card reads the plan the user already has.

_A query plan is the fourth trigger shape in its purest form — an expression the user is holding where the prose answer is already a table, the exact tell §4.5:597–617 added and measured 3/3 on. Real people paste EXPLAIN output constantly and get back a paragraph they re-read three times. No capability needed at all, so it is the cheapest one-turn payoff in the set: everything it needs is in the message. Oh: the seq scan is physically nine times taller than everything else._

**「这两个 json 有啥不一样？我这边好的那个和坏的那个」** `inline`

Two paste areas, then a structural diff by key path rather than by line: keys present in one and missing in the other, keys in both with different values, and — the part a text diff never gives — keys whose _type_ changed (string "1" vs number 1, null vs absent). Unchanged subtrees collapse by default so the screen holds only differences. A filter box narrows by path prefix; value diffs show both sides inline. Order-insensitive, which is the whole reason `diff` on two files fails the user.

_Config that works on one machine and not another, an API response that changed shape — weekly for anyone integrating anything, and the thing people currently do (diff two pretty-printed files) fails on key order and misses type changes entirely. examples.md has 「这个 diff 我看不出来改了啥」 for source and 「.env 和示例文件对得上吗」 for env files; neither is structural JSON. Two pasted blobs are two expressions the user is holding, so the fourth-shape trigger applies, and the answer was going to be a table of paths anyway. Oh: the difference was a string "1" against a number 1, and no line diff would have said so._

**「这个功能我准备这么做，你看看有啥漏的」** `canvas` · `$dsh/fs` `$dsh/chat`

The user's plan restated as an ordered list of steps, each with a checkbox and a one-line note on what it touches. Beside it a second column the card fills in itself: for each step, the files it would have to change, read live through $dsh/fs so paths are real and clickable rather than guessed. Steps whose target file does not exist get flagged — usually where the plan is wrong. A third column is empty and editable: risks the user thinks of while reading. Everything persists to localStorage under the canvas key, so tomorrow it is still there with the boxes ticked. Ticking the last box sends a summary back to chat.

_People say this before every non-trivial change and are not asking for UI. It is the request shape the resident layer already lists (a procedure, steps to step through) and it fails the enumerability test in the right direction — a plan for *this* repo is not printable from memory, it has to look. Persistence is a real requirement rather than a demo of one, which is what CLAUDE.md:294 demands of a canvas, and the plugin's own measurement moved canvas persistence 8/19 → 17/19. Oh: two of the files your plan assumed exist, don't._

**「这堆日志里的报错，哪些其实是同一个问题」** `canvas` · `$dsh/fs` `$dsh/chat`

One bounded read of the log file through $dsh/fs, then clustering by normalized shape — timestamps, ids, ports and paths stripped so 'connect ECONNREFUSED 127.0.0.1:5432' and the same line with a different port land together. Each cluster is a row: count, first and last occurrence, one representative line verbatim. Rows sort by count, so 900 identical noise lines sink into one row and the two-occurrence oddity becomes visible, which is the point. Expanding a row lists the real lines. A 'this one' button sends the representative line back to chat to be chased.

_The realistic version of 'the build failed and there are 4000 lines': the person does not want them read, they want to know how many distinct problems there are. Answer-is-already-a-table applies, and enumerability is the strong framing — the model cannot know what is in *this* log, so the 'I already know this' reasoning §4.5:529 identifies as the blocker never arises. Deliberately not framed as watching a running build: the 15s exec kill (CLAUDE.md:618) makes that a promise the surface cannot keep, and examples.md already calls out that dishonesty. Oh: 4000 lines were four problems._

**「这个跑一次大概要多少钱？」** `inline`

A cost model with the pieces exposed as fields rather than baked into a sentence: input tokens, output tokens, calls per run, runs per day, and per-model rates in a small editable table. One big number for per-run cost, a second for per-month, and a stacked bar showing how the total splits between input and output — usually the surprising part. A cache-hit-rate slider redraws it, because that is the lever people actually have. Changing any field moves everything at once.

_Two years ago nobody typed this; now anyone wiring up an LLM feature types it before shipping. The archetypal 'numbers the user might change' trigger the resident layer has carried since round one, and unlike the currency case in §4.5:566 — which lost its whole turn to searching for a live rate — the numbers are the user's own, so no lookup swallows the turn. That contrast is exactly why I rank it above the exchange-rate shape that measurably failed. Oh: output tokens are 80% of the bill, and the slider says caching barely helps._

**「这个函数叫啥好？我实在想不出名字」** `inline` · `$dsh/fs` `$dsh/ai` `$dsh/chat`

The user pastes or names the function; the card reads it through $dsh/fs if it is in the workspace, then streams candidate names in — each with a one-line justification and, crucially, the call site rendered with that name substituted, so the name is judged in the position it will be read in. Names group by convention (verb-first, noun, get/compute/derive) so the choice is between styles rather than twenty flat strings. Clicking one sends '就叫 xxx' back to chat and the agent does the rename.

_The most-typed non-technical sentence in programming, and the one where prose is worst: a bulleted list of names is unusable because a name is only judgeable in a call site. Hits 'asking for a few of something is asking for more of them' — the rule added after 给我五个猫名 produced nothing — and passes enumerability cleanly: good names for *this* function are not a set of five, which is the framing that took the failing $dsh/ai prompts to 2/3. Oh: seeing the name inside its own call site instantly kills three of the four candidates._

**「这个 PR 太大了，帮我拆一下」** `canvas` · `$dsh/exec` `$dsh/chat`

One `git diff --stat` plus per-file hunk headers, rendered as a board of hunks the user drags into named piles. The card seeds the piles with a guess — pure renames together, test files with the code they cover, formatting-only hunks in their own pile — and each pile shows its own stat line so the user can see when one is still too big. A pile can be sent to chat as '先提交这些：<file list>', which is what actually splits the branch: no staging, no resets, no destructive commands anywhere in the card.

_Everyone who works with an agent ends up with a branch that grew too big, and this is the sentence they type. It is the one place where the consent finding (CLAUDE.md:636–647) does visible work rather than being obeyed quietly: splitting a branch is inherently mutating, so the mutating half leaves through sendMessage and stays in the transcript. The model chose exactly this shape unprompted in the untracked-file test, the best available evidence it will hold here. Oh: the 40-file diff was really three commits, and one of them is pure formatting._

**「这段文案帮我换几种说法」** `inline` · `$dsh/ai` `$dsh/chat`

The original sits at the top, unedited. Below it, variants stream in one at a time through streamText, each labelled by what it trades away — shorter, warmer, more direct, less hedged — with changed spans marked against the original so the difference is visible without re-reading the whole thing. A length constraint field at the top (a 60-character button label, a 200-character summary) re-runs and marks the ones that bust it. Clicking a variant sends it back to chat as the chosen one.

_Error copy, a PR description, a button label, a Slack message — typed constantly in real work and never thought of as a UI request. The enumerability case done right: phrasings of a specific sentence are an open space, so the 'I already know this' reasoning quoted at CLAUDE.md:529–565 has nothing to grab. Streaming is the payoff and inline is the leg measured to stream (47 state changes over 17.5s), so variants land one at a time instead of arriving as a wall. Oh: the changed words are highlighted, so you can see what each version actually gave up._

**「tsconfig 这些 strict 选项我该开哪些」** `canvas` · `$dsh/fs` `$dsh/exec` `$dsh/chat`

Every strict-family flag as a row with a switch, initialized from the real tsconfig.json read through $dsh/fs so the starting state is the project's actual state, not a blank template. Flipping one on runs a scoped type-check through exec and reports how many errors it would add and in which files — the number is what makes the decision, and it is the number nobody has because getting it means editing the config and waiting. Rows sort by that cost so the free wins float up. The chosen set persists; 'apply these' goes back through chat rather than writing the file.

_A real recurring question in any TS repo that predates strict mode, and the honest answer has always been 'try it and see' — exactly the work a card can do while you read. Fits observe-only without strain (it measures, the agent edits), and it is a genuine fs case: the model's alternative is to read tsconfig with its own tools and hardcode the list, the photograph problem §4.5 names directly. Ranked here rather than higher because it only comes up on a repo that hasn't decided, and the check must be scoped to stay inside the 15s kill. Oh: three of the six flags are already free._

**「这几个方案我到底选哪个」** `canvas`

Options as columns, criteria as rows, each criterion carrying a weight slider. Cells are filled by the user or by the card where it has grounds; the total row updates live as weights move. The useful part is the sensitivity strip under the totals: it marks how far each weight can move before the winner changes, so an option that wins only under one exact weighting is visibly fragile. Persisted, because this argument resumes tomorrow and usually with someone else in the room.

_Multi-way comparison is one of the three original trigger shapes and §4.5 shows it working — 帮我比较三款云服务器 went from 13 tool calls to 4 with the skill first. What is new is the sensitivity strip, the actual 'oh': it converts a decision people make by argument into one where you can see whether the winner is robust. examples.md has 三个人合租怎么分不吵架 as a weighted split, but nothing surfacing ranking stability. No capabilities, so nothing can fail. Oh: nudge one weight 10% and the winner flips — you never actually had a preference._

**「这个 docker 镜像怎么这么大」** `canvas` · `$dsh/exec` `$dsh/chat`

`docker history --no-trunc --format` in one call, rendered as a vertical stack of layers sized by bytes, so the 900MB layer is nine times the height of the 100MB one and the twelve trivial layers are hairlines. Each layer shows the Dockerfile instruction that produced it, wrapped and readable rather than truncated at 60 characters. Layers above a size threshold get flagged with the usual suspects — apt lists left behind, a COPY before the dependency install that invalidates the cache below it. The rewrite suggestion goes back through chat; nothing is built or pruned by the card.

_Typed the moment a push gets slow, by people with no intention of asking for an interface — the current answer is a table with a truncated command column, unreadable exactly where it matters. Answer-is-already-a-table applies, and it is the honest kind of exec use: one fast read-only command well inside the 15s kill, with the fix routed out through sendMessage per the consent rule. Lower rank only because it needs Docker in the picture; when it applies it applies hard. Oh: one COPY line is 60% of the image._

**「这几个语言的翻译对得上吗」** `canvas` · `$dsh/fs` `$dsh/chat`

A coverage matrix built by reading the locale files through $dsh/fs: keys down the side, locales across the top, each cell a small mark — present, missing, or present-but-identical-to-the-source-string, the untranslated-placeholder case a key-count diff scores as complete. Filter to 'missing anywhere' and the matrix collapses to the work. Per-locale completion percentages across the top. Selecting a set of gaps sends them back to chat as a list to fill.

_Anyone maintaining more than one locale asks this before a release, and the tool they reach for undercounts because identical-to-source reads as translated. The matrix is the answer's real shape, so the fourth-shape tell fires, and it is a pure photograph-rule case: the model's default is to read three locale files itself and paste a summary that goes stale on the next commit. Narrower audience than the items above, hence the rank; inside it, typed every release. Oh: the locale showing 100% has 40 strings that are just the English copied over._

**「帮我把这个 csv 看一下」** `canvas` · `$dsh/fs`

Read through $dsh/fs, header row detected, then a table usable on a wide file: sortable columns, a sticky header, and under each column name a one-line profile — type, null count, distinct count, min/max for numbers. Columns whose profile looks wrong (a numeric column with three strings in it, a date column with two formats) are marked, because that is what the person is about to be bitten by. Picking any column draws a distribution for it; picking two draws them against each other. Persisted so the picked columns survive a reopen.

_Data files land in working directories constantly and 'take a look at this' is how people hand them over. The measured risk is the one §4.5:529 records — the model reads the file with its own tools and pastes the first ten rows in as literals, a photograph that cannot be sorted. The rule that fixed that is in place and this is the clearest case for it. Ranked last of the strong set because it needs a data file present, but examples.md notes 把这些数据可视化一下 correctly explores the workspace first, so the trigger path is known to work. Oh: the date column has two formats in it and the card said so before you sorted anything._

---

## 七点五、一个被证伪的角度

第七轮提的「出错时的卡片」里，最有代表性的是**分诊**——「build 挂了，报了四十七个错，我该先看哪个」。
我造了两种失败去测，**两次都没出卡片，两次模型都是对的**。

**48 个同类错误。** 模型的回复第一句就是结论：

> 「先看第一条，但更要紧的是先**归类**——**这 48 条不是 48 个问题。**」

两个错误码各 24 个，去重成一张四行表，指出两类互不级联，还顺带推断出
_「这文件看起来是被截断/删了一半」_——那正是我构造 fixture 的方式。48 行输出，2 个真问题。

**七种异质失败，跨四个包**（缺工作区模块、import 解析失败、postcss 插件、缺环境变量、OOM、测试超时）。
这本该是分诊卡片的主场。仍然是散文，仍然对：它挑了 `@org/shared-types`，
因为那是**唯一的共享内部依赖**，所以是构建图的问题而不是文件的问题，修它可能连带清掉别的。

### 为什么

**分诊假设的是一堆平级的选项。真实的构建失败有拓扑。**
找出上游根因是**推理**不是**排序**——而推理正是模型强过任何界面的地方。

这条修正了一整类点子的判断标准：给一个状态设计界面之前，先确认那个状态的**形状**，
而不是它的**体量**。「四十七个错」听起来需要界面，但四十七个错通常是两个问题。

---

## 八、数字

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| 轮次             | 7（4 轮发散 · 1 轮收敛核实 · 1 轮写成真代码 · 1 轮补角度 + 自我攻击） |
| 独立意图         | **997**                                                               |
| inline / canvas  | 406 / 562（32 条两可）                                                |
| 写成真代码并编译 | 8 张，8/8 通过，三项运行时筛查全清白                                  |
| 因研究而改的代码 | 9 处（3 个新能力、5 条提示词规则、1 个修正）                          |
| 实测记录         | 见 CLAUDE.md §4.5                                                     |

### 能力分布，以及它自己暴露的问题

| 能力        | 1–4 轮 (n=752) | 5–7 轮 (n=248) |
| ----------- | -------------- | -------------- |
| 无          | 264 (35%)      | 102 (41%)      |
| `$dsh/fs`   | 349 (46%)      | 80 (32%)       |
| `$dsh/exec` | —              | **79 (31%)**   |
| `$dsh/chat` | 160 (21%)      | 51 (20%)       |
| `$dsh/ai`   | 176 (23%)      | **23 (9%)**    |

`$dsh/exec` 一出现就吃掉后三轮的 31%，而 `$dsh/ai` 从 23% 掉到 9%。
这就是那条批评（「需求是在能力下游发明出来的」）的量化证据：
**新能力会挤占注意力，头脑风暴会围着最新的玩具转。**

对照真实产物：磁盘上 11 个 canvas，**1 个用了能力模块，0 个用 exec**。
拿这份例子集去做产品判断时，这个落差要一起看。

## 九、第八轮：把规则一条条逼出来（2026-08-22 下午）

前七轮是「想例子」，这一轮是「让例子真的发生」——每条规则都先量出漏在哪，改完再量，
不达 3/3 不留。全部记录在 CLAUDE.md §4.5。

### 新增并验证的触发形态

| 形态         | 代表 prompt                                | 改前 → 改后                                           |
| ------------ | ------------------------------------------ | ----------------------------------------------------- |
| 未言明的值   | `帮我把 .env 弄明白，有几个值我要改`       | 0/1 → 3/3（表单 + 打码 + 预览 + writeFile）           |
| 计划         | `想开始跑步，怎么循序渐进`                 | 0/3 → 3/3（两条自升为 canvas，一条自带 localStorage） |
| 单位换算     | `98 华氏度是多少摄氏度`                    | 0/6 → 6/6                                             |
| 概念即过程   | `git reset --soft --mixed --hard 有啥区别` | 0/3 → 3/3                                             |
| 措辞而非主题 | `二分查找的原理是什么`                     | 1/3 → 3/3                                             |

### 「借口」这件事本身

模型从不否认规则，它每次找一个**这次不适用**的新理由，而且每个理由单看都合理：

| 借口                    | 反驳                                 |
| ----------------------- | ------------------------------------ |
| 这是简单事实问题        | 简单说的是造它便宜，不是没人要       |
| 这些细节值得讲清楚      | 列举正是卡片比你强的地方             |
| 这张表是固定的          | 固定才该点着学——要学的是哪一位管什么 |
| 这是概念题不是计算题    | 无可计算的概念恰恰是散文最讲不清的   |
| 这是定义题（`什么是X`） | 换个说法（`怎么工作`）它自己就出卡了 |

结论：**加大音量没用，点名那个念头才有用。** 一次把四条塞进同一句、写得更整洁反而掉准确率
（glob 3/3 → 4/7），已回退。

### 方法上的收获（比规则更值钱）

- **一次运行什么都证明不了。** 抖动率实测存在，差点把不存在的回归归到某个 commit 上。
- **零要先看它是怎么来的。** 崩溃、配额耗尽、插件加载失败，都长得跟「模型不出卡」一模一样，
  三次差点写成结论。`scripts/eval.sh` 现在会报 `crash` 并非零退出。
- **空目录会让 fixture 因错误原因通过。** glob 在空目录 2/3、真实目录 0/3，跟直觉相反。
- **合成点击不是点击。** 两次让正常东西看起来是坏的（打勾卡片、AudioContext 唤醒）。

### 代码与文档

|              |                                                                                         |
| ------------ | --------------------------------------------------------------------------------------- |
| 提示词改动   | 11 次提交（8 条规则/修正、2 条实测校准、1 次整理后回退）                                |
| 新脚本       | `eval.sh`（区分崩溃与拒绝）、`render-cards.ts`（真挂载）、`audit-record.py`（记录自检） |
| 修正的旧记录 | 3 处（转录错的 2/3、合成点击得出的音频结论、被读成 fftSize 的 bin 数）                  |
| 上游清理     | 已用 PR 预发布包验证可行，停在 `trial/drop-workaround` 分支                             |

## 十、第九轮：换模型验证（2026-08-22 下午）

前八轮所有规则都是对着 `deepseek-v4-pro` 调出来的，所以有个绕不开的疑问：
**这些规则描述的是「请求」，还是这一个模型的脾气？**

DeepSeek 配额耗尽后接了 sd 网关（litellm:24000），顺手把这件事测了。

### 结果：两个毫无关系的模型，逐格一致

|                    | 必须散文 4 条 | 必须出 UI 17 条 | 计划类 2 条 |
| ------------------ | ------------- | --------------- | ----------- |
| `macaron-v1-venti` | 4/4           | 17/17           | 都选 canvas |
| `gpt-5.6-terra`    | 4/4           | 17/17           | 都选 canvas |

23 格全部吻合，包括「计划要放侧栏」这种不那么显然的判断。规则没有针对它们调过一个字。

### 换模型立刻挖出一个存在两天的真 bug

`skill` 里「交付前先自检」那段命令 —— `npx --yes <cli> check <file>` ——
**在沙箱里从来就跑不通**（`EPERM mkdtemp`，报错信息还是误导性的「缓存目录有 root 文件」，
实测 0 个）。同一条命令在普通 shell 里是 `OK`，所以两天没人发现。

发现它纯粹因为 venti **真的照着做**：写临时文件 → 跑 checker → 按 TypeScript 报错改三轮 →
再跑到 OK → 才贴进回复。DeepSeek 从来没跑过一次，所以坏命令零成本。

> **没人执行的指令不会出错。第二个模型是对 prompt 的测试，不只是对答案的测试。**

### 模型间的差别在过程，不在结果

|            | DeepSeek     | venti / sonnet             |
| ---------- | ------------ | -------------------------- |
| 自检       | 从不         | 每张卡都跑，改到 OK        |
| 探查工作区 | 直奔目标文件 | 先 glob/grep 摸一遍        |
| 房贷这条   | fence        | venti fence，sonnet canvas |

形态选择偶有分歧（同一条请求 fence 还是 canvas），但**该不该是界面**这个判断三家一致。

### 一个跑不成的实验，如实记下

「加载 skill 与出卡」的相关性是 79% vs 25%（n=64），但那是相关不是因果——
很可能是「决定要做界面」才去加载 skill。要判因果得改 skill 描述做对照，
而 venti 在六个候选 prompt 上**全部**加载了 skill，没有对照组。

与其凑一个小到能出结果的对照组，不如记下前提不成立。

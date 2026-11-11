/**
 * 核心类型契约 —— 整个游戏的数据模型。
 * core/ 层是确定性的纯逻辑：不依赖 DOM，所有时间都以毫秒时间戳显式传入，
 * 因此可以在 Node (Vitest) 里完整测试，也天然支持离线进度结算。
 */

// ---------------------------------------------------------------- 基础

/** 双语文案：数据表内联中英文，运行时按语言取用 */
export interface L10n {
  zh: string;
  en: string;
}

export type Lang = 'zh' | 'en';

export type ItemCategory =
  | 'seed'        // 种子（含树苗）
  | 'produce'     // 作物产出
  | 'animalGood'  // 动物产出
  | 'fish'        // 鱼
  | 'material'    // 野兽掉落等材料
  | 'tool'        // 鱼竿等工具
  | 'special';    // 礼物/宝箱等

export interface ItemDef {
  id: string;
  name: L10n;
  category: ItemCategory;
  /** 出售单价（金币）；0 = 不可出售 */
  sell: number;
  desc?: L10n;
}

// ---------------------------------------------------------------- 作物

export interface CropDef {
  id: string;              // crop_xxx
  name: L10n;
  seedId: string;          // 对应种子物品
  produceId: string;       // 对应产出物品
  unlockLevel: number;
  seedPrice: number;       // 种子买价（金币）
  sellPrice: number;       // 产出卖价（金币/个）
  xp: number;              // 收获经验
  foodYield: number;       // 收获获得的食物资源
  growMs: number;          // 总生长时长
  witherMs: number;        // 成熟后多久枯萎（树不枯萎）
  yieldMin: number;
  yieldMax: number;
  isTree: boolean;
  regrowMs?: number;       // 树：重复结果周期
  sprite: string;          // paint key
}

/** 地块上的作物实例（时间字段全部为绝对时间戳，阶段惰性计算） */
export interface PlantedCrop {
  defId: string;
  plantedAt: number;
  /** 浇水累计缩短的生长时间（毫秒）。浇一次水减少剩余时间的一部分。 */
  wateredBonusMs: number;
  /** 最近一次浇水时间（限制浇水频率 & 视觉湿润效果） */
  lastWateredAt: number;
  /** 树专用：上次采收时间（首次成熟按 plantedAt+growMs 计） */
  lastHarvestAt?: number;
}

export type CropStage = 'seedling' | 'growing' | 'mature' | 'ready' | 'withered';

export interface FarmPlot {
  uid: number;
  x: number;
  y: number;
  crop: PlantedCrop | null;
}

// ---------------------------------------------------------------- 动物

export interface AnimalDef {
  id: string;              // animal_xxx
  name: L10n;
  unlockLevel: number;
  buyPrice: number;        // 金币
  produceId: string;
  produceMs: number;       // 喂食后到产出的时长
  feedCost: number;        // 每次喂食消耗食物
  xp: number;              // 收取产出经验
  produceMin: number;
  produceMax: number;
  sprite: string;
}

export interface AnimalInstance {
  uid: number;
  defId: string;
  x: number;
  y: number;
  /** null = 饥饿待喂食；否则为喂食时间戳 */
  fedAt: number | null;
}

// ---------------------------------------------------------------- 野兽

export interface BeastDef {
  id: string;              // beast_xxx
  name: L10n;
  minLevel: number;        // 玩家达到该等级后才会出现
  hp: number;              // 需要命中的次数（基准）
  atk: number;             // 每次反击破坏作物的概率权重
  coinMin: number;
  coinMax: number;
  xp: number;
  dropId?: string;         // 材料掉落
  dropChance?: number;     // 0-1
  rare: boolean;
  sprite: string;
}

export interface BeastInstance {
  uid: number;
  defId: string;
  x: number;
  y: number;
  hp: number;              // 剩余命中数
  spawnedAt: number;
}

// ---------------------------------------------------------------- 钓鱼

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface FishDef {
  id: string;              // fish_xxx
  name: L10n;
  rarity: FishRarity;
  sellPrice: number;
  xp: number;
  minRodTier: number;      // 需要的最低鱼竿等级 1-3
  sprite: string;
  desc?: L10n;
}

// ---------------------------------------------------------------- 建筑装饰

export type BuildCategory = 'house' | 'decor' | 'path' | 'nature' | 'functional';

export interface BuildingDef {
  id: string;              // bld_xxx
  name: L10n;
  category: BuildCategory;
  price: number;
  unlockLevel: number;
  w: number;               // 占地宽（格）
  h: number;
  beauty: number;          // 美观值
  xp: number;              // 首次摆放经验
  sprite: string;
  desc?: L10n;
}

export interface Placement {
  uid: number;
  defId: string;
  x: number;               // 左上角格坐标
  y: number;
  rot: 0 | 1;              // 0 正常 / 1 镜像
}

// ---------------------------------------------------------------- 换装

export type ClothingSlot = 'skin' | 'hair' | 'face' | 'top' | 'bottom' | 'hat' | 'accessory';

export interface ClothingDef {
  id: string;              // cl_xxx
  name: L10n;
  slot: ClothingSlot;
  price: number;           // 0 = 初始拥有
  unlockLevel: number;
  /** 绘制参数：颜色等，交给纸娃娃 painter 解释 */
  paint: Record<string, string>;
}

export interface AvatarConfig {
  skin: string;            // ClothingDef id per slot
  hair: string;
  face: string;
  top: string;
  bottom: string;
  hat: string | null;
  accessory: string | null;
}

// ---------------------------------------------------------------- 宠物

export interface PetDef {
  id: string;              // pet_xxx
  name: L10n;
  price: number;
  unlockLevel: number;
  /** 被动技能标识：scare_beast / find_gift / cheer(能量回复加速) / lucky_fish */
  skill: 'scare_beast' | 'find_gift' | 'cheer' | 'lucky_fish';
  skillDesc: L10n;
  sprite: string;
}

export interface PetInstance {
  uid: number;
  defId: string;
  name: string;
  adoptedAt: number;
  /** 上次喂食（决定饥饿度，惰性计算） */
  fedAt: number;
  /** 上次玩耍 */
  playedAt: number;
  xp: number;              // 宠物成长经验（喂食/玩耍累积）
  /** 技能上次触发时间（如小狗驱兽 CD） */
  skillUsedAt: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------- 任务成就

export type QuestEventType =
  | 'harvest'       // 收获作物 target=cropId 或 '*'
  | 'plant'
  | 'water'
  | 'feedAnimal'
  | 'collectAnimal'
  | 'fishCatch'     // target=rarity 或 '*'
  | 'beastKill'
  | 'place'         // 摆放建筑 target=buildingId 或 '*' 或 category:xxx
  | 'buyClothing'
  | 'wear'
  | 'adoptPet'
  | 'feedPet'
  | 'playPet'
  | 'visit'
  | 'helpNeighbor'  // 帮工（浇水/除草/驱兽合计）
  | 'prank'
  | 'hire'
  | 'clearWeed'
  | 'sell'
  | 'expand'
  | 'reachLevel'    // count=目标等级
  | 'earnCoins'     // 累计获得金币
  | 'tillPlot';

export interface QuestStep {
  type: QuestEventType;
  target?: string;         // 未填 = 任意
  count: number;
}

export interface QuestReward {
  coins?: number;
  xp?: number;
  food?: number;
  energy?: number;
  reputation?: number;
  items?: Record<string, number>;
}

export interface QuestDef {
  id: string;
  name: L10n;
  desc: L10n;
  steps: QuestStep[];
  reward: QuestReward;
  /** 前置任务（教程链） */
  after?: string;
  /** daily 池任务 */
  daily?: boolean;
  minLevel?: number;
}

export interface QuestProgress {
  defId: string;
  counts: number[];        // 与 steps 对齐
  startedAt: number;
}

export interface AchievementDef {
  id: string;
  name: L10n;
  desc: L10n;
  stat: string;            // 对应 state.stats 里的键
  tiers: number[];         // 阶梯目标
  rewardPerTier: QuestReward;
}

// ---------------------------------------------------------------- 邻居（NPC）

export interface NeighborPersona {
  id: string;              // npc_xxx
  name: L10n;
  avatar: AvatarConfig;
  islandSeed: number;
  /** 性格文案组 */
  greetings: L10n[];
  thanks: L10n[];
  angry: L10n[];
  favoriteCrop: string;
}

/** 邻居岛的持久化状态（作物等随时间演化，惰性推进） */
export interface NeighborState {
  defId: string;
  friendship: number;      // 好友度
  plots: FarmPlot[];
  weeds: { uid: number; x: number; y: number }[];
  beasts: BeastInstance[];
  placements: Placement[];
  /** 上次惰性演化时间 */
  simulatedAt: number;
  /** 今日已在该邻居处执行的帮工/捣蛋次数（按天重置） */
  helpedToday: number;
  prankedToday: number;
  helpDay: string;         // YYYY-MM-DD
}

// ---------------------------------------------------------------- 岛屿

export type Terrain = 'water' | 'sand' | 'grass';

export interface WeedInstance {
  uid: number;
  x: number;
  y: number;
  spawnedAt: number;
}

// ---------------------------------------------------------------- 统计（成就依赖）

export interface Stats {
  harvests: number;
  plantings: number;
  waterings: number;
  animalsCollected: number;
  animalsFed: number;
  fishCaught: number;
  rareFishCaught: number;  // rare 及以上
  beastsDefeated: number;
  weedsCleared: number;
  buildingsPlaced: number;
  clothesBought: number;
  petsAdopted: number;
  petFeeds: number;
  petPlays: number;
  visits: number;
  helps: number;
  pranks: number;
  hires: number;
  coinsEarned: number;
  coinsSpent: number;
  itemsSold: number;
  expansions: number;
  questsDone: number;
  daysPlayed: number;
  lastPlayDay: string;
  [key: string]: number | string;
}

// ---------------------------------------------------------------- 总状态

export interface PlayerState {
  name: string;
  level: number;
  xp: number;              // 当前等级内经验
  coins: number;
  food: number;
  reputation: number;
  energy: number;
  energyUpdatedAt: number; // 能量惰性恢复基准点
  avatar: AvatarConfig;
  /** 已拥有的服装 id */
  wardrobe: string[];
  rodTier: number;         // 鱼竿 1-3
  /** 玩家形象在岛上的位置（格坐标，浮点） */
  px: number;
  py: number;
}

export interface DailyState {
  day: string;             // YYYY-MM-DD
  questIds: string[];      // 今日刷出的每日任务
  completed: string[];
}

export interface GameState {
  version: number;
  createdAt: number;
  savedAt: number;
  uidCounter: number;
  seed: number;            // 世界种子（邻居岛/地形生成）
  player: PlayerState;
  islandTier: number;      // 1-5
  plots: FarmPlot[];
  placements: Placement[];
  animals: AnimalInstance[];
  pets: PetInstance[];
  beasts: BeastInstance[];
  weeds: WeedInstance[];
  nextBeastAt: number;
  nextWeedAt: number;
  inventory: Record<string, number>;
  quests: {
    tutorialDone: string[];
    active: QuestProgress[];
    daily: DailyState;
  };
  achievements: Record<string, number>;  // id -> 已领取的 tier 数
  collections: {
    fish: Record<string, number>;        // fishId -> 捕获数
    beasts: Record<string, number>;
  };
  neighbors: NeighborState[];
  stats: Stats;
  settings: {
    lang: Lang;
    sound: boolean;
    music: boolean;
  };
}

// ---------------------------------------------------------------- 事件

/** 游戏动作产生的领域事件，任务/成就/音效/飘字都订阅它 */
export interface GameEvent {
  type: QuestEventType | 'levelUp' | 'coins' | 'toast' | 'achievement';
  target?: string;
  amount?: number;
  data?: unknown;
}

export type EventSink = (ev: GameEvent) => void;

/** 动作函数的统一结果 */
export interface ActionResult {
  ok: boolean;
  /** i18n key 或内联文案，失败原因 */
  reason?: string;
  events?: GameEvent[];
}

export const OK: ActionResult = { ok: true };

export function fail(reason: string): ActionResult {
  return { ok: false, reason };
}

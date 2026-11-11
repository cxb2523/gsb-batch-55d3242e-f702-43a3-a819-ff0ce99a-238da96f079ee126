/**
 * 野兽入侵：按计划刷新 → 破坏作物 → 玩家战斗驱逐。
 * 战斗是回合制命中：每次攻击耗 1 能量，有暴击；野兽会反击破坏作物。
 */
import type { ActionResult, BeastInstance, GameState } from './types';
import { allBeasts, beastDef } from './registry';
import { ENERGY_COST, MAX_BEASTS, beastIntervalMs } from './balance';
import { addItem, gainCoins, gainXp, nextUid, petHasSkill, spendEnergy } from './player';
import { findFreeGrass } from './island';
import { roll, rollChance, rollInt, rollWeighted } from './rng';
import { fail } from './types';

export function beastByUid(state: GameState, uid: number): BeastInstance | undefined {
  return state.beasts.find((b) => b.uid === uid);
}

function scheduleNext(state: GameState, now: number): void {
  const [lo, hi] = beastIntervalMs(state.player.level);
  state.nextBeastAt = now + lo + roll() * (hi - lo);
}

/**
 * 推进野兽刷新（tick 调用）。
 * 小狗宠物（scare_beast）会按 CD 自动吓跑一只野兽。
 * 返回新增野兽数（离线汇总用）。
 */
export function tickBeasts(state: GameState, now: number): number {
  let spawned = 0;
  if (state.nextBeastAt === 0) scheduleNext(state, now);
  // 落后多个周期时逐个补刷（离线场景），但不超过上限
  let guard = 0;
  while (now >= state.nextBeastAt && guard < 10) {
    guard++;
    if (state.beasts.length < MAX_BEASTS) {
      const pool = allBeasts().filter((b) => state.player.level >= b.minLevel);
      if (pool.length > 0) {
        const weights = pool.map((b) => (b.rare ? 1 : 6));
        const def = rollWeighted(pool, weights);
        const spot = findFreeGrass(state, roll);
        if (spot) {
          state.beasts.push({
            uid: nextUid(state), defId: def.id, x: spot.x, y: spot.y,
            hp: def.hp, spawnedAt: state.nextBeastAt,
          });
          spawned++;
        }
      }
    }
    scheduleNext(state, state.nextBeastAt);
  }
  // 宠物驱兽
  for (const pet of state.pets) {
    if (!petHasSkill(state, pet.defId, 'scare_beast')) continue;
    if (now - pet.skillUsedAt < 2 * 3600_000) continue;
    if (state.beasts.length === 0) continue;
    state.beasts.shift();
    pet.skillUsedAt = now;
  }
  return spawned;
}

export interface FightRound {
  hit: boolean;
  crit: boolean;
  defeated: boolean;
  /** 反击破坏的作物地块 uid（null = 未破坏） */
  trampledPlotUid: number | null;
  coins: number;
  drop: string | null;
}

/**
 * 攻击一次。timing ∈ [0,1] 是小游戏的打击精度：
 * >0.9 暴击（2 伤害）；>0.35 命中（1 伤害）；否则落空且野兽反击。
 */
export function fightBeast(state: GameState, uid: number, timing: number, now: number): ActionResult & { round?: FightRound } {
  const beast = beastByUid(state, uid);
  if (!beast) return fail('msg.notFound');
  if (!spendEnergy(state, ENERGY_COST.fight, now)) return fail('msg.noEnergy');
  const def = beastDef(beast.defId);

  const crit = timing >= 0.9;
  const hit = timing >= 0.35;
  const dmg = crit ? 2 : hit ? 1 : 0;
  beast.hp -= dmg;

  const round: FightRound = { hit, crit, defeated: false, trampledPlotUid: null, coins: 0, drop: null };
  const events: ActionResult['events'] = [];

  if (beast.hp <= 0) {
    round.defeated = true;
    round.coins = rollInt(def.coinMin, def.coinMax);
    gainCoins(state, round.coins);
    if (def.dropId && rollChance(def.dropChance ?? 0)) {
      round.drop = def.dropId;
      addItem(state, def.dropId, 1);
    }
    const levelEvents = gainXp(state, def.xp);
    state.beasts = state.beasts.filter((b) => b.uid !== uid);
    state.collections.beasts[def.id] = (state.collections.beasts[def.id] || 0) + 1;
    events.push({ type: 'beastKill', target: def.id, amount: 1 }, ...levelEvents);
  } else if (!hit) {
    // 反击：按 atk 概率破坏一株未成熟作物
    if (rollChance(Math.min(0.9, def.atk * 0.25))) {
      const victims = state.plots.filter((p) => p.crop);
      if (victims.length > 0) {
        const v = victims[rollInt(0, victims.length - 1)];
        v.crop = null;
        round.trampledPlotUid = v.uid;
      }
    }
  }
  return { ok: true, events, round };
}

/** 野兽长时间未处理时自行离开并踩坏作物（tick 调用） */
export function tickBeastMischief(state: GameState, now: number): number {
  let trampled = 0;
  const LEAVE_AFTER = 4 * 3600_000;
  state.beasts = state.beasts.filter((b) => {
    if (now - b.spawnedAt > LEAVE_AFTER) {
      const victims = state.plots.filter((p) => p.crop);
      if (victims.length > 0) {
        victims[rollInt(0, victims.length - 1)].crop = null;
        trampled++;
      }
      return false;
    }
    return true;
  });
  return trampled;
}

/**
 * 野兽战斗小游戏（DOM 覆盖层）：
 * 指针在力量条上来回摆动，点击时按位置决定 命中/暴击/落空；
 * 每次攻击消耗 1 能量（core/beasts.fightBeast 内扣）。
 */
import type { ActionResult, GameState } from '../core/types';
import { beastByUid, fightBeast } from '../core/beasts';
import { beastDef } from '../core/registry';
import { t, tl } from '../i18n';
import { h, clearChildren, spriteImg } from '../ui/dom';
import { sfx } from '../audio/sound';

export function startBattle(
  state: GameState,
  beastUid: number,
  now: () => number,
  dispatch: (r: ActionResult) => void,
  onEnd: () => void,
): void {
  const beast = beastByUid(state, beastUid);
  if (!beast) return;
  const def = beastDef(beast.defId);
  sfx('roar');

  const root = h('div', { class: 'minigame-overlay' });
  const box = h('div', { class: 'minigame-box battle-box' });
  root.append(box);
  document.body.append(root);

  let raf = 0;
  let pos = 0;
  let dir = 1;
  let ended = false;
  const speed = 0.9 + def.hp * 0.12; // 强敌指针更快

  const cleanup = (): void => {
    ended = true;
    cancelAnimationFrame(raf);
    root.remove();
    onEnd();
  };

  const hpHearts = h('div', { class: 'battle-hp' });
  const feedback = h('div', { class: 'battle-feedback' }, t('battle.hint'));
  const bar = h('div', { class: 'power-bar' });
  const zoneGreen = h('div', { class: 'power-zone-green' });
  const zoneYellow = h('div', { class: 'power-zone-yellow' });
  const needle = h('div', { class: 'power-needle' });
  bar.append(zoneYellow, zoneGreen, needle);

  const updateHp = (): void => {
    clearChildren(hpHearts);
    const b = beastByUid(state, beastUid);
    const hp = b ? b.hp : 0;
    for (let i = 0; i < def.hp; i++) {
      hpHearts.append(h('span', { class: `hp-heart ${i < hp ? '' : 'lost'}` }, i < hp ? '❤' : '🖤'));
    }
  };

  clearChildren(box);
  const beastImg = spriteImg(`beast:${beast.defId}`, 'battle-beast');
  box.append(
    h('div', { class: 'minigame-title' }, t('battle.title', { name: tl(def.name) })),
    beastImg,
    hpHearts,
    feedback,
    bar,
    h('button', { class: 'btn', onclick: () => cleanup() }, t('battle.flee')),
  );
  updateHp();

  const attack = (): void => {
    if (ended) return;
    // timing：离中心越近越准
    const timing = 1 - Math.abs(pos - 0.5) * 2;
    const result = fightBeast(state, beastUid, timing, now());
    dispatch(result);
    if (!result.ok) {
      // 能量不足等
      cleanup();
      return;
    }
    const round = result.round;
    if (!round) return;
    if (round.defeated) {
      sfx(round.crit ? 'crit' : 'hit');
      feedback.textContent = t('battle.win', { coins: round.coins });
      feedback.className = 'battle-feedback win';
      updateHp();
      setTimeout(cleanup, 900);
      return;
    }
    if (round.crit) {
      sfx('crit');
      feedback.textContent = t('battle.crit');
      feedback.className = 'battle-feedback crit';
      beastImg.classList.remove('shake');
      void beastImg.offsetWidth;
      beastImg.classList.add('shake');
    } else if (round.hit) {
      sfx('hit');
      feedback.textContent = t('battle.hit');
      feedback.className = 'battle-feedback hit';
      beastImg.classList.remove('shake');
      void beastImg.offsetWidth;
      beastImg.classList.add('shake');
    } else {
      sfx('miss');
      feedback.textContent = t('battle.miss');
      feedback.className = 'battle-feedback miss';
    }
    updateHp();
  };

  bar.addEventListener('click', attack);
  beastImg.addEventListener('click', attack);

  let last = performance.now();
  const step = (ts: number): void => {
    if (ended) return;
    const dt = (ts - last) / 1000;
    last = ts;
    pos += dir * speed * dt;
    if (pos >= 1) { pos = 1; dir = -1; }
    if (pos <= 0) { pos = 0; dir = 1; }
    needle.style.left = `${pos * 100}%`;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

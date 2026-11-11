/**
 * 钓鱼小游戏（DOM 覆盖层）：
 * ① 甩竿等待 → ② 咬钩瞬间点击（700ms 窗口）→ ③ 连点收线保持指针在绿区。
 * 收线质量 quality ∈ [0,1] 交给 core/fishing.resolveCatch 结算。
 */
import type { ActionResult, GameState } from '../core/types';
import { castLine, resolveCatch } from '../core/fishing';
import { t, tl } from '../i18n';
import { h, clearChildren, spriteImg } from '../ui/dom';
import { infoDialog } from '../ui/modal';
import { sfx } from '../audio/sound';

export function startFishing(
  state: GameState,
  now: () => number,
  dispatch: (r: ActionResult) => void,
): void {
  const castResult = castLine(state, now());
  if (!castResult.ok) {
    dispatch(castResult);
    return;
  }
  dispatch(castResult); // 扣能量 + 刷新 HUD
  sfx('splash');

  const root = h('div', { class: 'minigame-overlay' });
  const box = h('div', { class: 'minigame-box fishing-box' });
  root.append(box);
  document.body.append(root);

  let phase: 'wait' | 'bite' | 'reel' | 'done' = 'wait';
  let raf = 0;
  let timeout = 0;

  const cleanup = (): void => {
    cancelAnimationFrame(raf);
    clearTimeout(timeout);
    root.remove();
  };

  const finish = (quality: number): void => {
    if (phase === 'done') return;
    phase = 'done';
    cleanup();
    const result = resolveCatch(state, quality);
    dispatch(result);
    const c = result.catch;
    if (!c) return;
    if (c.fish === null) {
      sfx('miss');
      infoDialog(t('fish.escaped'), (body) => {
        body.append(h('div', { class: 'fish-escape' }, '🫧'));
      });
    } else {
      sfx('catch');
      const fish = c.fish;
      infoDialog(t('fish.caught', { name: tl(fish.name) }), (body) => {
        body.append(
          h('div', { class: 'fish-result' },
            spriteImg(`fish:${fish.id}`, 'fish-result-img'),
            h('div', { class: `dex-sub rarity-text-${fish.rarity}` },
              `${t('ui.sell')}: ${fish.sellPrice} · ${t('ui.xp')}+${fish.xp}`),
            c.isNew ? h('div', { class: 'new-mark' }, `✨ ${t('fish.newRecord')}`) : null,
          ),
        );
      });
    }
  };

  // ---------- 阶段一：等待咬钩
  const renderWait = (): void => {
    clearChildren(box);
    box.append(
      h('div', { class: 'minigame-title' }, t('fish.wait')),
      h('div', { class: 'fishing-bobber' }, '🎣'),
    );
    const delay = 800 + Math.random() * 2200;
    timeout = window.setTimeout(() => {
      phase = 'bite';
      renderBite();
    }, delay);
    // 提前点击 = 收回鱼竿（无惩罚重来不给；直接跑鱼）
    box.onclick = () => {
      if (phase === 'wait') finish(0);
    };
  };

  // ---------- 阶段二：咬钩窗口
  const renderBite = (): void => {
    clearChildren(box);
    sfx('reel');
    box.classList.add('bite');
    box.append(
      h('div', { class: 'minigame-title bite-title' }, t('fish.bite')),
      h('div', { class: 'fishing-bobber biting' }, '❗'),
    );
    timeout = window.setTimeout(() => finish(0), 700);
    box.onclick = () => {
      if (phase !== 'bite') return;
      phase = 'reel';
      box.classList.remove('bite');
      clearTimeout(timeout);
      renderReel();
    };
  };

  // ---------- 阶段三：收线
  const renderReel = (): void => {
    clearChildren(box);
    const bar = h('div', { class: 'reel-bar' });
    const zone = h('div', { class: 'reel-zone' });
    const needle = h('div', { class: 'reel-needle' });
    bar.append(zone, needle);
    const progress = h('div', { class: 'reel-progress' });
    const progressFill = h('div', { class: 'reel-progress-fill' });
    progress.append(progressFill);
    box.append(
      h('div', { class: 'minigame-title' }, t('fish.reel')),
      bar,
      progress,
    );

    // 针位置物理：点击抬升，重力下坠；绿区 35%-65%
    let pos = 0.5;      // 0..1
    let vel = 0;
    let inZoneMs = 0;
    const DURATION = 3200;
    const start = performance.now();
    let last = start;

    box.onclick = () => {
      vel = Math.min(0.0014, vel + 0.0009);
      sfx('reel');
    };

    const step = (ts: number): void => {
      const dt = Math.min(50, ts - last);
      last = ts;
      vel = Math.max(-0.0012, vel - 0.0000045 * dt);
      pos += vel * dt;
      pos = Math.max(0, Math.min(1, pos));
      if (pos <= 0 || pos >= 1) vel = 0;
      const inZone = pos >= 0.33 && pos <= 0.67;
      if (inZone) inZoneMs += dt;
      needle.style.bottom = `${pos * 100}%`;
      needle.classList.toggle('in-zone', inZone);
      const elapsed = ts - start;
      progressFill.style.width = `${Math.min(100, (elapsed / DURATION) * 100)}%`;
      if (elapsed >= DURATION) {
        finish(inZoneMs / DURATION);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  renderWait();
}

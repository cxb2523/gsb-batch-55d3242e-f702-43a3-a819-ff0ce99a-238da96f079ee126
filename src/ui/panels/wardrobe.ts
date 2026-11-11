/**
 * 换装面板：左侧实时角色预览，右侧按槽位分组的服装选择。
 */
import type { ActionResult, ClothingSlot, GameState } from '../../core/types';
import { allClothing, clothingDef } from '../../core/registry';
import { takeOffClothing, wearClothing } from '../../core/economy';
import { charKey, spriteDataUrl } from '../../render/sprites';
import { t, tl } from '../../i18n';
import { h, clearChildren, spriteImg } from '../dom';
import { openPanel } from '../modal';

const SLOTS: ClothingSlot[] = ['skin', 'hair', 'face', 'top', 'bottom', 'hat', 'accessory'];

let activeSlot: ClothingSlot = 'top';

export function openWardrobe(state: GameState, dispatch: (r: ActionResult) => void, slot?: ClothingSlot): void {
  if (slot) activeSlot = slot;
  openPanel({
    title: t('panel.wardrobe'),
    className: 'panel-wide',
    tabs: SLOTS.map((s) => ({ id: s, label: t(`wd.${s}`) })),
    activeTab: activeSlot,
    onTab: (id) => openWardrobe(state, dispatch, id as ClothingSlot),
    body: (body) => render(body, state, dispatch),
  });
}

function render(body: HTMLElement, state: GameState, dispatch: (r: ActionResult) => void): void {
  clearChildren(body);
  const rerender = (): void => render(body, state, dispatch);

  const preview = h('div', { class: 'wd-preview' });
  const img = spriteImg('fx:sparkle', 'wd-preview-img');
  img.src = spriteDataUrl(charKey(state.player.avatar));
  preview.append(img, h('div', { class: 'wd-preview-name' }, state.player.name));

  const list = h('div', { class: 'wd-list' });
  const avatar = state.player.avatar as unknown as Record<string, string | null>;
  const current = avatar[activeSlot];

  // 可脱下的槽位
  if ((activeSlot === 'hat' || activeSlot === 'accessory') && current) {
    list.append(h('button', {
      class: 'btn btn-sm',
      onclick: () => {
        dispatch(takeOffClothing(state, activeSlot as 'hat' | 'accessory'));
        rerender();
      },
    }, t('wd.takeOff')));
  }

  const items = allClothing().filter((c) => c.slot === activeSlot);
  for (const c of items) {
    const owned = state.player.wardrobe.includes(c.id);
    const isOn = current === c.id;
    if (!owned && state.player.level < c.unlockLevel) continue; // 未解锁不展示，商店可见
    const swatch = h('span', { class: 'wd-swatch' });
    swatch.style.background = c.paint.color ?? '#ccc';
    const btn = h('button', {
      class: `wd-item ${isOn ? 'active' : ''} ${owned ? '' : 'disabled'}`,
      onclick: () => {
        if (!owned || isOn) return;
        dispatch(wearClothing(state, c.id));
        rerender();
      },
    }, swatch, h('span', {}, tl(c.name)), owned ? null : h('span', { class: 'locked-mark' }, `${c.price}`));
    list.append(btn);
  }

  body.append(h('div', { class: 'wd-layout' }, preview, list));
}

export { clothingDef };

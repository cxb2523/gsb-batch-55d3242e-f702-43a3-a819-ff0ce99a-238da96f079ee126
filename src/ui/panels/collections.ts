/**
 * 图鉴面板：鱼类图鉴 + 野兽图鉴。
 */
import type { GameState } from '../../core/types';
import { allBeasts, allFish } from '../../core/registry';
import { t, tl } from '../../i18n';
import { h, clearChildren, spriteImg } from '../dom';
import { openPanel } from '../modal';

let activeTab = 'fish';

const RARITY_LABEL: Record<string, { zh: string; en: string }> = {
  common: { zh: '常见', en: 'Common' },
  uncommon: { zh: '少见', en: 'Uncommon' },
  rare: { zh: '稀有', en: 'Rare' },
  epic: { zh: '史诗', en: 'Epic' },
  legendary: { zh: '传说', en: 'Legendary' },
};

export function openCollections(state: GameState, tab?: string): void {
  if (tab) activeTab = tab;
  openPanel({
    title: t('panel.collections'),
    className: 'panel-wide',
    tabs: [
      { id: 'fish', label: t('panel.fishdex') },
      { id: 'beasts', label: t('panel.beastdex') },
    ],
    activeTab,
    onTab: (id) => openCollections(state, id),
    body: (body) => render(body, state),
  });
}

function render(body: HTMLElement, state: GameState): void {
  clearChildren(body);
  if (activeTab === 'fish') {
    const fish = allFish();
    const caught = fish.filter((f) => (state.collections.fish[f.id] || 0) > 0).length;
    body.append(h('div', { class: 'panel-note' }, t('dex.caught', { a: caught, b: fish.length })));
    const grid = h('div', { class: 'dex-grid' });
    for (const f of fish) {
      const n = state.collections.fish[f.id] || 0;
      const known = n > 0;
      grid.append(h('div', { class: `dex-cell rarity-${f.rarity} ${known ? '' : 'unknown'}` },
        spriteImg(`fish:${f.id}`, `icon-lg ${known ? '' : 'silhouette'}`),
        h('div', { class: 'dex-name' }, known ? tl(f.name) : t('dex.unknown')),
        h('div', { class: 'dex-sub' }, tl(RARITY_LABEL[f.rarity]) + (known ? ` ×${n}` : '')),
        known && f.desc ? h('div', { class: 'dex-desc' }, tl(f.desc)) : null,
      ));
    }
    body.append(grid);
  } else {
    body.append(h('div', { class: 'panel-note' }, t('dex.beastNote')));
    const grid = h('div', { class: 'dex-grid' });
    for (const b of allBeasts()) {
      const n = state.collections.beasts[b.id] || 0;
      const known = n > 0;
      grid.append(h('div', { class: `dex-cell ${b.rare ? 'rarity-epic' : ''} ${known ? '' : 'unknown'}` },
        spriteImg(`beast:${b.id}`, `icon-lg ${known ? '' : 'silhouette'}`),
        h('div', { class: 'dex-name' }, known ? tl(b.name) : t('dex.unknown')),
        h('div', { class: 'dex-sub' }, known ? `×${n}` : ''),
      ));
    }
    body.append(grid);
  }
}

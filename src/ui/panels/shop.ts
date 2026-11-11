/**
 * 商店面板：种子/果树/动物/建筑/服装/宠物/工具(扩岛+鱼竿) 七个标签页。
 */
import type { ActionResult, GameState } from '../../core/types';
import { allAnimals, allBuildings, allClothing, allCrops, allPets } from '../../core/registry';
import { buyAnimal } from '../../core/animals';
import { buyClothing, buySeed, ROD_PRICES, upgradeRod } from '../../core/economy';
import { adoptPet } from '../../core/pets';
import { expandIsland } from '../../core/build';
import { ISLAND_TIERS } from '../../core/balance';
import { fmtDuration, t, tl } from '../../i18n';
import { h, clearChildren, spriteImg } from '../dom';
import { openPanel, promptDialog } from '../modal';

export interface ShopContext {
  state: GameState;
  now: () => number;
  dispatch: (r: ActionResult) => void;
  /** 购买建筑后进入摆放模式 */
  onPlaceBuilding: (defId: string) => void;
}

let activeTab = 'seeds';

export function openShop(ctx: ShopContext, tab?: string): void {
  if (tab) activeTab = tab;
  openPanel({
    title: t('panel.shop'),
    className: 'panel-wide',
    tabs: [
      { id: 'seeds', label: t('shop.seeds') },
      { id: 'trees', label: t('shop.trees') },
      { id: 'animals', label: t('shop.animals') },
      { id: 'buildings', label: t('shop.buildings') },
      { id: 'clothing', label: t('shop.clothing') },
      { id: 'pets', label: t('shop.pets') },
      { id: 'tools', label: t('shop.tools') },
    ],
    activeTab,
    onTab: (id) => openShop(ctx, id),
    body: (body) => renderTab(body, ctx),
  });
}

function card(
  icon: HTMLElement, name: string, sub: string[], price: number, unlockLevel: number,
  playerLevel: number, coins: number, buyLabel: string, onBuy: () => void,
  owned = false,
): HTMLElement {
  const locked = playerLevel < unlockLevel;
  const cantAfford = coins < price;
  const btn = owned
    ? h('span', { class: 'owned-mark' }, t('ui.owned'))
    : locked
      ? h('span', { class: 'locked-mark' }, t('ui.lvRequire', { lv: unlockLevel }))
      : h('button', {
          class: `btn btn-sm ${cantAfford ? 'disabled' : 'btn-primary'}`,
          onclick: () => { if (!cantAfford) onBuy(); },
        }, price > 0 ? `${buyLabel} ${price}` : t('ui.free'));
  return h('div', { class: `shop-card ${locked ? 'locked' : ''}` },
    icon,
    h('div', { class: 'shop-card-info' },
      h('div', { class: 'shop-card-name' }, name),
      ...sub.map((s) => h('div', { class: 'shop-card-sub' }, s)),
    ),
    h('div', { class: 'shop-card-buy' }, btn),
  );
}

function renderTab(body: HTMLElement, ctx: ShopContext): void {
  clearChildren(body);
  const { state, dispatch } = ctx;
  const p = state.player;
  const list = h('div', { class: 'shop-list' });
  body.append(list);

  const rerender = (): void => renderTab(body, ctx);

  if (activeTab === 'seeds' || activeTab === 'trees') {
    const crops = allCrops()
      .filter((c) => (activeTab === 'trees') === c.isTree)
      .sort((a, b) => a.unlockLevel - b.unlockLevel);
    for (const c of crops) {
      list.append(card(
        spriteImg(`icon:${c.seedId}`, 'icon-lg'),
        tl(c.name),
        [
          t('shop.grow', { t: fmtDuration(c.growMs) }),
          `${t('ui.sell')}: ${c.sellPrice} × ${c.yieldMin}-${c.yieldMax} · ${t('ui.xp')}+${c.xp}`,
        ],
        c.seedPrice, c.unlockLevel, p.level, p.coins,
        t('ui.buy'),
        () => { dispatch(buySeed(state, c.id, 1)); rerender(); },
      ));
    }
  } else if (activeTab === 'animals') {
    for (const a of allAnimals().sort((x, y) => x.unlockLevel - y.unlockLevel)) {
      list.append(card(
        spriteImg(`animal:${a.id}`, 'icon-lg'),
        tl(a.name),
        [
          t('shop.produce', { t: fmtDuration(a.produceMs) }),
          t('shop.feedCost', { n: a.feedCost }),
        ],
        a.buyPrice, a.unlockLevel, p.level, p.coins,
        t('ui.buy'),
        () => { dispatch(buyAnimal(state, a.id, ctx.now())); rerender(); },
      ));
    }
  } else if (activeTab === 'buildings') {
    for (const b of allBuildings().sort((x, y) => x.unlockLevel - y.unlockLevel || x.price - y.price)) {
      list.append(card(
        spriteImg(`bld:${b.id}`, 'icon-lg icon-bld'),
        tl(b.name),
        [t('shop.beauty', { n: b.beauty })],
        b.price, b.unlockLevel, p.level, p.coins,
        t('ui.buy'),
        () => ctx.onPlaceBuilding(b.id),
      ));
    }
  } else if (activeTab === 'clothing') {
    for (const c of allClothing().filter((c) => c.price > 0).sort((x, y) => x.unlockLevel - y.unlockLevel)) {
      list.append(card(
        spriteImg('icon:item_shell', 'icon-lg'),
        tl(c.name),
        [t(`wd.${c.slot}`)],
        c.price, c.unlockLevel, p.level, p.coins,
        t('ui.buy'),
        () => { dispatch(buyClothing(state, c.id)); rerender(); },
        p.wardrobe.includes(c.id),
      ));
    }
  } else if (activeTab === 'pets') {
    for (const pet of allPets().sort((x, y) => x.unlockLevel - y.unlockLevel)) {
      const owned = state.pets.some((i) => i.defId === pet.id);
      list.append(card(
        spriteImg(`pet:${pet.id}`, 'icon-lg'),
        tl(pet.name),
        [tl(pet.skillDesc)],
        pet.price, pet.unlockLevel, p.level, p.coins,
        t('ui.buy'),
        () => {
          promptDialog(t('shop.adoptName'), tl(pet.name), (name) => {
            ctx.dispatch(adoptPet(state, pet.id, name.trim() || tl(pet.name), ctx.now()));
            rerender();
          });
        },
        owned,
      ));
    }
  } else if (activeTab === 'tools') {
    // 扩岛
    const next = ISLAND_TIERS.find((ti) => ti.tier === state.islandTier + 1);
    if (next) {
      list.append(card(
        spriteImg('tile:grass:0', 'icon-lg'),
        t('shop.expand'),
        [t('shop.expandDesc', { size: next.size, lv: next.minLevel })],
        next.price, next.minLevel, p.level, p.coins,
        t('ui.buy'),
        () => { dispatch(expandIsland(state, ctx.now())); rerender(); },
      ));
    }
    // 鱼竿
    const rodNames = [t('shop.rodT1'), t('shop.rodT2'), t('shop.rodT3')];
    if (p.rodTier < 3) {
      list.append(card(
        spriteImg('fish:fish_sardine', 'icon-lg'),
        `${t('shop.rod')}: ${rodNames[p.rodTier]}`,
        [t('shop.rodDesc')],
        ROD_PRICES[p.rodTier], 1, p.level, p.coins,
        t('ui.buy'),
        () => { dispatch(upgradeRod(state)); rerender(); },
      ));
    } else {
      list.append(h('div', { class: 'empty-note' }, `${rodNames[2]} · ${t('ui.max')}`));
    }
  }
}

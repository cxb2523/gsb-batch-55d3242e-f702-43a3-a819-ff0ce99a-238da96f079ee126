/**
 * 邻居面板：NPC 邻居列表（好友度/拜访/雇佣）+ 好友码分享与参观。
 */
import type { ActionResult, GameState } from '../../core/types';
import { neighborDef } from '../../core/registry';
import { hireNeighbor } from '../../core/social';
import { friendshipLevel, HELP_PER_NEIGHBOR_PER_DAY, HIRE_COST, PRANK_PER_NEIGHBOR_PER_DAY } from '../../core/balance';
import { beautyScore } from '../../core/build';
import { encodeFriendCode, decodeFriendCode, takeSnapshot, type IslandSnapshot } from '../../social/friendcode';
import { charKey, spriteDataUrl } from '../../render/sprites';
import { t, tl } from '../../i18n';
import { h, clearChildren } from '../dom';
import { closePanel, openPanel, promptDialog } from '../modal';
import { toast } from '../toast';

export interface NeighborPanelCtx {
  state: GameState;
  now: () => number;
  dispatch: (r: ActionResult) => void;
  onVisit: (npcId: string) => void;
  onVisitSnapshot: (snap: IslandSnapshot) => void;
}

export function openNeighbors(ctx: NeighborPanelCtx): void {
  openPanel({
    title: t('panel.neighbors'),
    className: 'panel-wide',
    body: (body) => render(body, ctx),
  });
}

function render(body: HTMLElement, ctx: NeighborPanelCtx): void {
  clearChildren(body);
  const { state } = ctx;

  // ---- 好友码区
  const codeRow = h('div', { class: 'friendcode-row' },
    h('button', {
      class: 'btn',
      onclick: () => {
        const code = encodeFriendCode(takeSnapshot(state, beautyScore(state), ctx.now()));
        void navigator.clipboard?.writeText(code).then(
          () => toast(t('nb.codeCopied'), 'good'),
          () => {
            // 剪贴板不可用时降级为弹窗展示
            promptDialog(t('nb.myCode'), code, () => {});
          },
        );
      },
    }, `📋 ${t('nb.myCode')}`),
    h('button', {
      class: 'btn',
      onclick: () => {
        promptDialog(t('nb.codePrompt'), '', (code) => {
          try {
            const snap = decodeFriendCode(code);
            closePanel();
            ctx.onVisitSnapshot(snap);
          } catch {
            toast(t('nb.codeBad'), 'bad');
          }
        });
      },
    }, `🔍 ${t('nb.visitCode')}`),
  );
  body.append(h('div', { class: 'panel-note' }, t('nb.friendCode')), codeRow);

  // ---- NPC 列表
  for (const ns of state.neighbors) {
    const persona = neighborDef(ns.defId);
    const fl = friendshipLevel(ns.friendship);
    const img = document.createElement('img');
    img.src = spriteDataUrl(charKey(persona.avatar));
    img.className = 'nb-avatar';
    const helpsLeft = Math.max(0, HELP_PER_NEIGHBOR_PER_DAY - ns.helpedToday);
    const pranksLeft = Math.max(0, PRANK_PER_NEIGHBOR_PER_DAY - ns.prankedToday);
    body.append(h('div', { class: 'nb-card' },
      img,
      h('div', { class: 'nb-info' },
        h('div', { class: 'nb-name' }, `${tl(persona.name)}`),
        h('div', { class: 'nb-sub' },
          `${t('nb.friendship')} Lv.${fl} (${ns.friendship}) · ${t('nb.helpLeft', { n: helpsLeft })} · ${t('nb.prankLeft', { n: pranksLeft })}`),
      ),
      h('div', { class: 'nb-actions' },
        h('button', {
          class: 'btn btn-primary btn-sm',
          onclick: () => {
            closePanel();
            ctx.onVisit(ns.defId);
          },
        }, t('nb.visit')),
        h('button', {
          class: `btn btn-sm ${state.player.coins < HIRE_COST ? 'disabled' : ''}`,
          title: t('nb.hireDesc'),
          onclick: () => {
            if (state.player.coins < HIRE_COST) return;
            ctx.dispatch(hireNeighbor(state, ns, ctx.now()));
            render(body, ctx);
          },
        }, t('nb.hire', { coins: HIRE_COST })),
      ),
    ));
  }
}

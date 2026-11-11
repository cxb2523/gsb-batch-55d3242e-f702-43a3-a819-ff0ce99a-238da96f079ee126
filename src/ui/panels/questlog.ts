/**
 * 任务面板：教程任务 / 每日任务 / 成就 三个标签页。
 */
import type { ActionResult, GameState, QuestDef, QuestProgress } from '../../core/types';
import { achievementDef, questDef } from '../../core/registry';
import { achievementViews, claimAchievement, claimQuest, questComplete } from '../../core/quests';
import { t, tl } from '../../i18n';
import { h, clearChildren, spriteImg } from '../dom';
import { openPanel } from '../modal';

let activeTab = 'tutorial';

export function openQuestLog(
  state: GameState,
  now: () => number,
  dispatch: (r: ActionResult) => void,
  tab?: string,
): void {
  if (tab) activeTab = tab;
  openPanel({
    title: t('panel.quests'),
    className: 'panel-wide',
    tabs: [
      { id: 'tutorial', label: t('panel.tutorial') },
      { id: 'daily', label: t('panel.daily') },
      { id: 'ach', label: t('panel.achievements') },
    ],
    activeTab,
    onTab: (id) => openQuestLog(state, now, dispatch, id),
    body: (body) => renderTab(body, state, now, dispatch),
  });
}

function rewardLine(def: QuestDef): string {
  const r = def.reward;
  const parts: string[] = [];
  if (r.coins) parts.push(`${t('ui.coins')}+${r.coins}`);
  if (r.xp) parts.push(`${t('ui.xp')}+${r.xp}`);
  if (r.food) parts.push(`${t('ui.food')}+${r.food}`);
  if (r.energy) parts.push(`${t('ui.energy')}+${r.energy}`);
  if (r.reputation) parts.push(`${t('ui.reputation')}+${r.reputation}`);
  return parts.join(' · ');
}

function questCard(
  qp: QuestProgress, state: GameState, now: () => number,
  dispatch: (r: ActionResult) => void, rerender: () => void,
): HTMLElement {
  const def = questDef(qp.defId);
  const complete = questComplete(qp);
  const steps = def.steps.map((s, i) => {
    const cur = Math.min(qp.counts[i], s.count);
    return h('div', { class: `quest-step ${cur >= s.count ? 'done' : ''}` },
      `${cur >= s.count ? '✓' : '○'} ${cur}/${s.count}`);
  });
  return h('div', { class: `quest-card ${complete ? 'complete' : ''}` },
    h('div', { class: 'quest-card-main' },
      h('div', { class: 'quest-name' }, tl(def.name)),
      h('div', { class: 'quest-desc' }, tl(def.desc)),
      h('div', { class: 'quest-steps' }, ...steps),
      h('div', { class: 'quest-reward' }, `${t('quest.reward')}: ${rewardLine(def)}`),
    ),
    complete
      ? h('button', {
          class: 'btn btn-primary',
          onclick: () => {
            dispatch(claimQuest(state, qp.defId, now()));
            rerender();
          },
        }, t('ui.claim'))
      : h('span', { class: 'quest-status' }, t('quest.progress')),
  );
}

function renderTab(
  body: HTMLElement, state: GameState, now: () => number,
  dispatch: (r: ActionResult) => void,
): void {
  clearChildren(body);
  const rerender = (): void => renderTab(body, state, now, dispatch);

  if (activeTab === 'tutorial' || activeTab === 'daily') {
    const wantDaily = activeTab === 'daily';
    const quests = state.quests.active.filter((q) => !!questDef(q.defId).daily === wantDaily);
    if (wantDaily) {
      body.append(h('div', { class: 'panel-note' }, t('quest.dailyRefresh')));
      for (const doneId of state.quests.daily.completed) {
        try {
          const def = questDef(doneId);
          body.append(h('div', { class: 'quest-card complete claimed' },
            h('div', { class: 'quest-card-main' },
              h('div', { class: 'quest-name' }, `✓ ${tl(def.name)}`)),
            h('span', { class: 'quest-status' }, t('quest.done')),
          ));
        } catch { /* 池子变更后旧 id 容错 */ }
      }
    }
    if (quests.length === 0 && !wantDaily) {
      body.append(h('div', { class: 'empty-note' }, t('quest.noneActive')));
    }
    for (const qp of quests) {
      body.append(questCard(qp, state, now, dispatch, rerender));
    }
  } else {
    // 成就
    for (const view of achievementViews(state)) {
      const def = achievementDef(view.id);
      const claimable = view.tier > view.claimed;
      const stars = '★'.repeat(view.claimed) + '☆'.repeat(def.tiers.length - view.claimed);
      body.append(h('div', { class: `quest-card ${claimable ? 'complete' : ''}` },
        h('div', { class: 'quest-card-main' },
          h('div', { class: 'quest-name' }, `${tl(def.name)} ${stars}`),
          h('div', { class: 'quest-desc' },
            `${tl(def.desc)}: ${view.current}${view.next !== null ? ` / ${view.next}` : ''}`),
        ),
        claimable
          ? h('button', {
              class: 'btn btn-primary',
              onclick: () => {
                dispatch(claimAchievement(state, view.id));
                rerender();
              },
            }, t('ui.claim'))
          : spriteImg('fx:sparkle', 'icon-md'),
      ));
    }
  }
}

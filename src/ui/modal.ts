/**
 * 模态面板框架：同一时间只开一个主面板；支持标题、标签页、关闭按钮。
 * 另提供轻量 confirm / prompt 对话框（替代原生阻塞式弹窗）。
 */
import { h, clearChildren } from './dom';
import { t } from '../i18n';
import { sfx } from '../audio/sound';

let overlay: HTMLElement | null = null;
let panelBox: HTMLElement | null = null;
let onCloseCb: (() => void) | null = null;

export function initModal(): void {
  overlay = h('div', { class: 'modal-overlay hidden' });
  overlay.addEventListener('pointerdown', (ev) => {
    if (ev.target === overlay) closePanel();
  });
  panelBox = h('div', { class: 'modal-panel' });
  overlay.append(panelBox);
  document.body.append(overlay);
}

export function isPanelOpen(): boolean {
  return !!overlay && !overlay.classList.contains('hidden');
}

export interface PanelSpec {
  title: string;
  className?: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTab?: (id: string) => void;
  onClose?: () => void;
  body: (container: HTMLElement) => void;
}

export function openPanel(spec: PanelSpec): void {
  if (!overlay || !panelBox) return;
  sfx('click');
  onCloseCb = spec.onClose ?? null;
  clearChildren(panelBox);
  panelBox.className = `modal-panel ${spec.className ?? ''}`;

  const header = h('div', { class: 'panel-header' },
    h('span', { class: 'panel-title' }, spec.title),
    h('button', { class: 'btn-close', onclick: () => closePanel() }, '✕'),
  );
  panelBox.append(header);

  if (spec.tabs && spec.tabs.length > 0) {
    const tabBar = h('div', { class: 'tab-bar' });
    for (const tab of spec.tabs) {
      const btn = h('button', {
        class: `tab-btn ${tab.id === spec.activeTab ? 'active' : ''}`,
        onclick: () => spec.onTab?.(tab.id),
      }, tab.label);
      tabBar.append(btn);
    }
    panelBox.append(tabBar);
  }

  const body = h('div', { class: 'panel-body' });
  panelBox.append(body);
  spec.body(body);
  overlay.classList.remove('hidden');
}

export function closePanel(): void {
  if (!overlay) return;
  overlay.classList.add('hidden');
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}

/** 重绘当前面板主体（数据变化后刷新） */
export function refreshPanel(spec: PanelSpec): void {
  if (isPanelOpen()) openPanel(spec);
}

// ---------------------------------------------------------------- 轻量对话框

export function confirmDialog(text: string, onYes: () => void): void {
  const box = h('div', { class: 'dialog-box' },
    h('div', { class: 'dialog-text' }, text),
    h('div', { class: 'dialog-btns' },
      h('button', { class: 'btn btn-primary', onclick: () => { root.remove(); onYes(); } }, t('ui.confirm')),
      h('button', { class: 'btn', onclick: () => root.remove() }, t('ui.cancel')),
    ),
  );
  const root = h('div', { class: 'dialog-overlay' }, box);
  document.body.append(root);
}

export function promptDialog(text: string, defaultValue: string, onSubmit: (v: string) => void): void {
  const input = h('input', { class: 'dialog-input', value: defaultValue }) as HTMLInputElement;
  input.value = defaultValue;
  const submit = (): void => {
    root.remove();
    onSubmit(input.value);
  };
  const box = h('div', { class: 'dialog-box' },
    h('div', { class: 'dialog-text' }, text),
    input,
    h('div', { class: 'dialog-btns' },
      h('button', { class: 'btn btn-primary', onclick: submit }, t('ui.confirm')),
      h('button', { class: 'btn', onclick: () => root.remove() }, t('ui.cancel')),
    ),
  );
  const root = h('div', { class: 'dialog-overlay' }, box);
  document.body.append(root);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') submit();
  });
  setTimeout(() => input.focus(), 50);
}

/** 信息展示框（离线摘要、捕鱼结果等），内容自组装 */
export function infoDialog(title: string, build: (body: HTMLElement) => void, onClose?: () => void): void {
  const body = h('div', { class: 'dialog-body' });
  build(body);
  const box = h('div', { class: 'dialog-box' },
    h('div', { class: 'dialog-title' }, title),
    body,
    h('div', { class: 'dialog-btns' },
      h('button', {
        class: 'btn btn-primary',
        onclick: () => { root.remove(); onClose?.(); },
      }, t('ui.confirm')),
    ),
  );
  const root = h('div', { class: 'dialog-overlay' }, box);
  document.body.append(root);
}

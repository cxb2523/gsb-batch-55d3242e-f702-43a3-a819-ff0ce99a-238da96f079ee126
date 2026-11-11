/**
 * 极简 DOM 构建助手。
 */
import { spriteDataUrl } from '../render/sprites';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | ((ev: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') {
      el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    } else if (k === 'class') {
      el.className = v;
    } else {
      el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** 精灵图标 img 元素 */
export function spriteImg(key: string, cls = 'icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.src = spriteDataUrl(key);
  img.className = cls;
  img.draggable = false;
  return img;
}

export function clearChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** 资源徽章（金币/食物等小行内图标+数字） */
export function resBadge(fxKey: string, text: string, cls = 'res-badge'): HTMLElement {
  return h('span', { class: cls }, spriteImg(fxKey, 'icon-sm'), text);
}

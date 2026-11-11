/**
 * Copy for the canvas browser, in the same namespace shape the Sidebar's own types use.
 *
 * The guide page is the host's, and it draws no copy of its own — every word on a capsule comes
 * from the type that contributed it. Hardcoding a language here would drop a foreign word into a
 * localized column, which is most of what "bolted on" means.
 *
 * `zh` is the key-set source of truth: the keys are `keyof typeof zh`, so `en` cannot silently
 * grow one `zh` lacks.
 */
/** The dictionary namespace this file owns; `register` and `bind` both take it. */
export const NS = "ui4aCanvas";

export const zh = {
  "guide.title": "画布",
  "guide.description": "浏览工作区里的 canvas",
  "empty.title": "还没有 canvas",
  "empty.body": "让模型写一个到 .dsh/ui4a/canvases/，它会出现在这里。",
  "read.error": "无法读取画布",
  "read.loading": "正在读取画布…",
  "read.missing": "画布文件尚未生成，或已被移除。",
  "read.retry": "重试",
} as const;

export type CanvasKey = keyof typeof zh;

export const en: Record<CanvasKey, string> = {
  "guide.title": "Canvases",
  "guide.description": "Browse the canvases in this workspace",
  "empty.title": "No canvases yet",
  "empty.body": "Ask the model to write one into .dsh/ui4a/canvases/ and it will show up here.",
  "read.error": "Could not read canvases",
  "read.loading": "Loading canvases…",
  "read.missing": "The canvas file has not been written yet, or was removed.",
  "read.retry": "Retry",
};

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    ui4aCanvas: CanvasKey;
  }
}

/**
 * The page's hand-written CSS: the sky behind everything, keyframes, the syntax palette and the
 * cursor's sparks. Everything else is UnoCSS classes. Every entrance is a short rise-and-fade on one
 * curve, and every one of them collapses to an opacity change under reduced motion.
 */
export const CSS = `
:root{color-scheme:dark}
html,body{background:#0e0e10}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.ui4a-sky{position:fixed;inset:0;z-index:0;pointer-events:none;background:
  radial-gradient(1080px 560px at 50% -10%,rgba(72,120,225,.22),transparent 62%),
  radial-gradient(720px 460px at 86% 2%,rgba(118,88,225,.14),transparent 62%),
  radial-gradient(760px 520px at 6% 16%,rgba(40,92,190,.12),transparent 58%),
  linear-gradient(180deg,#0e0e10 0%,#0c0d13 44%,#0e0e10 100%)}
.ui4a-sky::after{content:"";position:absolute;inset:0;background:radial-gradient(140% 90% at 50% 30%,transparent 52%,#0e0e10 96%)}
.ui4a-rule{height:1px;border:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.11) 14%,rgba(255,255,255,.11) 86%,transparent)}
.ui4a-glow{position:absolute;left:50%;bottom:-26%;width:94%;height:68%;transform:translateX(-50%);pointer-events:none;filter:blur(60px);opacity:.95;background:radial-gradient(52% 62% at 50% 32%,rgba(102,152,255,.40),rgba(70,110,220,.12) 55%,transparent 74%)}
.dsh-frame{--dsw-alias-label-primary-inverted:#151517;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 20px 50px -24px rgba(0,0,0,.66),0 72px 150px -52px rgba(74,127,214,.32)}
@keyframes ui4a-rise{from{opacity:0;transform:translateY(8px)}}
@keyframes ui4a-fade{from{opacity:0}}
@keyframes ui4a-leave{to{opacity:0;transform:translateY(-12px)}}
@keyframes ui4a-blink{50%{opacity:0}}
@keyframes ui4a-pulse{50%{opacity:.45}}
@keyframes ui4a-spark{from{opacity:1;transform:rotate(var(--a)) translateX(6px) scaleX(1)}to{opacity:0;transform:rotate(var(--a)) translateX(20px) scaleX(.3)}}
.ui4a-rise{animation:ui4a-rise .5s cubic-bezier(.2,.8,.2,1) both}
.ui4a-fade,.ui4a-sessions>*{animation:ui4a-fade .4s cubic-bezier(.2,.8,.2,1) both}
.ui4a-leave{animation:ui4a-leave .42s cubic-bezier(.4,0,.6,1) both}
.ui4a-pulse{animation:ui4a-pulse 1.4s ease-in-out infinite}
.ui4a-caret{display:inline-block;width:2px;height:1.05em;margin-left:1px;vertical-align:-.15em;background:#7aaaff;animation:ui4a-blink 1s steps(1) infinite}
.ui4a-caret-lg{width:.06em;margin-left:.04em}
.ui4a-canvas{transition:width .6s cubic-bezier(.2,.9,.25,1),border-color .6s}
.ui4a-pointer{will-change:transform,opacity;transform-origin:3px 2px}
.ui4a-spark{position:absolute;z-index:19;width:9px;height:2px;margin:1px 0 0 2px;border-radius:2px;background:#7aaaff;pointer-events:none;transform-origin:0 50%;animation:ui4a-spark .42s cubic-bezier(.2,.8,.2,1) forwards}
.ui4a-card{container-type:inline-size}
.ui4a-scroll{scrollbar-width:thin;scrollbar-color:#ffffff1f transparent;overscroll-behavior:contain}
.hl-k{color:#c792ea}.hl-s{color:#a5d6a7}.hl-t{color:#7aaaff}.hl-c{color:#81858c;font-style:italic}.hl-n{color:#f78c6c}.hl-f{color:#ffcb6b}
@media (prefers-reduced-motion:reduce){
  .ui4a-rise,.ui4a-leave,.ui4a-fade,.ui4a-sessions>*{animation-name:none}
  .ui4a-caret,.ui4a-pulse{animation:none}
  .ui4a-canvas{transition:none}
}
`;

/*
 * Mask Decode Reveal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A white editorial sheet whose headline is wiped in line by line by an ink bar, while the small mono labels decode letter
 * by letter through a short flicker of random glyphs. Good for a hero, a section intro or a cover card.
 *
 * What it shows
 * - One sheet: a label row (decoding label + issue number), a hairline, a large two-line headline, and three columns
 *   each with a decoding label and a short sentence. Markup is built by the mount function.
 * - The headline is a "line" unit, the four labels are "char" units. Each unit keeps one hidden full-text copy for
 *   screen readers (.ts-sr) and an aria-hidden visual layer that is animated.
 *
 * How it moves
 * - On mount the sheet shows the finished text for 0.9 s, then plays one pass and stops on the finished text (no loop).
 * - Line unit: the headline is split into the rows it actually wraps to (measured word by word after fonts load). Row i
 *   starts i * lineStagger ms after row 0 and runs lineDuration ms. Within a row's progress t (0..1):
 *     0 - 34%   an ink bar (same colour as the text) grows from the left, scaleX 0 -> 1, ease-out (.22,1,.36,1)
 *     34 - 42%  the bar holds briefly, fully covering the row
 *     42 - 100% the bar slides out to the right, translateX 0 -> 102%, ease (.33,.55,.2,1)
 *     36 - 50%  the text under it fades from 0 to 1 (still hidden by the bar). The text itself never moves.
 *   Phase proportions stay fixed when lineDuration changes.
 * - Char unit: letter i starts (i + 1) * charStagger ms after the unit starts. Each letter runs 165 ms: three rounds of
 *   55 ms, each showing a substitute glyph from "A-Z 0-9 / +" picked by a fixed formula (the
 *   same sequence every time) that fades in over 20 ms; round one also shows a solid block. Then the real letter returns.
 *   Letters keep their measured width, so words do not jitter.
 * - Unit duration: line = lineDuration + (rows - 1) * lineStagger; char = letters * charStagger + 165 ms.
 * - Interaction: click anywhere on the stage = replay all units at once (no 0.9 s hold). Moving a mouse or pen onto the
 *   label row or one of the three columns decodes that label again (not on touch, and not while it is already running).
 * - Layout: sheet width min(640, stage width - 48), centred, 24 px margins; headline size min(72, (width - 64) / 6.4) px,
 *   shrunk (to 28 px at least) if the sheet would be taller than the stage. At 760 px and narrower: 16 px margins, 20 px
 *   inner padding, the three columns stack. A width change re-splits the headline rows; finished text stays finished.
 *
 * Options
 *   params.lineDuration  600..1800, default 900 (ms)  one headline row: grow, hold, slide out
 *   params.lineStagger   20..200, default 60 (ms)     delay between headline rows
 *   params.charStagger   20..100, default 45 (ms)      delay between letters of a label
 * New values apply from the next replay; finished units stay finished.
 *
 * API
 *   const fx = mountMaskDecodeReveal(element, {params: {...}});
 *   fx.params                         copy of current params
 *   fx.setParams({lineDuration: 900}) change params
 *   fx.reset()                        params back to defaults; anything waiting or running is fast-forwarded to the
 *                                     finished text over 500 ms (ease-out), no replay
 *   fx.destroy()                      removes listeners and observers, stops the animation, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting live (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountMaskDecodeReveal(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The texts in the markup string inside the mount function (headline, labels, sentences). Mark any other element with
 *   data-line-reveal (row wipe) or data-char-reveal (letter decode) inside the sheet before the reveal is created;
 *   data-reveal-delay="ms" delays one unit.
 * - Colours, radius, shadow, fonts via the CSS variables and rules in effect.css. The bar uses currentColor, so text and
 *   bar always share one colour.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The 34 / 42 / 36-50% phase split and the two curves; the bar must cover fully before it slides away.
 * - Rows must come from real layout (measure after fonts load), not from a fixed split or from fading the whole block.
 * - The 165 ms letter flicker (3 x 55 ms) and the fixed widths per letter.
 * - Do not animate the text itself; only the bar moves.
 * - Do not let a framework re-render the units while it runs; the effect rewrites their children.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountMaskDecodeReveal on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - Screen readers get each text once from the hidden copy; the flickering layer is aria-hidden. No aria-live.
 * - With prefers-reduced-motion: reduce, all text is shown finished, no bars, no flicker, clicks and hovers do nothing.
 *   Turning it off again at runtime replays the 0.9 s hold and one pass.
 */
(function (global) {
  'use strict';

  const CONTROLS = [
    { key: 'lineDuration', type: 'range', min: 600, max: 1800, step: 50, default: 900 },
    { key: 'lineStagger', type: 'range', min: 20, max: 200, step: 10, default: 60 },
    { key: 'charStagger', type: 'range', min: 20, max: 100, step: 5, default: 45 },
  ];
  const DEFAULTS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default]));

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const controls = [
      {
        key: 'lineDuration',
        label: 'Duration',
        type: 'range',
        group: 'Lines',
        min: 600,
        max: 1800,
        step: 50,
        default: 900,
        unit: 'ms',
        description: 'Covers grow, hold, and slide-out.',
        visualizer: 'timeline',
      },
      {
        key: 'lineStagger',
        label: 'Line delay',
        type: 'range',
        group: 'Lines',
        min: 20,
        max: 200,
        step: 10,
        default: 60,
        unit: 'ms',
        description: 'Delay between rendered lines.',
        visualizer: 'timeline',
      },
      {
        key: 'charStagger',
        label: 'Letter delay',
        type: 'range',
        group: 'Characters',
        min: 20,
        max: 100,
        step: 5,
        default: 45,
        unit: 'ms',
        description: 'Letters start in reading order; each flickers for 165ms.',
        visualizer: 'timeline',
      },
      {
        key: 'accent',
        label: 'Text and mask',
        type: 'color',
        group: 'Color',
        default: '#17181a',
        description: 'Shared color for text and mask.',
        visualizer: 'none',
      },
    ];
    const TUNE = {
      grow: 0.34,
      hold: 0.42,
      shift: 1.02,
      textFrom: 0.36,
      textSpan: 0.14,
      rounds: 3,
      round: 55,
      fade: 20,
    };
    const flicker = () => TUNE.rounds * TUNE.round;
    const defaults = Object.fromEntries(controls.map((c) => [c.key, c.default]));
    const clamp = (n) => Math.max(0, Math.min(1, n));
    function bezier(x1, y1, x2, y2) {
      return function (x) {
        x = clamp(x);
        if (x === 0 || x === 1) return x;
        let low = 0,
          high = 1,
          t = x;
        for (let i = 0; i < 14; i++) {
          t = (low + high) / 2;
          const a = 1 - t;
          const value = 3 * a * a * t * x1 + 3 * a * t * t * x2 + t * t * t;
          if (value < x) low = t;
          else high = t;
        }
        const a = 1 - t;
        return 3 * a * a * t * y1 + 3 * a * t * t * y2 + t * t * t;
      };
    }
    const ease = bezier(0.33, 0.55, 0.2, 1),
      easeOut = bezier(0.22, 1, 0.36, 1);
    function span(className, text) {
      const e = document.createElement('span');
      e.className = className;
      if (text != null) e.textContent = text;
      return e;
    }
    class RevealSystem {
      constructor(root, options = {}) {
        this.root = root;
        this.options = Object.assign({}, defaults, options);
        this.reduced = !!options.reduced;
        this.destroyed = false;
        this.paused = false;
        this.frame = 0;
        this.last = 0;
        this.loop = false;
        this.cycle = 0;
        this.ready = false;
        this.units = Array.from(root.querySelectorAll('[data-line-reveal],[data-char-reveal]'), (node) => ({
          node,
          type: node.hasAttribute('data-line-reveal') ? 'line' : 'char',
          text: (node.innerText || node.textContent).trim().replace(/\s+/g, ' '),
          seen: false,
          active: false,
          time: 0,
          delay: Number(node.dataset.revealDelay || 0),
        }));
        this.tick = this.tick.bind(this);
        this.lastWidth = root.clientWidth;
        this.observer = new ResizeObserver(() => {
          if (this.destroyed || !this.ready) return;
          const width = root.clientWidth;
          if (Math.abs(width - this.lastWidth) > 1) {
            this.lastWidth = width;
            this.rebuild();
          }
        });
        this.observer.observe(root);
        const ready = document.fonts ? document.fonts.ready : Promise.resolve();
        ready.then(() => {
          if (this.destroyed) return;
          this.ready = true;
          this.rebuild();
          if (this.wantsReplay) this.replay(this.loop);
          else this.check();
        });
      }
      rebuildUnit(unit) {
        const node = unit.node;
        node.textContent = '';
        const original = span('ts-sr', unit.text),
          visual = span('ts-visual');
        visual.setAttribute('aria-hidden', 'true');
        node.append(original, visual);
        unit.visual = visual;
        if (unit.type === 'line') {
          const words = unit.text.split(' '),
            tokens = words.map((word) => {
              const e = span('ts-measure-word', word);
              visual.append(e, document.createTextNode(' '));
              return e;
            });
          const rows = [];
          let last = -Infinity;
          tokens.forEach((token) => {
            const top = token.getBoundingClientRect().top;
            if (Math.abs(top - last) > 2) {
              rows.push([]);
              last = top;
            }
            rows[rows.length - 1].push(token.textContent);
          });
          visual.textContent = '';
          unit.lines = rows.map((wordsInRow) => {
            const line = span('ts-line'),
              inner = span('ts-inner', wordsInRow.join(' ')),
              mask = span('ts-mask');
            line.append(inner, mask);
            visual.append(line);
            return { line, inner, mask };
          });
        } else {
          unit.chars = [];
          unit.text.split(' ').forEach((word, wordIndex) => {
            if (wordIndex) visual.append(document.createTextNode(' '));
            const holder = span('ts-word');
            for (const letter of Array.from(word)) {
              const char = span('ts-char', letter);
              char.dataset.original = letter;
              holder.append(char);
              unit.chars.push({ element: char, letter });
            }
            visual.append(holder);
          });
          unit.chars.forEach((char) => (char.element.style.width = char.element.getBoundingClientRect().width + 'px'));
        }
        if (unit.seen && !unit.active) unit.time = this.duration(unit);
        this.render(unit);
      }
      rebuild() {
        if (this.destroyed) return;
        this.units.forEach((u) => this.rebuildUnit(u));
      }
      duration(unit) {
        return unit.type === 'line'
          ? this.options.lineDuration + Math.max(0, (unit.lines?.length || 1) - 1) * this.options.lineStagger
          : (unit.chars?.length || 1) * this.options.charStagger + flicker();
      }
      render(unit) {
        if (!unit.visual) return;
        const elapsed = this.reduced ? Infinity : unit.time;
        if (unit.type === 'line') {
          unit.lines.forEach(({ inner, mask }, i) => {
            const t = clamp((elapsed - i * this.options.lineStagger) / this.options.lineDuration);
            const scale = t < TUNE.grow ? easeOut(t / TUNE.grow) : 1,
              travel = t <= TUNE.hold ? 0 : TUNE.shift * ease((t - TUNE.hold) / (1 - TUNE.hold));
            mask.style.transform = `translateX(${travel * 100}%) scaleX(${scale})`;
            inner.style.opacity = String(ease((t - TUNE.textFrom) / TUNE.textSpan));
          });
        } else {
          const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+';
          unit.chars.forEach(({ element, letter }, i) => {
            const local = elapsed - (i + 1) * this.options.charStagger;
            if (local < 0) {
              element.textContent = letter;
              element.style.opacity = '0';
              element.style.setProperty('--char-block', '0');
            } else if (local >= flicker()) {
              element.textContent = letter;
              element.style.opacity = '1';
              element.style.setProperty('--char-block', '0');
            } else {
              const round = Math.min(TUNE.rounds - 1, Math.floor(local / TUNE.round));
              element.textContent = glyphs[(i * 11 + round * 7 + 3) % glyphs.length];
              element.style.opacity = String(clamp((local - round * TUNE.round) / TUNE.fade));
              element.style.setProperty('--char-block', round === 0 ? '1' : '0');
            }
          });
        }
        unit.node.dataset.revealState = this.reduced
          ? 'complete'
          : !unit.seen
            ? 'waiting'
            : unit.time >= this.duration(unit)
              ? 'complete'
              : 'running';
      }
      begin(unit) {
        unit.seen = true;
        unit.active = true;
        unit.time = -unit.delay;
        this.render(unit);
      }
      check(viewportHeight = window.innerHeight) {
        if (this.destroyed || !this.ready || this.loop) return;
        this.units.forEach((unit) => {
          if (unit.seen || this.reduced) return;
          const box = unit.node.getBoundingClientRect();
          if (box.bottom < 0) {
            unit.seen = true;
            unit.time = this.duration(unit);
            this.render(unit);
          } else if (box.top <= viewportHeight * 0.75) this.begin(unit);
        });
        this.schedule();
      }
      schedule() {
        if (
          !this.frame &&
          !this.destroyed &&
          !this.paused &&
          !this.reduced &&
          (this.loop || this.units.some((u) => u.active))
        ) {
          this.last = 0;
          this.frame = requestAnimationFrame(this.tick);
        }
      }
      tick(time) {
        this.frame = 0;
        if (this.destroyed || this.paused || this.reduced) return;
        const dt = this.last ? Math.min(80, time - this.last) : 0;
        this.last = time;
        this.cycle += dt;
        if (this.loop && this.cycle > Math.max(4400, ...this.units.map((u) => this.duration(u) + u.delay + 1400))) {
          this.units.forEach((u) => this.begin(u));
          this.cycle = 0;
          if (this.options.card && this.options.card.once) this.loop = false;
        }
        this.units.forEach((unit) => {
          if (!unit.active) return;
          unit.time += dt;
          this.render(unit);
          if (unit.time >= this.duration(unit)) unit.active = false;
        });
        if (this.loop || this.units.some((u) => u.active)) this.frame = requestAnimationFrame(this.tick);
      }
      replay(loop = false) {
        if (this.destroyed) return;
        this.loop = loop;
        this.wantsReplay = true;
        this.cycle = 0;
        if (!this.ready) return;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.last = 0;
        const cardOpt = this.options.card;
        if (cardOpt && loop) {
          this.units.forEach((u) => {
            u.seen = true;
            u.active = false;
            u.time = this.duration(u);
            this.render(u);
          });
          this.cycle =
            Math.max(4400, ...this.units.map((u) => this.duration(u) + u.delay + 1400)) - (cardOpt.lead || 0);
        } else this.units.forEach((u) => this.begin(u));
        this.schedule();
      }
      reset() {
        if (this.destroyed) return;
        this.loop = false;
        this.wantsReplay = false;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.last = 0;
        this.units.forEach((u) => {
          u.seen = false;
          u.active = false;
          u.time = 0;
          this.render(u);
        });
      }
      setPaused(value) {
        this.paused = !!value;
        this.root.dataset.motionState = this.paused ? 'paused' : 'playing';
        if (this.paused) {
          cancelAnimationFrame(this.frame);
          this.frame = 0;
          this.last = 0;
        } else this.schedule();
      }
      setParams(values) {
        if (this.destroyed) return;
        Object.assign(this.options, values);
        this.units.forEach((u) => {
          if (u.seen && !u.active) u.time = this.duration(u);
          this.render(u);
        });
      }
      setReduced(value) {
        this.reduced = !!value;
        if (this.reduced) {
          cancelAnimationFrame(this.frame);
          this.frame = 0;
          this.units.forEach((u) => {
            u.active = false;
            u.seen = true;
            this.render(u);
          });
        } else this.units.forEach((u) => this.render(u));
      }
      destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.observer.disconnect();
        this.units.forEach((u) => {
          u.node.textContent = u.text;
          u.node.dataset.revealState = 'complete';
        });
        this.root.dataset.motionState = 'destroyed';
      }
      playUnit(node) {
        const cardOpt = this.options.card;
        if (this.destroyed || !this.ready || this.reduced || !cardOpt || !cardOpt.interactive) return false;
        const unit = this.units.find((u) => u.node === node);
        if (!unit || unit.active) return false;
        this.begin(unit);
        this.schedule();
        return true;
      }
      restore() {
        const cardOpt = this.options.card;
        if (this.destroyed || !this.ready || !cardOpt || !cardOpt.interactive) return;
        this.loop = false;
        this.cycle = 0;
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.last = 0;
        cancelAnimationFrame(this.backFrame);
        this.backFrame = 0;
        const moving = this.units.filter((u) => u.active).map((u) => ({ unit: u, from: u.time }));
        this.units.forEach((u) => {
          u.seen = true;
          u.active = false;
          if (this.reduced || !moving.some((m) => m.unit === u)) {
            u.time = this.duration(u);
            this.render(u);
          }
        });
        if (this.reduced || !moving.length) return;
        let start = -1;
        const step = (now) => {
          this.backFrame = 0;
          if (this.destroyed) return;
          if (start < 0) start = now;
          const p = Math.min(1, Math.max(0, (now - start) / 500)),
            e = easeOut(p);
          moving.forEach(({ unit, from }) => {
            if (unit.active) return;
            const end = this.duration(unit);
            unit.time = p < 1 ? from + (end - from) * e : end;
            this.render(unit);
          });
          if (p < 1) this.backFrame = requestAnimationFrame(step);
        };
        this.backFrame = requestAnimationFrame(step);
      }
    }
    lib.RevealSystem = { create: (root, options) => new RevealSystem(root, options), controls };
  })();
  const LIB = lib;

  // the effect's API as the mount function sees it: every object a call returns that has destroy() is destroyed with the mount
  function ownInstances(api, owned) {
    const out = {};
    for (const name of Object.keys(api)) {
      const part = api[name];
      if (!part || typeof part !== 'object') {
        out[name] = part;
        continue;
      }
      const copy = Object.create(part);
      for (const key of Object.keys(part))
        if (typeof part[key] === 'function')
          copy[key] = function () {
            const made = part[key].apply(this === copy ? part : this, arguments);
            if (made && typeof made === 'object' && typeof made.destroy === 'function') owned.add(made);
            return made;
          };
      out[name] = copy;
    }
    return out;
  }

  // ---- mounting: stage markup, layout, motion and input ----
  function mountMaskDecodeReveal(element, options) {
    options = options || {};
    // destroy() puts the element back as it was and stops whatever this mount function still has scheduled
    const mounted = {
      html: element.innerHTML,
      attrs: Array.from(element.attributes, (a) => [a.name, a.value]),
      frames: new Set(),
      timers: new Set(),
      observers: new Set(),
      owned: new Set(),
      done: false,
    };
    const requestAnimationFrame = (cb) => {
      const f = global.requestAnimationFrame((t) => {
        mounted.frames.delete(f);
        cb(t);
      });
      mounted.frames.add(f);
      return f;
    };
    const cancelAnimationFrame = (f) => {
      mounted.frames.delete(f);
      global.cancelAnimationFrame(f);
    };
    const setTimeout = (cb, ms, ...args) => {
      const t = global.setTimeout(() => {
        mounted.timers.delete(t);
        cb(...args);
      }, ms);
      mounted.timers.add(t);
      return t;
    };
    const clearTimeout = (t) => {
      mounted.timers.delete(t);
      global.clearTimeout(t);
    };
    const setInterval = (cb, ms, ...args) => {
      const t = global.setInterval(cb, ms, ...args);
      mounted.timers.add(t);
      return t;
    };
    const clearInterval = (t) => {
      mounted.timers.delete(t);
      global.clearInterval(t);
    };
    const watched = (Base) =>
      Base &&
      class extends Base {
        constructor(cb, opts) {
          super(cb, opts);
          mounted.observers.add(this);
        }
      };
    const ResizeObserver = watched(global.ResizeObserver),
      IntersectionObserver = watched(global.IntersectionObserver),
      MutationObserver = watched(global.MutationObserver);
    mounted.restore = () => {
      mounted.done = true;
      mounted.owned.forEach((o) => {
        if (o && typeof o.destroy === 'function') o.destroy();
      });
      mounted.owned.clear();
      mounted.frames.forEach((f) => global.cancelAnimationFrame(f));
      mounted.frames.clear();
      mounted.timers.forEach((t) => {
        global.clearTimeout(t);
        global.clearInterval(t);
      });
      mounted.timers.clear();
      mounted.observers.forEach((o) => o.disconnect());
      mounted.observers.clear();
      element.innerHTML = mounted.html;
      for (const a of Array.from(element.attributes)) element.removeAttribute(a.name);
      for (const [name, value] of mounted.attrs) element.setAttribute(name, value);
    };
    const lib = ownInstances(LIB, mounted.owned);
    element.classList.add('mask-decode-reveal');
    element.innerHTML =
      '<div class="fx-board" data-rv-board>\n  <article class="rv-sheet ck-panel" data-reveal-root>\n   <div class="rv-head" data-rv-hover><span class="ck-hint" data-char-reveal>BUILDING NOTES</span><span class="rv-meta ck-hint">VOL. 01 / 2026</span></div>\n   <hr class="ck-rule">\n   <p class="rv-title" data-line-reveal>Clarity takes shape.</p>\n   <div class="rv-foot">\n    <section class="rv-cell" data-rv-hover><div class="ck-hint" data-char-reveal>STRUCTURE</div><p class="ck-text">Start with a clear frame.</p></section>\n    <section class="rv-cell" data-rv-hover><div class="ck-hint" data-char-reveal>MATERIAL</div><p class="ck-text">Give every layer a purpose.</p></section>\n    <section class="rv-cell" data-rv-hover><div class="ck-hint" data-char-reveal>ASSEMBLY</div><p class="ck-text">Let the connections show.</p></section>\n   </div>\n  </article>\n </div>';
    const listeners = new AbortController();
    const C = [
      { key: 'lineDuration', min: 600, max: 1800, step: 50, default: 900, unit: 'ms' },
      { key: 'lineStagger', min: 20, max: 200, step: 10, default: 60, unit: 'ms' },
      { key: 'charStagger', min: 20, max: 100, step: 5, default: 45, unit: 'ms' },
    ];
    const stage = element,
      board = stage.querySelector('[data-rv-board]'),
      sheet = board.querySelector('[data-reveal-root]');
    const phone = matchMedia('(max-width: 760px)'),
      motion = matchMedia('(prefers-reduced-motion: reduce)');
    let system = null,
      inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        floating = !phone.matches,
        pad = floating ? 32 : 20;
      let L = 16,
        R = 16,
        T = 16,
        B = 16;
      if (floating) {
        L = 24;
        R = 24;
        T = 24;
        B = 24;
      }
      const w = Math.round(Math.min(640, W - L - R));
      let f = Math.min(72, (w - 2 * pad) / 6.4);
      sheet.style.setProperty('--rv-w', w + 'px');
      for (let i = 0; i < 4; i++) {
        sheet.style.setProperty('--rv-f', f.toFixed(2) + 'px');
        const over = sheet.offsetHeight - (H - T - B);
        if (over <= 0 || f <= 28) break;
        f = Math.max(28, f - over / 2.2);
      }
      sheet.style.setProperty('--rv-x', Math.round(L + (W - L - R - w) / 2) + 'px');
      sheet.style.setProperty('--rv-y', Math.round(Math.max(T, (H - sheet.offsetHeight) / 2)) + 'px');
      if (system && system.ready) system.rebuild();
    }
    place();
    system = inst = lib.RevealSystem.create(sheet, {
      reduced: motion.matches,
      card: { lead: 900, once: true, interactive: true },
    });
    system.replay(true);
    const onMotion = () => {
      system.setReduced(motion.matches);
      if (!motion.matches) system.replay(true);
    };
    motion.addEventListener('change', onMotion, { signal: listeners.signal });
    board.addEventListener(
      'click',
      () => {
        if (motion.matches) return;
        system.replay(false);
      },
      { signal: listeners.signal },
    );
    sheet.querySelectorAll('[data-rv-hover]').forEach((cell) =>
      cell.addEventListener(
        'pointerenter',
        (e) => {
          if (e.pointerType !== 'touch') system.playUnit(cell.querySelector('[data-char-reveal]'));
        },
        { signal: listeners.signal },
      ),
    );
    const applyParams = (p) => system.setParams(p),
      resetView = () => system.restore();
    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);
    if (document.fonts) document.fonts.ready.then(place);

    let params = Object.assign({}, DEFAULTS);
    const setParams = (next) => {
      params = Object.assign({}, params, next);
      if (applyParams) applyParams(Object.assign({}, params));
    };
    if (options.params) setParams(options.params);
    return {
      get params() {
        return Object.assign({}, params);
      },
      setParams,
      reset() {
        params = Object.assign({}, DEFAULTS);
        if (applyParams) applyParams(Object.assign({}, params));
        if (resetView) resetView();
      },
      destroy() {
        if (mounted.done) return;
        listeners.abort();
        observer0.disconnect();
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountMaskDecodeReveal = mountMaskDecodeReveal;
  if (typeof module === 'object' && module.exports) module.exports = mountMaskDecodeReveal;
})(typeof window !== 'undefined' ? window : this);

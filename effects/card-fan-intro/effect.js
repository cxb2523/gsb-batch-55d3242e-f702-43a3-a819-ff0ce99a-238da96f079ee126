/*
 * Card Fan Intro
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * An opening sequence on a small white "screen": six cards pop in one after another into a rotated fan on a light grey
 * cover, fold away, the cover is wiped off from the bottom, and the page behind slides into place (four image tiles, a
 * rule, three dots). Scroll, swipe or use the arrow keys to play it forward or backward. Good for a site intro or a
 * loading-to-hero handoff.
 *
 * What it shows
 * - The screen is 288 x 180 design px scaled by k = min(2, (stage width - 64) / 288, (stage height - 120) / 180),
 *   centred in the stage (at 760 px and narrower: (width - 32) / 288 and (height - 96) / 180). Every length of the
 *   screen in effect.css is multiplied by that scale (a CSS variable set on the board); the rule stays 1.5 px.
 * - Underneath: the "hero" (four tiles with marks, a rule, three dots). On top: the cover with six stacked cards.
 *
 * Timeline (ms on a 3400 ms reference line, the SCORE table in effect.js; params.duration stretches the whole line)
 * Curves: GLIDE = cubic-bezier(.22,1,.36,1) for arrivals, SINK = cubic-bezier(.5,0,.7,.6) for departures,
 * SWEEP = cubic-bezier(.7,0,.25,1) for the cover wipe.
 * - 120 + 70 i: card i grows from scale 0 to 1 over 780 ms (GLIDE) and turns to its angle
 *   [-18, 11, -9, 17, -4, 5] degrees x spread / 20. The full fan holds from 1250 to 1760.
 * - 1760 + 60 (5 - i): card i shrinks back to 0 over 460 ms (SINK), top card first.
 * - 2060 - 2840: the cover is clipped away from the bottom up (inset bottom 0 -> 100%, SWEEP).
 * - 2260 + 60 i: hero tile i slides up from 108% below its slot over 700 ms (GLIDE).
 * - 2380: the rule scales in from the left over 700 ms. 2560 + 60 i: dot i fades in and rises 18 px over 640 ms.
 * - At 3400 the cover is hidden and the hero stays settled.
 * On mount the sequence plays once from 120 (first card) and stops on the settled hero. No loop.
 *
 * Interaction
 * - Wheel over the stage: direction only. Down = play forward at normal speed from the current point to the end; up =
 *   play backward at the same speed to 120 (the empty cover). How far or fast you scroll does not change the speed.
 *   Reversing mid-play turns it around at once. At an end, a wheel that cannot move anything scrolls the page; the
 *   rest of a wheel gesture that started playback is swallowed until a pause of more than 250 ms.
 * - Touch / pen: every 12 px of vertical drag decides a direction (finger up = forward); a drag that starts with
 *   nothing to move scrolls the page instead.
 * - Keyboard (the stage is focusable): Down / PageDown forward, Up / PageUp backward, Home / End jump to either end.
 *   Keys that move nothing are not intercepted.
 * - Click or tap without dragging: replay from 120.
 * - Escape while it plays: skip to the settled hero. Only the instance that has focus inside it answers, or, when
 *   nothing on the page has focus, every instance that is on screen; other instances on the same page are left alone.
 * - While the cover is up, the hero is inert.
 *
 * Options
 *   params.duration  2400..5600, default 3400 (ms)  length of the whole sequence; everything scales with it
 *   params.spread    5..32, default 20 (degrees)     fan angle; 20 gives the base angles above
 *
 * API
 *   const fx = mountCardFanIntro(element, {params: {...}});
 *   fx.params                       copy of current params
 *   fx.setParams({duration: 4000})  apply new params (progress is kept), then replay from 120
 *   fx.reset()                      params back to defaults; no replay: the cover fades out and the hero slides to rest
 *                                   over 500 ms (ease-out .22,1,.36,1)
 *   fx.destroy()                    removes listeners, stops both animation loops, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountCardFanIntro(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - The marks on the tiles and cards (the looks and cards arrays passed to media()), the hero markup in the mount
 *   function. Hero parts are found by data-intro-glyph, data-intro-rule and data-intro-copy.
 * - Colours, radii and the grey cover via the CSS variables and rules in effect.css.
 * - Params within their ranges.
 *
 * Do not change (the feel breaks)
 * - The overlaps: cards still popping in while the first ones settle, cards folding away just before the cover wipes,
 *   the hero starting before the wipe ends. Turning these into back-to-back steps makes it feel like a slideshow.
 * - Backward play is the same curve run in reverse at 1x speed, not a separate animation.
 * - Wheel as a direction switch, not a scrubber; keep handing unused wheel and keys back to the page.
 * - Do not let a framework re-render the screen while it runs; the effect writes transforms and clip-path directly.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountCardFanIntro on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The stage is a focusable group with a label describing the controls; the visual screen is aria-hidden.
 * - With prefers-reduced-motion: reduce, the settled hero shows at once; forward / backward input jumps straight to
 *   either end instead of playing.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared card parts: a white card with a centred mark ----
  const GLYPHS = [
    '<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M50 16v68M16 50h68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    '<rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" stroke-width="8"/>',
    '<path d="M24 24l52 52M76 24L24 76" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  ];
  function glyph(index) {
    return (
      '<svg class="ck-glyph" viewBox="0 0 100 100" aria-hidden="true">' +
      GLYPHS[Math.abs(index | 0) % GLYPHS.length] +
      '</svg>'
    );
  }
  function media(options) {
    options = options || {};
    return (
      '<div class="ck-media' +
      (options.lift ? ' ck-lift' : '') +
      '"' +
      (options.tone ? ' data-tone="' + (options.tone | 0) + '"' : '') +
      (options.size === 'sm' ? ' data-size="sm"' : '') +
      (options.accent ? ' data-accent' : '') +
      ' aria-hidden="true">' +
      (options.glyph == null || options.glyph === false ? '' : glyph(options.glyph)) +
      '</div>'
    );
  }

  const CONTROLS = [
    { key: 'duration', type: 'range', min: 2400, max: 5600, step: 100, default: 3400 },
    { key: 'spread', type: 'range', min: 5, max: 32, step: 1, default: 20 },
  ];
  const DEFAULTS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default]));

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const LINE = 3400;
    const SCORE = {
      deal: { at: 120, gap: 70, len: 780 },
      fold: { at: 1760, gap: 60, len: 460 },
      wipe: { at: 2060, len: 780 },
      tiles: { at: 2260, gap: 60, len: 700, drop: 108 },
      rule: { at: 2380, len: 700 },
      copy: { at: 2560, gap: 60, len: 640, rise: 18 },
    };
    const SETTLE = { ms: 500, curve: 'cubic-bezier(.22,1,.36,1)' };
    function bezier(x1, y1, x2, y2) {
      const ax = 3 * x1 - 3 * x2 + 1,
        bx = 3 * x2 - 6 * x1,
        cx = 3 * x1;
      const ay = 3 * y1 - 3 * y2 + 1,
        by = 3 * y2 - 6 * y1,
        cy = 3 * y1;
      const fx = (s) => ((ax * s + bx) * s + cx) * s,
        fy = (s) => ((ay * s + by) * s + cy) * s;
      return function (x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        let s = x;
        for (let k = 0; k < 6; k++) {
          const d = (3 * ax * s + 2 * bx) * s + cx,
            e = fx(s) - x;
          if (Math.abs(e) < 1e-5) return fy(s);
          if (Math.abs(d) < 1e-6) break;
          s -= e / d;
        }
        let lo = 0,
          hi = 1;
        s = x;
        for (let k = 0; k < 24; k++) {
          if (fx(s) < x) lo = s;
          else hi = s;
          s = (lo + hi) / 2;
        }
        return fy(s);
      };
    }
    const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    const GLIDE = bezier(0.22, 1, 0.36, 1);
    const SINK = bezier(0.5, 0, 0.7, 0.6);
    const SWEEP = bezier(0.7, 0, 0.25, 1);
    const seg = (t, at, len, curve) => curve(unit((t - at) / len));
    const FAN = [-18, 11, -9, 17, -4, 5];
    function mount(root, options) {
      const page = options.content,
        pane = options.scroller || page,
        wall = options.card;
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
      const cover = document.createElement('div');
      cover.className = 'overture-overlay ck-media';
      cover.dataset.tone = '1';
      cover.setAttribute('aria-hidden', 'true');
      cover.innerHTML = `<div class="overture-stack">${Array.from({ length: 6 }, (_, i) => `<div class="overture-card">${wall.media(i)}</div>`).join('')}</div>`;
      root.appendChild(cover);
      const cards = [...cover.querySelectorAll('.overture-card')];
      const heroGlyphs = [...page.querySelectorAll('[data-intro-glyph]')];
      const heroRule = page.querySelector('[data-intro-rule]');
      const heroCopy = [...page.querySelectorAll('[data-intro-copy]')];
      const saved = { pane: pane.style.overflow, inert: page.inert };
      let params = { duration: LINE, spread: 20 };
      let clock = 0,
        prev = 0,
        frame = 0,
        gone = false,
        running = false,
        frozen = false,
        scrubbing = false,
        gliding = null;
      const toLine = (ms) => (ms / LINE) * params.duration;
      const onLine = () => (clock / params.duration) * LINE;
      function freeze() {
        if (frozen) return;
        frozen = true;
        page.inert = true;
        pane.scrollTop = 0;
        pane.style.overflow = 'hidden';
      }
      function thaw() {
        if (!frozen) return;
        frozen = false;
        page.inert = saved.inert;
        pane.style.overflow = saved.pane;
      }
      function heroAtRest() {
        heroGlyphs.forEach((n) => {
          n.style.transform = 'translateY(0%)';
        });
        if (heroRule) heroRule.style.transform = 'scaleX(1)';
        heroCopy.forEach((n) => {
          n.style.opacity = '1';
          n.style.transform = 'translateY(0px)';
        });
      }
      function settle() {
        running = false;
        cover.hidden = true;
        thaw();
        heroAtRest();
      }
      function draw() {
        const t = onLine();
        if ((calm.matches && !scrubbing) || t >= LINE) {
          if (running) settle();
          return;
        }
        const S = SCORE,
          last = cards.length - 1;
        cards.forEach((n, i) => {
          const grow = seg(t, S.deal.at + i * S.deal.gap, S.deal.len, GLIDE);
          const shrink = seg(t, S.fold.at + (last - i) * S.fold.gap, S.fold.len, SINK);
          n.style.transform = `scale(${grow * (1 - shrink)}) rotate(${FAN[i] * (params.spread / 20) * grow}deg)`;
        });
        cover.style.clipPath = `inset(0% 0% ${seg(t, S.wipe.at, S.wipe.len, SWEEP) * 100}% 0%)`;
        heroGlyphs.forEach((n, i) => {
          n.style.transform = `translateY(${S.tiles.drop * (1 - seg(t, S.tiles.at + i * S.tiles.gap, S.tiles.len, GLIDE))}%)`;
        });
        if (heroRule) heroRule.style.transform = `scaleX(${seg(t, S.rule.at, S.rule.len, GLIDE)})`;
        heroCopy.forEach((n, i) => {
          const p = seg(t, S.copy.at + i * S.copy.gap, S.copy.len, GLIDE);
          n.style.transform = `translateY(${S.copy.rise * (1 - p)}px)`;
          n.style.opacity = String(p);
        });
      }
      function step(now) {
        frame = 0;
        if (gone || calm.matches || gliding || scrubbing) return;
        if (prev) clock += Math.min(now - prev, 64);
        prev = now;
        draw();
        if (clock < params.duration) frame = requestAnimationFrame(step);
      }
      function wake() {
        if (!frame && !gone && !calm.matches) frame = requestAnimationFrame(step);
      }
      function dropGlide() {
        if (gliding) {
          gliding.forEach((a) => a.cancel());
          gliding = null;
        }
      }
      function start() {
        dropGlide();
        scrubbing = false;
        if (gone) return;
        cancelAnimationFrame(frame);
        frame = 0;
        prev = 0;
        running = true;
        cover.hidden = false;
        clock = toLine(wall.start);
        cover.style.clipPath = 'inset(0%)';
        freeze();
        draw();
        wake();
      }
      function setParams(next) {
        if (gone) return;
        const share = clock / params.duration;
        params = Object.assign({}, params, next);
        clock = share * params.duration;
        draw();
      }
      function skip() {
        if (gone) return;
        clock = params.duration;
        settle();
        cancelAnimationFrame(frame);
        frame = 0;
      }
      function mine() {
        const a = document.activeElement;
        if (a && a !== document.body && a !== document.documentElement) return root.contains(a);
        const r = root.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < (window.innerHeight || 0) &&
          r.left < (window.innerWidth || 0)
        );
      }
      function onKeydown(e) {
        if (e.key === 'Escape' && running && !e.defaultPrevented && mine()) {
          e.preventDefault();
          skip();
        }
      }
      function onCalm() {
        if (calm.matches) {
          cancelAnimationFrame(frame);
          frame = 0;
          clock = params.duration;
          settle();
        } else wake();
      }
      function onPageshow(e) {
        if (e.persisted) {
          clock = params.duration;
          settle();
        }
      }
      window.addEventListener('keydown', onKeydown);
      window.addEventListener('pageshow', onPageshow);
      calm.addEventListener('change', onCalm);
      function destroy() {
        if (gone) return;
        gone = true;
        cancelAnimationFrame(frame);
        frame = 0;
        thaw();
        heroAtRest();
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('pageshow', onPageshow);
        calm.removeEventListener('change', onCalm);
        cover.remove();
      }
      function seek(ms) {
        if (gone) return;
        dropGlide();
        scrubbing = true;
        cancelAnimationFrame(frame);
        frame = 0;
        prev = 0;
        clock = toLine(Math.max(0, Math.min(LINE, ms)));
        if (!running) {
          running = true;
          cover.hidden = false;
          freeze();
        }
        draw();
      }
      function play() {
        if (gone || !scrubbing) return;
        scrubbing = false;
        prev = 0;
        if (calm.matches || clock >= params.duration) {
          clock = params.duration;
          if (running) settle();
          return;
        }
        wake();
      }
      function restore() {
        if (gone) return;
        scrubbing = false;
        if (!running || gliding) return;
        cancelAnimationFrame(frame);
        frame = 0;
        const targets = [[cover, { opacity: 0 }]];
        heroGlyphs.forEach((n) => targets.push([n, { transform: 'translateY(0%)' }]));
        if (heroRule) targets.push([heroRule, { transform: 'scaleX(1)' }]);
        heroCopy.forEach((n) => targets.push([n, { opacity: 1, transform: 'translateY(0px)' }]));
        const run = (gliding = targets.map(([el, to]) => {
          const now = getComputedStyle(el),
            from = {};
          for (const k of Object.keys(to)) from[k] = now[k];
          return el.animate([from, to], {
            duration: calm.matches ? 0 : SETTLE.ms,
            easing: SETTLE.curve,
            fill: 'forwards',
          });
        }));
        Promise.all(run.map((a) => a.finished)).then(
          () => {
            if (gliding !== run) return;
            gliding = null;
            clock = params.duration;
            settle();
            run.forEach((a) => a.cancel());
          },
          () => {},
        );
      }
      start();
      return {
        replay: () => start(),
        setParams,
        destroy,
        seek,
        play,
        restore,
        position: () => (running ? onLine() : LINE),
      };
    }
    lib.ObjectOverture = { mount, LINE, FIRST: SCORE.deal.at };
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
  function mountCardFanIntro(element, options) {
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
    element.classList.add('card-fan-intro');
    element.innerHTML =
      '<div class="fx-board" data-ov-board tabindex="0" role="group" aria-label="Intro animation. Scroll, swipe, or use arrow keys to play forward or back; Home and End jump to either end; click to replay.">\n  <div class="ov-screen ck-screen" data-ov aria-hidden="true">\n   <div class="ov-hero welcome-content">\n    <div class="ov-tiles" data-tiles></div>\n    <i class="ov-rule ck-line" data-strong data-intro-rule></i>\n    <div class="ov-copy"><span data-intro-copy><i class="ck-dot"></i></span><span data-intro-copy><i class="ck-dot" data-weak></i></span><span data-intro-copy><i class="ck-dot" data-weak></i></span></div>\n   </div>\n  </div>\n </div>';
    const listeners = new AbortController();
    const C = [
      { key: 'duration', min: 2400, max: 5600, step: 100, default: 3400, unit: 'ms' },
      { key: 'spread', min: 5, max: 32, step: 1, default: 20, unit: '°' },
    ];
    const START = lib.ObjectOverture.FIRST,
      END = lib.ObjectOverture.LINE,
      stage = element,
      board = stage.querySelector('[data-ov-board]'),
      screen = board.querySelector('[data-ov]');
    const phone = matchMedia('(max-width: 760px)');
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        floating = !phone.matches;
      let k = Math.min(2, (W - (floating ? 64 : 32)) / 288, (H - (floating ? 120 : 96)) / 180);
      let x = (W - 288 * k) / 2,
        y = (H - 180 * k) / 2;

      board.style.setProperty('--fx-k', k.toFixed(4));
      screen.style.setProperty('--ov-x', Math.round(x) + 'px');
      screen.style.setProperty('--ov-y', Math.round(y) + 'px');
    }
    place();
    const looks = [
      { tone: 2, glyph: 0 },
      { tone: 1, glyph: 1 },
      { tone: 2, glyph: 2, accent: true },
      { tone: 1, glyph: 3 },
    ];
    screen.querySelector('[data-tiles]').innerHTML = looks
      .map((o) => '<span><i data-intro-glyph>' + media(Object.assign({ size: 'sm' }, o)) + '</i></span>')
      .join('');
    const cards = [{ glyph: 0 }, { glyph: 1 }, { glyph: 2 }, { tone: 2, glyph: false }, { glyph: 3 }, { glyph: 0 }];
    const content = screen.querySelector('.welcome-content');
    const intro = lib.ObjectOverture.mount(screen, {
      content,
      scroller: content,
      card: {
        media: (i) => media(Object.assign({ size: 'sm' }, cards[i])),
        start: START,
        once: true,
        interactive: true,
      },
    });
    let replayQueued = false;
    const inst = intro;
    const WHEEL_GAP = 250,
      DRAG_TH = 12;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let mode = 'auto',
      dir = 0,
      cur = END,
      dur = END,
      raf = 0,
      last = 0;
    const now = () =>
      mode === 'run' || mode === 'hold'
        ? cur
        : mode === 'rest'
          ? END
          : Math.max(START, Math.min(END, intro.position()));
    const moving = () => (mode === 'run' ? dir : mode === 'auto' && intro.position() < END ? 1 : 0);
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function arrive() {
      stop();
      dir = 0;
      if (cur >= END) {
        cur = END;
        intro.seek(END);
        intro.play();
        mode = 'auto';
      } else {
        cur = START;
        intro.seek(START);
        mode = 'hold';
      }
    }
    function tick(t) {
      raf = 0;
      const dt = last ? Math.min(t - last, 64) : 0;
      last = t;
      cur += (dir * dt * END) / dur;
      if ((dir > 0 && cur >= END) || (dir < 0 && cur <= START)) {
        arrive();
        return;
      }
      intro.seek(cur);
      raf = requestAnimationFrame(tick);
    }
    function go(d) {
      if (moving() === d) return true;
      const from = now();
      if (d > 0 ? from >= END : from <= START) return false;
      stop();
      mode = 'run';
      dir = d;
      cur = from;
      intro.seek(cur);
      if (reduced.matches) {
        cur = d > 0 ? END : START;
        arrive();
      } else raf = requestAnimationFrame(tick);
      return true;
    }
    function jump(d) {
      const from = now();
      if (d > 0 ? from >= END : from <= START) return false;
      stop();
      cur = d > 0 ? END : START;
      arrive();
      return true;
    }
    function replay() {
      stop();
      mode = 'auto';
      dir = 0;
      intro.replay();
    }
    let wheelAt = -Infinity,
      held = false;
    board.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || !e.deltaY) return;
        const t = performance.now();
        if (t - wheelAt > WHEEL_GAP) held = false;
        wheelAt = t;
        if (go(e.deltaY > 0 ? 1 : -1)) {
          held = true;
          e.preventDefault();
        } else if (held) e.preventDefault();
      },
      { signal: listeners.signal, passive: false },
    );
    let down = null;
    board.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        down = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          ay: e.clientY,
          ly: e.clientY,
          touch: e.pointerType !== 'mouse',
          drag: false,
          own: null,
        };
        if (down.touch)
          try {
            board.setPointerCapture(e.pointerId);
          } catch (err) {}
      },
      { signal: listeners.signal },
    );
    board.addEventListener(
      'pointermove',
      (e) => {
        if (!down || e.pointerId !== down.id) return;
        if (!down.drag) {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
          down.drag = true;
        }
        if (!down.touch) return;
        if (down.own === false) {
          window.scrollBy(0, down.ly - e.clientY);
          down.ly = e.clientY;
          return;
        }
        const dy = down.ay - e.clientY;
        if (Math.abs(dy) < DRAG_TH) return;
        down.ay = e.clientY;
        const used = go(dy > 0 ? 1 : -1);
        if (down.own === null) {
          down.own = used;
          if (!used) {
            window.scrollBy(0, down.y - e.clientY);
            down.ly = e.clientY;
          }
        }
      },
      { signal: listeners.signal },
    );
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down;
      down = null;
      if (!d.drag && e.type === 'pointerup') {
        replay();
      }
    };
    board.addEventListener('pointerup', up, { signal: listeners.signal });
    board.addEventListener('pointercancel', up, { signal: listeners.signal });
    board.addEventListener(
      'keydown',
      (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const k = e.key;
        const used =
          k === 'ArrowDown' || k === 'PageDown'
            ? go(1)
            : k === 'ArrowUp' || k === 'PageUp'
              ? go(-1)
              : k === 'End'
                ? jump(1)
                : k === 'Home'
                  ? jump(-1)
                  : false;
        if (used) e.preventDefault();
      },
      { signal: listeners.signal },
    );
    const applyParams = (p) => {
        dur = p.duration;
        intro.setParams(p);
        if (!replayQueued) {
          replayQueued = true;
          queueMicrotask(() => {
            if (replayQueued) {
              replayQueued = false;
              replay();
            }
          });
        }
      },
      resetView = () => {
        replayQueued = false;
        stop();
        mode = 'rest';
        dir = 0;
        cur = END;
        intro.restore();
      };

    place();
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

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
        cancelAnimationFrame(raf);
        if (inst) mounted.owned.add(inst);
        mounted.restore();
      },
    };
  }
  global.mountCardFanIntro = mountCardFanIntro;
  if (typeof module === 'object' && module.exports) module.exports = mountCardFanIntro;
})(typeof window !== 'undefined' ? window : this);

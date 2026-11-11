/*
 * Scroll Speed Scramble
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A headline on a white card whose letters scramble into code-like characters as you scroll over it: the faster the
 * scroll, the more letters flip, and they settle back to the real text as you slow down. Click the card and the letters
 * scatter apart; click again and they gather. Good for a hero headline, a section title or a loading-flavoured intro.
 *
 * How it moves
 * - Speed meter: every wheel step, drag move or arrow key adds its distance to a meter that decays exponentially
 *   (time constant 120 ms). Speed = meter / 0.12 s in px/s; energy = min(1, speed / 2000) and only ever jumps up from
 *   input.
 * - Scramble tick, every max(16, scrambleDuration / round(scrambleDuration / 42)) ms (about 42 ms): a letter is noise
 *   when ((index x 13 + step x 7) mod 100) / 100 < scrambleDensity x energy, and shows
 *   charset[(index x 7 + step x 13) mod length]. The pattern is deterministic, not random, so it reads as a rolling
 *   code. Noise letters switch to the monospace font in a muted colour; the first noise letter in the line is accent.
 *   Letter widths are frozen while scrambling so the line does not jitter. Energy drops by tick / scrambleDuration per
 *   tick, so after the input stops it settles in scrambleDuration ms.
 * - Wheel capture: the card owns a virtual scroll track 1.5 x its height long. The wheel is captured until that track
 *   is used up in that direction, then held for the rest of the gesture (250 ms latch), then the first 100 px of a new
 *   gesture are swallowed (reset after 1.2 s idle or a direction change) before the page scrolls.
 * - Scatter (click or tap on the card without moving more than 6 px, or Enter / Space): letter i moves to
 *   x = (i - (n - 1) / 2) x scatterDistance x 0.5, y = ((i x 7 mod 5) - 2) x scatterDistance, rotate ((i mod 3) - 1) x 6 deg,
 *   over clamp(0.86 x scrambleDuration, 460, 840) ms with a 22 ms stagger left to right. Gather runs right to left with
 *   a 14 ms stagger over clamp(0.74 x scrambleDuration, 420, 760) ms. Letters may leave the card while scattered.
 * - Other input: drag anywhere on the board scrambles by drag speed; on touch, drag beyond the track end is passed to
 *   the page with window.scrollBy. Keys on the focused board: ArrowDown / ArrowUp feed 40 px, PageDown / PageUp feed
 *   0.875 x board height.
 * - reset(): params back to defaults, letters settle at once and gather if scattered.
 *
 * Options
 *   params.scrambleDensity   0.2..1, default 0.67      share of letters that may flip at full speed
 *   params.scrambleDuration  240..1200, default 672    ms to settle; also sets the scatter / gather durations
 *   params.scatterDistance   4..40, default 18         px spread of the scatter (changing it while scattered re-places live)
 *   params.charset           'latin' | 'numeric' | 'symbols', default 'latin'   characters used for noise
 *                            (A-Z, 0-9 or !@#$%^&*+-=/?); reset() sets it back to 'latin'.
 *
 * API
 *   const fx = mountScrollSpeedScramble(element, {params: {...}});
 *   fx.params                           copy of current params
 *   fx.setParams({scrambleDensity: 1})  change params live
 *   fx.reset()                          defaults, text settled and gathered
 *   fx.destroy()                        stops every timer, removes observers, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:520px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountScrollSpeedScramble(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. The card is centred. Font
 * size is fitted to the stage: one line, up to 80 px, above 760 px viewport width; two lines, up to 60 px, at 760 px
 * and below (the break is after the 15th character).
 *
 * Safe to change
 * - The text: the headline inside .tx-head in the stage markup (and its aria-label). If you change it, adjust the
 *   two-line break in measure() (slice(0, 15) / slice(16)) and the matching nth-child rules in effect.css.
 * - Colours, card and fonts via effect.css; params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Noise must come from speed, not from position: keep the decaying meter and the energy decay per tick.
 * - Keep the frozen letter widths during scramble, or the line jitters as monospace characters swap in.
 * - Keep the deterministic index / step pattern; Math.random looks like flicker instead of a rolling code.
 * - Keep the wheel capture and the end push, or a fast flick scrolls the page away before anything scrambles.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). Without it timers keep running. In React StrictMode the mount runs twice; destroy in the cleanup
 *   handles that.
 * - Render an empty container and let the effect own its children (it splits the headline into one span per letter).
 *   Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountScrollSpeedScramble on an embed div with a fixed height.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The board is a focusable group with an aria-label naming the inputs; the headline keeps the real text in its
 *   aria-label, so screen readers never read the noise.
 * - With prefers-reduced-motion: and and letter transitions are switched off (scatter and
 *   gather jump). Scrambling on input still happens.
 */
(function (global) {
  'use strict';

  const CONTROLS = [
    { key: 'scrambleDensity', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.67 },
    { key: 'scrambleDuration', type: 'range', min: 240, max: 1200, step: 24, default: 672 },
    { key: 'scatterDistance', type: 'range', min: 4, max: 40, step: 1, default: 18 },
    { key: 'charset', type: 'select', default: 'latin' },
  ];
  const DEFAULTS = Object.fromEntries(CONTROLS.map((c) => [c.key, c.default]));

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    function build(title, controlsRoot, specimen, cardOpt) {
      const scrambleButton = controlsRoot ? controlsRoot.querySelector('[data-action="scramble"]') : null;
      const scatterButton = controlsRoot ? controlsRoot.querySelector('[data-action="scatter"]') : null;
      const controls = [
        {
          key: 'scrambleDensity',
          label: 'Scramble',
          type: 'range',
          group: 'Characters',
          min: 0.2,
          max: 1,
          step: 0.01,
          default: 0.67,
          unit: '',
          description: 'Share of characters replaced at once.',
          visualizer: 'none',
        },
        {
          key: 'scrambleDuration',
          label: 'Settle',
          type: 'range',
          group: 'Timing',
          min: 240,
          max: 1200,
          step: 24,
          default: 672,
          unit: 'ms',
          description: 'Time for characters to return to the original.',
          visualizer: 'timeline',
        },
        {
          key: 'scatterDistance',
          label: 'Scatter',
          type: 'range',
          group: 'Space',
          min: 4,
          max: 40,
          step: 1,
          default: 18,
          unit: 'px',
          description: 'Maximum character offset when scattered.',
          visualizer: 'pointer',
        },
        {
          key: 'charset',
          label: 'Character set',
          type: 'select',
          group: 'Characters',
          options: [
            { value: 'latin', label: 'Latin' },
            { value: 'numeric', label: 'Numbers' },
            { value: 'symbols', label: 'Symbols' },
          ],
          default: 'latin',
          description: 'Characters used while scrambling.',
          visualizer: 'none',
        },
      ];
      const original = title.textContent;
      const charsets = {
        latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        numeric: '0123456789',
        symbols: '!@#$%^&*+-=/?',
      };
      let values = { scrambleDensity: 0.67, scrambleDuration: 672, scatterDistance: 18, charset: 'latin' };
      let letters = [];
      let token = 0;
      let timer = 0;
      let scatterFrame = 0;
      let scatterPaintFrame = 0;
      let scattered = false;
      function spans() {
        title.innerHTML = '';
        Array.from(original).forEach((char) => {
          const span = document.createElement('span');
          span.textContent = char === ' ' ? '\u00a0' : char;
          title.appendChild(span);
        });
        letters = Array.from(title.children);
        return letters;
      }
      function cancelScatterFrames() {
        window.cancelAnimationFrame(scatterFrame);
        window.cancelAnimationFrame(scatterPaintFrame);
        scatterFrame = 0;
        scatterPaintFrame = 0;
      }
      function originalChar(index) {
        return original[index] === ' ' ? '\u00a0' : original[index];
      }
      function updateControlState() {
        if (scatterButton) {
          scatterButton.textContent = scattered ? 'Restore' : 'Scatter';
          scatterButton.setAttribute('aria-pressed', String(scattered));
        }
        if (scrambleButton) scrambleButton.disabled = scattered;
      }
      function clearLetterMotion(span) {
        span.style.transform = '';
        span.style.transitionProperty = '';
        span.style.transitionDuration = '';
        span.style.transitionTimingFunction = '';
        span.style.transitionDelay = '';
      }
      function reset() {
        token += 1;
        window.clearTimeout(timer);
        cancelScatterFrames();
        scattered = false;
        letters.forEach((span, index) => {
          span.style.transition = 'none';
          span.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
          span.textContent = originalChar(index);
          span.classList.remove('is-noise', 'is-lead', 'is-scattered');
          span.style.width = '';
        });
        letters.forEach(clearLetterMotion);
        updateControlState();
      }
      function scramble() {
        reset();
        const run = ++token;
        window.clearTimeout(timer);
        let step = 0;
        const frameCount = Math.max(4, Math.round(values.scrambleDuration / 42));
        const chars = charsets[values.charset] || charsets.latin;
        letters.forEach((span) => {
          span.style.width = span.getBoundingClientRect().width + 'px';
        });
        function frame() {
          if (run !== token) return;
          if (specimen.isPaused()) {
            timer = window.setTimeout(frame, 42);
            return;
          }
          let lead = false;
          letters.forEach((span, index) => {
            if (span.textContent === '\u00a0') return;
            const active = ((index * 13 + step * 7) % 100) / 100 < values.scrambleDensity && step < frameCount - 4;
            span.classList.toggle('is-noise', active);
            span.classList.toggle('is-lead', active && !lead);
            if (active) lead = true;
            if (active) span.textContent = chars[(index * 7 + step * 13) % chars.length];
            else span.textContent = original[index] === ' ' ? '\u00a0' : original[index];
          });
          step += 1;
          if (step <= frameCount) timer = window.setTimeout(frame, Math.max(16, values.scrambleDuration / frameCount));
          else reset();
        }
        frame();
      }
      function scatter() {
        reset();
        const run = ++token;
        scattered = true;
        updateControlState();
        scatterFrame = window.requestAnimationFrame(() => {
          scatterPaintFrame = window.requestAnimationFrame(() => {
            if (run !== token || !scattered) return;
            const duration = Math.max(460, Math.min(840, Math.round(values.scrambleDuration * 0.86)));
            letters.forEach((span, index) => {
              if (span.textContent === '\u00a0') return;
              const x = (index - (letters.length - 1) / 2) * values.scatterDistance * 0.5;
              const y = (((index * 7) % 5) - 2) * values.scatterDistance;
              const rotation = ((index % 3) - 1) * 6;
              span.style.transitionProperty = 'transform, color';
              span.style.transitionDuration = duration + 'ms, 220ms';
              span.style.transitionTimingFunction = 'var(--out), var(--out)';
              span.style.transitionDelay = index * 22 + 'ms, ' + index * 12 + 'ms';
              span.classList.add('is-scattered');
              span.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + rotation + 'deg)';
            });
          });
        });
      }
      function restoreScatter() {
        const run = ++token;
        window.clearTimeout(timer);
        cancelScatterFrames();
        scattered = false;
        updateControlState();
        const duration = Math.max(420, Math.min(760, Math.round(values.scrambleDuration * 0.74)));
        letters.forEach((span, index) => {
          if (span.textContent === '\u00a0') return;
          span.style.transitionProperty = 'transform, color';
          span.style.transitionDuration = duration + 'ms, 180ms';
          span.style.transitionTimingFunction = 'var(--out), var(--out)';
          span.style.transitionDelay = (letters.length - index - 1) * 14 + 'ms, 0ms';
          span.classList.remove('is-scattered');
          span.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
        });
        timer = window.setTimeout(
          () => {
            if (run !== token) return;
            letters.forEach(clearLetterMotion);
          },
          duration + letters.length * 14 + 40,
        );
      }
      function onControl(event) {
        const action = event.target.dataset.action;
        if (action === 'scramble') scramble();
        if (action === 'scatter') scattered ? restoreScatter() : scatter();
      }
      const surface = cardOpt.surface || title;
      const hit = cardOpt.hit || title;
      const SPEED_TAU = 120,
        SPEED_FULL = 2000,
        TRAVEL = 1.5;
      let meter = 0,
        meterAt = 0,
        energy = 0,
        speedTimer = 0,
        speedStep = 0;
      let travel = 0,
        drag = null;
      const liveOff = [];
      function speedNow() {
        const now = performance.now();
        meter *= Math.exp(-(now - meterAt) / SPEED_TAU);
        meterAt = now;
        return (meter * 1000) / SPEED_TAU;
      }
      function feed(px) {
        speedNow();
        meter += Math.abs(px);
        energy = Math.max(energy, Math.min(1, (meter * 1000) / SPEED_TAU / SPEED_FULL));
        if (!speedTimer && energy > 0) speedTick();
      }
      function speedTick() {
        speedTimer = 0;
        const frameCount = Math.max(4, Math.round(values.scrambleDuration / 42));
        const beat = Math.max(16, values.scrambleDuration / frameCount);
        if (specimen.isPaused()) {
          speedTimer = window.setTimeout(speedTick, beat);
          return;
        }
        energy = Math.max(energy, Math.min(1, speedNow() / SPEED_FULL));
        if (energy <= 0.001) {
          speedSettle();
          return;
        }
        const chars = charsets[values.charset] || charsets.latin;
        const density = values.scrambleDensity * energy;
        letters.forEach((span) => {
          if (!span.style.width) span.style.width = parseFloat(window.getComputedStyle(span).width) + 'px';
        });
        let lead = false;
        letters.forEach((span, index) => {
          if (original[index] === ' ') return;
          const active = ((index * 13 + speedStep * 7) % 100) / 100 < density;
          span.classList.toggle('is-noise', active);
          span.classList.toggle('is-lead', active && !lead);
          if (active) lead = true;
          span.textContent = active ? chars[(index * 7 + speedStep * 13) % chars.length] : originalChar(index);
        });
        speedStep += 1;
        energy = Math.max(0, energy - beat / values.scrambleDuration);
        speedTimer = window.setTimeout(speedTick, beat);
      }
      function speedSettle() {
        window.clearTimeout(speedTimer);
        speedTimer = 0;
        energy = 0;
        letters.forEach((span, index) => {
          span.textContent = originalChar(index);
          span.classList.remove('is-noise', 'is-lead');
          span.style.width = '';
        });
      }
      function release() {
        if (!drag) return;
        const id = drag.id;
        drag = null;
        surface.classList.remove('tx-dragging');
        if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
      }
      function travelEnd() {
        return surface.clientHeight * TRAVEL;
      }
      function atEnd(d) {
        return (d < 0 && travel <= 0) || (d > 0 && travel >= travelEnd());
      }
      function travelBy(d) {
        const was = travel;
        travel = Math.max(0, Math.min(travelEnd(), travel + d));
        return d - (travel - was);
      }
      function toggle() {
        if (scattered) restoreScatter();
        else scatter();
        if (cardOpt.touched) cardOpt.touched();
      }
      function liveListen() {
        const WHEEL_GAP = 250,
          gap = cardOpt.wheelLatch ? (typeof cardOpt.wheelLatch === 'number' ? cardOpt.wheelLatch : WHEEL_GAP) : 0;
        let wheelAt = -Infinity,
          held = false;
        const PUSH_IDLE = 1200,
          push = cardOpt.endPush ? (typeof cardOpt.endPush === 'number' ? cardOpt.endPush : 100) : 0;
        let pushed = 0,
          pushDir = 0,
          pushAt = -Infinity;
        const on = (type, fn, opts) => {
          surface.addEventListener(type, fn, opts);
          liveOff.push(() => surface.removeEventListener(type, fn, opts));
        };
        on(
          'wheel',
          (event) => {
            if (event.ctrlKey) return;
            const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? surface.clientHeight : 1;
            const dy = event.deltaY * unit,
              dx = event.deltaX * unit;
            if (!dy && !dx) return;
            feed(Math.hypot(dx, dy));
            if (gap && dy) {
              const now = performance.now();
              if (now - wheelAt > gap) held = false;
              wheelAt = now;
            }
            if (dy && !atEnd(dy)) {
              if (gap) held = true;
              pushed = 0;
              event.preventDefault();
              travelBy(dy);
            } else if (gap && dy && held) event.preventDefault();
            else if (push && dy) {
              const now = performance.now();
              if (Math.sign(dy) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(dy);
              pushAt = now;
              if (pushed < push) {
                pushed += Math.abs(dy);
                event.preventDefault();
              }
            }
          },
          { passive: false },
        );
        on('pointerdown', (event) => {
          if (event.button !== 0) return;
          release();
          drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            sx: event.clientX,
            sy: event.clientY,
            moved: false,
            touch: event.pointerType !== 'mouse',
            tap: hit.contains(event.target),
          };
          surface.setPointerCapture(event.pointerId);
          surface.classList.add('tx-dragging');
        });
        on('pointermove', (event) => {
          if (!drag || event.pointerId !== drag.id) return;
          const dx = event.clientX - drag.x,
            dy = drag.y - event.clientY;
          drag.x = event.clientX;
          drag.y = event.clientY;
          if (!drag.moved && Math.hypot(drag.x - drag.sx, drag.y - drag.sy) < 6) return;
          drag.moved = true;
          feed(Math.hypot(dx, dy));
          if (drag.touch && dy) {
            const left = travelBy(dy);
            if (Math.abs(left) > 0.5) window.scrollBy(0, left);
          }
        });
        const up = (event) => {
          if (!drag || event.pointerId !== drag.id) return;
          const tapped = event.type === 'pointerup' && !drag.moved && drag.tap;
          release();
          if (tapped) toggle();
        };
        on('pointerup', up);
        on('pointercancel', up);
        on('lostpointercapture', up);
        on('keydown', (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const k = event.key;
          if (k === 'Enter' || k === ' ') {
            event.preventDefault();
            toggle();
            return;
          }
          const page = surface.clientHeight * 0.875;
          const d =
            k === 'ArrowDown' ? 40 : k === 'ArrowUp' ? -40 : k === 'PageDown' ? page : k === 'PageUp' ? -page : 0;
          if (!d) return;
          feed(d);
          if (!atEnd(d)) {
            event.preventDefault();
            travelBy(d);
          }
        });
      }
      function liveRestore() {
        release();
        meter = 0;
        travel = 0;
        speedSettle();
        if (!scattered) return;
        restoreScatter();
        const cap = 600 - (letters.length - 1) * 14;
        letters.forEach((span) => {
          if (parseFloat(span.style.transitionDuration) > cap) span.style.transitionDuration = cap + 'ms, 180ms';
        });
      }
      spans();
      updateControlState();
      if (controlsRoot) controlsRoot.addEventListener('click', onControl);
      liveListen();
      return {
        controls,
        init() {
          return function () {
            if (controlsRoot) controlsRoot.removeEventListener('click', onControl);
            window.clearTimeout(timer);
            cancelScatterFrames();
            {
              release();
              liveOff.splice(0).forEach((off) => off());
            }
          };
        },
        setParams(next) {
          values = Object.assign({}, values, next);
          if (scattered && Object.prototype.hasOwnProperty.call(next, 'scatterDistance')) {
            letters.forEach((span, index) => {
              if (span.textContent === '\u00a0') return;
              const x = (index - (letters.length - 1) / 2) * values.scatterDistance * 0.5;
              const y = (((index * 7) % 5) - 2) * values.scatterDistance;
              const rotation = ((index % 3) - 1) * 6;
              span.style.transitionDelay = '0ms';
              span.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + rotation + 'deg)';
            });
          }
        },
        reset,
        replay: scramble,
        ...{ restore: liveRestore },
      };
    }
    lib.TextScramble = {
      create: (title, options) => build(title, null, (options || {}).specimen, (options || {}).card),
    };
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
  function mountScrollSpeedScramble(element, options) {
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
    element.classList.add('scroll-speed-scramble');
    element.innerHTML =
      '<div class="fx-board" data-tx-board tabindex="0" role="group" aria-label="Headline. Scroll, drag, or use arrow keys to scramble; click or press Enter to scatter and gather."><div class="tx-sheet ck-panel" data-size="lg"><p class="tx-head" aria-label="Clear type sets the rhythm">Clear type sets the rhythm</p></div></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-tx-board]'),
      sheet = board.querySelector('.tx-sheet'),
      head = sheet.querySelector('.tx-head'),
      narrow = matchMedia('(max-width:760px)');
    const inst = lib.TextScramble.create(head, {
      specimen: { isPaused: () => false, getMode: () => 'live' },
      card: { interactive: true, surface: board, hit: sheet, wheelLatch: true, endPush: true },
    });
    let EM = null;
    function measure() {
      sheet.style.fontSize = '100px';
      const ws = [...head.children].map((el) => el.offsetWidth / 100),
        sum = (a) => a.reduce((s, v) => s + v, 0);
      EM = { one: sum(ws), l1: sum(ws.slice(0, 15)), l2: sum(ws.slice(16)) };
    }
    function layout() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        two = narrow.matches;
      board.toggleAttribute('data-two', two);
      if (!EM) measure();
      const L = Math.max(EM.l1, EM.l2),
        F = two
          ? Math.min((W - 32) / (L + 1.5), (H - 48) / (2 * 1.2 + 1.4), 60)
          : Math.min((W - 144) / (EM.one + 1.5), (H - 96) / (1.2 + 1.4), 80);
      sheet.style.fontSize = F.toFixed(2) + 'px';
      head.style.width = '';
      if (two) head.style.width = Math.ceil(L * F + 1) + 'px';
      const w = sheet.offsetWidth,
        h = sheet.offsetHeight,
        x = (W - w) / 2;
      let y = (H - h) / 2;

      sheet.style.left = x.toFixed(1) + 'px';
      sheet.style.top = y.toFixed(1) + 'px';
    }
    layout();
    const observer0 = new ResizeObserver(layout);
    observer0.observe(stage);
    inst.destroy = () => {
      inst.restore();
      inst.init()();
    };
    const applyParams = (p) => inst.setParams(p),
      resetView = () => inst.restore();

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
  global.mountScrollSpeedScramble = mountScrollSpeedScramble;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollSpeedScramble;
})(typeof window !== 'undefined' ? window : this);

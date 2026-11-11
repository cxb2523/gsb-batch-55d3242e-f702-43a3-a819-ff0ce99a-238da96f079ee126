/*
 * Fullscreen Chapter Reveal
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * Five full-bleed scenes stacked in one frame. Scroll, drag or use the keys and each next scene wipes up from the
 * bottom edge over the previous one, its image drifting up a little, while a small label and a row of dots track the
 * current chapter. Good for a chapter intro, a case study opener or a product story told in five beats.
 *
 * How it moves
 * - One progress value p from 0 to 1 covers all five scenes (scaled = p x 4). Scene 0 is always fully shown; scene i
 *   (1..4) is revealed by clip-path inset from the top: amount = clamp(scaled - (i - 1), 0, 1), so its top edge travels
 *   from the bottom of the frame to the top. A hairline rides on that edge (CSS variable --edge).
 * - Inside each scene the image moves up by local x params.parallax x (frame height / 800) px and scales up to 1.025,
 *   where local = clamp(scaled - i + 1, 0, 1).
 * - Label: the active chapter is min(4, floor(scaled + 1 - captionSwitch / 100)); labels cross-fade over a tenth of a
 *   scene around that threshold, the incoming one rising 18 px. The matching dot turns accent.
 * - Input (all on the frame, which captures it):
 *   wheel: p changes by deltaY / (frame height x (scrollSpan / 100 - 1)), so at the default 900 it takes 8 frame
 *     heights of wheel travel to go through all scenes. The view follows with exponential smoothing (60 ms time constant).
 *   drag (mouse, pen, touch; pointer capture): one frame height of drag = one scene, applied immediately. On touch,
 *     drag beyond either end is passed on to the page with window.scrollBy.
 *   keys (the frame is focusable): ArrowDown / PageDown / Space = next scene, ArrowUp / PageUp / Shift+Space =
 *     previous, Home / End = first / last; each snaps to a whole scene.
 *   dots: clicking a dot goes to that scene with the same smoothing as a key press. A press on a dot does not start
 *     a drag, and the page does not scroll.
 *   page hand-off: at either end the wheel stays captured while the gesture continues (250 ms latch), then the first
 *     100 px of a new gesture in the same direction are swallowed (reset after 1.2 s idle or a direction change) before
 *     the page scrolls. This keeps a fast flick from throwing the page past the effect.
 * - reset(): params back to defaults, p eases back to 0 over 500 ms (cubic-bezier(.22, 1, .36, 1)).
 *
 * Options
 *   params.scrollSpan     500..1200, default 900  wheel distance for the whole run, in percent of the frame height
 *   params.parallax       0..100, default 72      image rise per scene, px at an 800 px tall frame
 *   params.captionSwitch  40..80, default 58      how far (percent) a scene is revealed before its label takes over
 *
 * API
 *   const fx = mountFullscreenChapterReveal(element, {params: {...}});
 *   fx.params                      copy of current params
 *   fx.setParams({parallax: 40})   change params live
 *   fx.reset()                     defaults, eases back to the first scene
 *   fx.destroy()                   stops the loop, removes listeners, observers, empties the element
 * There is no pause or reduced-motion setter; reduced motion follows the system setting (see below).
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountFullscreenChapterReveal(document.getElementById('stage'));</script>
 * The element needs a real width and height; the effect fills it and replaces its children. Labels and dots scale with
 * the frame height (CSS variable --fx-k = height / 220).
 *
 * Safe to change
 * - Scenes: the scenes array (name, line) and the layer / caption / dot templates passed in the mount function. A
 *   layer's first child is the moving image (it gets the transform); put a real image or video there.
 * - Colours, type and the edge hairline via effect.css.
 * - params within their ranges.
 *
 * Do not change (the feel breaks)
 * - Reveal by clip-path inset from the top, not by sliding the scene in: the picture stays put in the frame apart from
 *   the small parallax drift.
 * - One shared progress value for all scenes; the overlap between wipe and label switch comes from that.
 * - Keep the wheel latch and the end push; without them the page jumps as soon as the last scene is reached.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount (useEffect cleanup,
 *   onBeforeUnmount). In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). In Webflow, paste CSS and JS into custom code and call
 *   mountFullscreenChapterReveal on an embed div with a fixed height.
 * - To drive it from page scroll instead (a sticky section), map your scroll progress to p and pass it to render(p)
 *   inside lib.CommonChapters.mount; there is no public setter for p.
 * - SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The frame is a focusable group with an aria-label naming the inputs; labels of inactive scenes are aria-hidden;
 *   the dots are aria-hidden and only clickable with a pointer (the keys above do the same from the keyboard).
 * - With prefers-reduced-motion: no smoothing; wheel, drag and keys jump whole scenes.
 * - The loop stops when the tab is hidden or the frame is off screen.
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

  // ---- the effect ----
  const lib = {};
  (function () {
    'use strict';
    const controls = [
      {
        key: 'scrollSpan',
        label: 'Scroll length',
        type: 'range',
        group: 'Pacing',
        min: 500,
        max: 1200,
        step: 10,
        default: 900,
        unit: 'vh',
        description: 'Total scroll distance shared by the five scenes.',
        visualizer: 'timeline',
      },
      {
        key: 'parallax',
        label: 'Image rise',
        type: 'range',
        group: 'Media',
        min: 0,
        max: 100,
        step: 1,
        default: 72,
        unit: 'px',
        description: 'Slight upward drift of the image inside each crop.',
        visualizer: 'pointer',
      },
      {
        key: 'captionSwitch',
        label: 'Label timing',
        type: 'range',
        group: 'Timing',
        min: 40,
        max: 80,
        step: 1,
        default: 58,
        unit: '%',
        description: 'How far a new scene opens before the label changes.',
        visualizer: 'timeline',
      },
    ];
    const defaults = Object.fromEntries(controls.map((c) => [c.key, c.default]));
    const scenes = [
      ['Civic', 'Objects that make room for everyday encounters.'],
      ['Trail', 'A quiet point of orientation along the path.'],
      ['Renew', 'Materials find another life in shared spaces.'],
      ['Field', 'Small interventions in wide open landscapes.'],
      ['Detail', 'A clear direction, made part of the place.'],
    ];
    const clamp = (v) => Math.min(1, Math.max(0, v));
    function mount(el, options = {}) {
      const cardOpt = options.card,
        cleanups = [];
      const media = matchMedia('(prefers-reduced-motion: reduce)');
      let values = { ...defaults },
        rewind = false,
        destroyed = false,
        raf = 0,
        last = 0,
        progress = 0,
        visible = true;
      const reduced = () => media.matches;

      el.innerHTML =
        '<div class="chapter-stage">' +
        scenes.map((s, i) => `<div class="chapter-media" data-scene="${i}">${cardOpt.layer(i)}</div>`).join('') +
        '<div class="chapter-content">' +
        scenes
          .map((s, i) => `<div class="chapter-caption" data-caption="${i}">${cardOpt.caption(i, s[0])}</div>`)
          .join('') +
        '</div><nav class="chapter-dots" aria-hidden="true">' +
        scenes.map((s, i) => `<span data-goto="${i}">${cardOpt.dot(i)}</span>`).join('') +
        '</nav></div>';

      const stage = el.querySelector('.chapter-stage'),
        layers = [...el.querySelectorAll('.chapter-media')],
        captions = [...el.querySelectorAll('.chapter-caption')],
        dots = [...el.querySelectorAll('[data-goto]')];
      const pScale = () => stage.clientHeight / 800;

      function listen(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        cleanups.push(() => target.removeEventListener(type, fn, opts));
      }

      function render(p) {
        progress = clamp(p);
        const scaled = progress * 4,
          active = Math.min(4, Math.floor(scaled + 1 - values.captionSwitch / 100));
        layers.forEach((layer, i) => {
          const amount = i === 0 ? 1 : clamp(scaled - (i - 1));
          layer.style.clipPath = `inset(${(1 - amount) * 100}% 0px 0px)`;
          layer.style.setProperty('--edge', ((1 - amount) * 100).toFixed(3) + '%');
          layer.classList.toggle('is-moving', amount > 0 && amount < 1);
          const local = clamp(scaled - i + 1);
          layer.firstElementChild.style.transform = `translate3d(0,${-local * values.parallax * pScale()}px,0) scale(${1 + local * 0.025})`;
        });
        captions.forEach((caption, i) => {
          const yes = i === active,
            threshold = values.captionSwitch / 100,
            fadeIn = i === 0 ? 1 : clamp((scaled - (i - 1) - threshold) / 0.1),
            fadeOut = i === 4 ? 1 : 1 - clamp((scaled - i - threshold + 0.1) / 0.1);
          caption.style.opacity = String(Math.min(fadeIn, fadeOut));
          caption.classList.toggle('is-active', yes);
          caption.setAttribute('aria-hidden', String(!yes));
        });
        dots.forEach((button, i) => {
          button.firstElementChild.toggleAttribute('data-accent', i === active);
          button.firstElementChild.toggleAttribute('data-weak', i !== active);
        });
        const seg = scaled >= 4 ? 1 : scaled % 1,
          swipe = clamp(seg / 0.8),
          y = 0.72 - 0.34 * (1 - Math.pow(1 - swipe, 3)),
          o = reduced() || rewind ? 0 : Math.min(clamp(seg / 0.08), 1 - clamp((seg - 0.82) / 0.14));
        el.dataset.active = String(active);
        el.dataset.progress = progress.toFixed(4);
      }

      function tick(now) {
        raf = 0;
        if (destroyed || !visible || document.hidden || reduced()) return;
        {
          liveStep(now);
          return;
        }
      }
      function schedule() {
        if (!raf && !destroyed && visible && !document.hidden && !reduced()) raf = requestAnimationFrame(tick);
      }
      function stop() {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }

      dots.forEach((button, i) =>
        listen(button, 'click', () => {
          nudge(i / 4 - goal, false, false);
        }),
      );

      listen(media, 'change', () => {
        stop();
        schedule();
      });
      listen(document, 'visibilitychange', () => {
        stop();
        schedule();
      });
      const resize = new ResizeObserver(() => render(progress));
      resize.observe(document.documentElement);
      cleanups.push(() => resize.disconnect());
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        stop();
        schedule();
      });
      observer.observe(el);
      cleanups.push(() => observer.disconnect());
      const api = {
        setParams(next) {
          values = { ...values, ...next };
          render(progress);
          schedule();
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          stop();
          cleanups.splice(0).forEach((fn) => fn());
        },
      };
      const RESTORE = 500;
      let cur = 0,
        goal = 0,
        back = null,
        drag = null;
      function cubicBezier(x1, y1, x2, y2) {
        const at = (a, b, s) => {
            const r = 1 - s;
            return 3 * r * s * (r * a + s * b) + s * s * s;
          },
          rate = (a, b, s) => {
            const r = 1 - s;
            return 3 * (r * r * a + 2 * r * s * (b - a) + s * s * (1 - b));
          };
        return (p) => {
          if (p <= 0) return 0;
          if (p >= 1) return 1;
          let s = p,
            done = false;
          for (let n = 0; n < 6; n++) {
            const miss = at(x1, x2, s) - p,
              k = rate(x1, x2, s);
            done = Math.abs(miss) < 1e-7;
            if (done || Math.abs(k) < 1e-6) break;
            const next = s - miss / k;
            if (next < 0 || next > 1) break;
            s = next;
          }
          if (done) return at(y1, y2, s);
          let lo = 0,
            hi = 1;
          while (hi - lo > 1e-7) {
            s = (lo + hi) / 2;
            if (at(x1, x2, s) < p) lo = s;
            else hi = s;
          }
          return at(y1, y2, (lo + hi) / 2);
        };
      }
      const outEase = cubicBezier(0.22, 1, 0.36, 1);
      const H = () => stage.clientHeight || 1,
        snap = (p) => Math.round(p * 4) / 4;
      function liveStep(now) {
        const dt = last ? Math.max(0, now - last) : 0;
        last = now;
        if (back) {
          back.t += dt;
          const u = Math.min(1, back.t / RESTORE);
          cur = back.from * (1 - outEase(u));
          render(cur);
          if (u < 1) raf = requestAnimationFrame(tick);
          else {
            back = null;
            cur = goal = 0;
            render(0);
            last = 0;
          }
          return;
        }
        cur += (goal - cur) * (1 - Math.exp(-dt / 60));
        if (Math.abs(goal - cur) < 1e-4) cur = goal;
        render(cur);
        if (cur !== goal) raf = requestAnimationFrame(tick);
        else last = 0;
      }
      function nudge(dp, chain, instant) {
        const was = goal;
        goal = Math.min(1, Math.max(0, goal + dp));
        if (goal !== was) {
          back = null;
          if (reduced()) {
            cur = goal;
            render(snap(goal));
          } else if (instant) {
            cur = goal;
            render(cur);
            last = 0;
          } else schedule();
        }
        const left = dp - (goal - was);
        if (chain && Math.abs(left) * 4 * H() > 0.5) window.scrollBy(0, left * 4 * H());
      }
      function release() {
        if (!drag) return;
        const id = drag.id;
        drag = null;
        el.classList.remove('chapter-dragging');
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
      }
      const WHEEL_GAP = 250;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        PUSH = 100;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      listen(
        el,
        'wheel',
        (e) => {
          if (e.ctrlKey) return;
          const g = goal,
            d = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? H() : 1);
          if (d) {
            const now = performance.now();
            if (now - wheelAt > WHEEL_GAP) held = false;
            wheelAt = now;
          }
          if (!d || (d < 0 && g <= 0) || (d > 0 && g >= 1)) {
            if (d && held) {
              e.preventDefault();
              return;
            }
            if (d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (!(!back && Math.abs(goal - cur) <= 0.005)) {
                pushed = 0;
                e.preventDefault();
                return;
              }
              if (pushed < PUSH) {
                pushed += Math.abs(d);
                e.preventDefault();
                return;
              }
            }
            return;
          }
          held = true;
          pushed = 0;
          e.preventDefault();
          nudge(d / (H() * Math.max(0.01, values.scrollSpan / 100 - 1)), false, false);
        },
        { passive: false },
      );
      listen(el, 'pointerdown', (e) => {
        if (e.button !== 0 || (e.target.closest && e.target.closest('[data-goto]'))) return;
        release();
        drag = { id: e.pointerId, y: e.clientY, touch: e.pointerType !== 'mouse' };
        el.setPointerCapture(e.pointerId);
        el.classList.add('chapter-dragging');
      });
      listen(el, 'pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = drag.y - e.clientY;
        drag.y = e.clientY;
        if (dy) nudge(dy / (4 * H()), drag.touch, true);
      });
      listen(el, 'pointerup', release);
      listen(el, 'pointercancel', release);
      listen(el, 'lostpointercapture', release);
      listen(el, 'keydown', (e) => {
        const k = e.key,
          step =
            k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)
              ? 1
              : k === 'ArrowUp' || k === 'PageUp' || k === ' '
                ? -1
                : 0;
        if (e.altKey || e.ctrlKey || e.metaKey || (!step && k !== 'Home' && k !== 'End')) return;
        const g = goal,
          to = k === 'Home' ? 0 : k === 'End' ? 1 : Math.min(1, Math.max(0, Math.round(g * 4 + step) / 4));
        if (Math.abs(to - g) < 1e-4) return;
        e.preventDefault();
        nudge(to - goal, false, false);
      });
      listen(media, 'change', () => {
        release();
        back = null;
        cur = goal;
        render(reduced() ? snap(goal) : goal);
      });
      cleanups.push(release);
      api.restore = () => {
        release();
        goal = 0;
        if (reduced()) {
          back = null;
          cur = 0;
          render(0);
          return;
        }
        back = { t: 0, from: cur };
        stop();
        schedule();
      };
      render(0);
      schedule();
      return api;
    }
    lib.CommonChapters = { mount, controls };
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
  function mountFullscreenChapterReveal(element, options) {
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
    element.classList.add('fullscreen-chapter-reveal');
    element.innerHTML =
      '<div class="fx-board" data-chapter tabindex="0" role="group" aria-label="Five scenes. Scroll, drag, or use arrow keys."></div>';
    const listeners = new AbortController();
    const stage = element,
      board = stage.querySelector('[data-chapter]');
    const fit = () => board.style.setProperty('--fx-k', (stage.clientHeight / 220).toFixed(4));
    fit();
    const observer0 = new ResizeObserver(fit);
    observer0.observe(stage);
    const inst = lib.CommonChapters.mount(board, {
      card: {
        interactive: true,
        endPush: true,
        wheelLatch: true,
        layer: (i) => media({ tone: 1 + (i % 2), glyph: i % 4 }) + '<span class="ck-line"></span>',
        caption: (i, name) => '<span class="ck-pill" data-size="sm">' + name + '</span>',
        dot: () => '<span class="ck-dot" data-weak></span>',
      },
    });
    const C = lib.CommonChapters.controls;
    const applyParams = (p) => inst.setParams(p),
      resetView = () => inst.restore();

    const DEFAULTS = Object.fromEntries(C.map((c) => [c.key, c.default]));
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
  global.mountFullscreenChapterReveal = mountFullscreenChapterReveal;
  if (typeof module === 'object' && module.exports) module.exports = mountFullscreenChapterReveal;
})(typeof window !== 'undefined' ? window : this);

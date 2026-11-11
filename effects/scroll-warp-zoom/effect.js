/*
 * Scroll Warp Zoom
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A small picture card sits low on the left. Scroll the wheel over the element and it is carried into a large frame
 * (marked by four small "+" corners). On the way it does not scale as one piece: the middle of the card leaves first
 * and the corners follow, so it swells into a rounded cushion shape on the way and lands flat. At the same time
 * the picture goes from a one-tone print (the accent colour) back to its own colours. Scroll back up and it folds back.
 * Click or tap toggles small / large. Good for a hero video or picture, a case-study cover, a showreel block.
 *
 * How it moves
 * - Plain WebGL1, no library. One 32 x 32 grid mesh, one draw call. Every vertex has its own progress:
 *     g = grid - 0.5                                  grid 0..1 across the card, y = 0 at the top
 *     dir = unit vector from the small frame's centre to the large frame's centre
 *     d = clamp((mix(2 |g|^2, 0.5 - (g . dir) / sqrt 2, 0.4) - 0.2) / 0.8, 0, 1)      0 = leaves first, 1 = last
 *     t = clamp((p - d * tear) / (1 - tear), 0, 1)    p = progress 0..1, tear = 0.3
 *     v = 6t^5 - 15t^4 + 10t^3                        quintic smoothstep
 *   so the card centre leaves first and the corners follow, the side facing the large frame a little ahead of the
 *   side away from it. Each vertex is placed in the start/end frame mix at its own v: size = mix(from, to, v),
 *   position = mix(from, to, v).
 * - Sway: the path bows out to the right of the travel direction, position += perp(dir) * travel * 0.06 * swing
 *   * sin(pi v), largest half way. Turn: -0.06 * swing * sin(pi v) radians about the card centre, leaning back against
 *   the travel (about 3.4 degrees at most).
 * - Fragment: a rounded box of the interpolated size (radius kept from start to end), the picture cover-fitted to the
 *   interpolated size, colour = mix(max(tone, luma), picture, clamp((v - colorAt) / (1 - colorAt))).
 * - The wheel is a switch: one flick down (12 px in one gesture) plays the whole opening by itself, one flick up plays
 *   it back. A linear timeline runs to the end in duration ms (1400); the shown progress chases it at rate 6.32 per
 *   second (a 0.1 lerp per 60 Hz frame). Same-direction wheels while it plays are ignored, the opposite direction turns
 *   it round from where it is. The loop sleeps once it has settled.
 * - The wheel belongs to the card while it moves. One continuous wheel gesture that moved the card is still swallowed
 *   after it reaches an end; at an end the page only scrolls after the card has settled and you push one more notch
 *   (100 px) outward.
 * - No WebGL (or a lost context, or options.fallback): a DOM card. The same vertex maths gives the outline (16 points
 *   per edge, rounded corners) as a clip-path polygon over a cover-fitted picture, so the edges still bow, but the
 *   picture inside is not warped. The one-tone layer is the picture with grayscale(1) and mix-blend-mode: lighten over
 *   a tone fill, faded by the colour mix at the card centre.
 *
 * Options
 *   params.tear      0..0.5, default 0.3      how far apart the vertices start; 0 = the card grows as one piece
 *   params.swing     0..2, default 1          sway and turn on the way; 0 = straight
 *   params.colorAt   0..0.8, default 0        where on the way the colour starts to come back
 *   params.duration  600..3000, default 1400  ms for the whole opening (or closing) after one flick
 *   media            an <img> (loaded, same origin or CORS-enabled) or <canvas> to show; default: a drawn landscape
 *   tone             CSS colour of the one-tone print, default the accent #4559ff (try #17181a for black and white)
 *   fallback         true forces the DOM card
 *   reducedMotion    true / false / null      force reduced motion on or off; null follows the system setting
 *
 * API
 *   const fx = mountScrollWarpZoom(element, {params: {tear: 0.3}, media: myImage});
 *   fx.setParams({tear: 0.45}); fx.setPaused(true); fx.reset(); fx.setReducedMotion(true); fx.destroy();
 *   reset() puts the params back and glides the card back to the small start frame (500 ms, ease-out).
 *
 * Usage
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>
 *     const img = new Image(); img.src = 'cover.jpg';
 *     img.onload = () => mountScrollWarpZoom(document.getElementById('stage'), {media: img});
 *   </script>
 * The element needs a real width and height. Start and end frames are worked out from its size in layout(): the end
 * frame is 16:9, centred (16 px inset); the start card is 30% of the end frame width (at least 120 px, 1.42 : 1), in the
 * bottom left corner (16 px in); corner radius 16 px. Change layout()
 * to place them over your own page slots.
 *
 * Do not change (the feel breaks)
 * - Per-vertex timing. Moving the whole card with one progress (or a CSS scale / FLIP) gives a plain zoom; the slanted
 *   pull comes only from each vertex leaving at its own time.
 * - The radial stagger (squared distance from the card centre): it bows the edges into a cushion. A linear ramp
 *   across the card gives straight, sheared edges.
 * - The chase rate: without it a mouse wheel moves the card in visible steps.
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. Pass the picture as media once
 *   it has loaded. In React StrictMode the mount runs twice; destroy in the cleanup handles that.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Accessibility and reduced motion
 * - The card is decorative motion over one picture; give the picture's meaning in nearby text.
 * - With reduced motion there is and no chase: the card is drawn exactly where the wheel puts it.
 * - The loop stops when the tab is hidden, the element is off screen or it is paused. destroy() frees the WebGL
 *   buffers, texture and program and releases the context.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const R = { clamp, mix, damp };

  // ---- inlined from the shared runtime: lifecycle ----
  // One requestAnimationFrame loop that runs only while something moves; pauses when the tab is hidden, the element is
  // off screen or setPaused(true); follows prefers-reduced-motion live; re-measures on resize; destroy() removes every
  // listener and observer it added.
  function scope(element, controls, options) {
    options = options || {};
    const defaults = Object.fromEntries(controls.map((control) => [control.key, control.default]));
    let params = Object.assign({}, defaults, options.params || {});
    let paused = false,
      destroyed = false,
      visible = true,
      reducedOverride = null;
    let raf = 0,
      last = 0,
      time = 0,
      frameCount = 0,
      draw = () => false,
      ticking = false;
    let width = 1,
      height = 1,
      active = true;
    const cleanup = [],
      hooks = new Map();
    // Only card wrappers that supply a startup coordinator opt into deferred preparation.
    // Keep mount synchronous, but prevent font/resize/replay callbacks from drawing an incomplete renderer.
    const startup = options.card && options.card.startup;
    let preparing = !!startup,
      preparationRevision = 0,
      preparationState = preparing ? 'pending' : 'legacy';
    let resolveReady,
      rejectReady,
      preparationError = null,
      preparationStarted = false;
    const abortError = () =>
      (startup && startup.signal.aborted && startup.signal.reason) ||
      new DOMException('Effect preparation was cancelled', 'AbortError');
    const ready = preparing
      ? new Promise((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        })
      : null;
    if (ready) ready.catch(() => {});
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let preferenceReduced = preference.matches;
    const reduced = () => (reducedOverride === null ? preferenceReduced : reducedOverride);
    const emit = (type, value) => {
      (hooks.get(type) || []).forEach((fn) => fn(value));
    };
    function listen(target, type, fn, listenerOptions) {
      target.addEventListener(type, fn, listenerOptions);
      cleanup.push(() => target.removeEventListener(type, fn, listenerOptions));
      return fn;
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function allowed() {
      return (
        !destroyed &&
        !preparing &&
        preparationState !== 'failed' &&
        !paused &&
        visible &&
        !document.hidden &&
        !reduced()
      );
    }
    function tick(now) {
      raf = 0;
      if (!allowed()) return;
      const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
      last = now;
      time += dt;
      frameCount++;
      // A wake() from inside draw (directly or via measure/setParams/replay) books the next frame itself;
      // it must not reset `last` (the loop never went idle) and the line below must not book a second one.
      ticking = true;
      try {
        active = draw({ dt, time, width, height, params, reduced: false }) !== false;
      } finally {
        ticking = false;
      }
      if (active && allowed() && !raf) raf = requestAnimationFrame(tick);
    }
    function wake() {
      if (allowed() && !raf) {
        if (!ticking) last = 0;
        raf = requestAnimationFrame(tick);
      }
    }
    function paint() {
      if (destroyed || preparing || preparationState === 'failed') return;
      active = draw({ dt: 0, time, width, height, params, reduced: reduced() }) !== false;
    }
    function measure() {
      if (destroyed) return;
      const nextWidth = Math.max(1, element.clientWidth),
        nextHeight = Math.max(1, element.clientHeight);
      if (preparing) {
        if (width !== nextWidth || height !== nextHeight) preparationRevision++;
        width = nextWidth;
        height = nextHeight;
        return;
      }
      width = nextWidth;
      height = nextHeight;
      emit('resize', { width, height });
      paint();
      if (active) wake();
    }
    function syncMotion() {
      stop();
      element.dataset.reduced = String(reduced());
      if (preparing) {
        preparationRevision++;
        return;
      }
      emit('motion', reduced());
      paint();
      if (active) wake();
    }
    const api = {
      element,
      defaults,
      listen,
      get params() {
        return params;
      },
      get time() {
        return time;
      },
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      get paused() {
        return paused;
      },
      get reduced() {
        return reduced();
      },
      get destroyed() {
        return destroyed;
      },
      get preparing() {
        return preparing;
      },
      invalidatePreparation() {
        if (preparing) preparationRevision++;
      },
      on(type, fn) {
        if (!hooks.has(type)) hooks.set(type, []);
        hooks.get(type).push(fn);
        return fn;
      },
      cleanup(fn) {
        cleanup.push(fn);
        return fn;
      },
      frame(fn) {
        draw = fn;
        measure();
        wake();
      },
      wake,
      paint,
      measure,
      runPreparationPhase(fn, label) {
        if (!startup) return Promise.resolve().then(fn);
        if (destroyed || preparationError || startup.signal.aborted)
          return Promise.reject(preparationError || abortError());
        return startup.runPhase(() => {
          if (destroyed || preparationError || startup.signal.aborted) throw preparationError || abortError();
          return fn();
        }, label);
      },
      prepare(task) {
        if (!startup || preparationStarted) return ready;
        preparationStarted = true;
        // Params/replay/resize may change while a GPU compilation or font is pending. Re-run only the
        // module's idempotent preparation work for the newest inputs, with its renderer resources reused.
        (async () => {
          while (preparing && !destroyed && !preparationError) {
            measure();
            const revision = preparationRevision;
            await task((fn, label) => api.runPreparationPhase(fn, label));
            const completed = await api.runPreparationPhase(() => {
              measure();
              if (revision !== preparationRevision) return false;
              time = 0;
              last = 0;
              preparing = false;
              try {
                paint();
              } catch (error) {
                preparing = true;
                throw error;
              }
              preparationState = 'ready';
              element.dataset.preparation = 'ready';
              resolveReady(api);
              if (active) wake();
              return true;
            }, 'first-frame');
            if (completed) break;
          }
        })().catch((error) => api.failPreparation(error));
        return ready;
      },
      failPreparation(error) {
        if (!startup || preparationState === 'ready' || preparationState === 'failed') return;
        preparationError =
          error instanceof Error || (error && error.name)
            ? error
            : new Error(String(error || 'Effect preparation failed'));
        preparationState = 'failed';
        preparing = false;
        stop();
        element.dataset.preparation = 'failed';
        rejectReady(preparationError);
        api.destroy();
      },
      setParams(next) {
        if (destroyed) return;
        const updated = Object.assign({}, params);
        controls.forEach((control) => {
          if (!Object.hasOwn(next || {}, control.key)) return;
          let value = next[control.key];
          if (control.type === 'range')
            value = Number.isFinite(+value) ? clamp(+value, control.min, control.max) : control.default;
          else if (control.type === 'color')
            value = /^#[a-f0-9]{6}$/i.test(String(value)) ? String(value) : control.default;
          else if (control.type === 'toggle') value = !!value;
          else if (control.type === 'select' && !control.options.some((option) => option.value === value))
            value = control.default;
          updated[control.key] = value;
        });
        params = updated;
        if (preparing) {
          preparationRevision++;
          return;
        }
        emit('params', params);
        paint();
        if (active) wake();
      },
      setPaused(value) {
        if (destroyed) return;
        paused = !!value;
        element.dataset.paused = String(paused);
        stop();
        emit('pause', paused);
        if (!paused) {
          paint();
          if (active) wake();
        }
      },
      setReduced(value) {
        if (destroyed) return;
        reducedOverride = value == null ? null : !!value;
        syncMotion();
      },
      replay() {
        if (destroyed) return;
        stop();
        time = 0;
        if (preparing) {
          preparationRevision++;
          return;
        }
        emit('replay');
        paint();
        if (active) wake();
      },
      reset() {
        api.setParams(defaults);
        api.replay();
      },
      destroy() {
        if (destroyed) return;
        if (preparing) api.failPreparation(abortError());
        if (destroyed) return;
        destroyed = true;
        stop();
        try {
          emit('destroy');
        } finally {
          cleanup
            .splice(0)
            .reverse()
            .forEach((fn) => {
              try {
                fn();
              } catch {}
            });
          hooks.clear();
          element.dataset.destroyed = 'true';
        }
      },
      status() {
        return {
          time,
          raf,
          frameCount,
          width,
          height,
          paused,
          destroyed,
          visible,
          reduced: reduced(),
          preparing,
          preparation: preparationState,
          listeners: cleanup.length,
          params: Object.assign({}, params),
        };
      },
    };
    if (ready) {
      api.ready = ready;
      element.dataset.preparation = 'pending';
      listen(startup.signal, 'abort', () => api.destroy());
      if (startup.signal.aborted) Promise.resolve().then(() => api.destroy());
    }
    listen(preference, 'change', (event) => {
      preferenceReduced = event.matches;
      syncMotion();
    });
    listen(document, 'visibilitychange', () => {
      stop();
      emit('visibility', !document.hidden);
      if (!document.hidden) wake();
    });
    listen(window, 'pageshow', (event) => {
      if (event.persisted) {
        measure();
        wake();
      }
    });
    listen(window, 'pagehide', (event) => {
      if (event.persisted) stop();
      else api.destroy();
    });
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    cleanup.push(() => resize.disconnect());
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      stop();
      emit('visibility', visible);
      if (visible) wake();
    });
    intersection.observe(options.visibilityTarget || element);
    cleanup.push(() => intersection.disconnect());
    element.dataset.reduced = String(reduced());
    width = Math.max(1, element.clientWidth);
    height = Math.max(1, element.clientHeight);
    return api;
  }

  const CONTROLS = [
    { key: 'tear', type: 'range', default: 0.3, min: 0, max: 0.5, step: 0.01 },
    { key: 'swing', type: 'range', default: 1, min: 0, max: 2, step: 0.05 },
    { key: 'colorAt', type: 'range', default: 0, min: 0, max: 0.8, step: 0.01 },
    { key: 'duration', type: 'range', default: 1400, min: 600, max: 3000, step: 50 },
  ];

  // ---- the effect ----
  const C = { lead: 0.4, throw: 0.06, tilt: 0.06, chase: 6.32, seg: 32, loop: 6, restore: 0.5 };
  const lerp = (a, b, t) => a + (b - a) * t;
  const STAGGER = {
    glsl: '(mix(dot(g, g) * 2.0, 0.5 - dot(g, dir) * 0.70711, LEAD) - 0.5 * LEAD) / (1.0 - 0.5 * LEAD)',
    js: (qx, qy, dx, dy) =>
      (lerp((qx * qx + qy * qy) * 2, 0.5 - (qx * dx + qy * dy) * 0.70711, C.lead) - 0.5 * C.lead) / (1 - 0.5 * C.lead),
  };
  const VERT = `
attribute vec2 aGrid;
uniform vec4 uFrom, uTo;
uniform vec2 uRes;
uniform float uP, uTear, uSwing;
varying vec2 vUv;
varying vec2 vWH;
varying float vV;
void main(){
  vec2 D = uTo.xy + uTo.zw * 0.5 - uFrom.xy - uFrom.zw * 0.5;
  float travel = length(D);
  vec2 dir = travel > 0.5 ? D / travel : vec2(0.70711, -0.70711), n = vec2(-dir.y, dir.x), g = aGrid - 0.5;
  const float LEAD = ${C.lead.toFixed(3)};
  float d = clamp(${STAGGER.glsl}, 0.0, 1.0);
  float t = clamp((uP - d * uTear) / (1.0 - uTear), 0.0, 1.0);
  float v = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float arc = sin(v * 3.14159265);
  vec2 wh = mix(uFrom.zw, uTo.zw, v);
  vec2 xy = mix(uFrom.xy, uTo.xy, v) + n * travel * ${C.throw.toFixed(3)} * uSwing * arc;
  float r = -${C.tilt.toFixed(3)} * uSwing * arc;
  vec2 c = wh * 0.5, q = aGrid * wh - c;
  float s = sin(r), k = cos(r);
  vec2 pos = xy + c + vec2(k * q.x - s * q.y, s * q.x + k * q.y);
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  vUv = aGrid; vWH = wh; vV = v;
}`;
  const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec3 uTone;
uniform float uRadius, uColorAt, uTexAspect;
varying vec2 vUv;
varying vec2 vWH;
varying float vV;
float roundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
void main(){
  float d = roundBox((vUv - 0.5) * vWH, vWH * 0.5, min(uRadius, min(vWH.x, vWH.y) * 0.5));
  float a = clamp(-d, 0.0, 1.0);
  vec2 uv = vUv;
  float aspect = vWH.x / vWH.y;
  if (aspect > uTexAspect) uv.y = (uv.y - 0.5) * uTexAspect / aspect + 0.5;
  else uv.x = (uv.x - 0.5) * aspect / uTexAspect + 0.5;
  vec3 c = texture2D(uTex, uv).rgb;
  vec3 tint = max(uTone, vec3(dot(c, vec3(0.299, 0.587, 0.114))));
  float m = clamp((vV - uColorAt) / max(1.0 - uColorAt, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(tint, c, m) * a, a);
}`;
  function art(W, H) {
    W = W || 1600;
    H = H || 1000;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.scale(W / 1600, H / 1000);
    const sky = g.createLinearGradient(0, 0, 0, 700);
    sky.addColorStop(0, '#f1a67c');
    sky.addColorStop(0.55, '#f6cfa6');
    sky.addColorStop(1, '#f8e5c8');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = '#e8552f';
    g.beginPath();
    g.arc(1090, 390, 138, 0, Math.PI * 2);
    g.fill();
    const band = (y0, amp, fq, ph, col) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, 1000);
      for (let x = 0; x <= 1600; x += 20) {
        const t = x / 1600;
        g.lineTo(x, y0 + Math.sin(t * fq + ph) * amp + Math.sin(t * fq * 2.3 + ph * 1.7) * amp * 0.35);
      }
      g.lineTo(1600, 1000);
      g.closePath();
      g.fill();
    };
    band(560, 42, 5.2, 0.6, '#d98a63');
    band(640, 48, 3.6, 2.1, '#3d7c74');
    band(735, 40, 4.4, 4.0, '#1f4a4b');
    band(830, 26, 2.6, 1.2, '#d99a35');
    g.strokeStyle = 'rgba(120,70,20,.35)';
    g.lineWidth = 5;
    for (let i = 0; i < 5; i++) {
      const y = 880 + i * 26;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(500, y - 18, 1100, y + 22, 1600, y - 6);
      g.stroke();
    }
    return c;
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    let back = null;
    element.classList.add('wz-stage');
    element.dataset.card = '';
    element.innerHTML =
      '<div class="wz-view"' +
      ' aria-hidden="true"' +
      '><canvas class="wz-gl" aria-hidden="true"></canvas><div class="wz-dom" aria-hidden="true" hidden><div class="wz-card"><canvas class="wz-color"></canvas><div class="wz-tint"><canvas class="wz-gray"></canvas></div></div></div></div>';
    const view = element.querySelector('.wz-view'),
      canvas = element.querySelector('.wz-gl'),
      dom = element.querySelector('.wz-dom'),
      card = element.querySelector('.wz-card'),
      tintEl = element.querySelector('.wz-tint'),
      colorCv = element.querySelector('.wz-color'),
      grayCv = element.querySelector('.wz-gray');
    const css = getComputedStyle(element),
      toneCss = options.tone || css.getPropertyValue('--accent').trim() || '#4559ff';
    const tone = (() => {
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = '#4559ff';
      c.fillStyle = toneCss;
      const h = c.fillStyle;
      return /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : [0.27, 0.35, 1];
    })();
    tintEl.style.background = toneCss;
    const media = options.media || art(),
      mw = media.naturalWidth || media.width || 1600,
      mh = media.naturalHeight || media.height || 1000,
      mediaAspect = mw / mh;
    [colorCv, grayCv].forEach((cv) => {
      const s = Math.min(1, 960 / mw);
      cv.width = Math.round(mw * s);
      cv.height = Math.round(mh * s);
      cv.getContext('2d').drawImage(media, 0, 0, cv.width, cv.height);
    });
    let p = Math.min(1, Math.max(0, +cardOpt.start || 0)),
      tl = p,
      target = p > 0 ? 1 : 0;
    function defaultLayout(W, H) {
      const m = Math.max(16, Math.min(W, H) * 0.08);
      let tw = Math.min(W - 2 * m, (H - 2 * m) * 1.78),
        th = tw / 1.78;
      const fw = Math.max(96, tw * 0.3),
        fh = fw / 1.42;
      return {
        from: [m, H - m - fh, fw, fh],
        to: [(W - tw) / 2, (H - th) / 2, tw, th],
        radius: R.clamp(Math.min(W, H) * 0.03, 10, 24),
      };
    }
    const layoutFn = cardOpt.layout || options.layout || defaultLayout;
    let L = layoutFn(api.width, api.height);
    let gl = null,
      prog = null,
      buf = null,
      ibuf = null,
      tex = null,
      U = {},
      count = 0,
      lost = false;
    function setupGL() {
      const ctx = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
      if (!ctx) throw new Error('No WebGL.');
      const sh = (type, src) => {
        const s = ctx.createShader(type);
        ctx.shaderSource(s, src);
        ctx.compileShader(s);
        if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(s));
        return s;
      };
      const pr = ctx.createProgram(),
        vs = sh(ctx.VERTEX_SHADER, VERT),
        fs = sh(ctx.FRAGMENT_SHADER, FRAG);
      ctx.attachShader(pr, vs);
      ctx.attachShader(pr, fs);
      ctx.linkProgram(pr);
      ctx.deleteShader(vs);
      ctx.deleteShader(fs);
      if (!ctx.getProgramParameter(pr, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(pr));
      const N = C.seg,
        verts = new Float32Array((N + 1) * (N + 1) * 2),
        idx = new Uint16Array(N * N * 6);
      for (let y = 0, k = 0; y <= N; y++)
        for (let x = 0; x <= N; x++) {
          verts[k++] = x / N;
          verts[k++] = y / N;
        }
      for (let y = 0, k = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const a = y * (N + 1) + x,
            b = a + 1,
            c = a + N + 1,
            d = c + 1;
          idx.set([a, c, b, b, c, d], k);
          k += 6;
        }
      buf = ctx.createBuffer();
      ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
      ctx.bufferData(ctx.ARRAY_BUFFER, verts, ctx.STATIC_DRAW);
      ibuf = ctx.createBuffer();
      ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, ibuf);
      ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, idx, ctx.STATIC_DRAW);
      count = idx.length;
      ctx.useProgram(pr);
      const loc = ctx.getAttribLocation(pr, 'aGrid');
      ctx.enableVertexAttribArray(loc);
      ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
      ['uFrom', 'uTo', 'uRes', 'uP', 'uTear', 'uSwing', 'uTex', 'uTone', 'uRadius', 'uColorAt', 'uTexAspect'].forEach(
        (n) => {
          U[n] = ctx.getUniformLocation(pr, n);
        },
      );
      const pot = document.createElement('canvas');
      pot.width = api.width > 700 ? 2048 : 1024;
      pot.height = pot.width / 2;
      pot.getContext('2d').drawImage(media, 0, 0, pot.width, pot.height);
      tex = ctx.createTexture();
      ctx.bindTexture(ctx.TEXTURE_2D, tex);
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, pot);
      ctx.generateMipmap(ctx.TEXTURE_2D);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
      ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
      ctx.uniform1i(U.uTex, 0);
      ctx.uniform3f(U.uTone, tone[0], tone[1], tone[2]);
      ctx.uniform1f(U.uTexAspect, mediaAspect);
      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);
      ctx.disable(ctx.DEPTH_TEST);
      gl = ctx;
      prog = pr;
    }
    function freeGL() {
      if (!gl) return;
      if (!gl.isContextLost()) {
        gl.deleteBuffer(buf);
        gl.deleteBuffer(ibuf);
        gl.deleteTexture(tex);
        gl.deleteProgram(prog);
      }
      buf = ibuf = tex = prog = null;
    }
    function useDom(on) {
      canvas.hidden = on;
      dom.hidden = !on;
      element.dataset.renderer = on ? 'dom' : 'webgl';
    }
    try {
      if (options.fallback) throw new Error('Forced DOM card.');
      setupGL();
      useDom(false);
    } catch (error) {
      freeGL();
      gl = null;
      useDom(true);
    }
    if (gl) {
      api.listen(canvas, 'webglcontextlost', (event) => {
        event.preventDefault();
        lost = true;
        useDom(true);
        api.paint();
      });
      api.listen(canvas, 'webglcontextrestored', () => {
        lost = false;
        try {
          setupGL();
          useDom(false);
          sizing();
        } catch (error) {
          gl = null;
          useDom(true);
        }
        api.paint();
        api.wake();
      });
    }
    function sizing() {
      L = layoutFn(api.width, api.height);
      if (gl && !lost) {
        const r = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(api.width * r));
        canvas.height = Math.max(1, Math.round(api.height * r));
      }
    }
    api.on('resize', sizing);
    sizing();
    function vtx(gx, gy, pr, P) {
      const f = L.from,
        t = L.to,
        Dx = t[0] + t[2] / 2 - f[0] - f[2] / 2,
        Dy = t[1] + t[3] / 2 - f[1] - f[3] / 2,
        travel = Math.hypot(Dx, Dy),
        dx = travel > 0.5 ? Dx / travel : 0.70711,
        dy = travel > 0.5 ? Dy / travel : -0.70711;
      const d = R.clamp(STAGGER.js(gx - 0.5, gy - 0.5, dx, dy), 0, 1),
        u = R.clamp((pr - d * P.tear) / (1 - P.tear), 0, 1),
        v = u * u * u * (u * (u * 6 - 15) + 10),
        arc = Math.sin(v * Math.PI);
      const ww = R.mix(f[2], t[2], v),
        hh = R.mix(f[3], t[3], v),
        x = R.mix(f[0], t[0], v) - dy * travel * C.throw * P.swing * arc,
        y = R.mix(f[1], t[1], v) + dx * travel * C.throw * P.swing * arc;
      const r = -C.tilt * P.swing * arc,
        s = Math.sin(r),
        k = Math.cos(r),
        qx = gx * ww - ww / 2,
        qy = gy * hh - hh / 2;
      return { x: x + ww / 2 + k * qx - s * qy, y: y + hh / 2 + s * qx + k * qy, v, w: ww, h: hh };
    }
    function drawDom(pr, P) {
      const E = 16,
        edges = [
          [0, 0, 1, 0],
          [1, 0, 1, 1],
          [1, 1, 0, 1],
          [0, 1, 0, 0],
        ],
        side = [];
      edges.forEach(([x0, y0, x1, y1]) => {
        const pts = [];
        for (let i = 0; i <= E; i++) {
          const u = i / E;
          pts.push(vtx(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, pr, P));
        }
        side.push(pts);
      });
      const mid = vtx(0.5, 0.5, pr, P),
        rad = Math.min(L.radius, mid.w / 2, mid.h / 2),
        out = [];
      const len = (pts) => {
        let s = 0;
        for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        return s;
      };
      const at = (pts, d) => {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1],
            b = pts[i],
            l = Math.hypot(b.x - a.x, b.y - a.y);
          if (d <= l || i === pts.length - 1) {
            const u = l ? R.clamp(d / l, 0, 1) : 0;
            return [R.mix(a.x, b.x, u), R.mix(a.y, b.y, u)];
          }
          d -= l;
        }
        return [pts[0].x, pts[0].y];
      };
      side.forEach((pts, e) => {
        const l = len(pts),
          r = Math.min(rad, l / 2),
          a = at(pts, r),
          b = at(pts, l - r),
          nxt = side[(e + 1) % 4],
          c = pts[pts.length - 1],
          n = at(nxt, Math.min(rad, len(nxt) / 2));
        out.push(a);
        let d = 0;
        for (let i = 1; i < pts.length - 1; i++) {
          d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          if (d > r && d < l - r) out.push([pts[i].x, pts[i].y]);
        }
        out.push(b);
        for (let j = 1; j < 6; j++) {
          const u = j / 6,
            m = 1 - u;
          out.push([m * m * b[0] + 2 * m * u * c.x + u * u * n[0], m * m * b[1] + 2 * m * u * c.y + u * u * n[1]]);
        }
      });
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      out.forEach(([x, y]) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      });
      card.style.left = x0 + 'px';
      card.style.top = y0 + 'px';
      card.style.width = x1 - x0 + 'px';
      card.style.height = y1 - y0 + 'px';
      card.style.clipPath =
        'polygon(' + out.map(([x, y]) => (x - x0).toFixed(1) + 'px ' + (y - y0).toFixed(1) + 'px').join(',') + ')';
      const a0 = vtx(0, 0.5, pr, P),
        a1 = vtx(1, 0.5, pr, P),
        ang = Math.atan2(a1.y - a0.y, a1.x - a0.x),
        cs = Math.abs(Math.cos(ang)),
        sn = Math.abs(Math.sin(ang)),
        bw = x1 - x0,
        bh = y1 - y0;
      let cw = bw * cs + bh * sn,
        ch = bw * sn + bh * cs;
      if (cw / ch > mediaAspect) ch = cw / mediaAspect;
      else cw = ch * mediaAspect;
      const tf =
        'translate(' +
        ((bw - cw) / 2).toFixed(1) +
        'px,' +
        ((bh - ch) / 2).toFixed(1) +
        'px) rotate(' +
        ang.toFixed(4) +
        'rad)';
      [colorCv, grayCv].forEach((cv) => {
        cv.style.width = cw + 'px';
        cv.style.height = ch + 'px';
        cv.style.transform = tf;
      });
      tintEl.style.opacity = (1 - R.clamp((mid.v - P.colorAt) / Math.max(1 - P.colorAt, 0.001), 0, 1)).toFixed(3);
    }
    function draw(pr, P) {
      if (gl && !lost) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(U.uFrom, L.from[0], L.from[1], L.from[2], L.from[3]);
        gl.uniform4f(U.uTo, L.to[0], L.to[1], L.to[2], L.to[3]);
        gl.uniform2f(U.uRes, api.width, api.height);
        gl.uniform1f(U.uP, pr);
        gl.uniform1f(U.uTear, P.tear);
        gl.uniform1f(U.uSwing, P.swing);
        gl.uniform1f(U.uRadius, L.radius);
        gl.uniform1f(U.uColorAt, P.colorAt);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
      } else drawDom(pr, P);
    }
    function go(dir) {
      target = dir > 0 ? 1 : 0;
      if (api.reduced) {
        p = tl = target;
        api.paint();
      }
      api.wake();
    }
    function toggle() {
      go(target < 0.5 ? 1 : -1);
    }
    const WHEEL_MIN = 12;
    let acc = 0,
      accAt = -Infinity;
    function gesture(d) {
      const now = performance.now();
      if (now - accAt > 250 || Math.sign(d) !== Math.sign(acc)) acc = 0;
      accAt = now;
      acc += d;
      return Math.abs(acc) >= WHEEL_MIN;
    }
    {
      const WHEEL_GAP = 250,
        gap = cardOpt.wheelLatch ? (typeof cardOpt.wheelLatch === 'number' ? cardOpt.wheelLatch : WHEEL_GAP) : 0;
      let wheelAt = -Infinity,
        held = false;
      const PUSH_IDLE = 1200,
        push = cardOpt.endPush ? (typeof cardOpt.endPush === 'number' ? cardOpt.endPush : 100) : 0;
      let pushed = 0,
        pushDir = 0,
        pushAt = -Infinity;
      api.listen(
        view,
        'wheel',
        (event) => {
          if (api.paused || event.ctrlKey) return;
          const d = event.deltaY * (event.deltaMode === 1 ? 40 : 1);
          if (gap && d) {
            const now = performance.now();
            if (now - wheelAt > gap) held = false;
            wheelAt = now;
          }
          if (!d || (d > 0 && target >= 1) || (d < 0 && target <= 0)) {
            if (gap && d && held) {
              event.preventDefault();
              return;
            }
            if (push && d) {
              const now = performance.now();
              if (Math.sign(d) !== pushDir || now - pushAt > PUSH_IDLE) pushed = 0;
              pushDir = Math.sign(d);
              pushAt = now;
              if (back || p !== target) {
                pushed = 0;
                event.preventDefault();
                return;
              }
              if (pushed < push) {
                pushed += Math.abs(d);
                event.preventDefault();
                return;
              }
            }
            return;
          }
          if (gap) held = true;
          pushed = 0;
          event.preventDefault();
          if (!gesture(d)) return;
          back = null;
          go(d);
          if (cardOpt.touched) cardOpt.touched();
        },
        { passive: false },
      );
      api.listen(view, 'click', () => {
        if (api.paused) return;
        back = null;
        toggle();
        if (cardOpt.touched) cardOpt.touched();
      });
    }
    let handTime = 0,
      handSent = 0;
    const start = p;
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
    api.restore = () => {
      if (api.reduced) {
        back = null;
        p = target = 0;
        api.paint();
        return;
      }
      back = { t: 0, from: p };
      api.wake();
    };
    api.on('replay', () => {
      p = tl = start;
      target = start > 0 ? 1 : 0;
      back = null;
      handTime = handSent = 0;
    });
    api.frame(({ dt, time, params, reduced }) => {
      if (back) {
        back.t += dt;
        const u = reduced ? 1 : Math.min(1, back.t / C.restore);
        p = tl = R.mix(back.from, 0, outEase(u));
        target = 0;
        if (u >= 1) {
          p = tl = 0;
          back = null;
        }
      } else if (reduced) p = tl = target;
      else {
        const step = (dt * 1000) / params.duration;
        tl = target > tl ? Math.min(target, tl + step) : Math.max(target, tl - step);
        p = R.damp(p, tl, C.chase, dt);
      }
      if (Math.abs(p - tl) < 1e-4 && tl === target) p = tl;
      draw(p, params);
      element.dataset.progress = p.toFixed(4);
      return !!back || p !== target;
    });
    api.on('destroy', () => {
      freeGL();
      if (gl && !gl.isContextLost()) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      gl = null;
      canvas.width = canvas.height = 1;
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      progress: p,
      timeline: tl,
      target,
      renderer: gl && !lost ? 'webgl' : 'dom',
      resources: api.destroyed || !gl ? 0 : 3,
    });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountScrollWarpZoom(element, options) {
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
    element.classList.add('scroll-warp-zoom');
    element.innerHTML = '<div class="fx-board"><div class="wz-box" data-wz></div></div>';
    const panelZone = () => ({ right: 0, bottom: 0 });
    const stage = element,
      box = stage.querySelector('[data-wz]');
    function layout(W, H) {
      const zone = panelZone(stage, 4),
        phone = zone.right === 0,
        m = phone ? 16 : 32,
        left = phone ? m : zone.right + 16;
      let tw = Math.max(200, W - left - m),
        th = tw / 1.78;
      if (th > H - 2 * m) {
        th = H - 2 * m;
        tw = th * 1.78;
      }
      const tx = left + (W - left - m - tw) / 2,
        ty = (H - th) / 2,
        fw = Math.max(phone ? 120 : 160, tw * 0.3),
        fh = fw / 1.42;
      return { from: [m, H - m - fh, fw, fh], to: [tx, ty, tw, th], radius: phone ? 16 : 24 };
    }
    const inst = mount(box, {
      params: options.params,
      media: options.media,
      tone: options.tone,
      fallback: !!options.fallback,
      card: {
        interactive: true,
        wheelLatch: true,
        endPush: true,
        layout,
      },
    });

    if (options.reducedMotion != null) inst.setReduced(options.reducedMotion);
    return {
      get params() {
        return Object.assign({}, inst.params);
      },
      setParams: inst.setParams,
      setPaused: inst.setPaused,
      reset() {
        inst.setParams(inst.defaults);
        if (inst.restore) inst.restore();
        else inst.replay();
      },
      setReducedMotion: inst.setReduced,
      destroy() {
        if (mounted.done) return;
        inst.destroy();
        mounted.restore();
      },
    };
  }
  global.mountScrollWarpZoom = mountScrollWarpZoom;
  if (typeof module === 'object' && module.exports) module.exports = mountScrollWarpZoom;
})(typeof window !== 'undefined' ? window : this);

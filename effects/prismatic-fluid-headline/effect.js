/*
 * Prismatic Fluid Headline
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 *
 * A huge outlined headline on a white sheet. Moving the pointer across it drags a stream of rainbow "fluid" that
 * shows only inside the letters: bright on the outline, softer on the letter faces. The colour is pulled into
 * threads and curls by curl noise, then fades about 1 s after the pointer stops. The headline text is any string
 * you pass in. Good for a landing hero, a section title or a portfolio cover.
 *
 * How it is drawn
 * - The text is drawn with a 2D canvas into a mask texture: red = letter face, green = an outline band of width
 *   params.outline. The band is built from the filled shape (union of 16 shifted copies minus their intersection),
 *   not strokeText, because variable fonts keep overlapping contours that would show up as lines inside letters.
 * - Layout: weight 800, letter spacing -0.035em, line height 0.9; every split into one, two or three lines is tried
 *   and the one with the biggest font size wins (a line count is only added when it gains more than 4%).
 *   Padding max(16 px, 7% of the short side).
 * - Fluid (WebGL2 RGBA16F, or WebGL1 with half float + linear): a paint buffer at 1/4 of the sheet in css px
 *   (xy = velocity around 0.5, z / w = two weights) and a 1/8 blurred copy. Per frame: blur paint into the low
 *   buffer (two separable 9-tap passes), then paint: a segment SDF from the last to the current pointer, radius =
 *   clamp(distance moved / range, 0, 1) * maxR, range = max(40, 100 * width / 1440) px, maxR = max(width * brush%,
 *   40 * brush / 5) px. Advection samples the previous frame back along the low velocity * 30, plus curl noise:
 *   q = paint px * 0.015 + (0.7, -0.5) * time * 0.04 (slow drift); a first gradient-noise layer at q * (1 - 0.6 * low
 *   velocity) warps the domain of a second one at q * 1.7 + its gradient * 0.35 + low velocity * 0.8, and the second
 *   layer's derivative is the push, strength params.swirl * (1.2 z + 0.8 w). Per 60 fps frame: velocity * 0.978,
 *   weight1 * params.linger, weight2 * 0.76, and z / w drop by at least 0.0055. Pointer velocity = previous * 0.84 +
 *   movement * dt * 0.7.
 * - Colour: d = cos((u + v) * 4 + time) * 0.5 + 0.5 (outline phase + pi); hue = (vx + vy) * 1.5 + d * 2 into a
 *   cyclic 256 px gradient built in code from STOPS (deep, saturated colours chosen for a light background; no yellow).
 *   Face = mix(paper -> ink at 0.015 d^2, gradient, max(z, w) * 1.9). Outline = mix(paper -> ink at 0.34 + 0.2 d^2,
 *   gradient, max(z, w) * 5.2 + max(0, 2d - 1) * 0.15), so an idle outline carries a faint moving band.
 * - The loop sleeps 2.4 s after the last movement (buffers cleared, one still frame).
 *
 * Options
 *   params.text     string, max 24 chars, default "Make some waves"
 *   params.brush    2..12 (% of width), default 5    largest brush radius on a fast sweep
 *   params.swirl    0..8, default 4.4                curl noise strength
 *   params.linger   0.85..0.99, default 0.955        how long the colour stays (per-frame keep ratio)
 *   params.outline  1..5 px, default 2               outline width
 *   reducedMotion   true / false / null              force reduced motion; null follows prefers-reduced-motion
 *
 * API
 *   const fx = mountPrismaticFluidHeadline(element, {params: {...}});
 *   fx.params                          copy of current params
 *   fx.setParams({text: 'Hello'})      change params live (text and outline rebuild the mask)
 *   fx.setPaused(true|false)           freeze / resume
 *   fx.reset()                         params back to defaults, colour cleared
 *   fx.destroy()                       removes listeners, observers and releases the WebGL context
 *
 * Usage (plain HTML)
 *   <link rel="stylesheet" href="effect.css">
 *   <div id="stage" style="height:560px"></div>
 *   <script src="effect.js"></script>
 *   <script>const fx = mountPrismaticFluidHeadline(document.getElementById('stage'), {params: {text: 'Make some waves'}});</script>
 * The element needs a real width and height; the effect fills it and replaces its children.
 *
 * Safe to change
 * - params.text, the paper and ink colours (--pf-paper / --pf-ink on .pf-sheet in effect.css), the font family
 *   (inherited from the sheet), K.weight and K.track.
 * - STOPS (gradient colours): keep them deep and saturated; pale or yellow stops vanish on a light sheet.
 * - The sheet box: inset 40 px from the element (20 px under 600 px wide).
 *
 * Do not change (the feel breaks)
 * - The colour lives only in the mask: do not draw the fluid over the whole sheet.
 * - Outline gain 5.2 vs face 1.9: the outline lighting up first is what reads as light in the strokes.
 * - The half-float buffers; an 8-bit buffer cannot hold small velocities and the colour never settles.
 * - Brush radius tied to pointer speed (still pointer = no paint).
 *
 * Porting (React, Vue, Svelte, Webflow)
 * - Mount once on a ref after the element is in the DOM; call fx.destroy() on unmount. In React StrictMode the
 *   mount runs twice; destroy in the cleanup handles that.
 * - Render an empty container and let the effect own its children. Push param changes through fx.setParams.
 * - Load effect.css globally (class names are not scoped). SSR: only call it in the browser.
 *
 * Fallback, accessibility and reduced motion
 * - No WebGL or no renderable half float: a canvas 2D version (ink outline, a fading colour stroke clipped to the
 *   letters; no advection or curl).
 * - The headline text is also in a visually hidden paragraph for screen readers; the canvas is aria-hidden.
 * - Reduced motion: no loop; a real pointer paints nothing.
 */
(function (global) {
  'use strict';

  // ---- inlined from the shared runtime: math helpers ----
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
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
    { key: 'text', type: 'text', default: 'Make some waves' },
    { key: 'brush', type: 'range', default: 5, min: 2, max: 12, step: 0.5 },
    { key: 'swirl', type: 'range', default: 4.4, min: 0, max: 8, step: 0.1 },
    { key: 'linger', type: 'range', default: 0.955, min: 0.85, max: 0.99, step: 0.005 },
    { key: 'outline', type: 'range', default: 2, min: 1, max: 5, step: 0.25 },
  ];

  // ---- the effect ----
  const K = {
    push: 30,
    curlScale: 0.015,
    curlMix: [1.2, 0.8],
    drift: 0.04,
    velDiss: 0.978,
    w2Diss: 0.76,
    accel: 0.84,
    gain: 0.7,
    floor: 0.0055,
    range: 100,
    quiet: 2.4,
    faceK: 1.9,
    edgeK: 5.2,
    band: 0.15,
    edgeInk: 0.34,
    edgeInkBand: 0.2,
    faceInk: 0.015,
    weight: 800,
    track: -0.035,
    lineH: 0.9,
  };
  const STOPS = ['#2a2cff', '#7b2cff', '#d4148f', '#ff2d3c', '#ff7a00', '#00a98f', '#0a7cff'];
  const VERT = 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}';
  const PAINT = `precision highp float;varying vec2 vUv;
uniform sampler2D uLow,uPrev;uniform vec2 uTexel;uniform vec4 uFrom,uTo;uniform float uPush,uCurlScale,uCurl,uFloor,uTime;uniform vec2 uCurlMix;uniform vec3 uDiss;uniform vec2 uVel;
vec2 sdSegment(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.);return vec2(length(pa-ba*h),h);}
vec2 hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy)*2.-1.;}
vec3 noised(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.);vec2 du=30.*f*f*(f*(f-2.)+1.);
 vec2 ga=hash(i),gb=hash(i+vec2(1,0)),gc=hash(i+vec2(0,1)),gd=hash(i+vec2(1,1));
 float va=dot(ga,f),vb=dot(gb,f-vec2(1,0)),vc=dot(gc,f-vec2(0,1)),vd=dot(gd,f-vec2(1,1));
 return vec3(va+u.x*(vb-va)+u.y*(vc-va)+u.x*u.y*(va-vb-vc+vd),ga+u.x*(gb-ga)+u.y*(gc-ga)+u.x*u.y*(ga-gb-gc+gd)+du*(u.yx*(va-vb-vc+vd)+vec2(vb,vc)-va));}
void main(){vec2 res=sdSegment(gl_FragCoord.xy,uFrom.xy,uTo.xy);vec2 rw=mix(uFrom.zw,uTo.zw,res.y);
 float d=1.-smoothstep(-.01,rw.x,res.x);vec4 low=texture2D(uLow,vUv);vec2 velInv=(.5-low.xy)*uPush;
 vec2 q=gl_FragCoord.xy*uCurlScale+vec2(.7,-.5)*uTime;vec3 n1=noised(q*(1.-.6*low.xy));
 vec2 n=noised(q*1.7+n1.yz*.35+low.xy*.8).yz;velInv+=n*dot(low.zw,uCurlMix)*uCurl;
 vec4 data=texture2D(uPrev,vUv+velInv*uTexel);data.xy-=.5;vec4 delta=(uDiss.xxyz-1.)*data;
 delta+=vec4(uVel*d,rw.yy*d);delta.zw=sign(delta.zw)*max(vec2(uFloor),abs(delta.zw));data+=delta;data.xy+=.5;gl_FragColor=clamp(data,0.,1.);}`;
  const BLUR = `precision highp float;varying vec2 vUv;uniform sampler2D uSrc;uniform vec2 uStep;
void main(){vec4 c=texture2D(uSrc,vUv)*.2270270270;
 c+=(texture2D(uSrc,vUv+uStep*1.3846153846)+texture2D(uSrc,vUv-uStep*1.3846153846))*.3162162162;
 c+=(texture2D(uSrc,vUv+uStep*3.2307692308)+texture2D(uSrc,vUv-uStep*3.2307692308))*.0702702703;gl_FragColor=c;}`;
  const SHOW = `precision highp float;varying vec2 vUv;
uniform sampler2D uMask,uPaint,uGrad;uniform float uTime,uFaceK,uEdgeK,uBand,uEdgeInk,uEdgeInkBand,uFaceInk;uniform vec3 uPaper,uInk;
void main(){vec2 m=texture2D(uMask,vUv).rg;vec4 p=texture2D(uPaint,vUv);float k=max(p.z,p.w),s=vUv.x+vUv.y;
 float dF=cos(s*4.+uTime)*.5+.5,dE=cos(s*4.+uTime+3.1415926)*.5+.5;
 vec3 face=mix(mix(uPaper,uInk,uFaceInk*dF*dF),texture2D(uGrad,vec2((p.x+p.y)*1.5+dF*2.,.5)).rgb,clamp(k*uFaceK,0.,1.));
 vec3 edge=mix(mix(uPaper,uInk,uEdgeInk+uEdgeInkBand*dE*dE),texture2D(uGrad,vec2((p.x+p.y)*1.5+dE*2.,.5)).rgb,clamp(k*uEdgeK+max(0.,dE*2.-1.)*uBand,0.,1.));
 vec3 c=mix(mix(uPaper,face,m.r),edge,m.g);gl_FragColor=vec4(c,1.);}`;
  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function gradientPixels() {
    const N = 256,
      out = new Uint8Array(N * 4),
      S = STOPS.map(hexRgb);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * S.length,
        a = Math.floor(t),
        f = t - a,
        c0 = S[a % S.length],
        c1 = S[(a + 1) % S.length],
        e = f * f * (3 - 2 * f);
      for (let j = 0; j < 3; j++) out[i * 4 + j] = Math.round(c0[j] + (c1[j] - c0[j]) * e);
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  function cssRgb(value, fallback) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = fallback;
    try {
      c.fillStyle = value || fallback;
    } catch (e) {}
    const v = c.fillStyle;
    if (v[0] === '#') return hexRgb(v);
    const m = v.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : hexRgb(fallback);
  }
  function mount(element, options) {
    options = options || {};
    const api = scope(element, CONTROLS, options);
    const cardOpt = options.card || null;
    element.classList.add('pf-stage');
    element.innerHTML =
      '<div class="pf-sheet' +
      ' pf-fill' +
      '"><canvas class="pf-gl" aria-hidden="true"></canvas><p class="pf-sr"></p></div>' +
      '';
    const sheet = element.querySelector('.pf-sheet'),
      sr = element.querySelector('.pf-sr');
    let canvas = element.querySelector('.pf-gl'),
      view = canvas;
    const phased = !!cardOpt.startup;
    let W = 1,
      H = 1,
      dpr = 1,
      pw = 1,
      ph = 1,
      lw = 1,
      lh = 1,
      paper = [255, 255, 255],
      ink = [23, 24, 26],
      box = { cx: 0.5, cy: 0.5, hw: 0.3, hh: 0.15 };
    const meas = document.createElement('canvas').getContext('2d');
    function family() {
      return getComputedStyle(sheet).fontFamily || 'system-ui, sans-serif';
    }
    function setFont(c, size) {
      c.font = K.weight + ' ' + size + 'px ' + family();
      if ('letterSpacing' in c) c.letterSpacing = (K.track * size).toFixed(2) + 'px';
    }
    function layout(text) {
      const words = String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length) return { lines: [], size: 0 };
      setFont(meas, 100);
      const wd = (s) => meas.measureText(s).width || 1,
        pad = Math.max(16, Math.min(W, H) * 0.07),
        aw = W - 2 * pad,
        ah = H - 2 * pad;
      const cands = [[words.join(' ')]];
      if (words.length >= 2)
        for (let i = 1; i < words.length; i++) cands.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
      if (words.length >= 3)
        for (let i = 1; i < words.length - 1; i++)
          for (let j = i + 1; j < words.length; j++)
            cands.push([words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')]);
      let best = null;
      cands.forEach((lines) => {
        const mw = Math.max(...lines.map(wd)),
          size = Math.min((aw * 100) / mw, ah / (lines.length * K.lineH));
        if (!best || size > best.size * 1.04) best = { lines, size, mw: (mw * size) / 100 };
      });
      return best;
    }
    let maskC = null,
      edgeC = null,
      faceC = null,
      unC = null;
    const canv = (c, w, h) => {
      c = c || document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    function buildMask() {
      const L = layout(api.params.text),
        cw = Math.max(2, Math.round(W * dpr)),
        ch = Math.max(2, Math.round(H * dpr));
      sr.textContent = String(api.params.text || '');
      faceC = canv(faceC, cw, ch);
      const f = faceC.getContext('2d');
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = L.lines.length,
        lh = L.size * K.lineH,
        top = H / 2 - (n * lh) / 2;
      setFont(f, L.size);
      f.textAlign = 'center';
      f.textBaseline = 'middle';
      f.fillStyle = '#f00';
      L.lines.forEach((s, i) => f.fillText(s, W / 2, top + lh * (i + 0.5) + L.size * 0.04));
      const r = (api.params.outline / 2) * dpr,
        dirs = [];
      for (let i = 0; i < 16; i++) dirs.push([Math.cos((i * Math.PI) / 8) * r, Math.sin((i * Math.PI) / 8) * r]);
      edgeC = canv(edgeC, cw, ch);
      unC = canv(unC, cw, ch);
      const e = edgeC.getContext('2d'),
        u = unC.getContext('2d');
      dirs.forEach((d) => e.drawImage(faceC, d[0], d[1]));
      u.drawImage(faceC, 0, 0);
      u.globalCompositeOperation = 'destination-in';
      dirs.forEach((d) => u.drawImage(faceC, d[0], d[1]));
      u.globalCompositeOperation = 'source-over';
      e.globalCompositeOperation = 'destination-out';
      e.drawImage(unC, 0, 0);
      e.globalCompositeOperation = 'source-in';
      e.fillStyle = gl ? '#0f0' : 'rgb(' + ink.join(',') + ')';
      e.fillRect(0, 0, cw, ch);
      e.globalCompositeOperation = 'source-over';
      box = n
        ? { cx: 0.5, cy: 0.5, hw: Math.min(0.46, L.mw / 2 / W), hh: Math.min(0.42, (n * lh) / 2 / H) }
        : { cx: 0.5, cy: 0.5, hw: 0.3, hh: 0.15 };
      if (!gl) return;
      maskC = canv(maskC, cw, ch);
      const c = maskC.getContext('2d');
      c.fillStyle = '#000';
      c.fillRect(0, 0, cw, ch);
      c.globalCompositeOperation = 'lighter';
      c.drawImage(faceC, 0, 0);
      c.drawImage(edgeC, 0, 0);
      c.globalCompositeOperation = 'source-over';
      gl.bindTexture(gl.TEXTURE_2D, T.mask);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskC);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    let gl = null,
      P = {},
      T = {},
      F = {},
      lose = null,
      ctx = null,
      HF = 0,
      quad = null,
      pend = null;
    let programSpecs = [],
      parallel = null,
      rendererReady = false,
      contextLost = false;
    function progsReady() {
      if (!pend) return true;
      if (!gl || !pend.qs.every((q) => gl.getProgramParameter(q.p, pend.done))) return false;
      const qs = pend.qs;
      pend = null;
      [P.paint, P.blur, P.show] = qs.map(progEnd);
      canvas.style.visibility = '';
      return true;
    }
    function progStart(fs) {
      const sh = (t, s) => {
        const o = gl.createShader(t);
        gl.shaderSource(o, s);
        gl.compileShader(o);
        return o;
      };
      const p = gl.createProgram(),
        v = sh(gl.VERTEX_SHADER, VERT),
        f = sh(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      return { p, v, f };
    }
    function progEnd(q) {
      const p = q.p;
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const bad = [q.v, q.f].find((o) => !gl.getShaderParameter(o, gl.COMPILE_STATUS));
        throw new Error(bad ? gl.getShaderInfoLog(bad) : gl.getProgramInfoLog(p));
      }
      const u = {},
        n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const a = gl.getActiveUniform(p, i);
        u[a.name] = gl.getUniformLocation(p, a.name);
      }
      return { p, u };
    }
    function tex(filter) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      [
        [gl.TEXTURE_MIN_FILTER, filter],
        [gl.TEXTURE_MAG_FILTER, filter],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
        [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      ].forEach((q) => gl.texParameteri(gl.TEXTURE_2D, q[0], q[1]));
      return t;
    }
    function target(w, h, old) {
      if (old) {
        gl.deleteTexture(old.t);
        gl.deleteFramebuffer(old.f);
      }
      const t = tex(gl.LINEAR);
      if (gl.texStorage2D) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, HF, null);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) throw new Error('no float target');
      return { t, f, w, h };
    }
    function acquireGL() {
      const attr = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false };
      gl = canvas.getContext('webgl2', attr);
      if (gl) {
        if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float'))
          throw new Error('no float');
      } else {
        gl = canvas.getContext('webgl', attr);
        if (gl) {
          const e = gl.getExtension('OES_texture_half_float');
          if (!e || !gl.getExtension('OES_texture_half_float_linear')) throw new Error('no half');
          gl.getExtension('EXT_color_buffer_half_float');
          HF = e.HALF_FLOAT_OES;
        }
      }
      if (gl) {
        lose = gl.getExtension('WEBGL_lose_context');
        parallel = gl.getExtension('KHR_parallel_shader_compile');
        const ownCanvas = canvas;
        api.listen(ownCanvas, 'webglcontextlost', (event) => {
          if (ownCanvas !== canvas || api.destroyed) return;
          event.preventDefault();
          contextLost = true;
          api.invalidatePreparation();
          if (!api.preparing) {
            try {
              fallback2D();
              fit();
              begin();
              api.paint();
              api.wake();
            } catch (error) {
              api.destroy();
            }
          }
        });
      }
    }
    function submitPrograms() {
      if (contextLost) throw new Error('Prism WebGL context lost during preparation');
      const qs = (programSpecs = [PAINT, BLUR, SHOW].map(progStart));
      if (parallel) {
        pend = { qs, done: parallel.COMPLETION_STATUS_KHR };
        canvas.style.visibility = 'hidden';
      } else if (!phased) [P.paint, P.blur, P.show] = qs.map(progEnd);
    }
    function bindRenderer() {
      if (contextLost) throw new Error('Prism WebGL context lost during preparation');
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      T.mask = tex(gl.LINEAR);
      T.grad = tex(gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, gradientPixels());
      F.a = target(4, 4);
      F.b = target(4, 4);
      F.la = target(2, 2);
      F.lb = target(2, 2);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      rendererReady = true;
    }
    function releaseGL() {
      const old = gl;
      gl = null;
      rendererReady = false;
      if (old)
        try {
          Object.values(F).forEach((t) => {
            if (t && t.t) old.deleteTexture(t.t);
            if (t && t.f) old.deleteFramebuffer(t.f);
          });
          Object.values(T).forEach((t) => old.deleteTexture(t));
          if (quad) old.deleteBuffer(quad);
          programSpecs.forEach((q) => {
            old.deleteShader(q.v);
            old.deleteShader(q.f);
            old.deleteProgram(q.p);
          });
          const disposal = lose || old.getExtension('WEBGL_lose_context');
          if (disposal) disposal.loseContext();
        } catch (_) {}
      P = {};
      T = {};
      F = {};
      quad = pend = parallel = lose = null;
      programSpecs = [];
    }
    function fallback2D() {
      releaseGL();
      const replacement = document.createElement('canvas');
      replacement.className = 'pf-gl';
      replacement.setAttribute('aria-hidden', 'true');
      canvas.replaceWith(replacement);
      canvas = view = replacement;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Prism renderer unavailable');
      contextLost = false;
      rendererReady = true;
    }
    if (!phased) {
      try {
        acquireGL();
        if (gl) {
          submitPrograms();
          bindRenderer();
        } else fallback2D();
      } catch (error) {
        fallback2D();
      }
    }
    async function prepareRenderer(phase) {
      if (rendererReady) return;
      try {
        await phase(acquireGL, 'prism-context');
        if (!gl) {
          await phase(fallback2D, 'prism-fallback');
          return;
        }
        await phase(submitPrograms, 'prism-shader-submit');
        if (parallel) {
          let done = false;
          while (!done)
            done = await phase(() => {
              if (contextLost) throw new Error('Prism WebGL context lost during preparation');
              return programSpecs.every((q) => gl.getProgramParameter(q.p, parallel.COMPLETION_STATUS_KHR));
            }, 'prism-shader-poll');
        }
        for (let i = 0; i < programSpecs.length; i++)
          await phase(() => {
            if (contextLost) throw new Error('Prism WebGL context lost during preparation');
            P[['paint', 'blur', 'show'][i]] = progEnd(programSpecs[i]);
          }, 'prism-shader-status-' + i);
        pend = null;
        await phase(bindRenderer, 'prism-bind-renderer');
      } catch (error) {
        if (api.destroyed || cardOpt.startup.signal.aborted || error.name === 'AbortError') throw error;
        await phase(fallback2D, 'prism-fallback');
      }
    }
    api.cleanup(releaseGL);
    let trail = null,
      tmp = null,
      GRAD = null;
    function clearPaint() {
      if (gl) {
        gl.clearColor(0.5, 0.5, 0, 0);
        [F.a, F.b, F.la, F.lb].forEach((t) => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.f);
          gl.clear(gl.COLOR_BUFFER_BIT);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else if (trail) trail.getContext('2d').clearRect(0, 0, trail.width, trail.height);
      S.vx = S.vy = 0;
    }
    function fit(skipMask) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(2, sheet.clientWidth);
      H = Math.max(2, sheet.clientHeight);
      const cw = Math.max(2, Math.round(W * dpr)),
        ch = Math.max(2, Math.round(H * dpr));
      if (view.width !== cw || view.height !== ch) {
        view.width = cw;
        view.height = ch;
      }
      const st = getComputedStyle(sheet);
      paper = cssRgb(st.getPropertyValue('--pf-paper').trim(), '#ffffff');
      ink = cssRgb(st.getPropertyValue('--pf-ink').trim(), '#17181a');
      const npw = Math.max(2, W >> 2),
        nph = Math.max(2, H >> 2);
      if (npw !== pw || nph !== ph || !F.sized) {
        pw = npw;
        ph = nph;
        lw = Math.max(2, W >> 3);
        lh = Math.max(2, H >> 3);
        if (gl) {
          F.a = target(pw, ph, F.a);
          F.b = target(pw, ph, F.b);
          F.la = target(lw, lh, F.la);
          F.lb = target(lw, lh, F.lb);
          F.sized = true;
        } else {
          trail = trail || document.createElement('canvas');
          trail.width = pw;
          trail.height = ph;
          tmp = tmp || document.createElement('canvas');
          F.sized = true;
        }
        clearPaint();
        S.from = null;
      }
      if (!skipMask) buildMask();
    }
    const S = {
      x: 0,
      y: 0,
      has: false,
      lx: 0,
      ly: 0,
      seen: false,
      from: null,
      vx: 0,
      vy: 0,
      t: 0,
      quiet: 99,
      touch: false,
    };
    function pass(pr, dst) {
      gl.useProgram(pr.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null);
      gl.viewport(0, 0, dst ? dst.w : view.width, dst ? dst.h : view.height);
    }
    function bindTex(u, unit, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u, unit);
    }
    function simStep(dt) {
      const p = api.params,
        f60 = dt * 60,
        maxR = Math.max((W * p.brush) / 100, (40 * p.brush) / 5),
        range = Math.max(40, (K.range * W) / 1440);
      let r = 0;
      if (S.has) {
        const dist = S.seen ? Math.hypot(S.x - S.lx, S.y - S.ly) : 0;
        r = Math.min(1, dist / range) * maxR;
        S.lx = S.x;
        S.ly = S.y;
        S.seen = true;
        if (dist > 0.01) S.quiet = 0;
      }
      const to = [(S.x / W) * pw, (1 - S.y / H) * ph, (r * pw) / W, 1],
        from = S.from || to;
      S.from = to;
      const ka = Math.pow(K.accel, f60);
      S.vx = S.vx * ka + (to[0] - from[0]) * dt * K.gain;
      S.vy = S.vy * ka + (to[1] - from[1]) * dt * K.gain;
      S.quiet += dt;
      S.t += dt;
      if (gl) {
        pass(P.blur, F.la);
        bindTex(P.blur.u.uSrc, 0, F.a.t);
        gl.uniform2f(P.blur.u.uStep, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        for (let i = 0; i < 2; i++) {
          pass(P.blur, F.lb);
          bindTex(P.blur.u.uSrc, 0, F.la.t);
          gl.uniform2f(P.blur.u.uStep, 1 / lw, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          pass(P.blur, F.la);
          bindTex(P.blur.u.uSrc, 0, F.lb.t);
          gl.uniform2f(P.blur.u.uStep, 0, 1 / lh);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        const u = P.paint.u;
        pass(P.paint, F.b);
        bindTex(u.uPrev, 0, F.a.t);
        bindTex(u.uLow, 1, F.la.t);
        gl.uniform2f(u.uTexel, 1 / pw, 1 / ph);
        gl.uniform4f(u.uFrom, from[0], from[1], from[2], from[3]);
        gl.uniform4f(u.uTo, to[0], to[1], to[2], to[3]);
        gl.uniform1f(u.uPush, K.push * f60);
        gl.uniform1f(u.uCurlScale, K.curlScale);
        gl.uniform1f(u.uCurl, p.swirl * f60);
        gl.uniform1f(u.uFloor, K.floor * f60);
        gl.uniform1f(u.uTime, S.t * K.drift);
        gl.uniform2f(u.uCurlMix, K.curlMix[0], K.curlMix[1]);
        gl.uniform3f(u.uDiss, Math.pow(K.velDiss, f60), Math.pow(p.linger, f60), Math.pow(K.w2Diss, f60));
        gl.uniform2f(u.uVel, S.vx, S.vy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const sw = F.a;
        F.a = F.b;
        F.b = sw;
      } else {
        const c = trail.getContext('2d');
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = 'rgba(0,0,0,' + (1 - Math.pow(p.linger, f60)).toFixed(4) + ')';
        c.fillRect(0, 0, pw, ph);
        c.globalCompositeOperation = 'source-over';
        if (r > 0) {
          const g = GRAD || (GRAD = gradientPixels()),
            i =
              Math.floor(
                ((((S.t * 0.15 + Math.atan2(to[1] - from[1], to[0] - from[0]) / 6.2832 + ((S.x + S.y) / (W + H)) * 2) %
                  1) +
                  1) %
                  1) *
                  256,
              ) * 4;
          c.strokeStyle = 'rgb(' + g[i] + ',' + g[i + 1] + ',' + g[i + 2] + ')';
          c.lineCap = 'round';
          c.lineWidth = Math.max(1, to[2] * 2);
          c.beginPath();
          c.moveTo(from[0], ph - from[1]);
          c.lineTo(to[0], ph - to[1]);
          c.stroke();
        }
      }
    }
    function render() {
      if (!rendererReady || contextLost) throw new Error('Prism renderer is not ready');
      view.style.visibility = '';
      if (gl) {
        const u = P.show.u;
        pass(P.show, null);
        bindTex(u.uMask, 0, T.mask);
        bindTex(u.uPaint, 1, F.a.t);
        bindTex(u.uGrad, 2, T.grad);
        gl.uniform1f(u.uTime, S.t);
        gl.uniform1f(u.uFaceK, K.faceK);
        gl.uniform1f(u.uEdgeK, K.edgeK);
        gl.uniform1f(u.uBand, K.band);
        gl.uniform1f(u.uEdgeInk, K.edgeInk);
        gl.uniform1f(u.uEdgeInkBand, K.edgeInkBand);
        gl.uniform1f(u.uFaceInk, K.faceInk);
        gl.uniform3f(u.uPaper, paper[0] / 255, paper[1] / 255, paper[2] / 255);
        gl.uniform3f(u.uInk, ink[0] / 255, ink[1] / 255, ink[2] / 255);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return;
      }
      const cw = view.width,
        ch = view.height;
      if (tmp.width !== cw || tmp.height !== ch) {
        tmp.width = cw;
        tmp.height = ch;
      }
      const t = tmp.getContext('2d');
      t.globalCompositeOperation = 'copy';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgb(' + paper.join(',') + ')';
      ctx.fillRect(0, 0, cw, ch);
      t.imageSmoothingEnabled = true;
      t.drawImage(trail, 0, 0, cw, ch);
      t.globalCompositeOperation = 'source-over';
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(faceC, 0, 0);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(tmp, 0, 0);
      ctx.globalAlpha = K.edgeInk + 0.1;
      ctx.drawImage(edgeC, 0, 0);
      t.globalCompositeOperation = 'copy';
      t.drawImage(trail, 0, 0, cw, ch);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(edgeC, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    }
    function begin() {
      clearPaint();
      Object.assign(S, { has: false, seen: false, from: null, t: 0, quiet: 99 });
    }
    function feed(e) {
      const r = sheet.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top,
        inside = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
      if (e.pointerType !== 'mouse' && !S.touch) return;
      if (!inside) {
        S.has = false;
        S.seen = false;
        return;
      }
      if (api.reduced) return;
      S.x = x;
      S.y = y;
      S.has = true;
      S.quiet = 0;
      api.wake();
    }
    api.listen(element, 'pointermove', (e) => {
      feed(e);
    });
    api.listen(element, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        S.touch = true;
        S.seen = false;
        try {
          element.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
      feed(e);
    });
    const lift = (e) => {
      if (e.pointerType === 'mouse') return;
      S.touch = false;
      S.has = false;
      S.seen = false;
    };
    api.listen(element, 'pointerup', lift);
    api.listen(element, 'pointercancel', lift);
    api.listen(element, 'pointerleave', (e) => {
      if (e.pointerType !== 'mouse' && S.touch) return;
      S.has = false;
      S.seen = false;
    });
    api.restore = () => {
      S.touch = false;
      clearPaint();
      S.quiet = 99;
      api.paint();
    };
    let lastText = null,
      lastOutline = null;
    api.on('params', (p) => {
      if (p.text !== lastText || p.outline !== lastOutline) {
        lastText = p.text;
        lastOutline = p.outline;
        buildMask();
      }
    });
    api.on('replay', () => {
      begin();
    });
    api.on('resize', () => {
      fit();
    });
    const fontReady =
      document.fonts && document.fonts.load
        ? document.fonts.load(K.weight + ' 100px ' + family()).catch(() => {})
        : Promise.resolve();
    if (!phased)
      fontReady.then(() => {
        if (!api.destroyed) {
          buildMask();
          api.paint();
        }
      });
    api.frame(({ dt, reduced }) => {
      if (gl && !progsReady()) return true;
      if (reduced) {
        render();
        return false;
      }
      simStep(Math.min(dt, 1 / 30));
      render();
      if (S.quiet > K.quiet) {
        clearPaint();
        render();
        return false;
      }
      return true;
    });
    if (phased)
      api.prepare(async (phase) => {
        await prepareRenderer(phase);
        await fontReady;
        await phase(() => {
          if (contextLost) fallback2D();
          fit(true);
        }, 'prism-targets');
        await phase(() => {
          buildMask();
          lastText = api.params.text;
          lastOutline = api.params.outline;
        }, 'prism-mask');
        await phase(() => {
          clearPaint();
          Object.assign(S, { has: false, seen: false, from: null, t: 0, quiet: 99 });
        }, 'prism-reset');
      });
    else {
      fit();
      lastText = api.params.text;
      lastOutline = api.params.outline;
      begin();
      api.paint();
    }
    const status = api.status;
    api.status = () =>
      Object.assign(status(), {
        quiet: +S.quiet.toFixed(2),
        renderer: gl ? (gl.texStorage2D ? 'webgl2' : 'webgl') : 'canvas2d',
      });
    return api;
  }

  // ---- mounting: stage markup, layout and the options the effect runs with ----
  function mountPrismaticFluidHeadline(element, options) {
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
    element.classList.add('prismatic-fluid-headline');
    element.innerHTML = '<div class="fx-board"><div class="pf-box" data-pf></div></div>';
    const stage = element,
      box = stage.querySelector('[data-pf]');
    let inst = null;
    function place() {
      const W = stage.clientWidth,
        H = stage.clientHeight,
        m = W < 600 ? 20 : 40,
        x0 = m;
      box.style.left = x0 + 'px';
      box.style.top = m + 'px';
      box.style.width = W - m - x0 + 'px';
      box.style.height = H - 2 * m + 'px';
    }

    place();
    inst = mount(box, { params: options.params, card: { interactive: true } });
    const observer0 = new ResizeObserver(place);
    observer0.observe(stage);

    inst.on('destroy', () => {
      observer0.disconnect();
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
  global.mountPrismaticFluidHeadline = mountPrismaticFluidHeadline;
  if (typeof module === 'object' && module.exports) module.exports = mountPrismaticFluidHeadline;
})(typeof window !== 'undefined' ? window : this);

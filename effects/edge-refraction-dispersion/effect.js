/*
 * Edge Refraction Dispersion
 *
 * Mount: const fx = mountEdgeRefractionDispersion(viewport, {content, edges: ['left','right'], params});
 * viewport: an element with an explicit stable width and height, positioned relative and without padding.
 * content: its direct child, also sized to width:100%;height:100%. This is the stationary native scroller or clipped content window.
 * For a carousel, put the translating track INSIDE content. Do not pass the moving track as content.
 * Place carousel controls beside viewport, outside the optical surfaces. Images, links, layout and scroll behaviour belong to the host.
 * A wrapping layer is inserted only around content in Firefox/WebKit. Use classes rather than a direct-child CSS selector for content.
 * Existing image/list nodes, handlers, scroll offsets and focus remain intact. The core never creates pictures or handles gestures.
 *
 * edges accepts left/right/top/bottom; defaults to left/right. Select edges when mounting; remount to change their set.
 * Parameters: band 4..14 percent (default 8), dispersion 0..14 (default 7), enabled boolean (default true).
 * API: params (copy), setParams(object), refresh(), status(), destroy(), setReduced(true/false/null).
 * The effect never pauses host scrolling or the host carousel.
 * ResizeObserver refreshes optical bounds. Call refresh after container layout changes if needed. Hidden zero-size mounts recover on resize.
 * Maps rebuild only for size/band/dispersion changes, never for scroll or track transform changes.
 * Stopping motion preserves the optical bend. There is no hover ripple, canvas panning, zoom, pointer or automatic demonstration.
 *
 * Optics retain the circular curve 1-sqrt(1-t*t), independent RGB displacement and screen recombination.
 * Chromium uses fixed backdrop strips. Firefox/WebKit use nested fixed direct-filter surfaces with normalized objectBoundingBox units.
 * The neutral-channel correction and a 2px map halo avoid undefined inner-boundary sampling at fractional document positions.
 * At widths below 500px the bands use 60% width and half the channel separation. Reduced motion disables decorative refraction.
 * If the 2D displacement texture cannot be generated, refraction is disabled while original host content and scrolling remain visible.
 * status().fallbackReason reports displacement-texture-unavailable (or svg-filter-unavailable); refresh() can retry texture creation.
 * Sampling folds at an edge may produce strong colour fringes. Browser resampling can differ; pixel-identical output is not promised.
 * The centre remains clear. Transparent gaps remain part of the host composition.
 * Scope is local image lists and carousels, not arbitrary DOM, video or whole-browser-window effects.
 * Destroy unwraps the original content, keeps current scroll/focus and releases all observers/filters.
 * No framework, remote images or build step is required. The example contains its own inline sample images.
 * Validation covers desktop Chrome, Firefox and WebKit engines, not physical phones or physical Safari hardware.
 *
 * Copyright (c) 2026 PROJECT Y/O. Effect Atlas License 1.0 (effectatlas.com/license)
 * Keep this notice when you copy or adapt the code; no visible credit is needed in your project.
 */
(function (global) {
  'use strict';
  if (global.EffectAtlasRuntime) return;
  let serial = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function scope(element, definitions, options = {}, className) {
    if (!(element instanceof Element)) throw new TypeError('A DOM element is required.');
    const hooks = new Map(),
      cleanups = [],
      owned = new Map();
    let params = {},
      destroyed = false,
      paused = false,
      visible = true,
      raf = 0,
      frames = 0,
      last = 0;
    let draw = () => false,
      reducedOverride = options.reducedMotion ?? null;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let systemReduced = media.matches;
    const reduced = () => (reducedOverride === null ? systemReduced : !!reducedOverride);
    const defaults = Object.fromEntries(Object.entries(definitions).map(([key, rule]) => [key, rule.default]));
    const emit = (type, value) => (hooks.get(type) || []).forEach((fn) => fn(value));
    const allowed = () => !destroyed && !paused && visible && !document.hidden;
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    }
    function wake() {
      if (allowed() && !raf) raf = requestAnimationFrame(tick);
    }
    function tick(time) {
      raf = 0;
      if (!allowed()) return;
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;
      frames++;
      const more = draw({ dt, time });
      if (more) wake();
      else last = 0;
    }
    function listen(target, type, fn, opt) {
      target.addEventListener(type, fn, opt);
      cleanups.push(() => target.removeEventListener(type, fn, opt));
      return fn;
    }
    function style(node, property, value) {
      let props = owned.get(node);
      if (!props) owned.set(node, (props = new Map()));
      if (!props.has(property))
        props.set(property, {
          old: node.style.getPropertyValue(property),
          priority: node.style.getPropertyPriority(property),
        });
      props.get(property).value = String(value);
      node.style.setProperty(property, String(value));
    }
    const hadClass = element.classList.contains(className);
    element.classList.add(className);
    const api = {
      element,
      uid: 'ea-' + ++serial,
      defaults: { ...defaults },
      clamp,
      listen,
      style,
      get params() {
        return { ...params };
      },
      get destroyed() {
        return destroyed;
      },
      get reduced() {
        return reduced();
      },
      get paused() {
        return paused;
      },
      on(type, fn) {
        if (!hooks.has(type)) hooks.set(type, []);
        hooks.get(type).push(fn);
        return fn;
      },
      cleanup(fn) {
        cleanups.push(fn);
        return fn;
      },
      setParams(next = {}) {
        if (destroyed) return;
        for (const [key, rule] of Object.entries(definitions)) {
          if (!(key in next) && key in params) continue;
          let value = key in next ? next[key] : rule.default;
          if (rule.type === 'number')
            value = Number.isFinite(+value) ? clamp(+value, rule.min, rule.max) : rule.default;
          if (rule.type === 'color') value = /^#[\da-f]{6}$/i.test(String(value)) ? value : rule.default;
          if (rule.type === 'boolean') value = !!value;
          params[key] = value;
        }
        emit('params', { ...params });
      },
      setReduced(value) {
        if (destroyed) return;
        reducedOverride = value == null ? null : !!value;
        emit('motion', reduced());
        wake();
      },
      setPaused(value) {
        if (destroyed) return;
        paused = !!value;
        stop();
        emit('pause', paused);
        if (!paused) wake();
      },
      frame(fn) {
        draw = fn;
      },
      wake,
      status() {
        return { destroyed, paused, visible, reduced: reduced(), raf, frameCount: frames, params: { ...params } };
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        emit('destroy');
        cleanups
          .splice(0)
          .reverse()
          .forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error(e);
            }
          });
        for (const [node, props] of owned)
          for (const [name, state] of props) {
            if (node.style.getPropertyValue(name) === state.value) {
              if (state.old) node.style.setProperty(name, state.old, state.priority);
              else node.style.removeProperty(name);
            }
          }
        if (!hadClass) element.classList.remove(className);
        hooks.clear();
        owned.clear();
      },
    };
    listen(media, 'change', (event) => {
      systemReduced = event.matches;
      emit('motion', reduced());
      wake();
    });
    listen(document, 'visibilitychange', () => {
      stop();
      emit('visibility', !document.hidden && visible);
      if (!document.hidden) wake();
    });
    listen(window, 'pageshow', () => {
      emit('resize');
      wake();
    });
    listen(window, 'pagehide', (event) => {
      if (event.persisted) stop();
      else api.destroy();
    });
    const resize = new ResizeObserver(() => emit('resize'));
    resize.observe(element);
    api.cleanup(() => resize.disconnect());
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      stop();
      emit('visibility', visible && !document.hidden);
      if (visible) wake();
    });
    intersection.observe(element);
    api.cleanup(() => intersection.disconnect());
    api.setParams(options.params);
    return api;
  }
  global.EffectAtlasRuntime = { scope, clamp };
})(window);

(function (global) {
  'use strict';
  // Fixed optical windows over existing image lists. No images, gestures or demo loop are created here.
  const mounts = new WeakMap(),
    NS = 'http://www.w3.org/2000/svg';
  const DIRECTIONS = [
    ['left', false, true],
    ['right', false, false],
    ['top', true, true],
    ['bottom', true, false],
  ];
  function svgNode(name, attrs) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  }
  function curve(t) {
    t = Math.max(0, Math.min(1, t));
    return 1 - Math.sqrt(1 - t * t);
  }
  function displacementTexture(vertical, leading, band, depth, padding = 0) {
    const n = 512,
      canvas = document.createElement('canvas');
    canvas.width = vertical ? 1 : n;
    canvas.height = vertical ? n : 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Displacement texture unavailable');
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < n; i++) {
      const local = ((i + 0.5) / n) * (depth + 2 * padding) - padding,
        t = leading ? (band - local) / band : (local - (depth - band)) / band;
      const bend = t > 0 ? curve(t) : 0,
        value = bend ? Math.round((0.5 + (leading ? 1 : -1) * bend * 0.5) * 255) : leading ? 127 : 128,
        at = i * 4;
      pixels.data[at] = vertical ? 127 : value;
      pixels.data[at + 1] = vertical ? value : 127;
      pixels.data[at + 2] = 128;
      pixels.data[at + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image/png')) throw new Error('Displacement texture unavailable');
    return url;
  }

  function mountEdgeRefractionDispersion(element, options = {}) {
    if (!(element instanceof Element)) throw new TypeError('viewport must be an element');
    if (mounts.has(element)) mounts.get(element).destroy();
    const scroll = options.content;
    if (!(scroll instanceof Element) || scroll.parentElement !== element)
      throw new TypeError('content must be a direct child of viewport; put moving tracks inside content');
    const edges = [...new Set(options.edges || ['left', 'right'])];
    if (!edges.length || edges.some((s) => !DIRECTIONS.some((d) => d[0] === s)))
      throw new RangeError('edges must contain left, right, top or bottom');
    const api = global.EffectAtlasRuntime.scope(
      element,
      {
        band: { type: 'number', min: 4, max: 14, default: 8 },
        dispersion: { type: 'number', min: 0, max: 14, default: 7 },
        enabled: { type: 'boolean', default: true },
      },
      options,
      'er-viewport',
    );
    const uid = api.uid,
      windowEl = element;
    const anchor = document.createComment('edge refraction content');
    scroll.before(anchor);
    const scrollPosition = { x: scroll.scrollLeft, y: scroll.scrollTop },
      focus = document.activeElement;
    if (getComputedStyle(element).position === 'static') api.style(element, 'position', 'relative');
    api.style(element, 'overflow', 'hidden');
    const defsSvg = svgNode('svg', {
        class: 'er-defs',
        'aria-hidden': 'true',
        focusable: 'false',
        width: 0,
        height: 0,
      }),
      defs = svgNode('defs');
    defsSvg.append(defs);
    windowEl.append(defsSvg);
    const bands = DIRECTIONS.filter(([side]) => edges.includes(side)).map(([side, vertical, leading]) => {
      const filterId = uid + '-' + side,
        strip = document.createElement('span');
      strip.className = 'er-band er-' + side;
      strip.setAttribute('aria-hidden', 'true');
      strip.style.backdropFilter = 'url("#' + filterId + '")';
      strip.style.webkitBackdropFilter = 'url("#' + filterId + '")';
      windowEl.append(strip);
      const filter = svgNode('filter', {
        id: filterId,
        x: 0,
        y: 0,
        filterUnits: 'userSpaceOnUse',
        primitiveUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      });
      const map = svgNode('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
      filter.append(map);
      // Correct the 8-bit PNG's 127/128 neutral values to exactly .5. The other axis must
      // stay precisely neutral, otherwise the observed window's clipped edge leaves a fine line.
      const axisValues = Array(20).fill(0),
        axis = vertical ? 1 : 0,
        neutral = vertical ? 0 : 1;
      axisValues[axis * 5 + axis] = 255 / 256;
      axisValues[axis * 5 + 4] = leading ? 1 / 256 : 0;
      axisValues[neutral * 5 + 4] = 0.5;
      axisValues[14] = 0.5;
      axisValues[18] = 1;
      filter.append(
        svgNode('feColorMatrix', { in: 'map', type: 'matrix', values: axisValues.join(' '), result: 'axis-map' }),
      );
      const displacements = ['r', 'g', 'b'].map((channel, index) => {
        const matrix = Array(20).fill(0);
        matrix[index * 5 + index] = 1;
        matrix[18] = 1;
        filter.append(
          svgNode('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: matrix.join(' '), result: channel }),
        );
        const displacement = svgNode('feDisplacementMap', {
          in: channel,
          in2: 'axis-map',
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: channel + '-bend',
        });
        filter.append(displacement);
        return displacement;
      });
      filter.append(
        svgNode('feBlend', { in: 'r-bend', in2: 'g-bend', mode: 'screen', result: 'rg' }),
        svgNode('feBlend', { in: 'rg', in2: 'b-bend', mode: 'screen', result: 'out' }),
      );
      defs.append(filter);
      return { side, vertical, leading, strip, filter, map, displacements, band: 0, depth: 0 };
    });

    const backdropSyntaxSupported = !!(global.CSS && CSS.supports('backdrop-filter', 'url("#' + uid + '-left")'));
    const useBackdrop =
      backdropSyntaxSupported && !!(navigator.userAgentData || /\b(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent));
    const syntaxSupported = useBackdrop || !!(global.CSS && CSS.supports('filter', 'url("#' + uid + '-field")'));
    const directFilter = !useBackdrop;
    if (directFilter) {
      let surface = scroll;
      for (const b of bands) {
        // Normalize both the filter and every primitive. WebKit's HTML user-space
        // coordinate origin is otherwise affected by natural document offsets.
        b.directFilter = svgNode('filter', {
          id: uid + '-' + b.side + '-field',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          filterUnits: 'objectBoundingBox',
          primitiveUnits: 'objectBoundingBox',
          'color-interpolation-filters': 'sRGB',
        });
        b.directSurface = document.createElement('div');
        b.directSurface.className = 'er-optical-surface';
        b.directSurface.append(surface);
        surface = b.directSurface;
        b.directPrimitives = [...b.filter.children].map((original) => {
          const node = original.cloneNode(true);
          for (const key of ['in', 'in2', 'result']) {
            const value = node.getAttribute(key);
            if (value && value !== 'SourceGraphic') node.setAttribute(key, b.side + '-' + value);
          }
          b.directFilter.append(node);
          return node;
        });
        b.directMap = b.directPrimitives[0];
        b.directAxis = b.directPrimitives[1];
        b.directDisplacements = b.directPrimitives.filter((n) => n.tagName === 'feDisplacementMap');
        const merge = svgNode('feMerge', { x: 0, y: 0, width: 1, height: 1 });
        merge.append(svgNode('feMergeNode', { in: 'SourceGraphic' }), svgNode('feMergeNode', { in: b.side + '-out' }));
        b.directFilter.append(merge);
        defs.append(b.directFilter);
      }
      windowEl.prepend(surface);
    }

    scroll.scrollLeft = scrollPosition.x;
    scroll.scrollTop = scrollPosition.y;
    if (focus && scroll.contains(focus)) focus.focus({ preventScroll: true });
    let W = 0,
      H = 0,
      narrow = false,
      mapBuilds = 0,
      mapSignature = '',
      mapsReady = false,
      fallbackReason = null;
    function setFiltering() {
      const on = api.params.enabled && !api.reduced && syntaxSupported && mapsReady && W > 0 && H > 0;
      for (const b of bands) {
        if (directFilter) b.directSurface.style.filter = on ? 'url("#' + b.directFilter.id + '")' : 'none';
        b.strip.style.display = on && useBackdrop ? 'block' : 'none';
        const split = (api.params.dispersion / 100) * (narrow ? 0.5 : 1),
          factors = [1 + split, 1, 1 - split];
        b.displacements.forEach((node, i) => node.setAttribute('scale', 2 * b.band * factors[i]));
        if (directFilter)
          b.directDisplacements.forEach((node, i) =>
            node.setAttribute('scale', (2 * b.band * factors[i]) / Math.max(1, b.vertical ? H : W)),
          );
      }
    }
    function updateMaps() {
      const signature = [W, H, api.params.band, api.params.dispersion, narrow].join('/');
      if (signature !== mapSignature || !mapsReady) {
        mapSignature = signature;
        mapsReady = false;
        fallbackReason = null;
        try {
          for (const b of bands) {
            b.band = Math.max(2, Math.round((((b.vertical ? H : W) * api.params.band) / 100) * (narrow ? 0.6 : 1)));
            b.depth = Math.ceil(b.band * (1 + (api.params.dispersion / 100) * (narrow ? 0.5 : 1))) + 4;
            const bw = b.vertical ? W + 12 : b.depth,
              bh = b.vertical ? b.depth : H + 12;
            b.strip.style.width = bw + 'px';
            b.strip.style.height = bh + 'px';
            if (b.vertical) b.strip.style.left = '-6px';
            else b.strip.style.top = '-6px';
            b.filter.setAttribute('width', bw);
            b.filter.setAttribute('height', bh);
            b.map.setAttribute('width', bw);
            b.map.setAttribute('height', bh);
            const texture = displacementTexture(b.vertical, b.leading, b.band, b.depth);
            b.map.setAttribute('href', texture);
            mapBuilds++;
            if (directFilter) {
              const region = b.vertical
                ? { x: 0, y: b.leading ? 0 : 1 - b.depth / H, width: 1, height: b.depth / H }
                : { x: b.leading ? 0 : 1 - b.depth / W, y: 0, width: b.depth / W, height: 1 };
              b.directPrimitives.forEach((node) =>
                Object.entries(region).forEach(([key, value]) => node.setAttribute(key, value)),
              );
              // A fractional page Y can put the last output sample just beyond feImage's
              // raster edge in WebKit. An undefined map pixel means a half-scale jump,
              // not a neutral sample. Provide a 2px map halo while keeping output bounds.
              const pad = 2,
                mapRegion = b.vertical
                  ? {
                      x: -pad / W,
                      y: b.leading ? -pad / H : 1 - (b.depth + pad) / H,
                      width: 1 + (2 * pad) / W,
                      height: (b.depth + 2 * pad) / H,
                    }
                  : {
                      x: b.leading ? -pad / W : 1 - (b.depth + pad) / W,
                      y: -pad / H,
                      width: (b.depth + 2 * pad) / W,
                      height: 1 + (2 * pad) / H,
                    };
              [b.directMap, b.directAxis].forEach((node) =>
                Object.entries(mapRegion).forEach(([key, value]) => node.setAttribute(key, value)),
              );
              b.directMap.setAttribute('href', displacementTexture(b.vertical, b.leading, b.band, b.depth, pad));
              mapBuilds++;
            }
          }
          mapsReady = true;
        } catch (_) {
          // Canvas can be blocked or exhausted even when CSS filter syntax exists.
          // Keep the host's real images and scrolling visible; no half-built filter
          // may hide them. An explicit refresh can retry after the renderer recovers.
          fallbackReason = 'displacement-texture-unavailable';
        }
      }
      setFiltering();
    }

    function refresh() {
      if (api.destroyed) return;
      W = element.clientWidth;
      H = element.clientHeight;
      narrow = W < 500;
      if (W && H) updateMaps();
      else setFiltering();
    }
    api.refresh = refresh;
    delete api.setPaused;
    api.on('params', refresh);
    api.on('resize', refresh);
    api.on('motion', setFiltering);
    const status = api.status;
    api.status = () => ({
      ...status(),
      edges: [...edges],
      window: { width: W, height: H },
      mapBuilds,
      filterMode: useBackdrop ? 'backdrop' : 'direct',
      filterSyntaxSupported: syntaxSupported,
      filterEnabled: api.params.enabled && !api.reduced && syntaxSupported && mapsReady && W > 0 && H > 0,
      fallbackReason: fallbackReason || (!syntaxSupported ? 'svg-filter-unavailable' : null),
      filterIds: bands.map((b) => (directFilter ? b.directFilter.id : b.filter.id)),
      optics: { mapping: 'original-circular', curve: '1-sqrt(1-t*t)', samplingHalo: 2 },
      bands: bands.map((b) => ({ side: b.side, band: b.band, depth: b.depth })),
    });
    api.cleanup(() => {
      const pos = { x: scroll.scrollLeft, y: scroll.scrollTop },
        focused = document.activeElement;
      if (anchor.parentNode && element.contains(scroll)) anchor.replaceWith(scroll);
      else anchor.remove();
      for (const b of bands) {
        b.strip.remove();
        if (b.directSurface) {
          while (b.directSurface.firstChild) b.directSurface.before(b.directSurface.firstChild);
          b.directSurface.remove();
        }
      }
      defsSvg.remove();
      scroll.scrollLeft = pos.x;
      scroll.scrollTop = pos.y;
      if (focused && scroll.contains(focused) && focused.isConnected) focused.focus({ preventScroll: true });
      if (mounts.get(element) === api) mounts.delete(element);
    });
    mounts.set(element, api);
    refresh();
    return api;
  }
  global.mountEdgeRefractionDispersion = mountEdgeRefractionDispersion;
})(window);

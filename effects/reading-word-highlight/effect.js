/*
 * Word-by-Word Reading Highlight
 *
 * Mount: const fx = mountReadingWordHighlight(existingArticle, {scrollRoot: window, params: {speed: .5, highlightColor: '#4559ff'}});
 * Use existing paragraphs and mark elements for highlighted phrases. Links, strong/em nodes and their events remain intact.
 * scrollRoot defaults to window. For a local scroller pass the ancestor element with a defined height and overflow:auto.
 * There is no content-length or highlight-count limit. Each paragraph advances relative to the visible scroll window.
 * The effect inherits font, line-height, width and text colour. Unread text remains visible; use --rwh-unread-opacity to adjust.
 * Parameters: speed .25..1.5 (default .5), highlightColor #RRGGBB (default #4559ff).
 * Ordinary text transitions over 350ms; highlighted backgrounds sweep over 600ms. Backwards scroll reverses both.
 * Reduced motion displays all text clearly and fills marks. Live preference changes are supported.
 *
 * API: params (copy), setParams(object), refresh(), status(), destroy(), setReduced(true/false/null), setPaused(boolean).
 * setPaused controls only owned opacity/background-size CSS transitions and resumes only those it paused.
 * Existing host WAAPI and CSS animations are never paused or resumed by this effect.
 * Call refresh after replacing text or adding paragraphs; it unwraps only owned token spans before rebinding the current content.
 * Changing parameters and calling refresh never resets the host scroll position. Inline links remain normal links.
 * Destroy removes only owned wrappers and restores modified CSS properties if the host has not changed them meanwhile.
 * Mark class/style attributes that were originally absent are removed when left empty by cleanup; original empty attributes and host-added nonempty values remain.
 * The effect does not create a scroll window, duplicate hidden text, demo content, pointer or playback loop.
 * Do not apply to editable text, buttons or form controls. Script/style nodes and data-reading-ignore subtrees are skipped for both text and mark styling.
 * Editable roots/subtrees, including empty and plaintext-only contenteditable values, are also skipped.
 * Call refresh after changing these exclusions. An ignored root remains unstyled until it is enabled again.
 * Do not place another reading instance inside a reading instance; use sibling instances instead.
 * A very long article can create many inline spans; apply only to passages where the treatment is useful.
 * No framework or build step. Load the two effect files beside index.html, over HTTP or file URLs.
 * Desktop engine tests do not imply physical phone or Safari hardware validation.
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
  const mounts = new WeakMap();
  function mountReadingWordHighlight(element, options = {}) {
    if (mounts.has(element)) mounts.get(element).destroy();
    const scrollRoot = options.scrollRoot || global;
    if (scrollRoot !== global && (!(scrollRoot instanceof Element) || !scrollRoot.contains(element)))
      throw new TypeError('scrollRoot must contain the reading element');
    const rootHadClass = element.classList.contains('rwh-root'),
      rootHadClassAttribute = element.hasAttribute('class'),
      rootHadStyleAttribute = element.hasAttribute('style');
    const api = global.EffectAtlasRuntime.scope(
      element,
      {
        speed: { type: 'number', min: 0.25, max: 1.5, default: 0.5 },
        highlightColor: { type: 'color', default: '#4559ff' },
      },
      options,
      'rwh-root',
    );
    let tokens = [],
      groups = [],
      marks = [],
      refreshes = 0;
    const owned = new Set(),
      markState = new Map(),
      rootStyles = new Map(),
      pausedTransitions = new Set();
    // One exclusion policy governs both text wrappers and mark decoration.
    const excluded = (node) =>
      !!node.closest('script,style,textarea,input,button,svg,[data-reading-ignore]') || node.isContentEditable;
    function restoreRootStyles() {
      for (const [name, state] of rootStyles)
        if (element.style.getPropertyValue(name) === state.value) {
          if (state.old) element.style.setProperty(name, state.old, state.priority);
          else element.style.removeProperty(name);
        }
      rootStyles.clear();
      // Read the serialized declaration before removing an empty attribute so a
      // pending CSSOM serialization cannot reintroduce style="" on an ignored root.
      if (!rootHadStyleAttribute && !element.style.cssText) {
        element.getAttribute('style');
        element.removeAttribute('style');
      }
    }
    function rootStyle(name, value) {
      if (!rootStyles.has(name))
        rootStyles.set(name, {
          old: element.style.getPropertyValue(name),
          priority: element.style.getPropertyPriority(name),
        });
      rootStyles.get(name).value = value;
      element.style.setProperty(name, value);
    }
    function syncRoot() {
      if (excluded(element)) {
        if (!rootHadClass) element.classList.remove('rwh-root');
        if (!rootHadClassAttribute && !element.classList.length) element.removeAttribute('class');
        restoreRootStyles();
        return false;
      }
      element.classList.add('rwh-root');
      rootStyle('--rwh-highlight', api.params.highlightColor);
      rootStyle('--rwh-duration', api.reduced ? '0ms' : '350ms');
      rootStyle('--rwh-mark-duration', api.reduced ? '0ms' : '600ms');
      return true;
    }
    const segmenter =
      typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(element.lang || document.documentElement.lang || 'en', { granularity: 'word' })
        : null;
    function unwrap() {
      for (const token of owned) {
        if (token.parentNode) token.replaceWith(...token.childNodes);
      }
      owned.clear();
      for (const [mark, state] of markState) {
        if (!state.had) mark.classList.remove('rwh-mark');
        if (mark.style.getPropertyValue('--rwh-progress') === state.value) {
          if (state.old) mark.style.setProperty('--rwh-progress', state.old, state.priority);
          else mark.style.removeProperty('--rwh-progress');
        }
        if (!state.hadClassAttribute && !mark.classList.length) mark.removeAttribute('class');
        if (!state.hadStyleAttribute && !mark.style.cssText) {
          mark.getAttribute('style');
          mark.removeAttribute('style');
        }
      }
      markState.clear();
      tokens = [];
      groups = [];
      marks = [];
    }
    function draw() {
      if (api.destroyed || excluded(element)) return false;
      const bounds = scrollRoot === global ? { top: 0, height: innerHeight } : scrollRoot.getBoundingClientRect();
      const scale = scrollRoot === global ? 1 : bounds.height / Math.max(1, scrollRoot.offsetHeight);
      const top = bounds.top + (scrollRoot === global ? 0 : scrollRoot.clientTop * scale),
        height = scrollRoot === global ? bounds.height : scrollRoot.clientHeight * scale;
      for (const group of groups) {
        const box = group.node.getBoundingClientRect();
        const linear = api.clamp((top + height * 0.88 - box.top) / (height * 0.63 + box.height), 0, 1);
        group.progress = api.reduced ? 1 : Math.pow(linear, 0.5 / api.params.speed);
        group.tokens.forEach((token, i) => {
          const read = group.progress * group.tokens.length > i + 0.5;
          token.node.classList.toggle('rwh-read', read);
          token.read = read;
        });
      }
      for (const mark of marks) {
        const inside = tokens.filter((t) => mark.contains(t.node)),
          read = inside.filter((t) => t.read).length;
        const value = (inside.length ? (read / inside.length) * 100 : 0) + '%';
        markState.get(mark).value = value;
        mark.style.setProperty('--rwh-progress', value);
      }
      return false;
    }
    function refresh() {
      if (api.destroyed) return;
      unwrap();
      if (!syncRoot()) {
        refreshes++;
        return;
      }
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.textContent.trim() || excluded(node.parentElement)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        }),
        texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      const groupMap = new Map();
      for (const text of texts) {
        const paragraph = text.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption');
        const owner = paragraph && element.contains(paragraph) ? paragraph : element;
        if (!groupMap.has(owner)) {
          const group = { node: owner, tokens: [], progress: 0 };
          groupMap.set(owner, group);
          groups.push(group);
        }
        const group = groupMap.get(owner),
          parts = segmenter
            ? [...segmenter.segment(text.textContent)].map((s) => s.segment)
            : text.textContent.split(/(\s+)/),
          fragment = document.createDocumentFragment();
        for (const part of parts) {
          if (!part.trim()) {
            fragment.append(document.createTextNode(part));
            continue;
          }
          const span = document.createElement('span');
          span.className = 'rwh-token';
          span.textContent = part;
          owned.add(span);
          const token = { node: span, read: false };
          tokens.push(token);
          group.tokens.push(token);
          fragment.append(span);
        }
        text.replaceWith(fragment);
      }
      marks = [...element.querySelectorAll('mark')].filter(
        (mark) => !excluded(mark) && tokens.some((token) => mark.contains(token.node)),
      );
      for (const mark of marks) {
        markState.set(mark, {
          had: mark.classList.contains('rwh-mark'),
          hadClassAttribute: mark.hasAttribute('class'),
          hadStyleAttribute: mark.hasAttribute('style'),
          old: mark.style.getPropertyValue('--rwh-progress'),
          priority: mark.style.getPropertyPriority('--rwh-progress'),
          value: '',
        });
        mark.classList.add('rwh-mark');
      }
      refreshes++;
      draw();
    }
    api.frame(draw);
    api.refresh = refresh;
    api.listen(scrollRoot, 'scroll', () => api.wake(), { passive: true });
    if (scrollRoot !== global) api.listen(global, 'scroll', () => api.wake(), { passive: true });
    api.listen(global, 'resize', () => api.wake(), { passive: true });
    if (document.fonts) api.listen(document.fonts, 'loadingdone', () => api.wake());
    function ownsTransition(animation) {
      const target = animation.effect && animation.effect.target;
      return (
        (owned.has(target) && animation.transitionProperty === 'opacity') ||
        (markState.has(target) && animation.transitionProperty === 'background-size')
      );
    }
    function pauseTransitions() {
      for (const animation of element.getAnimations({ subtree: true }))
        if (ownsTransition(animation) && animation.playState === 'running') {
          pausedTransitions.add(animation);
          animation.pause();
        }
    }
    api.on('pause', (value) => {
      if (value) pauseTransitions();
      else {
        for (const animation of pausedTransitions)
          if (ownsTransition(animation) && animation.playState === 'paused') animation.play();
        pausedTransitions.clear();
      }
    });
    api.listen(element, 'transitionrun', () => {
      if (api.paused) pauseTransitions();
    });
    api.on('resize', () => api.wake());
    api.on('visibility', () => api.wake());
    api.on('params', () => {
      if (syncRoot()) draw();
    });
    api.on('motion', () => {
      if (syncRoot()) draw();
    });
    const status = api.status;
    api.status = () => ({
      ...status(),
      tokenCount: tokens.length,
      readCount: tokens.filter((t) => t.read).length,
      markCount: marks.length,
      paragraphCount: groups.length,
      progress: groups.map((g) => g.progress),
      scrollRoot: scrollRoot === global ? 'window' : 'element',
      refreshes,
    });
    api.cleanup(() => {
      pausedTransitions.clear();
      unwrap();
      restoreRootStyles();
      if (mounts.get(element) === api) mounts.delete(element);
    });
    mounts.set(element, api);
    refresh();
    return api;
  }
  global.mountReadingWordHighlight = mountReadingWordHighlight;
})(window);

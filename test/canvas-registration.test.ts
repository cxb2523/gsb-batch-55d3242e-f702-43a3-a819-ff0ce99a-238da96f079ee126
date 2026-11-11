/**
 * How the canvas tab type reaches the host's right Sidebar.
 *
 * Two ways for this to be wrong and still look fine: registering the body under the definition's
 * `kind` instead of its `id` (the type is accepted, and no tab ever reaches the body), and
 * putting the sidebar services in the static `inject` (a host without them loses the whole
 * plugin rather than just the canvas panel).
 */
import { afterEach, expect, test } from "bun:test";
import { apply } from "../src/client/index.ts";
import { CANVAS_BROWSER_ID, CANVAS_TAB_ID, canvasTabDefinition } from "../src/client/canvas/definition.ts";
import { restoreGlobals } from "./globals.ts";

type Registered = { type?: unknown; seat?: string; options?: Record<string, unknown> };

/** `apply` against a stub host, recording what reaches the sidebar and the slot registry. */
function applyTo(sidebar: boolean) {
  const seen: Registered[] = {};
  const recorded: Registered[] = [];
  const stub = (): unknown => new Proxy(() => stub(), { get: () => stub(), apply: () => stub() });
  const base: Record<string, unknown> = {
    uiSession: { adapter: { current: { getSnapshot: () => ({ key: undefined }) } } },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) }, scope: () => undefined },
    get: () => undefined,
    // The two effects that reach for the DOM are not this file's subject, and faking a
    // `MutationObserver`/`document` here would be a second, worse stand-in. Skipped BY NAME and
    // only those two — everything else runs, and if it throws the test goes red. That the
    // registration effects did run is proven by `recorded` being non-empty below, not assumed.
    effect: (run: () => unknown, label?: string) => {
      if (label !== undefined && (label.includes("inline fences") || label.includes("canvas auto-open"))) return;
      run();
    },
    // Only the sidebar fiber is optional. `conversation` and the rest always run — a host
    // without the sidebar is supposed to keep them, which is what the last test asserts.
    inject: (want: readonly string[], callback: (scoped: unknown) => void) => {
      if (want.includes("sidebarRightTabs") && !sidebar) return;
      callback(scoped);
    },
  };
  const scoped: unknown = new Proxy(base, {
    get: (target, key) => {
      if (key === "slots") {
        return {
          inject: (seat: string, body: () => unknown) => {
            seen.seat = seat;
            return body();
          },
          register: (options: Record<string, unknown>) => {
            seen.options = options;
            recorded.push({ seat: seen.seat, options });
            return () => {};
          },
        };
      }
      if (key === "sidebarRightTabs") {
        return {
          register: (type: unknown) => {
            seen.type = type;
            recorded.push({ type });
            return () => {};
          },
        };
      }
      return key in target ? target[key as string] : stub();
    },
  });
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    apply(scoped as never);
  } finally {
    console.warn = realWarn;
  }
  return recorded;
}

afterEach(restoreGlobals);

test("the tab type is registered, and the body under its id rather than its kind", () => {
  const recorded = applyTo(true);
  const type = recorded.find((entry) => entry.type !== undefined)?.type;
  expect(type).toBe(canvasTabDefinition);

  // Two types now contribute a body to this seat, so look up by `key` — the first hit is not
  // necessarily the file type's.
  const body = recorded.find((entry) => entry.seat === "sidebar.right.pane.tab" && entry.options?.key === CANVAS_TAB_ID);
  expect(body?.options?.name).toBe("sidebar.right.pane.tab");
  // The whole failure mode: the seat is dispatched with the definition's `id`. Naming the kind
  // here registers successfully and receives nothing, forever.
  expect(body?.options?.key).toBe(CANVAS_TAB_ID);
  expect(body?.options?.key).not.toBe("ui4a-canvas");

  const browser = recorded.find((entry) => entry.seat === "sidebar.right.pane.tab" && entry.options?.key === CANVAS_BROWSER_ID);
  expect(browser?.options?.name).toBe("sidebar.right.pane.tab");
  // The browser is the one that declares the locale namespace, so `t` reaches its body.
  expect(browser?.options?.locale).toBe("ui4aCanvas");
  expect(typeof browser?.options?.inject).toBe("function");
});

test("the body's face resolves cwd for the address's own session", () => {
  const recorded = applyTo(true);
  const body = recorded.find((entry) => entry.seat === "sidebar.right.pane.tab");
  const inject = body?.options?.inject as (id: string) => { cwdOf: (id: string) => string | undefined };
  // `inject` is a factory the framework calls with the tab's session; it must not bake one in.
  const face = inject("s-whatever");
  expect(face.cwdOf("s1")).toBeUndefined();
  expect(face.cwdOf("s-missing")).toBeUndefined();
  expect(typeof face.onCardError).toBe("function");
  expect(typeof face.onCardRendered).toBe("function");
});

test("a host without the sidebar keeps the rest of the plugin", () => {
  // The static `inject` must stay `["sessions", "locale"]`: naming the sidebar there would
  // take inline cards and the prompt down with it on any host that has no right Sidebar.
  const recorded = applyTo(false);
  expect(recorded).toEqual([]);
});

import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { usePersistedState } from "../src/client/runtime/state";

/**
 * `react-dom/server` runs one render, which is enough to exercise the read path — the half that
 * has actually broken. An earlier version stored the *function* when a card passed the lazy
 * initialiser `useState` teaches (`usePersistedState(KEY, () => seed())`), and every screen and
 * the compile were clean; the tracker just rendered empty.
 *
 * The write path needs an effect, which a server render never runs, so it is covered in a browser
 * instead (unmount → remount → the value comes back).
 */
function withStorage<T>(entries: Record<string, string>, body: () => T): T {
  const store = new Map(Object.entries(entries));
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
  try {
    return body();
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", original);
  }
}

// `renderToStaticMarkup` escapes text, so read the value back through a data attribute the
// serializer leaves alone rather than comparing escaped JSON.
const render = (key: string, initial: unknown) => {
  let seen: unknown;
  renderToStaticMarkup(
    createElement(function Probe() {
      const [value] = usePersistedState(key, initial as never);
      seen = value;
      return null;
    }),
  );
  return seen;
};

test("a lazy initialiser is called, not stored", () => {
  expect(withStorage({}, () => render("fresh", () => ({ rows: [1, 2] })))).toEqual({ rows: [1, 2] });
});

test("a stored value wins over the initial", () => {
  expect(withStorage({ "dsh-genui:kept": '{"rows":[9]}' }, () => render("kept", { rows: [] }))).toEqual({ rows: [9] });
});

test("a value someone else wrote that is not JSON falls back rather than throwing", () => {
  expect(withStorage({ "dsh-genui:junk": "not json" }, () => render("junk", { ok: true }))).toEqual({ ok: true });
});

test("no localStorage at all still renders", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "localStorage");
  try {
    expect(render("nostore", 7)).toBe(7);
  } finally {
    if (original !== undefined) Object.defineProperty(globalThis, "localStorage", original);
  }
});

// Two cards that both reach for the obvious key — "todos", "ledger", "settings" — share the same
// entry, so a second tracker opens showing the first one's rows. The namespacing is per plugin,
// not per card, which is why the skill tells the model to name the key after the card.
test("the same key from two cards is the same value", () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
  try {
    store.set("dsh-genui:todos", '["from another card"]');
    expect(render("todos", [])).toEqual(["from another card"]);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", original);
  }
});

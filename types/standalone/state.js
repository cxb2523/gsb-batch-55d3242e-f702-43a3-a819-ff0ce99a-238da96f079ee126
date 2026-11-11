// src/client/runtime/state.ts
import * as React from "react";
var scope = (key) => `dsh-genui:${key}`;
function read(key, initial) {
  const fallback = () => typeof initial === "function" ? initial() : initial;
  try {
    const raw = globalThis.localStorage?.getItem(scope(key));
    return raw === null || raw === undefined ? fallback() : JSON.parse(raw);
  } catch {
    return fallback();
  }
}
function usePersistedState(key, initial) {
  const [value, setValue] = React.useState(() => read(key, initial));
  React.useEffect(() => {
    try {
      globalThis.localStorage?.setItem(scope(key), JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}
export {
  usePersistedState
};

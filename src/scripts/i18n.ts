// Runtime strings for the active locale are injected by Astro into
// `window.__I18N__` in `src/components/Home.astro`.
export const I18N: any = (globalThis as any).__I18N__ || {}

export function fmt(str: string, vars?: Record<string, unknown>): string {
  return String(str).replace(/\{(\w+)\}/g, (_, k) =>
    vars && vars[k] != null ? String(vars[k]) : "",
  )
}

export function tt(path: string, vars?: Record<string, unknown>): string {
  const value = path
    .split(".")
    .reduce<any>((acc, key) => (acc == null ? acc : acc[key]), I18N)
  const str = value == null ? path : String(value)
  return vars ? fmt(str, vars) : str
}

export const langName = (code: string): string => I18N.langNames?.[code] || code

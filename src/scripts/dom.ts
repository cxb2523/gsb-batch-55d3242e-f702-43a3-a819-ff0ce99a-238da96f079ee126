/**
 * Tiny DOM query helpers to avoid repeating `document.querySelector(...)`.
 *
 * `$` returns a single element (typed as `HTMLElement` by default, overridable
 * via the generic), `$$` returns a real array of matched elements.
 */
export function $<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T {
  return scope.querySelector<T>(selector) as T
}

export function $$<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T[] {
  return Array.from(scope.querySelectorAll<T>(selector))
}

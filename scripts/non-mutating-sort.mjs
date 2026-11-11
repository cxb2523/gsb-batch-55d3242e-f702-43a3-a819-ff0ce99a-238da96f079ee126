/**
 * Return a sorted copy on every supported Node runtime.
 *
 * Node 20 added Array.prototype.toSorted, but these development scripts are also
 * documented as direct `node` commands. Keep the non-mutating behavior without
 * requiring that newer method from an older Node runtime.
 */
export const nonMutatingSort = (items, compareFn) => {
  const copy = [...items];
  return typeof copy.toSorted === "function" ? copy.toSorted(compareFn) : Array.prototype.sort.call(copy, compareFn);
};

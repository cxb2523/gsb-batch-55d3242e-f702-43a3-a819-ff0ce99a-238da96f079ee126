/**
 * Four spellings of the same badge, side by side, so the contrast claim can be SEEN.
 *
 * 20 of 29 wave-2 cards write `bg-accent text-white`. Measured on the live harness in both
 * themes and composited against the real token values:
 *
 *     badge                                  light      dark
 *     bg-accent + text-white                  4.23      2.66  FAIL (10px text needs 4.5)
 *     bg-accent + label-primary-foreground    4.23      7.11  AA
 *     state-business-tertiary + label         16.04     9.79  AA
 *     markdown-tag + label                    16.99    13.34  AA
 *
 * `accent` flips WITH the theme (dark gets the lighter blue), so any foreground that also flips
 * with it collapses on one side. `label-primary-foreground` is the one the host publishes for
 * exactly this: it flips AGAINST the theme.
 *
 * Shoot it with `THEME=dark bun scripts/surface-harness.ts <port> test/probes/badge-contrast.ui4a.tsx`
 * plus `bun scripts/shot-card.mjs <port> /tmp/badge 440`.
 */
export default function BadgeContrast() {
  const V = [
    ["white on accent — what 20 of 29 cards ship", "var(--dsw-alias-state-business-primary)", "#fff"],
    ["label-primary-foreground on accent", "var(--dsw-alias-state-business-primary)", "var(--dsw-alias-label-primary-foreground)"],
    ["state-business-tertiary + label-primary", "var(--dsw-alias-state-business-tertiary)", "var(--dsw-alias-label-primary)"],
    ["markdown-tag + label-primary", "var(--dsw-alias-markdown-tag)", "var(--dsw-alias-label-primary)"],
  ] as const;
  return (
    <div className="grid gap-2 p-4 rounded-xl" style={{ background: "var(--dsw-alias-bg-layer-1)" }}>
      {V.map(([name, bg, fg]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: bg, color: fg }}>
            nuevo
          </span>
          <span className="text-xs text-muted">{name}</span>
        </div>
      ))}
    </div>
  );
}

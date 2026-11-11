// Three shapes that are NOT duplicate style keys, and that a looser DUPLICATE-STYLE-KEY reports
// anyway. Measured against the 378-card corpus: dropping the depth guard takes the report from
// 1 to 3, and dropping the "a key follows `{` or `,`" guard takes it to 356.
const base = { padding: 8, background: "var(--dsw-alias-bg-layer-1)" };

export default function Answer() {
  // `padding` appears twice: once as this object's own key, once inside a nested literal in a
  // value. Only a depth-aware count tells them apart.
  return (
    <div style={{ ...base, background: "var(--dsw-alias-bg-layer-2)", padding: 12, gridTemplateColumns: `repeat(${Object.keys({ padding: 1, gap: 2 }).length}, 1fr)` }}>
      {/* a nested object: both `background` keys are legal, one per object */}
      <span style={{ color: "var(--dsw-alias-label-primary)", background: "transparent", transform: `translateY(${base.padding}px)` }}>ok</span>
      {/* a key name appearing inside a VALUE rather than as a key */}
      <span style={{ transition: "background .2s ease, color .2s ease", background: "none" }}>fine</span>
    </div>
  );
}

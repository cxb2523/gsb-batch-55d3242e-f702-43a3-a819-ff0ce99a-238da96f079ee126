const labelStyle = { fontSize: 12, color: "var(--dsw-alias-label-secondary)", letterSpacing: ".04em" };

// `style={labelStyle, {...}}` is a comma operator: `labelStyle` is evaluated, discarded, and
// only the object after the comma is applied. The card renders and the label is unstyled.
export default function Answer() {
  return (
    <div>
      <div style={labelStyle, { marginTop: 14, marginBottom: 6 }}>标准</div>
      <div style={{ ...labelStyle, marginTop: 4 }}>this one is right</div>
    </div>
  );
}

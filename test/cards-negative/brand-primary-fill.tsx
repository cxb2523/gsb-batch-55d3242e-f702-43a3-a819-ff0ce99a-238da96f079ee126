// `--dsw-alias-brand-primary` is a FOREGROUND colour — it equals the body text colour in both
// themes. Filling a button with it and writing white on top gives a white square on dark, with
// invisible text. The accent to fill with is `--dsw-alias-state-business-primary`.
export default function Answer() {
  return (
    <button style={{ background: "var(--dsw-alias-brand-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px" }}>
      开始
    </button>
  );
}

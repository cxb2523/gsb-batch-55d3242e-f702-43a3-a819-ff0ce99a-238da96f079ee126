// `display` twice in one style object: React keeps the last and drops the first silently. It
// looked right because `flex` was what the button wanted — the dead line survives until someone
// edits the wrong one.
export default function Button() {
  return (
    <button style={{ display: "block", padding: "8px 12px", border: "none", display: "flex", alignItems: "center" }}>
      go
    </button>
  );
}

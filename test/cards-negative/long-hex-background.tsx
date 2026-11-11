// The same white surface written long. `#ffffff` and `#fafafa` are what a model produces when
// it is copying a palette rather than typing a shorthand, and they fail in dark mode identically
// — only `#fff` actually occurs in the corpus, so this is what keeps the rest of the list alive.
export default function Panel() {
  return <div style={{ backgroundColor: "#FFFFFF", color: "#111", padding: 12 }}>done</div>;
}

// The `100vh` half of VIEWPORT-UNITS. The card is a component in a chat column or a resizable
// panel, so the window's height is not its own — this reserves a screenful wherever it lands.
export default function Board() {
  return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>nothing yet</div>;
}

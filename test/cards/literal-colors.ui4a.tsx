/**
 * A card whose SUBJECT is colour, where literals are correct and must not be screened.
 *
 * `HARDCODED-BACKGROUND` looks for a near-white fill in a card that uses no design token at
 * all — the signal for "wrote CSS without knowing the theme exists". A colour picker writes
 * `#fff` deliberately: the handle has to stay visible against whatever the user just picked,
 * and no token can follow an arbitrary colour. Taken from a real generated card (a colour
 * picker, 294 lines) reduced to the property.
 *
 * The distinction is worth a card because the obvious screen — "no literal colours" — flags
 * this and is wrong to. A rule about defaults is not a rule about content.
 */
export default function Swatch() {
  const picked = "#ff8a3d"; // the user's colour, not the theme's
  return (
    <div style={{ padding: 16, background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)" }}>
      <div style={{ position: "relative", height: 80, borderRadius: 8, background: picked }}>
        {/* White ring on an arbitrary fill: a token would vanish against half the range. */}
        <div style={{ position: "absolute", left: "40%", top: "50%", width: 16, height: 16, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.35)", transform: "translate(-50%,-50%)" }} />
      </div>
      <output style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{picked}</output>
    </div>
  );
}

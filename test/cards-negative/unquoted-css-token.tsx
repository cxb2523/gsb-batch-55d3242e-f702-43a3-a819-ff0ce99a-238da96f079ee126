import { useState } from "react";

// UNQUOTED-CSS-UNIT, token spelling. `var(--dsw-alias-label-primary)` bare in a style object is a
// call to an undefined `var`, so the file does not parse — same ending as `fontSize: 11px`, and
// the same misleading error position.
//
// This is the arm the PROMPT steers into: the colour rule says take every colour from a
// `--dsw-alias-*` token, so a card writing this is following the rule and forgetting the quotes.
// Measured live — a freshly generated chmod card did exactly this and rendered nothing.
//
// The screen must stay quiet on the `<style>` block below, where the unquoted form is required.
// The unit arm's camelCase discriminator cannot separate them here: `color` is spelled the same
// in CSS and in a style object, which is why this arm anchors inside `style={{` instead.
export default function Perms() {
  const [mode] = useState(755);
  return (
    <div>
      <style>{`.title { color: var(--dsw-alias-label-primary); font-weight: 600 }`}</style>
      <div className="title">权限计算器</div>
      <div style={{ marginBottom: 12, color: var(--dsw-alias-label-primary) }}>{mode}</div>
    </div>
  );
}

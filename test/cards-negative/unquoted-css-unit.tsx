import { useState } from "react";

// UNQUOTED-CSS-UNIT. `11px` is not a JS token, so the FILE does not parse — nothing renders and
// the error points into the JSX (`Expected '</'`), several lines from the actual mistake.
//
// The screen must not fire on the `<style>` block below, where `font-size: 11px` is required.
// A naive match fired on 35 of 39 clean cards; the discriminator is camelCase vs kebab-case.
export default function Cron() {
  const [raw] = useState("* * * * *");
  return (
    <div>
      <style>{`.chip { font-size: 11px; padding: 2px 8px; }`}</style>
      <span style={{ fontSize: 11px }}>{raw}</span>
    </div>
  );
}

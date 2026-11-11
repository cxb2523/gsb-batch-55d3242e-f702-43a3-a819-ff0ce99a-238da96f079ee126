// HARDCODED-COLOUR-CLASS. Both spellings that pin a card to one theme: an arbitrary literal, and
// one of Tailwind's own fixed-palette ramps. Neither follows the app's light/dark switch, so this
// card is white-on-white the moment the reader is in the theme it was not written for.
//
// The screen must not fire on `border-line` / `border-line-2` / `bg-layer-2` above — those are the
// app's own names and merely happen to end in a suffix a lazy `-\d00` pattern would catch.
export default function Panel() {
  return (
    <div className="rounded-lg border border-line-2 bg-layer-2 p-3">
      <div className="bg-[#ffffff] text-[rgb(51,51,51)] p-2">a fixed white card</div>
      <div className="bg-slate-800 text-gray-400 p-2">a ramp that never changes</div>
    </div>
  );
}

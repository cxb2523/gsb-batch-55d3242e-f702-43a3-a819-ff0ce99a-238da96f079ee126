// BRAND-PRIMARY-FILL-CLASS. `brand-primary` is a FOREGROUND colour — it equals the body text
// colour in both themes — so filling with it and writing on top in white is a near-white square
// with invisible text on dark, and near-black with invisible text on light.
//
// It has no short utility name for exactly this reason, so reaching it takes an arbitrary value,
// which is the tell. The screen must stay quiet on the `text-` line below: as a foreground it is
// the correct use, and that is what the reader wanted when they reached for the name.
export default function Callout() {
  return (
    <div className="grid gap-2">
      <div className="bg-[var(--dsw-alias-brand-primary)] text-white rounded-md p-3">important</div>
      <span className="text-[var(--dsw-alias-brand-primary)] font-medium">emphasis, done right</span>
    </div>
  );
}

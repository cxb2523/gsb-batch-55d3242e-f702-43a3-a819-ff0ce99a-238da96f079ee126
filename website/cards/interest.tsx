import katex from "katex";
import NumberFlow from "@number-flow/react";
import { Label, Slider, SliderThumb, SliderTrack } from "react-aria-components";
import { usePersistedState } from "$dsh/state";
import { sendMessage } from "$dsh/chat";

const FORMULA = katex.renderToString("A = P\\left(1 + \\frac{r}{n}\\right)^{nt}", { throwOnError: false });

export default function CompoundInterest() {
  // Persisted: scroll back to this card next week and it still shows the plan you settled on.
  // `?? 8` because a recompile mid-stream can briefly hand back no value, and 0 ** NaN is a blank total.
  const [stored, setYears] = usePersistedState("interest.years", 8);
  const years = Number.isFinite(stored) ? stored : 8;
  const principal = 2000;
  const total = principal * (1 + 0.05 / 12) ** (12 * years);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#ffffff1f] bg-[#232324] p-5 text-[#f9fafb]">
      <link rel="stylesheet" href="https://esm.sh/katex@0.16.22/dist/katex.min.css" />
      <div className="text-[18px] text-[#cfd3d6]" dangerouslySetInnerHTML={{ __html: FORMULA }} />
      <Slider value={years} onChange={setYears} minValue={1} maxValue={30} className="flex flex-col gap-2">
        <div className="flex justify-between text-[13px] text-[#cfd3d6]">
          <Label>$2,000 at 5%, compounded monthly</Label>
          <span className="tabular-nums">{years} yr</span>
        </div>
        <SliderTrack className="relative h-6 w-full">
          <div className="absolute top-[11px] h-[2px] w-full rounded-full bg-[#ffffff29]" />
          <SliderThumb className="top-3 h-5 w-5 rounded-full bg-[#f9fafb] outline-none" />
        </SliderTrack>
      </Slider>
      <div className="flex items-end justify-between">
        <NumberFlow className="text-[32px] font-medium text-[#7aaaff]" value={total} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }} />
        <span className="pb-2 text-[13px] text-[#adb2b8]">+{Math.round((total / principal - 1) * 100)}%</span>
      </div>
      <button onClick={() => sendMessage(`Plan a Tokyo trip with the $${Math.round(total - principal)} it earns`)} className="rounded-xl bg-[#34415b] py-2.5 text-[14px] font-medium text-[#f9fafb] transition-colors hover:bg-[#3d4d6b]">
        Spend the interest on a trip →
      </button>
    </div>
  );
}

import { useState } from "react";
import { Label, Slider, SliderOutput, SliderThumb, SliderTrack, ToggleButton, ToggleButtonGroup } from "react-aria-components";
import NumberFlow from "@number-flow/react";

const TIERS = { hostel: 38, hotel: 120, ryokan: 290 };

export default function TokyoBudget() {
  const [nights, setNights] = useState(4);
  const [tier, setTier] = useState<keyof typeof TIERS>("hotel");
  const stay = nights * TIERS[tier];
  const food = nights * 46;
  const transit = 28 + nights * 9;
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[#ffffff1f] bg-[#232324] p-5 text-[#f9fafb]">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-medium">Tokyo, {nights} nights</h3>
        <span className="text-[13px] text-[#adb2b8]">per person, USD</span>
      </div>
      <Slider value={nights} onChange={setNights} minValue={2} maxValue={10} className="flex flex-col gap-2">
        <div className="flex justify-between text-[13px] text-[#cfd3d6]">
          <Label>Nights</Label>
          <SliderOutput className="tabular-nums" />
        </div>
        <SliderTrack className="relative h-6 w-full">
          {({ state }) => (
            <>
              <div className="absolute top-[11px] h-[2px] w-full rounded-full bg-[#ffffff29]" />
              <div className="absolute top-[11px] h-[2px] rounded-full bg-[#7aaaff]" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
              <SliderThumb className="top-3 h-5 w-5 rounded-full bg-[#f9fafb] shadow-[0_1px_4px_#0008] outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-[#7aaaff]" />
            </>
          )}
        </SliderTrack>
      </Slider>
      <ToggleButtonGroup selectedKeys={[tier]} onSelectionChange={(keys) => setTier([...keys][0] as keyof typeof TIERS)} disallowEmptySelection className="grid grid-cols-3 gap-1 rounded-xl bg-[#1b1b1c] p-1">
        {Object.keys(TIERS).map((key) => (
          <ToggleButton key={key} id={key} className="rounded-lg py-1.5 text-[13px] capitalize text-[#adb2b8] outline-none transition-colors data-[selected]:bg-[#353638] data-[selected]:text-[#f9fafb]">
            {key}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
        <dt className="text-[#adb2b8]">Stay</dt>
        <dd className="text-right tabular-nums">
          <NumberFlow value={stay} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }} />
        </dd>
        <dt className="text-[#adb2b8]">Food</dt>
        <dd className="text-right tabular-nums">
          <NumberFlow value={food} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }} />
        </dd>
        <dt className="text-[#adb2b8]">Metro + airport</dt>
        <dd className="text-right tabular-nums">
          <NumberFlow value={transit} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }} />
        </dd>
        <dt className="border-t border-[#ffffff1f] pt-3 font-medium">Total</dt>
        <dd className="border-t border-[#ffffff1f] pt-3 text-right text-[20px] font-medium text-[#7aaaff] tabular-nums">
          <NumberFlow value={stay + food + transit} format={{ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }} />
        </dd>
      </dl>
    </div>
  );
}

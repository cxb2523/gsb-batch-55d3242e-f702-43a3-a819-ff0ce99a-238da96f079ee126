import { useState } from "react";

// The focus ring removed with nothing put back. The card looks tidy and a keyboard user tabbing
// into the input has no idea they have arrived — the most common single line in the corpus that
// breaks keyboard use, at 76 of 378.
export default function Answer() {
  const [value, setValue] = useState("");
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      style={{ border: "none", background: "transparent", outline: "none", font: "inherit", width: "100%" }}
    />
  );
}

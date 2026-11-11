import { useState } from "react";

// MISSING-REACT-IMPORT, the arm that reaches a reader.
//
// `<Fragment>` beside an `import { useState }` is NOT repaired downstream, so this throws
// `Fragment is not defined` at render: it compiles, it mounts, it paints a blank rectangle.
//
// A HOOK in the same position — `useMemo(...)` with only `useState` imported — is quietly
// repaired: `normalizeGeneratedTsx` extends an existing import with any hook it finds used, and
// inserts the whole line when there is none. It never supplies a JSX component. Measured, after
// guessing the boundary wrong twice; `test/normalize-complete.test.ts` pins all three cases.
export default function Convert() {
  const [unit, setUnit] = useState("m");
  return <Fragment><button onClick={() => setUnit("cm")}>{unit}</button></Fragment>;
}

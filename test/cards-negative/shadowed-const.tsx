import { Legend } from "recharts";

// The `const X = …; export default X` spelling of SHADOWED-EXPORT. The local declaration wins,
// so every <Legend> inside points at this component and it recurses until React throws #185 —
// identical to the `export default function` form, and invisible to a screen that knows only it.
const Legend = () => <div><Legend /></div>;

export default Legend;

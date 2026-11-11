import { useState } from "react";

// The `attribute=` arm of JSX-SUBSCRIPT: `<PANELS[key] title="…" />` rather than a bare
// self-close. Both are illegal JSX; a screen that only knew `/>` would walk past every subscript
// tag that takes props, which is most of them.
const PANELS = { a: ({ title }: { title: string }) => <div>{title}</div> };

export default function Answer() {
  const [key] = useState<"a">("a");
  return <PANELS[key] title="hello" />;
}

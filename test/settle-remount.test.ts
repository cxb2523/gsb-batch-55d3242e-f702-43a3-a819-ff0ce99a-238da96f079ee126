import { test, expect } from "bun:test";
import { parseUi4aSegments } from "../src/client/runtime/segments.ts";
import { deliveryFor } from "../src/client/runtime/GenUISurface.tsx";

const body = "const App = () => <div>hi</div>\nexport default App";
const settle = (streamed: string, settled: string) => deliveryFor(parseUi4aSegments(settled)[0].code, parseUi4aSegments(streamed)[0].code, false).do;

test("the closing fence alone does not re-deliver", () => {
  expect(settle("```ui4a/tsx\n" + body, "```ui4a/tsx\n" + body + "\n```")).toBe("nothing");
});
test("prose after the fence does not re-deliver either", () => {
  expect(settle("```ui4a/tsx\n" + body, "```ui4a/tsx\n" + body + "\n```\n\nEcco!")).toBe("nothing");
});
test("a real last token still re-delivers", () => {
  expect(settle("```ui4a/tsx\n" + body, "```ui4a/tsx\n" + body + "\nexport const x = 1\n```")).toBe("replace");
});

// The worry `trimEnd` raises: it discards trailing whitespace, and whitespace inside a template
// literal is DATA. The reason it cannot reach any is structural rather than lucky — `trimEnd`
// only ever eats the tail of the whole string, and a template literal's own whitespace is closed
// by a backtick, which is not whitespace and therefore a hard stop. Even the worst arrangement,
// a template whose trailing spaces are the last thing in the file, keeps them.
test("trailing whitespace inside a template literal survives the comparison", () => {
  const withTemplate = "export default () => <i/>\nconst TRAILING = `keep me   \n`";
  const streamed = parseUi4aSegments("```ui4a/tsx\n" + withTemplate)[0].code;
  const settled = parseUi4aSegments("```ui4a/tsx\n" + withTemplate + "\n```")[0].code;
  expect(streamed).not.toBe(settled); // they DO differ — by the newline before the fence
  expect(settled.trimEnd()).toEndWith("`keep me   \n`");
  expect(settle("```ui4a/tsx\n" + withTemplate, "```ui4a/tsx\n" + withTemplate + "\n```")).toBe("nothing");
});

// The same question from the other side: a last token that IS whitespace-adjacent must still
// re-deliver. `\n` before the fence is the only difference the settle step is allowed to ignore.
test("a token added at the very end still re-delivers", () => {
  const grown = body + "\nconst after = `x`";
  expect(settle("```ui4a/tsx\n" + body, "```ui4a/tsx\n" + grown + "\n```")).toBe("replace");
});

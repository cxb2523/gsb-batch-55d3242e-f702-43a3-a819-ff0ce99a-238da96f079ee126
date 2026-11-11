import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasReadStatus } from "../src/client/canvas/read-status.tsx";
import { en, zh } from "../src/client/canvas/locales.ts";

for (const dictionary of [en, zh]) {
  const t = ((key: keyof typeof en) => dictionary[key]) as never;
  test(`read states and retry are localized (${dictionary["read.retry"]})`, () => {
    const loading = renderToStaticMarkup(createElement(CanvasReadStatus, { t }));
    expect(loading).toContain(dictionary["read.loading"]);
    expect(loading).not.toContain("button");
    const missing = renderToStaticMarkup(createElement(CanvasReadStatus, { t, retry: () => {} }));
    expect(missing).toContain(dictionary["read.missing"]);
    const failed = renderToStaticMarkup(createElement(CanvasReadStatus, { t, error: new Error("HTTP 403"), retry: () => {} }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(dictionary["read.error"]);
    expect(failed).toContain(dictionary["read.retry"]);
    expect(failed).toContain("HTTP 403");
  });
}

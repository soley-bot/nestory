import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "@/components/ui/badge";

describe("Badge semantic tones", () => {
  it("uses the readable semantic danger surface", () => {
    const html = renderToStaticMarkup(<Badge tone="danger">Blocked</Badge>);

    expect(html).toContain("bg-danger-soft");
    expect(html).toContain("text-danger");
  });

  it("uses the readable semantic warning surface", () => {
    const html = renderToStaticMarkup(<Badge tone="warning">Review</Badge>);

    expect(html).toContain("bg-warning-soft");
    expect(html).toContain("text-warning");
  });
});

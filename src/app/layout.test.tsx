import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "layout-nonce" }),
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  it("applies the request nonce to the inline theme bootstrap", async () => {
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main>Account</main> }),
    );

    expect(html).toContain('<script nonce="layout-nonce">');
    expect(html).toContain("nestory-display-mode:public");
  });
});

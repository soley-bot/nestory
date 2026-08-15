import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AuthCompletePage from "@/app/auth/complete/page";

describe("AuthCompletePage", () => {
  it("requires an explicit user action before consuming a recovery token", async () => {
    const html = renderToStaticMarkup(
      await AuthCompletePage({
        searchParams: Promise.resolve({
          next: "/update-password",
          token_hash: "valid-token-hash",
          type: "recovery",
        }),
      }),
    );

    expect(html).toContain("Confirm password reset");
    expect(html).toContain('action="/auth/confirm"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="token_hash"');
    expect(html).toContain('value="valid-token-hash"');
    expect(html).toContain("Continue to reset password");
    expect(html).not.toContain("Verifying your secure link");
  });
});

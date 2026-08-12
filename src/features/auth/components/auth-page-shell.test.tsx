import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthPageShell } from "@/features/auth/components/auth-page-shell";

describe("AuthPageShell", () => {
  it("does not invent standing context for a focused auth task", () => {
    const html = renderToStaticMarkup(
      <AuthPageShell description="Choose a new password." title="Update password">
        <p>Form</p>
      </AuthPageShell>,
    );

    expect(html).not.toContain("Private workspace");
    expect(html).not.toContain("Continue where the work is.");
    expect(html).not.toContain("auth-shell-context");
  });

  it("uses opaque foreground text for the compact photo-header link", () => {
    const html = renderToStaticMarkup(
      <AuthPageShell
        description="Continue to the workspace."
        switchHref="/"
        switchLabel="Home"
        title="Sign in"
        visualSrc="/images/auth.jpg"
      >
        <p>Form</p>
      </AuthPageShell>,
    );
    const homeLink = html.match(/<a[^>]*href="\/"[^>]*>Home<\/a>/)?.[0];
    const className = homeLink?.match(/class="([^"]+)"/)?.[1] ?? "";

    expect(className.split(" ")).toContain("text-[var(--auth-page-fg)]");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function template(name: string) {
  return readFileSync(`supabase/templates/${name}.html`, "utf8");
}

describe("Supabase Auth email templates", () => {
  it.each([
    ["invite", "invite"],
    ["magic_link", "magiclink"],
    ["recovery", "recovery"],
  ])("%s preserves the token-hash callback contract", (name, type) => {
    const html = template(name);

    expect(html).toContain("{{ .RedirectTo }}");
    expect(html).toContain("{{ .TokenHash }}");
    expect(html).toContain(`type=${type}`);
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });

  it("explains user-owned password creation only in a new-user invitation", () => {
    expect(template("invite")).toContain("create your private password");
    expect(template("magic_link")).toContain(
      "Your current password will not change",
    );
    expect(template("magic_link")).not.toContain("create your private password");
  });

  it("states that workspace access still requires explicit acceptance", () => {
    expect(template("invite")).toContain("review and accept");
    expect(template("magic_link")).toContain("review and accept");
  });
});

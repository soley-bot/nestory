import { describe, expect, it } from "vitest";

import { parseImplicitAuthFragment } from "@/lib/auth/implicit-session";

describe("parseImplicitAuthFragment", () => {
  it("extracts the implicit access and refresh tokens without decoding them", () => {
    expect(
      parseImplicitAuthFragment(
        "#access_token=access.jwt&refresh_token=refresh-token&type=invite",
      ),
    ).toEqual({
      accessToken: "access.jwt",
      refreshToken: "refresh-token",
      type: "invite",
    });
  });

  it("returns a bounded message for provider and malformed-link failures", () => {
    expect(
      parseImplicitAuthFragment(
        "#error=access_denied&error_description=Provider%20details",
      ),
    ).toEqual({
      error: "This email link is invalid or has expired.",
    });
    expect(parseImplicitAuthFragment("#access_token=only-one-token")).toEqual({
      error: "This email link is invalid or has expired.",
    });
  });
});

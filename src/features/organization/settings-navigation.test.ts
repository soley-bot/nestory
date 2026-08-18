import { describe, expect, it } from "vitest";
import {
  getSettingsDestinations,
  getSettingsLandingHref,
} from "@/features/organization/settings-navigation";

describe("settings navigation", () => {
  it("gives Super Admin the complete canonical Settings surface", () => {
    expect(
      getSettingsDestinations("super_admin").map((destination) => destination.href),
    ).toEqual([
      "/settings/organization",
      "/settings/appearance",
      "/settings/branches",
      "/settings/teams",
      "/settings/access",
    ]);
    expect(getSettingsLandingHref("super_admin")).toBe(
      "/settings/organization",
    );
  });

  it("keeps historical Rent policy under Advanced finance", () => {
    expect(
      getSettingsDestinations("finance_manager").map(
        (destination) => destination.href,
      ),
    ).toEqual([]);
    expect(getSettingsLandingHref("finance_manager")).toBeNull();
  });

  it("does not invent Settings access for roles without a Settings capability", () => {
    expect(getSettingsDestinations("finance_member")).toEqual([]);
    expect(getSettingsDestinations("operations_manager")).toEqual([]);
    expect(getSettingsDestinations("operations_member")).toEqual([]);
    expect(getSettingsLandingHref("finance_member")).toBeNull();
  });
});

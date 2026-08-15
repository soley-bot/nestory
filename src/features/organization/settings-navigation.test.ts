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
      "/settings/rent-policy",
      "/settings/access",
    ]);
    expect(getSettingsLandingHref("super_admin")).toBe(
      "/settings/organization",
    );
  });

  it("shows Finance Manager only the setting they can manage", () => {
    expect(
      getSettingsDestinations("finance_manager").map(
        (destination) => destination.href,
      ),
    ).toEqual(["/settings/rent-policy"]);
    expect(getSettingsLandingHref("finance_manager")).toBe(
      "/settings/rent-policy",
    );
  });

  it("does not invent Settings access for roles without a Settings capability", () => {
    expect(getSettingsDestinations("finance_member")).toEqual([]);
    expect(getSettingsDestinations("operations_manager")).toEqual([]);
    expect(getSettingsDestinations("operations_member")).toEqual([]);
    expect(getSettingsLandingHref("finance_member")).toBeNull();
  });
});

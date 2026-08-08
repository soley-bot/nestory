import { describe, expect, it } from "vitest";

import {
  configurationRegistry,
  getConfigurationDefinition,
  getConfigurationDefinitionsByModule,
} from "./registry";

describe("configuration registry", () => {
  it("uses unique stable keys", () => {
    const keys = configurationRegistry.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[a-z_]+\.[a-z_]+$/.test(key))).toBe(true);
  });

  it("requires audit history for business-rule settings", () => {
    const financialRules = getConfigurationDefinitionsByModule("finance");
    const leaseRules = getConfigurationDefinitionsByModule("leases");

    expect([...financialRules, ...leaseRules].every((item) => item.auditRequired)).toBe(true);
  });

  it("resolves definitions by key", () => {
    expect(getConfigurationDefinition("leases.proration_method")?.module).toBe("leases");
    expect(getConfigurationDefinition("unknown.setting")).toBeNull();
  });

  it("does not allow mutable setup settings after go-live", () => {
    const setupSettings = configurationRegistry.filter(
      (definition) => definition.changeFrequency === "setup_once",
    );

    expect(setupSettings.length).toBeGreaterThan(0);
    expect(setupSettings.every((definition) => !definition.safeAfterGoLive)).toBe(true);
  });

  it("assigns ownership only to workspace roles", () => {
    const workspaceRoles = new Set(["super_admin", "operations_manager", "operations_member"]);

    expect(configurationRegistry.every((definition) => workspaceRoles.has(definition.owner))).toBe(
      true,
    );
  });

  it("provides options for every enum setting", () => {
    const enumSettings = configurationRegistry.filter(
      (definition) => definition.valueType === "enum",
    );

    expect(enumSettings.length).toBeGreaterThan(0);
    expect(enumSettings.every((definition) => definition.options.length > 0)).toBe(true);
  });
});

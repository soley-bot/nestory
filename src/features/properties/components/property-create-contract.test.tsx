/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyForm } from "./property-form";

const { createAssetPhotoAction, requirePermission, rpc } = vi.hoisted(() => ({
  createAssetPhotoAction: vi.fn(),
  requirePermission: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/photos/actions", () => ({ createAssetPhotoAction }));
vi.mock("@/features/people/components/person-form", () => ({ PersonForm: () => null }));
vi.mock("@/lib/auth/context", () => ({
  requirePermission,
  requireWorkspaceContext: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

const organizationId = "00000000-0000-4000-8000-000000000001";
const branchId = "90000000-0000-4000-8000-000000000001";
const propertyId = "10000000-0000-4000-8000-000000000001";

// Use the released branch-aware SQL signature, not a permissive RPC mock.
// These overload arguments have no defaults: omission and JSON null differ.
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260822045638_core_domain_mutation_authority.sql",
), "utf8");
const signature = [...migration.matchAll(
  /CREATE OR REPLACE FUNCTION public\.create_property_minimal\(([\s\S]*?)\)\s*RETURNS uuid/g,
)].at(-1)?.[1];
if (!signature || /DEFAULT/i.test(signature)) {
  throw new Error("Review the branch-aware property RPC contract before changing this test.");
}
const requiredArguments = [...signature.matchAll(/\b(p_[a-z_]+)\s+/g)]
  .map(match => match[1]).sort();

beforeEach(() => {
  rpc.mockReset();
  requirePermission.mockReset();
  createAssetPhotoAction.mockReset();
  rpc.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
    const serializedArguments = Object.keys(JSON.parse(JSON.stringify(payload))).sort();
    const matches = name === "create_property_minimal"
      && JSON.stringify(serializedArguments) === JSON.stringify(requiredArguments);
    return matches
      ? { data: propertyId, error: null }
      : { data: null, error: { code: "PGRST202", message: "No matching RPC signature" } };
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", class { disconnect() {} observe() {} unobserve() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ownerless property form to branch-aware RPC contract", () => {
  it.each([true, false])(
    "submits the real form and action with all required SQL arguments (Super Admin: %s)",
    async (isSuperAdmin) => {
      requirePermission.mockResolvedValue({ branchId, isSuperAdmin, organizationId });
      render(<PropertyForm
        onClose={vi.fn()}
        ownerOptions={[]}
        creationBranchOptions={isSuperAdmin ? [{ id: branchId, label: "Phnom Penh" }] : undefined}
      />);
      expect(requiredArguments).toHaveLength(11);
      expect(document.querySelector('input[name="ownerPersonId"]')).toBeNull();
      expect(document.querySelector('input[name="ownerStartedOn"]')).toBeNull();
      expect(document.querySelector('input[name="ownershipPercent"]')).toBeNull();
      fireEvent.change(screen.getByRole("textbox", { name: /Property name/ }), {
        target: { value: "Fixture ownerless property" },
      });
      if (isSuperAdmin) {
        fireEvent.click(screen.getByRole("combobox", { name: /^Branch/ }));
        fireEvent.click(screen.getByRole("option", { name: "Phnom Penh" }));
      }
      fireEvent.click(screen.getByRole("combobox", { name: /Property type/ }));
      fireEvent.click(screen.getByRole("option", { name: "House/Villa" }));
      const form = screen.getByRole<HTMLFormElement>("form", { name: "Add property form" });
      const savedKey = new FormData(form).get("idempotencyKey");
      fireEvent.submit(form);

      await waitFor(() => expect(screen.getByText("Property added.")).toBeTruthy());
      expect(rpc).toHaveBeenCalledExactlyOnceWith("create_property_minimal", {
        p_address: null,
        p_branch_id: branchId,
        p_code: null,
        p_idempotency_key: savedKey,
        p_name: "Fixture ownerless property",
        p_organization_id: organizationId,
        p_owner_ownership_percent: null,
        p_owner_person_id: null,
        p_owner_started_on: null,
        p_property_type: "House/Villa",
        p_registered_date: null,
      });
      expect(requirePermission).toHaveBeenCalledExactlyOnceWith("properties.write");
      expect(createAssetPhotoAction).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: "Open property record" }).getAttribute("href"))
        .toBe(`/properties/${propertyId}`);
    },
  );
});

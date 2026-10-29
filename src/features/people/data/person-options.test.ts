import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";

const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getPersonSelectOptions, getPersonSelectPage } from "./person-options";

describe("complete person options", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());

  it.each([1205, 5000])("keeps all %i eligible people with bounded role pages and ID batches", async (size) => {
    const people = Array.from({ length: size }, (_, index) => ({
      id: `person-${String(index).padStart(5, "0")}`, organization_id: "org", display_name: `Person ${index}`,
      party_type: "individual", primary_email: null, primary_phone: null, archived_at: null,
    }));
    const roles = people.map(person => ({ id: `role-${person.id}`, organization_id: "org", person_id: person.id, role: "tenant", status: "active", archived_at: null }));
    const { client, reads } = createCappedReadHarness({ people: [...people, { ...people[0], id: "foreign", organization_id: "other" }], person_roles: [...roles, { ...roles[0], id: "foreign-role", person_id: "foreign", organization_id: "other" }] }, { apiRowCap: 1000 });
    createSupabaseServerClient.mockResolvedValue(client);

    const options = await getPersonSelectOptions({ organizationId: "org", roles: ["tenant"] });

    expect(options).toHaveLength(size);
    expect(options.at(-1)?.id).toBe(people.at(-1)?.id);
    expect(options.some(option => option.id === "foreign")).toBe(false);
    expect(reads.every(read => read.range && read.range[1] - read.range[0] < 500)).toBe(true);
    expect(reads.filter(read => read.table === "people").every(read => read.filters.some(filter => filter.column === "id" && Array.isArray(filter.value) && filter.value.length <= 100))).toBe(true);
  });

  it("preserves role and archived-person eligibility across a capped response", async () => {
    const { client } = createCappedReadHarness({
      people: ["active", "archived", "inactive-role", "wrong-role"].map(id => ({ id, organization_id: "org", display_name: id, party_type: "individual", primary_email: null, primary_phone: null, archived_at: id === "archived" ? "2026-01-01" : null })),
      person_roles: ["active", "archived", "inactive-role", "wrong-role"].map(id => ({ id, organization_id: "org", person_id: id, role: id === "wrong-role" ? "owner" : "tenant", status: id === "inactive-role" ? "inactive" : "active", archived_at: null })),
    }, { apiRowCap: 1 });
    createSupabaseServerClient.mockResolvedValue(client);
    expect((await getPersonSelectOptions({ organizationId: "org", roles: ["tenant"] })).map(option => option.id)).toEqual(["active"]);
    expect((await getPersonSelectOptions({ organizationId: "org", roles: ["tenant"], includeArchived: true })).map(option => option.id)).toEqual(["active", "archived"]);
  });
});

describe("paged person options", () => {
  const id = "c7010000-0000-4000-8000-000000005000";
  const option = { archived: false, description: "Tenant", id, label: "Last tenant", partyType: "individual", roles: ["tenant"] };

  it("hydrates a selected person independently of the requested search page", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { options: [], selectedOption: option, hasMore: false }, error: null });
    createSupabaseServerClient.mockResolvedValue({ rpc });
    expect(await getPersonSelectPage({ organizationId: "org", roles: ["tenant"], query: "someone else", page: 2, selectedId: id })).toEqual({ options: [], selectedOption: option, hasMore: false });
    expect(rpc).toHaveBeenCalledWith("get_person_select_page", { p_organization_id: "org", p_roles: ["tenant"], p_query: "someone else", p_page: 2, p_selected_id: id });
  });

  it.each([
    { options: [option,option], selectedOption: null, hasMore: false },
    { options: [], selectedOption: { ...option,id: "different" }, hasMore: false },
    { options: Array.from({ length: 26 }, (_, index) => ({ ...option,id: `person-${index}` })), selectedOption: null, hasMore: true },
  ])("rejects malformed or oversized pages", async data => {
    createSupabaseServerClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data, error: null }) });
    await expect(getPersonSelectPage({ organizationId: "org", roles: ["tenant"], selectedId: id })).rejects.toThrow("malformed response");
  });
});

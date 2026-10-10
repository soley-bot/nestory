import { describe, expect, it, vi } from "vitest";
import { createDepositStatementSourceReader } from "./deposit-statement-source-reader";
import { loadStatementTransactionDetails } from "./owner-statement-transaction-details";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = { organizationId: id(1), propertyId: id(2), ownerPersonId: id(3), applicationId: id(4), sourceFingerprint: "a".repeat(64) };
const packet = { ...request, version: 1, purpose: "deposit-statement-display", leaseId: id(5), unitId: id(6), operation: "apply", originalApplicationId: null };
describe("ordinary-session deposit statement binding", () => {
    it("uses the supplied session client and exact source scope", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: packet, error: null });
        expect(await createDepositStatementSourceReader({ rpc })(request)).toEqual(packet);
        expect(rpc).toHaveBeenCalledExactlyOnceWith("get_deposit_statement_source", {
            p_organization_id: id(1), p_property_id: id(2), p_owner_person_id: id(3),
            p_application_id: id(4), p_source_fingerprint: "a".repeat(64),
        });
    });
    it.each([{ data: null, error: null }, { data: packet, error: { code: "42501" } }])("fails closed without a usable authorized response", async (result) => {
        const rpc = vi.fn().mockResolvedValue(result);
        await expect(createDepositStatementSourceReader({ rpc })(request)).rejects.toThrow(/unavailable/);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it("production resolver defaults to the checked RPC and preserves frozen money", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: packet, error: null });
        const model = { ...request, lines: [{ lineNumber: 1, lineKind: "movement", component: "ips_held_owner_cash", signedAmount: "100.00",
                    sources: [{ sourceType: "deposit_rent_application", sourceLineId: id(4), sourceFingerprint: request.sourceFingerprint }] }] };
        const before = structuredClone(model);
        const result = await loadStatementTransactionDetails({ rpc } as unknown as Parameters<typeof loadStatementTransactionDetails>[0], model as unknown as Parameters<typeof loadStatementTransactionDetails>[1], { ownerName: "Owner", organizationName: "Company" }, { properties: [{ id: id(2) }], units: [{ id: id(6), property_id: id(2), unit_number: "A1" }] });
        expect(result[1]).toEqual({ unit: "A1", name: "", category: "Deposit Applied to Rent" });
        expect(model).toEqual(before);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
});

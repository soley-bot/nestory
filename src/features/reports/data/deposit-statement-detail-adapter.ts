import { z } from "zod";
export type DepositStatementRequest = {
    organizationId: string;
    propertyId: string;
    ownerPersonId: string;
    applicationId: string;
    sourceFingerprint: string;
};
/** Server-injected checked source reader; never a browser payload or service fallback. */
export type DepositStatementSourceReader = (request: DepositStatementRequest) => Promise<unknown>;
export type DepositStatementFinance = {
    properties: {
        id: string;
    }[];
    units: {
        id: string;
        property_id: string;
        unit_number: string;
    }[];
};
const packet = z.strictObject({ version: z.literal(1), purpose: z.literal("deposit-statement-display"), organizationId: z.uuid(), propertyId: z.uuid(), ownerPersonId: z.uuid(), applicationId: z.uuid(), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), leaseId: z.uuid(), unitId: z.uuid().nullable(), operation: z.enum(["apply", "full-reversal"]), originalApplicationId: z.uuid().nullable() });
const requestSchema = packet.pick({ organizationId: true, propertyId: true, ownerPersonId: true, applicationId: true, sourceFingerprint: true });
export async function resolveDepositStatementDetail(request: DepositStatementRequest, finance: DepositStatementFinance, reader?: DepositStatementSourceReader): Promise<{
    unit: string;
    name: string;
    category: string;
}> {
    request = requestSchema.parse(request);
    if (!reader || !finance.properties.some(p => p.id === request.propertyId))
        throw Error("Deposit statement source is unavailable in the authorized finance context.");
    const p = packet.parse(await reader(request));
    for (const key of ["organizationId", "propertyId", "ownerPersonId", "applicationId", "sourceFingerprint"] as const)
        if (p[key] !== request[key])
            throw Error("Deposit statement source identity or fingerprint mismatch.");
    if ((p.operation === "apply" && p.originalApplicationId !== null) || (p.operation === "full-reversal" && (!p.originalApplicationId || p.originalApplicationId === p.applicationId)))
        throw Error("Deposit statement reversal identity is invalid.");
    const u = p.unitId === null ? null : finance.units.find(u => u.id === p.unitId && u.property_id === p.propertyId);
    if (p.unitId !== null && (!u || !u.unit_number))
        throw Error("Deposit statement unit is unavailable in the authorized finance context.");
    return { unit: u?.unit_number ?? "Property-level", name: "", category: p.operation === "apply" ? "Deposit Applied to Rent" : "Deposit Rent Reversal" };
}

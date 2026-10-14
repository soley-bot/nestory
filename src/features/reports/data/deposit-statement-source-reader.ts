import type { DepositStatementSourceReader } from "./deposit-statement-detail-adapter";
export type DepositStatementRpcClient = {
    rpc(name: "get_deposit_statement_source", args: {
        p_organization_id: string;
        p_property_id: string;
        p_owner_person_id: string;
        p_application_id: string;
        p_source_fingerprint: string;
    }): PromiseLike<{
        data: unknown;
        error: unknown;
    }>;
};
/** Uses the existing request's ordinary session, never a privileged client. */
export function createDepositStatementSourceReader(client: DepositStatementRpcClient): DepositStatementSourceReader {
    return async (request) => {
        if (typeof client.rpc !== "function")
            throw new Error("Deposit statement source is unavailable.");
        const result = await client.rpc("get_deposit_statement_source", {
            p_organization_id: request.organizationId, p_property_id: request.propertyId,
            p_owner_person_id: request.ownerPersonId, p_application_id: request.applicationId,
            p_source_fingerprint: request.sourceFingerprint,
        });
        if (result.error || !result.data)
            throw new Error("Deposit statement source is unavailable in the authorized finance context.");
        return result.data;
    };
}

import { describe, expect, it, vi } from "vitest";

import {
  loadOwnerStatementPublication,
  mapOwnerStatementPublicationPayload,
} from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";

describe("owner statement canonical publication model", () => {
  it("maps exact decimal strings and immutable frozen source order", () => {
    const model = mapOwnerStatementPublicationPayload(
      structuredClone(ownerStatementPublicationPayload),
    );
    expect(model.statementNumber).toBe("OS-202608-300000000000");
    expect(model.lines.map((line) => line.signedAmount)).toEqual([
      "1250.00", "1250.00",
    ]);
  });

  it("rejects numeric money instead of crossing the authority boundary", () => {
    const payload = structuredClone(ownerStatementPublicationPayload) as unknown as {
      lines: Array<{ signed_amount: unknown }>;
    };
    payload.lines[0]!.signed_amount = 1250;
    expect(() => mapOwnerStatementPublicationPayload(payload)).toThrow(
      "canonical decimal string",
    );
  });

  it("rejects a reordered or duplicate frozen line sequence", () => {
    const payload = structuredClone(ownerStatementPublicationPayload) as unknown as {
      lines: unknown[];
    };
    payload.lines.reverse();
    expect(() => mapOwnerStatementPublicationPayload(payload)).toThrow(
      "strict frozen order",
    );
  });

  it("loads only through the publication RPC and never a live finance loader", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: structuredClone(ownerStatementPublicationPayload), error: null,
    });
    const model = await loadOwnerStatementPublication(
      { rpc }, ownerStatementPublicationPayload.organization_id,
      ownerStatementPublicationPayload.publication_id,
    );
    expect(model.publicationId).toBe(ownerStatementPublicationPayload.publication_id);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_owner_statement_publication", {
      p_organization_id: ownerStatementPublicationPayload.organization_id,
      p_publication_id: ownerStatementPublicationPayload.publication_id,
    });
  });
});

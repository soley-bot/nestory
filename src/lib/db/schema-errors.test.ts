import { describe, expect, it } from "vitest";
import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";

describe("isMissingSchemaObjectMessage", () => {
  it("detects Supabase schema-cache misses for optional tables", () => {
    expect(
      isMissingSchemaObjectMessage(
        "Could not find the table 'public.lease_terms' in the schema cache",
        ["lease_terms"],
      ),
    ).toBe(true);
  });

  it("detects Supabase schema-cache misses for generated columns", () => {
    expect(
      isMissingSchemaObjectMessage(
        "Could not find the 'primary_tenant_person_id' column of 'leases' in the schema cache",
        ["primary_tenant_person_id"],
      ),
    ).toBe(true);
  });

  it("does not treat permission errors as missing schema", () => {
    expect(
      isMissingSchemaObjectMessage("permission denied for table lease_terms", [
        "lease_terms",
      ]),
    ).toBe(false);
  });

  it("requires the expected object name to match", () => {
    expect(
      isMissingSchemaObjectMessage(
        "Could not find the table 'public.lease_terms' in the schema cache",
        ["people"],
      ),
    ).toBe(false);
  });
});

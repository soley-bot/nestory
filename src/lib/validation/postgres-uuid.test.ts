import { describe, expect, it } from "vitest";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

describe("PostgreSQL UUID validation", () => {
  const schema = postgresUuid("Choose a database record.");

  it.each([
    "10000000-0000-0000-0000-000000000001",
    "00000000-0000-4000-8000-000000000001",
  ])("accepts UUID-shaped PostgreSQL identifier %s", (identifier) => {
    expect(schema.safeParse(identifier)).toMatchObject({ success: true });
  });

  it.each([
    "10000000-0000-0000-0000-00000000000",
    "10000000-0000-0000-0000-00000000000g",
    "not-a-uuid",
  ])("rejects malformed identifier %s with caller-provided guidance", (identifier) => {
    const result = schema.safeParse(identifier);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Choose a database record.");
    }
  });
});

import { describe, expect, it } from "vitest";
import { copyFinancialGeneration, financialFormValues, financialGenerationHeaders, financialWriteContextSchema, financialWriteError, FINANCIAL_GENERATION_FIELD, FINANCIAL_GENERATION_HEADER } from "./financial-write-context";

describe("financial session transport", () => {
  it("keeps hidden lifecycle metadata out of strict business validation without ignoring other fields", () => {
    const data = new FormData(); data.set("__financialGeneration", "2"); data.set("$ACTION_ID", "internal"); data.set("unexpected", "must still be validated");
    expect(financialFormValues(data)).toEqual({ unexpected: "must still be validated" });
    expect(financialGenerationHeaders(data)).toEqual({ [FINANCIAL_GENERATION_HEADER]: "2" });
  });
  it("forwards only the generation carried by the original form", () => {
    const original = new FormData(); original.set(FINANCIAL_GENERATION_FIELD, "7");
    const forwarded = copyFinancialGeneration(original, new FormData());
    original.set(FINANCIAL_GENERATION_FIELD, "8");
    expect(financialGenerationHeaders(forwarded)).toEqual({ [FINANCIAL_GENERATION_HEADER]: "7" });
  });
  it.each(["", "-1", "01", "1.5", "1e3", "2147483648", "1\n", "current"])("does not turn malformed generation %j into an allowed request", (value) => {
    const data = new FormData(); data.set(FINANCIAL_GENERATION_FIELD, value);
    expect(financialGenerationHeaders(data)).toEqual({});
  });
  it("does not infer a current generation for missing intent", () => {
    expect(financialGenerationHeaders()).toEqual({});
    expect(financialGenerationHeaders(new FormData())).toEqual({});
  });
  it("rejects inconsistent status data instead of treating it as an open session", () => {
    expect(financialWriteContextSchema.safeParse({ generation: 0, status: "frozen", financial_start_date: null, enforced: false }).success).toBe(false);
    expect(financialWriteContextSchema.safeParse({ generation: 1, status: "open", financial_start_date: null, enforced: true }).success).toBe(false);
  });
  it("explains stale intent, freeze, and cutoff failures", () => {
    expect(financialWriteError("financial_intent_retired")).toContain("start a new entry");
    expect(financialWriteError("financial_writes_frozen")).toContain("paused");
    expect(financialWriteError("financial_date_before_start")).toContain("start date");
  });
});

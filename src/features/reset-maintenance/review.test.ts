import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseSessionReview, MAX_REVIEW_BYTES, RESET_STAGE_LABELS } from "./review";
import { reviewFixture } from "./review.test-fixtures";

describe("Pilot session review file", () => {
  it.each(Object.keys(RESET_STAGE_LABELS) as (keyof typeof RESET_STAGE_LABELS)[])("accepts the exact reviewed %s stage", action => {
    const review = reviewFixture(action);
    expect(parseSessionReview(JSON.stringify(review))).toEqual(review);
  });
  it("uses the existing transport canonical digest and v4 semantic shape", () => {
    const review = reviewFixture();
    const digest = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { readFileSync } from 'node:fs';
      import { digestJson } from './scripts/pilot-finance-reset-hosted-transport-protocol.mjs';
      import { assertEmptyBooksContinuation } from './scripts/pilot-finance-reset-executor-plan.mjs';
      const binding=JSON.parse(readFileSync(0,'utf8'));
      assertEmptyBooksContinuation(binding.continuation_semantic);
      process.stdout.write(digestJson(binding));
    `], { input: JSON.stringify(review.binding), encoding: "utf8", timeout: 10000 });
    expect(digest).toBe(review.bindingSha256);
  });
  it.each([
    ["unknown action", (r: Record<string, unknown>) => { r.action = "delete"; }],
    ["extra SQL", (r: Record<string, unknown>) => { r.sql = "select 1"; }],
    ["credential", (r: Record<string, unknown>) => { r.token = "secret"; }],
    ["endpoint", (r: Record<string, unknown>) => { r.url = "https://example.invalid"; }],
  ])("rejects %s", (_label, mutate) => {
    const review = reviewFixture(); (mutate as (v: unknown) => void)(review);
    expect(parseSessionReview(JSON.stringify(review))).toBeNull();
  });
  it("rejects foreign, unbounded, duplicate, legacy and cross-phase bindings", () => {
    const source = JSON.stringify(reviewFixture());
    for (const changed of [
      source.replace('"version":4', '"version":3'),
      source.replace('"project_ref":"pfvmztxktkwyewvxfgot"', '"project_ref":"otherproject"'),
      source.replace('"target_generation":1', '"target_generation":3'),
      source.replace('"action":"execute"', '"action":"execute-recovery"'),
      source.replace('"disposition":"preserve-unbilled"', '"disposition":"rebuild"'),
      source.replace('"execution_business_date":"2026-10-27"', '"execution_business_date":"2026-11-01"'),
      " ".repeat(MAX_REVIEW_BYTES + 1),
    ]) expect(parseSessionReview(changed)).toBeNull();
    const duplicate = reviewFixture(); duplicate.binding.continuation_semantic.leases.push(duplicate.binding.continuation_semantic.leases[0]);
    expect(parseSessionReview(JSON.stringify(duplicate))).toBeNull();
  });
});

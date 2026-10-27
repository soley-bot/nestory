import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseSessionReview, MAX_REVIEW_BYTES, RESET_STAGE_LABELS } from "./review";
import { reviewFixture, soleAdministratorReviewFixture } from "./review.test-fixtures";

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

it("accepts a bound sole-maker declaration and refuses a fake reviewer or wider transition",()=>{
 const r=soleAdministratorReviewFixture();expect(parseSessionReview(JSON.stringify(r))).toEqual(r);
 for(const patch of [{reviewer_actor_id:r.binding.continuation_semantic.actor_id},{approval_policy:"other"},{version:3},{organization_id:r.binding.operation_id}]){
  const changed={...r,zeroPlanText:JSON.stringify({...JSON.parse(r.zeroPlanText!),...patch})};expect(parseSessionReview(JSON.stringify(changed))).toBeNull();
 }
 const wide=structuredClone(r);wide.binding.source_generation=1;wide.binding.target_generation=2;expect(parseSessionReview(JSON.stringify(wide))).toBeNull();
});
it("requires raw plan text for marked and unmarked v4 files",()=>{
 for(const review of [reviewFixture(),soleAdministratorReviewFixture()]){
  const {zeroPlanText,...omitted}=review;
  expect(zeroPlanText.length).toBeGreaterThan(0);
  expect(parseSessionReview(JSON.stringify(omitted))).toBeNull();
 }
});

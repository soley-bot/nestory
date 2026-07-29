import { describe, expect, it } from "vitest";
import { getPeopleMutationErrorMessage } from "@/features/people/people-action-errors";

describe("people action errors", () => {
  it("maps active Lease-role archive denial by its stable detail code", () => {
    expect(
      getPeopleMutationErrorMessage({
        details: "relationship_transition_required",
        message: "localized or revised database message",
      }),
    ).toContain("End or cancel the open Lease role");
  });

  it("does not infer a transition code from an unrelated message", () => {
    expect(
      getPeopleMutationErrorMessage({
        details: null,
        message: "relationship_transition_required in unrelated prose",
      }),
    ).not.toContain("End or cancel the open Lease role");
  });
});

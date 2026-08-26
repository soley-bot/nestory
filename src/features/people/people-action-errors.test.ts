import { describe, expect, it } from "vitest";
import { getPeopleMutationErrorMessage } from "@/features/people/people-action-errors";

describe("people action errors", () => {
  it.each(["archive", "create", "restore", "update"] as const)(
    "maps an exact database step-up denial for %s without hiding other permission errors",
    (operation) => {
      expect(
        getPeopleMutationErrorMessage(
          {
            code: "42501",
            details: null,
            message: "Privileged email verification required",
          },
          operation,
        ),
      ).toBe(
        "Verify this signed-in session by email, then retry saving.",
      );
    },
  );

  it("maps active Lease-role archive denial by its stable detail code", () => {
    expect(
      getPeopleMutationErrorMessage(
        {
          details: "relationship_transition_required",
          message: "localized or revised database message",
        },
        "archive",
      ),
    ).toContain("End or cancel the open Lease role");
  });

  it("does not infer a transition code from an unrelated message", () => {
    expect(
      getPeopleMutationErrorMessage(
        {
          details: null,
          message: "relationship_transition_required in unrelated prose",
        },
        "archive",
      ),
    ).not.toContain("End or cancel the open Lease role");
  });

  it("does not show archive recovery copy for another operation", () => {
    expect(
      getPeopleMutationErrorMessage(
        {
          details: "relationship_transition_required",
          message: "localized or revised database message",
        },
        "update",
      ),
    ).toBe("We could not update the person. Please check the fields and try again.");
  });

  it.each([
    ["create", "duplicate key", "That person or role already exists."],
    ["update", "row-level security", "access to update this person"],
    ["archive", "Not authorized", "access to archive this person"],
    ["restore", "Person not found", "We could not find that person."],
    ["restore", "unexpected database failure", "could not restore the person"],
  ] as const)(
    "maps the %s operation without misleading fallback copy",
    (operation, message, expectedCopy) => {
      expect(
        getPeopleMutationErrorMessage({ details: null, message }, operation),
      ).toContain(expectedCopy);
    },
  );
});

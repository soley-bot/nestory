import { describe, expect, it } from "vitest";
import { getSelectedDocument } from "@/features/documents/document-selection";

const documents = [{ id: "first" }, { id: "second" }];

describe("getSelectedDocument", () => {
  it("falls back to the first document only for normal list views", () => {
    expect(
      getSelectedDocument({
        documents,
        selectedDocumentId: "missing",
      }),
    ).toBe(documents[0]);
  });

  it("does not select the first document when an exact link misses", () => {
    expect(
      getSelectedDocument({
        documents,
        focusedDocumentId: "missing",
        selectedDocumentId: "missing",
      }),
    ).toBeNull();
  });

  it("keeps user selection after an exact link misses", () => {
    expect(
      getSelectedDocument({
        documents,
        focusedDocumentId: "missing",
        selectedDocumentId: "second",
      }),
    ).toBe(documents[1]);
  });
});

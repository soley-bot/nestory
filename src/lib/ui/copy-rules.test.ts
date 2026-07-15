import { describe, expect, it } from "vitest";

import { instinctiveCopyRules } from "./copy-rules";

describe("instinctive UI copy rules", () => {
  it("prohibits tutorial narration for instinctive actions", () => {
    expect(instinctiveCopyRules.prohibitedTutorialNarration).toEqual([
      "Select a row to",
      "Double-click to",
      "Use the filters above",
      "Click the button",
      "This page allows you to",
    ]);
  });

  it("permits explanations only for operator-relevant context", () => {
    expect(instinctiveCopyRules.permittedExplanationReasons).toEqual([
      "consequence",
      "permission",
      "risk",
      "accounting-meaning",
      "irreversible-action",
      "cross-team-handoff",
    ]);
  });

  it("requires labels for controls and icon actions", () => {
    expect(instinctiveCopyRules.requiredSemantics).toEqual({
      formControls: "visible-label",
      iconActions: "accessible-name",
    });
  });
});

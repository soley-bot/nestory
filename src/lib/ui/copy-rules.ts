export const instinctiveCopyRules = {
  prohibitedTutorialNarration: [
    "Select a row to",
    "Double-click to",
    "Use the filters above",
    "Click the button",
    "This page allows you to",
  ],
  permittedExplanationReasons: [
    "consequence",
    "permission",
    "risk",
    "accounting-meaning",
    "irreversible-action",
    "cross-team-handoff",
  ],
  requiredSemantics: {
    formControls: "visible-label",
    iconActions: "accessible-name",
  },
  publicMarketingExclusions: ["src/features/marketing/"],
} as const;

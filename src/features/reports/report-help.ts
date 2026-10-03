import type { PageHelpContent } from "@/components/help/page-help-content";

export const unitProfitLossHelp: PageHelpContent = {
  title: "Profit & loss detail",
  purpose: "Review recognized owner income and expenses for the selected month. Owner funding is shown separately.",
  steps: [
    "Choose the month, property and unit, then apply the filters.",
    "Expand an account to review its entries and open available source links.",
    "Review any warnings, then export the filtered report as PDF or Excel.",
  ],
  example: "September rent recognized in September and paid in October stays in September's accrual profit. Its payment date does not move that income to October.",
  questions: [
    { question: "Can I switch to Cash?", answer: "Not yet. This report currently uses Accrual. Cash selection is not available." },
    { question: "Is profit money available to withdraw?", answer: "No. Income and expenses can be recognized before payment. Owner funding and opening account activity are shown separately and are not an available cash balance." },
    { question: "Do contributions or deposits increase profit?", answer: "No. Owner funding and security deposit custody are outside operating profit." },
    { question: "What about rent collected directly by an owner?", answer: "It remains owner income, but it does not increase cash held by management." },
    { question: "Why is opening activity unavailable for a unit?", answer: "Some property account activity may not be assigned to a unit. Select all units for the property-level view. Nestory does not guess how to allocate unassigned activity." },
  ],
  terms: [
    { term: "Accrual", meaning: "Income and expenses recognized by the recorded invoice or cost date, even before payment." },
    { term: "Net operating income", meaning: "Recognized income minus recognized expenses. Pending expenses are excluded." },
    { term: "Opening account activity", meaning: "Recorded property-account entries before the selected month. This is not cash available for withdrawal." },
  ],
};

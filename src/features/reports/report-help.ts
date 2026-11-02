import type { PageHelpContent } from "@/components/help/page-help-content";

export const unitProfitLossHelp: PageHelpContent = {
  title: "Profit & loss detail",
  purpose: "Review recognized owner income and expenses for the selected month. Owner funding is shown separately.",
  steps: [
    "Choose the month and property, then apply the filters. Select units to download a separate PDF or Excel file for each one.",
    "Expand an account to review its entries and open available source links.",
    "Review any warnings, then export the filtered report as PDF or Excel.",
  ],
  example: "September rent recognized in September and paid in October stays in September's accrual profit. Its payment date does not move that income to October.",
  questions: [
    { question: "Can I switch to Cash?", answer: "Not yet. This report currently uses Accrual. Cash selection is not available." },
    { question: "Is profit money available to withdraw?", answer: "No. Income and expenses can be recognized before payment. Owner funding and opening account activity are shown separately and are not an available cash balance." },
    { question: "Do contributions or deposits increase profit?", answer: "No. Owner funding and security deposit custody are outside operating profit." },
    { question: "What about rent collected directly by an owner?", answer: "It remains owner income, but it does not increase cash held by management." },
    { question: "How are shared property costs handled?", answer: "Separate unit reports include only income and expenses assigned to that unit. Unassigned property transactions are excluded and noted. Review the property in Owner activity before sharing reports." },
    { question: "Why is opening activity unavailable for a unit?", answer: "Some property account activity may not be assigned to a unit. Review the property in Owner activity. Nestory does not guess how to allocate unassigned activity." },
  ],
  terms: [
    { term: "Accrual", meaning: "Income and expenses count by invoice or cost date, even before payment." },
    { term: "Net operating income", meaning: "Recognized income minus recognized expenses. Pending expenses are excluded." },
    { term: "Opening account activity", meaning: "Recorded property-account entries before the selected month. This is not cash available for withdrawal." },
  ],
};

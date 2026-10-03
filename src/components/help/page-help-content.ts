export type PageHelpContent = {
  title: string;
  purpose: string;
  steps: readonly [string, string, string];
  example: string;
  questions: readonly { question: string; answer: string }[];
  terms?: readonly { term: string; meaning: string }[];
  related?: readonly PageHelpContent[];
};

export const depositHelp: PageHelpContent = {
  title: "Deposits",
  purpose: "Review and record the security deposit for a lease.",
  steps: [
    "Open a lease and choose Manage deposit or Settle deposit under Rent & deposit.",
    "Review the required amount, held balance, and recorded activity.",
    "If available, choose an activity and liability account, enter the date and amount, then save.",
  ],
  example: "To record money returned to a tenant, choose Deposit refunded and enter the amount actually returned.",
  questions: [
    { question: "Why are some activities missing?", answer: "Options depend on your permissions, the held balance, and whether the lease is archived. An archived lease with a held balance offers refunds only." },
    { question: "Does recording a refund send money?", answer: "No. This records deposit activity in Nestory; it does not transfer money to the tenant." },
  ],
  terms: [{ term: "Held balance", meaning: "The deposit amount still held after recorded receipts, returns, and other deposit activity." }],
};

const dashboard: PageHelpContent = {
  title: "Dashboard",
  purpose: "Get a portfolio overview and find work that needs attention.",
  steps: ["Review the portfolio metrics and Attention items.", "Choose a property and month for the cash-flow view.", "Open a linked item to review its source records."],
  example: "Choose one property and September to review its recorded cash flow for that month.",
  questions: [{ question: "What if the workspace is empty?", answer: "Start by adding a property, then add or import units, people, and leases." }, { question: "What does Actual cash flow include?", answer: "It shows recorded ledger activity. It does not include unrecorded expected payments." }],
  terms: [{ term: "Ledger activity", meaning: "Recorded financial entries used to build the cash-flow view." }],
};

const properties: PageHelpContent = {
  title: "Properties",
  purpose: "Find properties and review their linked units and operating records.",
  steps: ["Use the search and filters to find a property.", "Open the property to review its details and linked records.", "If available, use Add property or the record's edit action to save changes."],
  example: "Search for a property name, open it, then review its units.",
  questions: [{ question: "Why is a property missing?", answer: "Check the current search and filters. Your workspace access also limits which records you can see." }, { question: "How do I add units?", answer: "Use Add unit in the Units register and select its property." }],
};

const units: PageHelpContent = {
  title: "Units",
  purpose: "Manage units within properties and review their lease and operating details.",
  steps: ["Search or filter the Units register.", "Open a unit to review its property and related records.", "If available, choose Add unit or edit, select the property, and save."],
  example: "Add a unit to an existing property before linking it to a lease.",
  questions: [{ question: "Why can't I change the unit's operating status?", answer: "An active lease locks the unit's operating state in the edit form." }, { question: "Why can't I find a unit?", answer: "Check the search, filters, and property selection before adding another record." }],
};

const people: PageHelpContent = {
  title: "People",
  purpose: "Find and manage tenant, owner, vendor, and staff records.",
  steps: ["Choose the relevant people register and use its search or filters.", "Open a person to review their contact details and roles.", "If available, use the add or edit action and save the record."],
  example: "Find an existing tenant record before creating a lease for that tenant.",
  questions: [{ question: "Does a staff record grant sign-in access?", answer: "Workspace access is managed separately in Settings → Access." }, { question: "Why can't I add a person?", answer: "The add action depends on your permissions and the register you are viewing." }],
  terms: [{ term: "People roles", meaning: "A person's relationship to the workspace, such as tenant, owner, vendor, or staff. These are separate from sign-in permissions." }],
};

const leases: PageHelpContent = {
  title: "Leases",
  purpose: "Review who rents a unit, the lease dates, and its rent and deposit records.",
  steps: ["Search or filter the Leases register and open a lease.", "Review the tenant, unit, dates, and Rent & deposit section.", "Use an available lease action, or open the linked rent or deposit workflow."],
  example: "Open a lease and review its rent and deposit before recording new activity.",
  questions: [{ question: "Where do I record rent payments?", answer: "Use Finance → Rent & collections and open the relevant tenant invoice." }, { question: "Why is an action unavailable?", answer: "Lease status, existing records, and your permissions determine the available actions. Read any visible blocker before continuing." }],
  related: [depositHelp],
};

const rent: PageHelpContent = {
  title: "Rent & collections",
  purpose: "Review tenant invoices and record rent payments.",
  steps: ["Use the invoice filters to find the tenant and rent period.", "Open the invoice and review its outstanding amount.", "If available, choose Record tenant payment, complete the payment details, and save."],
  example: "Find the tenant's September invoice before recording the September payment.",
  questions: [{ question: "Why is rent missing?", answer: "Check the filters and lease billing setup. Rent generation issues appear in finance work when available." }, { question: "Can I correct an existing payment?", answer: "Only available correction actions can be used. Review the visible consequences and any blocker before confirming." }],
  terms: [{ term: "Outstanding amount", meaning: "The amount still due on the invoice after recorded payments and adjustments." }],
};

const finance: PageHelpContent = {
  title: "Finance",
  purpose: "Review finance work and open the relevant rent, expense, or owner account records.",
  steps: ["Choose the finance section for the work you need to review.", "Use its filters and open the relevant source record.", "Review details, then use an available action and check the saved result."],
  example: "Open Rent & collections to find a tenant invoice, or Expenses to review a property cost.",
  questions: [{ question: "Why don't I see every action?", answer: "Your permissions and the record's current status determine the available actions." }, { question: "How do I check a transaction?", answer: "Open its details and review the linked source record and recorded history where available." }],
};

const expenses: PageHelpContent = {
  title: "Expenses",
  purpose: "Record and review property expenses and recoverable costs.",
  steps: ["Use the expense filters and open the relevant record.", "If available, choose Record property expense or Record recoverable cost.", "Complete the cost details, submit, and review the resulting status."],
  example: "Record a property repair with the correct property and supporting evidence.",
  questions: [{ question: "Why isn't an expense approved yet?", answer: "Submitted expenses can require review. Check the status and available review action." }, { question: "How do I correct an expense?", answer: "Use the available correction action and read its confirmation. The available action depends on the expense's status and your permissions." }],
  terms: [{ term: "Recoverable cost", meaning: "A cost recorded for recovery from the responsible tenant or owner." }],
};

const maintenance: PageHelpContent = {
  title: "Maintenance",
  purpose: "Find maintenance work and review its status, assignment, and property or unit.",
  steps: ["Choose the maintenance register and use its search or filters.", "Open an item to review its details, assignee, and due date.", "Use an available edit or workflow action, then check the updated status."],
  example: "Filter open cases for a property and review who is assigned to the repair.",
  questions: [{ question: "Why isn't my item listed?", answer: "Check the current queue, status, month, and other filters, including archived records." }, { question: "Where do I review repair costs?", answer: "The item shows estimate and actual cost details where recorded. Finance handles the associated expense records." }],
};

const reports: PageHelpContent = {
  title: "Reports",
  purpose: "Choose a report to review records and export the results.",
  steps: ["Choose a report from the directory.", "Set the report's filters and review its results.", "Use an available export action to download the report."],
  example: "Choose Rent collections, set the period, and review the results before exporting.",
  questions: [{ question: "Where are official owner statements?", answer: "The Reports directory links to saved official owner statements when your access allows it." }],
};

const settings: PageHelpContent = {
  title: "Settings",
  purpose: "Manage workspace details, appearance, structure, and access where your role allows it.",
  steps: ["Choose the settings section you need.", "Review the current values and make your changes.", "Use Save changes when shown and check the saved status."],
  example: "Open Appearance to review the workspace theme and branding settings.",
  questions: [{ question: "Are edits saved immediately?", answer: "Sections with a Save changes control keep a draft until you save. Discard removes those unsaved edits." }, { question: "Where is my own profile?", answer: "Open Account to review your linked profile and access scope." }],
};

const account: PageHelpContent = {
  title: "Account & profile",
  purpose: "Review your linked staff profile, sign-in identity, and workspace access.",
  steps: ["Review the profile details and sign-in email.", "Check your access level, scope, and linked staff record.", "Use Set or change password if you need email-based password recovery."],
  example: "Check Access scope to see whether your account is limited to a branch.",
  questions: [{ question: "Can I edit my profile here?", answer: "This page displays your profile. Ask an administrator to update or link the staff record if needed." }, { question: "Why are there two emails?", answer: "Profile email belongs to the linked person record. The security email is the sign-in identity." }],
};

const imports: PageHelpContent = {
  title: "Imports",
  purpose: "Upload a CSV, review its rows, and import the ready records.",
  steps: ["Choose the import type and download its template if needed.", "Upload a CSV and check the column matches and row issues.", "Import the ready rows, then review the result and fix blocked rows."],
  example: "Import properties before units, and create the linked units and tenant records before importing leases.",
  questions: [{ question: "Are blocked rows imported?", answer: "Only ready rows are written. Blocked rows remain for review and correction." }, { question: "Which files are supported?", answer: "Upload a CSV of 12 MB or smaller. Each commit supports up to 500 valid rows." }],
  terms: [{ term: "Column matches", meaning: "The mapping between columns in your CSV and the fields Nestory needs for this import type." }],
};

const rootHelp: Record<string, PageHelpContent> = {
  overview: dashboard,
  properties,
  units,
  people,
  tenants: people,
  owners: people,
  vendors: people,
  staff: people,
  leases,
  "rent-income": rent,
  finance,
  "bills-expenses": expenses,
  balances: finance,
  "petty-cash": finance,
  ledger: finance,
  maintenance,
  tasks: maintenance,
  "recurring-tasks": maintenance,
  inspections: maintenance,
  "work-orders": maintenance,
  settings,
  account,
  import: imports,
};

export function getPageHelp(pathname: string | null): PageHelpContent | undefined {
  if (!pathname) return undefined;
  if (pathname === "/reports" || pathname === "/reports/") return reports;
  const root = pathname.split("/")[1];
  return rootHelp[root];
}

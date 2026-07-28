export type ConfigurationModule =
  | "workspace"
  | "finance"
  | "leases"
  | "maintenance"
  | "notifications"
  | "branding"
  | "access"
  | "integrations";

export type ConfigurationValueType =
  | "boolean"
  | "currency"
  | "enum"
  | "number"
  | "percentage"
  | "string";

export type ConfigurationChangeFrequency =
  | "setup_once"
  | "occasional"
  | "frequent";

export type ConfigurationHistoryPolicy =
  | "prospective_only"
  | "recalculate_unposted"
  | "display_only";

export type ConfigurationDefinition = {
  auditRequired: boolean;
  changeFrequency: ConfigurationChangeFrequency;
  description: string;
  historyPolicy: ConfigurationHistoryPolicy;
  key: string;
  label: string;
  module: ConfigurationModule;
  owner: "admin" | "finance_admin" | "operations_admin";
  safeAfterGoLive: boolean;
  valueType: ConfigurationValueType;
  defaultValue: boolean | number | string;
  options?: readonly { label: string; value: string }[];
};

export const configurationRegistry = [
  {
    auditRequired: true,
    changeFrequency: "setup_once",
    defaultValue: "USD",
    description: "Primary currency used for workspace transactions and reports.",
    historyPolicy: "prospective_only",
    key: "workspace.currency",
    label: "Workspace currency",
    module: "workspace",
    owner: "admin",
    safeAfterGoLive: false,
    valueType: "currency",
  },
  {
    auditRequired: true,
    changeFrequency: "setup_once",
    defaultValue: "Asia/Phnom_Penh",
    description: "Timezone used for posting dates, reminders, and generated documents.",
    historyPolicy: "prospective_only",
    key: "workspace.timezone",
    label: "Workspace timezone",
    module: "workspace",
    owner: "admin",
    safeAfterGoLive: false,
    valueType: "string",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: "percentage",
    description: "Default method used to calculate property management fees.",
    historyPolicy: "prospective_only",
    key: "finance.management_fee_method",
    label: "Management fee method",
    module: "finance",
    options: [
      { label: "Percentage of rent", value: "percentage" },
      { label: "Fixed amount", value: "fixed" },
    ],
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "enum",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: 0,
    description: "Default management fee percentage applied when a property has no override.",
    historyPolicy: "prospective_only",
    key: "finance.management_fee_percentage",
    label: "Management fee percentage",
    module: "finance",
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "percentage",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: "owner_balance",
    description: "Default settlement behavior for net income held on behalf of owners.",
    historyPolicy: "prospective_only",
    key: "finance.owner_settlement_method",
    label: "Owner settlement method",
    module: "finance",
    options: [
      { label: "Hold as owner balance", value: "owner_balance" },
      { label: "Monthly distribution", value: "monthly_distribution" },
    ],
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "enum",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: "daily_actual",
    description: "Method used to calculate partial-period rent charges.",
    historyPolicy: "recalculate_unposted",
    key: "leases.proration_method",
    label: "Rent proration method",
    module: "leases",
    options: [
      { label: "Actual days in month", value: "daily_actual" },
      { label: "30-day month", value: "daily_30" },
      { label: "No proration", value: "none" },
    ],
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "enum",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: 1,
    description: "Default calendar day on which recurring rent becomes due.",
    historyPolicy: "prospective_only",
    key: "leases.default_rent_due_day",
    label: "Default rent due day",
    module: "leases",
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "number",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: false,
    description: "Controls whether monthly tenant invoices require approval before delivery.",
    historyPolicy: "prospective_only",
    key: "finance.invoice_approval_required",
    label: "Invoice approval required",
    module: "finance",
    owner: "finance_admin",
    safeAfterGoLive: true,
    valueType: "boolean",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: "manual",
    description: "Default delivery channel used after an invoice is approved.",
    historyPolicy: "prospective_only",
    key: "notifications.invoice_delivery_channel",
    label: "Invoice delivery channel",
    module: "notifications",
    options: [
      { label: "Manual download", value: "manual" },
      { label: "Email", value: "email" },
      { label: "Telegram", value: "telegram" },
    ],
    owner: "admin",
    safeAfterGoLive: true,
    valueType: "enum",
  },
  {
    auditRequired: true,
    changeFrequency: "occasional",
    defaultValue: 3,
    description: "Number of days before recurring maintenance work that reminders are sent.",
    historyPolicy: "prospective_only",
    key: "maintenance.recurring_reminder_days",
    label: "Recurring work reminder",
    module: "maintenance",
    owner: "operations_admin",
    safeAfterGoLive: true,
    valueType: "number",
  },
  {
    auditRequired: false,
    changeFrequency: "occasional",
    defaultValue: "#38761d",
    description: "Workspace accent color used in customer-facing documents and selected UI surfaces.",
    historyPolicy: "display_only",
    key: "branding.accent_color",
    label: "Workspace accent color",
    module: "branding",
    owner: "admin",
    safeAfterGoLive: true,
    valueType: "string",
  },
  {
    auditRequired: true,
    changeFrequency: "frequent",
    defaultValue: true,
    description: "Controls whether managers may approve work completed by maintenance members.",
    historyPolicy: "prospective_only",
    key: "maintenance.manager_review_enabled",
    label: "Manager review",
    module: "maintenance",
    owner: "operations_admin",
    safeAfterGoLive: true,
    valueType: "boolean",
  },
] as const satisfies readonly ConfigurationDefinition[];

export type ConfigurationKey = (typeof configurationRegistry)[number]["key"];

export function getConfigurationDefinition(key: string) {
  return configurationRegistry.find((definition) => definition.key === key) ?? null;
}

export function getConfigurationDefinitionsByModule(module: ConfigurationModule) {
  return configurationRegistry.filter((definition) => definition.module === module);
}

export function isStatementReportEnabled(context: { organizationSlug?: string }) {
  return context.organizationSlug === "pilot" || process.env.NODE_ENV === "development";
}

import "server-only";

import * as Sentry from "@sentry/nextjs";

const handledErrorContexts = {
  maintenance_automation_rpc: {
    errorCode: "maintenance_automation_rpc_failed",
    operation: "maintenance_automation",
    route: "/api/cron/maintenance",
  },
  report_excel_artifact_download: {
    errorCode: "report_artifact_download_failed",
    operation: "report_artifact_download",
    route: "/api/reports/excel",
  },
  report_pdf_artifact_download: {
    errorCode: "report_artifact_download_failed",
    operation: "report_artifact_download",
    route: "/api/reports/pdf",
  },
} as const;

export type UnexpectedHandledErrorContext = keyof typeof handledErrorContexts;

export function captureUnexpectedServerError(
  error: unknown,
  context: UnexpectedHandledErrorContext,
) {
  const tags = handledErrorContexts[context];
  Sentry.captureException(error, {
    tags: {
      error_code: tags.errorCode,
      handled: "true",
      operation: tags.operation,
      route: tags.route,
    },
  });
}

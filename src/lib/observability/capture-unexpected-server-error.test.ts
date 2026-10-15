import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/nextjs";
import { captureUnexpectedServerError } from "@/lib/observability/capture-unexpected-server-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("unexpected handled server errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["report_pdf_artifact_download", "/api/reports/pdf", "report_artifact_download"],
    ["report_excel_artifact_download", "/api/reports/excel", "report_artifact_download"],
    ["maintenance_automation", "/api/cron/maintenance", "maintenance_automation"],
  ] as const)("captures %s with allowlisted structural tags", (context, route, operation) => {
    const error = new Error("private customer and financial details");

    captureUnexpectedServerError(error, context);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        error_code: `${operation}_failed`,
        handled: "true",
        operation,
        route,
      },
    });
  });
});

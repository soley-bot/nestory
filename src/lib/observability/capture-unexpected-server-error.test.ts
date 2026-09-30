import { beforeEach, describe, expect, it, vi } from "vitest";

import * as Sentry from "@sentry/nextjs";
import { captureUnexpectedServerError } from "@/lib/observability/capture-unexpected-server-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("unexpected handled server errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["report_pdf_artifact_download", "/api/reports/pdf"],
    ["report_excel_artifact_download", "/api/reports/excel"],
  ] as const)("captures %s with allowlisted structural tags", (context, route) => {
    const error = new Error("private customer and financial details");

    captureUnexpectedServerError(error, context);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: {
        error_code: "report_artifact_download_failed",
        handled: "true",
        operation: "report_artifact_download",
        route,
      },
    });
  });
});

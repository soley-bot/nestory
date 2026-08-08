import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitStagedImportRunAction,
  importReadyRowsAction,
  stageImportRunAction,
} from "@/features/imports/actions";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getImportReferenceData: vi.fn(),
  revalidatePath: vi.fn(),
  requireSuperAdminContext: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/context", () => ({
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/features/imports/data/imports", () => ({
  getImportReferenceData: mocks.getImportReferenceData,
}));

describe("commitStagedImportRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getImportReferenceData.mockResolvedValue({
      leaseOccupancies: [],
      people: [],
      properties: [],
      units: [],
    });
  });

  it("recovers a committed run as success without invoking the commit RPC again", async () => {
    const query = chainReturning({
      created_count: 2,
      failed_count: 0,
      id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      import_type: "units",
      skipped_count: 1,
      status: "committed",
      updated_count: 1,
    });
    const rpc = vi.fn();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
      rpc,
    });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "This import run was already committed. No duplicate rows were created.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "committed",
      status: "success",
      summary: { created: 2, failed: 0, skipped: 1, updated: 1 },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a terminal all-failed summary without replaying the commit RPC", async () => {
    const query = chainReturning({
      created_count: 0,
      failed_count: 3,
      id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      import_type: "units",
      skipped_count: 1,
      status: "failed",
      updated_count: 0,
    });
    const rpc = vi.fn();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
      rpc,
    });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "No unit rows were committed. Review 3 failed rows. This terminal result was not retried.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "failed",
      status: "error",
      summary: { created: 0, failed: 3, skipped: 1, updated: 0 },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reconciles a committing run without starting a second commit RPC", async () => {
    const query = chainReturning({
      created_count: 0,
      failed_count: 0,
      id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      import_type: "units",
      skipped_count: 0,
      status: "committing",
      updated_count: 0,
    });
    const rpc = vi.fn();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
      rpc,
    });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message: "This import run is still committing. Reconcile it again shortly.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "committing",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recovers the stored committed result when a concurrent RPC wins after the initial status read", async () => {
    const selectedRuns = [
      {
        created_count: 0,
        failed_count: 0,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "units",
        skipped_count: 0,
        status: "staged",
        total_rows: 1,
        updated_count: 0,
      },
      {
        created_count: 2,
        failed_count: 0,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "units",
        skipped_count: 1,
        status: "committed",
        updated_count: 1,
      },
    ];
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "import_runs") {
        return {
          select: vi.fn().mockReturnValue(
            chainReturning(selectedRuns.shift() ?? null),
          ),
        };
      }
      if (table === "import_rows") {
        return {
          select: vi.fn().mockReturnValue(
            awaitableFilterQuery(
              { count: 1, data: null, error: null },
              [],
            ),
          ),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Import run has already been committed" },
    });
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from, rpc });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "This import run was already committed. No duplicate rows were created.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "committed",
      status: "success",
      summary: { created: 2, failed: 0, skipped: 1, updated: 1 },
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("reconciles an all-failed concurrent winner without replaying the commit RPC", async () => {
    const selectedRuns = [
      {
        created_count: 0,
        failed_count: 0,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "properties",
        skipped_count: 0,
        status: "staged",
        total_rows: 1,
        updated_count: 0,
      },
      {
        created_count: 0,
        failed_count: 1,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "properties",
        skipped_count: 0,
        status: "failed",
        updated_count: 0,
      },
    ];
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "import_runs") {
        return {
          select: vi.fn().mockReturnValue(
            chainReturning(selectedRuns.shift() ?? null),
          ),
        };
      }
      if (table === "import_rows") {
        return {
          select: vi.fn().mockReturnValue(
            awaitableFilterQuery(
              { count: 1, data: null, error: null },
              [],
            ),
          ),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Import run must be staged before commit" },
    });
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from, rpc });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "No property rows were committed. Review 1 failed row. This terminal result was not retried.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "failed",
      status: "error",
      summary: { created: 0, failed: 1, skipped: 0, updated: 0 },
    });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("does not commit a staged run whose interrupted row staging is incomplete", async () => {
    const runQuery = chainReturning({
      created_count: 0,
      failed_count: 0,
      id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      import_type: "units",
      skipped_count: 0,
      status: "staged",
      total_rows: 3,
      updated_count: 0,
    });
    const rowCountQuery = awaitableFilterQuery(
      { count: 1, data: null, error: null },
      [],
    );
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "import_runs") return runQuery;
      if (table === "import_rows") {
        return {
          select: vi.fn().mockReturnValue(rowCountQuery),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from, rpc });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "This incomplete import cannot be resumed. Re-upload the CSV to create a fresh run.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "staged",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the re-upload requirement when Past Imports resumes an incomplete run", async () => {
    const selectedRuns = [
      {
        created_count: 0,
        failed_count: 0,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "properties",
        skipped_count: 0,
        status: "staged",
        total_rows: 1,
        updated_count: 0,
      },
      {
        created_count: 0,
        failed_count: 0,
        id: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
        import_type: "properties",
        skipped_count: 0,
        status: "staged",
        total_rows: 1,
        updated_count: 0,
      },
    ];
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "import_runs") {
        return {
          select: vi.fn().mockReturnValue(
            chainReturning(selectedRuns.shift() ?? null),
          ),
        };
      }
      if (table === "import_rows") {
        return {
          select: vi.fn().mockReturnValue(
            awaitableFilterQuery(
              { count: 1, data: null, error: null },
              [],
            ),
          ),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Incomplete staged import must be re-uploaded before commit" },
    });
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "organization-1",
    });
    mocks.createSupabaseServerClient.mockResolvedValue({ from, rpc });
    const formData = new FormData();
    formData.set("runId", "75aa9d2c-ae7f-40a0-b384-45970cdfa16a");

    const result = await commitStagedImportRunAction({}, formData);

    expect(result).toEqual({
      message:
        "This staged import cannot be resumed. Re-upload the CSV to create a fresh run.",
      runId: "75aa9d2c-ae7f-40a0-b384-45970cdfa16a",
      runStatus: "staged",
      status: "error",
    });
    expect(rpc).toHaveBeenCalledOnce();
  });
});

describe("stageImportRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    });
    mocks.getImportReferenceData.mockResolvedValue({
      leaseOccupancies: [],
      people: [],
      properties: [],
      units: [],
    });
  });

  it("stages only through the atomic RPC and returns its stored immutable summary", async () => {
    const stagedRun = importRunRecord("staged", {
      sourceFileName: "original-properties.csv",
    });
    const client = atomicStageClient(stagedRun);
    mocks.createSupabaseServerClient.mockResolvedValue(client.value);
    mocks.getImportReferenceData.mockResolvedValue({
      leaseOccupancies: [],
      people: [],
      properties: [
        {
          code: "P1",
          id: "property-1",
          label: "P1 - First",
          name: "First",
        },
      ],
      units: [],
    });

    const result = await stageImportRunAction({}, importPayloadForm("forged"));

    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith(
      "stage_import_run_v1",
      expect.objectContaining({
        p_import_type: "properties",
        p_organization_id: "11111111-1111-4111-8111-111111111111",
        p_rows: [
          expect.objectContaining({
            action_label: "Update",
            normalized_data: expect.objectContaining({
              existingPropertyId: "property-1",
            }),
            raw_data: {
              "Property Code": "P1",
              "Property Name": "First",
            },
            row_status: "ready",
            source_row_number: 2,
          }),
        ],
      }),
    );
    expect(client.from).not.toHaveBeenCalledWith("import_runs");
    expect(client.from).not.toHaveBeenCalledWith("import_rows");
    expect(result).toMatchObject({
      draftKey: "forged",
      runId: expect.any(String),
      runStatus: "staged",
      sourceFileName: "original-properties.csv",
      status: "success",
      summary: { blocked: 0, ready: 1, total: 1, warnings: 0 },
    });
  });

  it("accepts a replacement staged snapshot when references change for the same raw claim", async () => {
    const initial = importRunRecord("staged", {
      blocked: 1,
      ready: 0,
      runId: "1aed6372-216f-4e4d-a85b-6e2eb5789037",
      total: 1,
    });
    const replacement = importRunRecord("staged", {
      blocked: 0,
      ready: 1,
      runId: "2bed6372-216f-4e4d-a85b-6e2eb5789037",
      total: 1,
    });
    const client = atomicStageClient([initial, replacement]);
    mocks.createSupabaseServerClient.mockResolvedValue(client.value);

    const first = await stageImportRunAction({}, importPayloadForm("first"));
    mocks.getImportReferenceData.mockResolvedValue({
      leaseOccupancies: [],
      people: [],
      properties: [
        {
          code: "P1",
          id: "property-1",
          label: "P1 - First",
          name: "First",
        },
      ],
      units: [],
    });
    const second = await stageImportRunAction({}, importPayloadForm("second"));

    const firstArgs = client.rpc.mock.calls[0]?.[1];
    const secondArgs = client.rpc.mock.calls[1]?.[1];
    expect(firstArgs.p_rows[0]).toMatchObject({ action_label: "Create" });
    expect(secondArgs.p_rows[0]).toMatchObject({ action_label: "Update" });
    expect(first).toMatchObject({
      runId: initial.runId,
      status: "success",
      summary: { blocked: 1, ready: 0, total: 1, warnings: 0 },
    });
    expect(second).toMatchObject({
      runId: replacement.runId,
      status: "success",
      summary: { blocked: 0, ready: 1, total: 1, warnings: 0 },
    });
    expect(second.runId).not.toBe(first.runId);
  });

  it("normalizes missing MIME metadata for the non-null RPC argument", async () => {
    const client = atomicStageClient(importRunRecord("staged"));
    mocks.createSupabaseServerClient.mockResolvedValue(client.value);

    await stageImportRunAction({}, importPayloadForm("draft", null));

    expect(client.rpc).toHaveBeenCalledWith(
      "stage_import_run_v1",
      expect.objectContaining({ p_source_mime_type: "" }),
    );
  });

  it("recovers the same terminal run after references change without replaying commit", async () => {
    const terminal = importRunRecord("committed", {
      created: 1,
      sourceFileName: "first-upload.csv",
    });
    const client = atomicStageClient(terminal, {
      commitRun: {
        created_count: 1,
        failed_count: 0,
        id: terminal.id,
        import_type: "properties",
        skipped_count: 0,
        status: "committed",
        updated_count: 0,
      },
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client.value);
    mocks.getImportReferenceData.mockResolvedValue({
      leaseOccupancies: [],
      people: [],
      properties: [
        {
          code: "P1",
          id: "property-1",
          label: "P1 - First",
          name: "First",
        },
      ],
      units: [],
    });

    const result = await importReadyRowsAction({}, importPayloadForm("retry"));

    expect(client.rpc).toHaveBeenCalledOnce();
    expect(client.rpc.mock.calls[0]?.[0]).toBe("stage_import_run_v1");
    expect(result).toMatchObject({
      commitSummary: { created: 1, failed: 0, skipped: 0, updated: 0 },
      runId: expect.any(String),
      sourceFileName: "first-upload.csv",
      status: "success",
      validationSummary: { blocked: 0, ready: 1, total: 1, warnings: 0 },
    });
  });
});

function chainReturning(data: Record<string, unknown> | null) {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function importPayloadForm(
  draftKey: string,
  mimeType: string | null = "text/csv",
) {
  const formData = new FormData();
  formData.set(
    "payload",
    JSON.stringify({
      draftKey,
      fileName: "properties.csv",
      fileSize: 42,
      headers: ["Property Code", "Property Name"],
      importType: "properties",
      mapping: {
        code: "Property Code",
        name: "Property Name",
      },
      mimeType,
      records: [
        {
          raw: { "Property Code": "P1", "Property Name": "First" },
          rowNumber: 2,
        },
      ],
    }),
  );
  return formData;
}

function importRunRecord(
  status: "committed" | "committed_with_errors" | "committing" | "failed" | "staged",
  overrides: Record<string, unknown> = {},
) {
  return {
    blocked: 0,
    created: 0,
    failed: 0,
    id: "1aed6372-216f-8e4d-a85b-6e2eb5789037",
    ready: 1,
    runId: "1aed6372-216f-8e4d-a85b-6e2eb5789037",
    skipped: 0,
    sourceFileName: "properties.csv",
    status,
    total: 1,
    updated: 0,
    warnings: 0,
    ...overrides,
  };
}

function atomicStageClient(
  stagedRunOrRuns: Record<string, unknown> | Record<string, unknown>[],
  options: { commitRun?: Record<string, unknown> } = {},
) {
  const stagedRuns = Array.isArray(stagedRunOrRuns)
    ? [...stagedRunOrRuns]
    : [stagedRunOrRuns];
  let claimedRunId = "";
  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name !== "stage_import_run_v1") {
      throw new Error(`Unexpected RPC ${name}`);
    }

    const stagedRun =
      stagedRuns.length > 1 ? stagedRuns.shift()! : stagedRuns[0]!;
    claimedRunId = String(stagedRun.runId);
    return Promise.resolve({
      data: stagedRun,
      error: null,
    });
  });
  const upsertMapping = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "import_mappings") {
      return { upsert: upsertMapping };
    }
    if (table === "import_runs" && options.commitRun) {
      return {
        select: vi.fn().mockReturnValue(
          chainReturning({ ...options.commitRun, id: claimedRunId }),
        ),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    from,
    rpc,
    value: { from, rpc },
  };
}

function awaitableFilterQuery(
  result: unknown,
  filters: Array<[string, unknown]>,
) {
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

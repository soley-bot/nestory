import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  maybeSingle,
  preparePaidCostEvidence,
  requirePermission,
  requireSuperAdminContext,
  revalidatePath,
  rpc,
} =
  vi.hoisted(() => ({
    maybeSingle: vi.fn(),
    preparePaidCostEvidence: vi.fn(),
    requirePermission: vi.fn(),
    requireSuperAdminContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/finance-operations/paid-cost-evidence", () => ({
  preparePaidCostEvidence,
  validatePaidCostEvidenceFile: (value: FormDataEntryValue | null) =>
    value instanceof File && value.size > 0 ? null : "Choose a receipt evidence file.",
}));
vi.mock("@/lib/auth/context", () => ({
  requirePermission,
  requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle }) }),
      }),
    }),
    rpc,
  }),
}));

import {
  archiveMaintenanceCaseAction,
  createMaintenanceCaseAction,
  executeAssignedMaintenanceTaskAction,
  executeCoordinatedMaintenanceTaskAction,
  reviewMaintenanceCompletionAction,
  submitMaintenanceCostAction,
  updateMaintenanceCaseAction,
} from "@/features/maintenance/actions";

describe("maintenance action capabilities", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    requireSuperAdminContext.mockReset();
    maybeSingle.mockReset();
    preparePaidCostEvidence.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    preparePaidCostEvidence.mockResolvedValue({
      contentSha256: "a".repeat(64),
      documentId: "00000000-0000-4000-8000-000000000007",
      storagePath: "organization/paid-cost-evidence/hash",
    });
  });

  it("updates maintenance details without a direct Ledger command", async () => {
    requirePermission.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const formData = validMaintenanceForm();

    const result = await updateMaintenanceCaseAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "update_maintenance_task",
      expect.objectContaining({
        p_actual_cost_amount: 125.5,
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty(
      "p_link_actual_cost_to_ledger",
    );
  });

  it("submits the recorded cost to Finance through operations authority", async () => {
    requirePermission.mockResolvedValue(authority(["maintenance.review"], {
      userId: "00000000-0000-4000-8000-000000000009",
    }));
    maybeSingle.mockResolvedValue({
      data: {
        property_id: "00000000-0000-4000-8000-000000000002",
        unit_id: null,
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("expenseDate", "2026-08-08");
    formData.set(
      "evidenceFile",
      new File(["receipt"], "receipt.pdf", { type: "application/pdf" }),
    );
    formData.set("idempotencyKey", "maintenance-cost-submit-1");
    formData.set("reference", "Receipt 42");
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    await expect(submitMaintenanceCostAction({}, formData)).resolves.toEqual({
      message: "Maintenance cost submitted to Finance.",
      status: "success",
    });
    expect(preparePaidCostEvidence).toHaveBeenCalledWith({
      actorId: "00000000-0000-4000-8000-000000000009",
      file: expect.any(File),
      idempotencyKey: "maintenance-cost-submit-1",
      organizationId: "00000000-0000-4000-8000-000000000001",
      propertyId: "00000000-0000-4000-8000-000000000002",
      requestClient: expect.objectContaining({ rpc }),
      taskId: "00000000-0000-4000-8000-000000000003",
    });
    expect(requirePermission).toHaveBeenCalledWith("maintenance.review");
    expect(rpc).toHaveBeenCalledWith("submit_maintenance_cost", {
      p_expense_date: "2026-08-08",
      p_idempotency_key: "maintenance-cost-submit-1",
      p_organization_id: "00000000-0000-4000-8000-000000000001",
      p_reference: "Receipt 42",
      p_supporting_document_id:
        "00000000-0000-4000-8000-000000000007",
      p_task_id: "00000000-0000-4000-8000-000000000003",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance");
    expect(revalidatePath).toHaveBeenCalledWith("/bills-expenses");
  });

  it("does not serialize evidence-provider errors to maintenance clients", async () => {
    requirePermission.mockResolvedValue(authority(["maintenance.review"], {
      userId: "00000000-0000-4000-8000-000000000009",
    }));
    maybeSingle.mockResolvedValue({
      data: {
        property_id: "00000000-0000-4000-8000-000000000002",
        unit_id: null,
      },
      error: null,
    });
    const sentinel = "service_role_secret storage_backend_detail";
    preparePaidCostEvidence.mockRejectedValueOnce(new Error(sentinel));
    const formData = new FormData();
    formData.set("expenseDate", "2026-08-08");
    formData.set(
      "evidenceFile",
      new File(["receipt"], "receipt.pdf", { type: "application/pdf" }),
    );
    formData.set("idempotencyKey", "maintenance-cost-secret-test");
    formData.set("reference", "Receipt 43");
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    const result = await submitMaintenanceCostAction({}, formData);

    expect(result).toEqual({
      message: "Receipt evidence could not be retained. Try again.",
      status: "error",
    });
    expect(result.message).not.toContain(sentinel);
  });

  it("requires retained receipt evidence before authorization", async () => {
    const formData = new FormData();
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "maintenance-cost-no-evidence");
    formData.set("reference", "");
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    await expect(submitMaintenanceCostAction({}, formData)).resolves.toEqual({
      fieldErrors: {
        supportingDocumentId: ["Choose a receipt evidence file."],
      },
      status: "error",
    });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a due date before creating a recurring series", async () => {
    requirePermission.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const formData = validMaintenanceForm();
    formData.set("actualCostAmount", "");
    formData.set("dueDate", "");
    formData.set("recurrenceFrequency", "monthly");
    formData.set("status", "scheduled");

    expect(await createMaintenanceCaseAction({}, formData)).toEqual({
      fieldErrors: {
        dueDate: ["Choose the first due date for recurring work."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates and assigns a maintenance case in one checked RPC", async () => {
    requirePermission.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const formData = validMaintenanceForm();
    formData.set("actualCostAmount", "");
    formData.set("assigneePersonId", "00000000-0000-4000-8000-000000000004");
    formData.set("branchId", "00000000-0000-4000-8000-000000000005");
    formData.set("status", "pending");
    formData.set("vendorPersonId", "00000000-0000-4000-8000-000000000006");

    const result = await createMaintenanceCaseAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "create_maintenance_task",
      expect.objectContaining({
        p_assignee_person_id: "00000000-0000-4000-8000-000000000004",
        p_branch_id: "00000000-0000-4000-8000-000000000005",
        p_vendor_person_id: "00000000-0000-4000-8000-000000000006",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("sends a changed vendor through the checked update RPC", async () => {
    requirePermission.mockResolvedValue(superAdminAuthority());
    const formData = validMaintenanceForm();
    formData.set("vendorPersonId", "00000000-0000-4000-8000-000000000006");

    expect(await updateMaintenanceCaseAction({}, formData)).toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_maintenance_task",
      expect.objectContaining({
        p_vendor_person_id: "00000000-0000-4000-8000-000000000006",
      }),
    );
  });

  it("returns an operator-friendly error when a vendor is no longer eligible", async () => {
    requirePermission.mockResolvedValue(superAdminAuthority());
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Vendor not found" },
    });
    const formData = validMaintenanceForm();
    formData.set("status", "pending");
    formData.set("vendorPersonId", "00000000-0000-4000-8000-000000000006");

    expect(await createMaintenanceCaseAction({}, formData)).toEqual({
      message: "The selected vendor is no longer eligible. Choose an active vendor or clear the field.",
      status: "error",
    });
  });

  it("rejects manager archive requests before calling the archive RPC", async () => {
    requireSuperAdminContext.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    const result = await archiveMaintenanceCaseAction({}, formData);

    expect(result).toEqual({
      message: "Only administrators can archive maintenance cases.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("routes member execution through the checked assignment RPC", async () => {
    requirePermission.mockResolvedValue(authority(["maintenance.complete"], {
      branchId: "00000000-0000-4000-8000-000000000005",
      personId: "00000000-0000-4000-8000-000000000004",
    }));
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("executionAction", "submit_for_review");

    const result = await executeAssignedMaintenanceTaskAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "execute_assigned_maintenance_task",
      expect.objectContaining({
        p_action: "submit_for_review",
        p_task_id: "00000000-0000-4000-8000-000000000003",
      }),
    );
  });

  it("does not let a manager execute a member assignment", async () => {
    requirePermission.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("executionAction", "start");

    const result = await executeAssignedMaintenanceTaskAction({}, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("routes manager-coordinated execution through its checked RPC", async () => {
    requirePermission.mockResolvedValue(authority(["maintenance.create_assign"], {
      branchId: "00000000-0000-4000-8000-000000000005",
    }));
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("coordinatedAction", "complete");
    formData.set("coordinatedNote", "  Vendor completed the repair.  ");

    expect(await executeCoordinatedMaintenanceTaskAction({}, formData)).toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "execute_coordinated_maintenance_task",
      expect.objectContaining({
        p_action: "complete",
        p_note: "Vendor completed the repair.",
        p_task_id: "00000000-0000-4000-8000-000000000003",
      }),
    );
  });

  it("requires a coordinated block or completion note and rejects members", async () => {
    requirePermission.mockResolvedValue(
      authority(["maintenance.create_assign"]),
    );
    const invalid = new FormData();
    invalid.set("taskId", "00000000-0000-4000-8000-000000000003");
    invalid.set("coordinatedAction", "block");
    invalid.set("coordinatedNote", "x");

    expect(await executeCoordinatedMaintenanceTaskAction({}, invalid)).toMatchObject({
      fieldErrors: { coordinatedNote: expect.any(Array) },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();

    requirePermission.mockResolvedValue(authority(["maintenance.complete"]));
    const start = new FormData();
    start.set("taskId", "00000000-0000-4000-8000-000000000003");
    start.set("coordinatedAction", "start");

    expect(await executeCoordinatedMaintenanceTaskAction({}, start)).toMatchObject({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires and trims a 3 to 500 character reopen note", async () => {
    requirePermission.mockResolvedValue(authority(["maintenance.review"]));
    const invalid = new FormData();
    invalid.set("taskId", "00000000-0000-4000-8000-000000000003");
    invalid.set("reviewAction", "reopen");
    invalid.set("reviewNote", " x ");

    expect(await reviewMaintenanceCompletionAction({}, invalid)).toMatchObject({
      fieldErrors: { reviewNote: expect.any(Array) },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();

    const valid = new FormData();
    valid.set("taskId", "00000000-0000-4000-8000-000000000003");
    valid.set("reviewAction", "reopen");
    valid.set("reviewNote", "  Tighten the fitting before resubmitting.  ");

    expect(await reviewMaintenanceCompletionAction({}, valid)).toMatchObject({ status: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "review_maintenance_task_completion",
      expect.objectContaining({
        p_action: "reopen",
        p_review_note: "Tighten the fitting before resubmitting.",
      }),
    );
  });

  it("keeps an approval note optional for admins", async () => {
    requirePermission.mockResolvedValue(superAdminAuthority());
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("reviewAction", "approve");

    expect(await reviewMaintenanceCompletionAction({}, formData)).toMatchObject({ status: "success" });
    expect(rpc).toHaveBeenCalledWith(
      "review_maintenance_task_completion",
      expect.objectContaining({ p_action: "approve", p_review_note: undefined }),
    );
  });
});

function authority(
  permissionKeys: Array<
    | "maintenance.complete"
    | "maintenance.create_assign"
    | "maintenance.review"
  >,
  overrides: Record<string, unknown> = {},
) {
  return {
    isSuperAdmin: false,
    organizationId: "00000000-0000-4000-8000-000000000001",
    permissionKeys: new Set(permissionKeys),
    role: "custom",
    ...overrides,
  };
}

function superAdminAuthority() {
  return {
    isSuperAdmin: true,
    organizationId: "00000000-0000-4000-8000-000000000001",
    permissionKeys: new Set(),
    role: "super_admin",
  };
}

function validMaintenanceForm() {
  const formData = new FormData();
  formData.set("actualCostAmount", "125.50");
  formData.set("assigneePersonId", "");
  formData.set("branchId", "");
  formData.set("category", "Plumbing");
  formData.set("checklistText", "");
  formData.set("costEstimateAmount", "150");
  formData.set("description", "Repair the leaking kitchen sink.");
  formData.set("dueDate", "");
  formData.set("dueTime", "");
  formData.set("priority", "normal");
  formData.set("propertyId", "00000000-0000-4000-8000-000000000002");
  formData.set("recurrenceFrequency", "none");
  formData.set("reminderDate", "");
  formData.set("reminderTime", "");
  formData.set("status", "in_progress");
  formData.set("taskId", "00000000-0000-4000-8000-000000000003");
  formData.set("title", "Repair kitchen sink");
  formData.set("unitId", "");
  formData.set("vendorPersonId", "");
  return formData;
}

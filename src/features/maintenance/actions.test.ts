import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  maybeSingle,
  requireOperationsExecutionContext,
  requireOperationsManagementContext,
  revalidatePath,
  rpc,
} =
  vi.hoisted(() => ({
    maybeSingle: vi.fn(),
    requireOperationsExecutionContext: vi.fn(),
    requireOperationsManagementContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireOperationsExecutionContext,
  requireOperationsManagementContext,
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
    requireOperationsExecutionContext.mockReset();
    requireOperationsManagementContext.mockReset();
    maybeSingle.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("updates maintenance details without a direct Ledger command", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
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
    requireOperationsManagementContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
    const formData = new FormData();
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "maintenance-cost-submit-1");
    formData.set("reference", "Receipt 42");
    formData.set(
      "supportingDocumentId",
      "00000000-0000-4000-8000-000000000007",
    );
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    await expect(submitMaintenanceCostAction({}, formData)).resolves.toEqual({
      message: "Maintenance cost submitted to Finance.",
      status: "success",
    });
    expect(requireOperationsManagementContext).toHaveBeenCalledOnce();
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

  it("requires a receipt document or reference before authorization", async () => {
    const formData = new FormData();
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "maintenance-cost-no-evidence");
    formData.set("reference", "");
    formData.set("supportingDocumentId", "");
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");

    await expect(submitMaintenanceCostAction({}, formData)).resolves.toEqual({
      fieldErrors: {
        reference: ["Choose a receipt document or enter a reference."],
      },
      status: "error",
    });
    expect(requireOperationsManagementContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates and assigns a maintenance case in one checked RPC", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "super_admin",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "super_admin",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      branchId: "00000000-0000-4000-8000-000000000005",
      organizationId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000004",
      role: "operations_member",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("executionAction", "start");

    const result = await executeAssignedMaintenanceTaskAction({}, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("routes manager-coordinated execution through its checked RPC", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      branchId: "00000000-0000-4000-8000-000000000005",
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
    const invalid = new FormData();
    invalid.set("taskId", "00000000-0000-4000-8000-000000000003");
    invalid.set("coordinatedAction", "block");
    invalid.set("coordinatedNote", "x");

    expect(await executeCoordinatedMaintenanceTaskAction({}, invalid)).toMatchObject({
      fieldErrors: { coordinatedNote: expect.any(Array) },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();

    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_member",
    });
    const start = new FormData();
    start.set("taskId", "00000000-0000-4000-8000-000000000003");
    start.set("coordinatedAction", "start");

    expect(await executeCoordinatedMaintenanceTaskAction({}, start)).toMatchObject({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires and trims a 3 to 500 character reopen note", async () => {
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "operations_manager",
    });
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
    requireOperationsExecutionContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "super_admin",
    });
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

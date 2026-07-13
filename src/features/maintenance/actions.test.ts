import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle, requireWorkspaceContext, revalidatePath, rpc } =
  vi.hoisted(() => ({
    maybeSingle: vi.fn(),
    requireWorkspaceContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));
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
  reviewMaintenanceCompletionAction,
  updateMaintenanceCaseAction,
} from "@/features/maintenance/actions";

describe("maintenance action capabilities", () => {
  beforeEach(() => {
    requireWorkspaceContext.mockReset();
    maybeSingle.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("never lets a manager request an official ledger posting", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "manager",
    });
    const formData = validMaintenanceForm();
    formData.set("linkActualCostToLedger", "on");

    const result = await updateMaintenanceCaseAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "update_maintenance_task",
      expect.objectContaining({
        p_actual_cost_amount: 125.5,
        p_link_actual_cost_to_ledger: false,
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps official ledger posting available to admins", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
    });
    const formData = validMaintenanceForm();
    formData.set("linkActualCostToLedger", "on");

    const result = await updateMaintenanceCaseAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "update_maintenance_task",
      expect.objectContaining({ p_link_actual_cost_to_ledger: true }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("creates and assigns a maintenance case in one checked RPC", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "manager",
    });
    const formData = validMaintenanceForm();
    formData.set("actualCostAmount", "");
    formData.set("assigneePersonId", "00000000-0000-4000-8000-000000000004");
    formData.set("branchId", "00000000-0000-4000-8000-000000000005");
    formData.set("status", "pending");

    const result = await createMaintenanceCaseAction({}, formData);

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith(
      "create_maintenance_task",
      expect.objectContaining({
        p_assignee_person_id: "00000000-0000-4000-8000-000000000004",
        p_branch_id: "00000000-0000-4000-8000-000000000005",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects manager archive requests before calling the archive RPC", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "manager",
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
    requireWorkspaceContext.mockResolvedValue({
      branchId: "00000000-0000-4000-8000-000000000005",
      organizationId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000004",
      role: "member",
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
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "manager",
    });
    const formData = new FormData();
    formData.set("taskId", "00000000-0000-4000-8000-000000000003");
    formData.set("executionAction", "start");

    const result = await executeAssignedMaintenanceTaskAction({}, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires and trims a 3 to 500 character reopen note", async () => {
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "manager",
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
    requireWorkspaceContext.mockResolvedValue({
      organizationId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
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

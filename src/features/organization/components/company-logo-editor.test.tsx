/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrganizationActionState } from "@/features/organization/actions";

const { refresh, removeOrganizationLogoAction, uploadOrganizationLogoAction } =
  vi.hoisted(() => ({
    refresh: vi.fn(),
    removeOrganizationLogoAction: vi.fn(),
    uploadOrganizationLogoAction: vi.fn(),
  }));

vi.mock("@/features/organization/actions", () => ({
  removeOrganizationLogoAction,
  uploadOrganizationLogoAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { CompanyLogoEditor } from "@/features/organization/components/company-logo-editor";

const commonProps = {
  logoStoragePath: "organization-id/logos/logo.png",
  logoUrl: null,
  organizationName: "Nestory Test",
};

function selectFile(name = "new-logo.png") {
  fireEvent.change(screen.getByLabelText("Company logo file"), {
    target: { files: [new File(["logo"], name, { type: "image/png" })] },
  });
}

function getUploadForm() {
  return screen.getByLabelText("Company logo file").closest("form")!;
}

function getRemoveForm() {
  return screen.getByRole("button", { name: "Remove logo" }).closest("form")!;
}

async function waitForReady() {
  await waitFor(() => {
    expect(
      (screen.getByLabelText("Company logo file") as HTMLInputElement).disabled,
    ).toBe(false);
  });
}

function deferredAction() {
  let resolve!: (state: OrganizationActionState) => void;
  const promise = new Promise<OrganizationActionState>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  refresh.mockReset();
  removeOrganizationLogoAction.mockReset();
  uploadOrganizationLogoAction.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CompanyLogoEditor", () => {
  it("previews a selection locally, preserves proportions, and releases preview URLs", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
      static revokeObjectURL = revoke;
    });
    const { unmount } = render(<CompanyLogoEditor {...commonProps} />);
    expect(screen.getByText(/Each dimension must be 128–4096 pixels/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Replace logo" }) as HTMLButtonElement).disabled).toBe(true);
    selectFile();
    const preview = screen.getByRole("img", { name: "Selected company logo" });
    expect(preview.getAttribute("src")).toBe("blob:first");
    expect(preview.className).toContain("object-contain");
    Object.defineProperties(preview, {
      naturalWidth: { value: 1024 }, naturalHeight: { value: 256 },
    });
    fireEvent.load(preview);
    expect(await screen.findByText("1024 × 256 pixels")).toBeTruthy();
    expect(screen.getByText("Selected file is not saved. Upload to apply it.")).toBeTruthy();
    expect(uploadOrganizationLogoAction).not.toHaveBeenCalled();
    selectFile("second-logo.png");
    expect(revoke).toHaveBeenCalledWith("blob:first");
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:second");
  });

  it("limits the report sample to supported company-name branding", () => {
    render(<CompanyLogoEditor {...commonProps} />);
    const sample = screen.getByLabelText("Report header preview");
    expect(sample.textContent).toContain("Occupancy report - Nestory Test");
    expect(sample.querySelector("img")).toBeNull();
    expect(sample.textContent).toContain("Workspace colors do not apply to exports.");
    expect(sample.textContent).toContain("does not preview a statement");
  });

  it.each(["success", "error"] as const)(
    "clears removal %s feedback on selection and shows the subsequent upload result",
    async (status) => {
      removeOrganizationLogoAction.mockResolvedValue({
        message: "Previous removal result.",
        status,
      });
      uploadOrganizationLogoAction.mockResolvedValue({
        message: "The replacement file was rejected.",
        status: "error",
      });
      render(<CompanyLogoEditor {...commonProps} />);

      fireEvent.submit(getRemoveForm());
      expect(await screen.findByText("Previous removal result.")).toBeTruthy();
      await waitForReady();

      selectFile();
      expect(screen.queryByText("Previous removal result.")).toBeNull();

      fireEvent.submit(getUploadForm());
      expect((await screen.findByRole("alert")).textContent).toBe(
        "The replacement file was rejected.",
      );
      expect(screen.queryByText("Previous removal result.")).toBeNull();
      expect(refresh).toHaveBeenCalledTimes(status === "success" ? 1 : 0);
    },
  );

  it("clears the previous removal message when another upload starts", async () => {
    const upload = deferredAction();
    removeOrganizationLogoAction.mockResolvedValue({
      message: "Company logo removed.",
      status: "success",
    });
    uploadOrganizationLogoAction.mockReturnValue(upload.promise);
    render(<CompanyLogoEditor {...commonProps} />);
    selectFile();

    fireEvent.submit(getRemoveForm());
    expect(await screen.findByText("Company logo removed.")).toBeTruthy();
    await waitForReady();

    fireEvent.submit(getUploadForm());
    expect(screen.queryByText("Company logo removed.")).toBeNull();
    expect(screen.getByRole("button", { name: /^Uploading/ })).toBeTruthy();

    await act(async () => {
      upload.resolve({ message: "Company logo updated.", status: "success" });
      await upload.promise;
    });
    await waitForReady();
    expect(screen.getByRole("status").textContent).toBe("Company logo updated.");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["upload", "success"],
    ["upload", "error"],
    ["remove", "success"],
    ["remove", "error"],
  ] as const)(
    "disables conflicting controls while %s is pending and releases them after a %s result",
    async (operation, status) => {
      const deferred = deferredAction();
      const pendingAction =
        operation === "upload"
          ? uploadOrganizationLogoAction
          : removeOrganizationLogoAction;
      const nextAction =
        operation === "upload"
          ? removeOrganizationLogoAction
          : uploadOrganizationLogoAction;
      pendingAction.mockReturnValue(deferred.promise);
      nextAction.mockResolvedValue({
        message: "Next action completed.",
        status: "success",
      });
      render(<CompanyLogoEditor {...commonProps} />);
      selectFile("first-logo.png");
      const uploadForm = getUploadForm();
      const removeForm = getRemoveForm();

      fireEvent.submit(operation === "upload" ? uploadForm : removeForm);

      expect(
        (screen.getByLabelText("Company logo file") as HTMLInputElement).disabled,
      ).toBe(true);
      for (const button of screen.getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }

      fireEvent.submit(uploadForm);
      fireEvent.submit(removeForm);
      selectFile("conflicting-logo.png");
      expect(screen.getByText("first-logo.png")).toBeTruthy();
      expect(screen.queryByText("conflicting-logo.png")).toBeNull();
      expect(pendingAction).toHaveBeenCalledTimes(1);
      expect(nextAction).not.toHaveBeenCalled();
      expect(window.confirm).toHaveBeenCalledTimes(operation === "remove" ? 1 : 0);

      await act(async () => {
        deferred.resolve({ message: "First action completed.", status });
        await deferred.promise;
      });
      await waitForReady();
      expect(
        (screen.getByLabelText("Company logo file") as HTMLInputElement).disabled,
      ).toBe(false);
      for (const button of screen.getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(
          operation === "upload" && status === "success" && button.textContent === "Replace logo",
        );
      }

      fireEvent.submit(operation === "upload" ? removeForm : uploadForm);
      expect(await screen.findByText("Next action completed.")).toBeTruthy();
      expect(nextAction).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(status === "success" ? 2 : 1);
    },
  );

  it.each(["upload", "remove"] as const)(
    "accepts only the first %s submission when both forms submit in one tick",
    async (operation) => {
      const deferred = deferredAction();
      const firstAction =
        operation === "upload"
          ? uploadOrganizationLogoAction
          : removeOrganizationLogoAction;
      const competingAction =
        operation === "upload"
          ? removeOrganizationLogoAction
          : uploadOrganizationLogoAction;
      firstAction.mockReturnValue(deferred.promise);
      render(<CompanyLogoEditor {...commonProps} />);
      selectFile();
      const firstForm = operation === "upload" ? getUploadForm() : getRemoveForm();
      const competingForm = operation === "upload" ? getRemoveForm() : getUploadForm();

      act(() => {
        fireEvent.submit(firstForm);
        fireEvent.submit(competingForm);
        fireEvent.submit(firstForm);
      });

      expect(firstAction).toHaveBeenCalledTimes(1);
      expect(competingAction).not.toHaveBeenCalled();
      expect(window.confirm).toHaveBeenCalledTimes(operation === "remove" ? 1 : 0);

      await act(async () => {
        deferred.resolve({ message: "Action completed.", status: "success" });
        await deferred.promise;
      });
      await waitForReady();
      expect(screen.getByRole("status").textContent).toBe("Action completed.");
    },
  );

  it("preserves feedback after a canceled removal and allows the next upload", async () => {
    uploadOrganizationLogoAction.mockResolvedValue({
      message: "Company logo updated.",
      status: "success",
    });
    render(<CompanyLogoEditor {...commonProps} />);
    selectFile();
    fireEvent.submit(getUploadForm());
    expect(await screen.findByText("Company logo updated.")).toBeTruthy();
    await waitForReady();

    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.submit(getRemoveForm());
    expect(removeOrganizationLogoAction).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Company logo updated.");

    selectFile();
    fireEvent.submit(getUploadForm());
    expect(await screen.findByText("Company logo updated.")).toBeTruthy();
    expect(uploadOrganizationLogoAction).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

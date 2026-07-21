import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, requireUser } = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({
  requireUser,
}));

import SetupPage from "@/app/setup/page";

describe("SetupPage", () => {
  beforeEach(() => {
    redirect.mockReset();
    requireUser.mockReset();
  });

  it("routes every authenticated visit to no-access instead of provisioning", async () => {
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    requireUser.mockResolvedValue({ id: "user-1" });

    await expect(SetupPage()).rejects.toThrow("redirect:/no-access");

    expect(requireUser).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/no-access");
  });
});

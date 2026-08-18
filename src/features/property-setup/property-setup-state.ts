export type ActivateSetupLeaseState = {
  message: string;
  status: "idle" | "error" | "success";
};

export const initialActivateSetupLeaseState: ActivateSetupLeaseState = {
  message: "",
  status: "idle",
};

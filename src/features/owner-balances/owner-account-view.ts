export type OwnerAccountView = "summary" | "activity" | "statements";

export function parseOwnerAccountView(value: string | undefined): OwnerAccountView {
  return value === "activity" || value === "statements" ? value : "summary";
}

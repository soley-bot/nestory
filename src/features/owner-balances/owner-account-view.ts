export type OwnerAccountView = "summary" | "activity" | "statements";

export function parseOwnerAccountView(value: string | undefined): OwnerAccountView {
  return value === "activity" || value === "statements" ? value : "summary";
}

export function ownerCashActivityHref(propertyId: string, month: string, ownerPersonId?: string) {
  const params = new URLSearchParams({ month, activity: "owner_cash" });
  if (ownerPersonId && ownerPersonId !== "all") params.set("ownerPersonId", ownerPersonId);
  return `/properties/${encodeURIComponent(propertyId)}/account?${params}`;
}

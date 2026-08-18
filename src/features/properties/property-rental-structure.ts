export type PropertyRentalStructure =
  | "undecided"
  | "single_space"
  | "multi_unit";

export function normalizePropertyRentalStructure(
  value: string | null | undefined,
  activeUnitCount = 0,
): PropertyRentalStructure {
  if (value === "single_space" || value === "multi_unit") {
    return value;
  }

  return activeUnitCount > 0 ? "multi_unit" : "undecided";
}


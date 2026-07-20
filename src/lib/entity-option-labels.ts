type PropertyOptionLabelSource = {
  code: string;
  name: string;
};

type UnitOptionLabelSource = {
  propertyCode?: string | null;
  unitNumber: string;
};

export function formatPropertyOptionLabel({
  code,
  name,
}: PropertyOptionLabelSource) {
  return `${code} — ${name}`;
}

export function formatUnitOptionLabel({
  propertyCode,
  unitNumber,
}: UnitOptionLabelSource) {
  return `${propertyCode ?? "Unknown property"} — Unit ${unitNumber}`;
}

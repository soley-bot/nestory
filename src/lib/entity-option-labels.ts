type PropertyOptionLabelSource = {
  code: string;
  name: string;
};

type UnitOptionLabelSource = {
  propertyCode?: string | null;
  unitNumber: string;
};

// The name leads. An unset code is generated from the record id, so a
// code-first label buries the only part an operator recognises.
export function formatPropertyOptionLabel({
  code,
  name,
}: PropertyOptionLabelSource) {
  return `${name} — ${code}`;
}

export function formatUnitOptionLabel({
  propertyCode,
  unitNumber,
}: UnitOptionLabelSource) {
  return `Unit ${unitNumber} — ${propertyCode ?? "Unknown property"}`;
}

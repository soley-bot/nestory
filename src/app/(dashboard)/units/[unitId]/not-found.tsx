import { RecordNotFound } from "@/components/ui/record-not-found";

export default function UnitNotFound() {
  return (
    <RecordNotFound
      backHref="/units"
      backLabel="Back to units"
      recordLabel="Unit"
    />
  );
}

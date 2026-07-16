import { RecordNotFound } from "@/components/ui/record-not-found";

export default function PersonNotFound() {
  return (
    <RecordNotFound
      backHref="/people"
      backLabel="Back to people"
      recordLabel="Person"
    />
  );
}

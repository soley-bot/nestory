import { RecordNotFound } from "@/components/ui/record-not-found";

export default function PropertyNotFound() {
  return (
    <RecordNotFound
      backHref="/properties"
      backLabel="Back to properties"
      recordLabel="Property"
    />
  );
}

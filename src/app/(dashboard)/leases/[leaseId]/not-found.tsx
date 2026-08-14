import { RecordNotFound } from "@/components/ui/record-not-found";

export default function LeaseNotFound() {
  return (
    <RecordNotFound
      backHref="/leases"
      backLabel="Back to leases"
      recordLabel="Lease"
    />
  );
}

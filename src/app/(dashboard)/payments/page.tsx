import { redirect } from "next/navigation";

export default function PaymentsPage() {
  redirect("/ledger?direction=income");
}

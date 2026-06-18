import { redirect } from "next/navigation";

export default function TenantsPage() {
  redirect("/people?role=tenant");
}

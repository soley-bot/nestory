import { redirect } from "next/navigation";

export default function MaintenanceDashboardPage() {
  redirect("/overview?lens=maintenance");
}

import { redirect } from "next/navigation";

export default function FinanceDashboardPage() {
  redirect("/overview?lens=finance");
}

import { redirect } from "next/navigation";

export default function PropertyDashboardPage() {
  redirect("/overview?lens=records");
}

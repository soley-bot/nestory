import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requireUser();
  redirect("/no-access");
}

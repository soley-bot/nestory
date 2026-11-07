import type { Metadata } from "next";
import { OrganizationSettingsRoute } from "@/features/organization/components/organization-settings-route";

export default function TeamSettingsPage() {
  return <OrganizationSettingsRoute section="teams" />;
}

export const metadata: Metadata = { title: "Teams" };

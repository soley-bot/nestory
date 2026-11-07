import type { Metadata } from "next";
import { OrganizationSettingsRoute } from "@/features/organization/components/organization-settings-route";

export default function OrganizationSettingsPage() {
  return <OrganizationSettingsRoute section="organization" />;
}

export const metadata: Metadata = { title: "Organization" };

import type { Metadata } from "next";
import { OrganizationSettingsRoute } from "@/features/organization/components/organization-settings-route";

export default function AppearanceSettingsPage() {
  return <OrganizationSettingsRoute section="appearance" />;
}

export const metadata: Metadata = { title: "Appearance" };

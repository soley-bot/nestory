import { redirect } from "next/navigation";
import { getSettingsLandingHref } from "@/features/organization/settings-navigation";
import { requireWorkspaceContext } from "@/lib/auth/context";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const context = await requireWorkspaceContext();
  const params = await searchParams;
  const legacyHref = context.role === "super_admin"
    ? legacySectionHref(params.section)
    : null;
  const href = legacyHref ?? getSettingsLandingHref(context.role);

  redirect(href ?? "/no-access");
}

function legacySectionHref(value: string | string[] | undefined) {
  const section = Array.isArray(value) ? value[0] : value;
  return section === "appearance" || section === "branches" || section === "teams"
    ? `/settings/${section}`
    : "/settings/organization";
}

import { redirect } from "next/navigation";

type LegacyUsersRolesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FOCUS_KEYS = ["personId", "memberId", "invitationId"] as const;

export default async function LegacyUsersRolesPage({
  searchParams,
}: LegacyUsersRolesPageProps) {
  const source = await searchParams;
  const target = new URLSearchParams();

  for (const key of FOCUS_KEYS) {
    const value = readUuidParam(source[key]);
    if (value) target.set(key, value);
  }

  const query = target.toString();
  redirect(`/settings/access${query ? `?${query}` : ""}`);
}

function readUuidParam(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(first)
    ? first
    : undefined;
}

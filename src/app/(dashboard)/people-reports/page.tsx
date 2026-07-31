import { redirect } from "next/navigation";

type PeopleReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PeopleReportsPage({
  searchParams,
}: PeopleReportsPageProps) {
  void searchParams;
  redirect("/people");
}

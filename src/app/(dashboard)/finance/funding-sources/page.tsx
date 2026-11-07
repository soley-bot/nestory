import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export default function FundingSourcesPage() {
  permanentRedirect("/finance/accounts");
}

export const metadata: Metadata = { title: "Funding sources" };

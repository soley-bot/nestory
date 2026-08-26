import { LandingPage } from "@/features/marketing/landing-page";
import { headers } from "next/headers";

export default async function Home() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <LandingPage nonce={nonce} />;
}

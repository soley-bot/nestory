export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!isLoopback(requestUrl.hostname) || !configuredUrl) {
    return notFound();
  }

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(configuredUrl);
  } catch {
    return notFound();
  }

  if (!isLoopback(supabaseUrl.hostname)) {
    return notFound();
  }

  return Response.json({ supabaseOrigin: supabaseUrl.origin });
}

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    hostname.toLowerCase(),
  );
}

function notFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

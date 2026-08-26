type SupabaseEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { supabaseKey, supabaseUrl: validateSupabaseUrl(supabaseUrl) };
}

function validateSupabaseUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTP(S) URL.",
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTP(S) URL.",
    );
  }

  if (
    parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must contain only an origin.");
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  const isLocalHost = [
    "localhost",
    "127.0.0.1",
    "::1",
    "host.docker.internal",
  ].includes(hostname);

  if (parsed.protocol !== "https:" && !isLocalHost) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must use HTTPS for non-local hosts.",
    );
  }

  return parsed.origin;
}

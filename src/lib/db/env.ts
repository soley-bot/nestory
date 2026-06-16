type SupabaseEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and Supabase publishable/anon key.",
    );
  }

  return { supabaseKey, supabaseUrl };
}

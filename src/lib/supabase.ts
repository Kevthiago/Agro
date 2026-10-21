import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente público (chave anon): a segurança vem das políticas RLS. */
export function createPublicClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

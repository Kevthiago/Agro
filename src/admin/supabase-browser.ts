import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Cliente do navegador para o painel (chave anon; quem decide o que cada um pode
 * fazer é o RLS do banco). Criado uma única vez; a sessão fica no localStorage,
 * o padrão da biblioteca. Devolve `null` quando as variáveis não foram definidas.
 */
export function getBrowserClient(): SupabaseClient | null {
  if (client === undefined) {
    const url = import.meta.env.PUBLIC_SUPABASE_URL;
    const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    client = url && anonKey ? createClient(url, anonKey) : null;
  }
  return client;
}

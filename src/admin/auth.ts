import {
  isAuthRetryableFetchError,
  type AuthChangeEvent,
  type Session,
  type SignInWithOAuthCredentials,
  type SignInWithPasswordCredentials,
} from "@supabase/supabase-js";
import { getBrowserClient } from "@/admin/supabase-browser";

/** O que o painel usa do cliente Supabase (permite um cliente falso nos testes). */
export interface AdminClient {
  auth: {
    getSession(): Promise<{ data: { session: Session | null } }>;
    onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signInWithOAuth(credentials: SignInWithOAuthCredentials): Promise<{ error: unknown }>;
    signInWithPassword(credentials: SignInWithPasswordCredentials): Promise<{ error: unknown }>;
    signOut(options?: { scope?: "global" | "local" | "others" }): Promise<{ error: unknown }>;
  };
  rpc(fn: "is_editor"): PromiseLike<{ data: unknown; error: unknown }>;
}

const WRONG_CREDENTIALS = "E-mail ou senha incorretos.";
const OFFLINE = "Não foi possível entrar agora. Verifique a conexão e tente de novo.";
const NOT_CONFIGURED = "Painel não configurado.";

function required(client: AdminClient | null): AdminClient {
  if (!client) throw new Error(NOT_CONFIGURED);
  return client;
}

/** Leva à tela do Google; na volta, o Supabase cria a sessão em /admin. */
export async function signInWithGoogle(
  client: AdminClient | null = getBrowserClient(),
): Promise<void> {
  const { error } = await required(client).auth.signInWithOAuth({
    provider: "google",
    // só a origem da página: nada do endereço atual vai para o redirecionamento
    options: { redirectTo: `${location.origin}/admin` },
  });
  if (error) throw new Error(OFFLINE);
}

/**
 * Entra com e-mail e senha. Toda recusa vira a mesma mensagem, para não revelar
 * se um e-mail tem conta; só a falha de rede ganha mensagem própria.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  client: AdminClient | null = getBrowserClient(),
): Promise<void> {
  const auth = required(client).auth;
  let error: unknown;
  try {
    ({ error } = await auth.signInWithPassword({ email, password }));
  } catch {
    throw new Error(OFFLINE);
  }
  if (!error) return;
  throw new Error(isAuthRetryableFetchError(error) ? OFFLINE : WRONG_CREDENTIALS);
}

/** Sai da conta; se o servidor não responder, encerra ao menos a sessão deste aparelho. */
export async function signOut(client: AdminClient | null = getBrowserClient()): Promise<void> {
  const auth = required(client).auth;
  const { error } = await auth.signOut().catch((e: unknown) => ({ error: e }));
  if (error) await auth.signOut({ scope: "local" });
}

/**
 * Pergunta ao banco se a pessoa logada é editora (função `is_editor`, que confere
 * a lista de editores e o e-mail confirmado). É a única fonte da decisão: nada do
 * navegador (e-mail, metadados) conta. Qualquer dúvida ou erro = não é editora.
 * A proteção real é o RLS; isto só decide o que a tela mostra.
 */
export async function checkIsEditor(
  client: AdminClient | null = getBrowserClient(),
): Promise<boolean> {
  if (!client) return false;
  try {
    const { data, error } = await client.rpc("is_editor");
    return !error && data === true;
  } catch {
    return false;
  }
}

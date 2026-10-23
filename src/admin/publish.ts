import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { GENERIC } from "@/admin/errors";
import { getBrowserClient } from "@/admin/supabase-browser";

/*
 * "Publicar alterações": pede à Edge Function publish-site que reconstrua o site.
 * A função confere se a pessoa é editora e chama o deploy hook (que é segredo e
 * nunca chega ao navegador). Aqui só traduzimos a resposta em mensagem amigável.
 */

/** O que o botão usa do cliente Supabase (substituível nos testes). */
export interface PublishClient {
  functions: {
    invoke(
      name: "publish-site",
      options: { method: "POST" },
    ): Promise<{ data: unknown; error: unknown }>;
  };
}

export type PublishResult = { ok: true } | { ok: false; message: string };

const BY_STATUS: Record<number, string> = {
  401: "Sua sessão expirou. Entre de novo.",
  403: "Você não tem permissão para publicar.",
  429: "Você acabou de publicar. Aguarde um minuto e tente de novo.",
  502: "Não foi possível iniciar a publicação agora. Tente de novo em instantes.",
};
const OFFLINE = "Sem conexão. Tente de novo.";

function messageFor(error: unknown): string {
  if (error instanceof FunctionsFetchError) return OFFLINE;
  if (error instanceof FunctionsHttpError) {
    // o contexto é a resposta da função; o corpo nunca vai para a tela
    const status: unknown = (error.context as { status?: unknown } | null)?.status;
    return (typeof status === "number" && BY_STATUS[status]) || GENERIC;
  }
  return GENERIC;
}

export async function publishSite(
  client: PublishClient | null = getBrowserClient(),
): Promise<PublishResult> {
  if (!client) return { ok: false, message: GENERIC };
  try {
    const { data, error } = await client.functions.invoke("publish-site", { method: "POST" });
    if (error) return { ok: false, message: messageFor(error) };
    const ok = typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === true;
    return ok ? { ok: true } : { ok: false, message: GENERIC };
  } catch {
    return { ok: false, message: GENERIC };
  }
}

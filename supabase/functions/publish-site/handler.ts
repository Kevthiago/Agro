/*
 * Lógica da Edge Function publish-site: confere que quem chama é editor e então
 * dispara o deploy hook do Cloudflare Pages (que reconstrói o site).
 *
 * Só usa APIs web padrão (Request, Response, fetch, AbortController), sem nada do
 * Deno, para poder ser testada no vitest. As dependências reais ficam em index.ts.
 *
 * Segurança:
 *   * a URL do hook é segredo: nunca vai para respostas nem para o log;
 *   * o token (JWT) de quem chama também nunca aparece em respostas ou no log;
 *   * ordem das verificações: método → origem (CORS) → cabeçalho Authorization →
 *     é editor? → reserva a vez (uma publicação a cada 60 s) → hook.
 */

export interface Deps {
  /** Origens do site/painel que podem chamar pelo navegador (env ALLOWED_ORIGINS). */
  allowedOrigins: string[];
  /** Deploy hook do Cloudflare Pages (env DEPLOY_HOOK_URL). Segredo. */
  deployHookUrl: string;
  /** O dono do token é editor confirmado? (public.is_editor() com a identidade dele) */
  isEditor(jwt: string): Promise<boolean>;
  /** Reserva a vez de publicar; false se houve publicação nos últimos 60 s. */
  claimPublishSlot(): Promise<boolean>;
  /** Devolve a vez (após falha do hook), para a pessoa poder tentar de novo. */
  releasePublishSlot(): Promise<void>;
  fetch: typeof fetch;
}

/** Tempo máximo esperando o deploy hook responder. */
const HOOK_TIMEOUT_MS = 10_000;
/** Intervalo mínimo entre publicações (igual ao do banco, em claim_publish_slot). */
const RETRY_AFTER_SECONDS = "60";

const ALLOW_METHODS = "POST, OPTIONS";
const ALLOW_HEADERS = "authorization, content-type, apikey, x-client-info";

// Token no formato "Bearer <token>", sem espaços no token.
const BEARER = /^Bearer ([^\s]+)$/;

type Code =
  "unauthorized" | "forbidden" | "rate_limited" | "hook_failed" | "error" | "method_not_allowed";

/** Log só com textos fixos: nada de token, e-mail, URL do hook ou mensagens de erro externas. */
function logFailure(what: string) {
  console.error(`publish-site: ${what}`);
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  // Nunca aceitamos curinga: só origens exatas.
  const origins = new Set(deps.allowedOrigins.filter((o) => o && o !== "*"));

  function corsHeaders(req: Request): Headers {
    const headers = new Headers({ Vary: "Origin" });
    const origin = req.headers.get("Origin");
    if (origin && origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
    return headers;
  }

  function json(
    req: Request,
    status: number,
    payload: { ok: true } | { ok: false; code: Code },
    extra: Record<string, string> = {},
  ) {
    const headers = corsHeaders(req);
    headers.set("Content-Type", "application/json");
    for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    return new Response(JSON.stringify(payload), { status, headers });
  }

  const fail = (req: Request, status: number, code: Code, extra?: Record<string, string>) =>
    json(req, status, { ok: false, code }, extra);

  /** POST no hook (sem corpo), com tempo máximo. true só com resposta 2xx. */
  async function callHook(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOOK_TIMEOUT_MS);
    try {
      const res = await deps.fetch(deps.deployHookUrl, {
        method: "POST",
        signal: controller.signal,
      });
      // o corpo do hook não interessa (e nunca é repassado)
      await res.body?.cancel().catch(() => {});
      if (!res.ok) logFailure(`hook respondeu ${res.status}`);
      return res.ok;
    } catch {
      logFailure(
        controller.signal.aborted ? "hook sem resposta (tempo esgotado)" : "falha ao chamar o hook",
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function publish(req: Request): Promise<Response> {
    const match = BEARER.exec(req.headers.get("Authorization") ?? "");
    if (!match) return fail(req, 401, "unauthorized");
    const jwt = match[1]!;

    if (!(await deps.isEditor(jwt))) return fail(req, 403, "forbidden");

    if (!deps.deployHookUrl) {
      logFailure("DEPLOY_HOOK_URL não configurado");
      return fail(req, 500, "error");
    }

    if (!(await deps.claimPublishSlot())) {
      return fail(req, 429, "rate_limited", { "Retry-After": RETRY_AFTER_SECONDS });
    }

    if (await callHook()) return json(req, 200, { ok: true });

    try {
      await deps.releasePublishSlot();
    } catch {
      logFailure("falha ao liberar a vez de publicar");
    }
    return fail(req, 502, "hook_failed");
  }

  return async (req: Request): Promise<Response> => {
    try {
      if (req.method === "OPTIONS") {
        const headers = corsHeaders(req);
        if (headers.has("Access-Control-Allow-Origin")) {
          headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
          headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
          headers.set("Access-Control-Max-Age", "600");
        }
        return new Response(null, { status: 204, headers });
      }
      if (req.method !== "POST")
        return fail(req, 405, "method_not_allowed", { Allow: ALLOW_METHODS });
      return await publish(req);
    } catch {
      logFailure("erro inesperado");
      return fail(req, 500, "error");
    }
  };
}

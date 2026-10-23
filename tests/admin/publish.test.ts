import { describe, expect, it, vi } from "vitest";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { publishSite, type PublishClient } from "@/admin/publish";
import { GENERIC } from "@/admin/errors";

type Invoke = PublishClient["functions"]["invoke"];

function client(invoke: Invoke) {
  const fn = vi.fn<Invoke>(invoke);
  return { client: { functions: { invoke: fn } } satisfies PublishClient, invoke: fn };
}

/** Erro HTTP como o supabase-js devolve: o contexto é a resposta da função. */
function httpError(status: number) {
  return new FunctionsHttpError(new Response('{"ok":false,"code":"x"}', { status }));
}

describe("publishSite", () => {
  it("chama a função publish-site com POST e devolve ok", async () => {
    const { client: c, invoke } = client(async () => ({ data: { ok: true }, error: null }));
    expect(await publishSite(c)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("publish-site", { method: "POST" });
  });

  it.each([
    [429, "Você acabou de publicar. Aguarde um minuto e tente de novo."],
    [403, "Você não tem permissão para publicar."],
    [401, "Sua sessão expirou. Entre de novo."],
    [502, "Não foi possível iniciar a publicação agora. Tente de novo em instantes."],
    [500, GENERIC],
    [405, GENERIC],
  ])("status %i vira mensagem amigável", async (status, message) => {
    const { client: c } = client(async () => ({ data: null, error: httpError(status) }));
    expect(await publishSite(c)).toEqual({ ok: false, message });
  });

  it("falha de rede vira 'Sem conexão'", async () => {
    const { client: c } = client(async () => ({
      data: null,
      error: new FunctionsFetchError(new TypeError("Failed to fetch")),
    }));
    expect(await publishSite(c)).toEqual({ ok: false, message: "Sem conexão. Tente de novo." });
  });

  it("erro do relay vira a mensagem genérica", async () => {
    const { client: c } = client(async () => ({
      data: null,
      error: new FunctionsRelayError({ message: "relay boom" }),
    }));
    expect(await publishSite(c)).toEqual({ ok: false, message: GENERIC });
  });

  it("exceção qualquer vira a mensagem genérica (nunca o texto cru)", async () => {
    const { client: c } = client(async () => {
      throw new TypeError("boom");
    });
    expect(await publishSite(c)).toEqual({ ok: false, message: GENERIC });
  });

  it("resposta 2xx sem ok:true não conta como publicado", async () => {
    const { client: c } = client(async () => ({ data: "texto", error: null }));
    expect(await publishSite(c)).toEqual({ ok: false, message: GENERIC });
  });

  it("sem cliente configurado devolve a mensagem genérica", async () => {
    expect(await publishSite(null)).toEqual({ ok: false, message: GENERIC });
  });
});

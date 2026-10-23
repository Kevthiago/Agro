import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandler, type Deps } from "../../supabase/functions/publish-site/handler";

/*
 * Testes da Edge Function publish-site (só o handler, com APIs web padrão).
 * Nenhum valor aqui é real: URL do hook e token são inventados.
 */

const HOOK = "https://hooks.example.invalid/deploy/segredo-do-hook";
const JWT = "eyJhbGciOiJIUzI1NiJ9.token-de-teste.assinatura";
const SITE = "https://loja.example";

function setup(overrides: Partial<Deps> = {}) {
  const deps = {
    allowedOrigins: [SITE, "http://localhost:4321"],
    deployHookUrl: HOOK,
    isEditor: vi.fn<Deps["isEditor"]>(async () => true),
    claimPublishSlot: vi.fn<Deps["claimPublishSlot"]>(async () => true),
    releasePublishSlot: vi.fn<Deps["releasePublishSlot"]>(async () => {}),
    fetch: vi.fn<typeof fetch>(async () => new Response("hook ok", { status: 200 })),
    ...overrides,
  };
  return { deps, handle: createHandler(deps) };
}

function request(init: { method?: string; auth?: string | null; origin?: string } = {}) {
  const headers = new Headers();
  if (init.auth !== null) headers.set("Authorization", init.auth ?? `Bearer ${JWT}`);
  if (init.origin) headers.set("Origin", init.origin);
  return new Request("http://localhost/functions/v1/publish-site", {
    method: init.method ?? "POST",
    headers,
  });
}

/** Lê o corpo e garante que nunca vaza o hook nem o token. */
async function body(res: Response): Promise<unknown> {
  const text = await res.text();
  expect(text).not.toContain(HOOK);
  expect(text).not.toContain("segredo");
  expect(text).not.toContain(JWT);
  expect(res.headers.get("Content-Type")).toBe("application/json");
  return JSON.parse(text);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("publish-site: autenticação", () => {
  it("sem Authorization responde 401 sem chamar nada", async () => {
    const { deps, handle } = setup();
    const res = await handle(request({ auth: null }));
    expect(res.status).toBe(401);
    expect(await body(res)).toEqual({ ok: false, code: "unauthorized" });
    expect(deps.isEditor).not.toHaveBeenCalled();
    expect(deps.claimPublishSlot).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it.each(["Basic abc", "Bearer", "Bearer ", "token-sem-tipo", `Bearer ${JWT} extra`])(
    "Authorization malformado (%s) responde 401",
    async (auth) => {
      const { deps, handle } = setup();
      const res = await handle(request({ auth }));
      expect(res.status).toBe(401);
      expect(await body(res)).toEqual({ ok: false, code: "unauthorized" });
      expect(deps.isEditor).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    },
  );

  it("quem não é editor recebe 403; não reserva a vez nem chama o hook", async () => {
    const { deps, handle } = setup({ isEditor: vi.fn(async () => false) });
    const res = await handle(request());
    expect(res.status).toBe(403);
    expect(await body(res)).toEqual({ ok: false, code: "forbidden" });
    expect(deps.isEditor).toHaveBeenCalledWith(JWT);
    expect(deps.claimPublishSlot).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});

describe("publish-site: publicação", () => {
  it("editor publica: 200 e o hook é chamado uma vez com POST", async () => {
    const { deps, handle } = setup();
    const res = await handle(request());
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
    expect(deps.claimPublishSlot).toHaveBeenCalledTimes(1);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!;
    expect(url).toBe(HOOK);
    expect(init?.method).toBe("POST");
    expect(init?.body ?? null).toBeNull();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(deps.releasePublishSlot).not.toHaveBeenCalled();
  });

  it("segunda publicação dentro de 60 s responde 429 com Retry-After e não chama o hook", async () => {
    const { deps, handle } = setup({ claimPublishSlot: vi.fn(async () => false) });
    const res = await handle(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await body(res)).toEqual({ ok: false, code: "rate_limited" });
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.releasePublishSlot).not.toHaveBeenCalled();
  });

  it("hook respondendo 500 vira 502 e libera a vez", async () => {
    const { deps, handle } = setup({
      fetch: vi.fn<typeof fetch>(async () => new Response(`erro em ${HOOK}`, { status: 500 })),
    });
    const res = await handle(request());
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ ok: false, code: "hook_failed" });
    expect(deps.releasePublishSlot).toHaveBeenCalledTimes(1);
  });

  it("hook que não responde em 10 s é abortado: 502 e libera a vez", async () => {
    vi.useFakeTimers();
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error(`abort ${HOOK}`)));
        }),
    );
    const { deps, handle } = setup({ fetch: hang });
    const pending = handle(request());
    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.mocked(hang).mock.calls[0]![1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ ok: false, code: "hook_failed" });
    expect(deps.releasePublishSlot).toHaveBeenCalledTimes(1);
  });

  it("fetch que lança erro vira 502 e libera a vez", async () => {
    const { deps, handle } = setup({
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError(`falha ao conectar em ${HOOK}`);
      }),
    });
    const res = await handle(request());
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ ok: false, code: "hook_failed" });
    expect(deps.releasePublishSlot).toHaveBeenCalledTimes(1);
  });

  it("falha ao liberar a vez ainda responde 502", async () => {
    const { handle } = setup({
      fetch: vi.fn<typeof fetch>(async () => new Response("", { status: 503 })),
      releasePublishSlot: vi.fn(async () => {
        throw new Error("db fora");
      }),
    });
    const res = await handle(request());
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ ok: false, code: "hook_failed" });
  });

  it("falha ao reservar a vez responde 500 e não chama o hook", async () => {
    const { deps, handle } = setup({
      claimPublishSlot: vi.fn(async () => {
        throw new Error("db fora");
      }),
    });
    const res = await handle(request());
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ ok: false, code: "error" });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("falha ao verificar o editor responde 500 e não reserva a vez", async () => {
    const { deps, handle } = setup({
      isEditor: vi.fn(async () => {
        throw new Error("db fora");
      }),
    });
    const res = await handle(request());
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ ok: false, code: "error" });
    expect(deps.claimPublishSlot).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("sem DEPLOY_HOOK_URL configurado responde 500 e não reserva a vez", async () => {
    const { deps, handle } = setup({ deployHookUrl: "" });
    const res = await handle(request());
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ ok: false, code: "error" });
    expect(deps.claimPublishSlot).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("não escreve no log o token nem o hook", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { handle } = setup({
      fetch: vi.fn<typeof fetch>(async () => {
        throw new TypeError(`falha ao conectar em ${HOOK}`);
      }),
    });
    await handle(request());
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("segredo");
    expect(logged).not.toContain(JWT);
  });
});

describe("publish-site: método e CORS", () => {
  it.each(["GET", "PUT", "DELETE", "PATCH"])("%s responde 405", async (method) => {
    const { deps, handle } = setup();
    const res = await handle(request({ method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(await body(res)).toEqual({ ok: false, code: "method_not_allowed" });
    expect(deps.isEditor).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("OPTIONS de origem permitida responde 204 com os cabeçalhos de CORS", async () => {
    const { deps, handle } = setup();
    const res = await handle(request({ method: "OPTIONS", origin: SITE, auth: null }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "authorization, content-type, apikey, x-client-info",
    );
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(deps.isEditor).not.toHaveBeenCalled();
  });

  it("OPTIONS de origem não permitida não recebe Access-Control-Allow-Origin", async () => {
    const { handle } = setup();
    const res = await handle(
      request({ method: "OPTIONS", origin: "https://malicioso.example", auth: null }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("nunca usa curinga, mesmo com '*' na lista", async () => {
    const { handle } = setup({ allowedOrigins: ["*"] });
    const res = await handle(request({ method: "OPTIONS", origin: SITE, auth: null }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("POST de origem permitida devolve a origem nas respostas, inclusive de erro", async () => {
    const { handle } = setup({ isEditor: vi.fn(async () => false) });
    const ok = await handle(request({ origin: SITE }));
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
    expect(ok.headers.get("Vary")).toBe("Origin");
    const bad = await handle(request({ origin: "https://malicioso.example" }));
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

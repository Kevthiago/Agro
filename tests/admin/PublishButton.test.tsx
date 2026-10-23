// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { FunctionsHttpError } from "@supabase/supabase-js";
import PublishButton from "@/admin/PublishButton";
import type { PublishClient } from "@/admin/publish";
import { GENERIC } from "@/admin/errors";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Invoke = PublishClient["functions"]["invoke"];
type Result = Awaited<ReturnType<Invoke>>;

const LABEL = "Publicar alterações";
const SUCCESS = "Publicado. O site atualiza em 1 a 2 minutos.";
const WAIT = "Aguarde um minuto para publicar de novo.";

/** Deixa as promessas pendentes andarem (funciona também com relógio falso). */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Cliente cuja chamada só termina quando o teste mandar. */
function deferredClient() {
  let finish: (r: Result) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const invoke = vi.fn<Invoke>(
    () =>
      new Promise<Result>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
  );
  return {
    client: { functions: { invoke } } satisfies PublishClient,
    invoke,
    finish: (r: Result) =>
      act(async () => {
        finish(r);
        await settle();
      }),
    fail: (e: unknown) =>
      act(async () => {
        fail(e);
        await settle();
      }),
  };
}

const button = () => screen.getByRole("button");

describe("<PublishButton />", () => {
  it("mostra o botão e o texto de ajuda", () => {
    const { client } = deferredClient();
    render(<PublishButton client={client} />);
    expect(button().textContent).toBe(LABEL);
    expect(button().getAttribute("aria-disabled")).toBe("false");
    expect(screen.getByText("As mudanças só aparecem no site depois de publicar.")).toBeTruthy();
  });

  it("publica: 'Publicando…', depois aviso de sucesso e espera de um minuto", async () => {
    vi.useFakeTimers();
    const { client, invoke, finish } = deferredClient();
    render(<PublishButton client={client} />);
    button().focus();
    fireEvent.click(button());

    expect(button().textContent).toBe("Publicando…");
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button());

    await finish({ data: { ok: true }, error: null });
    expect(screen.getByRole("status").textContent).toBe(SUCCESS);
    expect(screen.getByRole("alert").textContent).toBe("");
    expect(button().textContent).toBe(WAIT);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(button());

    // durante a espera, clicar não publica de novo
    fireEvent.click(button());
    expect(invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(button().textContent).toBe(LABEL);
    expect(button().getAttribute("aria-disabled")).toBe("false");
  });

  it("não publica duas vezes com cliques seguidos", async () => {
    const { client, invoke, finish } = deferredClient();
    render(<PublishButton client={client} />);
    fireEvent.click(button());
    fireEvent.click(button());
    fireEvent.click(button());
    expect(invoke).toHaveBeenCalledTimes(1);
    await finish({ data: { ok: true }, error: null });
  });

  it.each([
    [429, "Você acabou de publicar. Aguarde um minuto e tente de novo."],
    [403, "Você não tem permissão para publicar."],
    [401, "Sua sessão expirou. Entre de novo."],
    [502, "Não foi possível iniciar a publicação agora. Tente de novo em instantes."],
  ])("erro %i aparece como alerta e o botão volta", async (status, message) => {
    const { client, finish } = deferredClient();
    render(<PublishButton client={client} />);
    fireEvent.click(button());
    await finish({ data: null, error: new FunctionsHttpError(new Response("{}", { status })) });
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(button().textContent).toBe(LABEL);
    expect(button().getAttribute("aria-disabled")).toBe("false");
  });

  it("exceção inesperada mostra a mensagem genérica, nunca o texto cru", async () => {
    const { client, fail } = deferredClient();
    render(<PublishButton client={client} />);
    fireEvent.click(button());
    await fail(new TypeError("boom"));
    expect(screen.getByRole("alert").textContent).toBe(GENERIC);
    expect(document.body.textContent).not.toContain("boom");
  });

  it("nova tentativa limpa o erro anterior", async () => {
    const { client, finish } = deferredClient();
    render(<PublishButton client={client} />);
    fireEvent.click(button());
    await finish({
      data: null,
      error: new FunctionsHttpError(new Response("{}", { status: 502 })),
    });
    fireEvent.click(button());
    expect(screen.getByRole("alert").textContent).toBe("");
    await finish({ data: { ok: true }, error: null });
    expect(screen.getByRole("status").textContent).toBe(SUCCESS);
  });
});

import { describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { checkIsEditor, signInWithGoogle, signInWithPassword, signOut } from "@/admin/auth";
import { AdminError } from "@/admin/errors";
import { fakeClient } from "./fake-client";

// Ambiente node: a origem da página é simulada.
vi.stubGlobal("location", { origin: "https://loja.example" });

const WRONG = "E-mail ou senha incorretos.";
const OFFLINE = "Não foi possível entrar agora. Verifique a conexão e tente de novo.";
const GOOGLE = "Não foi possível entrar com o Google agora. Tente de novo.";

describe("checkIsEditor", () => {
  it("é editor só quando o banco responde true", async () => {
    const { client } = fakeClient({ rpc: { data: true, error: null } });
    expect(await checkIsEditor(client)).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("is_editor");
  });

  it.each([
    ["false", { data: false, error: null }],
    ["null", { data: null, error: null }],
    ["texto", { data: "true", error: null }],
    ["erro", { data: null, error: { message: "permission denied" } }],
    ["true com erro", { data: true, error: { message: "x" } }],
  ])("não é editor quando o banco responde %s", async (_, rpc) => {
    const { client } = fakeClient({ rpc });
    expect(await checkIsEditor(client)).toBe(false);
  });

  it("não é editor quando a consulta falha", async () => {
    const { client } = fakeClient({ rpc: new TypeError("Failed to fetch") });
    expect(await checkIsEditor(client)).toBe(false);
  });

  it("não é editor quando o painel não está configurado", async () => {
    expect(await checkIsEditor(null)).toBe(false);
  });
});

describe("signInWithPassword", () => {
  it("entra com e-mail e senha", async () => {
    const { client } = fakeClient();
    await expect(signInWithPassword("a@b.com", "segredo", client)).resolves.toBeUndefined();
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "segredo",
    });
  });

  it("qualquer recusa vira a mesma mensagem (sem revelar se o e-mail existe)", async () => {
    for (const error of [
      new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
      new AuthApiError("Email not confirmed", 400, "email_not_confirmed"),
    ]) {
      const { client } = fakeClient();
      client.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error });
      await expect(signInWithPassword("a@b.com", "x", client)).rejects.toThrow(
        new AdminError(WRONG),
      );
    }
  });

  it("falha de rede vira a mensagem de conexão", async () => {
    const { client } = fakeClient();
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthRetryableFetchError("Failed to fetch", 0),
    });
    await expect(signInWithPassword("a@b.com", "x", client)).rejects.toThrow(
      new AdminError(OFFLINE),
    );

    client.auth.signInWithPassword.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(signInWithPassword("a@b.com", "x", client)).rejects.toThrow(
      new AdminError(OFFLINE),
    );
  });

  it("as mensagens são AdminError (podem aparecer na tela)", async () => {
    const { client } = fakeClient();
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const thrown = await signInWithPassword("a@b.com", "x", client).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(AdminError);
  });
});

describe("signInWithGoogle", () => {
  it("volta para /admin da própria origem", async () => {
    const { client } = fakeClient();
    await signInWithGoogle(client);
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${location.origin}/admin` },
    });
  });

  it("recusa ou falha do Google vira mensagem própria (AdminError)", async () => {
    const { client } = fakeClient();
    client.auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: new Error("raw") });
    await expect(signInWithGoogle(client)).rejects.toThrow(new AdminError(GOOGLE));

    client.auth.signInWithOAuth.mockRejectedValueOnce(new TypeError("boom"));
    const thrown = await signInWithGoogle(client).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(AdminError);
    expect((thrown as Error).message).toBe(GOOGLE);
  });
});

describe("signOut", () => {
  it("sai da conta", async () => {
    const { client } = fakeClient();
    await signOut(client);
    expect(client.auth.signOut).toHaveBeenCalled();
  });

  it("se o servidor falhar, ao menos encerra a sessão neste aparelho", async () => {
    const { client } = fakeClient();
    client.auth.signOut.mockResolvedValueOnce({ error: new Error("offline") });
    await signOut(client);
    expect(client.auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import App from "@/admin/App";
import { fakeClient, fakeSession } from "./fake-client";

afterEach(cleanup);

const DENIED = "Você não tem permissão para editar o catálogo.";

describe("<App />", () => {
  it("sem as variáveis do Supabase avisa que o painel não está configurado", () => {
    render(<App client={null} />);
    expect(
      screen.getByText(
        "Painel não configurado. Defina PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY.",
      ),
    ).toBeTruthy();
  });

  it("mostra carregando enquanto a sessão não é conhecida", () => {
    const { client } = fakeClient();
    render(<App client={client} />);
    expect(screen.getByRole("status").textContent).toMatch(/Carregando/);
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull();
  });

  it("sem sessão mostra a tela de entrar", async () => {
    const { client } = fakeClient({ session: null });
    render(<App client={client} />);
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeTruthy();
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
    expect(screen.getByLabelText("Senha")).toBeTruthy();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("sessão de quem não é editor mostra a mensagem de sem permissão", async () => {
    const { client } = fakeClient({ session: fakeSession(), rpc: { data: false, error: null } });
    render(<App client={client} />);
    expect(await screen.findByText(DENIED)).toBeTruthy();
    expect(screen.queryByText("Painel de produtos")).toBeNull();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
  });

  it("erro na consulta de permissão também nega o acesso", async () => {
    const { client } = fakeClient({ session: fakeSession(), rpc: new Error("offline") });
    render(<App client={client} />);
    expect(await screen.findByText(DENIED)).toBeTruthy();
  });

  it("editor vê o painel de produtos", async () => {
    const { client } = fakeClient({ session: fakeSession(), rpc: { data: true, error: null } });
    render(<App client={client} />);
    expect(await screen.findByRole("heading", { name: "Painel de produtos" })).toBeTruthy();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("Sair encerra a sessão e volta para a tela de entrar", async () => {
    const { client, emit } = fakeClient({
      session: fakeSession(),
      rpc: { data: true, error: null },
    });
    client.auth.signOut.mockImplementation(async () => {
      emit("SIGNED_OUT", null);
      return { error: null };
    });
    render(<App client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sair" }));
    await waitFor(() => expect(client.auth.signOut).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("para de ouvir a autenticação ao desmontar", async () => {
    const { client, unsubscribe } = fakeClient({ session: null });
    const { unmount } = render(<App client={client} />);
    await screen.findByRole("button", { name: "Entrar" });
    unmount();
    // o Preact roda a limpeza dos efeitos logo depois de desmontar
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });

  it("resposta atrasada de uma sessão antiga não abre o painel para a sessão nova", async () => {
    const { client, emit } = fakeClient({ session: fakeSession("u1") });
    // a verificação da sessão A fica pendurada até o fim do teste
    let resolveA!: (value: { data: unknown; error: unknown }) => void;
    client.rpc.mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)));
    // registra se o painel aparece em qualquer momento, não só no fim
    let panelSeen = false;
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes("Painel de produtos")) panelSeen = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    render(<App client={client} />);
    await waitFor(() => expect(client.rpc).toHaveBeenCalledTimes(1));

    emit("SIGNED_OUT", null);
    await screen.findByRole("button", { name: "Entrar" });
    emit("SIGNED_IN", fakeSession("u2")); // rpc padrão do fake: false
    expect(await screen.findByText(DENIED)).toBeTruthy();
    expect(client.rpc).toHaveBeenCalledTimes(2);

    resolveA({ data: true, error: null });
    await new Promise((r) => setTimeout(r, 20));
    observer.disconnect();

    expect(panelSeen).toBe(false);
    expect(screen.queryByRole("heading", { name: "Painel de produtos" })).toBeNull();
    expect(screen.getByText(DENIED)).toBeTruthy();
  });

  it("renovação do token da mesma pessoa não consulta a permissão de novo", async () => {
    const { client, emit } = fakeClient({
      session: fakeSession("u1"),
      rpc: { data: true, error: null },
    });
    render(<App client={client} />);
    await screen.findByRole("heading", { name: "Painel de produtos" });

    emit("TOKEN_REFRESHED", fakeSession("u1"));
    await new Promise((r) => setTimeout(r, 20));

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Painel de produtos" })).toBeTruthy();
  });
});

describe("<LoginScreen /> dentro do <App />", () => {
  it("senha errada aparece num alerta e o botão volta a funcionar", async () => {
    const { client } = fakeClient({ session: null });
    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: Object.assign(new Error("Invalid login credentials"), { status: 400 }),
    });
    render(<App client={client} />);
    fireEvent.input(await screen.findByLabelText("E-mail"), {
      target: { value: "a@b.com" },
    });
    fireEvent.input(screen.getByLabelText("Senha"), { target: { value: "errada" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("E-mail ou senha incorretos."),
    );
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "errada",
    });
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { AdminError, GENERIC } from "@/admin/errors";
import LoginScreen from "@/admin/LoginScreen";
import { fakeClient } from "./fake-client";

// As funções de entrar são trocadas para simular falhas que escapam do tratamento.
const auth = vi.hoisted(() => ({
  signInWithGoogle: vi.fn<() => Promise<void>>(),
  signInWithPassword: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/admin/auth", () => auth);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function submitPassword() {
  const { client } = fakeClient();
  render(<LoginScreen client={client} />);
  fireEvent.input(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
  fireEvent.input(screen.getByLabelText("Senha"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("<LoginScreen />", () => {
  it("erro inesperado mostra a mensagem genérica, nunca o texto cru", async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new TypeError("boom"));
    await submitPassword();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(GENERIC));
    expect(document.body.textContent).not.toContain("boom");
  });

  it("mensagem nossa (AdminError) aparece como está", async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new AdminError("E-mail ou senha incorretos."));
    await submitPassword();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("E-mail ou senha incorretos."),
    );
  });

  it("falha do Google com texto cru também vira a mensagem genérica", async () => {
    auth.signInWithGoogle.mockRejectedValueOnce(new Error("oauth provider exploded"));
    const { client } = fakeClient();
    render(<LoginScreen client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar com Google" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(GENERIC));
  });
});

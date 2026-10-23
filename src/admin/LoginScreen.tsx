import { useState } from "preact/hooks";
import { signInWithGoogle, signInWithPassword, type AdminClient } from "@/admin/auth";
import { friendlyMessage } from "@/admin/errors";

interface Props {
  client: AdminClient;
}

/** Entrada do painel: Google ou e-mail e senha. Só convidados (sem cadastro aqui). */
export default function LoginScreen({ client }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      // só mensagens nossas (AdminError) vão para a tela; o resto vira a genérica
      setError(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="admin-cartao" aria-labelledby="entrar-titulo">
      <h1 id="entrar-titulo" class="admin-titulo">
        Entrar no painel
      </h1>
      <p class="mt-3 text-lg">Use a conta cadastrada pela loja.</p>

      <button
        type="button"
        class="admin-botao admin-botao-claro mt-6 w-full"
        disabled={busy}
        onClick={() => run(() => signInWithGoogle(client))}
      >
        Entrar com Google
      </button>

      <p class="admin-ou" aria-hidden="true">
        ou
      </p>

      <form
        class="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => signInWithPassword(email.trim(), password, client));
        }}
      >
        <div class="grid gap-2">
          <label for="entrar-email" class="font-bold">
            E-mail
          </label>
          <input
            id="entrar-email"
            class="admin-campo"
            type="email"
            name="email"
            autocomplete="username"
            required
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>
        <div class="grid gap-2">
          <label for="entrar-senha" class="font-bold">
            Senha
          </label>
          <input
            id="entrar-senha"
            class="admin-campo"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
        </div>
        <button type="submit" class="admin-botao w-full" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p role="alert" class="admin-erro">
        {error}
      </p>
    </section>
  );
}

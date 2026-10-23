import { useEffect, useRef, useState } from "preact/hooks";
import type { Session } from "@supabase/supabase-js";
import logo from "@/assets/agrosantos.png";
import { checkIsEditor, signOut, type AdminClient } from "@/admin/auth";
import LoginScreen from "@/admin/LoginScreen";
import ProductsPanel from "@/admin/ProductsPanel";
import { getBrowserClient } from "@/admin/supabase-browser";

type View = "loading" | "signedOut" | "denied" | "editor";

interface Props {
  /** Injetável nos testes; `null` = variáveis do Supabase ausentes. */
  client?: AdminClient | null;
}

/** Painel da loja: decide entre entrar, sem permissão e a edição do catálogo. */
export default function App({ client = getBrowserClient() }: Props) {
  const [view, setView] = useState<View>("loading");
  const body = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    // Cada sessão nova invalida a verificação anterior que ainda esteja em andamento.
    let current = 0;
    let lastUser: string | null | undefined;

    const resolve = (session: Session | null) => {
      const user = session?.user.id ?? null;
      // Renovação do token da mesma pessoa não muda nada na tela.
      if (user === lastUser) return;
      lastUser = user;
      const run = ++current;
      if (!user) {
        setView("signedOut");
        return;
      }
      setView("loading");
      void checkIsEditor(client).then((isEditor) => {
        if (active && run === current) setView(isEditor ? "editor" : "denied");
      });
    };

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      // Fora do callback: chamar o Supabase dentro dele pode travar a biblioteca.
      setTimeout(() => active && resolve(session), 0);
    });
    void client.auth
      .getSession()
      .then(({ data: { session } }) => active && resolve(session))
      .catch(() => active && resolve(null));

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  // Ao trocar de tela (entrou, saiu), o foco vai para o título novo, para o leitor de
  // tela anunciar a mudança. A primeira tela após carregar não rouba o foco.
  useEffect(() => {
    if (view === "loading") return;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const title = body.current?.querySelector("h1");
    if (title) {
      title.tabIndex = -1;
      title.focus();
    }
  }, [view]);

  // A tela de entrar volta pelo evento SIGNED_OUT da biblioteca.
  const leave = () => client && signOut(client).catch(() => {});

  return (
    <div class="admin">
      <header class="admin-barra superficie-escura">
        <img src={logo.src} alt="Agro Santos Agroveterinária" width={144} height={33} />
        <p class="admin-barra-nome">Painel da loja</p>
        {view === "editor" && (
          <button type="button" class="admin-botao admin-botao-sair" onClick={leave}>
            Sair
          </button>
        )}
      </header>

      <div class="admin-corpo" ref={body}>
        {!client ? (
          <section class="admin-cartao" aria-labelledby="config-titulo">
            <h1 id="config-titulo" class="admin-titulo">
              Painel da loja
            </h1>
            <p class="mt-3 text-lg">
              Painel não configurado. Defina PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY.
            </p>
          </section>
        ) : view === "loading" ? (
          <p role="status" class="admin-carregando">
            Carregando…
          </p>
        ) : view === "signedOut" ? (
          <LoginScreen client={client} />
        ) : view === "denied" ? (
          <section class="admin-cartao" aria-labelledby="negado-titulo">
            <h1 id="negado-titulo" class="admin-titulo">
              Sem permissão
            </h1>
            <p class="mt-3 text-lg">Você não tem permissão para editar o catálogo.</p>
            <p class="mt-2">Se isso for um engano, fale com o responsável pela loja.</p>
            <button type="button" class="admin-botao mt-6" onClick={leave}>
              Sair
            </button>
          </section>
        ) : (
          <ProductsPanel />
        )}
      </div>
    </div>
  );
}

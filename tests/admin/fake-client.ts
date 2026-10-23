import { vi } from "vitest";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AdminClient } from "@/admin/auth";
import type { PanelClient } from "@/admin/App";
import { fakeProductsClient } from "./fake-products";

type Listener = (event: AuthChangeEvent, session: Session | null) => void;
type RpcResult = { data: unknown; error: unknown };
type AuthResult = { data: object; error: unknown };

export interface FakeOptions {
  /** Sessão devolvida por getSession; `undefined` = nunca resolve (estado "carregando"). */
  session?: Session | null;
  /** Resposta (ou falha) do rpc("is_editor"). */
  rpc?: RpcResult | Error;
}

/** Sessão mínima: o painel só olha se ela existe e qual é o usuário. */
export function fakeSession(userId = "u1"): Session {
  return { access_token: "t", user: { id: userId } } as Session;
}

/** Cliente Supabase falso, só com o que o painel usa. */
export function fakeClient(options: FakeOptions = {}) {
  const listeners = new Set<Listener>();
  const unsubscribe = vi.fn();
  const rpcResult = options.rpc ?? { data: false, error: null };
  // catálogo vazio: o painel de produtos abre sem nada cadastrado
  const products = fakeProductsClient();

  const client = {
    auth: {
      getSession: vi.fn(() =>
        "session" in options
          ? Promise.resolve({ data: { session: options.session ?? null }, error: null })
          : new Promise<never>(() => {}),
      ),
      onAuthStateChange: vi.fn((listener: Listener) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribe();
                listeners.delete(listener);
              },
            },
          },
        };
      }),
      signInWithOAuth: vi.fn((): Promise<AuthResult> => Promise.resolve({ data: {}, error: null })),
      signInWithPassword: vi.fn((): Promise<AuthResult> =>
        Promise.resolve({ data: {}, error: null }),
      ),
      signOut: vi.fn<AdminClient["auth"]["signOut"]>(() => Promise.resolve({ error: null })),
    },
    // tipado pela interface: cada chamada pode ganhar uma resposta própria (mockImplementationOnce)
    rpc: vi.fn<AdminClient["rpc"]>(() =>
      rpcResult instanceof Error ? Promise.reject(rpcResult) : Promise.resolve(rpcResult),
    ),
    from: products.client.from,
    functions: products.client.functions,
    storage: products.client.storage,
  } satisfies PanelClient;

  /** Simula um evento de autenticação (ex.: SIGNED_OUT). */
  const emit = (event: AuthChangeEvent, session: Session | null) =>
    listeners.forEach((l) => l(event, session));

  return { client, emit, unsubscribe };
}

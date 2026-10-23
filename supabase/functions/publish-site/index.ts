/*
 * Edge Function publish-site (Deno, no Supabase). Liga o handler às dependências reais.
 *
 * Segredos (supabase secrets set ...; ver supabase/functions/.env.example):
 *   DEPLOY_HOOK_URL  deploy hook do Cloudflare Pages
 *   ALLOWED_ORIGINS  origens do site/painel separadas por vírgula
 * Injetadas pelo próprio Supabase: SUPABASE_URL, SUPABASE_ANON_KEY e
 * SUPABASE_SERVICE_ROLE_KEY. A service role só existe aqui, nunca no navegador.
 */
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createHandler } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

const url = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

// Cliente com a service role, só para a tabela publish_state (via funções do banco).
const service = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), noSession);

const handler = createHandler({
  allowedOrigins: env("ALLOWED_ORIGINS")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  deployHookUrl: env("DEPLOY_HOOK_URL"),

  // Pergunta ao banco com a identidade de quem chamou (chave anon + token dele).
  async isEditor(jwt) {
    const asCaller = createClient(url, anonKey, {
      ...noSession,
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await asCaller.rpc("is_editor");
    return !error && data === true;
  },

  // UPDATE atômico no banco: só reserva se a última publicação tem mais de 60 s.
  async claimPublishSlot() {
    const { data, error } = await service.rpc("claim_publish_slot");
    if (error) throw new Error("claim_publish_slot falhou");
    return data === true;
  },

  async releasePublishSlot() {
    const { error } = await service.rpc("release_publish_slot");
    if (error) throw new Error("release_publish_slot falhou");
  },

  fetch: (input, init) => fetch(input, init),
});

Deno.serve(handler);

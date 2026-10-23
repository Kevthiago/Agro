-- 0002_publish_state: controle do botão "Publicar alterações" (Edge Function publish-site).
--
-- Guarda quando foi a última publicação, para limitar a uma a cada 60 segundos.
-- Só a Edge Function, com a service role, mexe aqui. Nenhum cliente (anon ou
-- authenticated) lê ou grava: RLS ligado, sem políticas e sem privilégios.

create table public.publish_state (
  id int primary key check (id = 1),
  last_publish_at timestamptz
);

comment on table public.publish_state is 'Última publicação do site (uma linha). Só a Edge Function publish-site usa.';

insert into public.publish_state (id, last_publish_at) values (1, null);

alter table public.publish_state enable row level security;

-- Revoga também da service_role (que pode ter ganho ALL por padrão) e concede só o usado.
revoke all on table public.publish_state from public, anon, authenticated, service_role;
grant select, update on table public.publish_state to service_role;

-- ---------------------------------------------------------------------------
-- claim_publish_slot(): reserva a vez de publicar.
-- Um único UPDATE condicional (atômico): duas chamadas ao mesmo tempo não
-- conseguem as duas a vez, porque a segunda espera o bloqueio da linha e então
-- reavalia o where com o valor novo. Usa o relógio do banco (now()).
-- ---------------------------------------------------------------------------

create function public.claim_publish_slot()
returns boolean
language sql
volatile
set search_path = ''
as $$
  with claimed as (
    update public.publish_state
    set last_publish_at = now()
    where id = 1
      and (last_publish_at is null or last_publish_at < now() - interval '60 seconds')
    returning id
  )
  select exists (select 1 from claimed);
$$;

comment on function public.claim_publish_slot() is 'Reserva a vez de publicar (no máximo uma a cada 60 s). Só service_role.';

-- release_publish_slot(): devolve a vez quando o deploy hook falha.
create function public.release_publish_slot()
returns void
language sql
volatile
set search_path = ''
as $$
  update public.publish_state set last_publish_at = null where id = 1;
$$;

comment on function public.release_publish_slot() is 'Libera nova publicação após falha do deploy hook. Só service_role.';

revoke all on function public.claim_publish_slot() from public, anon, authenticated, service_role;
revoke all on function public.release_publish_slot() from public, anon, authenticated, service_role;
grant execute on function public.claim_publish_slot() to service_role;
grant execute on function public.release_publish_slot() to service_role;

-- ---------------------------------------------------------------------------
-- service_role nas tabelas de 0001
-- Com auto_expose_new_tables = false (supabase/config.toml), tabelas novas não
-- ganham privilégios automáticos, nem para a service_role. A 0001 contava com
-- esse padrão para a service_role (uso administrativo e testes de integração);
-- aqui ele fica explícito, igual com o padrão ligado ou desligado.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.products to service_role;
grant select, insert, update, delete on table public.editors to service_role;

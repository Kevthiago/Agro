-- 0001_init: catálogo de produtos, lista de editores, RLS e bucket de fotos.
--
-- Modelo de segurança: o site público e o painel usam a chave anon, que é
-- pública. Toda proteção está aqui no banco (RLS + privilégios):
--   * visitantes (anon) e usuários logados comuns só leem produtos publicados;
--   * só editores (e-mail na tabela editors, confirmado) escrevem em products
--     e no bucket product-images;
--   * a tabela editors não é gravável por nenhum cliente. O primeiro editor é
--     adicionado à mão, no SQL Editor do painel do Supabase (como postgres):
--       insert into public.editors (email) values ('fulano@exemplo.com');
--     Use sempre o e-mail em minúsculas.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  -- Slug usado na URL; formato igual ao de src/lib/slug.ts (a-z, 0-9 e hífens).
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 400),
  category text not null check (category in (
    'alimentacao-animal',
    'farmacia-veterinaria',
    'pets',
    'itens-pessoais',
    'jardinagem',
    'ferramentas'
  )),
  -- Caminho do arquivo dentro do bucket product-images (ou null, sem foto).
  image_path text null,
  available boolean not null default true,
  published boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz default now()
);

comment on table public.products is 'Catálogo exibido no site. Leitura pública só de published; escrita só de editores.';

create table public.editors (
  -- Sempre em minúsculas, para a comparação em is_editor() ser exata.
  email text primary key check (email = lower(email) and email like '%_@_%')
);

comment on table public.editors is 'E-mails autorizados a editar o catálogo. Mantida só pelo dono do projeto (SQL Editor).';

alter table public.products enable row level security;
alter table public.editors enable row level security;

-- ---------------------------------------------------------------------------
-- Privilégios de tabela
-- O Supabase concede ALL (inclusive TRUNCATE, que ignora o RLS) a anon e
-- authenticated em tabelas novas. Revogamos tudo e concedemos só o necessário.
-- ---------------------------------------------------------------------------

revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated;

revoke all on table public.editors from anon, authenticated;
grant select on table public.editors to authenticated;

-- ---------------------------------------------------------------------------
-- is_editor(): o usuário atual é um editor autorizado?
--
-- Decisões:
--   * security definer, para ler auth.users e editors sem depender do RLS de
--     editors; search_path vazio e nomes sempre qualificados, para ninguém
--     sequestrar a função com objetos de mesmo nome em outro schema.
--   * O e-mail vem do JWT verificado (auth.jwt() ->> 'email'), comparado em
--     minúsculas. Nunca usamos user_metadata: o próprio usuário pode alterá-lo
--     (inclusive user_metadata.email_verified).
--   * Além disso exigimos que o e-mail do JWT seja o mesmo de auth.users para o
--     sub do token (auth.uid()) e que esse e-mail esteja confirmado
--     (email_confirmed_at não nulo). O JWT do Supabase não traz uma claim
--     confiável de "e-mail verificado" no nível de cima, então a fonte da
--     verdade é auth.users. Isso impede que alguém crie conta com o e-mail de um
--     editor sem confirmar (caso a confirmação esteja desligada no projeto) e
--     faz um usuário apagado perder o acesso mesmo com token ainda válido.
--     Login com Google preenche email_confirmed_at automaticamente.
--   * Só authenticated pode executá-la. As políticas de anon não a chamam.
-- ---------------------------------------------------------------------------

create function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.editors e on e.email = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(auth.jwt() ->> 'email')
  );
$$;

comment on function public.is_editor() is 'Verdadeiro se o usuário logado tem e-mail confirmado presente em editors.';

revoke all on function public.is_editor() from public, anon, authenticated;
grant execute on function public.is_editor() to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Políticas de products
-- (select is_editor()) entre parênteses: o Postgres avalia uma vez por consulta.
-- ---------------------------------------------------------------------------

create policy "products: todos leem publicados"
on public.products for select
to anon, authenticated
using (published);

create policy "products: editores leem tudo"
on public.products for select
to authenticated
using ((select public.is_editor()));

create policy "products: editores inserem"
on public.products for insert
to authenticated
with check ((select public.is_editor()));

create policy "products: editores atualizam"
on public.products for update
to authenticated
using ((select public.is_editor()))
with check ((select public.is_editor()));

create policy "products: editores apagam"
on public.products for delete
to authenticated
using ((select public.is_editor()));

-- ---------------------------------------------------------------------------
-- Políticas de editors
-- Só leitura, e só da própria linha de um editor confirmado (o painel usa isso
-- para saber se mostra a área de edição). Sem políticas de escrita: nenhum
-- cliente insere, altera ou apaga editores.
-- ---------------------------------------------------------------------------

create policy "editors: editor lê a própria linha"
on public.editors for select
to authenticated
using (
  email = lower((select auth.jwt() ->> 'email'))
  and (select public.is_editor())
);

-- ---------------------------------------------------------------------------
-- Armazenamento: bucket público product-images
-- Leitura pública; envio, troca e remoção só por editores; até 2 MB; só
-- WebP, JPEG e PNG (limites aplicados pela API de Storage).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "product-images: leitura pública"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

create policy "product-images: editores enviam"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and (select public.is_editor()));

create policy "product-images: editores atualizam"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and (select public.is_editor()))
with check (bucket_id = 'product-images' and (select public.is_editor()));

create policy "product-images: editores apagam"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and (select public.is_editor()));

-- Testes de segurança (pgTAP) do banco do catálogo.
-- Rodar com: npx supabase test db
-- Todos os usuários e e-mails abaixo são fictícios (domínio .invalid).
begin;

create extension if not exists pgtap with schema extensions;

select plan(102);

-- ---------------------------------------------------------------------------
-- Preparação (como postgres): usuários falsos, editores, produtos e um objeto
-- ---------------------------------------------------------------------------

-- 1111: editor confirmado (e-mail com maiúsculas para provar a comparação em minúsculas)
-- 2222: usuário autenticado comum (fora de editors)
-- 3333: está em editors, mas o e-mail não foi confirmado
insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'Editor@Teste.invalid', now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'intruso@teste.invalid', now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'pendente@teste.invalid', null);

insert into public.editors (email)
values ('editor@teste.invalid'), ('pendente@teste.invalid');

insert into public.products (slug, name, category, published, updated_at)
values
  ('pub-a', 'Produto A', 'pets', true, '2000-01-01'),
  ('pub-b', 'Produto B', 'jardinagem', true, '2000-01-01'),
  ('rascunho', 'Rascunho', 'ferramentas', false, '2000-01-01');

insert into storage.buckets (id, name, public) values ('outro-bucket', 'outro-bucket', false);
insert into storage.objects (bucket_id, name) values ('product-images', 'existente.webp');

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
select has_table('public', 'products', 'tabela products existe');
select has_table('public', 'editors', 'tabela editors existe');
select columns_are('public', 'products',
  array['id', 'slug', 'name', 'description', 'category', 'image_path', 'available', 'published', 'sort_order', 'updated_at'],
  'products tem exatamente as colunas combinadas');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'RLS habilitado em todas as tabelas do schema public');

select ok(
  (select prosecdef from pg_proc where oid = 'public.is_editor()'::regprocedure),
  'is_editor() é security definer');
select ok(
  (select exists (select 1 from unnest(proconfig) c where c in ('search_path=', 'search_path=""', 'search_path=public'))
     from pg_proc where oid = 'public.is_editor()'::regprocedure),
  'is_editor() tem search_path fixo');
select ok(
  (select exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.products'::regclass and not t.tgisinternal limit 1),
  'função do gatilho de updated_at tem search_path fixo');

select function_privs_are('public', 'is_editor', array[]::text[], 'anon', array[]::text[],
  'anon não executa is_editor()');
select function_privs_are('public', 'is_editor', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated executa is_editor()');

-- Restrições de dados
select throws_ok($$insert into public.editors (email) values ('Maiusculo@teste.invalid')$$,
  '23514', null, 'editors só aceita e-mail em minúsculas');
select throws_ok($$insert into public.products (slug, name, category) values ('x1', 'A', 'pets')$$,
  '23514', null, 'nome com 1 caractere é rejeitado');
select throws_ok(format($$insert into public.products (slug, name, category) values ('x2', %L, 'pets')$$, repeat('a', 121)),
  '23514', null, 'nome com 121 caracteres é rejeitado');
select lives_ok(format($$insert into public.products (slug, name, category) values ('x3', %L, 'pets')$$, repeat('a', 120)),
  'nome com 120 caracteres é aceito');
select throws_ok(format($$insert into public.products (slug, name, category, description) values ('x4', 'Nome', 'pets', %L)$$, repeat('a', 401)),
  '23514', null, 'descrição com 401 caracteres é rejeitada');
select throws_ok($$insert into public.products (slug, name, category) values ('x5', 'Nome', 'eletronicos')$$,
  '23514', null, 'categoria fora da lista é rejeitada');
select throws_ok($$insert into public.products (slug, name, category) values ('Slug Ruim/..', 'Nome', 'pets')$$,
  '23514', null, 'slug fora do formato é rejeitado');
select throws_ok($$insert into public.products (slug, name, category) values ('pub-a', 'Outro', 'pets')$$,
  '23505', null, 'slug é único');
delete from public.products where slug = 'x3';

select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images'$$,
  $$values (true, 2097152::bigint, array['image/webp', 'image/jpeg', 'image/png']::text[])$$,
  'bucket product-images é público, 2 MB, só webp/jpeg/png');

-- ---------------------------------------------------------------------------
-- anon (visitante com a chave pública)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select results_eq($$select slug from public.products order by slug$$,
  array['pub-a', 'pub-b'], 'anon vê só produtos publicados');
select throws_ok($$insert into public.products (slug, name, category) values ('anon', 'Anon', 'pets')$$,
  '42501', null, 'anon não insere produto');
select throws_ok($$update public.products set name = 'hackeado'$$,
  '42501', null, 'anon não atualiza produto');
select throws_ok($$delete from public.products$$,
  '42501', null, 'anon não apaga produto');
select throws_ok($$truncate public.products$$,
  '42501', null, 'anon não trunca products');
select throws_ok($$select * from public.editors$$,
  '42501', null, 'anon não lê editors');
select throws_ok($$insert into public.editors (email) values ('anon@teste.invalid')$$,
  '42501', null, 'anon não insere em editors');
select throws_ok($$select public.is_editor()$$,
  '42501', null, 'anon não chama is_editor()');
select results_eq($$select name from storage.objects where bucket_id = 'product-images'$$,
  array['existente.webp'], 'anon lê objetos do bucket product-images');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('product-images', 'anon.webp')$$,
  '42501', null, 'anon não envia imagem');

-- anon tentando se passar por editor só com claims (sem sub de um usuário real)
set local request.jwt.claims = '{"role":"anon","email":"editor@teste.invalid"}';
select results_eq($$select slug from public.products order by slug$$,
  array['pub-a', 'pub-b'], 'anon com e-mail de editor nas claims continua vendo só publicados');
select throws_ok($$insert into public.products (slug, name, category) values ('anon2', 'Anon', 'pets')$$,
  '42501', null, 'anon com e-mail de editor nas claims não insere');

-- ---------------------------------------------------------------------------
-- authenticated fora de editors
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"intruso@teste.invalid","user_metadata":{"email":"editor@teste.invalid","email_verified":true}}';

select is(public.is_editor(), false, 'não editor: is_editor() = false (user_metadata ignorado)');
select results_eq($$select slug from public.products order by slug$$,
  array['pub-a', 'pub-b'], 'não editor vê só publicados');
select throws_ok($$insert into public.products (slug, name, category) values ('intruso', 'Intruso', 'pets')$$,
  '42501', null, 'não editor não insere produto');
-- update/delete negados pelo RLS não dão erro: afetam 0 linhas. Conferido abaixo como postgres.
select lives_ok($$update public.products set name = 'hackeado'$$, 'não editor: update roda sem efeito');
select lives_ok($$delete from public.products$$, 'não editor: delete roda sem efeito');
select throws_ok($$truncate public.products$$,
  '42501', null, 'não editor não trunca products');
select is_empty($$select * from public.editors$$, 'não editor não vê nenhuma linha de editors');
select throws_ok($$insert into public.editors (email) values ('intruso@teste.invalid')$$,
  '42501', null, 'não editor não se adiciona em editors');
select throws_ok($$update public.editors set email = 'intruso@teste.invalid'$$,
  '42501', null, 'não editor não altera editors (sem privilégio)');
select throws_ok($$delete from public.editors$$,
  '42501', null, 'não editor não apaga editors (sem privilégio)');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('product-images', 'intruso.webp')$$,
  '42501', null, 'não editor não envia imagem');
select lives_ok($$update storage.objects set name = 'trocado.webp' where bucket_id = 'product-images'$$,
  'não editor: update em storage.objects roda sem efeito');

-- token com sub de um usuário comum e e-mail de editor (claims inconsistentes)
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"editor@teste.invalid"}';
select is(public.is_editor(), false, 'e-mail de editor com sub de outro usuário não vale');
select throws_ok($$insert into public.products (slug, name, category) values ('forjado', 'Forjado', 'pets')$$,
  '42501', null, 'claims inconsistentes não inserem');

-- usuário em editors com e-mail ainda não confirmado
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","email":"pendente@teste.invalid"}';
select is(public.is_editor(), false, 'editor com e-mail não confirmado não vale');
select throws_ok($$insert into public.products (slug, name, category) values ('pendente', 'Pendente', 'pets')$$,
  '42501', null, 'editor não confirmado não insere');
select is_empty($$select * from public.editors$$, 'editor não confirmado não lê editors');
select results_eq($$select slug from public.products order by slug$$,
  array['pub-a', 'pub-b'], 'editor não confirmado vê só publicados');

-- conferência como postgres: nada mudou
reset role;
select results_eq($$select slug, name from public.products order by slug$$,
  $$values ('pub-a'::text, 'Produto A'::text), ('pub-b', 'Produto B'), ('rascunho', 'Rascunho')$$,
  'tentativas de não editores não alteraram nem apagaram produtos');
select results_eq($$select email from public.editors order by email$$,
  array['editor@teste.invalid', 'pendente@teste.invalid'], 'tentativas de não editores não alteraram editors');
select results_eq($$select name from storage.objects where bucket_id = 'product-images'$$,
  array['existente.webp'], 'tentativas de não editores não alteraram o bucket');

-- ---------------------------------------------------------------------------
-- editor confirmado
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"Editor@Teste.invalid"}';

select is(public.is_editor(), true, 'editor confirmado: is_editor() = true (comparação em minúsculas)');
select results_eq($$select slug from public.products order by slug$$,
  array['pub-a', 'pub-b', 'rascunho'], 'editor vê também os não publicados');
select lives_ok($$insert into public.products (slug, name, category, published) values ('novo', 'Novo', 'pets', false)$$,
  'editor insere produto');
select lives_ok($$update public.products set available = false where slug = 'pub-a'$$,
  'editor atualiza produto');
select lives_ok($$delete from public.products where slug = 'pub-b'$$,
  'editor apaga produto');
select results_eq($$select email from public.editors$$,
  array['editor@teste.invalid'], 'editor lê só a própria linha de editors');
select throws_ok($$insert into public.editors (email) values ('amigo@teste.invalid')$$,
  '42501', null, 'editor não adiciona outros editores pelo cliente');
select throws_ok($$truncate public.products$$,
  '42501', null, 'editor não trunca products');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('product-images', 'editor.webp')$$,
  'editor envia imagem');
select lives_ok($$update storage.objects set name = 'editor-2.webp' where bucket_id = 'product-images' and name = 'editor.webp'$$,
  'editor atualiza imagem');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('outro-bucket', 'x.webp')$$,
  '42501', null, 'editor não escreve em outro bucket');

-- conferência como postgres: as escritas do editor valeram
reset role;
select results_eq($$select slug, available from public.products order by slug$$,
  $$values ('novo'::text, true), ('pub-a', false), ('rascunho', true)$$,
  'insert, update e delete do editor foram aplicados');
select ok((select updated_at > '2000-01-02' from public.products where slug = 'pub-a'),
  'gatilho atualizou updated_at');
select ok((select updated_at = '2000-01-01' from public.products where slug = 'rascunho'),
  'linha não alterada manteve updated_at');
select results_eq($$select name from storage.objects where bucket_id = 'product-images' order by name$$,
  array['editor-2.webp', 'existente.webp'], 'imagem do editor está no bucket');

-- ---------------------------------------------------------------------------
-- publish_state (0002): só a service_role (Edge Function publish-site) usa
-- ---------------------------------------------------------------------------
select has_table('public', 'publish_state', 'tabela publish_state existe');
select results_eq($$select id, last_publish_at from public.publish_state$$,
  $$values (1, null::timestamptz)$$, 'publish_state tem uma única linha, ainda sem publicação');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'publish_state'),
  0, 'publish_state não tem políticas (nenhum cliente acessa)');
select table_privs_are('public', 'publish_state', 'anon', array[]::text[],
  'anon não tem privilégios em publish_state');
select table_privs_are('public', 'publish_state', 'authenticated', array[]::text[],
  'authenticated não tem privilégios em publish_state');
select table_privs_are('public', 'publish_state', 'service_role', array['SELECT', 'UPDATE'],
  'service_role só lê e atualiza publish_state');
select function_privs_are('public', 'claim_publish_slot', array[]::text[], 'anon', array[]::text[],
  'anon não executa claim_publish_slot()');
select function_privs_are('public', 'claim_publish_slot', array[]::text[], 'authenticated', array[]::text[],
  'authenticated não executa claim_publish_slot()');
select function_privs_are('public', 'claim_publish_slot', array[]::text[], 'service_role', array['EXECUTE'],
  'service_role executa claim_publish_slot()');
select function_privs_are('public', 'release_publish_slot', array[]::text[], 'anon', array[]::text[],
  'anon não executa release_publish_slot()');
select function_privs_are('public', 'release_publish_slot', array[]::text[], 'authenticated', array[]::text[],
  'authenticated não executa release_publish_slot()');
select function_privs_are('public', 'release_publish_slot', array[]::text[], 'service_role', array['EXECUTE'],
  'service_role executa release_publish_slot()');

-- anon
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.publish_state$$, '42501', null, 'anon não lê publish_state');
select throws_ok($$insert into public.publish_state (id) values (1)$$, '42501', null, 'anon não insere em publish_state');
select throws_ok($$update public.publish_state set last_publish_at = null$$, '42501', null, 'anon não altera publish_state');
select throws_ok($$delete from public.publish_state$$, '42501', null, 'anon não apaga publish_state');
select throws_ok($$select public.claim_publish_slot()$$, '42501', null, 'anon não reserva a vez de publicar');
select throws_ok($$select public.release_publish_slot()$$, '42501', null, 'anon não libera a vez de publicar');

-- authenticated fora de editors
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"intruso@teste.invalid"}';
select throws_ok($$select * from public.publish_state$$, '42501', null, 'não editor não lê publish_state');
select throws_ok($$insert into public.publish_state (id) values (1)$$, '42501', null, 'não editor não insere em publish_state');
select throws_ok($$update public.publish_state set last_publish_at = null$$, '42501', null, 'não editor não altera publish_state');
select throws_ok($$delete from public.publish_state$$, '42501', null, 'não editor não apaga publish_state');
select throws_ok($$select public.claim_publish_slot()$$, '42501', null, 'não editor não reserva a vez de publicar');
select throws_ok($$select public.release_publish_slot()$$, '42501', null, 'não editor não libera a vez de publicar');

-- editor confirmado: também não acessa direto (só pela Edge Function)
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"editor@teste.invalid"}';
select throws_ok($$select * from public.publish_state$$, '42501', null, 'editor não lê publish_state direto');
select throws_ok($$insert into public.publish_state (id) values (1)$$, '42501', null, 'editor não insere em publish_state');
select throws_ok($$update public.publish_state set last_publish_at = null$$, '42501', null, 'editor não altera publish_state direto');
select throws_ok($$delete from public.publish_state$$, '42501', null, 'editor não apaga publish_state');
select throws_ok($$select public.claim_publish_slot()$$, '42501', null, 'editor não reserva a vez direto');
select throws_ok($$select public.release_publish_slot()$$, '42501', null, 'editor não libera a vez direto');

-- service_role: uma publicação a cada 60 s
reset role;
set local role service_role;
select is(public.claim_publish_slot(), true, 'service_role reserva a vez quando não houve publicação');
select is(public.claim_publish_slot(), false, 'segunda reserva dentro de 60 s é recusada');
select throws_ok($$insert into public.publish_state (id) values (2)$$, '42501', null, 'service_role não insere em publish_state');
select lives_ok($$select public.release_publish_slot()$$, 'service_role libera a vez');
select is(public.claim_publish_slot(), true, 'depois de liberar, a reserva volta a funcionar');
reset role;
update public.publish_state set last_publish_at = now() - interval '61 seconds';
set local role service_role;
select is(public.claim_publish_slot(), true, 'passados 60 s, a reserva funciona de novo');
reset role;

select * from finish();
rollback;

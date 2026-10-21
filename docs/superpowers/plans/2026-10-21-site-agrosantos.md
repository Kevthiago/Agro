# Site da Agropecuária Santos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o site acadêmico por um site estático real (Astro) com catálogo que direciona tudo ao WhatsApp e um painel `/admin` (Supabase) para a família editar só os produtos.

**Architecture:** Astro gera HTML estático. No build, `src/lib/products.ts` lê os produtos do Supabase com a chave pública (anon) e o build **falha** se o banco não responder. O painel (`/admin`, ilhas Preact) grava direto no Supabase sob RLS; o botão "Publicar alterações" chama uma Edge Function que valida o editor e dispara o deploy hook da Cloudflare Pages.

**Tech Stack:** Astro, Tailwind CSS, Preact (só no admin), TypeScript, Vitest, Playwright + axe-core, Supabase (Postgres, Auth, Storage, Edge Functions), GitHub Actions, Cloudflare Pages. Usar a versão estável atual de cada um na hora da implementação e deixá-las fixadas no `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-21-site-agrosantos-design.md` (referência visual: `docs/superpowers/specs/2026-10-21-balcao-mockup.html`).

## Global Constraints

- Sem carrinho, checkout, pagamento, login de cliente, newsletter, preços ou "Consulte".
- Cores: petróleo `#3C7785`, petróleo-escuro `#1F4752`, laranja `#E27D36`, tinta `#12262C`, palha `#EDEFE6`, madeira `#5a4630`. Sem creme quente.
- Fontes: Big Shoulders Display (títulos) e Figtree (texto), servidas localmente (self-hosted), sem requisição a terceiros.
- WhatsApp: `https://wa.me/5531986770027?text=<mensagem codificada>`. O número existe em um único lugar: `src/config/site.ts`.
- Categorias fixas (slug): `alimentacao-animal`, `farmacia-veterinaria`, `pets`, `itens-pessoais`, `jardinagem`, `ferramentas`.
- Movimento só em resposta a hover/clique e o balanço da etiqueta; respeitar `prefers-reduced-motion`.
- O site público nunca consulta o Supabase em tempo de execução, só no build.
- A chave `service_role` nunca vai para o repositório nem para o navegador. `.env` fica no `.gitignore`; `.env.example` documenta as variáveis.
- Código em TypeScript estrito, comentários e documentação em português, nomes de código em inglês. Cada módulo com uma responsabilidade.
- Descrições de medicamentos sem dosagem nem promessa clínica.
- Trabalho em branch `feat/site-balcao`; um commit por tarefa.

## Review Focus

1. Nome de produto com aspas, `&`, `#`, acentos ou emoji: o link do WhatsApp precisa abrir com a mensagem íntegra (Task 2).
2. Supabase indisponível ou sem variáveis no build: o build falha com erro claro, nunca publica um catálogo vazio (Task 4).
3. Usuário logado que não está na lista de editores tenta gravar produto, foto ou publicar: RLS e Edge Function negam (Tasks 3 e 12).
4. Arquivo que não é imagem, ou imagem enorme, enviado no painel: é recusado ou reduzido, nunca enviado cru (Task 11).
5. Categoria sem produtos, e produto sem foto: a página mostra mensagem útil com botão de WhatsApp, e a prateleira usa imagem substituta (Tasks 6 e 7).

---

### Task 1: Esqueleto do projeto e limpeza do legado

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.env.example`, `.gitignore` (ajustar)
- Move: `img/*` usados (logo, fotos de categorias, 14 produtos) → `src/assets/`; demais imagens do `img/` são removidas
- Delete: `index.html`, `login.html`, `carrinho.html`, `estilos/`, `scripts/`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `test`, `lint`, `format`; alias `@/` → `src/`.

- [ ] **Step 1:** Criar a branch `feat/site-balcao`. Inicializar Astro (modo estático) com TypeScript estrito, Tailwind, Preact, Vitest, ESLint e Prettier. Adicionar `.superpowers/` e `.env` ao `.gitignore`.
- [ ] **Step 2:** Escrever `tests/smoke.test.ts` com um teste `it("runs the test runner", ...)` (`expect(1+1).toBe(2)`) e rodar `npm test` para confirmar que passa.
- [ ] **Step 3:** Mover para `src/assets/` somente as imagens referenciadas pelo antigo `index.html` (logo `agrosantos.png`, `ASlogo.png`, 6 fotos de categoria: `cachorro`, `cavalo`, `gato`, `casal`, `flores`, `ferramentas`, foto de campo `plantacao.jpg`, e as 14 fotos de produto). Apagar o resto de `img/` e os arquivos legados listados acima.
- [ ] **Step 4:** Rodar `npm run build` e `npm run lint`. Esperado: ambos terminam sem erro.
- [ ] **Step 5:** Commit: `chore: scaffold Astro and remove legacy cart/login pages`.

### Task 2: Configuração do site e utilitários puros (TDD)

**Files:**
- Create: `src/config/site.ts`, `src/lib/whatsapp.ts`, `src/lib/slug.ts`
- Test: `tests/lib/whatsapp.test.ts`, `tests/lib/slug.test.ts`

**Interfaces:**
- Produces:
  - `site` (const em `src/config/site.ts`): `{ name, whatsappNumber: "5531986770027", phones: string[], email, address, instagram, cnpj, mapsEmbedUrl }` com os valores do spec.
  - `CATEGORIES: readonly { slug: CategorySlug; label: string; photo: ImageMetadata }[]` e `type CategorySlug` (os 6 slugs). Rótulos: Alimentação animal, Farmácia veterinária, Pets, Itens pessoais, Jardinagem, Ferramentas.
  - `buildWhatsAppLink(productName?: string): string`.
  - `slugify(name: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// whatsapp.test.ts
it("links to the store number with a generic message", () => {
  expect(buildWhatsAppLink()).toBe(
    "https://wa.me/5531986770027?text=" + encodeURIComponent("Olá! Vim pelo site e gostaria de atendimento."));
});
it("includes the product name", () => {
  expect(buildWhatsAppLink("Quatree Supreme 25kg")).toBe(
    "https://wa.me/5531986770027?text=" + encodeURIComponent("Olá! Tenho interesse no produto: Quatree Supreme 25kg"));
});
it("keeps quotes, ampersands, hashes and emoji intact after decoding", () => {
  const name = `Ração "Big" & Cia #1 🐶`;
  const text = new URL(buildWhatsAppLink(name)).searchParams.get("text");
  expect(text).toBe(`Olá! Tenho interesse no produto: ${name}`);
});
// slug.test.ts
it("removes accents and lowercases", () => expect(slugify("Cálcio Vallée 500ml")).toBe("calcio-vallee-500ml"));
it("collapses symbols and trims dashes", () => expect(slugify("  Arame -- Galvanizado! ")).toBe("arame-galvanizado"));
it("returns an empty string for names with no letters or digits", () => expect(slugify("🐶🐶")).toBe(""));
```

- [ ] **Step 2:** Rodar `npx vitest run tests/lib` e confirmar que falha (módulos inexistentes).
- [ ] **Step 3:** Implementar `site.ts`, `buildWhatsAppLink` (usa `encodeURIComponent` sobre a mensagem) e `slugify` (normalização NFD, remoção de marcas diacríticas, minúsculas, não alfanuméricos viram `-`).
- [ ] **Step 4:** Rodar os testes de novo. Esperado: todos passam.
- [ ] **Step 5:** Commit: `feat: site config, WhatsApp link and slug helpers`.

### Task 3: Banco, RLS e armazenamento (Supabase)

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_init.sql`, `supabase/tests/rls.sql`

**Interfaces:**
- Produces:
  - Tabela `products(id uuid pk default gen_random_uuid(), slug text unique not null, name text not null check (char_length(name) between 2 and 120), description text not null default '' check (char_length(description) <= 400), category text not null check (category in (6 slugs)), image_path text null, available boolean not null default true, published boolean not null default true, sort_order int not null default 0, updated_at timestamptz default now())`.
  - Tabela `editors(email text primary key)`.
  - Função `is_editor() returns boolean` (compara o e-mail do JWT, em minúsculas, com `editors`).
  - Bucket público `product-images` (leitura pública; escrita só editores; só `image/webp`, `image/jpeg`, `image/png`, máximo 2 MB).
  - Políticas: `select` em `products` para `anon` e `authenticated` apenas onde `published`, e todos os registros para editores; `insert/update/delete` só `is_editor()`; `editors` sem acesso para `anon`; `editors` legível só pelo próprio usuário.

- [ ] **Step 1: Write the failing test** em `supabase/tests/rls.sql` (rodar com `supabase test db`, pgTAP): como `anon`, `select` em `products` retorna só linhas `published`; como `anon`, `insert` falha; como usuário autenticado fora de `editors`, `insert`, `update` e `delete` falham; como editor, `insert` e `update` funcionam; `anon` não lê `editors`.
- [ ] **Step 2:** Rodar `supabase test db`. Esperado: falha (tabelas inexistentes).
- [ ] **Step 3:** Escrever a migration com o esquema acima, RLS habilitado em todas as tabelas, e trigger que atualiza `updated_at`.
- [ ] **Step 4:** Rodar `supabase db reset` e `supabase test db`. Esperado: todos os testes passam.
- [ ] **Step 5:** Commit: `feat(db): products, editors, RLS and image bucket`.

### Task 4: Camada de dados de produtos (TDD)

**Files:**
- Create: `src/lib/types.ts`, `src/lib/supabase.ts`, `src/lib/products.ts`, `tests/fixtures/products.ts`
- Test: `tests/lib/products.test.ts`

**Interfaces:**
- Consumes: `CategorySlug`, `CATEGORIES` (Task 2); esquema da Task 3.
- Produces:
  - `type Product = { id: string; slug: string; name: string; description: string; category: CategorySlug; imageUrl: string | null; available: boolean; sortOrder: number }`.
  - `mapRow(row: ProductRow, publicUrl: (path: string) => string): Product`.
  - `getPublishedProducts(): Promise<Product[]>` ordenado por `sortOrder` e depois por nome. **Lança `Error("Falha ao carregar produtos do Supabase: ...")`** se faltar `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` ou a consulta falhar.
  - `groupByCategory(products: Product[]): Record<CategorySlug, Product[]>` (todas as 6 chaves sempre presentes).
  - Em `import.meta.env.DEV` sem variáveis, usa `tests/fixtures/products.ts` (14 produtos atuais) para desenvolver offline. Em build de produção nunca usa fixture.

- [ ] **Step 1: Write the failing tests**: `mapRow` converte `image_path` em `imageUrl` e `null` quando não há foto; `groupByCategory` devolve array vazio para categoria sem produtos; `getPublishedProducts` com consulta falhando rejeita com mensagem que começa em "Falha ao carregar produtos do Supabase"; sem variáveis em modo produção rejeita (não devolve lista vazia).
- [ ] **Step 2:** Rodar `npx vitest run tests/lib/products.test.ts`. Esperado: falha.
- [ ] **Step 3:** Implementar o módulo; o cliente Supabase é injetável para o teste.
- [ ] **Step 4:** Rodar os testes. Esperado: passam.
- [ ] **Step 5:** Commit: `feat: product data layer that fails the build on errors`.

### Task 5: Sistema de design e layout base

**Files:**
- Create: `src/styles/global.css` (tokens Tailwind das cores e fontes, `@font-face` local), `src/layouts/Base.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/components/WhatsAppTag.astro`, `src/components/WhatsAppFloat.astro`
- Test: `tests/e2e/layout.spec.ts`

**Interfaces:**
- Produces: `<Base title description image?>` com `<slot/>`; `<WhatsAppTag />` (etiqueta pendurada, props `message?`); `<WhatsAppFloat />` (botão flutuante só em telas pequenas e rolagem longa).
- Consumes: `site`, `buildWhatsAppLink`.

- [ ] **Step 1: Write the failing test** (Playwright) em `layout.spec.ts`: a página inicial tem `<header>` com o logo e links Início, Produtos, Quem Somos, Onde Estamos e Contato; existe um link `a[href^="https://wa.me/5531986770027"]`; as fontes carregam de `/_astro/` (nenhuma requisição a `fonts.googleapis.com`).
- [ ] **Step 2:** Rodar `npx playwright test tests/e2e/layout.spec.ts`. Esperado: falha.
- [ ] **Step 3:** Implementar tokens, layout, cabeçalho, rodapé (endereço, telefones, e-mail, Instagram, CNPJ) e a etiqueta. Baseie a etiqueta e o cabeçalho no esboço aprovado (`clip-path` da etiqueta, balanço no `:hover` desativado sob `prefers-reduced-motion`).
- [ ] **Step 4:** Rodar o teste. Esperado: passa.
- [ ] **Step 5:** Commit: `feat: design tokens, base layout and WhatsApp tag`.

### Task 6: Página inicial (hero, corredores, prateleira)

**Files:**
- Create: `src/components/Hero.astro`, `src/components/Corredores.astro`, `src/components/Prateleira.astro`, `src/components/ProductItem.astro`, `src/assets/placeholder-produto.svg`
- Modify: `src/pages/index.astro`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `getPublishedProducts`, `groupByCategory`, `CATEGORIES`, `buildWhatsAppLink`.
- Produces: `<ProductItem product={Product} />` (usa `placeholder-produto.svg` quando `imageUrl` é nulo; mostra "Em falta" e troca o botão por "Perguntar no WhatsApp" quando `available` é falso); `<Prateleira products={Product[]} emptyMessage?={string} />`; `<Corredores />` com seis links para `/produtos/<slug>`.

- [ ] **Step 1: Write the failing test**: a home mostra o `h1` "Tudo pro bicho e pra roça, no balcão de Desterro."; há 6 links de corredor com as hrefs `/produtos/<slug>`; a prateleira mostra no máximo 5 produtos; cada produto tem link "Pedir no WhatsApp" cujo `text` contém o nome; produto sem foto renderiza o substituto; produto `available=false` mostra "Em falta".
- [ ] **Step 2:** Rodar o teste e ver falhar.
- [ ] **Step 3:** Implementar. Corredores: `flex` com `flex-grow` maior no `:hover`/`:focus-within`; em telas estreitas, rolagem horizontal com `scroll-snap`.
- [ ] **Step 4:** Rodar o teste. Esperado: passa. Comparar visualmente com o esboço aprovado.
- [ ] **Step 5:** Commit: `feat: home page with hero, aisles and shelf`.

### Task 7: Catálogo e busca

**Files:**
- Create: `src/pages/produtos/index.astro`, `src/pages/produtos/[categoria].astro`, `src/components/CatalogSearch.tsx` (ilha Preact), `src/lib/search.ts`
- Test: `tests/lib/search.test.ts`, `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `filterProducts(products: Pick<Product,"name"|"description">[], query: string): number[]` (índices que casam; ignora acentos e maiúsculas; consulta vazia casa tudo).
- Consumes: `Prateleira`, `groupByCategory`, `CATEGORIES`.

- [ ] **Step 1: Write the failing tests**: `filterProducts(items, "calcio")` encontra "Cálcio Vallée"; consulta vazia devolve todos os índices; consulta sem resultado devolve `[]`. E2E: `/produtos/ferramentas` lista só ferramentas; `/produtos/jardinagem` sem produtos mostra "Ainda não temos itens aqui." com botão de WhatsApp (Review Focus 5); digitar na busca esconde os itens que não casam.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar `getStaticPaths` com as 6 categorias (mesmo as vazias) e a ilha de busca (`client:load` só em `/produtos`).
- [ ] **Step 4:** Rodar os testes. Esperado: passam.
- [ ] **Step 5:** Commit: `feat: catalog pages and search`.

### Task 8: Seções institucionais e SEO

**Files:**
- Create: `src/components/QuemSomos.astro`, `src/components/OndeEstamos.astro`, `src/components/Contato.astro`, `src/components/LocalBusinessJsonLd.astro`, `src/pages/404.astro`, `public/robots.txt`
- Modify: `src/pages/index.astro`, `astro.config.mjs` (sitemap, `site`)
- Test: `tests/e2e/seo.spec.ts`

- [ ] **Step 1: Write the failing test**: a home contém um `<script type="application/ld+json">` com `@type: "LocalBusiness"`, nome, telefone, endereço (Rua Coronel Joaquim Resende, 220, Desterro de Entre Rios, MG) e `sameAs` com o Instagram; `<title>` e `meta description` existem em toda página; há `og:title` e `og:image`; o iframe do mapa tem `loading="lazy"` e `title`; `/sitemap-index.xml` existe; página inexistente devolve a 404 do site.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar reaproveitando os textos de "Quem Somos", história e contato do `index.html` antigo (o conteúdo está no spec). Sem formulário de contato nem newsletter.
- [ ] **Step 4:** Rodar o teste. Esperado: passa.
- [ ] **Step 5:** Commit: `feat: institutional sections, structured data and sitemap`.

### Task 9: Responsivo e acessibilidade

**Files:**
- Modify: componentes das Tasks 5 a 8 conforme os achados
- Test: `tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Write the failing test**: com `@axe-core/playwright`, `/`, `/produtos` e `/produtos/ferramentas` não têm violações `serious` ou `critical`, em viewports 1280×900 e 390×844; não há rolagem horizontal da página no celular; todos os controles são alcançáveis por Tab com foco visível; com `prefers-reduced-motion: reduce` a etiqueta não anima.
- [ ] **Step 2:** Rodar, registrar as falhas e corrigi-las (contraste do texto sobre a foto do hero, nomes acessíveis dos links de corredor).
- [ ] **Step 3:** Rodar de novo. Esperado: passa.
- [ ] **Step 4:** Commit: `fix: responsive and accessibility pass`.

### Task 10: Painel, parte 1: login e proteção

**Files:**
- Create: `src/pages/admin/index.astro` (com `noindex`), `src/admin/App.tsx`, `src/admin/auth.ts`, `src/admin/LoginScreen.tsx`
- Test: `tests/admin/auth.test.ts`

**Interfaces:**
- Produces: `signInWithGoogle(): Promise<void>`, `signInWithPassword(email: string, password: string): Promise<void>`, `signOut(): Promise<void>`, `checkIsEditor(): Promise<boolean>` (consulta `editors` do próprio e-mail). `<App />` mostra login, "Sem permissão" (mensagem clara, sem detalhes técnicos) ou o painel.
- A página `/admin` não entra no sitemap e tem `<meta name="robots" content="noindex">`.

- [ ] **Step 1: Write the failing tests** (cliente Supabase simulado): `checkIsEditor` retorna `true` quando há linha, `false` quando não há ou há erro; `<App />` sem sessão mostra "Entrar"; sessão de não editor mostra "Você não tem permissão para editar o catálogo."
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Cadastrar o provedor Google no Supabase é passo manual, documentado na Task 15.
- [ ] **Step 4:** Rodar os testes. Esperado: passam.
- [ ] **Step 5:** Commit: `feat(admin): login and editor gate`.

### Task 11: Painel, parte 2: produtos e fotos

**Files:**
- Create: `src/admin/ProductList.tsx`, `src/admin/ProductForm.tsx`, `src/admin/products-api.ts`, `src/admin/image.ts`
- Test: `tests/admin/image.test.ts`, `tests/admin/products-api.test.ts`

**Interfaces:**
- Consumes: `slugify`, `CATEGORIES`, esquema da Task 3.
- Produces:
  - `prepareImage(file: File): Promise<Blob>`: recusa com `Error("Envie uma imagem JPG, PNG ou WebP.")` se o tipo não for imagem aceita; recusa acima de 15 MB de entrada; redimensiona para largura máxima 1200 px e converte para WebP.
  - `uploadProductImage(blob: Blob, slug: string): Promise<string>` → caminho no bucket.
  - `listProducts()`, `saveProduct(input: ProductInput): Promise<Product>` (gera `slug` único: acrescenta `-2`, `-3` em colisão; recusa nome que gera slug vazio), `deleteProduct(id: string)`, `setAvailable(id, boolean)`, `setPublished(id, boolean)`.
- A lista mostra miniatura, nome, categoria, "Em falta" e "Oculto"; o formulário tem nome, descrição, categoria, foto, "Disponível", "Mostrar no site" e "Ordem" (número, menor aparece primeiro), e valida nome (2 a 120) e descrição (até 400) com mensagens em português.

- [ ] **Step 1: Write the failing tests**: `prepareImage` rejeita `text/plain` com a mensagem acima; rejeita arquivo de 20 MB; devolve Blob `image/webp` com largura ≤ 1200 para entrada de 4000 px; `saveProduct` com nome "Arame" duplicado gera slug `arame-2`; nome "🐶" é recusado com "Use pelo menos duas letras ou números no nome."
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Confirmação antes de excluir. Estados de carregando, erro e vazio com texto de orientação.
- [ ] **Step 4:** Rodar os testes. Esperado: passam. Testar manualmente contra o Supabase local: criar, editar, trocar foto, ocultar e excluir um produto.
- [ ] **Step 5:** Commit: `feat(admin): product CRUD with safe image upload`.

### Task 12: Publicar alterações (Edge Function)

**Files:**
- Create: `supabase/functions/publish-site/index.ts`, `supabase/functions/publish-site/index.test.ts`, `src/admin/PublishButton.tsx`, `src/admin/publish.ts`

**Interfaces:**
- Produces: Edge Function `publish-site` (POST). Lê o JWT do cabeçalho, confirma que o e-mail está em `editors` (via consulta com a identidade do usuário), e então faz `POST` no `DEPLOY_HOOK_URL` (secret da função). Respostas: `401` sem JWT, `403` não editor, `502` se o hook falhar, `200 { ok: true }`. Limita a uma publicação a cada 60 s.
- `publishSite(): Promise<{ ok: true } | { ok: false; message: string }>` no cliente.

- [ ] **Step 1: Write the failing tests** (Deno test com `fetch` simulado): sem `Authorization` → 401; JWT de não editor → 403 e o hook **não** é chamado; editor → 200 e o hook chamado uma vez; segunda chamada em menos de 60 s → 429; hook respondendo 500 → 502.
- [ ] **Step 2:** Rodar `supabase functions serve` + os testes; ver falhar.
- [ ] **Step 3:** Implementar a função e o botão "Publicar alterações" com estados "Publicando…", "Publicado. O site atualiza em 1 a 2 minutos." e erro com orientação.
- [ ] **Step 4:** Rodar os testes. Esperado: passam.
- [ ] **Step 5:** Commit: `feat: publish button via guarded edge function`.

### Task 13: Migração dos produtos atuais

**Files:**
- Create: `scripts/seed-products.ts`, `scripts/seed-data.ts`
- Test: `tests/scripts/seed-data.test.ts`

**Interfaces:**
- Consumes: `slugify`, esquema da Task 3.
- Produces: `seedProducts: ProductInput[]` com os 14 produtos do `index.html` antigo (nome, descrição, categoria atribuída, foto), sem preços; script que envia fotos (via `prepareImage` equivalente em Node) e faz `upsert` por `slug` usando `SUPABASE_SERVICE_ROLE_KEY` lido do ambiente local, nunca versionado.

- [ ] **Step 1: Write the failing test**: `seedProducts` tem 14 itens, slugs únicos e não vazios, todos com categoria válida; nenhum campo contém "R$".
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar os dados e o script (rodar duas vezes não duplica).
- [ ] **Step 4:** Rodar o teste; rodar o script no Supabase local e conferir 14 linhas.
- [ ] **Step 5:** Commit: `feat: seed current 14 products`.

### Task 14: Anti-pausa e proteção de build

**Files:**
- Create: `.github/workflows/keepalive.yml`, `.github/workflows/ci.yml`, `public/_headers`

- [ ] **Step 1:** `keepalive.yml`: agendado semanalmente (e `workflow_dispatch`), faz uma consulta `select` simples em `products` com a chave anon (secrets do repositório) e **falha o job** se a resposta não for 200, para o GitHub avisar por e-mail.
- [ ] **Step 2:** `ci.yml`: em PR e push, roda `npm ci`, `lint`, `test`, `build` e os testes e2e.
- [ ] **Step 3:** `public/_headers`: `Content-Security-Policy` restrita (próprio domínio, `*.supabase.co` para imagens e API, Google Maps no `frame-src`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` e `Permissions-Policy` vazia.
- [ ] **Step 4:** Rodar `npm run build` e conferir que as páginas continuam carregando com a CSP (mapa, fontes e imagens do Supabase). Esperado: nenhum erro de CSP no console.
- [ ] **Step 5:** Commit: `chore: keep-alive, CI and security headers`.

### Task 15: Documentação e guia de implantação

**Files:**
- Modify: `README.md` (reescrever; remover "fictício")
- Create: `docs/ARQUITETURA.md`, `docs/PAINEL.md`, `docs/IMPLANTACAO.md`, `docs/MANUTENCAO.md`

- [ ] **Step 1:** `README.md`: o que é o site, como rodar local (`npm install`, `.env`, `npm run dev`), scripts, estrutura de pastas e links para os demais documentos.
- [ ] **Step 2:** `docs/ARQUITETURA.md`: diagrama do fluxo (painel → Supabase → botão publicar → build → site), responsabilidades por pasta, decisões e o plano B (trocar por Sanity).
- [ ] **Step 3:** `docs/PAINEL.md`: guia para a família, em linguagem simples, com como entrar, adicionar produto, trocar foto, marcar "em falta", ocultar e publicar.
- [ ] **Step 4:** `docs/IMPLANTACAO.md`: criar o projeto Supabase, rodar migrations, ativar login Google, adicionar e-mails em `editors`, criar o deploy hook na Cloudflare Pages, variáveis de ambiente (nome e onde cada uma é usada), secret `DEPLOY_HOOK_URL` da função, domínio `.com.br` e DNS.
- [ ] **Step 5:** `docs/MANUTENCAO.md`: atualizar dependências, o que fazer se o Supabase pausar, como restaurar, onde editar textos e contatos, como trocar o número do WhatsApp.
- [ ] **Step 6:** Commit: `docs: README, architecture, admin guide, deployment and maintenance`.

### Task 16: Revisão final

- [ ] **Step 1:** Rodar `npm run lint`, `npm test`, `npm run build` e os e2e completos. Esperado: tudo verde.
- [ ] **Step 2:** Rodar o skill de revisão de segurança (`security-review`) na branch e corrigir achados (chaves, RLS, CSP, upload).
- [ ] **Step 3:** Rodar `code-review` e `simplify` na branch e aplicar o que fizer sentido.
- [ ] **Step 4:** Conferir os critérios do spec (objetivos 1 a 5 e os anti-objetivos) um a um e anotar o resultado na descrição do PR.
- [ ] **Step 5:** Abrir o PR de `feat/site-balcao` para `main`.

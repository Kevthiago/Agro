# Site da Agropecuária Santos: desenho do projeto

Data: 2026-10-21. Referência visual aprovada: [2026-10-21-balcao-mockup.html](2026-10-21-balcao-mockup.html) (abrir no navegador).

## Intenção

O repositório é hoje um trabalho de faculdade (HTML, CSS e JS puros, com carrinho, login e pagamento simulados). A meta é transformá-lo no **site real** da Agropecuária Santos, loja da família em Desterro de Entre Rios (MG), e colocá-lo no ar com domínio próprio.

O site não vende. Ele apresenta a loja e o catálogo, e **toda intenção de compra vai para o WhatsApp**. O cliente vê um produto, toca em "Pedir no WhatsApp" e cai numa conversa com a mensagem já escrita.

A família precisa **editar o catálogo sozinha** (adicionar, trocar e remover produtos, subir foto), sem mexer em código.

## Objetivos

1. Site institucional rápido e bonito, com cara de loja de interior e acabamento profissional (direção "Balcão", abaixo).
2. Catálogo de produtos por categoria, com busca simples, e botão de WhatsApp por produto e flutuante.
3. Painel de administração (`/admin`) só para produtos: nome, descrição, categoria, foto, disponível/em falta, ordem.
4. Boa posição na busca local ("agropecuária Desterro de Entre Rios"): SEO, dados estruturados de negócio local, mapa e contatos.
5. Custo de operação perto de zero (hospedagem gratuita, só o domínio é pago).

## Fora do escopo

- Carrinho, checkout, pagamento, login de cliente, cadastro, newsletter.
- Preços. Nenhum preço aparece no site.
- Edição de textos institucionais, contatos ou layout pelo painel. Isso fica no código.
- Editor visual de páginas.

## O que não pode acontecer (anti-objetivos)

- O site parecer um modelo genérico ou "feito por IA". A direção visual foi escolhida justamente para evitar isso.
- O site público cair quando o Supabase pausar ou falhar. Só o painel pode ficar indisponível.
- O painel quebrar a ponto de a família não conseguir publicar um produto.
- O projeto virar uma loja virtual por acidente.
- Qualquer dado pessoal de visitante ser coletado sem necessidade (LGPD).

## Direção visual aprovada: "Balcão"

O site é o balcão da loja. Mantém o jogo de cores e o logo atuais.

- **Cores:** petróleo `#3C7785` (marca), petróleo-escuro `#1F4752`, laranja `#E27D36` (marca), tinta `#12262C`, palha `#EDEFE6`, madeira `#5a4630` (só na prateleira). Sem creme quente.
- **Fontes:** Big Shoulders Display (títulos, letreiro condensado) e Figtree (texto).
- **Hero:** foto de campo em tela cheia com título gigante em branco: "Tudo pro bicho e pra roça, no balcão de Desterro." O laranja fica reservado à etiqueta.
- **Etiqueta de balcão:** o botão principal de WhatsApp é uma etiqueta laranja pendurada por um barbante, com furo. Balança ao passar o mouse. É a peça marcante e deve ser a única decoração em destaque.
- **Corredores:** seis tiras verticais de foto (Alimentação animal, Farmácia veterinária, Pets, Itens pessoais, Jardinagem, Ferramentas). A tira sob o mouse se abre. Clicar leva ao catálogo daquela categoria.
- **Prateleira:** produtos "em pé" sobre uma tábua de madeira, sem cartões com borda. O botão "Pedir no WhatsApp" tem formato de etiqueta.
- **Movimento:** só em resposta a ações do usuário (hover, clique) e o balanço da etiqueta. Respeitar `prefers-reduced-motion`.
- **Qualidade mínima:** responsivo até celular, foco de teclado visível, contraste adequado, texto alternativo real.

O esboço mostra só a página inicial em desktop. Celular e as demais seções seguem a mesma linguagem e devem ser desenhadas na implementação.

## Decisões de arquitetura

**Decididas com o usuário:**
- Site estático. A stack sai de HTML/CSS/JS puros.
- Painel de edição próprio com **Supabase** (banco, autenticação e armazenamento de fotos). Se não funcionar bem, a alternativa combinada é trocar por outro CMS (Sanity foi a opção discutida).
- O painel edita **só produtos**.
- Manter cores e logo atuais, com acabamento mais moderno e clima rústico de interior.

**Minhas escolhas (o usuário pode vetar):**
- **Astro + Tailwind CSS.** Astro gera HTML estático sem JavaScript por padrão e otimiza imagens.
- **Hospedagem na Cloudflare Pages** (Netlify ou Vercel servem). Domínio `.com.br`.
- **Dados dos produtos lidos no momento do build.** O site público não consulta o Supabase em tempo real. Assim ele continua no ar mesmo se o banco pausar.
- **Publicação explícita.** O painel salva rascunhos e tem um botão "Publicar alterações" que dispara a reconstrução do site (1 a 2 minutos). O gatilho passa por uma Edge Function do Supabase, para o endereço do deploy hook não ficar exposto no navegador. Isso evita uma reconstrução a cada clique.
- **Painel como página `/admin` com JavaScript no cliente**, usando `@supabase/supabase-js`, fora do build estático.
- **Login do painel:** Google e e-mail/senha, com lista de e-mails autorizados. O banco usa RLS: leitura pública apenas de produtos publicados, escrita só para usuários autorizados. O bucket de fotos tem leitura pública e escrita restrita.
- **Contra a pausa do plano gratuito:** tarefa semanal no GitHub Actions que faz uma consulta leve ao banco, com alerta se falhar. A regra de pausa foi confirmada na documentação do Supabase (sem atividade por cerca de 7 dias); o que conta como "atividade" deve ser testado.
- **Fotos:** o painel reduz e converte a imagem para WebP (largura máxima em torno de 1200 px) antes de enviar.
- **Campos do produto:** nome, descrição curta, categoria (lista fixa de 6), foto, disponível (sim/não), ordem. O slug é gerado do nome.
- **Catálogo:** produtos em uma página `/produtos`, com páginas estáticas por categoria (`/produtos/<categoria>`) e filtro por busca simples no cliente. A página inicial mostra uma seleção.
- **WhatsApp:** link `https://wa.me/5531986770027?text=<mensagem codificada>`, com o nome do produto. O número fica em um único lugar do código.
- **Sem preço:** não se exibe valor nem "Consulte".
- **Marcas parceiras:** o carrossel de logos (Quatree, Gerdau, Boehringer etc.) fica de fora até haver autorização de uso.
- **Medicamentos veterinários:** descrições sem dosagem nem promessa clínica. Dúvidas vão para o atendimento no WhatsApp.
- **Análise de acessos:** nenhuma no início. Se desejado depois, usar algo sem cookies.
- **Repositório:** migrar no próprio repositório, em uma branch. Os arquivos antigos (`carrinho.html`, `login.html`, `pagamento.js` etc.) são removidos (o histórico do Git guarda tudo). O README é reescrito e deixa de dizer que o projeto é "fictício".

## Conteúdo fixo no código

Conteúdo hoje em `index.html` a ser reaproveitado: texto de "Quem Somos" e história (mais de 15 anos, empresa familiar), endereço (Rua Coronel Joaquim Resende, 220, Desterro de Entre Rios, MG), mapa do Google incorporado, e-mail `agrosantosdesterro@hotmail.com`, telefones (31) 3736-1025 e (31) 9 8677-0027, Instagram `@agrosantos`, CNPJ 11.237.212/0001-03.

## O que fica a cargo de quem for implementar

Estrutura de pastas e componentes, modelagem exata das tabelas e políticas RLS, design de telas do painel (simples, em português, pensado para quem não é técnico), layout mobile dos corredores, textos secundários, SEO detalhado, scripts de migração dos 14 produtos atuais, e testes.

## Pendências com o usuário (não bloqueiam o início)

1. Domínio desejado e quem é o dono do registro.
2. Confirmar que o número de WhatsApp (31) 9 8677-0027 e os demais dados de contato ainda estão corretos, e informar o horário de funcionamento.
3. Quais e-mails terão acesso ao painel.
4. Fotos reais da loja, da fachada e dos produtos. As atuais são de banco de imagens e uma delas foi gerada por IA.
5. Se a loja tem perfil no Google Meu Negócio, para ligar ao site.
6. Autorização para usar logos das marcas, se quiserem voltar com o carrossel.

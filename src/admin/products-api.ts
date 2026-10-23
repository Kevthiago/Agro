import { getBrowserClient } from "@/admin/supabase-browser";
import type { AdminProduct } from "@/admin/types";
import { isCategorySlug } from "@/config/categories";
import { PRODUCT_IMAGES_BUCKET, productImageUrl } from "@/lib/product-images";
import { slugify } from "@/lib/slug";
import type { ProductInput, ProductRow } from "@/lib/types";

/*
 * Leitura e gravação do catálogo pelo painel. Quem decide se a pessoa pode gravar
 * é o RLS do banco; aqui só traduzimos as respostas em mensagens amigáveis.
 */

type Result = { data: unknown; error: unknown };
type Rows = PromiseLike<Result>;

/*
 * As cadeias de consulta do supabase-js que o painel usa, uma por operação (substituíveis
 * nos testes). Cada uma é fechada de propósito: um tipo recursivo genérico faz o
 * TypeScript se perder comparando com os tipos do supabase-js.
 */
export interface SelectQuery extends Rows {
  order(column: string): SelectQuery;
  like(column: string, pattern: string): Rows;
}
export interface FilterQuery {
  eq(column: "id", value: string): { select(columns: "*"): Rows };
}
export interface InsertQuery {
  select(columns: "*"): { single(): Rows };
}

type ProductValues = Omit<ProductRow, "id" | "slug" | "updated_at">;

/** O que o painel usa do cliente Supabase para produtos e fotos. */
export interface ProductsClient {
  from(table: "products"): {
    select(columns: "*"): SelectQuery;
    insert(values: ProductValues & { slug: string }): InsertQuery;
    update(values: Partial<ProductValues>): FilterQuery;
    delete(): FilterQuery;
  };
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Blob,
        options: { contentType: string; cacheControl: string; upsert: boolean },
      ): Rows;
      remove(paths: string[]): Rows;
    };
  };
}

export const PERMISSION = "Você não tem permissão para fazer isso.";
export const OFFLINE = "Sem conexão. Tente de novo.";
export const GENERIC = "Algo deu errado. Tente de novo.";
export const NOT_FOUND = "Não encontramos esse produto. Atualize a lista e tente de novo.";
const NOT_CONFIGURED = "Painel não configurado.";

/** Dados recusados: `fields` diz a mensagem de cada campo com problema. */
export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Confira os campos destacados.");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/** Troca de foto pedida no formulário. */
export type PhotoChange = { kind: "keep" } | { kind: "remove" } | { kind: "replace"; blob: Blob };

function required(client: ProductsClient | null): ProductsClient {
  if (!client) throw new Error(NOT_CONFIGURED);
  return client;
}

function field(error: unknown, key: string): string {
  if (typeof error !== "object" || error === null || !(key in error)) return "";
  return String((error as Record<string, unknown>)[key]);
}

/** Traduz erros do Postgres/Storage/rede. Nunca repassa a mensagem técnica. */
export function friendlyError(error: unknown): Error {
  const code = field(error, "code");
  const status = field(error, "status") || field(error, "statusCode");
  const message = field(error, "message");
  if (
    code === "42501" ||
    status === "401" ||
    status === "403" ||
    /row-level security|permission denied|unauthorized/i.test(message)
  ) {
    return new Error(PERMISSION);
  }
  if (
    /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)
  ) {
    return new Error(OFFLINE);
  }
  return new Error(GENERIC);
}

/** Roda uma consulta e devolve os dados, ou lança a mensagem amigável. */
async function run(query: Rows): Promise<unknown> {
  let result: Result;
  try {
    result = await query;
  } catch (error) {
    throw friendlyError(error);
  }
  if (result.error) throw friendlyError(result.error);
  return result.data;
}

/** Número de caracteres como o Postgres conta (emoji = 1). */
const length = (text: string) => [...text].length;

/** Confere os dados antes de gravar. Devolve campo → mensagem (vazio = tudo certo). */
export function validateProductInput(input: ProductInput): Record<string, string> {
  const fields: Record<string, string> = {};
  const name = input.name.trim();
  if (length(name) < 2 || !slugify(name)) {
    fields.name = "Use pelo menos duas letras ou números no nome.";
  } else if (length(name) > 120) {
    fields.name = "O nome pode ter até 120 caracteres.";
  }
  if (length(input.description.trim()) > 400) {
    fields.description = "A descrição pode ter até 400 caracteres.";
  }
  if (!isCategorySlug(input.category)) fields.category = "Escolha uma categoria.";
  if (!Number.isInteger(input.sortOrder) || Math.abs(input.sortOrder) > 9999) {
    fields.sortOrder = "Use um número inteiro de -9999 a 9999.";
  }
  return fields;
}

function toAdminProduct(row: ProductRow): AdminProduct {
  const base = import.meta.env.PUBLIC_SUPABASE_URL ?? "";
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    // o banco só aceita as seis categorias (check constraint)
    category: row.category as AdminProduct["category"],
    imagePath: row.image_path,
    imageUrl: row.image_path ? productImageUrl(base, row.image_path) : null,
    available: row.available,
    published: row.published,
    sortOrder: row.sort_order,
  };
}

/** Todos os produtos (inclusive ocultos), por ordem e nome. */
export async function listProducts(
  client: ProductsClient | null = getBrowserClient(),
): Promise<AdminProduct[]> {
  const data = await run(
    required(client).from("products").select("*").order("sort_order").order("name"),
  );
  return ((data ?? []) as ProductRow[]).map(toAdminProduct);
}

/** Primeiro slug livre: arame, arame-2, arame-3... */
async function uniqueSlug(base: string, client: ProductsClient): Promise<string> {
  const data = await run(client.from("products").select("*").like("slug", `${base}%`));
  const taken = new Set(((data ?? []) as Pick<ProductRow, "slug">[]).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Cria ou atualiza um produto. Na criação o slug vem do nome (único); ao editar ele
 * não muda, para os links do site continuarem valendo. Dados inválidos lançam
 * ValidationError antes de qualquer gravação.
 */
export async function saveProduct(
  input: ProductInput & { id?: string },
  client: ProductsClient | null = getBrowserClient(),
): Promise<AdminProduct> {
  const fields = validateProductInput(input);
  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  const db = required(client);
  const values: ProductValues = {
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category,
    image_path: input.imagePath,
    available: input.available,
    published: input.published,
    sort_order: input.sortOrder,
  };

  if (input.id) {
    const rows = await run(db.from("products").update(values).eq("id", input.id).select("*"));
    const [row] = (rows ?? []) as ProductRow[];
    if (!row) throw new Error(NOT_FOUND);
    return toAdminProduct(row);
  }

  const base = slugify(values.name);
  // 1 tentativa + 3 repetições se outra pessoa gravar o mesmo slug ao mesmo tempo
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = await uniqueSlug(base, db);
    let result: Result;
    try {
      result = await db
        .from("products")
        .insert({ ...values, slug })
        .select("*")
        .single();
    } catch (error) {
      throw friendlyError(error);
    }
    if (!result.error) return toAdminProduct(result.data as ProductRow);
    if (field(result.error, "code") !== "23505") throw friendlyError(result.error);
  }
  throw new Error(GENERIC);
}

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Envia a foto já preparada (WebP). O nome do arquivo nunca vem do usuário:
 * `products/<slug>-<8 hex>.webp`. Devolve o caminho no bucket.
 */
export async function uploadProductImage(
  blob: Blob,
  slug: string,
  client: ProductsClient | null = getBrowserClient(),
): Promise<string> {
  const path = `products/${slugify(slug) || "produto"}-${randomHex()}.webp`;
  await run(
    required(client)
      .storage.from(PRODUCT_IMAGES_BUCKET)
      .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false }),
  );
  return path;
}

/** Apaga uma foto do bucket. Melhor esforço: nunca lança (sobra um arquivo, no pior caso). */
export async function removeProductImage(
  path: string,
  client: ProductsClient | null = getBrowserClient(),
): Promise<void> {
  try {
    await required(client).storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  } catch {
    // sem log: nada a fazer, e o produto já está certo no banco
  }
}

/**
 * Salva o produto aplicando a troca de foto com segurança: envia a nova, grava o
 * produto e só então apaga a antiga. Se a gravação falhar, apaga a nova (nada sobra).
 * `input.imagePath` é a foto que o produto tem hoje; `input.slug` (ao editar) dá nome ao arquivo.
 */
export async function saveProductWithPhoto(
  input: ProductInput & { id?: string; slug?: string },
  photo: PhotoChange,
  client: ProductsClient | null = getBrowserClient(),
): Promise<AdminProduct> {
  const fields = validateProductInput(input);
  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  const db = required(client);
  const previous = input.imagePath;

  let uploaded: string | null = null;
  let imagePath = previous;
  if (photo.kind === "replace") {
    uploaded = await uploadProductImage(photo.blob, input.slug ?? slugify(input.name), db);
    imagePath = uploaded;
  } else if (photo.kind === "remove") {
    imagePath = null;
  }

  let saved: AdminProduct;
  try {
    // ao editar, o slug do banco não muda (saveProduct ignora `slug`)
    saved = await saveProduct({ ...input, imagePath }, db);
  } catch (error) {
    if (uploaded) await removeProductImage(uploaded, db);
    throw error;
  }
  if (previous && previous !== saved.imagePath) await removeProductImage(previous, db);
  return saved;
}

/** Exclui o produto e depois, se der, a foto dele. */
export async function deleteProduct(
  product: AdminProduct,
  client: ProductsClient | null = getBrowserClient(),
): Promise<void> {
  const db = required(client);
  const rows = await run(db.from("products").delete().eq("id", product.id).select("*"));
  if (!(rows as unknown[] | null)?.length) throw new Error(NOT_FOUND);
  if (product.imagePath) await removeProductImage(product.imagePath, db);
}

async function setFlag(
  id: string,
  values: Pick<ProductValues, "available"> | Pick<ProductValues, "published">,
  client: ProductsClient | null,
): Promise<void> {
  const rows = await run(required(client).from("products").update(values).eq("id", id).select("*"));
  if (!(rows as unknown[] | null)?.length) throw new Error(NOT_FOUND);
}

/** Marca o produto como disponível ou em falta. */
export function setAvailable(
  id: string,
  value: boolean,
  client: ProductsClient | null = getBrowserClient(),
): Promise<void> {
  return setFlag(id, { available: value }, client);
}

/** Mostra ou oculta o produto no site. */
export function setPublished(
  id: string,
  value: boolean,
  client: ProductsClient | null = getBrowserClient(),
): Promise<void> {
  return setFlag(id, { published: value }, client);
}

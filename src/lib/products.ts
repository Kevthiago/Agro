import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, isCategorySlug, type CategorySlug } from "@/config/categories";
import { createPublicClient } from "@/lib/supabase";
import type { Product, ProductRow } from "@/lib/types";

const BUCKET = "product-images";

/** Subconjunto do import.meta.env que esta camada lê (injetável nos testes). */
export interface ProductsEnv {
  DEV?: boolean;
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_ANON_KEY?: string;
  PRODUCTS_SOURCE?: string;
}

export interface GetProductsOptions {
  client?: SupabaseClient;
  env?: ProductsEnv;
}

/** Converte uma linha do banco em Produto; categoria inválida derruba o build. */
export function mapRow(row: ProductRow, publicUrl: (path: string) => string): Product {
  if (!isCategorySlug(row.category)) {
    throw new Error(`Categoria desconhecida "${row.category}" no produto "${row.slug}"`);
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_path ? publicUrl(row.image_path) : null,
    available: row.available,
    sortOrder: row.sort_order,
  };
}

/** Agrupa por categoria; as 6 chaves sempre existem. */
export function groupByCategory(products: Product[]): Record<CategorySlug, Product[]> {
  const groups = Object.fromEntries(CATEGORIES.map((c) => [c.slug, [] as Product[]])) as Record<
    CategorySlug,
    Product[]
  >;
  for (const product of products) groups[product.category].push(product);
  return groups;
}

function sortProducts(products: Product[]): Product[] {
  return [...products].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"),
  );
}

/**
 * Produtos publicados, ordenados. Nunca devolve catálogo vazio por engano:
 * qualquer variável ausente ou erro de consulta lança.
 */
export async function getPublishedProducts(options: GetProductsOptions = {}): Promise<Product[]> {
  const env: ProductsEnv = options.env ?? import.meta.env;
  const url = env.PUBLIC_SUPABASE_URL;
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;
  const hasVars = Boolean(url && anonKey);

  // Fixtures só em desenvolvimento offline ou por opt-in explícito.
  if (env.PRODUCTS_SOURCE === "fixtures" || (env.DEV && !hasVars && !options.client)) {
    const { fixtureProducts } = await import("../../tests/fixtures/products");
    return sortProducts(fixtureProducts);
  }

  let client = options.client;
  if (!client) {
    const missing = [!url && "PUBLIC_SUPABASE_URL", !anonKey && "PUBLIC_SUPABASE_ANON_KEY"].filter(
      Boolean,
    );
    if (!url || !anonKey) {
      throw new Error(
        `Falha ao carregar produtos do Supabase: variável(is) ausente(s): ${missing.join(", ")}`,
      );
    }
    client = createPublicClient(url, anonKey);
  }

  const { data, error } = await client.from("products").select("*").eq("published", true);
  if (error) throw new Error(`Falha ao carregar produtos do Supabase: ${error.message}`);

  if (data == null) {
    throw new Error("Falha ao carregar produtos do Supabase: resposta sem dados");
  }
  // Catálogo vazio nunca é publicado: o build falha e o site anterior continua no ar (comportamento seguro).
  if (data.length === 0) {
    throw new Error(
      "Falha ao carregar produtos do Supabase: nenhum produto publicado encontrado (confira o banco e as regras RLS)",
    );
  }

  const base = url ?? "";
  const publicUrl = (path: string) => `${base}/storage/v1/object/public/${BUCKET}/${path}`;
  return sortProducts((data as ProductRow[]).map((r) => mapRow(r, publicUrl)));
}

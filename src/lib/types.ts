import type { CategorySlug } from "@/config/categories";

/** Linha da tabela `products` como vem do Supabase (snake_case). */
export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  image_path: string | null;
  available: boolean;
  published: boolean;
  sort_order: number;
  updated_at: string;
}

/** Produto pronto para as páginas do site (sem preços). */
export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CategorySlug;
  imageUrl: string | null;
  available: boolean;
  sortOrder: number;
}

/** Dados editáveis de um produto (admin e seed). */
export interface ProductInput {
  name: string;
  description: string;
  category: CategorySlug;
  imagePath: string | null;
  available: boolean;
  published: boolean;
  sortOrder: number;
}

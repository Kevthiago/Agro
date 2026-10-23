import type { CategorySlug } from "@/config/categories";

/** Produto como o painel mostra e edita (inclui os ocultos). */
export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: CategorySlug;
  imagePath: string | null;
  imageUrl: string | null;
  available: boolean;
  published: boolean;
  sortOrder: number;
}

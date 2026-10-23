import { seedProducts } from "../../scripts/seed-data.ts";
import type { Product } from "@/lib/types";

// Os 14 produtos do site antigo, para desenvolver offline: vêm do seed (fonte única).
export const fixtureProducts: Product[] = seedProducts.map((p, i) => ({
  id: `fixture-${i}`,
  slug: p.slug,
  name: p.name,
  description: p.description,
  category: p.category,
  imageUrl: null,
  available: p.available,
  sortOrder: p.sortOrder,
}));

import { slugify } from "@/lib/slug";
import type { CategorySlug } from "@/config/categories";
import type { Product } from "@/lib/types";

// Os 14 produtos do site antigo, para desenvolver offline. Sem preços.
const raw: Array<[name: string, description: string, category: CategorySlug]> = [
  ["Quatree Gourmet 25kg", "Adultos Raças Médias e Grandes - Mix de Carnes", "alimentacao-animal"],
  [
    "Quatree Supreme 25kg",
    "Adultos Raças Médias e Grandes - Frango e Batata Doce",
    "alimentacao-animal",
  ],
  ["Quatree Supreme 25kg", "Adultos Raças Pequenas - Frango e Batata Doce", "alimentacao-animal"],
  ["Quatree Gatos Castrados 30kg", "Frango e Batata Doce", "alimentacao-animal"],
  [
    "Bioxan Vallée 500ml",
    "Polivitamínico, Hidratante, Reconstituinte, Antitóxico e Energético",
    "farmacia-veterinaria",
  ],
  ["Cálcio Vallée 500ml", "Cálcio, Fósforo, Magnésio e Glicose", "farmacia-veterinaria"],
  ["Cidental 250ml", "Larvicida e Repelente", "farmacia-veterinaria"],
  ["Terramicina LA 50ml", "Antibiótico de Ação Prolongada", "farmacia-veterinaria"],
  ["Agrovet Plus 50ml", "Antimicrobiano", "farmacia-veterinaria"],
  ["Carrinho de Mão F26", "Chapa Número 26", "ferramentas"],
  ["Carrinho de Mão F24", "Chapa Número 24", "ferramentas"],
  ["Carrinho de Mão F18", "Chapa Número 18", "ferramentas"],
  ["Arame Galvanizado", "Especial - 100m", "ferramentas"],
  ["NexGard Spectra", "Antipulgas, Carrapatos e Vermífugo", "farmacia-veterinaria"],
];

// Slug único: os dois "Quatree Supreme 25kg" diferem só pela descrição.
const used = new Set<string>();
function uniqueSlug(name: string, description: string): string {
  let slug = slugify(name);
  if (used.has(slug)) slug = slugify(`${name} ${description}`);
  used.add(slug);
  return slug;
}

export const fixtureProducts: Product[] = raw.map(([name, description, category], i) => ({
  id: `fixture-${i}`,
  slug: uniqueSlug(name, description),
  name,
  description,
  category,
  imageUrl: null,
  available: true,
  sortOrder: i,
}));

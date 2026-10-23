import type { CategorySlug } from "../src/config/categories.ts";

/** Produto a importar do site antigo. Fonte única dos 14 produtos (sem preços). */
export interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  category: CategorySlug;
  /** Nome do arquivo da foto em src/assets. */
  photoFile: string;
  sortOrder: number;
  available: true;
  published: true;
}

type Row = [
  slug: string,
  name: string,
  description: string,
  category: CategorySlug,
  photoFile: string,
];

// Na ordem do site antigo. Nomes e descrições são os rótulos dos próprios produtos.
// Os dois "Quatree Supreme 25kg" têm slug explícito, pois só a descrição os diferencia.
const rows: Row[] = [
  [
    "quatree-gourmet-25kg",
    "Quatree Gourmet 25kg",
    "Adultos Raças Médias e Grandes - Mix de Carnes",
    "alimentacao-animal",
    "adultorp.webp",
  ],
  [
    "quatree-supreme-25kg-medias-grandes",
    "Quatree Supreme 25kg",
    "Adultos Raças Médias e Grandes - Frango e Batata Doce",
    "alimentacao-animal",
    "supremead.jpg",
  ],
  [
    "quatree-supreme-25kg-pequenas",
    "Quatree Supreme 25kg",
    "Adultos Raças Pequenas - Frango e Batata Doce",
    "alimentacao-animal",
    "supremerp.jpg",
  ],
  [
    "quatree-gatos-castrados-30kg",
    "Quatree Gatos Castrados 30kg",
    "Frango e Batata Doce",
    "alimentacao-animal",
    "catcast.webp",
  ],
  [
    "bioxan-vallee-500ml",
    "Bioxan Vallée 500ml",
    "Polivitamínico, Hidratante, Reconstituinte, Antitóxico e Energético",
    "farmacia-veterinaria",
    "bioxan.webp",
  ],
  [
    "calcio-vallee-500ml",
    "Cálcio Vallée 500ml",
    "Cálcio, Fósforo, Magnésio e Glicose",
    "farmacia-veterinaria",
    "calcio.webp",
  ],
  [
    "cidental-250ml",
    "Cidental 250ml",
    "Larvicida e Repelente",
    "farmacia-veterinaria",
    "cidental.webp",
  ],
  [
    "terramicina-la-50ml",
    "Terramicina LA 50ml",
    "Antibiótico de Ação Prolongada",
    "farmacia-veterinaria",
    "terramicina.webp",
  ],
  [
    "agrovet-plus-50ml",
    "Agrovet Plus 50ml",
    "Antimicrobiano",
    "farmacia-veterinaria",
    "agrovet.webp",
  ],
  [
    "carrinho-de-mao-f26",
    "Carrinho de Mão F26",
    "Chapa Número 26",
    "ferramentas",
    "carrinhoF26.jpg",
  ],
  [
    "carrinho-de-mao-f24",
    "Carrinho de Mão F24",
    "Chapa Número 24",
    "ferramentas",
    "carrinhoF24.webp",
  ],
  [
    "carrinho-de-mao-f18",
    "Carrinho de Mão F18",
    "Chapa Número 18",
    "ferramentas",
    "carrinhoF18.jpg",
  ],
  [
    "arame-galvanizado",
    "Arame Galvanizado",
    "Especial - 100m",
    "ferramentas",
    "arame-galvanizado_1_.webp",
  ],
  [
    "nexgard-spectra",
    "NexGard Spectra",
    "Antipulgas, Carrapatos e Vermífugo",
    "farmacia-veterinaria",
    "nexgard.png",
  ],
];

export const seedProducts: SeedProduct[] = rows.map(
  ([slug, name, description, category, photoFile], i) => ({
    slug,
    name,
    description,
    category,
    photoFile,
    sortOrder: (i + 1) * 10,
    available: true,
    published: true,
  }),
);

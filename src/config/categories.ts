import type { ImageMetadata } from "astro";
import cachorro from "@/assets/cachorro.jpg";
import cavalo from "@/assets/cavalo.jpg";
import gato from "@/assets/gato.jpg";
import casal from "@/assets/casal.jpg";
import flores from "@/assets/flores.jpg";
import ferramentas from "@/assets/ferramentas.jpg";

export type CategorySlug =
  | "alimentacao-animal"
  | "farmacia-veterinaria"
  | "pets"
  | "itens-pessoais"
  | "jardinagem"
  | "ferramentas";

export interface Category {
  slug: CategorySlug;
  label: string;
  photo: ImageMetadata;
}

export const CATEGORIES: readonly Category[] = [
  { slug: "alimentacao-animal", label: "Alimentação animal", photo: cachorro },
  { slug: "farmacia-veterinaria", label: "Farmácia veterinária", photo: cavalo },
  { slug: "pets", label: "Pets", photo: gato },
  { slug: "itens-pessoais", label: "Itens pessoais", photo: casal },
  { slug: "jardinagem", label: "Jardinagem", photo: flores },
  { slug: "ferramentas", label: "Ferramentas", photo: ferramentas },
];

export function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

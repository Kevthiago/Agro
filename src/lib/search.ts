/** Minúsculas e sem acentos, para comparar "Cálcio" com "calcio". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Índices dos produtos que casam com a consulta. Cada palavra da consulta
 * precisa aparecer no nome ou na descrição; consulta vazia casa tudo.
 */
export function filterProducts(
  products: ReadonlyArray<{ name: string; description: string }>,
  query: string,
): number[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const indices: number[] = [];
  products.forEach((product, index) => {
    const haystack = normalize(`${product.name} ${product.description}`);
    if (words.every((word) => haystack.includes(word))) indices.push(index);
  });
  return indices;
}

import type { SeedProduct } from "./seed-data.ts";

export interface SeedPlan {
  toInsert: SeedProduct[];
  toUpdate: SeedProduct[];
  skipped: SeedProduct[];
}

/**
 * Decide o que fazer com cada produto. Slug novo sempre é inserido; slug existente
 * é pulado, ou atualizado (só texto) com `force`. Nunca sobrescreve por padrão.
 */
export function planSeed(
  existingSlugs: Set<string>,
  data: SeedProduct[],
  opts: { force: boolean },
): SeedPlan {
  const plan: SeedPlan = { toInsert: [], toUpdate: [], skipped: [] };
  for (const product of data) {
    if (!existingSlugs.has(product.slug)) plan.toInsert.push(product);
    else if (opts.force) plan.toUpdate.push(product);
    else plan.skipped.push(product);
  }
  return plan;
}

/** Só `127.0.0.1` e `localhost` (comparando o host inteiro) contam como local. */
export function isLocalHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

export function parseArgs(argv: string[]): { yes: boolean; force: boolean } {
  return { yes: argv.includes("--yes"), force: argv.includes("--force") };
}

/** Mesmo formato do painel: `products/<slug>-<8 hex>.webp`. */
export function buildImagePath(slug: string, random: () => string): string {
  return `products/${slug}-${random()}.webp`;
}

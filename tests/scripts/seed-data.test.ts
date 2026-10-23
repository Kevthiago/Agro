import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { seedProducts } from "../../scripts/seed-data.ts";
import { CATEGORIES } from "@/config/categories";

describe("seedProducts", () => {
  it("tem os 14 produtos do site antigo", () => {
    expect(seedProducts).toHaveLength(14);
  });

  it("tem slugs únicos, não vazios e válidos", () => {
    const slugs = seedProducts.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("respeita os limites do banco e usa categorias válidas", () => {
    const valid = CATEGORIES.map((c) => c.slug);
    for (const p of seedProducts) {
      expect(p.name.length).toBeGreaterThanOrEqual(2);
      expect(p.name.length).toBeLessThanOrEqual(120);
      expect(p.description.length).toBeLessThanOrEqual(400);
      expect(valid).toContain(p.category);
      expect(p.available).toBe(true);
      expect(p.published).toBe(true);
    }
  });

  it("não tem preço em nenhum texto", () => {
    for (const p of seedProducts) {
      for (const text of [p.name, p.description, p.slug]) {
        expect(text).not.toMatch(/R\$/);
        expect(text).not.toMatch(/\d+[.,]\d{2}\b/);
      }
    }
  });

  it("aponta para fotos que existem em src/assets", () => {
    for (const p of seedProducts) {
      expect(existsSync(resolve("src/assets", p.photoFile)), p.photoFile).toBe(true);
    }
  });

  it("tem sortOrder estritamente crescente", () => {
    const orders = seedProducts.map((p) => p.sortOrder);
    orders.slice(1).forEach((o, i) => expect(o).toBeGreaterThan(orders[i]!));
  });
});

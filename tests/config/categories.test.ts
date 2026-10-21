import { describe, expect, it } from "vitest";
import { CATEGORIES, isCategorySlug } from "@/config/categories";

describe("CATEGORIES", () => {
  it("has the 6 categories in order", () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      "alimentacao-animal",
      "farmacia-veterinaria",
      "pets",
      "itens-pessoais",
      "jardinagem",
      "ferramentas",
    ]);
  });
  it("isCategorySlug accepts known slugs and rejects others", () => {
    expect(isCategorySlug("pets")).toBe(true);
    expect(isCategorySlug("racao")).toBe(false);
    expect(isCategorySlug("")).toBe(false);
  });
});

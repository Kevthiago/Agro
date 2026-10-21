import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES } from "@/config/categories";
import { getPublishedProducts, groupByCategory, mapRow } from "@/lib/products";
import type { Product, ProductRow } from "@/lib/types";

const row = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: "1",
  slug: "racao",
  name: "Ração",
  description: "Boa",
  category: "alimentacao-animal",
  image_path: null,
  available: true,
  published: true,
  sort_order: 0,
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

// Cliente falso que imita a cadeia from().select().eq().
function fakeClient(result: { data: ProductRow[] | null; error: { message: string } | null }) {
  return {
    from: () => ({ select: () => ({ eq: () => Promise.resolve(result) }) }),
  } as unknown as SupabaseClient;
}

const env = { PUBLIC_SUPABASE_URL: "https://x.supabase.co", PUBLIC_SUPABASE_ANON_KEY: "anon" };

describe("mapRow", () => {
  it("converte image_path em imageUrl", () => {
    const p = mapRow(row({ image_path: "a/b.jpg" }), (path) => `https://cdn/${path}`);
    expect(p.imageUrl).toBe("https://cdn/a/b.jpg");
    expect(p.sortOrder).toBe(0);
  });

  it("devolve imageUrl null sem foto", () => {
    expect(mapRow(row(), () => "x").imageUrl).toBeNull();
  });

  it("lança para categoria desconhecida, citando o slug", () => {
    expect(() => mapRow(row({ slug: "esquisito", category: "nada" }), () => "x")).toThrow(
      /esquisito/,
    );
  });
});

describe("groupByCategory", () => {
  it("devolve array vazio para categoria sem produtos", () => {
    const g = groupByCategory([{ category: "pets" } as Product]);
    expect(g.pets).toHaveLength(1);
    expect(g.jardinagem).toEqual([]);
    expect(Object.keys(g)).toEqual(CATEGORIES.map((c) => c.slug));
  });
});

describe("getPublishedProducts", () => {
  it("rejeita quando a consulta falha", async () => {
    const client = fakeClient({ data: null, error: { message: "boom" } });
    await expect(getPublishedProducts({ client, env })).rejects.toThrow(
      /^Falha ao carregar produtos do Supabase/,
    );
  });

  it("rejeita quando data é null sem erro", async () => {
    const client = fakeClient({ data: null, error: null });
    await expect(getPublishedProducts({ client, env })).rejects.toThrow(/resposta sem dados/);
  });

  it("rejeita quando não há produtos publicados", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(getPublishedProducts({ client, env })).rejects.toThrow(
      /nenhum produto publicado encontrado/,
    );
  });

  it("rejeita em produção sem variáveis (não devolve lista vazia)", async () => {
    await expect(getPublishedProducts({ env: { DEV: false } })).rejects.toThrow(
      /^Falha ao carregar produtos do Supabase.*PUBLIC_SUPABASE_URL/,
    );
  });

  it("usa fixtures em DEV sem variáveis", async () => {
    const list = await getPublishedProducts({ env: { DEV: true } });
    expect(list).toHaveLength(14);
  });

  it("usa fixtures com PRODUCTS_SOURCE=fixtures", async () => {
    const list = await getPublishedProducts({ env: { DEV: false, PRODUCTS_SOURCE: "fixtures" } });
    expect(list).toHaveLength(14);
  });

  it("ordena por sortOrder e depois por nome", async () => {
    const client = fakeClient({
      data: [
        row({ id: "1", name: "Zebra", sort_order: 1 }),
        row({ id: "2", name: "Água", sort_order: 1 }),
        row({ id: "3", name: "Último", sort_order: 0 }),
      ],
      error: null,
    });
    const list = await getPublishedProducts({ client, env });
    expect(list.map((p) => p.name)).toEqual(["Último", "Água", "Zebra"]);
  });
});

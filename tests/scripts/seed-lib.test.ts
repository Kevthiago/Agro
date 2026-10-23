import { describe, expect, it } from "vitest";
import { buildImagePath, isLocalHost, parseArgs, planSeed } from "../../scripts/seed-lib.ts";
import type { SeedProduct } from "../../scripts/seed-data.ts";

const item = (slug: string, name = slug): SeedProduct => ({
  slug,
  name,
  description: "d",
  category: "ferramentas",
  photoFile: "x.jpg",
  sortOrder: 10,
  available: true,
  published: true,
});
const data = [item("a"), item("b"), item("c")];

describe("planSeed", () => {
  it("no modo padrão insere só os novos e nunca atualiza", () => {
    const plan = planSeed(new Set(["a", "b"]), data, { force: false });
    expect(plan.toInsert.map((p) => p.slug)).toEqual(["c"]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.skipped.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("com force atualiza os existentes e insere só os novos", () => {
    const plan = planSeed(new Set(["a"]), data, { force: true });
    expect(plan.toInsert.map((p) => p.slug)).toEqual(["b", "c"]);
    expect(plan.toUpdate.map((p) => p.slug)).toEqual(["a"]);
    expect(plan.skipped).toEqual([]);
  });

  it("com tudo já existente não insere nada", () => {
    const plan = planSeed(new Set(["a", "b", "c"]), data, { force: false });
    expect(plan.toInsert).toEqual([]);
  });
});

describe("isLocalHost", () => {
  it("aceita só o Supabase local", () => {
    expect(isLocalHost("http://127.0.0.1:55421")).toBe(true);
    expect(isLocalHost("http://localhost:54321")).toBe(true);
  });
  it("recusa produção, imitações e lixo", () => {
    expect(isLocalHost("https://abc.supabase.co")).toBe(false);
    expect(isLocalHost("http://localhost.evil.com")).toBe(false);
    expect(isLocalHost("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLocalHost("http://evil.com/localhost")).toBe(false);
    expect(isLocalHost("http://user@evil.com#@localhost")).toBe(false);
    expect(isLocalHost("não é url")).toBe(false);
    expect(isLocalHost("")).toBe(false);
  });
});

describe("parseArgs", () => {
  it("lê --yes e --force", () => {
    expect(parseArgs([])).toEqual({ yes: false, force: false });
    expect(parseArgs(["--yes"])).toEqual({ yes: true, force: false });
    expect(parseArgs(["--force", "--yes"])).toEqual({ yes: true, force: true });
  });
});

describe("buildImagePath", () => {
  it("monta products/<slug>-<hex>.webp", () => {
    expect(buildImagePath("bioxan-vallee-500ml", () => "0a1b2c3d")).toBe(
      "products/bioxan-vallee-500ml-0a1b2c3d.webp",
    );
  });
});

import { describe, expect, it } from "vitest";
import { filterProducts } from "@/lib/search";

const items = [
  { name: "Cálcio Vallée 500ml", description: "Cálcio, Fósforo, Magnésio e Glicose" },
  { name: "Arame Galvanizado", description: "Especial - 100m" },
  { name: "NexGard Spectra", description: "Antipulgas, Carrapatos e Vermífugo" },
];

describe("filterProducts", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(filterProducts(items, "calcio")).toEqual([0]);
    expect(filterProducts(items, "VERMIFUGO")).toEqual([2]);
  });
  it("consulta vazia casa tudo", () => expect(filterProducts(items, "")).toEqual([0, 1, 2]));
  it("consulta só com espaços casa tudo", () =>
    expect(filterProducts(items, "   ")).toEqual([0, 1, 2]));
  it("sem resultado devolve []", () => expect(filterProducts(items, "zzzz")).toEqual([]));
  it("busca também na descrição", () => expect(filterProducts(items, "100m")).toEqual([1]));
  it("várias palavras exigem todas, em nome ou descrição", () => {
    expect(filterProducts(items, "arame especial")).toEqual([1]);
    expect(filterProducts(items, "arame fosforo")).toEqual([]);
  });
});

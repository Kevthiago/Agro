import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import ProductItem from "@/components/ProductItem.astro";
import Prateleira from "@/components/Prateleira.astro";
import type { Product } from "@/lib/types";

const product: Product = {
  id: "p1",
  slug: "cidental-250ml",
  name: "Cidental 250ml",
  description: "Larvicida e Repelente",
  category: "farmacia-veterinaria",
  imageUrl: null,
  available: true,
  sortOrder: 0,
};

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (p: Product) => container.renderToString(ProductItem, { props: { product: p } });

describe("ProductItem", () => {
  it("mostra nome, descrição e o botão de pedido com o nome do produto", async () => {
    const html = await render(product);
    expect(html).toContain("Cidental 250ml");
    expect(html).toContain("Larvicida e Repelente");
    expect(html).toContain("Pedir no WhatsApp");
    expect(html).not.toContain("Em falta");
    expect(html).toContain(
      `text=${encodeURIComponent("Olá! Tenho interesse no produto: Cidental 250ml")}`,
    );
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener"/);
  });

  it("usa o substituto quando não há foto, com o nome do produto como alt", async () => {
    const html = await render(product);
    expect(html).toMatch(/<img[^>]*src="[^"]*placeholder-produto[^"]*"/);
    expect(html).toMatch(/<img[^>]*alt="Cidental 250ml"/);
  });

  it("produto em falta mostra o aviso e troca o botão para pergunta", async () => {
    const html = await render({ ...product, available: false });
    expect(html).toContain("Em falta");
    expect(html).toContain("Perguntar no WhatsApp");
    expect(html).not.toContain("Pedir no WhatsApp");
  });
});

describe("Prateleira", () => {
  it("lista vazia mostra a mensagem padrão e um link genérico de WhatsApp", async () => {
    const html = await container.renderToString(Prateleira, { props: { products: [] } });
    expect(html).toContain("Ainda não temos itens aqui.");
    expect(html).toContain("Perguntar no WhatsApp");
    expect(html).toContain(encodeURIComponent("Olá! Vim pelo site e gostaria de atendimento."));
  });

  it("aceita mensagem de vazio personalizada", async () => {
    const html = await container.renderToString(Prateleira, {
      props: { products: [], emptyMessage: "Nada de jardinagem por enquanto." },
    });
    expect(html).toContain("Nada de jardinagem por enquanto.");
  });
});

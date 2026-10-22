import { expect, test, type Page } from "@playwright/test";

const SLUGS = [
  "alimentacao-animal",
  "farmacia-veterinaria",
  "pets",
  "itens-pessoais",
  "jardinagem",
  "ferramentas",
];

for (const slug of SLUGS) {
  test(`rota /produtos/${slug} responde 200`, async ({ page }) => {
    const res = await page.goto(`/produtos/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
}

test("/produtos/ferramentas lista só ferramentas", async ({ page }) => {
  await page.goto("/produtos/ferramentas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ferramentas");
  await expect(page.getByRole("heading", { level: 3, name: /Carrinho de Mão/ })).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 3, name: "Arame Galvanizado" })).toHaveCount(1);
  await expect(page.getByText("Quatree")).toHaveCount(0);
  await expect(page.getByText("Cálcio Vallée")).toHaveCount(0);
});

test("categoria vazia mostra mensagem e WhatsApp genérico", async ({ page }) => {
  await page.goto("/produtos/jardinagem");
  await expect(page.getByText("Ainda não temos itens aqui.")).toBeVisible();
  const link = page.getByRole("main").getByRole("link", { name: /WhatsApp/ });
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/5531986770027/);
});

test("seletor de categorias marca a página atual", async ({ page }) => {
  await page.goto("/produtos/pets");
  const nav = page.getByRole("navigation", { name: "Categorias" });
  await expect(nav.getByRole("link")).toHaveCount(7);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Pets");
  await page.goto("/produtos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produtos");
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Todos");
});

// A ilha só responde depois de hidratada (o atributo ssr some do astro-island).
async function openCatalog(page: Page) {
  await page.goto("/produtos");
  await page.locator("astro-island:not([ssr])").waitFor({ state: "attached" });
}

test("busca ignora acento, esconde o que não casa e volta ao limpar", async ({ page }) => {
  await openCatalog(page);
  const items = page.getByRole("main").locator("article");
  await expect(items).toHaveCount(14);
  const input = page.getByLabel("Buscar produto");
  await input.fill("calcio");
  await expect(items.filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 3, name: "Cálcio Vallée 500ml" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("1 produto");
  await input.fill("");
  await expect(items.filter({ visible: true })).toHaveCount(14);
  await expect(page.getByRole("status")).toHaveText("14 produtos");
});

test("busca sem resultado oferece o WhatsApp", async ({ page }) => {
  await openCatalog(page);
  await page.getByLabel("Buscar produto").fill("xyzzyqq");
  await expect(page.getByRole("status")).toHaveText("Nenhum produto encontrado");
  const link = page.getByRole("main").getByRole("link", { name: "Perguntar no WhatsApp" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/5531986770027/);
});

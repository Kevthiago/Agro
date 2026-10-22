import { expect, test } from "@playwright/test";

const CORRIDOR_SLUGS = [
  "alimentacao-animal",
  "farmacia-veterinaria",
  "pets",
  "itens-pessoais",
  "jardinagem",
  "ferramentas",
];

test("hero traz o título da loja e a foto principal carregada com prioridade", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tudo pro bicho e pra roça, no balcão de Desterro.",
  );
  const hero = page.locator("[data-hero] img").first();
  await expect(hero).toHaveAttribute("fetchpriority", "high");
  await expect(hero).toHaveAttribute("loading", "eager");
});

test("seis corredores levam ao catálogo de cada categoria, na ordem", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("region", { name: "Corredores da loja" }).getByRole("link");
  await expect(links).toHaveCount(6);
  for (const [i, slug] of CORRIDOR_SLUGS.entries()) {
    await expect(links.nth(i)).toHaveAttribute("href", `/produtos/${slug}`);
  }
});

test("corredor se abre ao passar o mouse (desktop)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const first = page.getByRole("region", { name: "Corredores da loja" }).getByRole("link").first();
  const before = (await first.boundingBox())!.width;
  await first.hover();
  await expect.poll(async () => (await first.boundingBox())!.width).toBeGreaterThan(before * 1.4);
});

test("prateleira mostra até 5 produtos, cada um com pedido no WhatsApp pelo nome", async ({
  page,
}) => {
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Na prateleira" });
  const items = shelf.getByRole("listitem");
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(5);

  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const name = (await item.getByRole("heading", { level: 3 }).innerText()).trim();
    const link = item.getByRole("link", { name: /Pedir no WhatsApp/ });
    await expect(link).toHaveAccessibleName(
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    const href = (await link.getAttribute("href"))!;
    expect(new URL(href).searchParams.get("text")).toContain(name);
    // fixtures não têm foto: aparece o substituto, com o nome como alt
    const img = item.getByRole("img", { name });
    await expect(img).toHaveAttribute("src", /placeholder-produto/);
  }

  await expect(page.getByRole("link", { name: "Ver todos os produtos" })).toHaveAttribute(
    "href",
    "/produtos",
  );
});

test("a página não rola na horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

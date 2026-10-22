import { expect, test } from "@playwright/test";

const PAGES = ["/", "/produtos", "/produtos/ferramentas", "/404.html"];

test("a inicial traz um único JSON-LD de LocalBusiness com os dados da loja", async ({ page }) => {
  await page.goto("/");
  const scripts = page.locator('script[type="application/ld+json"]');
  await expect(scripts).toHaveCount(1);

  const data = JSON.parse((await scripts.first().textContent())!);
  expect(data["@type"]).toBe("LocalBusiness");
  expect(data.name).toBe("Agropecuária Santos");
  expect(data.telephone).toBe("+5531986770027");
  expect(data.address).toMatchObject({
    streetAddress: "Rua Coronel Joaquim Resende, 220",
    addressLocality: "Desterro de Entre Rios",
    addressRegion: "MG",
    addressCountry: "BR",
  });
  expect(data.sameAs).toContain("https://www.instagram.com/agrosantos");
});

for (const path of PAGES) {
  test(`${path} tem título, descrição e Open Graph`, async ({ page }) => {
    await page.goto(path);
    expect((await page.title()).trim()).not.toBe("");

    const content = (selector: string) => page.locator(selector).getAttribute("content");
    expect((await content('meta[name="description"]'))?.trim()).toBeTruthy();
    expect((await content('meta[property="og:title"]'))?.trim()).toBeTruthy();
    expect((await content('meta[property="og:image"]'))?.trim()).toBeTruthy();
    expect(await content('meta[property="og:locale"]')).toBe("pt_BR");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
}

test("mapa carrega sob demanda e tem título", async ({ page }) => {
  await page.goto("/");
  const map = page.locator("#onde-estamos iframe");
  await expect(map).toHaveAttribute("loading", "lazy");
  await expect(map).toHaveAttribute("title", /\S/);
  await expect(page.locator("#onde-estamos")).toContainText("Rua Coronel Joaquim Resende, 220");
  await expect(page.getByRole("link", { name: "Como chegar" })).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/dir\//,
  );
});

test("contato tem WhatsApp, telefones, e-mail e Instagram, sem formulário", async ({ page }) => {
  await page.goto("/");
  const contato = page.locator("#contato");
  await expect(contato.locator('a[href^="https://wa.me/5531986770027"]').first()).toBeVisible();
  await expect(contato.locator('a[href="tel:+553137361025"]')).toBeVisible();
  await expect(contato.locator('a[href="tel:+5531986770027"]')).toBeVisible();
  await expect(contato.locator('a[href="mailto:agrosantosdesterro@hotmail.com"]')).toBeVisible();
  const instagram = contato.locator('a[href="https://www.instagram.com/agrosantos"]');
  await expect(instagram).toHaveAttribute("target", "_blank");
  await expect(instagram).toHaveAttribute("rel", /noopener/);
  await expect(page.locator("form")).toHaveCount(0);
});

test("sitemap lista o catálogo e deixa o /admin de fora", async ({ request }) => {
  const index = await request.get("/sitemap-index.xml");
  expect(index.ok()).toBe(true);
  const locs = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(locs.length).toBeGreaterThan(0);

  const sitemap = await request.get(new URL(locs[0]!).pathname);
  expect(sitemap.ok()).toBe(true);
  const body = await sitemap.text();
  expect(body).toContain("/produtos/ferramentas");
  expect(body).not.toContain("/admin");
});

test("robots.txt bloqueia o /admin e aponta o sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("User-agent: *");
  expect(body).toContain("Disallow: /admin");
  expect(body).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap-index\.xml$/m);
});

test("endereço inexistente mostra a página 404 do site", async ({ page }) => {
  const response = await page.goto("/pagina-que-nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Página não encontrada");
  await expect(page.getByRole("main").getByRole("link", { name: "Início" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.getByRole("main").getByRole("link", { name: /Produtos/ })).toHaveAttribute(
    "href",
    "/produtos",
  );
  await expect(page.getByRole("main").locator('a[href^="https://wa.me/"]')).toBeVisible();
});

for (const [name, id] of [
  ["Quem Somos", "quem-somos"],
  ["Onde Estamos", "onde-estamos"],
  ["Contato", "contato"],
] as const) {
  test(`menu leva à seção ${name} da inicial`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const section = page.locator(`section#${id}`);
    await expect(section).toHaveAttribute("aria-labelledby", /\S/);
    await expect(section.getByRole("heading", { level: 2 }).first()).toBeVisible();

    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(section).toBeInViewport();
  });
}

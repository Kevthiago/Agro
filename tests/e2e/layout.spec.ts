import { expect, test, type Request } from "@playwright/test";

const NAV_LINKS = [
  { name: "Início", href: "/" },
  { name: "Produtos", href: "/produtos" },
  { name: "Quem Somos", href: "/#quem-somos" },
  { name: "Onde Estamos", href: "/#onde-estamos" },
  { name: "Contato", href: "/#contato" },
];

test("cabeçalho tem o logo e os cinco links de navegação", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header.getByRole("img", { name: /Agro Santos/i })).toBeVisible();

  const nav = header.getByRole("navigation", { name: "Principal" });
  for (const { name, href } of NAV_LINKS) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
});

test("existe link para o WhatsApp da loja", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href^="https://wa.me/5531986770027"]').first()).toBeAttached();
});

test("rodapé traz endereço, telefones, e-mail, Instagram e CNPJ", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toContainText("Rua Coronel Joaquim Resende, 220");
  await expect(footer).toContainText("(31) 3736-1025");
  await expect(footer).toContainText("(31) 9 8677-0027");
  await expect(footer).toContainText("agrosantosdesterro@hotmail.com");
  await expect(footer).toContainText("11.237.212/0001-03");
  await expect(footer.locator('a[href="https://www.instagram.com/agrosantos"]')).toBeAttached();
});

test("fontes vêm do próprio site, sem hosts de terceiros", async ({ page, baseURL }) => {
  const requests: Request[] = [];
  // Só as requisições da própria página: o mapa do Google (iframe em "Onde estamos") é
  // um conteúdo de terceiros que traz as fontes dele.
  page.on("request", (request) => {
    if (request.frame() === page.mainFrame()) requests.push(request);
  });

  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");

  const origin = new URL(baseURL!).host;
  const hosts = new Set(requests.map((r) => new URL(r.url()).host));
  for (const host of hosts) {
    expect(host).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net/);
  }

  // Folhas de estilo e fontes saem todas da própria origem.
  const assets = requests.filter((r) => ["font", "stylesheet"].includes(r.resourceType()));
  for (const r of assets) expect(new URL(r.url()).host).toBe(origin);

  const fonts = requests.filter((r) => r.resourceType() === "font").map((r) => r.url());
  expect(fonts.length).toBeGreaterThan(0);
  for (const url of fonts) {
    expect(new URL(url).pathname).toMatch(/^\/_astro\/.+\.woff2$/);
  }
});

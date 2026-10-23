import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// O build dos testes não tem Supabase: o painel mostra o aviso de configuração.
const NOT_CONFIGURED =
  "Painel não configurado. Defina PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY.";

test("/admin abre fora dos buscadores e sem o cabeçalho do site", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByText("Painel da loja").first()).toBeVisible();
  await expect(page.getByText(NOT_CONFIGURED)).toBeVisible();
});

test("/admin não está no sitemap, que lista as outras páginas", async ({ request }) => {
  const index = await request.get("/sitemap-index.xml");
  const sitemaps = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect(sitemaps.length).toBeGreaterThan(0);

  const urls: string[] = [];
  for (const sitemap of sitemaps) {
    const body = await (await request.get(new URL(sitemap).pathname)).text();
    urls.push(...[...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!));
  }
  const paths = urls.map((u) => new URL(u).pathname);
  expect(paths.some((p) => p.startsWith("/produtos/ferramentas"))).toBe(true);
  expect(paths.length).toBeGreaterThan(3);
  expect(paths.filter((p) => p.startsWith("/admin"))).toEqual([]);
});

test("robots.txt bloqueia o /admin", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toMatch(/^Disallow: \/admin$/m);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`axe: /admin em ${viewport.width}px sem violações sérias ou críticas`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin");
    await expect(page.getByText(NOT_CONFIGURED)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    const report = serious.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }));
    expect(report, JSON.stringify(report, null, 2)).toEqual([]);
  });
}

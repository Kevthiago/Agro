import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/produtos", "/produtos/ferramentas", "/produtos/jardinagem", "/404.html"];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "celular", width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of PAGES) {
      test(`axe: ${path} sem violações sérias ou críticas`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
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

    if (viewport.width < 768) {
      for (const path of PAGES) {
        test(`sem rolagem horizontal da página em ${path}`, async ({ page }) => {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          const { scroll, client } = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          expect(scroll).toBeLessThanOrEqual(client);
        });
      }
    }
  });
}

/** Foco visível: contorno ou sombra com tamanho diferente de zero. */
async function focusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const shadow = s.boxShadow !== "none";
    // O alvo pode ser um filho (ex.: etiqueta com o recorte no <span>): vale o anel do próprio <a>.
    return {
      tag: el.tagName,
      label: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
      visible: outline || shadow,
    };
  });
}

test("html declara pt-BR", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("Tab percorre cabeçalho, etiqueta, corredor, produto e rodapé com foco visível", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const seen: { tag: string; label: string; visible: boolean; region: string }[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const info = await focusIndicator(page);
    if (info.tag === "IFRAME" || info.tag === "BODY") {
      if (info.tag === "BODY") break;
      continue;
    }
    const region = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (el.closest("header")) return "header";
      if (el.closest("footer")) return "footer";
      if (el.closest("[data-hero]")) return "hero";
      if (el.closest(".corredores")) return "corredores";
      return "main";
    });
    seen.push({ ...info, region });
  }
  const unseen = seen.filter((s) => !s.visible);
  expect(unseen, JSON.stringify(unseen)).toEqual([]);
  const regions = new Set(seen.map((s) => s.region));
  for (const r of ["header", "hero", "corredores", "main", "footer"]) {
    expect(regions.has(r), `região ${r} alcançada por Tab`).toBe(true);
  }
});

test("link de pular é o primeiro Tab e leva o foco para #conteudo", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#conteudo")).toBeFocused();
});

test("com movimento reduzido a etiqueta e os corredores não animam", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const tag = page.locator("[data-hero] .tag");
  const before = await tag.evaluate((el) => getComputedStyle(el).transform);
  await tag.hover();
  const after = await tag.evaluate((el) => getComputedStyle(el).transform);
  expect(after).toBe(before);

  const durations = await page
    .locator(".corredores li, .corredores h3, .tag")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
  for (const d of durations) {
    for (const part of d.split(",")) {
      expect(parseFloat(part)).toBeLessThanOrEqual(0.001);
    }
  }
});

test.describe("menu do celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre e fecha pelo teclado e Escape devolve o foco", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Principal" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(nav).toBeVisible();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();

    await page.keyboard.press("Space");
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Produtos" }).focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  test("escolher um link de âncora da própria página fecha o menu", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Menu" });
    await toggle.click();
    await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Contato" })
      .click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("navigation", { name: "Principal" })).toBeHidden();
  });
});

test("todo link que abre nova aba avisa leitores de tela", async ({ page }) => {
  for (const path of ["/", "/produtos", "/produtos/ferramentas"]) {
    await page.goto(path);
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')]
        .filter((a) => !/abre em nova aba/i.test(a.textContent ?? ""))
        .map((a) => a.href),
    );
    expect(missing, `${path}: links sem aviso`).toEqual([]);
  }
});

test("o mapa é o único quadro além do principal na página inicial", async ({ page }) => {
  await page.goto("/");
  await page.locator("iframe").scrollIntoViewIfNeeded();
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  expect(frames.length).toBeLessThanOrEqual(1);
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveAttribute("title", /Mapa/);
  for (const f of frames) expect(f.url()).toMatch(/google\.com\/maps/);
});

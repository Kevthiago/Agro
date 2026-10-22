// Endereço público do site (PUBLIC_SITE_URL). Módulo .mjs puro para o astro.config importar
// sem etapa de TypeScript; os testes ficam em tests/config/site-url.test.ts.

/** Endereço do preview local; só vale para desenvolvimento e para o build dos testes e2e. */
export const LOCAL_SITE_URL = "http://localhost:4322";

export const MISSING_SITE_URL_MESSAGE =
  "PUBLIC_SITE_URL não está definida: defina o endereço público do site (ex.: https://www.seudominio.com.br) nas variáveis de ambiente do build";

/**
 * Decide o `site` do Astro. Build de produção sem a variável falha, para não publicar
 * canonical, sitemap e robots apontando para localhost.
 * @param {{ PUBLIC_SITE_URL?: string, PRODUCTS_SOURCE?: string }} env
 * @param {string} mode "production" (astro build) ou "development" (astro dev)
 * @returns {string} URL sem barra no fim
 */
export function resolveSiteUrl(env, mode) {
  const raw = env.PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (mode === "production" && env.PRODUCTS_SOURCE !== "fixtures") {
      throw new Error(MISSING_SITE_URL_MESSAGE);
    }
    return LOCAL_SITE_URL;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `PUBLIC_SITE_URL inválida: "${raw}". Use um endereço completo, como https://www.seudominio.com.br`,
    );
  }
  return url.href.replace(/\/$/, "");
}

import type { APIRoute } from "astro";

// Gerado no build (e não em public/) porque a linha do sitemap precisa do endereço do site.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("/sitemap-index.xml", site).href;
  const body = ["User-agent: *", "Allow: /", "Disallow: /admin", "", `Sitemap: ${sitemap}`, ""];
  return new Response(body.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

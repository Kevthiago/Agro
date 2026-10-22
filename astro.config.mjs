// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

// Fotos dos produtos vêm do Storage do Supabase; o Astro só otimiza imagens de hosts liberados.
const { PUBLIC_SUPABASE_URL, PUBLIC_SITE_URL } = loadEnv(
  process.env.NODE_ENV ?? "production",
  process.cwd(),
  "",
);
const supabase = PUBLIC_SUPABASE_URL ? new URL(PUBLIC_SUPABASE_URL) : undefined;

// Site estático; ilhas Preact serão usadas apenas no painel admin.
export default defineConfig({
  output: "static",
  // Endereço público do site: base do canonical, og:url, JSON-LD, sitemap e robots.txt.
  // Sem a variável, usa o endereço do preview local (o domínio ainda não foi definido).
  site: PUBLIC_SITE_URL || "http://localhost:4322",
  integrations: [
    preact(),
    // O painel /admin não entra no sitemap.
    sitemap({ filter: (page) => !new URL(page).pathname.startsWith("/admin") }),
  ],
  image: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      // o projeto configurado (inclui o Supabase local, http://127.0.0.1:54321)
      ...(supabase
        ? [
            {
              protocol: supabase.protocol.replace(":", ""),
              hostname: supabase.hostname,
              ...(supabase.port && { port: supabase.port }),
            },
          ]
        : []),
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

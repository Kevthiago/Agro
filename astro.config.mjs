// @ts-check
import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

// Fotos dos produtos vêm do Storage do Supabase; o Astro só otimiza imagens de hosts liberados.
const { PUBLIC_SUPABASE_URL } = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
const supabase = PUBLIC_SUPABASE_URL ? new URL(PUBLIC_SUPABASE_URL) : undefined;

// Site estático; ilhas Preact serão usadas apenas no painel admin.
export default defineConfig({
  output: "static",
  integrations: [preact()],
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

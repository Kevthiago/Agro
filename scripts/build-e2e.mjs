// Build de produção com produtos de fixture, para os testes e2e (funciona em qualquer SO).
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], {
  stdio: "inherit",
  // Sem Supabase (vazias vencem o .env): o painel /admin mostra "Painel não configurado".
  env: {
    ...process.env,
    PRODUCTS_SOURCE: "fixtures",
    PUBLIC_SUPABASE_URL: "",
    PUBLIC_SUPABASE_ANON_KEY: "",
  },
});
process.exit(result.status ?? 1);

// Build de produção com produtos de fixture, para os testes e2e (funciona em qualquer SO).
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], {
  stdio: "inherit",
  env: { ...process.env, PRODUCTS_SOURCE: "fixtures" },
});
process.exit(result.status ?? 1);

import { defineConfig, devices } from "@playwright/test";

const PORT = 4322;

// No Windows, o Playwright encerra o servidor com `taskkill`. Se o PATH do processo não
// incluir System32 (ambiente reduzido de alguns terminais e agentes), o comando falha e o
// encerramento fica preso por minutos. Garante o diretório no PATH.
if (process.platform === "win32") {
  const system32 = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32`;
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const current = process.env[pathKey] ?? "";
  if (!current.toLowerCase().includes(system32.toLowerCase())) {
    process.env[pathKey] = `${current};${system32}`;
  }
}

// Testes de ponta a ponta contra o build de produção, com produtos de fixture.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // O build roda antes, em `pretest:e2e`; aqui só o preview, direto no node (sem npm/npx,
    // cujo encerramento no Windows demorava minutos).
    command: `node node_modules/astro/bin/astro.mjs preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    env: { PRODUCTS_SOURCE: "fixtures" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

const PORT = 4322;

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
    command: `npm run build && npx astro preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    env: { PRODUCTS_SOURCE: "fixtures" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

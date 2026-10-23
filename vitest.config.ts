import { getViteConfig } from "astro/config";

// getViteConfig permite que os testes importem assets processados pelo Astro.
export default getViteConfig({
  test: {
    // Testes de componentes do painel (.tsx) declaram o ambiente happy-dom no próprio arquivo.
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});

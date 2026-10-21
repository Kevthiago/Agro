import { getViteConfig } from "astro/config";

// getViteConfig permite que os testes importem assets processados pelo Astro.
export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

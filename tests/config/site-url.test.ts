import { describe, expect, it } from "vitest";
import {
  LOCAL_SITE_URL,
  MISSING_SITE_URL_MESSAGE,
  resolveSiteUrl,
} from "../../config/site-url.mjs";

describe("resolveSiteUrl", () => {
  it("returns the configured URL without a trailing slash", () => {
    expect(
      resolveSiteUrl({ PUBLIC_SITE_URL: "https://www.agrosantos.com.br/" }, "production"),
    ).toBe("https://www.agrosantos.com.br");
    expect(resolveSiteUrl({ PUBLIC_SITE_URL: "https://www.agrosantos.com.br" }, "production")).toBe(
      "https://www.agrosantos.com.br",
    );
  });

  it("fails a production build without the variable", () => {
    expect(() => resolveSiteUrl({}, "production")).toThrow(MISSING_SITE_URL_MESSAGE);
    expect(() => resolveSiteUrl({ PUBLIC_SITE_URL: "  " }, "production")).toThrow(
      MISSING_SITE_URL_MESSAGE,
    );
  });

  it("falls back to the local preview for the fixtures (e2e) build", () => {
    expect(resolveSiteUrl({ PRODUCTS_SOURCE: "fixtures" }, "production")).toBe(LOCAL_SITE_URL);
  });

  it("falls back to the local preview in development", () => {
    expect(resolveSiteUrl({}, "development")).toBe(LOCAL_SITE_URL);
  });

  it("rejects a URL that cannot be parsed", () => {
    expect(() => resolveSiteUrl({ PUBLIC_SITE_URL: "agrosantos.com.br" }, "production")).toThrow(
      /PUBLIC_SITE_URL inválida/,
    );
  });
});

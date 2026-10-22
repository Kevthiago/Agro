import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import { buildLocalBusinessJsonLd, serializeJsonLd } from "@/lib/seo";

describe("buildLocalBusinessJsonLd", () => {
  const data = buildLocalBusinessJsonLd(site, "https://agrosantos.com.br", "/_astro/logo.png");

  it("describes the store as a schema.org LocalBusiness", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("LocalBusiness");
    expect(data.name).toBe("Agropecuária Santos");
  });

  it("uses the WhatsApp number in E.164 and the store e-mail", () => {
    expect(data.telephone).toBe("+5531986770027");
    expect(data.email).toBe("agrosantosdesterro@hotmail.com");
  });

  it("builds absolute url and image from the base url", () => {
    expect(data.url).toBe("https://agrosantos.com.br/");
    expect(data.image).toBe("https://agrosantos.com.br/_astro/logo.png");
  });

  it("has the postal address in Desterro de Entre Rios, MG", () => {
    expect(data.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Rua Coronel Joaquim Resende, 220",
      addressLocality: "Desterro de Entre Rios",
      addressRegion: "MG",
      addressCountry: "BR",
    });
  });

  it("links the Instagram profile and leaves out unknown or private data", () => {
    expect(data.sameAs).toEqual(["https://www.instagram.com/agrosantos"]);
    expect(data).not.toHaveProperty("openingHours");
    expect(data).not.toHaveProperty("taxID");
    expect(data).not.toHaveProperty("vatID");
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so the content cannot close the script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

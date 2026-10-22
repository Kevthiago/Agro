import type { site as storeSite } from "@/config/site";

type Site = typeof storeSite;

export interface LocalBusinessJsonLd {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  telephone: string;
  email: string;
  url: string;
  image: string;
  address: {
    "@type": "PostalAddress";
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    addressCountry: "BR";
  };
  sameAs: string[];
}

/**
 * Dados estruturados da loja para buscadores (schema.org LocalBusiness).
 * Sem horário de funcionamento (ainda não informado) e sem CNPJ.
 */
export function buildLocalBusinessJsonLd(
  site: Site,
  baseUrl: string | URL,
  logoPath: string,
): LocalBusinessJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: site.name,
    // E.164: o número do WhatsApp já vem com o 55 do país
    telephone: `+${site.whatsappNumber}`,
    email: site.email,
    url: new URL("/", baseUrl).href,
    image: new URL(logoPath, baseUrl).href,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.city,
      addressRegion: site.address.state,
      addressCountry: "BR",
    },
    sameAs: [site.instagram.url],
  };
}

/** JSON para dentro de <script>: "<" vira <, então nenhum texto fecha a tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

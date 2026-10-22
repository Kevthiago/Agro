import type { site as storeSite } from "@/config/site";

type Site = typeof storeSite;

/** "(31) 3736-1025" -> "tel:+553137361025" */
export const telHref = (phone: string) => `tel:+55${phone.replace(/\D/g, "")}`;

/** Rota no Google Maps até a loja, a partir de onde a pessoa estiver. */
export function directionsUrl(site: Site): string {
  const { street, city, state } = site.address;
  const destination = `${site.name}, ${street}, ${city}, ${state}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

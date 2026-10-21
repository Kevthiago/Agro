import { site } from "@/config/site";

/** Monta o link wa.me com mensagem pronta, genérica ou sobre um produto. */
export function buildWhatsAppLink(productName?: string): string {
  const message = productName
    ? `Olá! Tenho interesse no produto: ${productName}`
    : "Olá! Vim pelo site e gostaria de atendimento.";
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

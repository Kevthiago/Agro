import { site } from "@/config/site";

/** Monta o link wa.me com mensagem pronta, genérica ou sobre um produto. */
export function buildWhatsAppLink(productName?: string): string {
  const message = productName
    ? `Olá! Tenho interesse no produto: ${productName}`
    : "Olá! Vim pelo site e gostaria de atendimento.";
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Número do WhatsApp como se escreve no balcão: "(31) 9 8677-0027". */
export const whatsappDisplayNumber = (() => {
  const local = site.whatsappNumber.slice(2); // sem o 55 do país
  return `(${local.slice(0, 2)}) ${local[2]} ${local.slice(3, 7)}-${local.slice(7)}`;
})();

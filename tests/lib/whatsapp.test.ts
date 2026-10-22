import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, whatsappDisplayNumber } from "@/lib/whatsapp";

describe("buildWhatsAppLink", () => {
  it("links to the store number with a generic message", () => {
    expect(buildWhatsAppLink()).toBe(
      "https://wa.me/5531986770027?text=" +
        encodeURIComponent("Olá! Vim pelo site e gostaria de atendimento."),
    );
  });
  it("includes the product name", () => {
    expect(buildWhatsAppLink("Quatree Supreme 25kg")).toBe(
      "https://wa.me/5531986770027?text=" +
        encodeURIComponent("Olá! Tenho interesse no produto: Quatree Supreme 25kg"),
    );
  });
  it("keeps quotes, ampersands, hashes and emoji intact after decoding", () => {
    const name = `Ração "Big" & Cia #1 🐶`;
    const text = new URL(buildWhatsAppLink(name)).searchParams.get("text");
    expect(text).toBe(`Olá! Tenho interesse no produto: ${name}`);
  });
});

describe("whatsappDisplayNumber", () => {
  it("formats the store number the way it is written on the counter", () => {
    expect(whatsappDisplayNumber).toBe("(31) 9 8677-0027");
  });
});

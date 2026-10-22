import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import { directionsUrl, telHref } from "@/lib/contact";

describe("telHref", () => {
  it("turns a written phone into an international tel: link", () => {
    expect(telHref("(31) 3736-1025")).toBe("tel:+553137361025");
    expect(telHref("(31) 9 8677-0027")).toBe("tel:+5531986770027");
  });
});

describe("directionsUrl", () => {
  it("opens Google Maps directions to the store address", () => {
    const url = new URL(directionsUrl(site));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe(
      "Agropecuária Santos, Rua Coronel Joaquim Resende, 220, Desterro de Entre Rios, MG",
    );
  });
});

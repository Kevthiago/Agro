import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("removes accents and lowercases", () =>
    expect(slugify("Cálcio Vallée 500ml")).toBe("calcio-vallee-500ml"));
  it("collapses symbols and trims dashes", () =>
    expect(slugify("  Arame -- Galvanizado! ")).toBe("arame-galvanizado"));
  it("returns an empty string for names with no letters or digits", () =>
    expect(slugify("🐶🐶")).toBe(""));
});

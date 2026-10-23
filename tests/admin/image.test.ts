import { describe, expect, it, vi } from "vitest";
import {
  fitWithin,
  prepareImage,
  validateImageFile,
  type DecodedImage,
  type ImageEncoder,
} from "@/admin/image";

const MB = 1024 * 1024;

/** Arquivo falso: o tamanho é declarado, sem alocar memória de verdade. */
function fakeFile(type: string, size = 1000): File {
  const file = new File(["x"], "foto", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Decodificador/codificador falso: imagem do tamanho pedido e blobs com o tamanho da fila. */
function fakeEncoder(
  width: number,
  height: number,
  options: { sizes?: number[]; type?: string; decodeFails?: boolean } = {},
) {
  const sizes = [...(options.sizes ?? [50_000])];
  const close = vi.fn();
  const encoder = {
    decode: vi.fn<ImageEncoder["decode"]>(async (): Promise<DecodedImage> => {
      if (options.decodeFails) throw new Error("decode");
      return { width, height, source: {} as CanvasImageSource, close };
    }),
    encode: vi.fn<ImageEncoder["encode"]>(
      async () =>
        new Blob([new Uint8Array(sizes.length > 1 ? sizes.shift()! : sizes[0]!)], {
          type: options.type ?? "image/webp",
        }),
    ),
  } satisfies ImageEncoder;
  return { encoder, close };
}

describe("validateImageFile", () => {
  it("recusa tipos que não são JPG, PNG ou WebP", () => {
    expect(() => validateImageFile({ type: "text/plain", size: 10 })).toThrow(
      new Error("Envie uma imagem JPG, PNG ou WebP."),
    );
    expect(() => validateImageFile({ type: "image/gif", size: 10 })).toThrow(
      "Envie uma imagem JPG, PNG ou WebP.",
    );
  });

  it("recusa acima de 15 MB e aceita até 15 MB", () => {
    expect(() => validateImageFile({ type: "image/jpeg", size: 15 * MB + 1 })).toThrow(
      new Error("Essa foto é muito grande. Escolha uma de até 15 MB."),
    );
    expect(() => validateImageFile({ type: "image/png", size: 15 * MB })).not.toThrow();
    expect(() => validateImageFile({ type: "image/webp", size: 1 })).not.toThrow();
  });
});

describe("fitWithin", () => {
  it("reduz mantendo a proporção", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 900, height: 1200 });
  });

  it("nunca aumenta", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it("devolve inteiros de pelo menos 1", () => {
    expect(fitWithin(10000, 3)).toEqual({ width: 1200, height: 1 });
    expect(fitWithin(1999, 1333, 1000)).toEqual({ width: 1000, height: 667 });
  });
});

describe("prepareImage", () => {
  it("recusa text/plain com a mensagem amigável", async () => {
    const { encoder } = fakeEncoder(10, 10);
    await expect(prepareImage(fakeFile("text/plain"), encoder)).rejects.toThrow(
      "Envie uma imagem JPG, PNG ou WebP.",
    );
    expect(encoder.decode).not.toHaveBeenCalled();
  });

  it("recusa arquivo de 20 MB", async () => {
    const { encoder } = fakeEncoder(10, 10);
    await expect(prepareImage(fakeFile("image/jpeg", 20 * MB), encoder)).rejects.toThrow(
      "Essa foto é muito grande. Escolha uma de até 15 MB.",
    );
  });

  it("foto de 4000 px vira WebP de no máximo 1200 px de largura", async () => {
    const { encoder, close } = fakeEncoder(4000, 3000);
    const blob = await prepareImage(fakeFile("image/jpeg", 5 * MB), encoder);
    expect(blob.type).toBe("image/webp");
    const [, width, height, quality] = encoder.encode.mock.calls[0]!;
    expect(width).toBeLessThanOrEqual(1200);
    expect(width).toBe(1200);
    expect(height).toBe(900);
    expect(quality).toBe(0.82);
    expect(close).toHaveBeenCalled();
  });

  it("baixa a qualidade até caber em 2 MB", async () => {
    const { encoder } = fakeEncoder(1200, 900, { sizes: [3 * MB, 2.5 * MB, 1 * MB] });
    const blob = await prepareImage(fakeFile("image/png"), encoder);
    expect(blob.size).toBe(1 * MB);
    expect(encoder.encode.mock.calls.map((c) => c[3])).toEqual([0.82, 0.7, 0.6]);
  });

  it("desiste com mensagem amigável se nem a menor qualidade cabe", async () => {
    const { encoder } = fakeEncoder(1200, 900, { sizes: [3 * MB] });
    await expect(prepareImage(fakeFile("image/png"), encoder)).rejects.toThrow(
      "Não foi possível reduzir essa foto. Tente uma foto menor.",
    );
  });

  it("foto que não abre vira mensagem amigável", async () => {
    const { encoder } = fakeEncoder(1, 1, { decodeFails: true });
    await expect(prepareImage(fakeFile("image/jpeg"), encoder)).rejects.toThrow(
      "Não conseguimos abrir essa foto. Tente outra.",
    );
  });

  it("navegador que não gera WebP recebe mensagem amigável", async () => {
    const { encoder, close } = fakeEncoder(100, 100, { type: "image/png" });
    await expect(prepareImage(fakeFile("image/jpeg"), encoder)).rejects.toThrow(
      "Este navegador não consegue preparar a foto. Tente pelo Google Chrome.",
    );
    expect(close).toHaveBeenCalled();
  });
});

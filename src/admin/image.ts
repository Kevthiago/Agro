/** Preparo da foto no navegador: valida, reduz e converte para WebP antes de enviar. */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Limite do bucket product-images (2 MB). */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const QUALITIES = [0.82, 0.7, 0.6];

/** Foto aberta, pronta para desenhar. `close` libera a memória. */
export interface DecodedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

/** Abre e codifica fotos (substituível nos testes, que não têm canvas). */
export interface ImageEncoder {
  decode(file: Blob): Promise<DecodedImage>;
  encode(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob>;
}

/** Recusa arquivos que não são foto aceita ou que passam de 15 MB. */
export function validateImageFile(file: { type: string; size: number }): void {
  if (!ACCEPTED.includes(file.type)) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Essa foto é muito grande. Escolha uma de até 15 MB.");
  }
}

/** Cabe a foto num quadrado de `max` px, sem aumentar e sem distorcer. */
export function fitWithin(
  width: number,
  height: number,
  max = 1200,
): { width: number; height: number } {
  const scale = Math.min(1, max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Codificador do navegador: createImageBitmap + canvas. */
export const browserEncoder: ImageEncoder = {
  async decode(file) {
    // respeita a rotação gravada pela câmera do celular
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  async encode(source, width, height, quality) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(source, 0, 0, width, height);
      return canvas.convertToBlob({ type: "image/webp", quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(source, 0, 0, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("canvas"))),
        "image/webp",
        quality,
      ),
    );
  },
};

/**
 * Deixa a foto pronta para o bucket: no máximo 1200 px, WebP e até 2 MB.
 * Todas as falhas viram mensagens que a família entende.
 */
export async function prepareImage(
  file: File,
  encoder: ImageEncoder = browserEncoder,
): Promise<Blob> {
  validateImageFile(file);

  let image: DecodedImage;
  try {
    image = await encoder.decode(file);
  } catch {
    throw new Error("Não conseguimos abrir essa foto. Tente outra.");
  }

  try {
    const { width, height } = fitWithin(image.width, image.height);
    for (const quality of QUALITIES) {
      let blob: Blob;
      try {
        blob = await encoder.encode(image.source, width, height, quality);
      } catch {
        throw new Error("Não conseguimos abrir essa foto. Tente outra.");
      }
      // Alguns navegadores (ex.: Safari) devolvem PNG em vez de WebP sem avisar.
      if (blob.type !== "image/webp") {
        throw new Error("Este navegador não consegue preparar a foto. Tente pelo Google Chrome.");
      }
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    }
    throw new Error("Não foi possível reduzir essa foto. Tente uma foto menor.");
  } finally {
    image.close();
  }
}

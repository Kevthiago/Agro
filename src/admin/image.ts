import { AdminError } from "@/admin/errors";

/**
 * Preparo da foto no navegador: valida, reduz e converte para WebP (ou JPEG, nos
 * navegadores sem WebP, como o Safari do iPhone) antes de enviar.
 */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** Limite do bucket product-images (2 MB). */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const QUALITIES = [0.82, 0.7, 0.6];

/** Formatos gerados, em ordem de preferência. */
export type OutputType = "image/webp" | "image/jpeg";
const OUTPUTS: readonly OutputType[] = ["image/webp", "image/jpeg"];

const CANNOT_OPEN = "Não conseguimos abrir essa foto. Tente outra.";
const CANNOT_PREPARE = "Não conseguimos preparar essa foto. Tente outra.";
const TOO_BIG_AFTER = "Não foi possível reduzir essa foto. Tente uma foto menor.";

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
  /** Pode devolver outro formato se o navegador não souber gerar `type` (ele avisa pelo blob.type). */
  encode(
    source: CanvasImageSource,
    width: number,
    height: number,
    quality: number,
    type: OutputType,
  ): Promise<Blob>;
}

/** Recusa arquivos que não são foto aceita ou que passam de 15 MB. */
export function validateImageFile(file: { type: string; size: number }): void {
  if (!ACCEPTED.includes(file.type)) throw new AdminError("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > MAX_INPUT_BYTES) {
    throw new AdminError("Essa foto é muito grande. Escolha uma de até 15 MB.");
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

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function draw(
  context: Context2D | null,
  source: CanvasImageSource,
  width: number,
  height: number,
  type: OutputType,
) {
  if (!context) throw new Error("canvas");
  // JPEG não tem transparência: sem fundo branco, PNG transparente viraria preto
  if (type === "image/jpeg") {
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0, width, height);
}

/** Codificador do navegador: createImageBitmap + canvas. */
export const browserEncoder: ImageEncoder = {
  async decode(file) {
    let bitmap: ImageBitmap;
    try {
      // respeita a rotação gravada pela câmera do celular
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      // navegadores antigos não aceitam as opções
      if (!(error instanceof TypeError)) throw error;
      bitmap = await createImageBitmap(file);
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  async encode(source, width, height, quality, type) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      draw(canvas.getContext("2d"), source, width, height, type);
      return canvas.convertToBlob({ type, quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d"), source, width, height, type);
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas"))), type, quality),
    );
  },
};

/**
 * Deixa a foto pronta para o bucket: no máximo 1200 px, WebP (ou JPEG) e até 2 MB.
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
    throw new AdminError(CANNOT_OPEN);
  }

  try {
    const { width, height } = fitWithin(image.width, image.height);
    for (const type of OUTPUTS) {
      for (const [attempt, quality] of QUALITIES.entries()) {
        let blob: Blob;
        try {
          blob = await encoder.encode(image.source, width, height, quality, type);
        } catch {
          throw new AdminError(CANNOT_OPEN);
        }
        if (blob.type !== type) {
          // o navegador não gera esse formato (ex.: Safari devolve PNG no lugar de WebP)
          if (attempt === 0) break;
          throw new AdminError(CANNOT_PREPARE);
        }
        if (blob.size <= MAX_OUTPUT_BYTES) return blob;
        if (attempt === QUALITIES.length - 1) throw new AdminError(TOO_BIG_AFTER);
      }
    }
    throw new AdminError(CANNOT_PREPARE);
  } finally {
    image.close();
  }
}

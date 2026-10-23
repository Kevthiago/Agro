/** Bucket público das fotos dos produtos (ver supabase/migrations/0001_init.sql). */
export const PRODUCT_IMAGES_BUCKET = "product-images";

/** Endereço público de uma foto do bucket, a partir da URL do projeto Supabase. */
export function productImageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`;
}

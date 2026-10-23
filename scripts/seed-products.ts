/**
 * Importa os 14 produtos do site antigo para o Supabase.
 *
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed -- [--yes] [--force]
 *
 * Usa a chave service_role (ignora RLS): por isso só roda contra o Supabase local
 * sem `--yes`. Nunca imprime a chave. Por padrão só insere slugs que ainda não existem.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { seedProducts, type SeedProduct } from "./seed-data.ts";
import { buildImagePath, isLocalHost, parseArgs, planSeed } from "./seed-lib.ts";

const BUCKET = "product-images";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 1200;
const QUALITIES = [82, 70, 60];

/** Reduz a foto (máx. 1200 px, sem ampliar, já girada) e gera WebP de até 2 MB. */
async function prepareImage(file: string, name: string): Promise<Buffer> {
  const source = await readFile(new URL(`../src/assets/${file}`, import.meta.url));
  for (const quality of QUALITIES) {
    const out = await sharp(source)
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (out.length <= MAX_BYTES) return out;
  }
  throw new Error(`a foto de "${name}" continua acima de 2 MB mesmo com qualidade 60`);
}

async function main(): Promise<number> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    console.error(
      "Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente. Nada foi feito.",
    );
    return 1;
  }
  const { yes, force } = parseArgs(process.argv.slice(2));

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    console.error("SUPABASE_URL não é uma URL válida. Nada foi feito.");
    return 1;
  }
  console.log(`Destino: ${host}`);
  if (!isLocalHost(url) && !yes) {
    console.error(
      `RECUSADO: ${host} não é o Supabase local. Serão enviados até ${seedProducts.length} produtos ` +
        "com a chave service_role. Se for isso mesmo, rode de novo com --yes.",
    );
    return 1;
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: rows, error: listError } = await db.from("products").select("slug");
  if (listError) {
    console.error(`Não foi possível ler os produtos existentes: ${listError.message}`);
    return 1;
  }
  const existing = new Set((rows ?? []).map((r) => r.slug as string));
  const plan = planSeed(existing, seedProducts, { force });
  console.log(
    `Plano: inserir ${plan.toInsert.length}, atualizar ${plan.toUpdate.length}, pular ${plan.skipped.length}.`,
  );

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const p of plan.toInsert) {
    const path = buildImagePath(p.slug, () => randomBytes(4).toString("hex"));
    try {
      const image = await prepareImage(p.photoFile, p.name);
      const up = await db.storage
        .from(BUCKET)
        .upload(path, image, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
      if (up.error) throw new Error(`envio da foto: ${up.error.message}`);
      const ins = await db.from("products").insert(toRow(p, path));
      if (ins.error) {
        await db.storage.from(BUCKET).remove([path]);
        throw new Error(`inserção: ${ins.error.message}`);
      }
      inserted++;
      console.log(`  inserido: ${p.slug}`);
    } catch (error) {
      failed++;
      console.error(`  FALHOU: ${p.slug} - ${error instanceof Error ? error.message : error}`);
    }
  }

  for (const p of plan.toUpdate) {
    // Só texto e ordem: image_path (e available/published) ficam como a família deixou.
    const res = await db
      .from("products")
      .update({
        name: p.name,
        description: p.description,
        category: p.category,
        sort_order: p.sortOrder,
      })
      .eq("slug", p.slug);
    if (res.error) {
      failed++;
      console.error(`  FALHOU: ${p.slug} - atualização: ${res.error.message}`);
    } else {
      updated++;
      console.log(`  atualizado: ${p.slug}`);
    }
  }

  console.log(
    `Resumo: inseridos ${inserted}, atualizados ${updated}, pulados ${plan.skipped.length}, falhas ${failed}.`,
  );
  return failed > 0 ? 1 : 0;
}

function toRow(p: SeedProduct, imagePath: string) {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    image_path: imagePath,
    available: p.available,
    published: p.published,
    sort_order: p.sortOrder,
  };
}

process.exitCode = await main();

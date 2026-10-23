/**
 * Integração com o Supabase local (npm run db:start). Só roda com SUPABASE_INTEGRATION=1 e as
 * chaves locais no ambiente (nunca em arquivo):
 *   SUPABASE_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run test:integration
 * A chave de serviço só cria e apaga as pessoas de teste; todo o resto usa a chave anon,
 * como o painel, para provar que o RLS deixa o editor gravar e barra quem não é editor.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NOT_FOUND,
  PERMISSION,
  deleteProduct,
  listProducts,
  saveProduct,
  saveProductWithPhoto,
  setAvailable,
  setPublished,
  uploadProductImage,
} from "@/admin/products-api";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/product-images";
import type { ProductInput } from "@/lib/types";

const enabled = process.env.SUPABASE_INTEGRATION === "1";
const url = process.env.SUPABASE_URL ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const run = Math.random().toString(16).slice(2, 10);
const NAME = `Integração ${run}`;
const SLUG = `integracao-${run}`;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: NAME,
  description: "Produto de teste",
  category: "ferramentas",
  imagePath: null,
  available: true,
  published: true,
  sortOrder: 0,
  ...over,
});

/** WebP mínimo válido (1x1). */
const webp = () =>
  new Blob(
    [
      Uint8Array.from(atob("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"), (c) =>
        c.charCodeAt(0),
      ),
    ],
    { type: "image/webp" },
  );

describe.skipIf(!enabled)("products-api contra o Supabase local", () => {
  let service: SupabaseClient;
  let editor: SupabaseClient;
  let outsider: SupabaseClient;
  const users: string[] = [];
  const editorEmail = `editor-${run}@example.test`;

  async function person(email: string): Promise<SupabaseClient> {
    const password = `Senha-${run}-${Math.random().toString(36).slice(2)}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error("não foi possível criar a pessoa de teste");
    users.push(data.user.id);
    const client = createClient(url, anonKey, noSession);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error("não foi possível entrar com a pessoa de teste");
    return client;
  }

  const filesIn = async () => {
    const { data } = await service.storage.from(PRODUCT_IMAGES_BUCKET).list("products", {
      search: SLUG,
    });
    return (data ?? []).map((f) => `products/${f.name}`);
  };

  beforeAll(async () => {
    if (!url || !anonKey || !serviceKey) {
      throw new Error("Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY");
    }
    service = createClient(url, serviceKey, noSession);
    const { error } = await service.from("editors").insert({ email: editorEmail });
    if (error) throw new Error("não foi possível cadastrar o editor de teste");
    editor = await person(editorEmail);
    outsider = await person(`visitante-${run}@example.test`);
  });

  afterAll(async () => {
    if (!service) return;
    const files = await filesIn();
    if (files.length) await service.storage.from(PRODUCT_IMAGES_BUCKET).remove(files);
    await service.from("products").delete().like("slug", `${SLUG}%`);
    await service.from("editors").delete().eq("email", editorEmail);
    for (const id of users) await service.auth.admin.deleteUser(id);
  });

  it("editor cria, renomeia, alterna, troca a foto e exclui", async () => {
    const first = await saveProduct(input(), editor);
    expect(first.slug).toBe(SLUG);
    const second = await saveProduct(input(), editor);
    expect(second.slug).toBe(`${SLUG}-2`);

    const renamed = await saveProduct({ ...input({ name: `${NAME} novo` }), id: first.id }, editor);
    expect(renamed.slug).toBe(SLUG);
    expect(renamed.name).toBe(`${NAME} novo`);

    await setAvailable(first.id, false, editor);
    await setPublished(first.id, false, editor);
    const listed = (await listProducts(editor)).find((p) => p.id === first.id);
    expect(listed).toMatchObject({ available: false, published: false });

    const withPhoto = await saveProductWithPhoto(
      { ...input(), id: first.id },
      { kind: "replace", blob: webp() },
      editor,
    );
    expect(withPhoto.imagePath).toMatch(new RegExp(`^products/${SLUG}-[0-9a-f]{8}\\.webp$`));
    expect(await filesIn()).toEqual([withPhoto.imagePath]);

    const replaced = await saveProductWithPhoto(
      { ...input({ imagePath: withPhoto.imagePath }), id: first.id },
      { kind: "replace", blob: webp() },
      editor,
    );
    expect(replaced.imagePath).not.toBe(withPhoto.imagePath);
    expect(await filesIn()).toEqual([replaced.imagePath]);

    await deleteProduct(replaced, editor);
    await deleteProduct(second, editor);
    expect(await filesIn()).toEqual([]);
    const { data } = await service.from("products").select("id").like("slug", `${SLUG}%`);
    expect(data).toEqual([]);
  });

  it("quem não é editor não grava nada", async () => {
    const product = await saveProduct(input({ name: `${NAME} alvo` }), editor);

    await expect(saveProduct(input({ name: `${NAME} intruso` }), outsider)).rejects.toThrow(
      PERMISSION,
    );
    await expect(
      saveProduct({ ...input({ name: "Trocado" }), id: product.id }, outsider),
    ).rejects.toThrow(NOT_FOUND);
    await expect(setPublished(product.id, false, outsider)).rejects.toThrow(NOT_FOUND);
    await expect(uploadProductImage(webp(), SLUG, outsider)).rejects.toThrow(PERMISSION);
    await expect(deleteProduct(product, outsider)).rejects.toThrow(NOT_FOUND);

    const { data } = await service.from("products").select("*").eq("id", product.id).single();
    expect(data).toMatchObject({ name: `${NAME} alvo`, published: true });
    const intruso = await service.from("products").select("id").eq("slug", `${SLUG}-intruso`);
    expect(intruso.data).toEqual([]);
    expect(await filesIn()).toEqual([]);

    await deleteProduct(product, editor);
  });
});

import { describe, expect, it } from "vitest";
import { AdminError } from "@/admin/errors";
import {
  CHANGED,
  ValidationError,
  deleteProduct,
  listProducts,
  removeProductImage,
  saveProduct,
  saveProductWithPhoto,
  setAvailable,
  setPublished,
  uploadProductImage,
  validateProductInput,
} from "@/admin/products-api";
import type { ProductInput } from "@/lib/types";
import { fakeProductsClient, productRow } from "./fake-products";

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: "Arame",
  description: "",
  category: "ferramentas",
  imagePath: null,
  available: true,
  published: true,
  sortOrder: 0,
  ...over,
});

const NAME_MSG = "Use pelo menos duas letras ou números no nome.";
const PERMISSION = "Você não tem permissão para fazer isso.";
const webp = () => new Blob([new Uint8Array(10)], { type: "image/webp" });

describe("validateProductInput", () => {
  it("aceita um produto válido", () => {
    expect(validateProductInput(input())).toEqual({});
  });

  it("nome: 1 caractere recusa, 2 aceita, 120 aceita, 121 recusa", () => {
    expect(validateProductInput(input({ name: "a" })).name).toBe(NAME_MSG);
    expect(validateProductInput(input({ name: "  a  " })).name).toBe(NAME_MSG);
    expect(validateProductInput(input({ name: "ab" })).name).toBeUndefined();
    expect(validateProductInput(input({ name: "a".repeat(120) })).name).toBeUndefined();
    expect(validateProductInput(input({ name: "a".repeat(121) })).name).toBe(
      "O nome pode ter até 120 caracteres.",
    );
  });

  it("nome sem letras nem números é recusado", () => {
    expect(validateProductInput(input({ name: "🐶" })).name).toBe(NAME_MSG);
    expect(validateProductInput(input({ name: "🐶🐶" })).name).toBe(NAME_MSG);
    expect(validateProductInput(input({ name: "-- --" })).name).toBe(NAME_MSG);
  });

  it("descrição: 400 aceita, 401 recusa", () => {
    expect(validateProductInput(input({ description: "d".repeat(400) })).description).toBe(
      undefined,
    );
    expect(validateProductInput(input({ description: "d".repeat(401) })).description).toBe(
      "A descrição pode ter até 400 caracteres.",
    );
  });

  it("categoria e ordem inválidas", () => {
    const bad = input({ category: "carros" as ProductInput["category"], sortOrder: 1.5 });
    const fields = validateProductInput(bad);
    expect(fields.category).toBe("Escolha uma categoria.");
    expect(fields.sortOrder).toBe("Use um número inteiro de -9999 a 9999.");
    expect(validateProductInput(input({ sortOrder: 10000 })).sortOrder).toBeDefined();
    expect(validateProductInput(input({ sortOrder: -9999 })).sortOrder).toBeUndefined();
    expect(validateProductInput(input({ sortOrder: Number.NaN })).sortOrder).toBeDefined();
  });
});

describe("listProducts", () => {
  it("traz todos (inclusive ocultos), por ordem e nome, com a URL da foto", async () => {
    const { client } = fakeProductsClient([
      productRow({ id: "b", slug: "b", name: "Bota", sort_order: 1 }),
      productRow({ id: "z", slug: "z", name: "Zinco", sort_order: 0, published: false }),
      productRow({
        id: "a",
        slug: "a",
        name: "Arame",
        sort_order: 0,
        image_path: "products/a.webp",
      }),
    ]);
    const list = await listProducts(client);
    expect(list.map((p) => p.name)).toEqual(["Arame", "Zinco", "Bota"]);
    expect(list[0]!.imageUrl).toMatch(
      /\/storage\/v1\/object\/public\/product-images\/products\/a\.webp$/,
    );
    expect(list[0]!.imagePath).toBe("products/a.webp");
    expect(list[1]!.imageUrl).toBeNull();
    expect(list[1]!.published).toBe(false);
  });

  it("erro de rede vira mensagem amigável", async () => {
    const { client, fail } = fakeProductsClient();
    fail.select.push({ message: "TypeError: Failed to fetch", code: "" });
    await expect(listProducts(client)).rejects.toThrow("Sem conexão. Tente de novo.");
  });

  it("erro desconhecido não mostra a mensagem do banco", async () => {
    const { client, fail } = fakeProductsClient();
    fail.select.push({ message: 'relation "products" does not exist', code: "42P01" });
    await expect(listProducts(client)).rejects.toThrow(
      new AdminError("Algo deu errado. Tente de novo."),
    );
  });
});

describe("saveProduct", () => {
  it("nome duplicado gera slug arame-2, depois arame-3", async () => {
    const { client } = fakeProductsClient([productRow({ slug: "arame" })]);
    const second = await saveProduct(input({ name: "Arame" }), client);
    expect(second.slug).toBe("arame-2");
    const third = await saveProduct(input({ name: "ARAME" }), client);
    expect(third.slug).toBe("arame-3");
  });

  it("não confunde prefixo com colisão (arame-farpado não ocupa arame)", async () => {
    const { client } = fakeProductsClient([productRow({ slug: "arame-farpado" })]);
    expect((await saveProduct(input({ name: "Arame" }), client)).slug).toBe("arame");
  });

  it("nome 🐶 é recusado com a mensagem e nada é gravado", async () => {
    const { client, log } = fakeProductsClient();
    const error = await saveProduct(input({ name: "🐶" }), client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fields.name).toBe(NAME_MSG);
    expect(log).toEqual([]);
  });

  it("limpa espaços do nome e da descrição", async () => {
    const { client, rows } = fakeProductsClient();
    await saveProduct(input({ name: "  Pá  ", description: "  boa \n" }), client);
    expect(rows[0]!.name).toBe("Pá");
    expect(rows[0]!.description).toBe("boa");
    expect(rows[0]!.slug).toBe("pa");
  });

  it("corrida: repete com outro slug quando o banco acusa duplicado (23505)", async () => {
    const { client, fail, rows } = fakeProductsClient();
    fail.insert.push({ code: "23505", message: "duplicate" }, { code: "23505", message: "x" });
    const saved = await saveProduct(input(), client);
    expect(saved.slug).toBe("arame");
    expect(rows).toHaveLength(1);
  });

  it("desiste depois de 3 novas tentativas", async () => {
    const { client, fail } = fakeProductsClient();
    for (let i = 0; i < 4; i++) fail.insert.push({ code: "23505", message: "dup" });
    await expect(saveProduct(input(), client)).rejects.toThrow("Algo deu errado. Tente de novo.");
  });

  it("editar mantém o slug mesmo trocando o nome", async () => {
    const { client, rows } = fakeProductsClient([productRow({ id: "p1", slug: "arame" })]);
    const saved = await saveProduct({ ...input({ name: "Arame galvanizado" }), id: "p1" }, client);
    expect(saved.slug).toBe("arame");
    expect(saved.name).toBe("Arame galvanizado");
    expect(rows[0]!.slug).toBe("arame");
  });

  it("sem permissão (42501) vira mensagem amigável", async () => {
    const { client, fail } = fakeProductsClient();
    fail.insert.push({
      code: "42501",
      message: 'new row violates row-level security policy for table "products"',
    });
    await expect(saveProduct(input(), client)).rejects.toThrow(new AdminError(PERMISSION));
  });

  it("editar produto que não existe mais avisa", async () => {
    const { client } = fakeProductsClient();
    await expect(saveProduct({ ...input(), id: "sumiu" }, client)).rejects.toThrow(
      "Não encontramos esse produto. Atualize a lista e tente de novo.",
    );
  });
});

describe("fotos", () => {
  it("envia para products/<slug>-<8 hex>.webp, sem sobrescrever e com cache longo", async () => {
    const { client, bucket } = fakeProductsClient();
    const path = await uploadProductImage(webp(), "arame", client);
    expect(path).toMatch(/^products\/arame-[0-9a-f]{8}\.webp$/);
    expect(bucket.upload).toHaveBeenCalledWith(path, expect.any(Blob), {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    expect(client.storage.from).toHaveBeenCalledWith("product-images");
  });

  it("JPEG (Safari/iPhone) vai como .jpg com o tipo image/jpeg", async () => {
    const { client, bucket } = fakeProductsClient();
    const jpeg = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
    const path = await uploadProductImage(jpeg, "arame", client);
    expect(path).toMatch(/^products\/arame-[0-9a-f]{8}\.jpg$/);
    expect(bucket.upload).toHaveBeenCalledWith(path, jpeg, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  });

  it("outro tipo (PNG) é recusado sem enviar nada", async () => {
    const { client, bucket } = fakeProductsClient();
    const png = new Blob([new Uint8Array(10)], { type: "image/png" });
    const error = await uploadProductImage(png, "arame", client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdminError);
    expect((error as Error).message).toBe("Algo deu errado. Tente de novo.");
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("falha no envio por permissão vira mensagem amigável", async () => {
    const { client, fail } = fakeProductsClient();
    fail.upload.push({ statusCode: "403", message: "new row violates row-level security policy" });
    await expect(uploadProductImage(webp(), "arame", client)).rejects.toThrow(PERMISSION);
  });

  it("remover foto nunca lança", async () => {
    const { client, fail } = fakeProductsClient();
    fail.remove.push({ message: "boom" });
    await expect(removeProductImage("products/x.webp", client)).resolves.toBeUndefined();
  });

  it("trocar foto: envia a nova, grava e só então apaga a antiga", async () => {
    const old = "products/arame-00000000.webp";
    const { client, log, files } = fakeProductsClient([productRow({ image_path: old })]);
    files.add(old);
    const saved = await saveProductWithPhoto(
      { ...input({ imagePath: old }), id: "p1" },
      { kind: "replace", blob: webp() },
      client,
    );
    expect(saved.imagePath).toMatch(/^products\/arame-[0-9a-f]{8}\.webp$/);
    expect(log.map((l) => l.split(":")[0])).toEqual(["upload", "update", "remove"]);
    expect(log[2]).toBe(`remove:${old}`);
    expect([...files]).toEqual([saved.imagePath]);
  });

  it("trocar foto: se a gravação falha, apaga a nova e mantém a antiga", async () => {
    const old = "products/arame-00000000.webp";
    const { client, log, files, fail, rows } = fakeProductsClient([
      productRow({ image_path: old }),
    ]);
    files.add(old);
    fail.update.push({ code: "42501", message: "denied" });
    await expect(
      saveProductWithPhoto(
        { ...input({ imagePath: old }), id: "p1" },
        { kind: "replace", blob: webp() },
        client,
      ),
    ).rejects.toThrow(PERMISSION);
    expect(log.map((l) => l.split(":")[0])).toEqual(["upload", "remove"]);
    expect([...files]).toEqual([old]);
    expect(rows[0]!.image_path).toBe(old);
  });

  it("ao editar, o arquivo novo usa o slug atual, não o nome novo", async () => {
    const { client } = fakeProductsClient([productRow()]);
    const saved = await saveProductWithPhoto(
      { ...input({ name: "Arame farpado" }), id: "p1", slug: "arame" },
      { kind: "replace", blob: webp() },
      client,
    );
    expect(saved.imagePath).toMatch(/^products\/arame-[0-9a-f]{8}\.webp$/);
    expect(saved.slug).toBe("arame");
  });

  it("produto novo com foto: grava o caminho enviado", async () => {
    const { client, rows } = fakeProductsClient();
    const saved = await saveProductWithPhoto(input(), { kind: "replace", blob: webp() }, client);
    expect(rows[0]!.image_path).toBe(saved.imagePath);
    expect(saved.imageUrl).toContain(saved.imagePath!);
  });

  it("remover foto: grava sem foto e depois apaga o arquivo", async () => {
    const old = "products/arame-00000000.webp";
    const { client, log, rows } = fakeProductsClient([productRow({ image_path: old })]);
    await saveProductWithPhoto(
      { ...input({ imagePath: old }), id: "p1" },
      { kind: "remove" },
      client,
    );
    expect(rows[0]!.image_path).toBeNull();
    expect(log).toEqual(["update:p1", `remove:${old}`]);
  });

  it("manter foto não grava image_path (não desfaz a troca feita em outra janela)", async () => {
    // a outra janela já trocou a foto para Y; esta abriu com X e só muda o nome
    const { client, rows, log } = fakeProductsClient([
      productRow({ image_path: "products/arame-yyyyyyyy.webp" }),
    ]);
    await saveProductWithPhoto(
      { ...input({ name: "Arame novo", imagePath: "products/arame-xxxxxxxx.webp" }), id: "p1" },
      { kind: "keep" },
      client,
    );
    expect(rows[0]!.name).toBe("Arame novo");
    expect(rows[0]!.image_path).toBe("products/arame-yyyyyyyy.webp");
    expect(log).toEqual(["update:p1"]);
  });

  it("trocar foto que mudou em outra janela: nada gravado, nova apagada, aviso", async () => {
    const { client, rows, files, log } = fakeProductsClient([
      productRow({ image_path: "products/arame-yyyyyyyy.webp" }),
    ]);
    files.add("products/arame-yyyyyyyy.webp");
    const error = await saveProductWithPhoto(
      { ...input({ imagePath: "products/arame-xxxxxxxx.webp" }), id: "p1" },
      { kind: "replace", blob: webp() },
      client,
    ).catch((e: unknown) => e);
    expect((error as Error).message).toBe(CHANGED);
    expect(rows[0]!.image_path).toBe("products/arame-yyyyyyyy.webp");
    expect([...files]).toEqual(["products/arame-yyyyyyyy.webp"]);
    expect(log.map((l) => l.split(":")[0])).toEqual(["upload", "update", "remove"]);
  });

  it("remover foto que mudou em outra janela não apaga a foto nova", async () => {
    const { client, rows, files } = fakeProductsClient([
      productRow({ image_path: "products/arame-yyyyyyyy.webp" }),
    ]);
    files.add("products/arame-yyyyyyyy.webp");
    await expect(
      saveProductWithPhoto(
        { ...input({ imagePath: "products/arame-xxxxxxxx.webp" }), id: "p1" },
        { kind: "remove" },
        client,
      ),
    ).rejects.toThrow(CHANGED);
    expect(rows[0]!.image_path).toBe("products/arame-yyyyyyyy.webp");
    expect([...files]).toEqual(["products/arame-yyyyyyyy.webp"]);
  });

  it("trocar foto de produto sem foto confere que continua sem foto", async () => {
    const { client, rows } = fakeProductsClient([productRow({ image_path: null })]);
    const saved = await saveProductWithPhoto(
      { ...input(), id: "p1" },
      { kind: "replace", blob: webp() },
      client,
    );
    expect(rows[0]!.image_path).toBe(saved.imagePath);
  });

  it("manter foto: não envia nem apaga nada", async () => {
    const old = "products/arame-00000000.webp";
    const { client, log } = fakeProductsClient([productRow({ image_path: old })]);
    await saveProductWithPhoto(
      { ...input({ imagePath: old }), id: "p1" },
      { kind: "keep" },
      client,
    );
    expect(log).toEqual(["update:p1"]);
  });

  it("dados inválidos não enviam foto", async () => {
    const { client, log } = fakeProductsClient();
    await expect(
      saveProductWithPhoto(input({ name: "x" }), { kind: "replace", blob: webp() }, client),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(log).toEqual([]);
  });
});

describe("excluir e alternar", () => {
  it("exclui a linha e depois a foto", async () => {
    const path = "products/arame-00000000.webp";
    const { client, log, rows } = fakeProductsClient([productRow({ image_path: path })]);
    const [product] = await listProducts(client);
    await deleteProduct(product!, client);
    expect(rows).toHaveLength(0);
    expect(log).toEqual(["delete:p1", `remove:${path}`]);
  });

  it("exclusão apaga a foto que o banco devolveu, não a da lista antiga", async () => {
    const { client, log } = fakeProductsClient([
      productRow({ image_path: "products/arame-yyyyyyyy.webp" }),
    ]);
    const stale = {
      ...(await listProducts(client))[0]!,
      imagePath: "products/arame-xxxxxxxx.webp",
    };
    await deleteProduct(stale, client);
    expect(log).toEqual(["delete:p1", "remove:products/arame-yyyyyyyy.webp"]);
  });

  it("se a exclusão falha, a foto continua", async () => {
    const path = "products/arame-00000000.webp";
    const { client, log, fail } = fakeProductsClient([productRow({ image_path: path })]);
    const [product] = await listProducts(client);
    fail.delete.push({ code: "42501", message: "denied" });
    await expect(deleteProduct(product!, client)).rejects.toThrow(PERMISSION);
    expect(log).toEqual([]);
  });

  it("setAvailable e setPublished gravam só o campo", async () => {
    const { client, rows } = fakeProductsClient([productRow()]);
    await setAvailable("p1", false, client);
    expect(rows[0]!.available).toBe(false);
    await setPublished("p1", false, client);
    expect(rows[0]!.published).toBe(false);
    expect(rows[0]!.name).toBe("Arame");
  });

  it("alternar produto que sumiu avisa", async () => {
    const { client } = fakeProductsClient();
    await expect(setAvailable("x", true, client)).rejects.toThrow(
      "Não encontramos esse produto. Atualize a lista e tente de novo.",
    );
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { AdminError } from "@/admin/errors";
import ProductForm from "@/admin/ProductForm";
import type { AdminProduct } from "@/admin/types";
import { fakeProductsClient, productRow } from "./fake-products";

afterEach(cleanup);

const NAME_MSG = "Use pelo menos duas letras ou números no nome.";

const existing: AdminProduct = {
  id: "p1",
  slug: "arame",
  name: "Arame",
  description: "Rolo de 50 m",
  category: "ferramentas",
  imagePath: "products/arame-00000000.webp",
  imageUrl: "https://x/products/arame-00000000.webp",
  available: true,
  published: false,
  sortOrder: 3,
};

const webp = () => new Blob([new Uint8Array(10)], { type: "image/webp" });
type Prepare = (file: File) => Promise<Blob>;

function setup(product: AdminProduct | null = null, prepare = vi.fn<Prepare>(async () => webp())) {
  const fake = fakeProductsClient(product ? [productRow({ image_path: product.imagePath })] : []);
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <ProductForm
      product={product}
      client={fake.client}
      prepare={prepare}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { ...fake, onSaved, onCancel, prepare };
}

function chooseFile(file: File) {
  const input = screen.getByLabelText("Foto do produto", { selector: "input" }) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("<ProductForm />", () => {
  it("abre com o foco no título e todos os campos rotulados", async () => {
    setup();
    const heading = screen.getByRole("heading", { name: "Novo produto" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByLabelText("Nome")).toBeTruthy();
    expect(screen.getByLabelText("Descrição")).toBeTruthy();
    const category = screen.getByLabelText("Categoria") as HTMLSelectElement;
    expect([...category.options].map((o) => o.textContent)).toEqual([
      "Alimentação animal",
      "Farmácia veterinária",
      "Pets",
      "Itens pessoais",
      "Jardinagem",
      "Ferramentas",
    ]);
    expect(
      screen.getByLabelText("Foto do produto", { selector: "input" }).getAttribute("accept"),
    ).toBe("image/jpeg,image/png,image/webp");
    expect(screen.getByRole("group", { name: "Foto do produto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escolher foto" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remover foto" })).toBeNull();
    expect((screen.getByLabelText("Disponível") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Mostrar no site") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText("Ordem").getAttribute("aria-describedby")).toContain(
      "ordem-ajuda",
    );
    expect(screen.getByText("Número menor aparece primeiro")).toBeTruthy();
  });

  it("nome inválido mostra a mensagem no campo, com aria-invalid, e não grava", async () => {
    const { log, onSaved } = setup();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "🐶" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    const name = screen.getByLabelText("Nome");
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    const errorId = name.getAttribute("aria-describedby")!;
    expect(document.getElementById(errorId)?.textContent).toBe(NAME_MSG);
    expect(document.activeElement).toBe(name);
    expect(log).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("descrição com 401 caracteres é recusada; o contador acompanha", async () => {
    setup();
    const description = screen.getByLabelText("Descrição");
    fireEvent.input(description, { target: { value: "abcde" } });
    expect(screen.getByText("5 de 400 caracteres")).toBeTruthy();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Pá" } });
    fireEvent.input(description, { target: { value: "d".repeat(401) } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(description.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByText("A descrição pode ter até 400 caracteres.")).toBeTruthy();
    expect(description.getAttribute("aria-describedby")).toContain("descricao-contador");
  });

  it("produto novo válido é gravado e devolvido", async () => {
    const { rows, onSaved } = setup();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "  Enxada  " } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "jardinagem" } });
    fireEvent.click(screen.getByLabelText("Disponível"));
    fireEvent.input(screen.getByLabelText("Ordem"), { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(rows[0]).toMatchObject({
      name: "Enxada",
      slug: "enxada",
      category: "jardinagem",
      available: false,
      published: true,
      sort_order: -2,
    });
  });

  it("editar mostra os dados atuais e a foto", () => {
    setup(existing);
    expect(screen.getByRole("heading", { name: "Editar produto" })).toBeTruthy();
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Arame");
    expect((screen.getByLabelText("Ordem") as HTMLInputElement).value).toBe("3");
    expect((screen.getByLabelText("Mostrar no site") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByAltText("Foto atual do produto").getAttribute("src")).toBe(
      existing.imageUrl,
    );
    expect(screen.getByRole("button", { name: "Trocar foto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover foto" })).toBeTruthy();
  });

  it("Remover foto grava o produto sem foto", async () => {
    const { rows, onSaved, log } = setup(existing);
    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    expect(screen.queryByAltText("Foto atual do produto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(rows[0]!.image_path).toBeNull();
    expect(log).toEqual(["update:p1", `remove:${existing.imagePath}`]);
  });

  it("foto escolhida é preparada, aparece na prévia e é enviada ao salvar", async () => {
    const { prepare, files, onSaved } = setup(existing);
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    chooseFile(file);
    await waitFor(() => expect(prepare).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText("Foto nova do produto")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect([...files]).toHaveLength(1);
    expect([...files][0]).toMatch(/^products\/arame-[0-9a-f]{8}\.webp$/);
  });

  it("foto recusada mostra a mensagem no campo da foto", async () => {
    const prepare = vi.fn<Prepare>(async () => {
      throw new AdminError("Envie uma imagem JPG, PNG ou WebP.");
    });
    setup(null, prepare);
    chooseFile(new File(["x"], "notas.txt", { type: "text/plain" }));
    const input = screen.getByLabelText("Foto do produto", { selector: "input" });
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(
      document.getElementById(input.getAttribute("aria-describedby")!.split(" ")[0]!)?.textContent,
    ).toBe("Envie uma imagem JPG, PNG ou WebP.");
  });

  it("falha inesperada no preparo da foto não mostra o texto técnico", async () => {
    setup(
      null,
      vi.fn<Prepare>(async () => {
        throw new TypeError("boom");
      }),
    );
    chooseFile(new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    expect(await screen.findByText("Não conseguimos abrir essa foto. Tente outra.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("boom");
  });

  it("exceção inesperada ao salvar mostra a mensagem genérica, nunca o texto técnico", async () => {
    const { client, onSaved } = setup();
    client.from.mockImplementation(() => {
      throw new TypeError("boom");
    });
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Enxada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Algo deu errado. Tente de novo."),
    );
    expect(document.body.textContent).not.toContain("boom");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("erro do servidor aparece num alerta amigável e o botão volta", async () => {
    const { fail, onSaved } = setup();
    fail.insert.push({ code: "42501", message: "new row violates row-level security policy" });
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Enxada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Você não tem permissão para fazer isso."),
    );
    expect(onSaved).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Salvar produto" });
    expect(button.getAttribute("aria-disabled")).toBeNull();
  });

  it("enquanto salva, um segundo envio é ignorado", async () => {
    const { rows, onSaved, pause } = setup();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Enxada" } });
    const resume = pause();
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    const busy = await screen.findByRole("button", { name: "Salvando…" });
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(busy);
    resume();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(rows).toHaveLength(1);
  });

  it("Cancelar avisa quem abriu", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

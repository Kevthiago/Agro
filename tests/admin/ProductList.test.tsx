// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import ProductList from "@/admin/ProductList";
import ProductsPanel from "@/admin/ProductsPanel";
import type { AdminProduct } from "@/admin/types";
import { fakeProductsClient, productRow } from "./fake-products";

afterEach(cleanup);

const product = (over: Partial<AdminProduct> = {}): AdminProduct => ({
  id: "p1",
  slug: "arame",
  name: "Arame",
  description: "",
  category: "ferramentas",
  imagePath: null,
  imageUrl: null,
  available: true,
  published: true,
  sortOrder: 0,
  ...over,
});

const noop = async () => {};

describe("<ProductList />", () => {
  it("mostra miniatura, nome, categoria e as marcas Em falta / Oculto no site", () => {
    render(
      <ProductList
        products={[
          product({ imageUrl: "https://x/products/a.webp" }),
          product({
            id: "p2",
            name: "Ração",
            category: "alimentacao-animal",
            available: false,
            published: false,
          }),
        ]}
        onEdit={() => {}}
        onToggle={noop}
        onDelete={noop}
      />,
    );
    const [arame, racao] = screen.getAllByRole("listitem");
    expect(within(arame!).getByRole("heading", { name: "Arame" })).toBeTruthy();
    expect(within(arame!).getByText("Ferramentas")).toBeTruthy();
    expect(arame!.querySelector("img")?.getAttribute("src")).toBe("https://x/products/a.webp");
    expect(within(arame!).queryByText("Em falta")).toBeNull();
    expect(within(arame!).queryByText("Oculto no site")).toBeNull();

    expect(within(racao!).getByText("Alimentação animal")).toBeTruthy();
    expect(within(racao!).getByText("Sem foto")).toBeTruthy();
    expect(within(racao!).getByText("Em falta")).toBeTruthy();
    expect(within(racao!).getByText("Oculto no site")).toBeTruthy();
    const available = within(racao!).getByRole("checkbox", { name: "Disponível (Ração)" });
    expect((available as HTMLInputElement).checked).toBe(false);
    expect(within(racao!).getByRole("button", { name: "Editar Ração" })).toBeTruthy();
  });

  it("nome do produto aparece como texto, nunca como HTML", () => {
    render(
      <ProductList
        products={[product({ name: "<b>Arame</b>" })]}
        onEdit={() => {}}
        onToggle={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByRole("heading", { name: "<b>Arame</b>" })).toBeTruthy();
    expect(document.querySelector("li b")).toBeNull();
  });

  it("Excluir abre a confirmação com o nome; Cancelar não exclui", async () => {
    const deleted: string[] = [];
    render(
      <ProductList
        products={[product()]}
        onEdit={() => {}}
        onToggle={noop}
        onDelete={async (p) => void deleted.push(p.id)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Excluir Arame" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain('Excluir "Arame"?');
    expect(dialog.textContent).toContain("Essa ação não pode ser desfeita.");
    expect((dialog as HTMLDialogElement).open).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect((dialog as HTMLDialogElement).open).toBe(false);
    expect(deleted).toEqual([]);
  });
});

describe("<ProductsPanel />", () => {
  it("mostra carregando enquanto busca", () => {
    const { client, pause } = fakeProductsClient();
    pause();
    render(<ProductsPanel client={client} />);
    expect(screen.getByText("Carregando produtos…")).toBeTruthy();
  });

  it("lista vazia orienta a cadastrar o primeiro", async () => {
    const { client } = fakeProductsClient();
    render(<ProductsPanel client={client} />);
    expect(await screen.findByText(/Nenhum produto cadastrado ainda/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Novo produto" })).toBeTruthy();
  });

  it("erro ao carregar mostra aviso e Tentar de novo funciona", async () => {
    const { client, fail } = fakeProductsClient([productRow()]);
    fail.select.push({ message: "TypeError: Failed to fetch" });
    render(<ProductsPanel client={client} />);
    const text = await screen.findByText(/Não foi possível carregar os produtos/);
    expect(text.textContent).toContain("Sem conexão. Tente de novo.");
    expect(text.closest("[role=alert]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Arame" })).toBeTruthy();
  });

  it("a chave Disponível grava, atualiza a lista e avisa", async () => {
    const { client, rows, pause } = fakeProductsClient([productRow()]);
    render(<ProductsPanel client={client} />);
    const box = (await screen.findByRole("checkbox", {
      name: "Disponível (Arame)",
    })) as HTMLInputElement;
    expect(box.checked).toBe(true);

    const resume = pause();
    fireEvent.click(box);
    // enquanto grava, as chaves do produto ficam travadas
    await waitFor(() => expect(box.getAttribute("aria-disabled")).toBe("true"));
    // um segundo clique durante a gravação é ignorado (e o foco não se perde)
    fireEvent.click(box);
    resume();

    await waitFor(() => expect(rows[0]!.available).toBe(false));
    await waitFor(() => expect(screen.getByText("Em falta")).toBeTruthy());
    const fresh = screen.getByRole("checkbox", { name: "Disponível (Arame)" }) as HTMLInputElement;
    expect(fresh.checked).toBe(false);
    expect(fresh.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByText("Alteração salva.")).toBeTruthy();
  });

  it("a chave Mostrar no site oculta o produto", async () => {
    const { client, rows } = fakeProductsClient([productRow()]);
    render(<ProductsPanel client={client} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mostrar no site (Arame)" }));
    await waitFor(() => expect(rows[0]!.published).toBe(false));
    expect(await screen.findByText("Oculto no site")).toBeTruthy();
  });

  it("erro ao alternar aparece num alerta amigável", async () => {
    const { client, fail } = fakeProductsClient([productRow()]);
    render(<ProductsPanel client={client} />);
    const box = await screen.findByRole("checkbox", { name: "Disponível (Arame)" });
    fail.update.push({ code: "42501", message: "permission denied for table products" });
    fireEvent.click(box);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Você não tem permissão para fazer isso."),
    );
  });

  it("confirmar a exclusão apaga e avisa", async () => {
    const { client, rows } = fakeProductsClient([productRow()]);
    render(<ProductsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir Arame" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(rows).toHaveLength(0));
    expect(await screen.findByText(/Nenhum produto cadastrado ainda/)).toBeTruthy();
    expect(screen.getByText("Produto excluído.")).toBeTruthy();
  });

  it("Novo produto abre o formulário com o foco no título; Cancelar volta", async () => {
    const { client } = fakeProductsClient([productRow()]);
    render(<ProductsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo produto" }));
    const heading = await screen.findByRole("heading", { name: "Novo produto" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const button = await screen.findByRole("button", { name: "Novo produto" });
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("salvar no formulário volta para a lista com o produto e avisa", async () => {
    const { client } = fakeProductsClient();
    render(<ProductsPanel client={client} />);
    fireEvent.click(await screen.findByRole("button", { name: "Novo produto" }));
    fireEvent.input(await screen.findByLabelText("Nome"), { target: { value: "Enxada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    expect(await screen.findByRole("heading", { name: "Enxada" })).toBeTruthy();
    expect(screen.getByText("Produto salvo.")).toBeTruthy();
  });
});

import { useEffect, useRef, useState } from "preact/hooks";
import { friendlyMessage } from "@/admin/errors";
import ProductForm from "@/admin/ProductForm";
import ProductList, { type ToggleField } from "@/admin/ProductList";
import {
  deleteProduct,
  listProducts,
  setAvailable,
  setPublished,
  type ProductsClient,
} from "@/admin/products-api";
import type { AdminProduct } from "@/admin/types";

interface Props {
  client: ProductsClient;
}

type Load = "loading" | "error" | "ready";
/** `undefined` = lista; `null` = produto novo; produto = editando. */
type Editing = AdminProduct | null | undefined;

/** Tela principal do painel: lista dos produtos e o formulário de cadastro/edição. */
export default function ProductsPanel({ client }: Props) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Editing>(undefined);
  // avisos de sucesso (educados) e de falha (alerta), sempre na página
  const [status, setStatus] = useState("");
  const [alert, setAlert] = useState("");
  const newButton = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  // para onde o foco volta quando o formulário fecha
  const focusAfterClose = useRef<"new" | "list" | null>(null);
  // número da última busca: uma resposta antiga que chega depois não apaga a mais nova
  const latest = useRef(0);

  async function refresh() {
    const request = ++latest.current;
    try {
      const list = await listProducts(client);
      if (request !== latest.current) return;
      setProducts(list);
      setLoad("ready");
    } catch (error) {
      if (request !== latest.current) return;
      setLoadError(friendlyMessage(error));
      setLoad("error");
    }
  }

  useEffect(() => {
    void refresh();
  }, [client]);

  // Quando o formulário fecha ou um produto some da lista, o foco vai para um lugar estável.
  useEffect(() => {
    if (editing !== undefined || load !== "ready" || !focusAfterClose.current) return;
    const target = focusAfterClose.current === "new" ? newButton.current : listHeading.current;
    focusAfterClose.current = null;
    target?.focus();
  }, [editing, load, products]);

  function retry() {
    setLoad("loading");
    void refresh();
  }

  function open(product: AdminProduct | null) {
    setStatus("");
    setAlert("");
    setEditing(product);
  }

  function close(saved: boolean) {
    focusAfterClose.current = saved ? "list" : "new";
    setEditing(undefined);
    if (saved) {
      setStatus("Produto salvo.");
      void refresh();
    }
  }

  /** Grava, recarrega a lista e avisa. Erros viram alerta (a lista mostra o que está no banco). */
  async function act(action: () => Promise<void>, done: string) {
    setStatus("");
    setAlert("");
    try {
      await action();
      setStatus(done);
    } catch (error) {
      setAlert(friendlyMessage(error));
    }
    await refresh();
  }

  const toggle = (product: AdminProduct, field: ToggleField, value: boolean) =>
    act(
      () =>
        field === "available"
          ? setAvailable(product.id, value, client)
          : setPublished(product.id, value, client),
      "Alteração salva.",
    );

  const remove = (product: AdminProduct) =>
    act(async () => {
      await deleteProduct(product, client);
      // o botão que estava em foco sumiu junto com o produto
      focusAfterClose.current = "list";
    }, "Produto excluído.");

  return (
    <section class="admin-cartao admin-cartao-largo" aria-labelledby="produtos-titulo">
      <div class="admin-cabecalho">
        <h1 id="produtos-titulo" class="admin-titulo">
          Painel de produtos
        </h1>
        {/* Lugar do botão "Publicar alterações" (Task 12). */}
        <div class="admin-publicar" />
      </div>

      <p role="status" class="admin-aviso">
        {status}
      </p>
      <p role="alert" class="admin-erro">
        {alert}
      </p>

      {editing !== undefined ? (
        <ProductForm
          product={editing}
          client={client}
          onSaved={() => close(true)}
          onCancel={() => close(false)}
        />
      ) : (
        <>
          <div class="admin-lista-topo">
            <h2 id="lista-titulo" class="admin-subtitulo" tabIndex={-1} ref={listHeading}>
              Produtos{load === "ready" ? ` (${products.length})` : ""}
            </h2>
            <button type="button" class="admin-botao" ref={newButton} onClick={() => open(null)}>
              Novo produto
            </button>
          </div>

          {load === "loading" ? (
            <p role="status" class="admin-carregando mt-8">
              Carregando produtos…
            </p>
          ) : load === "error" ? (
            <div class="admin-vazio">
              <p role="alert" class="text-lg font-bold">
                Não foi possível carregar os produtos. {loadError}
              </p>
              <button type="button" class="admin-botao admin-botao-claro mt-4" onClick={retry}>
                Tentar de novo
              </button>
            </div>
          ) : products.length === 0 ? (
            <div class="admin-vazio">
              <p class="text-lg">Nenhum produto cadastrado ainda.</p>
              <p class="mt-2">Toque em "Novo produto" para cadastrar o primeiro.</p>
            </div>
          ) : (
            <ProductList
              products={products}
              onEdit={(p) => open(p)}
              onToggle={toggle}
              onDelete={remove}
            />
          )}
        </>
      )}
    </section>
  );
}

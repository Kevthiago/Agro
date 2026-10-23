import { useEffect, useRef, useState } from "preact/hooks";
import type { AdminProduct } from "@/admin/types";
import { CATEGORIES } from "@/config/categories";

export type ToggleField = "available" | "published";

interface Props {
  products: AdminProduct[];
  onEdit(product: AdminProduct): void;
  /** Grava a chave e recarrega a lista (os erros são tratados por quem chama). */
  onToggle(product: AdminProduct, field: ToggleField, value: boolean): Promise<void>;
  onDelete(product: AdminProduct): Promise<void>;
}

const categoryLabel = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/** Lista dos produtos com as ações de cada um. Textos sempre como texto (nunca HTML). */
export default function ProductList({ products, onEdit, onToggle, onDelete }: Props) {
  // produtos com gravação em andamento: as ações de cada um ficam travadas
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<AdminProduct | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  async function run(product: AdminProduct, action: () => Promise<void>) {
    setBusy((ids) => new Set(ids).add(product.id));
    try {
      await action();
    } finally {
      // libera só este produto: outro que ainda grava continua travado
      setBusy((ids) => {
        const next = new Set(ids);
        next.delete(product.id);
        return next;
      });
    }
  }

  // Abre a caixa só depois de ela já mostrar o nome certo (o leitor de tela lê ao abrir).
  // showModal prende o foco dentro da caixa e fecha com Esc.
  useEffect(() => {
    if (confirming && !dialog.current?.open) dialog.current?.showModal();
  }, [confirming]);

  function confirmDelete() {
    const product = confirming;
    dialog.current?.close();
    if (product) void run(product, () => onDelete(product));
  }

  return (
    <>
      <ul class="admin-produtos" aria-labelledby="lista-titulo">
        {products.map((product) => {
          const saving = busy.has(product.id);
          // Travados sem `disabled`: um controle desativado perde o foco do teclado.
          const blockWhileSaving = (e: MouseEvent) => saving && e.preventDefault();
          return (
            <li key={product.id} class="admin-produto" aria-busy={saving}>
              {product.imageUrl ? (
                <img
                  class="admin-miniatura"
                  src={product.imageUrl}
                  alt=""
                  width={96}
                  height={96}
                  loading="lazy"
                />
              ) : (
                <span class="admin-miniatura admin-sem-foto">Sem foto</span>
              )}

              <div class="admin-produto-info">
                <h3 class="admin-produto-nome">{product.name}</h3>
                <p>{categoryLabel(product.category)}</p>
                {(!product.available || !product.published) && (
                  <p class="admin-marcas">
                    {!product.available && <span class="admin-marca">Em falta</span>}
                    {!product.published && <span class="admin-marca">Oculto no site</span>}
                  </p>
                )}
              </div>

              <div class="admin-chaves">
                <label class="admin-chave">
                  <input
                    type="checkbox"
                    checked={product.available}
                    aria-disabled={saving ? true : undefined}
                    onClick={blockWhileSaving}
                    onChange={(e) =>
                      void run(product, () =>
                        onToggle(product, "available", e.currentTarget.checked),
                      )
                    }
                  />
                  Disponível<span class="sr-only"> ({product.name})</span>
                </label>
                <label class="admin-chave">
                  <input
                    type="checkbox"
                    checked={product.published}
                    aria-disabled={saving ? true : undefined}
                    onClick={blockWhileSaving}
                    onChange={(e) =>
                      void run(product, () =>
                        onToggle(product, "published", e.currentTarget.checked),
                      )
                    }
                  />
                  Mostrar no site<span class="sr-only"> ({product.name})</span>
                </label>
              </div>

              <div class="admin-produto-acoes">
                <button
                  type="button"
                  class="admin-botao admin-botao-claro"
                  aria-disabled={saving ? true : undefined}
                  onClick={() => !saving && onEdit(product)}
                >
                  Editar<span class="sr-only"> {product.name}</span>
                </button>
                <button
                  type="button"
                  class="admin-botao admin-botao-claro"
                  aria-disabled={saving ? true : undefined}
                  onClick={() => !saving && setConfirming(product)}
                >
                  Excluir<span class="sr-only"> {product.name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialog}
        class="admin-dialogo"
        aria-labelledby="excluir-titulo"
        aria-describedby="excluir-texto"
        onClose={() => setConfirming(null)}
      >
        <h2 id="excluir-titulo" class="admin-subtitulo">
          Excluir "{confirming?.name}"?
        </h2>
        <p id="excluir-texto" class="mt-3 text-lg">
          Essa ação não pode ser desfeita.
        </p>
        <div class="admin-dialogo-acoes">
          <button type="button" class="admin-botao" onClick={confirmDelete}>
            Excluir
          </button>
          {/* o foco começa no botão seguro */}
          <button
            type="button"
            class="admin-botao admin-botao-claro"
            autofocus
            onClick={() => dialog.current?.close()}
          >
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}

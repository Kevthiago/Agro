import { useEffect, useState } from "preact/hooks";
import { filterProducts } from "@/lib/search";

interface Props {
  /** Só nome e descrição, na mesma ordem dos itens renderizados no servidor. */
  items: Array<{ name: string; description: string }>;
  whatsappHref: string;
}

/**
 * Busca do catálogo. Os produtos já estão no HTML (sem JS tudo aparece);
 * aqui só se esconde, via `hidden`, o <li data-index> que não casa.
 */
export default function CatalogSearch({ items, whatsappHref }: Props) {
  const [query, setQuery] = useState("");
  const matches = filterProducts(items, query);
  const key = matches.join(",");

  useEffect(() => {
    const visible = new Set(key ? key.split(",").map(Number) : []);
    document.querySelectorAll<HTMLElement>("[data-index]").forEach((el) => {
      el.hidden = !visible.has(Number(el.dataset["index"]));
    });
  }, [key]);

  const status =
    matches.length === 0
      ? "Nenhum produto encontrado"
      : `${matches.length} ${matches.length === 1 ? "produto" : "produtos"}`;

  return (
    <div class="busca">
      <label for="busca-produto">Buscar produto</label>
      <input
        id="busca-produto"
        type="search"
        autocomplete="off"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <p role="status" class="busca-status">
        {status}
      </p>
      {matches.length === 0 && (
        <a class="busca-whats" href={whatsappHref} target="_blank" rel="noopener">
          Perguntar no WhatsApp
          <span class="sr-only"> (abre em nova aba)</span>
        </a>
      )}
    </div>
  );
}

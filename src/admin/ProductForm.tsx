import { useEffect, useRef, useState } from "preact/hooks";
import { AdminError, friendlyMessage } from "@/admin/errors";
import { prepareImage } from "@/admin/image";
import {
  ValidationError,
  saveProductWithPhoto,
  validateProductInput,
  type PhotoChange,
  type ProductsClient,
} from "@/admin/products-api";
import type { AdminProduct } from "@/admin/types";
import { CATEGORIES, isCategorySlug, type CategorySlug } from "@/config/categories";
import type { ProductInput } from "@/lib/types";

interface Props {
  /** `null` = produto novo. */
  product: AdminProduct | null;
  client: ProductsClient;
  onSaved(product: AdminProduct): void;
  onCancel(): void;
  /** Preparo da foto (substituível nos testes, que não têm canvas). */
  prepare?: (file: File) => Promise<Blob>;
}

type Errors = Partial<
  Record<"name" | "description" | "category" | "sortOrder" | "photo", string | undefined>
>;

const DESCRIPTION_MAX = 400;
// ordem em que o foco procura o primeiro campo com erro
const FIELD_IDS = {
  name: "produto-nome",
  description: "produto-descricao",
  category: "produto-categoria",
  sortOrder: "produto-ordem",
} as const;

/** Liga o campo às mensagens de ajuda e de erro (só as que existem). */
const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(" ") || undefined;

/** Formulário de cadastro e edição de um produto. */
export default function ProductForm({
  product,
  client,
  onSaved,
  onCancel,
  prepare = prepareImage,
}: Props) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState<CategorySlug>(product?.category ?? CATEGORIES[0]!.slug);
  const [available, setAvailable] = useState(product?.available ?? true);
  const [published, setPublished] = useState(product?.published ?? true);
  const [order, setOrder] = useState(String(product?.sortOrder ?? 0));
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // Ao abrir, o foco vai para o título (o leitor de tela anuncia o formulário).
  useEffect(() => heading.current?.focus(), []);

  // Libera a prévia da foto quando ela muda ou o formulário fecha.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const shownPhoto =
    photo.kind === "replace"
      ? { src: preview, alt: "Foto nova do produto" }
      : photo.kind === "keep" && product?.imageUrl
        ? { src: product.imageUrl, alt: "Foto atual do produto" }
        : null;

  async function choosePhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setPreparing(true);
    setErrors((e) => ({ ...e, photo: undefined }));
    try {
      const blob = await prepare(file);
      setPhoto({ kind: "replace", blob });
      setPreview(URL.createObjectURL(blob));
    } catch (error) {
      // só mensagens nossas aparecem; qualquer outra falha vira o aviso padrão da foto
      const text =
        error instanceof AdminError
          ? error.message
          : "Não conseguimos abrir essa foto. Tente outra.";
      setErrors((e) => ({ ...e, photo: text }));
    } finally {
      setPreparing(false);
      // permite escolher o mesmo arquivo de novo
      input.value = "";
    }
  }

  function removePhoto() {
    setPhoto({ kind: "remove" });
    setPreview(null);
    setErrors((e) => ({ ...e, photo: undefined }));
    // o botão "Remover foto" some; o foco vai para "Escolher foto"
    photoButton.current?.focus();
  }

  function showErrors(fields: Errors) {
    setErrors((e) => ({ ...fields, photo: e.photo }));
    const first = (Object.keys(FIELD_IDS) as (keyof typeof FIELD_IDS)[]).find((k) => fields[k]);
    if (first) form.current?.querySelector<HTMLElement>(`#${FIELD_IDS[first]}`)?.focus();
  }

  // Botões "travados" usam aria-disabled: com `disabled` o foco do teclado se perderia.
  const busy = saving || preparing;

  async function submit(event: Event) {
    event.preventDefault();
    if (busy) return;
    setFormError("");
    const input: ProductInput & { id?: string; slug?: string } = {
      ...(product ? { id: product.id, slug: product.slug } : {}),
      name,
      description,
      category,
      imagePath: product?.imagePath ?? null,
      available,
      published,
      sortOrder: order.trim() === "" ? Number.NaN : Number(order),
    };
    const fields = validateProductInput(input);
    if (Object.keys(fields).length > 0) {
      showErrors(fields);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await saveProductWithPhoto(input, photo, client);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ValidationError) showErrors(error.fields);
      else setFormError(friendlyMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const count = [...description].length;
  const photoDescription = describedBy(errors.photo && "produto-foto-erro", "produto-foto-ajuda");
  const title = product ? "Editar produto" : "Novo produto";

  return (
    <form
      ref={form}
      class="admin-form"
      aria-labelledby="produto-titulo"
      noValidate
      onSubmit={submit}
    >
      <h2 id="produto-titulo" class="admin-subtitulo" tabIndex={-1} ref={heading}>
        {title}
      </h2>

      <div class="admin-grupo">
        <label for="produto-nome">Nome</label>
        <input
          id="produto-nome"
          class="admin-campo"
          type="text"
          autocomplete="off"
          value={name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy(errors.name && "produto-nome-erro")}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        {errors.name && (
          <p id="produto-nome-erro" class="admin-campo-erro">
            {errors.name}
          </p>
        )}
      </div>

      <div class="admin-grupo">
        <label for="produto-descricao">Descrição</label>
        <textarea
          id="produto-descricao"
          class="admin-campo"
          rows={4}
          value={description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={describedBy(
            errors.description && "produto-descricao-erro",
            "produto-descricao-contador",
          )}
          onInput={(e) => setDescription(e.currentTarget.value)}
        />
        <p
          id="produto-descricao-contador"
          class={count > DESCRIPTION_MAX ? "admin-ajuda font-bold" : "admin-ajuda"}
          aria-live="polite"
        >
          {count} de {DESCRIPTION_MAX} caracteres
        </p>
        {errors.description && (
          <p id="produto-descricao-erro" class="admin-campo-erro">
            {errors.description}
          </p>
        )}
      </div>

      <div class="admin-grupo">
        <label for="produto-categoria">Categoria</label>
        <select
          id="produto-categoria"
          class="admin-campo"
          value={category}
          aria-invalid={errors.category ? true : undefined}
          aria-describedby={describedBy(errors.category && "produto-categoria-erro")}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (isCategorySlug(value)) setCategory(value);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && (
          <p id="produto-categoria-erro" class="admin-campo-erro">
            {errors.category}
          </p>
        )}
      </div>

      {/* O campo de arquivo fica escondido: os botões em português abrem a escolha da foto. */}
      <div class="admin-grupo" role="group" aria-labelledby="produto-foto-rotulo">
        <label id="produto-foto-rotulo" for="produto-foto">
          Foto do produto
        </label>
        {shownPhoto?.src && (
          <img
            class="admin-previa"
            src={shownPhoto.src}
            alt={shownPhoto.alt}
            width={240}
            height={240}
          />
        )}
        <input
          id="produto-foto"
          ref={fileInput}
          class="sr-only"
          tabIndex={-1}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          aria-invalid={errors.photo ? true : undefined}
          aria-describedby={photoDescription}
          onChange={(e) => void choosePhoto(e.currentTarget)}
        />
        <div class="admin-botoes">
          <button
            type="button"
            class="admin-botao admin-botao-claro"
            aria-disabled={busy ? true : undefined}
            aria-describedby={photoDescription}
            ref={photoButton}
            onClick={() => !busy && fileInput.current?.click()}
          >
            {shownPhoto ? "Trocar foto" : "Escolher foto"}
          </button>
          {shownPhoto && (
            <button
              type="button"
              class="admin-botao admin-botao-claro"
              aria-disabled={busy ? true : undefined}
              onClick={() => !busy && removePhoto()}
            >
              Remover foto
            </button>
          )}
        </div>
        <p id="produto-foto-ajuda" class="admin-ajuda">
          JPG, PNG ou WebP. A foto é ajustada automaticamente.
        </p>
        <p role="status" class="admin-ajuda font-bold">
          {preparing ? "Preparando a foto…" : ""}
        </p>
        {errors.photo && (
          <p id="produto-foto-erro" class="admin-campo-erro">
            {errors.photo}
          </p>
        )}
      </div>

      <div class="admin-grupo admin-chaves">
        <label class="admin-chave">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.currentTarget.checked)}
          />
          Disponível
        </label>
        <label class="admin-chave">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.currentTarget.checked)}
          />
          Mostrar no site
        </label>
      </div>

      <div class="admin-grupo">
        <label for="produto-ordem">Ordem</label>
        <input
          id="produto-ordem"
          class="admin-campo admin-campo-curto"
          type="number"
          step={1}
          min={-9999}
          max={9999}
          value={order}
          aria-invalid={errors.sortOrder ? true : undefined}
          aria-describedby={describedBy(
            errors.sortOrder && "produto-ordem-erro",
            "produto-ordem-ajuda",
          )}
          onInput={(e) => setOrder(e.currentTarget.value)}
        />
        <p id="produto-ordem-ajuda" class="admin-ajuda">
          Número menor aparece primeiro
        </p>
        {errors.sortOrder && (
          <p id="produto-ordem-erro" class="admin-campo-erro">
            {errors.sortOrder}
          </p>
        )}
      </div>

      <p role="alert" class="admin-erro">
        {formError}
      </p>

      <div class="admin-botoes">
        <button type="submit" class="admin-botao" aria-disabled={busy ? true : undefined}>
          {saving ? "Salvando…" : "Salvar produto"}
        </button>
        <button
          type="button"
          class="admin-botao admin-botao-claro"
          disabled={saving}
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

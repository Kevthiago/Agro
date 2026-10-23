import { vi } from "vitest";
import type { ProductsClient } from "@/admin/products-api";
import type { ProductRow } from "@/lib/types";

type Res = { data: unknown; error: unknown };
type Bucket = ReturnType<ProductsClient["storage"]["from"]>;
type Op = "select" | "insert" | "update" | "delete";

/** Construtor de consulta com todos os métodos usados (cada operação usa uma parte). */
interface Query extends PromiseLike<Res> {
  select(columns: string): Query;
  order(column: string): Query;
  eq(column: string, value: string): Query;
  like(column: string, pattern: string): Query;
  single(): Query;
}

/** Linha completa com valores padrão (como o banco preencheria). */
export function productRow(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "p1",
    slug: "arame",
    name: "Arame",
    description: "",
    category: "ferramentas",
    image_path: null,
    available: true,
    published: true,
    sort_order: 0,
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** Falhas programadas: cada chamada da operação consome o próximo erro da fila. */
export interface FakeFailures {
  select: unknown[];
  insert: unknown[];
  update: unknown[];
  delete: unknown[];
  upload: unknown[];
  remove: unknown[];
}

/**
 * Banco e bucket em memória, com a mesma cadeia que o painel usa do supabase-js
 * (from().select().eq()..., storage.from().upload()). `log` registra a ordem das
 * gravações, para conferir o que acontece antes do quê.
 */
export function fakeProductsClient(initial: ProductRow[] = []) {
  const rows = initial.map((r) => ({ ...r }));
  const files = new Set<string>();
  const log: string[] = [];
  const fail: FakeFailures = {
    select: [],
    insert: [],
    update: [],
    delete: [],
    upload: [],
    remove: [],
  };
  let nextId = 1;
  // Enquanto pausado, as consultas ficam pendentes (para ver estados de "carregando").
  let gate: Promise<void> = Promise.resolve();
  const pause = () => {
    let release!: () => void;
    gate = new Promise((resolve) => (release = resolve));
    return () => {
      gate = Promise.resolve();
      release();
    };
  };

  function query(op: Op, values?: Partial<ProductRow>): Query {
    const filters: ((r: ProductRow) => boolean)[] = [];
    const orders: string[] = [];
    let single = false;

    function run(): Res {
      const failure = fail[op].shift();
      if (failure !== undefined) return { data: null, error: failure };
      const match = (r: ProductRow) => filters.every((f) => f(r));
      let result: ProductRow[];
      if (op === "insert") {
        const row = productRow({ id: `novo-${nextId++}`, ...values });
        if (rows.some((r) => r.slug === row.slug)) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        rows.push(row);
        log.push(`insert:${row.slug}`);
        result = [row];
      } else if (op === "update") {
        result = rows.filter(match);
        result.forEach((r) => Object.assign(r, values));
        log.push(`update:${result.map((r) => r.id).join(",")}`);
      } else if (op === "delete") {
        result = rows.filter(match);
        result.forEach((r) => rows.splice(rows.indexOf(r), 1));
        log.push(`delete:${result.map((r) => r.id).join(",")}`);
      } else {
        result = rows.filter(match);
        for (const column of [...orders].reverse()) {
          const key = column as keyof ProductRow;
          result.sort((a, b) => (a[key]! < b[key]! ? -1 : a[key]! > b[key]! ? 1 : 0));
        }
      }
      const copies = result.map((r) => ({ ...r }));
      if (!single) return { data: copies, error: null };
      return copies.length === 1
        ? { data: copies[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "0 rows" } };
    }

    const builder: Query = {
      select: () => builder,
      order: (column) => (orders.push(column), builder),
      eq: (column, value) => (
        filters.push((r) => r[column as keyof ProductRow] === value),
        builder
      ),
      like: (column, pattern) => {
        const prefix = pattern.replace(/%$/, "");
        filters.push((r) => String(r[column as keyof ProductRow]).startsWith(prefix));
        return builder;
      },
      single: () => ((single = true), builder),
      then: (onFulfilled, onRejected) => gate.then(run).then(onFulfilled, onRejected),
    };
    return builder;
  }

  const bucket = {
    upload: vi.fn<Bucket["upload"]>(async (path) => {
      const failure = fail.upload.shift();
      if (failure !== undefined) return { data: null, error: failure };
      files.add(path);
      log.push(`upload:${path}`);
      return { data: { path }, error: null };
    }),
    remove: vi.fn<Bucket["remove"]>(async (paths) => {
      const failure = fail.remove.shift();
      if (failure !== undefined) return { data: null, error: failure };
      paths.forEach((p) => files.delete(p));
      log.push(`remove:${paths.join(",")}`);
      return { data: [], error: null };
    }),
  };

  const client = {
    from: vi.fn(() => ({
      select: () => query("select"),
      insert: (values: Partial<ProductRow>) => query("insert", values),
      update: (values: Partial<ProductRow>) => query("update", values),
      delete: () => query("delete"),
    })),
    storage: { from: vi.fn<ProductsClient["storage"]["from"]>(() => bucket) },
  } satisfies ProductsClient;

  return { client, rows, files, log, fail, bucket, pause };
}

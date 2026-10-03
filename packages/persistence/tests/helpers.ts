import { vi } from "vitest";

export function mockSupabaseClient() {
  const mockData: Record<string, unknown[]> = {};
  const lastQuery: { table: string; filters: Record<string, unknown> } = {
    table: "",
    filters: {},
  };

  function createQueryBuilder(table: string) {
    lastQuery.table = table;
    lastQuery.filters = {};

    const builder: Record<string, unknown> = {};
    const state = {
      filters: [] as Array<{ column: string; value: unknown; op: string }>,
      ordering: null as { column: string; ascending: boolean } | null,
      limitVal: null as number | null,
      headOnly: false,
      countMode: null as string | null,
      selectedColumns: "*",
    };

    function applyFilters(rows: unknown[]): unknown[] {
      let result = rows;
      for (const f of state.filters) {
        result = result.filter((row: unknown) => {
          const r = row as Record<string, unknown>;
          if (f.op === "eq") return r[f.column] === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(r[f.column]);
          if (f.op === "gte") return (r[f.column] as string) >= (f.value as string);
          return true;
        });
      }
      return result;
    }

    function buildResult() {
      const rows = mockData[table] ?? [];
      let filtered = applyFilters(rows);

      if (state.ordering) {
        const col = state.ordering.column;
        const asc = state.ordering.ascending;
        filtered.sort((a: unknown, b: unknown) => {
          const va = (a as Record<string, unknown>)[col];
          const vb = (b as Record<string, unknown>)[col];
          if (typeof va === "number" && typeof vb === "number") {
            return asc ? va - vb : vb - va;
          }
          const sa = String(va);
          const sb = String(vb);
          return asc ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
      }

      if (state.limitVal) filtered = filtered.slice(0, state.limitVal);

      if (state.countMode === "exact") {
        return { data: state.headOnly ? null : filtered, count: filtered.length, error: null };
      }

      return { data: filtered, error: null };
    }

    builder.select = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) state.countMode = opts.count;
      if (opts?.head) state.headOnly = true;
      return builder;
    });

    builder.insert = vi.fn((row: unknown) => {
      if (!mockData[table]) mockData[table] = [];
      if (Array.isArray(row)) {
        mockData[table].push(...row);
      } else {
        mockData[table].push(row);
      }
      return { data: row, error: null };
    });

    builder.update = vi.fn((_updates: unknown) => {
      return builder;
    });

    builder.eq = vi.fn((col: string, val: unknown) => {
      state.filters.push({ column: col, value: val, op: "eq" });
      return builder;
    });

    builder.in = vi.fn((col: string, val: unknown[]) => {
      state.filters.push({ column: col, value: val, op: "in" });
      return builder;
    });

    builder.gte = vi.fn((col: string, val: unknown) => {
      state.filters.push({ column: col, value: val, op: "gte" });
      return builder;
    });

    builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
      state.ordering = { column: col, ascending: opts?.ascending ?? true };
      return builder;
    });

    builder.limit = vi.fn((n: number) => {
      state.limitVal = n;
      return builder;
    });

    builder.range = vi.fn((_from: number, _to: number) => {
      return builder;
    });

    builder.maybeSingle = vi.fn(() => {
      const result = buildResult();
      const rows = result.data as unknown[];
      return {
        data: rows && rows.length > 0 ? rows[0] : null,
        error: null,
      };
    });

    builder.then = undefined;

    Object.defineProperty(builder, "then", {
      get() {
        const result = buildResult();
        return (resolve: (val: unknown) => void) => resolve(result);
      },
    });

    return builder;
  }

  const client = {
    from: vi.fn((table: string) => createQueryBuilder(table)),
    rpc: vi.fn((_fn: string, _params?: unknown) => {
      return { data: null, error: null };
    }),
    _mockData: mockData,
    _seed: (table: string, rows: unknown[]) => {
      mockData[table] = [...(mockData[table] ?? []), ...rows];
    },
    _clear: () => {
      for (const key of Object.keys(mockData)) {
        delete mockData[key];
      }
    },
  };

  return client;
}

export type MockClient = ReturnType<typeof mockSupabaseClient>;

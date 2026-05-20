import { describe, expect, expectTypeOf, it } from "vitest";

import { FilterStoreError, createInMemoryFilterStore } from "../core";
import { createInMemoryFilterStore as createInMemoryFilterStoreFromStores } from "../core/stores";
import type {
  CreateInMemoryFilterStoreOptions,
  FilterDefinition,
  FilterGroup,
  FilterOperator,
  FilterQuery,
  FilterSort,
  FilterStore,
  FilterStoreErrorCode,
  ListFiltersOptions,
  SaveFilterInput,
  UpdateFilterInput,
} from "../core";
import type { FilterStore as FilterStoreFromStores } from "../core/stores";

const firstInstant = "2026-05-19T10:00:00.000Z";
const secondInstant = "2026-05-19T10:05:00.000Z";
const thirdInstant = "2026-05-19T10:10:00.000Z";

type InvalidQueryCase = {
  name: string;
  query: () => unknown;
};

describe("in-memory Filter Store", () => {
  it("exports the public Filter Store API from Core entrypoints", () => {
    expect(createInMemoryFilterStore).toEqual(expect.any(Function));
    expect(createInMemoryFilterStoreFromStores).toBe(createInMemoryFilterStore);
    expect(FilterStoreError).toEqual(expect.any(Function));
    expectTypeOf<FilterStoreFromStores>().toEqualTypeOf<FilterStore>();
    expectTypeOf<FilterStore>().toEqualTypeOf<{
      save(input: SaveFilterInput): FilterDefinition;
      get(filterId: string): FilterDefinition;
      update(filterId: string, input: UpdateFilterInput): FilterDefinition;
      list(options?: ListFiltersOptions): FilterDefinition[];
      delete(filterId: string): FilterDefinition;
    }>();
    expectTypeOf<SaveFilterInput>().toEqualTypeOf<{
      name: string;
      query: FilterQuery;
      sort?: FilterSort[];
      group?: FilterGroup;
      viewType: string;
      sourcePluginId?: string;
    }>();
    expectTypeOf<UpdateFilterInput>().toEqualTypeOf<{
      name?: string;
      query?: FilterQuery;
      sort?: FilterSort[] | null;
      group?: FilterGroup | null;
      viewType?: string;
      sourcePluginId?: string | null;
    }>();
    expectTypeOf<ListFiltersOptions>().toEqualTypeOf<{
      viewType?: string;
      sourcePluginId?: string;
    }>();
    expectTypeOf<CreateInMemoryFilterStoreOptions>().toEqualTypeOf<{
      createId?: () => string;
      now?: () => string;
    }>();
    expectTypeOf<FilterStoreErrorCode>().toEqualTypeOf<
      | "FILTER_NOT_FOUND"
      | "FILTER_ID_COLLISION"
      | "FILTER_IDENTITY_REQUIRED"
      | "FILTER_SOURCE_PLUGIN_REQUIRED"
      | "FILTER_QUERY_INVALID"
      | "FILTER_QUERY_OPERATOR_UNSUPPORTED"
      | "FILTER_SORT_INVALID"
      | "FILTER_GROUP_INVALID"
      | "FILTER_CLONE_FAILED"
    >();
  });

  it("saves, gets, updates, lists, and deletes filters in insertion order", () => {
    const store = createStore({
      ids: ["filter_alpha", "filter_beta"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const alphaInput = filterInput({
      name: "All Tasks",
      query: existsQuery("metadata.task.status"),
      sort: [{ field: "updatedAt", direction: "desc" }],
      group: { field: "metadata.task.status" },
      viewType: "task.list",
      sourcePluginId: "task-plugin",
    });
    const betaInput = filterInput({
      name: "Recent Timer Events",
      query: withinQuery("events.timer.time_segment_created", { days: 7 }),
      viewType: "timer.timeline",
    });

    const alpha = store.save(alphaInput);
    const beta = store.save(betaInput);

    expect(alpha).toStrictEqual({
      id: "filter_alpha",
      name: "All Tasks",
      query: existsQuery("metadata.task.status"),
      sort: [{ field: "updatedAt", direction: "desc" }],
      group: { field: "metadata.task.status" },
      viewType: "task.list",
      sourcePluginId: "task-plugin",
      createdAt: firstInstant,
      updatedAt: firstInstant,
    });
    expect(beta).toStrictEqual({
      id: "filter_beta",
      name: "Recent Timer Events",
      query: withinQuery("events.timer.time_segment_created", { days: 7 }),
      viewType: "timer.timeline",
      createdAt: secondInstant,
      updatedAt: secondInstant,
    });
    expect(beta).not.toHaveProperty("sourcePluginId");
    expect(store.get("filter_alpha")).toStrictEqual(alpha);
    expect(store.list()).toStrictEqual([alpha, beta]);

    const updated = store.update("filter_alpha", {
      name: "Active Tasks",
      query: eqQuery("metadata.task.status", "active"),
      sort: [{ field: "metadata.task.priority", direction: "asc" }],
      group: { field: "metadata.task.priority" },
      viewType: "task.board",
      sourcePluginId: "task-plugin-v2",
    });

    expect(updated).toStrictEqual({
      id: "filter_alpha",
      name: "Active Tasks",
      query: eqQuery("metadata.task.status", "active"),
      sort: [{ field: "metadata.task.priority", direction: "asc" }],
      group: { field: "metadata.task.priority" },
      viewType: "task.board",
      sourcePluginId: "task-plugin-v2",
      createdAt: firstInstant,
      updatedAt: thirdInstant,
    });
    expect(
      store.list().map((filter: FilterDefinition) => filter.id),
    ).toStrictEqual([
      "filter_alpha",
      "filter_beta",
    ]);

    const deleted = store.delete("filter_beta");

    expect(deleted).toStrictEqual(beta);
    expect(store.list()).toStrictEqual([updated]);
    expectFilterStoreError(
      () => store.get("filter_beta"),
      "FILTER_NOT_FOUND",
    );
    expectFilterStoreError(
      () => store.update("filter_beta", { name: "Missing" }),
      "FILTER_NOT_FOUND",
    );
    expectFilterStoreError(
      () => store.delete("filter_beta"),
      "FILTER_NOT_FOUND",
    );
  });

  it("returns a typed collision error when generated ids are not unique", () => {
    const store = createStore({
      ids: ["filter_alpha", "filter_alpha"],
      instants: [firstInstant, secondInstant],
    });
    const existing = store.save(
      filterInput({
        name: "Existing",
        query: existsQuery(),
        viewType: "task.list",
      }),
    );

    expectFilterStoreError(
      () =>
        store.save(
          filterInput({
            name: "Colliding",
            query: eqQuery("metadata.task.status", "ready"),
            viewType: "task.list",
          }),
        ),
      "FILTER_ID_COLLISION",
    );
    expect(store.list()).toStrictEqual([existing]);
  });

  it.each([
    {
      operation: "get",
      act: (store: FilterStore, filterId: string) => store.get(filterId),
    },
    {
      operation: "update",
      act: (store: FilterStore, filterId: string) =>
        store.update(filterId, { name: "Mutated" }),
    },
    {
      operation: "delete",
      act: (store: FilterStore, filterId: string) => store.delete(filterId),
    },
  ])(
    "returns a typed identity error for hostile filter ids passed to $operation",
    ({ act }) => {
      const hostileIdCases = [
        {
          name: "runtime Symbol",
          createFilterId: () => Symbol("filter") as unknown as string,
          expectation: {
            rejectTypeError: true,
          },
        },
        {
          name: "throwing toString object",
          createFilterId: (rawError: Error) =>
            ({
              toString() {
                throw rawError;
              },
            }) as unknown as string,
          expectation: (rawError: Error) => ({
            rawError,
            rejectTypeError: true,
          }),
        },
      ];

      for (const hostileIdCase of hostileIdCases) {
        const store = createStore({
          ids: [`filter_${hostileIdCase.name.replace(/ /g, "_")}`],
          instants: [firstInstant],
        });
        const existing = store.save(
          filterInput({
            name: "Existing",
            query: existsQuery(),
            viewType: "task.list",
          }),
        );
        const rawError = new Error(`${hostileIdCase.name} escaped`);
        const expectation =
          typeof hostileIdCase.expectation === "function"
            ? hostileIdCase.expectation(rawError)
            : hostileIdCase.expectation;

        expectFilterStoreError(
          () => act(store, hostileIdCase.createFilterId(rawError)),
          "FILTER_IDENTITY_REQUIRED",
          expectation,
        );
        expect(store.get(existing.id)).toStrictEqual(existing);
        expect(store.list()).toStrictEqual([existing]);
      }
    },
  );

  it("requires nonblank name and viewType while accepting optional sourcePluginId", () => {
    const store = createStore({
      ids: ["filter_without_source", "filter_with_source"],
      instants: [firstInstant, secondInstant],
    });

    const withoutSource = store.save(
      filterInput({
        name: "Inbox",
        query: existsQuery(),
        viewType: "task.list",
      }),
    );
    const withSource = store.save(
      filterInput({
        name: "Review  Queue",
        query: eqQuery("metadata.review.state", "ready"),
        viewType: "review  board",
        sourcePluginId: "review  plugin",
      }),
    );

    expect(withoutSource.sourcePluginId).toBeUndefined();
    expect(withSource.name).toBe("Review  Queue");
    expect(withSource.viewType).toBe("review  board");
    expect(withSource.sourcePluginId).toBe("review  plugin");
    expect(store.list()).toStrictEqual([withoutSource, withSource]);

    expectFilterStoreError(
      () =>
        store.save(
          filterInput({
            name: " ",
            query: existsQuery(),
            viewType: "task.list",
          }),
        ),
      "FILTER_IDENTITY_REQUIRED",
    );
    expectFilterStoreError(
      () =>
        store.save(
          filterInput({
            name: "Blank view",
            query: existsQuery(),
            viewType: "\n\t",
          }),
        ),
      "FILTER_IDENTITY_REQUIRED",
    );
    expectFilterStoreError(
      () =>
        store.save({
          name: "Blank source",
          query: existsQuery(),
          viewType: "task.list",
          sourcePluginId: " ",
        }),
      "FILTER_SOURCE_PLUGIN_REQUIRED",
    );
    expectFilterStoreError(
      () =>
        store.save({
          name: "Non-string source",
          query: existsQuery(),
          viewType: "task.list",
          sourcePluginId: 42 as unknown as string,
        }),
      "FILTER_SOURCE_PLUGIN_REQUIRED",
    );
  });

  it("clears optional fields on update and leaves the filter unchanged on rejected updates", () => {
    const store = createStore({
      ids: ["filter_alpha"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const created = store.save(
      filterInput({
        name: "Grouped Tasks",
        query: eqQuery("metadata.task.status", "open"),
        sort: [{ field: "metadata.task.priority", direction: "asc" }],
        group: { field: "metadata.task.status" },
        viewType: "task.board",
        sourcePluginId: "task-plugin",
      }),
    );

    const cleared = store.update(created.id, {
      sort: null,
      group: null,
      sourcePluginId: null,
    });

    expect(cleared).toStrictEqual({
      id: created.id,
      name: "Grouped Tasks",
      query: eqQuery("metadata.task.status", "open"),
      viewType: "task.board",
      createdAt: firstInstant,
      updatedAt: secondInstant,
    });
    expect(cleared).not.toHaveProperty("sort");
    expect(cleared).not.toHaveProperty("group");
    expect(cleared).not.toHaveProperty("sourcePluginId");

    const beforeRejectedUpdate = store.get(created.id);

    expectFilterStoreError(
      () =>
        store.update(created.id, {
          name: "Should not apply",
          query: {
            where: [{ field: "metadata.task.status", op: "eq" }],
          } as unknown as FilterQuery,
        }),
      "FILTER_QUERY_INVALID",
    );
    expect(store.get(created.id)).toStrictEqual(beforeRejectedUpdate);
    expect(store.list()).toStrictEqual([beforeRejectedUpdate]);
  });

  it("lists filters by exact viewType and sourcePluginId without normalizing meaningful whitespace", () => {
    const store = createStore({
      ids: ["filter_spaced", "filter_collapsed", "filter_without_source"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const spaced = store.save(
      filterInput({
        name: "Spaced Review",
        query: existsQuery(),
        viewType: "review  board",
        sourcePluginId: "review  plugin",
      }),
    );
    const collapsed = store.save(
      filterInput({
        name: "Collapsed Review",
        query: existsQuery(),
        viewType: "review board",
        sourcePluginId: "review plugin",
      }),
    );
    const withoutSource = store.save(
      filterInput({
        name: "Task List",
        query: existsQuery(),
        viewType: "task.list",
      }),
    );

    expect(store.list({ viewType: "review  board" })).toStrictEqual([spaced]);
    expect(store.list({ viewType: "review board" })).toStrictEqual([
      collapsed,
    ]);
    expect(store.list({ sourcePluginId: "review  plugin" })).toStrictEqual([
      spaced,
    ]);
    expect(store.list({ sourcePluginId: "review plugin" })).toStrictEqual([
      collapsed,
    ]);
    expect(
      store.list({
        viewType: "review  board",
        sourcePluginId: "review  plugin",
      }),
    ).toStrictEqual([spaced]);
    expect(store.list()).toStrictEqual([spaced, collapsed, withoutSource]);

    expectFilterStoreError(
      () => store.list({ viewType: " " }),
      "FILTER_IDENTITY_REQUIRED",
    );
    expectFilterStoreError(
      () => store.list({ sourcePluginId: "\t" }),
      "FILTER_SOURCE_PLUGIN_REQUIRED",
    );
  });

  it("accepts documented Query AST operators and recursive and/or branches", () => {
    const store = createStore({
      ids: ["filter_ast"],
      instants: [firstInstant],
    });
    const query: FilterQuery = {
      where: [
        { field: "metadata.task.enabled", op: "exists" },
        { field: "metadata.task.status", op: "eq", value: "ready" },
        { field: "metadata.task.status", op: "neq", value: "done" },
        { field: "metadata.tag.tags", op: "includes", value: "product" },
        {
          field: "events.timer.time_segment_created",
          op: "within",
          value: { days: 7 },
        },
      ],
      and: [
        {
          where: [{ field: "metadata.task.priority", op: "gt", value: 2 }],
          and: [
            {
              where: [
                { field: "metadata.task.estimate", op: "lt", value: 8 },
              ],
            },
          ],
        },
      ],
      or: [
        {
          where: [
            {
              field: "metadata.project.slug",
              op: "eq",
              value: "mirabilis",
            },
          ],
        },
        {
          where: [],
          or: [
            {
              where: [
                {
                  field: "metadata.review.state",
                  op: "eq",
                  value: "ready",
                },
              ],
            },
          ],
        },
      ],
    };

    const saved = store.save(
      filterInput({
        name: "Documented AST",
        query,
        viewType: "task.board",
      }),
    );

    expect(saved.query).toStrictEqual(query);
    expect(store.get(saved.id).query).toStrictEqual(query);
  });

  it("accepts every public FilterOperator variant and keeps regex unsupported", () => {
    const supportedOperators = [
      "eq",
      "neq",
      "gt",
      "lt",
      "includes",
      "exists",
      "within",
    ] as const satisfies readonly FilterOperator[];
    expectTypeOf<(typeof supportedOperators)[number]>().toEqualTypeOf<
      FilterOperator
    >();
    const store = createStore({
      ids: supportedOperators.map((operator) => `filter_${operator}`),
      instants: [
        firstInstant,
        secondInstant,
        thirdInstant,
        "2026-05-19T10:15:00.000Z",
        "2026-05-19T10:20:00.000Z",
        "2026-05-19T10:25:00.000Z",
        "2026-05-19T10:30:00.000Z",
      ],
    });

    for (const operator of supportedOperators) {
      const condition =
        operator === "exists"
          ? {
              field: `metadata.task.${operator}`,
              op: operator,
            }
          : {
              field: `metadata.task.${operator}`,
              op: operator,
              value: operator === "within" ? { days: 7 } : "ready",
            };

      const saved = store.save(
        filterInput({
          name: `Operator ${operator}`,
          query: { where: [condition] },
          viewType: "task.list",
        }),
      );

      expect(saved.query).toStrictEqual({ where: [condition] });
    }

    expectFilterStoreError(
      () =>
        store.save({
          name: "Regex query",
          query: {
            where: [
              {
                field: "metadata.task.title",
                op: "regex",
                value: "^fix",
              },
            ],
          } as unknown as FilterQuery,
          viewType: "task.list",
        }),
      "FILTER_QUERY_OPERATOR_UNSUPPORTED",
    );
  });

  it("returns a typed unsupported-operator error for unknown runtime operators", () => {
    const store = createStore({
      ids: ["filter_regex"],
      instants: [firstInstant],
    });

    expectFilterStoreError(
      () =>
        store.save({
          name: "Regex query",
          query: {
            where: [
              {
                field: "metadata.task.title",
                op: "regex",
                value: "^fix",
              },
            ],
          } as unknown as FilterQuery,
          viewType: "task.list",
        }),
      "FILTER_QUERY_OPERATOR_UNSUPPORTED",
    );
  });

  it.each([
    {
      name: "missing where",
      query: () => ({}),
    },
    {
      name: "non-array where",
      query: () => ({ where: { field: "metadata.task.status" } }),
    },
    {
      name: "malformed and branch",
      query: () => ({ where: [], and: { where: [] } }),
    },
    {
      name: "non-query or child",
      query: () => ({ where: [], or: [null] }),
    },
    {
      name: "blank condition field",
      query: () => ({ where: [{ field: " ", op: "eq", value: true }] }),
    },
    {
      name: "non-string condition field",
      query: () => ({ where: [{ field: 42, op: "eq", value: true }] }),
    },
    {
      name: "exists condition with own value property",
      query: () => ({
        where: [
          {
            field: "metadata.task.enabled",
            op: "exists",
            value: undefined,
          },
        ],
      }),
    },
    {
      name: "non-exists condition missing own value property",
      query: () => ({
        where: [{ field: "metadata.task.status", op: "eq" }],
      }),
    },
    {
      name: "non-finite condition value",
      query: () => ({
        where: [
          { field: "metadata.task.priority", op: "eq", value: Number.NaN },
        ],
      }),
    },
    {
      name: "cyclic condition value",
      query: () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        return {
          where: [{ field: "metadata.task.payload", op: "eq", value: cyclic }],
        };
      },
    },
    {
      name: "excessively deep condition value",
      query: () => ({
        where: [
          {
            field: "metadata.task.payload",
            op: "eq",
            value: deeplyNestedValue(1_200),
          },
        ],
      }),
    },
  ])(
    "rejects invalid Query AST shape: $name",
    ({ query }: InvalidQueryCase) => {
      const store = createStore({
        ids: ["filter_invalid"],
        instants: [firstInstant],
      });

      expectFilterStoreError(
        () =>
          store.save({
            name: "Invalid query",
            query: query() as FilterQuery,
            viewType: "task.list",
          }),
        "FILTER_QUERY_INVALID",
      );
      expect(store.list()).toStrictEqual([]);
    },
  );

  it("wraps query proxy and accessor failures in typed query errors", () => {
    const proxyError = new Error("proxy trap escaped");
    const accessorError = new Error("accessor escaped");
    const hostileProxy = new Proxy(
      { where: [] },
      {
        get() {
          throw proxyError;
        },
        ownKeys() {
          throw proxyError;
        },
      },
    );
    const accessorQuery = {};

    Object.defineProperty(accessorQuery, "where", {
      enumerable: true,
      get() {
        throw accessorError;
      },
    });

    const store = createStore({
      ids: ["filter_proxy", "filter_accessor"],
      instants: [firstInstant, secondInstant],
    });

    expectFilterStoreError(
      () =>
        store.save({
          name: "Proxy query",
          query: hostileProxy as unknown as FilterQuery,
          viewType: "task.list",
        }),
      "FILTER_QUERY_INVALID",
      { rawError: proxyError, rejectTypeError: true },
    );
    expectFilterStoreError(
      () =>
        store.save({
          name: "Accessor query",
          query: accessorQuery as unknown as FilterQuery,
          viewType: "task.list",
        }),
      "FILTER_QUERY_INVALID",
      { rawError: accessorError, rejectTypeError: true },
    );
    expect(store.list()).toStrictEqual([]);
  });

  it("wraps where iterator proxy failures in typed query errors after JSON validation", () => {
    const rawError = new Error("where iterator trap escaped");
    const store = createStore({
      ids: ["filter_where_proxy"],
      instants: [firstInstant],
    });

    expectFilterStoreError(
      () =>
        store.save({
          name: "Iterator-hostile query",
          query: {
            where: proxyArrayWithThrowingIterator([], rawError),
          } as unknown as FilterQuery,
          viewType: "task.list",
        }),
      "FILTER_QUERY_INVALID",
      { rawError, rejectTypeError: true },
    );
    expect(store.list()).toStrictEqual([]);
  });

  it.each(["root query", "and child query"] as const)(
    "wraps stateful getPrototypeOf trap failures from $0",
    (trapLocation) => {
      const rawError = new Error(`${trapLocation} prototype trap escaped`);
      const query =
        trapLocation === "root query"
          ? statefulPrototypeTrap({ where: [] }, rawError)
          : {
              where: [],
              and: [statefulPrototypeTrap({ where: [] }, rawError)],
            };
      const store = createStore({
        ids: ["filter_prototype_proxy"],
        instants: [firstInstant],
      });

      expectFilterStoreError(
        () =>
          store.save({
            name: "Prototype-hostile query",
            query: query as unknown as FilterQuery,
            viewType: "task.list",
          }),
        "FILTER_QUERY_INVALID",
        { rawError, rejectTypeError: true },
      );
      expect(store.list()).toStrictEqual([]);
    },
  );

  it.each([
    {
      name: "query where",
      query: () => nonEnumerableObject({ where: [] }),
    },
    {
      name: "condition field",
      query: () => ({
        where: [
          conditionWithNonEnumerableProperty("field", {
            field: "metadata.task.status",
            op: "eq",
            value: "ready",
          }),
        ],
      }),
    },
    {
      name: "condition op",
      query: () => ({
        where: [
          conditionWithNonEnumerableProperty("op", {
            field: "metadata.task.status",
            op: "eq",
            value: "ready",
          }),
        ],
      }),
    },
    {
      name: "condition value",
      query: () => ({
        where: [
          conditionWithNonEnumerableProperty("value", {
            field: "metadata.task.status",
            op: "eq",
            value: "ready",
          }),
        ],
      }),
    },
  ])(
    "rejects non-enumerable Query AST properties: $name",
    ({ query }) => {
      const store = createStore({
        ids: ["filter_non_enumerable_query"],
        instants: [firstInstant],
      });

      expectFilterStoreError(
        () =>
          store.save({
            name: "Non-enumerable query",
            query: query() as unknown as FilterQuery,
            viewType: "task.list",
          }),
        "FILTER_QUERY_INVALID",
      );
      expect(store.list()).toStrictEqual([]);
    },
  );

  it.each([
    {
      name: "function",
      value: () => () => "not json",
    },
    {
      name: "symbol",
      value: () => Symbol("condition"),
    },
    {
      name: "bigint",
      value: () => BigInt(1),
    },
    {
      name: "raw undefined value",
      value: () => undefined,
    },
    {
      name: "Date",
      value: () => new Date(firstInstant),
    },
    {
      name: "Map",
      value: () => new Map([["status", "ready"]]),
    },
    {
      name: "Set",
      value: () => new Set(["ready"]),
    },
    {
      name: "class instance",
      value: () => new HostileConditionValue("ready"),
    },
    {
      name: "sparse array",
      value: () => {
        const sparse = ["ready", "done"];
        delete sparse[1];
        return sparse;
      },
    },
    {
      name: "symbol-key object",
      value: () => {
        const value = { status: "ready" };
        Object.defineProperty(value, Symbol("hidden"), {
          value: true,
          enumerable: true,
        });
        return value;
      },
    },
  ])(
    "rejects hostile condition value JSON shape: $name",
    ({ value }) => {
      const store = createStore({
        ids: ["filter_existing"],
        instants: [firstInstant],
      });
      const existing = store.save(
        filterInput({
          name: "Existing",
          query: existsQuery(),
          viewType: "task.list",
        }),
      );

      expectFilterStoreError(
        () =>
          store.update(existing.id, {
            query: eqQuery("metadata.task.payload", value()),
          }),
        "FILTER_QUERY_INVALID",
      );
      expect(store.get(existing.id)).toStrictEqual(existing);
      expect(store.list()).toStrictEqual([existing]);
    },
  );

  it("rejects malformed sort and group fields without changing existing filters", () => {
    const store = createStore({
      ids: ["filter_alpha"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const existing = store.save(
      filterInput({
        name: "Sortable",
        query: existsQuery(),
        viewType: "task.list",
      }),
    );

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          sort: [
            { field: "metadata.task.status", direction: "sideways" },
          ] as unknown as FilterSort[],
        }),
      "FILTER_SORT_INVALID",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          group: { field: " " },
        }),
      "FILTER_GROUP_INVALID",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);
  });

  it("wraps sort iterator proxy failures in typed sort errors after JSON validation", () => {
    const rawError = new Error("sort iterator trap escaped");
    const store = createStore({
      ids: ["filter_sort_proxy"],
      instants: [firstInstant],
    });

    expectFilterStoreError(
      () =>
        store.save(
          filterInput({
            name: "Iterator-hostile sort",
            query: existsQuery(),
            sort: proxyArrayWithThrowingIterator(
              [{ field: "metadata.task.status", direction: "asc" }],
              rawError,
            ),
            viewType: "task.list",
          }),
        ),
      "FILTER_SORT_INVALID",
      { rawError, rejectTypeError: true },
    );
    expect(store.list()).toStrictEqual([]);
  });

  it.each([
    {
      name: "sort field",
      input: () => ({
        sort: [
          objectWithNonEnumerableProperty(
            { direction: "asc" },
            "field",
            "metadata.task.status",
          ),
        ] as unknown as FilterSort[],
      }),
      code: "FILTER_SORT_INVALID" as const,
    },
    {
      name: "group field",
      input: () => ({
        group: objectWithNonEnumerableProperty(
          {},
          "field",
          "metadata.task.status",
        ) as unknown as FilterGroup,
      }),
      code: "FILTER_GROUP_INVALID" as const,
    },
  ])(
    "rejects non-enumerable sort/group properties: $name",
    ({ input, code }) => {
      const store = createStore({
        ids: ["filter_non_enumerable_sort_group"],
        instants: [firstInstant],
      });

      expectFilterStoreError(
        () =>
          store.save(
            filterInput({
              name: "Non-enumerable sort or group",
              query: existsQuery(),
              viewType: "task.list",
              ...input(),
            }),
          ),
        code,
      );
      expect(store.list()).toStrictEqual([]);
    },
  );

  it("rejects hostile sort and group JSON shapes without changing existing filters", () => {
    const store = createStore({
      ids: ["filter_alpha"],
      instants: [firstInstant],
    });
    const existing = store.save(
      filterInput({
        name: "Grouped Tasks",
        query: existsQuery(),
        viewType: "task.board",
      }),
    );

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          sort: [
            objectWithAccessorProperty(
              { direction: "asc" },
              "field",
              "metadata.task.status",
            ) as unknown as FilterSort,
          ],
        }),
      "FILTER_SORT_INVALID",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          group: objectWithSymbolProperty(
            { field: "metadata.task.status" },
            Symbol("hidden"),
            true,
          ) as unknown as FilterGroup,
        }),
      "FILTER_GROUP_INVALID",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);
  });

  it("keeps existing filters unchanged after mixed-field rejected updates", () => {
    const store = createStore({
      ids: ["filter_alpha"],
      instants: [firstInstant],
    });
    const existing = store.save(
      filterInput({
        name: "Atomic",
        query: existsQuery(),
        viewType: "task.list",
        sourcePluginId: "task-plugin",
      }),
    );

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          name: "Should not apply",
          query: {
            where: [
              {
                field: "metadata.task.title",
                op: "regex",
                value: "^fix",
              },
            ],
          } as unknown as FilterQuery,
        }),
      "FILTER_QUERY_OPERATOR_UNSUPPORTED",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);

    expectFilterStoreError(
      () =>
        store.update(existing.id, {
          query: eqQuery("metadata.task.status", "ready"),
          sourcePluginId: " ",
        }),
      "FILTER_SOURCE_PLUGIN_REQUIRED",
    );
    expect(store.get(existing.id)).toStrictEqual(existing);
    expect(store.list()).toStrictEqual([existing]);
  });

  it("keeps defensive copies across inputs and returned filter definitions", () => {
    const store = createStore({
      ids: ["filter_alpha", "filter_beta"],
      instants: [firstInstant, secondInstant, thirdInstant],
    });
    const inputQuery = eqQuery("metadata.task.status", "ready");
    const inputSort: FilterSort[] = [
      { field: "metadata.task.priority", direction: "asc" },
    ];
    const inputGroup: FilterGroup = { field: "metadata.task.status" };
    const created = store.save(
      filterInput({
        name: "Ready Tasks",
        query: inputQuery,
        sort: inputSort,
        group: inputGroup,
        viewType: "task.board",
        sourcePluginId: "task-plugin",
      }),
    );
    const expectedCreated: FilterDefinition = {
      id: "filter_alpha",
      name: "Ready Tasks",
      query: eqQuery("metadata.task.status", "ready"),
      sort: [{ field: "metadata.task.priority", direction: "asc" }],
      group: { field: "metadata.task.status" },
      viewType: "task.board",
      sourcePluginId: "task-plugin",
      createdAt: firstInstant,
      updatedAt: firstInstant,
    };

    mutateFirstConditionField(inputQuery, "metadata.task.changed");
    inputSort[0].field = "metadata.task.changed";
    inputGroup.field = "metadata.task.changed";
    mutateFilterDefinition(created, "mutated-created");

    expect(store.get("filter_alpha")).toStrictEqual(expectedCreated);

    const retrieved = store.get("filter_alpha");
    mutateFilterDefinition(retrieved, "mutated-retrieved");
    expect(store.get("filter_alpha")).toStrictEqual(expectedCreated);

    const listed = store.list()[0];
    mutateFilterDefinition(listed, "mutated-listed");
    expect(store.get("filter_alpha")).toStrictEqual(expectedCreated);

    const updateQuery = withinQuery("events.timer.time_segment_created", {
      days: 7,
    });
    const updateSort: FilterSort[] = [{ field: "updatedAt", direction: "desc" }];
    const updateGroup: FilterGroup = { field: "metadata.project.slug" };
    const updated = store.update("filter_alpha", {
      name: "Recently Worked",
      query: updateQuery,
      sort: updateSort,
      group: updateGroup,
      sourcePluginId: "timer-plugin",
    });
    const expectedUpdated: FilterDefinition = {
      id: "filter_alpha",
      name: "Recently Worked",
      query: withinQuery("events.timer.time_segment_created", { days: 7 }),
      sort: [{ field: "updatedAt", direction: "desc" }],
      group: { field: "metadata.project.slug" },
      viewType: "task.board",
      sourcePluginId: "timer-plugin",
      createdAt: firstInstant,
      updatedAt: secondInstant,
    };

    mutateFirstConditionField(updateQuery, "events.timer.changed");
    updateSort[0].field = "changed";
    updateGroup.field = "changed";
    mutateFilterDefinition(updated, "mutated-updated");

    expect(store.get("filter_alpha")).toStrictEqual(expectedUpdated);

    const beta = store.save(
      filterInput({
        name: "Other Filter",
        query: existsQuery("metadata.other.enabled"),
        viewType: "other.list",
      }),
    );
    const deleted = store.delete("filter_alpha");
    mutateFilterDefinition(deleted, "mutated-deleted");

    expect(store.list()).toStrictEqual([beta]);
    expectFilterStoreError(
      () => store.get("filter_alpha"),
      "FILTER_NOT_FOUND",
    );
  });

  it("keeps defensive copies for nested condition values and recursive branches", () => {
    const store = createStore({
      ids: ["filter_alpha"],
      instants: [firstInstant, secondInstant],
    });
    const saveQuery = nestedBranchQuery("saved");
    const saved = store.save(
      filterInput({
        name: "Nested",
        query: saveQuery,
        viewType: "task.board",
      }),
    );
    const expectedAfterSave = store.get(saved.id);

    mutateNestedConditionValue(saveQuery, "input-save");
    mutateRecursiveBranches(saveQuery, "input-save");
    mutateNestedConditionValue(saved.query, "returned-save");
    mutateRecursiveBranches(saved.query, "returned-save");

    expect(store.get(saved.id)).toStrictEqual(expectedAfterSave);

    const retrieved = store.get(saved.id);
    mutateNestedConditionValue(retrieved.query, "get");
    mutateRecursiveBranches(retrieved.query, "get");
    expect(store.get(saved.id)).toStrictEqual(expectedAfterSave);

    const listed = requireFirstFilter(store.list());
    mutateNestedConditionValue(listed.query, "list");
    mutateRecursiveBranches(listed.query, "list");
    expect(store.get(saved.id)).toStrictEqual(expectedAfterSave);

    const updateQuery = nestedBranchQuery("updated");
    const updated = store.update(saved.id, { query: updateQuery });
    const expectedAfterUpdate = store.get(saved.id);

    mutateNestedConditionValue(updateQuery, "input-update");
    mutateRecursiveBranches(updateQuery, "input-update");
    mutateNestedConditionValue(updated.query, "returned-update");
    mutateRecursiveBranches(updated.query, "returned-update");

    expect(store.get(saved.id)).toStrictEqual(expectedAfterUpdate);
  });
});

function createStore({
  ids,
  instants,
}: {
  ids: string[];
  instants: string[];
}): FilterStore {
  return createInMemoryFilterStore({
    createId: sequence("id", ids),
    now: sequence("instant", instants),
  });
}

function filterInput(input: SaveFilterInput): SaveFilterInput {
  return input;
}

function sequence(label: string, values: string[]): () => string {
  let index = 0;

  return () => {
    const value = values[index];

    if (value === undefined) {
      throw new Error(`${label} sequence exhausted`);
    }

    index += 1;
    return value;
  };
}

function existsQuery(field = "metadata.task.enabled"): FilterQuery {
  return {
    where: [{ field, op: "exists" }],
  };
}

function eqQuery(field: string, value: unknown): FilterQuery {
  return {
    where: [{ field, op: "eq", value }],
  };
}

function withinQuery(field: string, value: unknown): FilterQuery {
  return {
    where: [{ field, op: "within", value }],
  };
}

function nestedBranchQuery(suffix: string): FilterQuery {
  return {
    where: [
      {
        field: `metadata.task.${suffix}.payload`,
        op: "eq",
        value: {
          labels: [suffix],
          nested: {
            source: suffix,
          },
        },
      },
    ],
    and: [
      {
        where: [
          {
            field: `metadata.task.${suffix}.status`,
            op: "eq",
            value: {
              status: suffix,
            },
          },
        ],
      },
    ],
    or: [
      {
        where: [{ field: `metadata.task.${suffix}.enabled`, op: "exists" }],
      },
    ],
  };
}

function deeplyNestedValue(depth: number): unknown {
  let value: unknown = "leaf";

  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }

  return value;
}

function proxyArrayWithThrowingIterator<T>(items: T[], rawError: Error): T[] {
  return new Proxy(items, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        throw rawError;
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function statefulPrototypeTrap<T extends object>(target: T, rawError: Error): T {
  let getPrototypeCallCount = 0;

  return new Proxy(target, {
    getPrototypeOf(value) {
      getPrototypeCallCount += 1;

      if (getPrototypeCallCount > 1) {
        throw rawError;
      }

      return Reflect.getPrototypeOf(value);
    },
  });
}

function nonEnumerableObject(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const target: Record<string, unknown> = {};

  for (const [property, value] of Object.entries(properties)) {
    Object.defineProperty(target, property, {
      value,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return target;
}

function conditionWithNonEnumerableProperty(
  property: "field" | "op" | "value",
  condition: {
    field: string;
    op: FilterOperator;
    value: unknown;
  },
): Record<string, unknown> {
  const target: Record<string, unknown> = {
    field: condition.field,
    op: condition.op,
    value: condition.value,
  };
  const propertyValue = target[property];

  delete target[property];

  Object.defineProperty(target, property, {
    value: propertyValue,
    enumerable: false,
    configurable: true,
    writable: true,
  });

  return target;
}

function objectWithNonEnumerableProperty<T extends object>(
  target: T,
  property: string,
  value: unknown,
): T {
  Object.defineProperty(target, property, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });

  return target;
}

function objectWithAccessorProperty<T extends object>(
  target: T,
  property: string,
  value: unknown,
): T {
  Object.defineProperty(target, property, {
    enumerable: true,
    configurable: true,
    get() {
      return value;
    },
  });

  return target;
}

function objectWithSymbolProperty<T extends object>(
  target: T,
  property: symbol,
  value: unknown,
): T {
  Object.defineProperty(target, property, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  return target;
}

function mutateFirstConditionField(query: FilterQuery, field: string): void {
  const firstCondition = query.where[0];

  if (firstCondition === undefined) {
    throw new Error("Expected query with at least one condition");
  }

  firstCondition.field = field;
}

function mutateNestedConditionValue(query: FilterQuery, suffix: string): void {
  const firstCondition = query.where[0];

  if (firstCondition === undefined) {
    throw new Error("Expected query with at least one condition");
  }

  const value = firstCondition.value;

  if (!isMutableRecord(value)) {
    throw new Error("Expected first condition value object");
  }

  value.mutated = suffix;

  if (Array.isArray(value.labels)) {
    value.labels.push(suffix);
  }

  if (isMutableRecord(value.nested)) {
    value.nested.mutated = suffix;
  }
}

function mutateRecursiveBranches(query: FilterQuery, suffix: string): void {
  const andBranch = query.and?.[0];

  if (andBranch === undefined) {
    throw new Error("Expected query with an and branch");
  }

  mutateFirstConditionField(andBranch, `metadata.and.${suffix}`);

  const andValue = andBranch.where[0]?.value;

  if (isMutableRecord(andValue)) {
    andValue.mutated = suffix;
  }

  const orBranch = query.or?.[0];

  if (orBranch === undefined) {
    throw new Error("Expected query with an or branch");
  }

  mutateFirstConditionField(orBranch, `metadata.or.${suffix}`);
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFirstFilter(filters: FilterDefinition[]): FilterDefinition {
  const firstFilter = filters[0];

  if (firstFilter === undefined) {
    throw new Error("Expected at least one filter");
  }

  return firstFilter;
}

function mutateFilterDefinition(filter: FilterDefinition, suffix: string): void {
  filter.name = `${filter.name} ${suffix}`;
  mutateFirstConditionField(filter.query, `metadata.${suffix}`);

  if (filter.sort !== undefined) {
    filter.sort[0] = { field: `sort.${suffix}`, direction: "asc" };
  }

  if (filter.group !== undefined) {
    filter.group.field = `group.${suffix}`;
  }

  if (filter.sourcePluginId !== undefined) {
    filter.sourcePluginId = `plugin.${suffix}`;
  }
}

class HostileConditionValue {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

type FilterStoreErrorExpectationOptions = {
  rawError?: unknown;
  rejectTypeError?: boolean;
};

function expectFilterStoreError(
  action: () => unknown,
  code: FilterStoreErrorCode,
  options: FilterStoreErrorExpectationOptions = {},
): void {
  try {
    action();
  } catch (error) {
    if (options.rawError !== undefined) {
      expect(error).not.toBe(options.rawError);
    }

    if (options.rejectTypeError === true) {
      expect(error).not.toBeInstanceOf(TypeError);
    }

    expect(error).toBeInstanceOf(FilterStoreError);

    expect((error as { code: FilterStoreErrorCode }).code).toBe(code);

    return;
  }

  throw new Error("Expected FilterStoreError");
}

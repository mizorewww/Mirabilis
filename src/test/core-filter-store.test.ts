import { describe, expect, expectTypeOf, it } from "vitest";

import { FilterStoreError, createInMemoryFilterStore } from "../core";
import { createInMemoryFilterStore as createInMemoryFilterStoreFromStores } from "../core/stores";
import type {
  CreateInMemoryFilterStoreOptions,
  FilterDefinition,
  FilterGroup,
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

function deeplyNestedValue(depth: number): unknown {
  let value: unknown = "leaf";

  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }

  return value;
}

function mutateFirstConditionField(query: FilterQuery, field: string): void {
  const firstCondition = query.where[0];

  if (firstCondition === undefined) {
    throw new Error("Expected query with at least one condition");
  }

  firstCondition.field = field;
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

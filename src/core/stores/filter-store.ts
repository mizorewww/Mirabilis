import type {
  FilterDefinition,
  FilterGroup,
  FilterOperator,
  FilterQuery,
  FilterSort,
} from "../types";

export type FilterStoreErrorCode =
  | "FILTER_NOT_FOUND"
  | "FILTER_ID_COLLISION"
  | "FILTER_IDENTITY_REQUIRED"
  | "FILTER_SOURCE_PLUGIN_REQUIRED"
  | "FILTER_QUERY_INVALID"
  | "FILTER_QUERY_OPERATOR_UNSUPPORTED"
  | "FILTER_SORT_INVALID"
  | "FILTER_GROUP_INVALID"
  | "FILTER_CLONE_FAILED";

export class FilterStoreError extends Error {
  readonly code: FilterStoreErrorCode;

  constructor(code: FilterStoreErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "FilterStoreError";
    this.code = code;
  }
}

export type SaveFilterInput = {
  name: string;
  query: FilterQuery;
  sort?: FilterSort[];
  group?: FilterGroup;
  viewType: string;
  sourcePluginId?: string;
};

export type UpdateFilterInput = {
  name?: string;
  query?: FilterQuery;
  sort?: FilterSort[] | null;
  group?: FilterGroup | null;
  viewType?: string;
  sourcePluginId?: string | null;
};

export type ListFiltersOptions = {
  viewType?: string;
  sourcePluginId?: string;
};

export type FilterStore = {
  save(input: SaveFilterInput): FilterDefinition;
  get(filterId: string): FilterDefinition;
  update(filterId: string, input: UpdateFilterInput): FilterDefinition;
  list(options?: ListFiltersOptions): FilterDefinition[];
  delete(filterId: string): FilterDefinition;
};

export type CreateInMemoryFilterStoreOptions = {
  createId?: () => string;
  now?: () => string;
};

type OptionalPropertyRead =
  | {
      present: false;
    }
  | {
      present: true;
      value: unknown;
    };

type JsonCompatibilityValidationState = {
  seen: WeakSet<object>;
  visitedNodeCount: number;
};

const supportedFilterOperators: ReadonlySet<FilterOperator> = new Set([
  "eq",
  "neq",
  "gt",
  "lt",
  "includes",
  "exists",
  "within",
]);

const maxJsonValueDepth = 1_000;
const maxJsonValueNodes = 100_000;

export function createInMemoryFilterStore(
  options: CreateInMemoryFilterStoreOptions = {},
): FilterStore {
  const createId = options.createId ?? createDefaultId;
  const now = options.now ?? createCurrentInstant;
  const filters = new Map<string, FilterDefinition>();

  function requireFilter(filterId: string): FilterDefinition {
    const filter = filters.get(filterId);

    if (filter === undefined) {
      throw new FilterStoreError("FILTER_NOT_FOUND", filterId);
    }

    return filter;
  }

  return {
    save(input) {
      const name = readIdentityField(input, "name");
      const viewType = readIdentityField(input, "viewType");
      const sourcePluginId = readSourcePluginId(input, "sourcePluginId");
      const queryInput = readRequiredProperty(
        input,
        "query",
        "FILTER_QUERY_INVALID",
        "filter query must be readable",
      );
      const sortInput = readOptionalProperty(
        input,
        "sort",
        "FILTER_SORT_INVALID",
        "filter sort must be readable",
      );
      const groupInput = readOptionalProperty(
        input,
        "group",
        "FILTER_GROUP_INVALID",
        "filter group must be readable",
      );

      assertFilterQuery(queryInput);

      if (sortInput.present) {
        assertFilterSorts(sortInput.value);
      }

      if (groupInput.present) {
        assertFilterGroup(groupInput.value);
      }

      const query = cloneForFilter("filter query", queryInput) as FilterQuery;
      const sort = sortInput.present
        ? (cloneForFilter("filter sort", sortInput.value) as FilterSort[])
        : undefined;
      const group = groupInput.present
        ? (cloneForFilter("filter group", groupInput.value) as FilterGroup)
        : undefined;
      const filterId = createId();

      if (filters.has(filterId)) {
        throw new FilterStoreError("FILTER_ID_COLLISION", filterId);
      }

      const instant = now();
      const filter: FilterDefinition = {
        id: filterId,
        name,
        query,
        viewType,
        createdAt: instant,
        updatedAt: instant,
      };

      if (sort !== undefined) {
        filter.sort = sort;
      }

      if (group !== undefined) {
        filter.group = group;
      }

      if (sourcePluginId !== undefined) {
        filter.sourcePluginId = sourcePluginId;
      }

      const output = cloneFilter(filter);

      filters.set(filterId, filter);

      return output;
    },

    get(filterId) {
      return cloneFilter(requireFilter(filterId));
    },

    update(filterId, input) {
      const current = requireFilter(filterId);
      const nameInput = readOptionalProperty(
        input,
        "name",
        "FILTER_IDENTITY_REQUIRED",
        "filter name must be readable",
      );
      const viewTypeInput = readOptionalProperty(
        input,
        "viewType",
        "FILTER_IDENTITY_REQUIRED",
        "filter viewType must be readable",
      );
      const queryInput = readOptionalProperty(
        input,
        "query",
        "FILTER_QUERY_INVALID",
        "filter query must be readable",
      );
      const sortInput = readOptionalProperty(
        input,
        "sort",
        "FILTER_SORT_INVALID",
        "filter sort must be readable",
      );
      const groupInput = readOptionalProperty(
        input,
        "group",
        "FILTER_GROUP_INVALID",
        "filter group must be readable",
      );
      const sourcePluginIdInput = readOptionalProperty(
        input,
        "sourcePluginId",
        "FILTER_SOURCE_PLUGIN_REQUIRED",
        "filter source plugin must be readable",
      );

      const name = nameInput.present
        ? normalizeIdentityValue(nameInput.value, "filter name")
        : undefined;
      const viewType = viewTypeInput.present
        ? normalizeIdentityValue(viewTypeInput.value, "filter viewType")
        : undefined;
      let query: FilterQuery | undefined;
      let sort: FilterSort[] | null | undefined;
      let group: FilterGroup | null | undefined;
      let sourcePluginId: string | null | undefined;

      if (queryInput.present) {
        assertFilterQuery(queryInput.value);
        query = cloneForFilter("filter query", queryInput.value) as FilterQuery;
      }

      if (sortInput.present) {
        if (sortInput.value === null) {
          sort = null;
        } else {
          assertFilterSorts(sortInput.value);
          sort = cloneForFilter("filter sort", sortInput.value) as FilterSort[];
        }
      }

      if (groupInput.present) {
        if (groupInput.value === null) {
          group = null;
        } else {
          assertFilterGroup(groupInput.value);
          group = cloneForFilter("filter group", groupInput.value) as FilterGroup;
        }
      }

      if (sourcePluginIdInput.present) {
        if (sourcePluginIdInput.value === null) {
          sourcePluginId = null;
        } else {
          sourcePluginId = normalizeSourcePluginIdValue(
            sourcePluginIdInput.value,
          );
        }
      }

      const next: FilterDefinition = {
        ...current,
        updatedAt: now(),
      };

      if (name !== undefined) {
        next.name = name;
      }

      if (viewType !== undefined) {
        next.viewType = viewType;
      }

      if (query !== undefined) {
        next.query = query;
      }

      if (sort === null) {
        delete next.sort;
      } else if (sort !== undefined) {
        next.sort = sort;
      }

      if (group === null) {
        delete next.group;
      } else if (group !== undefined) {
        next.group = group;
      }

      if (sourcePluginId === null) {
        delete next.sourcePluginId;
      } else if (sourcePluginId !== undefined) {
        next.sourcePluginId = sourcePluginId;
      }

      const output = cloneFilter(next);

      filters.set(filterId, next);

      return output;
    },

    list(options = {}) {
      const filtersToApply = normalizeListOptions(options);

      return [...filters.values()]
        .filter((filter) => matchesFilters(filter, filtersToApply))
        .map((filter) => cloneFilter(filter));
    },

    delete(filterId) {
      const filter = requireFilter(filterId);
      const output = cloneFilter(filter);

      filters.delete(filterId);

      return output;
    },
  };
}

function readIdentityField(
  input: SaveFilterInput,
  field: "name" | "viewType",
): string {
  const value = readRequiredProperty(
    input,
    field,
    "FILTER_IDENTITY_REQUIRED",
    `filter ${field} must be readable`,
  );

  return normalizeIdentityValue(value, `filter ${field}`);
}

function normalizeIdentityValue(value: unknown, detail: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FilterStoreError("FILTER_IDENTITY_REQUIRED", detail);
  }

  return value;
}

function readSourcePluginId(
  input: SaveFilterInput,
  field: "sourcePluginId",
): string | undefined {
  const value = readOptionalProperty(
    input,
    field,
    "FILTER_SOURCE_PLUGIN_REQUIRED",
    "filter source plugin must be readable",
  );

  if (!value.present) {
    return undefined;
  }

  return normalizeSourcePluginIdValue(value.value);
}

function normalizeSourcePluginIdValue(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FilterStoreError(
      "FILTER_SOURCE_PLUGIN_REQUIRED",
      "filter source plugin",
    );
  }

  return value;
}

function normalizeListOptions(options: ListFiltersOptions): ListFiltersOptions {
  const viewType = readOptionalProperty(
    options,
    "viewType",
    "FILTER_IDENTITY_REQUIRED",
    "filter list viewType must be readable",
  );
  const sourcePluginId = readOptionalProperty(
    options,
    "sourcePluginId",
    "FILTER_SOURCE_PLUGIN_REQUIRED",
    "filter list sourcePluginId must be readable",
  );
  const filters: ListFiltersOptions = {};

  if (viewType.present) {
    filters.viewType = normalizeIdentityValue(
      viewType.value,
      "filter list viewType",
    );
  }

  if (sourcePluginId.present) {
    filters.sourcePluginId = normalizeSourcePluginIdValue(
      sourcePluginId.value,
    );
  }

  return filters;
}

function matchesFilters(
  filter: FilterDefinition,
  filters: ListFiltersOptions,
): boolean {
  return (
    (filters.viewType === undefined || filter.viewType === filters.viewType) &&
    (filters.sourcePluginId === undefined ||
      filter.sourcePluginId === filters.sourcePluginId)
  );
}

function assertFilterQuery(value: unknown): asserts value is FilterQuery {
  assertJsonCompatible(
    value,
    "FILTER_QUERY_INVALID",
    "filter query must be JSON-compatible plain data",
  );
  assertFilterQueryShape(value);
}

function assertFilterQueryShape(
  value: unknown,
  depth = 0,
): asserts value is FilterQuery {
  if (depth > maxJsonValueDepth || !isPlainObjectValue(value)) {
    throw new FilterStoreError("FILTER_QUERY_INVALID", "filter query");
  }

  assertAllowedProperties(
    value,
    ["where", "and", "or"],
    "FILTER_QUERY_INVALID",
    "filter query",
  );

  const where = readRequiredProperty(
    value,
    "where",
    "FILTER_QUERY_INVALID",
    "filter query where",
  );

  if (!Array.isArray(where)) {
    throw new FilterStoreError("FILTER_QUERY_INVALID", "filter query where");
  }

  for (const condition of where) {
    assertFilterConditionShape(condition);
  }

  assertFilterQueryBranches(value, "and", depth);
  assertFilterQueryBranches(value, "or", depth);
}

function assertFilterQueryBranches(
  query: object,
  field: "and" | "or",
  depth: number,
): void {
  const branches = readOptionalProperty(
    query,
    field,
    "FILTER_QUERY_INVALID",
    `filter query ${field}`,
  );

  if (!branches.present) {
    return;
  }

  if (!Array.isArray(branches.value)) {
    throw new FilterStoreError("FILTER_QUERY_INVALID", `filter query ${field}`);
  }

  for (const childQuery of branches.value) {
    assertFilterQueryShape(childQuery, depth + 1);
  }
}

function assertFilterConditionShape(value: unknown): void {
  if (!isPlainObjectValue(value)) {
    throw new FilterStoreError("FILTER_QUERY_INVALID", "filter condition");
  }

  assertAllowedProperties(
    value,
    ["field", "op", "value"],
    "FILTER_QUERY_INVALID",
    "filter condition",
  );

  const field = readRequiredProperty(
    value,
    "field",
    "FILTER_QUERY_INVALID",
    "filter condition field",
  );

  if (typeof field !== "string" || field.trim().length === 0) {
    throw new FilterStoreError(
      "FILTER_QUERY_INVALID",
      "filter condition field",
    );
  }

  const op = readRequiredProperty(
    value,
    "op",
    "FILTER_QUERY_INVALID",
    "filter condition operator",
  );

  if (typeof op !== "string") {
    throw new FilterStoreError(
      "FILTER_QUERY_INVALID",
      "filter condition operator",
    );
  }

  if (!isSupportedFilterOperator(op)) {
    throw new FilterStoreError(
      "FILTER_QUERY_OPERATOR_UNSUPPORTED",
      `filter condition operator ${op}`,
    );
  }

  const conditionValue = readOptionalProperty(
    value,
    "value",
    "FILTER_QUERY_INVALID",
    "filter condition value",
  );

  if (op === "exists") {
    if (conditionValue.present) {
      throw new FilterStoreError(
        "FILTER_QUERY_INVALID",
        "exists condition value",
      );
    }

    return;
  }

  if (!conditionValue.present) {
    throw new FilterStoreError(
      "FILTER_QUERY_INVALID",
      "filter condition value",
    );
  }
}

function isSupportedFilterOperator(value: string): value is FilterOperator {
  return supportedFilterOperators.has(value as FilterOperator);
}

function assertFilterSorts(value: unknown): asserts value is FilterSort[] {
  assertJsonCompatible(
    value,
    "FILTER_SORT_INVALID",
    "filter sort must be JSON-compatible plain data",
  );

  if (!Array.isArray(value)) {
    throw new FilterStoreError("FILTER_SORT_INVALID", "filter sort");
  }

  for (const sort of value) {
    assertFilterSort(sort);
  }
}

function assertFilterSort(value: unknown): void {
  if (!isPlainObjectValue(value)) {
    throw new FilterStoreError("FILTER_SORT_INVALID", "filter sort");
  }

  assertAllowedProperties(
    value,
    ["field", "direction"],
    "FILTER_SORT_INVALID",
    "filter sort",
  );

  const field = readRequiredProperty(
    value,
    "field",
    "FILTER_SORT_INVALID",
    "filter sort field",
  );
  const direction = readRequiredProperty(
    value,
    "direction",
    "FILTER_SORT_INVALID",
    "filter sort direction",
  );

  if (typeof field !== "string" || field.trim().length === 0) {
    throw new FilterStoreError("FILTER_SORT_INVALID", "filter sort field");
  }

  if (direction !== "asc" && direction !== "desc") {
    throw new FilterStoreError(
      "FILTER_SORT_INVALID",
      "filter sort direction",
    );
  }
}

function assertFilterGroup(value: unknown): asserts value is FilterGroup {
  assertJsonCompatible(
    value,
    "FILTER_GROUP_INVALID",
    "filter group must be JSON-compatible plain data",
  );

  if (!isPlainObjectValue(value)) {
    throw new FilterStoreError("FILTER_GROUP_INVALID", "filter group");
  }

  assertAllowedProperties(
    value,
    ["field"],
    "FILTER_GROUP_INVALID",
    "filter group",
  );

  const field = readRequiredProperty(
    value,
    "field",
    "FILTER_GROUP_INVALID",
    "filter group field",
  );

  if (typeof field !== "string" || field.trim().length === 0) {
    throw new FilterStoreError("FILTER_GROUP_INVALID", "filter group field");
  }
}

function readRequiredProperty(
  input: object,
  field: string,
  code: FilterStoreErrorCode,
  detail: string,
): unknown {
  const value = readOptionalProperty(input, field, code, detail);

  if (!value.present) {
    throw new FilterStoreError(code, detail);
  }

  return value.value;
}

function readOptionalProperty(
  input: object,
  field: string,
  code: FilterStoreErrorCode,
  detail: string,
): OptionalPropertyRead {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);

    if (descriptor === undefined) {
      return { present: false };
    }

    if (isAccessorDescriptor(descriptor)) {
      throw new FilterStoreError(code, detail);
    }

    return {
      present: true,
      value: descriptor.value,
    };
  } catch (error) {
    if (error instanceof FilterStoreError) {
      throw error;
    }

    throw new FilterStoreError(code, detail);
  }
}

function assertAllowedProperties(
  value: object,
  allowedProperties: readonly string[],
  code: FilterStoreErrorCode,
  detail: string,
): void {
  try {
    const allowed = new Set(allowedProperties);

    for (const propertyName of Object.getOwnPropertyNames(value)) {
      if (!allowed.has(propertyName)) {
        throw new FilterStoreError(code, detail);
      }
    }
  } catch (error) {
    if (error instanceof FilterStoreError) {
      throw error;
    }

    throw new FilterStoreError(code, detail);
  }
}

function assertJsonCompatible(
  value: unknown,
  code: FilterStoreErrorCode,
  detail: string,
  state: JsonCompatibilityValidationState = {
    seen: new WeakSet(),
    visitedNodeCount: 0,
  },
  depth = 0,
): void {
  try {
    assertJsonCompatibleValue(value, code, detail, state, depth);
  } catch (error) {
    if (error instanceof FilterStoreError) {
      throw error;
    }

    throw new FilterStoreError(code, detail);
  }
}

function assertJsonCompatibleValue(
  value: unknown,
  code: FilterStoreErrorCode,
  detail: string,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  assertJsonBudgetAvailable(code, detail, state, depth);

  if (value === null) {
    return;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (Number.isFinite(value)) {
        return;
      }
      break;
    case "object":
      if (state.seen.has(value)) {
        break;
      }

      state.seen.add(value);

      try {
        if (Array.isArray(value)) {
          assertJsonArrayCompatible(value, code, detail, state, depth);
          return;
        }

        if (isPlainObjectValue(value)) {
          assertJsonObjectCompatible(value, code, detail, state, depth);
          return;
        }
      } finally {
        state.seen.delete(value);
      }

      break;
    default:
      break;
  }

  throw new FilterStoreError(code, detail);
}

function assertJsonArrayCompatible(
  value: unknown[],
  code: FilterStoreErrorCode,
  detail: string,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new FilterStoreError(code, detail);
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    if (propertyName === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (descriptor === undefined || isAccessorDescriptor(descriptor)) {
      throw new FilterStoreError(code, detail);
    }

    if (!isValidPresentArrayIndexProperty(value, propertyName)) {
      throw new FilterStoreError(code, detail);
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new FilterStoreError(code, detail);
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, index);

    if (descriptor === undefined || isAccessorDescriptor(descriptor)) {
      throw new FilterStoreError(code, detail);
    }

    assertJsonCompatible(descriptor.value, code, detail, state, depth + 1);
  }
}

function isValidPresentArrayIndexProperty(
  value: unknown[],
  propertyName: string,
): boolean {
  const index = Number(propertyName);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < value.length &&
    String(index) === propertyName &&
    Object.prototype.hasOwnProperty.call(value, propertyName)
  );
}

function assertJsonObjectCompatible(
  value: object,
  code: FilterStoreErrorCode,
  detail: string,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new FilterStoreError(code, detail);
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (descriptor === undefined || isAccessorDescriptor(descriptor)) {
      throw new FilterStoreError(code, detail);
    }

    assertJsonCompatible(descriptor.value, code, detail, state, depth + 1);
  }
}

function assertJsonBudgetAvailable(
  code: FilterStoreErrorCode,
  detail: string,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  state.visitedNodeCount += 1;

  if (depth > maxJsonValueDepth || state.visitedNodeCount > maxJsonValueNodes) {
    throw new FilterStoreError(code, detail);
  }
}

function isAccessorDescriptor(descriptor: PropertyDescriptor): boolean {
  return "get" in descriptor || "set" in descriptor;
}

function isPlainObjectValue(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function cloneFilter(filter: FilterDefinition): FilterDefinition {
  return cloneForFilter(filter.id, filter);
}

function cloneForFilter<T>(detail: string, value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new FilterStoreError("FILTER_CLONE_FAILED", detail);
  }
}

function createDefaultId(): string {
  const cryptoSource = globalThis.crypto;
  const randomUuid = cryptoSource?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `filter_${randomUuid}`;
  }

  if (cryptoSource?.getRandomValues === undefined) {
    throw new Error(
      "Unable to create a default filter id: Web Crypto is absent",
    );
  }

  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);

  return `filter_${bytesToHex(bytes)}`;
}

function createCurrentInstant(): string {
  return new Date().toISOString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

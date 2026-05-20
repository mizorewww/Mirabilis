import type {
  ListViewsOptions,
  ViewDataShape,
  ViewDefinition,
  ViewRegistry,
  ViewRegistryErrorCode,
} from "../types";

class ViewRegistryErrorImpl extends Error {
  readonly code: ViewRegistryErrorCode;
  declare readonly cause?: unknown;

  constructor(
    code: ViewRegistryErrorCode,
    detail: string,
    options: { cause?: unknown } = {},
  ) {
    super(`${code}: ${detail}`);
    this.name = "ViewRegistryError";
    this.code = code;

    if ("cause" in options) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export const ViewRegistryError = ViewRegistryErrorImpl;

export type ViewRegistryError = {
  code: ViewRegistryErrorCode;
  cause?: unknown;
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

const maxViewDataShapeDepth = 1_000;
const maxViewDataShapeNodes = 100_000;

export function createInMemoryViewRegistry(): ViewRegistry {
  const views = new Map<string, ViewDefinition>();

  function requireView(viewId: unknown): {
    viewId: string;
    view: ViewDefinition;
  } {
    const normalizedViewId = normalizeLookupViewId(viewId);
    const view = views.get(normalizedViewId);

    if (view === undefined) {
      throw new ViewRegistryError("VIEW_NOT_FOUND", normalizedViewId);
    }

    return {
      viewId: normalizedViewId,
      view,
    };
  }

  return {
    register(definition) {
      const id = readRequiredStringField(
        definition,
        "id",
        "VIEW_IDENTITY_REQUIRED",
        "view id",
      );

      if (views.has(id)) {
        throw new ViewRegistryError("VIEW_ID_COLLISION", id);
      }

      const view = createViewDefinition(definition, id);
      const output = cloneViewDefinition(view);

      views.set(id, view);

      return output;
    },

    get(viewId) {
      return cloneViewDefinition(requireView(viewId).view);
    },

    list(options = {}) {
      const filters = normalizeListOptions(options);

      return [...views.values()]
        .filter((view) => matchesFilters(view, filters))
        .map((view) => cloneViewDefinition(view));
    },

    unregister(viewId) {
      const { viewId: normalizedViewId, view } = requireView(viewId);
      const output = cloneViewDefinition(view);

      views.delete(normalizedViewId);

      return output;
    },
  };
}

function createViewDefinition<Props>(
  definition: ViewDefinition<Props>,
  id: string,
): ViewDefinition<Props> {
  const pluginId = readRequiredStringField(
    definition,
    "pluginId",
    "VIEW_PLUGIN_ID_REQUIRED",
    "view pluginId",
  );
  const type = readRequiredStringField(
    definition,
    "type",
    "VIEW_TYPE_REQUIRED",
    "view type",
  );
  const title = readRequiredStringField(
    definition,
    "title",
    "VIEW_TITLE_REQUIRED",
    "view title",
  );
  const component = readComponent(definition);
  const accepts = readAccepts(definition);

  return {
    id,
    pluginId,
    type,
    title,
    component,
    accepts,
  };
}

function readRequiredStringField(
  definition: object,
  field: "id" | "pluginId" | "type" | "title",
  code: ViewRegistryErrorCode,
  detail: string,
): string {
  const value = readRequiredProperty(definition, field, code, detail);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ViewRegistryError(code, detail);
  }

  return value;
}

function readComponent<Props>(
  definition: ViewDefinition<Props>,
): ViewDefinition<Props>["component"] {
  const component = readRequiredProperty(
    definition,
    "component",
    "VIEW_COMPONENT_REQUIRED",
    "view component",
  );

  if (typeof component !== "function") {
    throw new ViewRegistryError("VIEW_COMPONENT_REQUIRED", "view component");
  }

  return component as ViewDefinition<Props>["component"];
}

function readAccepts(definition: object): ViewDataShape {
  const accepts = readRequiredProperty(
    definition,
    "accepts",
    "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
    "view accepts",
  );

  assertJsonCompatibleViewDataShape(accepts);

  return cloneViewDataShape(accepts as ViewDataShape);
}

function readRequiredProperty(
  input: object,
  field: string,
  code: ViewRegistryErrorCode,
  detail: string,
): unknown {
  const value = readOptionalProperty(input, field, code, detail);

  if (!value.present) {
    throw new ViewRegistryError(code, detail);
  }

  return value.value;
}

function readOptionalProperty(
  input: object,
  field: string,
  code: ViewRegistryErrorCode,
  detail: string,
): OptionalPropertyRead {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);

    if (descriptor === undefined) {
      return { present: false };
    }

    if (isAccessorDescriptor(descriptor)) {
      throw new ViewRegistryError(code, detail);
    }

    return {
      present: true,
      value: Reflect.get(input, field),
    };
  } catch (error) {
    if (error instanceof ViewRegistryError) {
      throw error;
    }

    throw new ViewRegistryError(code, detail);
  }
}

function normalizeLookupViewId(viewId: unknown): string {
  if (typeof viewId !== "string" || viewId.trim().length === 0) {
    throw new ViewRegistryError("VIEW_NOT_FOUND", "view id");
  }

  return viewId;
}

function normalizeListOptions(options: ListViewsOptions): ListViewsOptions {
  const pluginId = readOptionalProperty(
    options,
    "pluginId",
    "VIEW_PLUGIN_ID_REQUIRED",
    "view list pluginId",
  );
  const type = readOptionalProperty(
    options,
    "type",
    "VIEW_TYPE_REQUIRED",
    "view list type",
  );
  const filters: ListViewsOptions = {};

  if (pluginId.present) {
    filters.pluginId = normalizeFilterValue(
      pluginId.value,
      "VIEW_PLUGIN_ID_REQUIRED",
      "view list pluginId",
    );
  }

  if (type.present) {
    filters.type = normalizeFilterValue(
      type.value,
      "VIEW_TYPE_REQUIRED",
      "view list type",
    );
  }

  return filters;
}

function normalizeFilterValue(
  value: unknown,
  code: ViewRegistryErrorCode,
  detail: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ViewRegistryError(code, detail);
  }

  return value;
}

function matchesFilters(
  view: ViewDefinition,
  filters: ListViewsOptions,
): boolean {
  return (
    (filters.pluginId === undefined || view.pluginId === filters.pluginId) &&
    (filters.type === undefined || view.type === filters.type)
  );
}

function cloneViewDefinition<Props>(
  definition: ViewDefinition<Props>,
): ViewDefinition<Props> {
  return {
    id: definition.id,
    pluginId: definition.pluginId,
    type: definition.type,
    title: definition.title,
    component: definition.component,
    accepts: cloneViewDataShape(definition.accepts),
  };
}

function assertJsonCompatibleViewDataShape(
  value: unknown,
  state: JsonCompatibilityValidationState = {
    seen: new WeakSet(),
    visitedNodeCount: 0,
  },
  depth = 0,
): void {
  try {
    assertJsonCompatibleViewDataShapeValue(value, state, depth);
  } catch (error) {
    if (error instanceof ViewRegistryError) {
      throw error;
    }

    throw new ViewRegistryError(
      "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      "view accepts",
    );
  }
}

function assertJsonCompatibleViewDataShapeValue(
  value: unknown,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  assertJsonBudgetAvailable(state, depth);

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
          assertJsonArrayCompatible(value, state, depth);
          return;
        }

        if (isPlainObjectValue(value)) {
          assertJsonObjectCompatible(value, state, depth);
          return;
        }
      } finally {
        state.seen.delete(value);
      }

      break;
    default:
      break;
  }

  throw new ViewRegistryError(
    "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
    "view accepts",
  );
}

function assertJsonArrayCompatible(
  value: unknown[],
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ViewRegistryError(
      "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      "view accepts",
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    if (propertyName === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new ViewRegistryError(
        "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
        "view accepts",
      );
    }

    if (!isValidPresentArrayIndexProperty(value, propertyName)) {
      throw new ViewRegistryError(
        "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
        "view accepts",
      );
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new ViewRegistryError(
        "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
        "view accepts",
      );
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, index);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new ViewRegistryError(
        "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
        "view accepts",
      );
    }

    assertJsonCompatibleViewDataShape(descriptor.value, state, depth + 1);
  }
}

function assertJsonObjectCompatible(
  value: object,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new ViewRegistryError(
      "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      "view accepts",
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new ViewRegistryError(
        "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
        "view accepts",
      );
    }

    assertJsonCompatibleViewDataShape(descriptor.value, state, depth + 1);
  }
}

function assertJsonBudgetAvailable(
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  state.visitedNodeCount += 1;

  if (
    depth > maxViewDataShapeDepth ||
    state.visitedNodeCount > maxViewDataShapeNodes
  ) {
    throw new ViewRegistryError(
      "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      "view accepts",
    );
  }
}

function cloneViewDataShape<T extends ViewDataShape>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new ViewRegistryError(
      "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE",
      "view accepts",
    );
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

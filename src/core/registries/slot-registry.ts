import type {
  ListSlotContributionsOptions,
  SlotContribution,
  SlotRegistry,
  SlotRegistryErrorCode,
} from "../types";

class SlotRegistryErrorImpl extends Error {
  readonly code: SlotRegistryErrorCode;
  declare readonly cause?: unknown;

  constructor(
    code: SlotRegistryErrorCode,
    detail: string,
    options: { cause?: unknown } = {},
  ) {
    super(`${code}: ${detail}`);
    this.name = "SlotRegistryError";
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

export const SlotRegistryError = SlotRegistryErrorImpl;

export type SlotRegistryError = {
  code: SlotRegistryErrorCode;
  cause?: unknown;
};

type StoredSlotContribution = {
  contribution: SlotContribution;
  registrationOrder: number;
};

type OptionalPropertyRead =
  | {
      present: false;
    }
  | {
      present: true;
      value: unknown;
    };

export function createInMemorySlotRegistry(): SlotRegistry {
  const contributions = new Map<string, StoredSlotContribution>();
  let nextRegistrationOrder = 0;

  function requireContribution(contributionId: unknown): {
    contributionId: string;
    stored: StoredSlotContribution;
  } {
    const normalizedContributionId =
      normalizeLookupContributionId(contributionId);
    const stored = contributions.get(normalizedContributionId);

    if (stored === undefined) {
      throw new SlotRegistryError("SLOT_NOT_FOUND", normalizedContributionId);
    }

    return {
      contributionId: normalizedContributionId,
      stored,
    };
  }

  return {
    register(contribution) {
      const id = readRequiredStringField(
        contribution,
        "id",
        "SLOT_IDENTITY_REQUIRED",
        "slot contribution id",
      );

      if (contributions.has(id)) {
        throw new SlotRegistryError("SLOT_ID_COLLISION", id);
      }

      const slotContribution = createSlotContribution(contribution, id);
      const output = cloneSlotContribution(slotContribution);

      contributions.set(id, {
        contribution: slotContribution,
        registrationOrder: nextRegistrationOrder,
      });
      nextRegistrationOrder += 1;

      return output;
    },

    get(contributionId) {
      return cloneSlotContribution(
        requireContribution(contributionId).stored.contribution,
      );
    },

    list(options = {}) {
      const filters = normalizeListOptions(options);

      return [...contributions.values()]
        .filter((stored) => matchesFilters(stored.contribution, filters))
        .sort(compareStoredSlotContributions)
        .map((stored) => cloneSlotContribution(stored.contribution));
    },

    unregister(contributionId) {
      const { contributionId: normalizedContributionId, stored } =
        requireContribution(contributionId);
      const output = cloneSlotContribution(stored.contribution);

      contributions.delete(normalizedContributionId);

      return output;
    },
  };
}

function createSlotContribution<Props>(
  contribution: SlotContribution<Props>,
  id: string,
): SlotContribution<Props> {
  const pluginId = readRequiredStringField(
    contribution,
    "pluginId",
    "SLOT_PLUGIN_ID_REQUIRED",
    "slot contribution pluginId",
  );
  const slot = readRequiredStringField(
    contribution,
    "slot",
    "SLOT_NAME_REQUIRED",
    "slot contribution slot",
  );
  const component = readComponent(contribution);
  const order = readOrder(contribution);
  const when = readCondition(contribution);
  const output: SlotContribution<Props> = {
    id,
    pluginId,
    slot,
    component,
  };

  if (order !== undefined) {
    output.order = order;
  }

  if (when !== undefined) {
    output.when = when;
  }

  return output;
}

function readRequiredStringField(
  contribution: object,
  field: "id" | "pluginId" | "slot",
  code: SlotRegistryErrorCode,
  detail: string,
): string {
  const value = readRequiredProperty(contribution, field, code, detail);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SlotRegistryError(code, detail);
  }

  return value;
}

function readComponent<Props>(
  contribution: SlotContribution<Props>,
): SlotContribution<Props>["component"] {
  const component = readRequiredProperty(
    contribution,
    "component",
    "SLOT_COMPONENT_REQUIRED",
    "slot contribution component",
  );

  if (typeof component !== "function") {
    throw new SlotRegistryError(
      "SLOT_COMPONENT_REQUIRED",
      "slot contribution component",
    );
  }

  return component as SlotContribution<Props>["component"];
}

function readOrder(contribution: object): number | undefined {
  const order = readOptionalProperty(
    contribution,
    "order",
    "SLOT_ORDER_INVALID",
    "slot contribution order",
  );

  if (!order.present || order.value === undefined) {
    return undefined;
  }

  if (typeof order.value !== "number" || !Number.isFinite(order.value)) {
    throw new SlotRegistryError(
      "SLOT_ORDER_INVALID",
      "slot contribution order",
    );
  }

  return order.value;
}

function readCondition<Props>(
  contribution: SlotContribution<Props>,
): SlotContribution<Props>["when"] | undefined {
  const when = readOptionalProperty(
    contribution,
    "when",
    "SLOT_CONDITION_REQUIRED",
    "slot contribution when",
  );

  if (!when.present || when.value === undefined) {
    return undefined;
  }

  if (typeof when.value !== "function") {
    throw new SlotRegistryError(
      "SLOT_CONDITION_REQUIRED",
      "slot contribution when",
    );
  }

  return when.value as SlotContribution<Props>["when"];
}

function readRequiredProperty(
  input: object,
  field: string,
  code: SlotRegistryErrorCode,
  detail: string,
): unknown {
  const value = readOptionalProperty(input, field, code, detail);

  if (!value.present) {
    throw new SlotRegistryError(code, detail);
  }

  return value.value;
}

function readOptionalProperty(
  input: object,
  field: string,
  code: SlotRegistryErrorCode,
  detail: string,
): OptionalPropertyRead {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);

    if (descriptor === undefined) {
      return { present: false };
    }

    if (isAccessorDescriptor(descriptor)) {
      throw new SlotRegistryError(code, detail);
    }

    return {
      present: true,
      value: Reflect.get(input, field),
    };
  } catch (error) {
    if (error instanceof SlotRegistryError) {
      throw error;
    }

    throw new SlotRegistryError(code, detail);
  }
}

function normalizeLookupContributionId(contributionId: unknown): string {
  if (typeof contributionId !== "string" || contributionId.trim().length === 0) {
    throw new SlotRegistryError("SLOT_NOT_FOUND", "slot contribution id");
  }

  return contributionId;
}

function normalizeListOptions(
  options: ListSlotContributionsOptions,
): ListSlotContributionsOptions {
  const pluginId = readOptionalProperty(
    options,
    "pluginId",
    "SLOT_PLUGIN_ID_REQUIRED",
    "slot list pluginId",
  );
  const slot = readOptionalProperty(
    options,
    "slot",
    "SLOT_NAME_REQUIRED",
    "slot list slot",
  );
  const filters: ListSlotContributionsOptions = {};

  if (pluginId.present) {
    filters.pluginId = normalizeFilterValue(
      pluginId.value,
      "SLOT_PLUGIN_ID_REQUIRED",
      "slot list pluginId",
    );
  }

  if (slot.present) {
    filters.slot = normalizeFilterValue(
      slot.value,
      "SLOT_NAME_REQUIRED",
      "slot list slot",
    );
  }

  return filters;
}

function normalizeFilterValue(
  value: unknown,
  code: SlotRegistryErrorCode,
  detail: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SlotRegistryError(code, detail);
  }

  return value;
}

function matchesFilters(
  contribution: SlotContribution,
  filters: ListSlotContributionsOptions,
): boolean {
  return (
    (filters.pluginId === undefined ||
      contribution.pluginId === filters.pluginId) &&
    (filters.slot === undefined || contribution.slot === filters.slot)
  );
}

function compareStoredSlotContributions(
  left: StoredSlotContribution,
  right: StoredSlotContribution,
): number {
  const orderDelta =
    getSortableOrder(left.contribution) - getSortableOrder(right.contribution);

  if (orderDelta !== 0) {
    return orderDelta;
  }

  return left.registrationOrder - right.registrationOrder;
}

function getSortableOrder(contribution: SlotContribution): number {
  return contribution.order ?? 0;
}

function cloneSlotContribution<Props>(
  contribution: SlotContribution<Props>,
): SlotContribution<Props> {
  const clone: SlotContribution<Props> = {
    id: contribution.id,
    pluginId: contribution.pluginId,
    slot: contribution.slot,
    component: contribution.component,
  };

  if (contribution.order !== undefined) {
    clone.order = contribution.order;
  }

  if (contribution.when !== undefined) {
    clone.when = contribution.when;
  }

  return clone;
}

function isAccessorDescriptor(descriptor: PropertyDescriptor): boolean {
  return "get" in descriptor || "set" in descriptor;
}

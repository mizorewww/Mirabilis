import type { AppEvent } from "../types";

export type EventStoreErrorCode =
  | "EVENT_ID_COLLISION"
  | "EVENT_IDENTITY_REQUIRED"
  | "EVENT_SOURCE_PLUGIN_REQUIRED"
  | "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE"
  | "EVENT_CLONE_FAILED";

export class EventStoreError extends Error {
  readonly code: EventStoreErrorCode;

  constructor(code: EventStoreErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "EventStoreError";
    this.code = code;
  }
}

export type AppendEventInput = {
  pageId?: string;
  namespace: string;
  type: string;
  payload: unknown;
  sourcePluginId: string;
};

export type ListEventsOptions = {
  pageId?: string;
  namespace?: string;
};

export type EventStore = {
  append(input: AppendEventInput): AppEvent;
  list(options?: ListEventsOptions): AppEvent[];
};

export type CreateInMemoryEventStoreOptions = {
  createId?: () => string;
  now?: () => string;
};

type EventIdentity = Pick<AppEvent, "namespace" | "type"> & {
  pageId?: string;
};

export function createInMemoryEventStore(
  options: CreateInMemoryEventStoreOptions = {},
): EventStore {
  const createId = options.createId ?? createDefaultId;
  const now = options.now ?? createCurrentInstant;
  const events: AppEvent[] = [];

  return {
    append(input) {
      const identity = normalizeIdentity(input);
      const sourcePluginId = normalizeSourcePluginId(input, identity);

      assertJsonCompatible(input.payload, identity);

      const eventId = createId();

      if (events.some((event) => event.id === eventId)) {
        throw new EventStoreError("EVENT_ID_COLLISION", eventId);
      }

      const payload = cloneForEvent(identity, input.payload);
      const event = createEvent({
        eventId,
        identity,
        payload,
        sourcePluginId,
        createdAt: now(),
      });
      const output = cloneEvent(event);

      events.push(event);

      return output;
    },

    list(options = {}) {
      const filters = normalizeListOptions(options);

      return events
        .filter((event) => matchesFilters(event, filters))
        .map((event) => cloneEvent(event));
    },
  };
}

function normalizeIdentity(input: AppendEventInput): EventIdentity {
  const identity: EventIdentity = {
    namespace: input.namespace,
    type: input.type,
  };

  if (input.pageId !== undefined) {
    identity.pageId = input.pageId;
  }

  if (
    identity.namespace.trim().length === 0 ||
    identity.type.trim().length === 0 ||
    identity.pageId?.trim().length === 0
  ) {
    throw new EventStoreError("EVENT_IDENTITY_REQUIRED", describeIdentity(input));
  }

  return identity;
}

function normalizeSourcePluginId(
  input: Pick<AppendEventInput, "sourcePluginId">,
  identity: EventIdentity,
): string {
  const sourcePluginId = input.sourcePluginId.trim();

  if (sourcePluginId.length === 0) {
    throw new EventStoreError(
      "EVENT_SOURCE_PLUGIN_REQUIRED",
      describeIdentity(identity),
    );
  }

  return sourcePluginId;
}

function normalizeListOptions(options: ListEventsOptions): ListEventsOptions {
  const filters: ListEventsOptions = {};

  if (options.pageId !== undefined) {
    filters.pageId = normalizeFilter(options.pageId, options);
  }

  if (options.namespace !== undefined) {
    filters.namespace = normalizeFilter(options.namespace, options);
  }

  return filters;
}

function normalizeFilter(
  value: string,
  options: ListEventsOptions,
): string {
  if (value.trim().length === 0) {
    throw new EventStoreError(
      "EVENT_IDENTITY_REQUIRED",
      `pageId=${options.pageId ?? ""}/namespace=${options.namespace ?? ""}`,
    );
  }

  return value;
}

function matchesFilters(event: AppEvent, filters: ListEventsOptions): boolean {
  return (
    (filters.pageId === undefined || event.pageId === filters.pageId) &&
    (filters.namespace === undefined || event.namespace === filters.namespace)
  );
}

function assertJsonCompatible(
  value: unknown,
  identity: EventIdentity,
  seen: WeakSet<object> = new WeakSet(),
): void {
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
      if (seen.has(value)) {
        break;
      }

      seen.add(value);

      try {
        if (Array.isArray(value)) {
          assertJsonArrayCompatible(value, identity, seen);
          return;
        }

        if (isPlainObject(value)) {
          assertJsonObjectCompatible(value, identity, seen);
          return;
        }
      } finally {
        seen.delete(value);
      }

      break;
    default:
      break;
  }

  throw new EventStoreError(
    "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
    describeIdentity(identity),
  );
}

function assertJsonArrayCompatible(
  value: unknown[],
  identity: EventIdentity,
  seen: WeakSet<object>,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new EventStoreError(
      "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
      describeIdentity(identity),
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    if (propertyName === "length") {
      continue;
    }

    if (!isValidPresentArrayIndexProperty(value, propertyName)) {
      throw new EventStoreError(
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
        describeIdentity(identity),
      );
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new EventStoreError(
        "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
        describeIdentity(identity),
      );
    }

    assertJsonCompatible(value[index], identity, seen);
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
  identity: EventIdentity,
  seen: WeakSet<object>,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new EventStoreError(
      "EVENT_PAYLOAD_NOT_JSON_COMPATIBLE",
      describeIdentity(identity),
    );
  }

  for (const objectValue of Object.values(value)) {
    assertJsonCompatible(objectValue, identity, seen);
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function createEvent({
  eventId,
  identity,
  payload,
  sourcePluginId,
  createdAt,
}: {
  eventId: string;
  identity: EventIdentity;
  payload: unknown;
  sourcePluginId: string;
  createdAt: string;
}): AppEvent {
  const event: AppEvent = {
    id: eventId,
    namespace: identity.namespace,
    type: identity.type,
    payload,
    sourcePluginId,
    createdAt,
  };

  if (identity.pageId !== undefined) {
    event.pageId = identity.pageId;
  }

  return event;
}

function cloneEvent(event: AppEvent): AppEvent {
  return cloneForEvent(event, event);
}

function cloneForEvent<T>(identity: EventIdentity, value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new EventStoreError("EVENT_CLONE_FAILED", describeIdentity(identity));
  }
}

function describeIdentity(identity: EventIdentity): string {
  return `pageId=${identity.pageId ?? ""}/namespace=${identity.namespace}/type=${
    identity.type
  }`;
}

function createDefaultId(): string {
  const cryptoSource = globalThis.crypto;
  const randomUuid = cryptoSource?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `event_${randomUuid}`;
  }

  if (cryptoSource?.getRandomValues === undefined) {
    throw new Error("Unable to create a default event id: Web Crypto is absent");
  }

  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);

  return `event_${bytesToHex(bytes)}`;
}

function createCurrentInstant(): string {
  return new Date().toISOString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

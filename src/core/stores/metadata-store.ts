import type {
  MetadataJsonValue,
  MetadataRecord,
  MetadataValueType,
} from "../types/metadata";

export type MetadataStoreErrorCode =
  | "METADATA_NOT_FOUND"
  | "METADATA_ID_COLLISION"
  | "METADATA_IDENTITY_REQUIRED"
  | "METADATA_SOURCE_PLUGIN_REQUIRED"
  | "METADATA_VALUE_TYPE_MISMATCH"
  | "METADATA_VALUE_NOT_JSON_COMPATIBLE"
  | "METADATA_CLONE_FAILED";

type MetadataErrorContext = {
  pageId: string;
  namespace: string;
  key: string;
  metadataId?: string;
};

export class MetadataStoreError extends Error {
  readonly code: MetadataStoreErrorCode;
  readonly pageId: string;
  readonly namespace: string;
  readonly key: string;
  readonly metadataId?: string;

  constructor(code: MetadataStoreErrorCode, context: MetadataErrorContext) {
    super(`${code}: ${context.pageId}/${context.namespace}/${context.key}`);
    this.name = "MetadataStoreError";
    this.code = code;
    this.pageId = context.pageId;
    this.namespace = context.namespace;
    this.key = context.key;
    this.metadataId = context.metadataId;
  }
}

export type SetMetadataInput = {
  pageId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
  sourcePluginId: string;
};

export type ListMetadataOptions = {
  pageId?: string;
  namespace?: string;
  key?: string;
};

export type MetadataStore = {
  set(input: SetMetadataInput): MetadataRecord;
  get(pageId: string, namespace: string, key: string): MetadataRecord;
  list(options?: ListMetadataOptions): MetadataRecord[];
  delete(pageId: string, namespace: string, key: string): MetadataRecord;
};

export type CreateInMemoryMetadataStoreOptions = {
  createId?: () => string;
  now?: () => string;
};

type MetadataIdentity = Pick<MetadataRecord, "pageId" | "namespace" | "key">;

type MetadataIndex = Map<string, Map<string, Map<string, MetadataRecord>>>;

export function createInMemoryMetadataStore(
  options: CreateInMemoryMetadataStoreOptions = {},
): MetadataStore {
  const createId = options.createId ?? createDefaultId;
  const now = options.now ?? createCurrentInstant;
  const records: MetadataRecord[] = [];
  const recordsByIdentity: MetadataIndex = new Map();

  function requireRecord(identity: MetadataIdentity): MetadataRecord {
    const record = getIndexedRecord(recordsByIdentity, identity);

    if (record === undefined) {
      throw new MetadataStoreError("METADATA_NOT_FOUND", identity);
    }

    return record;
  }

  return {
    set(input) {
      const identity = normalizeIdentity(input);
      const sourcePluginId = normalizeSourcePluginId(input, identity);
      assertJsonCompatible(input.value, identity);
      assertValueMatchesType(input.value, input.valueType, identity);

      const storedValue = cloneForMetadata(identity, input.value);
      const current = getIndexedRecord(recordsByIdentity, identity);

      if (current !== undefined) {
        const next: MetadataRecord = {
          ...current,
          value: storedValue,
          valueType: input.valueType,
          sourcePluginId,
          updatedAt: now(),
        };
        const output = cloneRecord(next);
        const currentIndex = records.indexOf(current);

        records[currentIndex] = next;
        setIndexedRecord(recordsByIdentity, next);

        return output;
      }

      const metadataId = createId();

      if (records.some((record) => record.id === metadataId)) {
        throw new MetadataStoreError("METADATA_ID_COLLISION", {
          ...identity,
          metadataId,
        });
      }

      const instant = now();
      const record: MetadataRecord = {
        id: metadataId,
        ...identity,
        value: storedValue,
        valueType: input.valueType,
        sourcePluginId,
        createdAt: instant,
        updatedAt: instant,
      };
      const output = cloneRecord(record);

      records.push(record);
      setIndexedRecord(recordsByIdentity, record);

      return output;
    },

    get(pageId, namespace, key) {
      const identity = normalizeIdentity({ pageId, namespace, key });

      return cloneRecord(requireRecord(identity));
    },

    list(options = {}) {
      const filters = normalizeListOptions(options);

      return records
        .filter((record) => matchesFilters(record, filters))
        .map((record) => cloneRecord(record));
    },

    delete(pageId, namespace, key) {
      const identity = normalizeIdentity({ pageId, namespace, key });
      const record = requireRecord(identity);
      const output = cloneRecord(record);
      const recordIndex = records.indexOf(record);

      records.splice(recordIndex, 1);
      deleteIndexedRecord(recordsByIdentity, identity);

      return output;
    },
  };
}

function normalizeIdentity(input: MetadataIdentity): MetadataIdentity {
  const identity = {
    pageId: input.pageId,
    namespace: input.namespace,
    key: input.key,
  };

  if (
    identity.pageId.trim().length === 0 ||
    identity.namespace.trim().length === 0 ||
    identity.key.trim().length === 0
  ) {
    throw new MetadataStoreError("METADATA_IDENTITY_REQUIRED", input);
  }

  return identity;
}

function normalizeSourcePluginId(
  input: Pick<SetMetadataInput, "sourcePluginId">,
  identity: MetadataIdentity,
): string {
  const sourcePluginId = input.sourcePluginId.trim();

  if (sourcePluginId.length === 0) {
    throw new MetadataStoreError("METADATA_SOURCE_PLUGIN_REQUIRED", identity);
  }

  return sourcePluginId;
}

function normalizeListOptions(
  options: ListMetadataOptions,
): ListMetadataOptions {
  return {
    pageId:
      options.pageId === undefined
        ? undefined
        : normalizeFilter("pageId", options),
    namespace:
      options.namespace === undefined
        ? undefined
        : normalizeFilter("namespace", options),
    key:
      options.key === undefined ? undefined : normalizeFilter("key", options),
  };
}

function normalizeFilter(
  field: keyof MetadataIdentity,
  options: ListMetadataOptions,
): string {
  const value = options[field];

  if (value === undefined) {
    throw new MetadataStoreError("METADATA_IDENTITY_REQUIRED", {
      pageId: options.pageId ?? "",
      namespace: options.namespace ?? "",
      key: options.key ?? "",
    });
  }

  if (value.trim().length === 0) {
    throw new MetadataStoreError("METADATA_IDENTITY_REQUIRED", {
      pageId: options.pageId ?? "",
      namespace: options.namespace ?? "",
      key: options.key ?? "",
    });
  }

  return value;
}

function matchesFilters(
  record: MetadataRecord,
  filters: ListMetadataOptions,
): boolean {
  return (
    (filters.pageId === undefined || record.pageId === filters.pageId) &&
    (filters.namespace === undefined ||
      record.namespace === filters.namespace) &&
    (filters.key === undefined || record.key === filters.key)
  );
}

function getIndexedRecord(
  index: MetadataIndex,
  identity: MetadataIdentity,
): MetadataRecord | undefined {
  return index.get(identity.pageId)?.get(identity.namespace)?.get(identity.key);
}

function setIndexedRecord(index: MetadataIndex, record: MetadataRecord): void {
  let namespaces = index.get(record.pageId);

  if (namespaces === undefined) {
    namespaces = new Map();
    index.set(record.pageId, namespaces);
  }

  let keys = namespaces.get(record.namespace);

  if (keys === undefined) {
    keys = new Map();
    namespaces.set(record.namespace, keys);
  }

  keys.set(record.key, record);
}

function deleteIndexedRecord(
  index: MetadataIndex,
  identity: MetadataIdentity,
): void {
  const namespaces = index.get(identity.pageId);
  const keys = namespaces?.get(identity.namespace);

  keys?.delete(identity.key);

  if (keys?.size === 0) {
    namespaces?.delete(identity.namespace);
  }

  if (namespaces?.size === 0) {
    index.delete(identity.pageId);
  }
}

function assertJsonCompatible(
  value: unknown,
  identity: MetadataIdentity,
  seen: WeakSet<object> = new WeakSet(),
): asserts value is MetadataJsonValue {
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

  throw new MetadataStoreError("METADATA_VALUE_NOT_JSON_COMPATIBLE", identity);
}

function assertJsonArrayCompatible(
  value: unknown[],
  identity: MetadataIdentity,
  seen: WeakSet<object>,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new MetadataStoreError(
      "METADATA_VALUE_NOT_JSON_COMPATIBLE",
      identity,
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    if (propertyName === "length") {
      continue;
    }

    if (!isValidPresentArrayIndexProperty(value, propertyName)) {
      throw new MetadataStoreError(
        "METADATA_VALUE_NOT_JSON_COMPATIBLE",
        identity,
      );
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new MetadataStoreError(
        "METADATA_VALUE_NOT_JSON_COMPATIBLE",
        identity,
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
  identity: MetadataIdentity,
  seen: WeakSet<object>,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new MetadataStoreError(
      "METADATA_VALUE_NOT_JSON_COMPATIBLE",
      identity,
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

function assertValueMatchesType(
  value: MetadataJsonValue,
  valueType: MetadataValueType,
  identity: MetadataIdentity,
): void {
  if (valueType === "string" && typeof value === "string") {
    return;
  }

  if (valueType === "number" && typeof value === "number") {
    return;
  }

  if (valueType === "boolean" && typeof value === "boolean") {
    return;
  }

  if (valueType === "null" && value === null) {
    return;
  }

  if (valueType === "date" && typeof value === "string") {
    return;
  }

  if (valueType === "json" && typeof value === "object" && value !== null) {
    return;
  }

  throw new MetadataStoreError("METADATA_VALUE_TYPE_MISMATCH", identity);
}

function cloneRecord(record: MetadataRecord): MetadataRecord {
  return cloneForMetadata(record, record);
}

function cloneForMetadata<T>(identity: MetadataIdentity, value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new MetadataStoreError("METADATA_CLONE_FAILED", identity);
  }
}

function createDefaultId(): string {
  const cryptoSource = globalThis.crypto;
  const randomUuid = cryptoSource?.randomUUID?.();

  if (randomUuid !== undefined) {
    return `metadata_${randomUuid}`;
  }

  if (cryptoSource?.getRandomValues === undefined) {
    throw new Error(
      "Unable to create a default metadata id: Web Crypto is absent",
    );
  }

  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);

  return `metadata_${bytesToHex(bytes)}`;
}

function createCurrentInstant(): string {
  return new Date().toISOString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

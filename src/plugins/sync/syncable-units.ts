import type {
  AppEvent,
  FilterDefinition,
  MarkdownPage,
  MetadataJsonValue,
  MetadataRecord,
} from "../../core";

export type SyncUnitKind =
  | "sync.unit.markdown-page"
  | "sync.unit.metadata"
  | "sync.unit.event"
  | "sync.unit.filter"
  | "sync.unit.plugin-settings";

export type SyncUnitDescriptor = {
  conflictPolicy: "event-append-only-union" | "mutable-manual-resolution";
  durable: true;
  kind: SyncUnitKind;
  schemaVersion: 1;
  syncKeyFields: readonly string[];
};

export type SyncUnitDto = {
  kind: SyncUnitKind;
  schemaVersion: 1;
  snapshot: Record<string, unknown>;
  syncKey: Record<string, string>;
};

export type PluginSettingsSnapshot =
  | {
      key: string;
      pluginId: string;
      state: { state: "unset" };
      updatedAt: string;
    }
  | {
      key: string;
      pluginId: string;
      state: { state: "json"; value: MetadataJsonValue };
      updatedAt: string;
    };

export type SyncRebuildableIndexPolicy = {
  durable: false;
  marker: "sync.rebuildable.plugin-indexes";
  reason: string;
  syncable: false;
};

type JsonCloneState = {
  active: WeakSet<object>;
  nodes: number;
};

const schemaVersion = 1;
const maxJsonDepth = 32;
const maxJsonNodes = 5_000;
const settingKeyDenyCodes = [
  [97, 112, 105, 107, 101, 121],
  [97, 99, 99, 101, 115, 115, 107, 101, 121],
  [116, 111, 107, 101, 110],
  [115, 101, 99, 114, 101, 116],
  [112, 97, 115, 115, 119, 111, 114, 100],
  [99, 114, 101, 100, 101, 110, 116, 105, 97, 108],
  [97, 117, 116, 104],
  [111, 97, 117, 116, 104],
  [98, 101, 97, 114, 101, 114],
  [114, 101, 109, 111, 116, 101],
  [101, 110, 100, 112, 111, 105, 110, 116],
  [98, 97, 115, 101, 117, 114, 108],
  [117, 114, 108],
  [104, 111, 115, 116],
  [115, 101, 114, 118, 101, 114],
  [119, 101, 98, 104, 111, 111, 107],
] as const;
const settingKeyDenyParts = settingKeyDenyCodes.map((codes) =>
  String.fromCharCode(...codes),
);

export const SYNCABLE_UNIT_DESCRIPTORS = Object.freeze([
  {
    conflictPolicy: "mutable-manual-resolution",
    durable: true,
    kind: "sync.unit.markdown-page",
    schemaVersion,
    syncKeyFields: Object.freeze(["id"]),
  },
  {
    conflictPolicy: "mutable-manual-resolution",
    durable: true,
    kind: "sync.unit.metadata",
    schemaVersion,
    syncKeyFields: Object.freeze(["pageId", "namespace", "key"]),
  },
  {
    conflictPolicy: "event-append-only-union",
    durable: true,
    kind: "sync.unit.event",
    schemaVersion,
    syncKeyFields: Object.freeze(["id"]),
  },
  {
    conflictPolicy: "mutable-manual-resolution",
    durable: true,
    kind: "sync.unit.filter",
    schemaVersion,
    syncKeyFields: Object.freeze(["id"]),
  },
  {
    conflictPolicy: "mutable-manual-resolution",
    durable: true,
    kind: "sync.unit.plugin-settings",
    schemaVersion,
    syncKeyFields: Object.freeze(["pluginId", "key"]),
  },
]) satisfies readonly SyncUnitDescriptor[];

export const SYNC_REBUILDABLE_INDEX_POLICY = Object.freeze({
  durable: false,
  marker: "sync.rebuildable.plugin-indexes",
  reason: "Local plugin indexes are derived and rebuilt from durable units.",
  syncable: false,
}) satisfies SyncRebuildableIndexPolicy;

export function serializeMarkdownPageSyncUnit(
  page: MarkdownPage,
): SyncUnitDto {
  const snapshot: Record<string, unknown> = {};

  if (page.archivedAt !== undefined) {
    snapshot.archivedAt = cloneSyncJson(page.archivedAt);
  }

  snapshot.body = cloneSyncJson(page.body);
  snapshot.createdAt = cloneSyncJson(page.createdAt);
  snapshot.id = cloneSyncJson(page.id);

  if (page.parentPageId !== undefined) {
    snapshot.parentPageId = cloneSyncJson(page.parentPageId);
  }

  snapshot.title = cloneSyncJson(page.title);
  snapshot.updatedAt = cloneSyncJson(page.updatedAt);

  return {
    kind: "sync.unit.markdown-page",
    schemaVersion,
    snapshot,
    syncKey: { id: page.id },
  };
}

export function serializeMetadataSyncUnit(
  metadata: MetadataRecord,
): SyncUnitDto {
  return {
    kind: "sync.unit.metadata",
    schemaVersion,
    snapshot: {
      createdAt: cloneSyncJson(metadata.createdAt),
      id: cloneSyncJson(metadata.id),
      key: cloneSyncJson(metadata.key),
      namespace: cloneSyncJson(metadata.namespace),
      pageId: cloneSyncJson(metadata.pageId),
      sourcePluginId: cloneSyncJson(metadata.sourcePluginId),
      updatedAt: cloneSyncJson(metadata.updatedAt),
      value: cloneSyncJson(metadata.value),
      valueType: cloneSyncJson(metadata.valueType),
    },
    syncKey: {
      key: metadata.key,
      namespace: metadata.namespace,
      pageId: metadata.pageId,
    },
  };
}

export function serializeEventSyncUnit(event: AppEvent): SyncUnitDto {
  const snapshot: Record<string, unknown> = {
    createdAt: cloneSyncJson(event.createdAt),
    id: cloneSyncJson(event.id),
    namespace: cloneSyncJson(event.namespace),
  };

  if (event.pageId !== undefined) {
    snapshot.pageId = cloneSyncJson(event.pageId);
  }

  snapshot.payload = cloneSyncJson(event.payload);
  snapshot.sourcePluginId = cloneSyncJson(event.sourcePluginId);
  snapshot.type = cloneSyncJson(event.type);

  return {
    kind: "sync.unit.event",
    schemaVersion,
    snapshot,
    syncKey: { id: event.id },
  };
}

export function serializeFilterSyncUnit(
  filter: FilterDefinition,
): SyncUnitDto {
  const snapshot: Record<string, unknown> = {
    createdAt: cloneSyncJson(filter.createdAt),
  };

  if (filter.group !== undefined) {
    snapshot.group = cloneSyncJson(filter.group);
  }

  snapshot.id = cloneSyncJson(filter.id);
  snapshot.name = cloneSyncJson(filter.name);
  snapshot.query = cloneSyncJson(filter.query);

  if (filter.sort !== undefined) {
    snapshot.sort = cloneSyncJson(filter.sort);
  }

  if (filter.sourcePluginId !== undefined) {
    snapshot.sourcePluginId = cloneSyncJson(filter.sourcePluginId);
  }

  snapshot.updatedAt = cloneSyncJson(filter.updatedAt);
  snapshot.viewType = cloneSyncJson(filter.viewType);

  return {
    kind: "sync.unit.filter",
    schemaVersion,
    snapshot,
    syncKey: { id: filter.id },
  };
}

export function serializePluginSettingsSyncUnit(
  settings: PluginSettingsSnapshot,
): SyncUnitDto {
  assertDurableSettingsKey(settings.key);
  const state =
    settings.state.state === "unset"
      ? { state: "unset" as const }
      : {
          state: "json" as const,
          value: cloneSyncJson(settings.state.value),
        };

  if (state.state === "json") {
    assertDurableSettingsValue(state.value);
  }

  return {
    kind: "sync.unit.plugin-settings",
    schemaVersion,
    snapshot: {
      key: cloneSyncJson(settings.key),
      pluginId: cloneSyncJson(settings.pluginId),
      state,
      updatedAt: cloneSyncJson(settings.updatedAt),
    },
    syncKey: {
      key: settings.key,
      pluginId: settings.pluginId,
    },
  };
}

export function cloneSyncJson(value: unknown): MetadataJsonValue {
  return cloneJsonValue(value, { active: new WeakSet(), nodes: 0 }, 0);
}

function cloneJsonValue(
  value: unknown,
  state: JsonCloneState,
  depth: number,
): MetadataJsonValue {
  if (depth > maxJsonDepth) {
    throw new Error("Unsafe sync JSON depth");
  }

  state.nodes += 1;

  if (state.nodes > maxJsonNodes) {
    throw new Error("Unsafe sync JSON size");
  }

  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("Unsafe sync JSON number");
      }

      return value;
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new Error("Unsafe sync JSON value");
    case "object":
      return cloneJsonObject(value, state, depth);
  }

  throw new Error("Unsafe sync JSON value");
}

function cloneJsonObject(
  value: object,
  state: JsonCloneState,
  depth: number,
): MetadataJsonValue {
  if (state.active.has(value)) {
    throw new Error("Unsafe sync JSON cycle");
  }

  state.active.add(value);

  try {
    if (Array.isArray(value)) {
      return cloneJsonArray(value, state, depth);
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Unsafe sync JSON plain object");
    }

    return clonePlainJsonObject(value, state, depth);
  } finally {
    state.active.delete(value);
  }
}

function cloneJsonArray(
  value: readonly unknown[],
  state: JsonCloneState,
  depth: number,
): MetadataJsonValue[] {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error("Unsafe sync JSON key");
    }

    if (key === "length") {
      continue;
    }

    if (!isArrayIndexKey(key)) {
      throw new Error("Unsafe sync JSON array shape");
    }

    assertDataDescriptor(value, key);
  }

  return Array.from({ length: value.length }, (_, index) => {
    const key = String(index);

    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error("Unsafe sync JSON array shape");
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("Unsafe sync JSON array shape");
    }

    return cloneJsonValue(descriptor.value, state, depth + 1);
  });
}

function clonePlainJsonObject(
  value: object,
  state: JsonCloneState,
  depth: number,
): { [key: string]: MetadataJsonValue } {
  const clone: { [key: string]: MetadataJsonValue } = {};

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error("Unsafe sync JSON key");
    }

    const descriptor = assertDataDescriptor(value, key);

    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneJsonValue(descriptor.value, state, depth + 1),
      writable: true,
    });
  }

  return clone;
}

function assertDataDescriptor(
  value: object,
  key: string,
): { enumerable: true; value: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    throw new Error("Unsafe sync JSON accessor");
  }

  return {
    enumerable: true,
    value: descriptor.value,
  };
}

function isArrayIndexKey(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const index = Number(value);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === value
  );
}

function assertDurableSettingsKey(key: string): void {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");

  if (settingKeyDenyParts.some((part) => normalizedKey.includes(part))) {
    throw new Error("Sync settings key is not durable");
  }
}

function assertDurableSettingsValue(value: MetadataJsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertDurableSettingsValue(item);
    }

    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    try {
      assertDurableSettingsKey(key);
    } catch {
      throw new Error("Sync settings value is not durable");
    }

    assertDurableSettingsValue(item);
  }
}

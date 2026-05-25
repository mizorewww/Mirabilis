import {
  cloneSyncJson,
  type SyncUnitDto,
  type SyncUnitKind,
} from "./syncable-units";

export type SyncConflictPolicy = {
  deferred: readonly ["tombstones", "deletes", "conflict-ui"];
  eventUnits: {
    appendOnly: true;
    distinctId: "union";
    identicalDuplicate: "dedupe";
    sameIdDifferentContent: "manual-resolution";
  };
  mutableUnits: {
    divergentEdits: "manual-resolution";
  };
};

type MutableConflictInput = {
  unitKind: Exclude<SyncUnitKind, "sync.unit.event">;
};

type EventConflictInput = {
  local: readonly unknown[];
  remote: readonly unknown[];
  unitKind: "sync.unit.event";
};

type EventMergeConflict = {
  id: string;
  local: SyncUnitDto;
  reason: "same-id-different-content";
  remote: SyncUnitDto;
};

type ValidatedEventUnit = {
  id: string;
  unit: SyncUnitDto;
};

const mutableUnitKinds = new Set<MutableConflictInput["unitKind"]>([
  "sync.unit.markdown-page",
  "sync.unit.metadata",
  "sync.unit.filter",
  "sync.unit.plugin-settings",
]);

export const SYNC_CONFLICT_POLICY = Object.freeze({
  deferred: Object.freeze(["tombstones", "deletes", "conflict-ui"] as const),
  eventUnits: Object.freeze({
    appendOnly: true,
    distinctId: "union",
    identicalDuplicate: "dedupe",
    sameIdDifferentContent: "manual-resolution",
  }),
  mutableUnits: Object.freeze({
    divergentEdits: "manual-resolution",
  }),
}) satisfies SyncConflictPolicy;

export function resolveSyncUnitConflict(input: unknown): unknown {
  if (!isRecord(input)) {
    throw new Error("Invalid sync conflict input");
  }

  const unitKind = readDataProperty(input, "unitKind");

  if (typeof unitKind !== "string") {
    throw new Error("Invalid sync conflict input");
  }

  if (unitKind === "sync.unit.event") {
    return resolveEventConflict({
      local: readUnitArray(readDataProperty(input, "local")),
      remote: readUnitArray(readDataProperty(input, "remote")),
      unitKind,
    });
  }

  if (!isMutableUnitKind(unitKind)) {
    throw new Error("Unsupported sync unit kind");
  }

  return resolveMutableConflict({
    unitKind,
  });
}

function resolveMutableConflict(input: MutableConflictInput): {
  outcome: "manual-resolution-required";
  reason: "mutable-unit-divergence";
  unitKind: MutableConflictInput["unitKind"];
} {
  return {
    outcome: "manual-resolution-required",
    reason: "mutable-unit-divergence",
    unitKind: input.unitKind,
  };
}

function resolveEventConflict(input: EventConflictInput): {
  conflicts: EventMergeConflict[];
  outcome: "manual-resolution-required" | "merged";
  reason?: "event-id-content-conflict";
  unitKind: "sync.unit.event";
  units: SyncUnitDto[];
} {
  const unitsById = new Map<string, SyncUnitDto>();
  const conflicts: EventMergeConflict[] = [];

  for (const { id, unit } of validateEventUnits(input)) {
    const existing = unitsById.get(id);

    if (existing === undefined) {
      unitsById.set(id, unit);
      continue;
    }

    if (syncUnitsMatch(existing, unit)) {
      continue;
    }

    conflicts.push({
      id,
      local: existing,
      reason: "same-id-different-content",
      remote: unit,
    });
  }

  if (conflicts.length > 0) {
    return {
      conflicts,
      outcome: "manual-resolution-required",
      reason: "event-id-content-conflict",
      unitKind: input.unitKind,
      units: [],
    };
  }

  return {
    conflicts: [],
    outcome: "merged",
    unitKind: input.unitKind,
    units: [...unitsById.values()],
  };
}

function readUnitArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid sync conflict unit list");
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new Error("Invalid sync conflict unit list");
    }

    if (key === "length") {
      continue;
    }

    if (!isArrayIndexKey(key)) {
      throw new Error("Invalid sync conflict unit list");
    }
  }

  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      throw new Error("Invalid sync conflict unit list");
    }

    return descriptor.value;
  });
}

function validateEventUnits(input: EventConflictInput): ValidatedEventUnit[] {
  return [...input.local, ...input.remote].map((unit) =>
    validateEventUnit(unit),
  );
}

function validateEventUnit(unit: unknown): ValidatedEventUnit {
  if (!isRecord(unit)) {
    throw new Error("Invalid sync event unit shape");
  }

  assertExactDataKeys(
    unit,
    ["kind", "schemaVersion", "snapshot", "syncKey"],
    "Invalid sync event unit shape",
  );

  const kind = readDataProperty(unit, "kind");

  if (kind !== "sync.unit.event") {
    throw new Error("Invalid sync event unit kind");
  }

  const schemaVersion = readDataProperty(unit, "schemaVersion");

  if (schemaVersion !== 1) {
    throw new Error("Invalid sync event unit schema");
  }

  const snapshot = readDataProperty(unit, "snapshot");

  if (!isRecord(snapshot)) {
    throw new Error("Invalid sync event unit snapshot");
  }

  cloneSyncJson(snapshot);

  const syncKey = readDataProperty(unit, "syncKey");

  if (!isRecord(syncKey)) {
    throw new Error("Invalid sync event unit sync key");
  }

  assertExactDataKeys(syncKey, ["id"], "Invalid sync event unit sync key");

  const id = readDataProperty(syncKey, "id");

  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Invalid sync event unit id");
  }

  const snapshotId = readDataProperty(snapshot, "id");

  if (snapshotId !== id) {
    throw new Error("Invalid sync event unit id");
  }

  return {
    id,
    unit: unit as SyncUnitDto,
  };
}

function syncUnitsMatch(left: SyncUnitDto, right: SyncUnitDto): boolean {
  return stableSyncJson(left) === stableSyncJson(right);
}

function stableSyncJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(cloneSyncJson(value)));
}

function sortJsonValue(value: ReturnType<typeof cloneSyncJson>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(sorted, key, {
        configurable: true,
        enumerable: true,
        value: sortJsonValue(value[key]),
        writable: true,
      });
    }

    return sorted;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readDataProperty(
  value: Record<string, unknown>,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    throw new Error("Invalid sync event unit accessor");
  }

  return descriptor.value;
}

function assertExactDataKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  message: string,
): void {
  const expected = new Set(expectedKeys);
  const actual = Reflect.ownKeys(value);

  if (actual.length !== expected.size) {
    throw new Error(message);
  }

  for (const key of actual) {
    if (typeof key !== "string" || !expected.has(key)) {
      throw new Error(message);
    }

    readDataProperty(value, key);
  }
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

function isMutableUnitKind(
  unitKind: string,
): unitKind is MutableConflictInput["unitKind"] {
  return mutableUnitKinds.has(unitKind as MutableConflictInput["unitKind"]);
}

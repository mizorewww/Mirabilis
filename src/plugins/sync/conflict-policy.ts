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
  local: readonly SyncUnitDto[];
  remote: readonly SyncUnitDto[];
  unitKind: "sync.unit.event";
};

type EventMergeConflict = {
  id: string;
  local: SyncUnitDto;
  reason: "same-id-different-content";
  remote: SyncUnitDto;
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
  if (!isRecord(input) || typeof input.unitKind !== "string") {
    throw new Error("Invalid sync conflict input");
  }

  if (input.unitKind === "sync.unit.event") {
    return resolveEventConflict({
      local: readUnitArray(input.local),
      remote: readUnitArray(input.remote),
      unitKind: input.unitKind,
    });
  }

  if (!isMutableUnitKind(input.unitKind)) {
    throw new Error("Unsupported sync unit kind");
  }

  return resolveMutableConflict({
    unitKind: input.unitKind,
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

  for (const unit of [...input.local, ...input.remote]) {
    const id = readSyncUnitId(unit);
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

function readUnitArray(value: unknown): readonly SyncUnitDto[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid sync conflict unit list");
  }

  return value as readonly SyncUnitDto[];
}

function readSyncUnitId(unit: SyncUnitDto): string {
  const id = unit.syncKey.id;

  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Invalid sync event unit id");
  }

  return id;
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

function isMutableUnitKind(
  unitKind: string,
): unitKind is MutableConflictInput["unitKind"] {
  return mutableUnitKinds.has(unitKind as MutableConflictInput["unitKind"]);
}

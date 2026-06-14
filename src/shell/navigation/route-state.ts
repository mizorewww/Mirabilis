import type { MetadataJsonValue } from "../../core";

export const appShellRouteStateNamespace = "app-shell.navigation";
export const appShellRouteStateKey = "route-state";
export const appShellRouteStateOwner = "app-shell";
export const durableRouteStateVersion = 1;
export const maxDurableRecentPageIds = 8;

export type DurablePageRouteRole = "command-open" | "home" | "recent";

export type DurableFilterRouteRole =
  | "all-tasks"
  | "inbox"
  | "saved"
  | "today";

export type DurableActiveRoute =
  | {
      kind: "page";
      pageId: string;
      role: DurablePageRouteRole;
    }
  | {
      filterId: string;
      kind: "filter";
      role: DurableFilterRouteRole;
      routeToken?: string;
    };

export type DurableRouteState = {
  activeRoute?: DurableActiveRoute;
  homePageId: string;
  recentPageIds: string[];
  version: typeof durableRouteStateVersion;
};

const routeStateKeys = new Set([
  "activeRoute",
  "homePageId",
  "recentPageIds",
  "version",
]);
const activeRouteKeys = new Set([
  "filterId",
  "kind",
  "pageId",
  "role",
  "routeToken",
]);
const pageRouteKeys = new Set(["kind", "pageId", "role"]);
const filterRouteKeys = new Set(["filterId", "kind", "role", "routeToken"]);
const durablePageRouteRoles = new Set<string>([
  "command-open",
  "home",
  "recent",
]);
const durableFilterRouteRoles = new Set<string>([
  "all-tasks",
  "inbox",
  "saved",
  "today",
]);

export function createDurableRouteState({
  activeRoute,
  homePageId,
  recentPageIds,
}: {
  activeRoute?: DurableActiveRoute;
  homePageId: string;
  recentPageIds: readonly string[];
}): DurableRouteState {
  const clonedActiveRoute =
    activeRoute === undefined
      ? undefined
      : cloneDurableActiveRoute(activeRoute);

  return {
    ...(clonedActiveRoute === undefined ? {} : { activeRoute: clonedActiveRoute }),
    homePageId,
    recentPageIds: normalizeRecentPageIds(recentPageIds, homePageId),
    version: durableRouteStateVersion,
  };
}

export function readDurableRouteState(
  value: unknown,
): DurableRouteState | undefined {
  const record = readExactRecord(value, routeStateKeys);

  if (
    record === undefined ||
    record.version !== durableRouteStateVersion ||
    !isNonEmptyString(record.homePageId) ||
    !Array.isArray(record.recentPageIds)
  ) {
    return undefined;
  }

  const activeRoute =
    record.activeRoute === undefined
      ? undefined
      : readDurableActiveRoute(record.activeRoute);

  if (record.activeRoute !== undefined && activeRoute === undefined) {
    return undefined;
  }

  const recentPageIds = readRecentPageIdStrings(record.recentPageIds);

  if (recentPageIds === undefined) {
    return undefined;
  }

  return {
    ...(activeRoute === undefined ? {} : { activeRoute }),
    homePageId: record.homePageId,
    recentPageIds,
    version: durableRouteStateVersion,
  };
}

export function normalizeRecentPageIds(
  pageIds: readonly unknown[],
  homePageId: string,
): string[] {
  const safePageIds = readRecentPageIdStrings(pageIds);

  if (safePageIds === undefined) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const pageId of safePageIds) {
    if (pageId === homePageId || seen.has(pageId)) {
      continue;
    }

    seen.add(pageId);
    normalized.push(pageId);

    if (normalized.length >= maxDurableRecentPageIds) {
      break;
    }
  }

  return normalized;
}

export function stableRouteStateSignature(state: DurableRouteState): string {
  return JSON.stringify(state);
}

export function toMetadataJsonValue(
  state: DurableRouteState,
): MetadataJsonValue {
  return state as MetadataJsonValue;
}

function readDurableActiveRoute(
  value: unknown,
): DurableActiveRoute | undefined {
  const record = readExactRecord(value, activeRouteKeys);

  if (record === undefined) {
    return undefined;
  }

  const kind = readDataString(record, "kind");

  if (kind === "page") {
    const route = readExactRecord(record, pageRouteKeys);

    if (route === undefined) {
      return undefined;
    }

    const pageId = readDataString(route, "pageId");
    const role = readDataString(route, "role");

    return pageId !== undefined && isDurablePageRouteRole(role)
      ? {
          kind: "page",
          pageId,
          role,
        }
      : undefined;
  }

  if (kind === "filter") {
    const route = readExactRecord(record, filterRouteKeys);

    if (route === undefined) {
      return undefined;
    }

    const filterId = readDataString(route, "filterId");
    const role = readDataString(route, "role");
    const routeToken = readDataString(route, "routeToken");

    if (filterId === undefined || !isDurableFilterRouteRole(role)) {
      return undefined;
    }

    return {
      filterId,
      kind: "filter",
      role,
      ...(routeToken === undefined ? {} : { routeToken }),
    };
  }

  return undefined;
}

function cloneDurableActiveRoute(
  activeRoute: DurableActiveRoute,
): DurableActiveRoute | undefined {
  const record = readDataRecord(activeRoute);

  if (record === undefined || hasUnsafeExtraActiveRouteValues(record)) {
    return undefined;
  }

  const kind = readDataString(record, "kind");

  if (kind === "page") {
    const pageId = readDataString(record, "pageId");
    const role = readDataString(record, "role");

    return pageId !== undefined && isDurablePageRouteRole(role)
      ? {
          kind: "page",
          pageId,
          role,
        }
      : undefined;
  }

  if (kind !== "filter") {
    return undefined;
  }

  const filterId = readDataString(record, "filterId");
  const role = readDataString(record, "role");
  const routeToken = readDataString(record, "routeToken");

  if (
    filterId === undefined ||
    !isDurableFilterRouteRole(role)
  ) {
    return undefined;
  }

  return {
    filterId,
    kind: "filter",
    role,
    ...(routeToken === undefined ? {} : { routeToken }),
  };
}

function readDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];

  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return undefined;
  }

  if (prototype !== Object.prototype) {
    return undefined;
  }

  const record = Object.create(null) as Record<string, unknown>;

  for (const key of ownKeys) {
    if (typeof key !== "string") {
      return undefined;
    }

    let descriptor: PropertyDescriptor | undefined;

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return undefined;
    }

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return undefined;
    }

    record[key] = descriptor.value;
  }

  return record;
}

function hasUnsafeExtraActiveRouteValues(
  record: Record<string, unknown>,
): boolean {
  return Object.entries(record).some(([key, value]) => {
    if (activeRouteKeys.has(key)) {
      return false;
    }

    return (
      typeof value === "function" ||
      typeof value === "symbol" ||
      (typeof value === "object" && value !== null)
    );
  });
}

function readExactRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let prototype: object | null;
  let ownKeys: readonly PropertyKey[];

  try {
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return undefined;
  }

  if (
    prototype !== Object.prototype ||
    ownKeys.some((key) => typeof key !== "string" || !allowedKeys.has(key))
  ) {
    return undefined;
  }

  for (const key of ownKeys) {
    let descriptor: PropertyDescriptor | undefined;

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return undefined;
    }

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      return undefined;
    }
  }

  return value;
}

function readDataString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return isNonEmptyString(value) ? value : undefined;
}

function readRecentPageIdStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  let lengthDescriptor: PropertyDescriptor | undefined;
  let ownKeys: readonly PropertyKey[];
  let prototype: object | null;

  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    ownKeys = Reflect.ownKeys(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    return undefined;
  }

  if (
    prototype !== Array.prototype ||
    lengthDescriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }

  const length = lengthDescriptor.value;

  if (
    ownKeys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "length" && !isArrayIndexKeyWithinLength(key, length)),
    )
  ) {
    return undefined;
  }

  const pageIds: string[] = [];

  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;

    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    } catch {
      return undefined;
    }

    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      !isNonEmptyString(descriptor.value)
    ) {
      return undefined;
    }

    pageIds.push(descriptor.value);
  }

  return pageIds;
}

function isArrayIndexKeyWithinLength(key: string, length: number): boolean {
  const index = Number(key);

  return (
    key === String(index) &&
    Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length
  );
}

function isDurablePageRouteRole(
  value: string | undefined,
): value is DurablePageRouteRole {
  return value !== undefined && durablePageRouteRoles.has(value);
}

function isDurableFilterRouteRole(
  value: string | undefined,
): value is DurableFilterRouteRole {
  return value !== undefined && durableFilterRouteRoles.has(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

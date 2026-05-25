import { createElement, type ComponentType } from "react";
import Stack from "@mui/material/Stack";

import type {
  AppRuntimeInfo,
  SlotContribution,
  SlotRegistry,
} from "../../core";
import { PluginRenderBoundary } from "./PluginRenderBoundary";

type SlotHostProps<SlotProps extends Record<string, unknown> = Record<string, unknown>> = {
  registry: SlotRegistry;
  slot: string;
  props?: SlotProps;
  actions?: HostActions;
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type ContributionProps = Record<string, unknown>;
type HostActions = Record<string, (...args: unknown[]) => unknown>;
type CloneBudget = {
  nodes: number;
};

const MAX_CLONE_DEPTH = 64;
const MAX_CLONE_NODES = 2_000;

export function SlotHost({
  registry,
  slot,
  props = {} as Record<string, unknown>,
  actions,
  app,
  isPluginAvailable,
}: SlotHostProps) {
  void app;

  const contributions = listContributions(registry, slot);

  return (
    <Stack spacing={1}>
      {contributions.map((contribution) => (
        <SlotContributionHost
          actions={actions}
          contribution={contribution}
          isPluginAvailable={isPluginAvailable}
          key={contribution.id}
          props={props}
        />
      ))}
    </Stack>
  );
}

function SlotContributionHost({
  actions,
  contribution,
  props,
  isPluginAvailable,
}: {
  actions?: HostActions;
  contribution: SlotContribution;
  props: Record<string, unknown>;
  isPluginAvailable?: (pluginId: string) => boolean;
}) {
  if (!isAvailable(contribution.pluginId, isPluginAvailable)) {
    return null;
  }

  const controlledProps = createContributionProps(props, actions);

  if (controlledProps === undefined) {
    return null;
  }

  const condition = contribution.when;

  if (condition !== undefined) {
    if (typeof condition !== "function") {
      return null;
    }

    try {
      if (condition(controlledProps) !== true) {
        return null;
      }
    } catch {
      return null;
    }
  }

  const component = contribution.component as ComponentType<ContributionProps>;
  const resetKey = createResetKey(contribution.id, controlledProps);

  return (
    <PluginRenderBoundary
      fallbackLabel="Slot contribution unavailable"
      fallbackText="Contribution unavailable"
      key={resetKey}
      resetKey={resetKey}
    >
      {createElement(component, controlledProps)}
    </PluginRenderBoundary>
  );
}

function listContributions(
  registry: SlotRegistry,
  slot: string,
): SlotContribution[] {
  try {
    return registry.list({ slot });
  } catch {
    return [];
  }
}

function isAvailable(
  pluginId: string,
  isPluginAvailable: ((pluginId: string) => boolean) | undefined,
): boolean {
  if (isPluginAvailable === undefined) {
    return true;
  }

  try {
    return isPluginAvailable(pluginId) === true;
  } catch {
    return false;
  }
}

function createContributionProps(
  props: Record<string, unknown>,
  actions: HostActions | undefined,
): ContributionProps | undefined {
  const clonedProps = cloneControlledProps(props, actions);

  if (clonedProps === undefined) {
    return undefined;
  }

  return Object.freeze(clonedProps);
}

function cloneControlledProps(
  props: Record<string, unknown>,
  actions: HostActions | undefined,
): ContributionProps | undefined {
  if (!isPlainRecord(props)) {
    return undefined;
  }

  const keys = safeKeys(props);

  if (keys === undefined) {
    return undefined;
  }

  const output: ContributionProps = {};

  for (const key of keys) {
    if (isHardBlockedKey(key)) {
      return undefined;
    }

    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = safeDescriptor(props, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
    }

    if (typeof descriptor.value === "function") {
      continue;
    }

    const actionWrapper = createHostActionWrapper(descriptor.value, actions);

    if (actionWrapper !== undefined) {
      setSafeRecordValue(output, key, actionWrapper);
      continue;
    }

    if (readHostActionId(descriptor.value) !== undefined) {
      continue;
    }

    const clonedValue = cloneControlledValue(descriptor.value);

    if (clonedValue !== undefined) {
      setSafeRecordValue(output, key, clonedValue);
    } else if (isObjectLikeValue(descriptor.value)) {
      return undefined;
    }
  }

  return output;
}

function cloneControlledValue(value: unknown): unknown | undefined {
  const seen = new WeakSet<object>();
  const budget = createCloneBudget();

  return cloneControlledValueInner(value, seen, budget, 0);
}

function cloneControlledValueInner(
  value: unknown,
  seen: WeakSet<object>,
  budget: CloneBudget,
  depth: number,
): unknown | undefined {
  if (typeof value === "function") {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (!consumeCloneNode(budget) || depth > MAX_CLONE_DEPTH) {
    return undefined;
  }

  if (typeof value !== "object" || seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const length = safeArrayLength(value);
    const keys = safeKeys(value);

    if (length === undefined || keys === undefined) {
      seen.delete(value);

      return undefined;
    }

    for (const key of keys) {
      if (!isArrayIndexKey(key, length)) {
        seen.delete(value);

        return undefined;
      }
    }

    const output: unknown[] = [];

    for (let index = 0; index < length; index += 1) {
      const descriptor = safeDescriptor(value, String(index));

      if (!isReadableDataDescriptor(descriptor)) {
        seen.delete(value);

        return undefined;
      }

      const clonedValue = cloneControlledValueInner(
        descriptor.value,
        seen,
        budget,
        depth + 1,
      );

      if (clonedValue === undefined) {
        seen.delete(value);

        return undefined;
      }

      output.push(clonedValue);
    }

    seen.delete(value);

    return Object.freeze(output);
  }

  if (!isPlainRecord(value)) {
    seen.delete(value);

    return undefined;
  }

  const keys = safeKeys(value);

  if (keys === undefined) {
    seen.delete(value);

    return undefined;
  }

  const output: ContributionProps = {};

  for (const key of keys) {
    if (isHardBlockedKey(key)) {
      seen.delete(value);

      return undefined;
    }

    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = safeDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
      seen.delete(value);

      return undefined;
    }

    if (readHostActionId(descriptor.value) !== undefined) {
      continue;
    }

    const clonedValue = cloneControlledValueInner(
      descriptor.value,
      seen,
      budget,
      depth + 1,
    );

    if (clonedValue !== undefined) {
      setSafeRecordValue(output, key, clonedValue);
    } else if (isObjectLikeValue(descriptor.value)) {
      seen.delete(value);

      return undefined;
    }
  }

  seen.delete(value);

  return Object.freeze(output);
}

function isReadableDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return (
    descriptor !== undefined &&
    !("get" in descriptor) &&
    !("set" in descriptor) &&
    descriptor.enumerable === true
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = safePrototype(value);

  return prototype === Object.prototype || prototype === null;
}

function createResetKey(ownerId: string, value: unknown): string {
  let hash = 2_166_136_261;
  const seen = new WeakSet<object>();
  let remainingNodes = MAX_CLONE_NODES;

  function write(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }

  function visit(input: unknown, depth = 0): void {
    if (input === null) {
      write("null");
      return;
    }

    switch (typeof input) {
      case "string":
        write(`str:${input}`);
        return;
      case "number":
        write(Number.isFinite(input) ? `num:${input}` : "num:invalid");
        return;
      case "boolean":
        write(`bool:${input ? "1" : "0"}`);
        return;
      case "function":
        write("fn");
        return;
      case "object":
        break;
      default:
        write("unknown");
        return;
    }

    if (seen.has(input)) {
      write("cycle");
      return;
    }

    remainingNodes -= 1;

    if (remainingNodes < 0 || depth > MAX_CLONE_DEPTH) {
      write("budget");
      return;
    }

    seen.add(input);

    if (Array.isArray(input)) {
      write("array[");

      for (const item of input) {
        visit(item, depth + 1);
        write(",");
      }

      write("]");
      seen.delete(input);
      return;
    }

    const keys = safeKeys(input)?.sort();

    if (keys === undefined) {
      write("invalid");
      seen.delete(input);
      return;
    }

    write("object{");

    for (const key of keys) {
      const descriptor = safeDescriptor(input, key);

      if (!isReadableDataDescriptor(descriptor)) {
        write(`${key}:invalid,`);
        continue;
      }

      write(`${key}:`);
      visit(descriptor.value, depth + 1);
      write(",");
    }

    write("}");
    seen.delete(input);
  }

  visit(value);

  return `${ownerId}:${(hash >>> 0).toString(36)}`;
}

function safePrototype(value: object): object | null | undefined {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    return undefined;
  }
}

function safeKeys(value: object): string[] | undefined {
  try {
    return Object.keys(value);
  } catch {
    return undefined;
  }
}

function safeDescriptor(
  value: object,
  key: string,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
}

function safeArrayLength(value: unknown[]): number | undefined {
  try {
    return value.length;
  } catch {
    return undefined;
  }
}

function isArrayIndexKey(key: string, length: number): boolean {
  const index = Number(key);

  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
}

function createCloneBudget(): CloneBudget {
  return {
    nodes: MAX_CLONE_NODES,
  };
}

function consumeCloneNode(budget: CloneBudget): boolean {
  budget.nodes -= 1;

  return budget.nodes >= 0;
}

function setSafeRecordValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function createHostActionWrapper(
  value: unknown,
  actions: HostActions | undefined,
): ((...args: unknown[]) => unknown) | undefined {
  const actionId = readHostActionId(value);

  if (actionId === undefined || actions === undefined || !isPlainRecord(actions)) {
    return undefined;
  }

  const descriptor = safeDescriptor(actions, actionId);

  if (!isReadableDataDescriptor(descriptor) || typeof descriptor.value !== "function") {
    return undefined;
  }

  const action = descriptor.value;

  return (...args: unknown[]) => action(...args);
}

function readHostActionId(value: unknown): string | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const kind = readDataProperty(value, "kind");
  const actionId = readDataProperty(value, "actionId");

  return kind === "host.action" && typeof actionId === "string" && actionId.length > 0
    ? actionId
    : undefined;
}

function readDataProperty(value: object, key: string): unknown {
  const descriptor = safeDescriptor(value, key);

  return isReadableDataDescriptor(descriptor) ? descriptor.value : undefined;
}

function isObjectLikeValue(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function isBlockedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/gu, "");
  const blockedKeys = new Set([
    "__proto__",
    "constructor",
    "prototype",
    "runtime",
    "stores",
    "registries",
    "services",
    "plugin" + "host",
    "native" + "bridge",
    "bridge",
    "invoke",
    "tauri",
    "db",
    "sqli" + "te",
    "storage",
    "filesystem",
    "file",
    "files",
    "fs",
    "path",
    "shell",
    "notification",
    "notifications",
    "shortcut",
    "shortcuts",
    "provider" + "settings",
    "openai" + "api" + "key",
    "auth" + "to" + "ken",
    "access" + "to" + "ken",
    "api" + "key",
    "se" + "cret",
    "se" + "crets",
    "se" + "cret" + "to" + "ken",
    "to" + "ken",
    "pass" + "word",
    "commands",
    "execute",
    "commandregistry",
    "register",
    "unregister",
  ]);

  return isHardBlockedKey(key) || blockedKeys.has(normalized);
}

function isHardBlockedKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  const normalized = lowerKey.replace(/[-_]/gu, "");

  return (
    lowerKey === "__proto__" ||
    normalized === "constructor" ||
    normalized === "prototype"
  );
}

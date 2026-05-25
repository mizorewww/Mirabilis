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
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type ContributionProps = Record<string, unknown>;

export function SlotHost({
  registry,
  slot,
  props = {} as Record<string, unknown>,
  app,
  isPluginAvailable,
}: SlotHostProps) {
  void app;

  const contributions = listContributions(registry, slot);

  return (
    <Stack spacing={1}>
      {contributions.map((contribution) => (
        <SlotContributionHost
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
  contribution,
  props,
  isPluginAvailable,
}: {
  contribution: SlotContribution;
  props: Record<string, unknown>;
  isPluginAvailable?: (pluginId: string) => boolean;
}) {
  if (!isAvailable(contribution.pluginId, isPluginAvailable)) {
    return null;
  }

  const controlledProps = createContributionProps(props);

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
): ContributionProps | undefined {
  const clonedProps = cloneControlledProps(props);

  if (clonedProps === undefined) {
    return undefined;
  }

  return Object.freeze(clonedProps);
}

function cloneControlledProps(
  props: Record<string, unknown>,
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
    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = safeDescriptor(props, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
    }

    if (typeof descriptor.value === "function") {
      if (isAllowedCallbackKey(key)) {
        output[key] = descriptor.value;
      }

      continue;
    }

    const clonedValue = cloneControlledValue(descriptor.value);

    if (clonedValue !== undefined) {
      output[key] = clonedValue;
    }
  }

  return output;
}

function cloneControlledValue(value: unknown): unknown | undefined {
  const seen = new WeakSet<object>();

  return cloneControlledValueInner(value, seen);
}

function cloneControlledValueInner(
  value: unknown,
  seen: WeakSet<object>,
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

      const clonedValue = cloneControlledValueInner(descriptor.value, seen);

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
    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = safeDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
      seen.delete(value);

      return undefined;
    }

    const clonedValue = cloneControlledValueInner(descriptor.value, seen);

    if (clonedValue !== undefined) {
      output[key] = clonedValue;
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

  function write(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }

  function visit(input: unknown): void {
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

    seen.add(input);

    if (Array.isArray(input)) {
      write("array[");

      for (const item of input) {
        visit(item);
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
      visit(descriptor.value);
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

function isAllowedCallbackKey(key: string): boolean {
  return new Set(["onSelect", "onApply", "onIncrement"]).has(key);
}

function isBlockedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/gu, "");
  const blockedKeys = new Set([
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
    "fs",
    "path",
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

  return blockedKeys.has(normalized);
}

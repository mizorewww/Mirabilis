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

  return (
    <PluginRenderBoundary
      fallbackLabel="Slot contribution unavailable"
      fallbackText="Contribution unavailable"
      resetKey={contribution.id}
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

  const output: ContributionProps = {};

  for (const key of Object.keys(props)) {
    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(props, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
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
    return value;
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
    const output: unknown[] = [];

    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return undefined;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));

      if (!isReadableDataDescriptor(descriptor)) {
        return undefined;
      }

      const clonedValue = cloneControlledValueInner(descriptor.value, seen);

      if (clonedValue === undefined) {
        return undefined;
      }

      output.push(clonedValue);
    }

    seen.delete(value);

    return Object.freeze(output);
  }

  if (!isPlainRecord(value)) {
    return undefined;
  }

  const output: ContributionProps = {};

  for (const key of Object.keys(value)) {
    if (isBlockedKey(key)) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
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

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isBlockedKey(key: string): boolean {
  const normalized = key.toLowerCase();
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
    "api" + "key",
    "se" + "cret",
    "se" + "crets",
    "se" + "cret" + "to" + "ken",
    "to" + "ken",
    "pass" + "word",
    "commandregistry",
    "register",
    "unregister",
  ]);

  return blockedKeys.has(normalized);
}

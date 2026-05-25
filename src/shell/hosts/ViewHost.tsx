import { createElement, type ComponentType } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import type {
  AppRuntimeInfo,
  ViewDefinition,
  ViewRegistry,
} from "../../core";
import { PluginRenderBoundary } from "./PluginRenderBoundary";

type ControlledCallbacks = Record<string, (...args: unknown[]) => unknown>;

type ViewHostProps = {
  registry: ViewRegistry;
  viewId?: string;
  viewType?: string;
  acceptedData?: unknown;
  state?: "ready" | "loading" | "empty" | "error";
  error?: unknown;
  callbacks?: ControlledCallbacks;
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type ViewComponentProps = {
  data: unknown;
  callbacks?: ControlledCallbacks;
  app?: AppRuntimeInfo;
};

export function ViewHost({
  registry,
  viewId,
  viewType,
  acceptedData,
  state = "ready",
  error,
  callbacks,
  app,
  isPluginAvailable,
}: ViewHostProps) {
  void error;

  if (state === "loading") {
    return (
      <Box aria-label="View loading" role="status">
        Loading view
      </Box>
    );
  }

  if (state === "empty") {
    return (
      <Box aria-label="View empty" role="status">
        Nothing to show
      </Box>
    );
  }

  if (state !== "ready") {
    return <ViewUnavailable />;
  }

  const view = resolveView(registry, { viewId, viewType });

  if (view === undefined || !isAvailable(view.pluginId, isPluginAvailable)) {
    return <ViewUnavailable />;
  }

  const expectedKind = readAcceptedKind(view);
  const clonedData = clonePlainValue(acceptedData);

  if (
    expectedKind === undefined ||
    clonedData === undefined ||
    !hasExactKind(clonedData, expectedKind)
  ) {
    return <ViewUnavailable />;
  }

  const controlledProps = freezePlainRecord<ViewComponentProps>({
    data: clonedData,
    ...(callbacks === undefined
      ? {}
      : { callbacks: freezeCallbacks(callbacks) }),
    ...(app === undefined ? {} : { app: cloneAppInfo(app) }),
  });
  const component = view.component as ComponentType<ViewComponentProps>;

  return (
    <PluginRenderBoundary fallbackLabel="View unavailable" resetKey={view.id}>
      {createElement(component, controlledProps)}
    </PluginRenderBoundary>
  );
}

function ViewUnavailable() {
  return (
    <Alert aria-label="View unavailable" severity="error">
      View unavailable
    </Alert>
  );
}

function resolveView(
  registry: ViewRegistry,
  {
    viewId,
    viewType,
  }: {
    viewId?: string;
    viewType?: string;
  },
): ViewDefinition | undefined {
  try {
    if (viewId !== undefined) {
      return registry.get(viewId);
    }

    if (viewType === undefined) {
      return undefined;
    }

    const matches = registry.list({ type: viewType });

    return matches.length === 1 ? matches[0] : undefined;
  } catch {
    return undefined;
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

function readAcceptedKind(view: ViewDefinition): string | undefined {
  const accepts = clonePlainValue(view.accepts);

  if (!isPlainRecord(accepts)) {
    return undefined;
  }

  const kind = accepts.kind;

  return typeof kind === "string" && kind.length > 0 ? kind : undefined;
}

function hasExactKind(value: unknown, expectedKind: string): boolean {
  return isPlainRecord(value) && value.kind === expectedKind;
}

function freezeCallbacks(callbacks: ControlledCallbacks): ControlledCallbacks {
  const clone: ControlledCallbacks = {};

  for (const key of Object.keys(callbacks)) {
    const value = callbacks[key];

    if (typeof value === "function" && !isBlockedKey(key)) {
      clone[key] = value;
    }
  }

  return Object.freeze(clone);
}

function cloneAppInfo(app: AppRuntimeInfo): AppRuntimeInfo {
  const version = readDataProperty(app, "version");
  const apiVersion = readDataProperty(app, "pluginApiVersion");

  return Object.freeze({
    version: typeof version === "string" ? version : "",
    ...(typeof apiVersion === "string" ? { pluginApiVersion: apiVersion } : {}),
  });
}

function clonePlainValue(value: unknown): unknown | undefined {
  const seen = new WeakSet<object>();

  return clonePlainValueInner(value, seen);
}

function clonePlainValueInner(
  value: unknown,
  seen: WeakSet<object>,
): unknown | undefined {
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

      const clonedValue = clonePlainValueInner(descriptor.value, seen);

      if (clonedValue === undefined) {
        return undefined;
      }

      output.push(clonedValue);
    }

    seen.delete(value);

    return deepFreeze(output);
  }

  if (!isPlainRecord(value)) {
    return undefined;
  }

  const output: Record<string, unknown> = {};

  for (const key of Object.keys(value)) {
    if (isBlockedKey(key)) {
      return undefined;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
    }

    const clonedValue = clonePlainValueInner(descriptor.value, seen);

    if (clonedValue === undefined) {
      return undefined;
    }

    output[key] = clonedValue;
  }

  seen.delete(value);

  return deepFreeze(output);
}

function readDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  return isReadableDataDescriptor(descriptor) ? descriptor.value : undefined;
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

function freezePlainRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.freeze(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
  }

  return value;
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

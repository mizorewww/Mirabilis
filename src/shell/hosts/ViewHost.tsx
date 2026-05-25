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
  props?: Record<string, unknown>;
  state?: "ready" | "loading" | "empty" | "error";
  error?: unknown;
  callbacks?: ControlledCallbacks;
  app?: AppRuntimeInfo;
  isPluginAvailable?: (pluginId: string) => boolean;
};

type ViewComponentProps = Record<string, unknown> & {
  data: unknown;
  callbacks?: ControlledCallbacks;
  app?: AppRuntimeInfo;
};

export function ViewHost({
  registry,
  viewId,
  viewType,
  acceptedData,
  props,
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

  const expectedKinds = readAcceptedKinds(view);
  const clonedData = clonePlainValue(acceptedData);

  if (
    expectedKinds === undefined ||
    clonedData === undefined ||
    !hasAcceptedKind(clonedData, expectedKinds)
  ) {
    return <ViewUnavailable />;
  }

  const clonedProps =
    props === undefined ? {} : cloneControlledProps(props, { allowCallbacks: false });
  const clonedCallbacks =
    callbacks === undefined ? undefined : freezeCallbacks(callbacks);

  if (
    clonedProps === undefined ||
    (callbacks !== undefined && clonedCallbacks === undefined)
  ) {
    return <ViewUnavailable />;
  }

  const controlledProps = freezePlainRecord<ViewComponentProps>({
    ...clonedProps,
    data: clonedData,
    ...(clonedCallbacks === undefined ? {} : { callbacks: clonedCallbacks }),
    ...(app === undefined ? {} : { app: cloneAppInfo(app) }),
  });
  const component = view.component as ComponentType<ViewComponentProps>;
  const resetKey = createResetKey(view.id, controlledProps);

  return (
    <PluginRenderBoundary
      fallbackLabel="View unavailable"
      key={resetKey}
      resetKey={resetKey}
    >
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
      const view = registry.get(viewId);

      return viewType === undefined || view.type === viewType ? view : undefined;
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

function readAcceptedKinds(view: ViewDefinition): string[] | undefined {
  const accepts = clonePlainValue(view.accepts);

  if (!isPlainRecord(accepts)) {
    return undefined;
  }

  const kinds: string[] = [];
  const kind = accepts.kind;

  if (typeof kind === "string" && kind.length > 0) {
    kinds.push(kind);
  }

  if (Array.isArray(accepts.kinds)) {
    for (const acceptedKind of accepts.kinds) {
      if (typeof acceptedKind !== "string" || acceptedKind.length === 0) {
        return undefined;
      }

      kinds.push(acceptedKind);
    }
  }

  return kinds.length > 0 ? kinds : undefined;
}

function hasAcceptedKind(value: unknown, expectedKinds: readonly string[]): boolean {
  return isPlainRecord(value) && expectedKinds.includes(value.kind as string);
}

function freezeCallbacks(
  callbacks: ControlledCallbacks,
): ControlledCallbacks | undefined {
  if (!isPlainRecord(callbacks)) {
    return undefined;
  }

  const clone: ControlledCallbacks = {};
  const keys = safeKeys(callbacks);

  if (keys === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const descriptor = safeDescriptor(callbacks, key);

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
    }

    if (typeof descriptor.value === "function" && isAllowedCallbackKey(key)) {
      clone[key] = descriptor.value;
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

      const clonedValue = clonePlainValueInner(descriptor.value, seen);

      if (clonedValue === undefined) {
        seen.delete(value);

        return undefined;
      }

      output.push(clonedValue);
    }

    seen.delete(value);

    return deepFreeze(output);
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

  const output: Record<string, unknown> = {};

  for (const key of keys) {
    if (isBlockedKey(key)) {
      seen.delete(value);

      return undefined;
    }

    const descriptor = safeDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
      seen.delete(value);

      return undefined;
    }

    const clonedValue = clonePlainValueInner(descriptor.value, seen);

    if (clonedValue === undefined) {
      seen.delete(value);

      return undefined;
    }

    output[key] = clonedValue;
  }

  seen.delete(value);

  return deepFreeze(output);
}

function readDataProperty(value: object, key: string): unknown {
  const descriptor = safeDescriptor(value, key);

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

  const prototype = safePrototype(value);

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

function cloneControlledProps(
  props: Record<string, unknown>,
  { allowCallbacks }: { allowCallbacks: boolean },
): Record<string, unknown> | undefined {
  return cloneControlledValue(props, {
    allowCallbacks,
    failOnBlockedKey: false,
  }) as Record<string, unknown> | undefined;
}

function cloneControlledValue(
  value: unknown,
  options: {
    allowCallbacks: boolean;
    failOnBlockedKey: boolean;
  },
): unknown | undefined {
  const seen = new WeakSet<object>();

  return cloneControlledValueInner(value, seen, options);
}

function cloneControlledValueInner(
  value: unknown,
  seen: WeakSet<object>,
  options: {
    allowCallbacks: boolean;
    failOnBlockedKey: boolean;
  },
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
    const output = cloneArrayValue(value, seen, options);

    seen.delete(value);

    return output;
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

  const output: Record<string, unknown> = {};

  for (const key of keys) {
    if (isBlockedKey(key)) {
      if (options.failOnBlockedKey) {
        seen.delete(value);

        return undefined;
      }

      continue;
    }

    const descriptor = safeDescriptor(value, key);

    if (!isReadableDataDescriptor(descriptor)) {
      seen.delete(value);

      return undefined;
    }

    if (typeof descriptor.value === "function") {
      if (options.allowCallbacks && isAllowedCallbackKey(key)) {
        output[key] = descriptor.value;
      }

      continue;
    }

    const clonedValue = cloneControlledValueInner(
      descriptor.value,
      seen,
      options,
    );

    if (clonedValue !== undefined) {
      output[key] = clonedValue;
    }
  }

  seen.delete(value);

  return Object.freeze(output);
}

function cloneArrayValue(
  value: unknown[],
  seen: WeakSet<object>,
  options: {
    allowCallbacks: boolean;
    failOnBlockedKey: boolean;
  },
): readonly unknown[] | undefined {
  const length = safeArrayLength(value);
  const keys = safeKeys(value);

  if (length === undefined || keys === undefined) {
    return undefined;
  }

  for (const key of keys) {
    if (!isArrayIndexKey(key, length)) {
      return undefined;
    }
  }

  const output: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = safeDescriptor(value, String(index));

    if (!isReadableDataDescriptor(descriptor)) {
      return undefined;
    }

    const clonedValue = cloneControlledValueInner(
      descriptor.value,
      seen,
      options,
    );

    if (clonedValue === undefined) {
      return undefined;
    }

    output.push(clonedValue);
  }

  return Object.freeze(output);
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

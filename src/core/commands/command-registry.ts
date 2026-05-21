import type {
  CommandDefinition,
  CommandDescriptor,
  CommandHandler,
  CommandRegistryErrorCode,
  CommandService,
  ListCommandsOptions,
} from "../types";

class CommandRegistryErrorImpl extends Error {
  readonly code: CommandRegistryErrorCode;
  declare readonly cause?: unknown;

  constructor(
    code: CommandRegistryErrorCode,
    detail: string,
    options: { cause?: unknown } = {},
  ) {
    super(`${code}: ${detail}`);
    this.name = "CommandRegistryError";
    this.code = code;

    if ("cause" in options) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export const CommandRegistryError = CommandRegistryErrorImpl;

export type CommandRegistryError = {
  code: CommandRegistryErrorCode;
  cause?: unknown;
};

type StoredCommand = {
  descriptor: CommandDescriptor;
  handler: CommandHandler;
};

type OptionalPropertyRead =
  | {
      present: false;
    }
  | {
      present: true;
      value: unknown;
    };

type JsonCompatibilityValidationState = {
  seen: WeakSet<object>;
  visitedNodeCount: number;
};

const maxJsonContextDepth = 1_000;
const maxJsonContextNodes = 100_000;

export function createInMemoryCommandRegistry(): CommandService {
  const commands = new Map<string, StoredCommand>();

  function requireCommand(commandId: unknown): {
    commandId: string;
    command: StoredCommand;
  } {
    const normalizedCommandId = normalizeLookupCommandId(commandId);
    const command = commands.get(normalizedCommandId);

    if (command === undefined) {
      throw new CommandRegistryError(
        "COMMAND_NOT_FOUND",
        normalizedCommandId,
      );
    }

    return {
      commandId: normalizedCommandId,
      command,
    };
  }

  return {
    register(definition) {
      const id = readRequiredStringField(
        definition,
        "id",
        "COMMAND_IDENTITY_REQUIRED",
        "command id",
      );

      if (commands.has(id)) {
        throw new CommandRegistryError("COMMAND_ID_COLLISION", id);
      }

      const descriptor = createDescriptor(definition, id);
      const handler = readHandler(definition, id);
      const output = cloneDescriptor(descriptor);

      commands.set(id, {
        descriptor,
        handler: handler as CommandHandler,
      });

      return output;
    },

    get(commandId) {
      return cloneDescriptor(requireCommand(commandId).command.descriptor);
    },

    list(options = {}) {
      const filters = normalizeListOptions(options);

      return [...commands.values()]
        .filter((command) => matchesFilters(command.descriptor, filters))
        .map((command) => cloneDescriptor(command.descriptor));
    },

    unregister(commandId) {
      const { commandId: normalizedCommandId, command } =
        requireCommand(commandId);
      const output = cloneDescriptor(command.descriptor);

      commands.delete(normalizedCommandId);

      return output;
    },

    async execute(commandId, input) {
      const { commandId: normalizedCommandId, command } =
        requireCommand(commandId);
      const handler = command.handler;

      try {
        return await handler(input);
      } catch (cause) {
        throw new CommandRegistryError(
          "COMMAND_HANDLER_FAILED",
          normalizedCommandId,
          createHandlerFailureErrorOptions(cause),
        );
      }
    },
  };
}

function createHandlerFailureErrorOptions(
  cause: unknown,
): { cause?: unknown } {
  if (isPluginHostError(cause)) {
    return { cause };
  }

  return {};
}

function isPluginHostError(cause: unknown): boolean {
  return (
    isRecord(cause) &&
    cause.name === "PluginHostError" &&
    typeof cause.code === "string" &&
    typeof cause.pluginId === "string" &&
    typeof cause.phase === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDescriptor<Input, Output>(
  definition: CommandDefinition<Input, Output>,
  id: string,
): CommandDescriptor {
  const pluginId = readRequiredStringField(
    definition,
    "pluginId",
    "COMMAND_PLUGIN_ID_REQUIRED",
    "command pluginId",
  );
  const title = readRequiredStringField(
    definition,
    "title",
    "COMMAND_TITLE_REQUIRED",
    "command title",
  );
  const descriptor: CommandDescriptor = {
    id,
    pluginId,
    title,
  };
  const description = readOptionalProperty(
    definition,
    "description",
    "COMMAND_TITLE_REQUIRED",
    "command description",
  );
  const defaultShortcut = readOptionalProperty(
    definition,
    "defaultShortcut",
    "COMMAND_SHORTCUT_INVALID",
    "command defaultShortcut",
  );
  const context = readOptionalProperty(
    definition,
    "context",
    "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
    "command context",
  );

  if (description.present && description.value !== undefined) {
    if (typeof description.value !== "string") {
      throw new CommandRegistryError(
        "COMMAND_TITLE_REQUIRED",
        "command description",
      );
    }

    descriptor.description = description.value;
  }

  if (defaultShortcut.present && defaultShortcut.value !== undefined) {
    if (
      typeof defaultShortcut.value !== "string" ||
      defaultShortcut.value.trim().length === 0
    ) {
      throw new CommandRegistryError(
        "COMMAND_SHORTCUT_INVALID",
        "command defaultShortcut",
      );
    }

    descriptor.defaultShortcut = defaultShortcut.value;
  }

  if (context.present && context.value !== undefined) {
    assertJsonCompatibleContext(context.value);
    descriptor.context = cloneContext(context.value);
  }

  return descriptor;
}

function readRequiredStringField(
  definition: object,
  field: "id" | "pluginId" | "title",
  code: CommandRegistryErrorCode,
  detail: string,
): string {
  const value = readRequiredProperty(definition, field, code, detail);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CommandRegistryError(code, detail);
  }

  return value;
}

function readHandler<Input, Output>(
  definition: CommandDefinition<Input, Output>,
  detail: string,
): CommandHandler<Input, Output> {
  const handler = readRequiredProperty(
    definition,
    "handler",
    "COMMAND_HANDLER_REQUIRED",
    detail,
  );

  if (typeof handler !== "function") {
    throw new CommandRegistryError("COMMAND_HANDLER_REQUIRED", detail);
  }

  return handler as CommandHandler<Input, Output>;
}

function readRequiredProperty(
  input: object,
  field: string,
  code: CommandRegistryErrorCode,
  detail: string,
): unknown {
  const value = readOptionalProperty(input, field, code, detail);

  if (!value.present) {
    throw new CommandRegistryError(code, detail);
  }

  return value.value;
}

function readOptionalProperty(
  input: object,
  field: string,
  code: CommandRegistryErrorCode,
  detail: string,
): OptionalPropertyRead {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);

    if (descriptor === undefined) {
      return { present: false };
    }

    if (isAccessorDescriptor(descriptor)) {
      throw new CommandRegistryError(code, detail);
    }

    return {
      present: true,
      value: descriptor.value,
    };
  } catch (error) {
    if (error instanceof CommandRegistryError) {
      throw error;
    }

    throw new CommandRegistryError(code, detail);
  }
}

function normalizeLookupCommandId(commandId: unknown): string {
  if (typeof commandId !== "string" || commandId.trim().length === 0) {
    throw new CommandRegistryError("COMMAND_NOT_FOUND", "command id");
  }

  return commandId;
}

function normalizeListOptions(options: ListCommandsOptions): ListCommandsOptions {
  const pluginId = readOptionalProperty(
    options,
    "pluginId",
    "COMMAND_PLUGIN_ID_REQUIRED",
    "command list pluginId",
  );

  if (!pluginId.present) {
    return {};
  }

  if (typeof pluginId.value !== "string" || pluginId.value.trim().length === 0) {
    throw new CommandRegistryError(
      "COMMAND_PLUGIN_ID_REQUIRED",
      "command list pluginId",
    );
  }

  return {
    pluginId: pluginId.value,
  };
}

function matchesFilters(
  descriptor: CommandDescriptor,
  filters: ListCommandsOptions,
): boolean {
  return (
    filters.pluginId === undefined || descriptor.pluginId === filters.pluginId
  );
}

function cloneDescriptor(descriptor: CommandDescriptor): CommandDescriptor {
  const clone: CommandDescriptor = {
    id: descriptor.id,
    pluginId: descriptor.pluginId,
    title: descriptor.title,
  };

  if (descriptor.description !== undefined) {
    clone.description = descriptor.description;
  }

  if (descriptor.defaultShortcut !== undefined) {
    clone.defaultShortcut = descriptor.defaultShortcut;
  }

  if (descriptor.context !== undefined) {
    clone.context = cloneContext(descriptor.context);
  }

  return clone;
}

function assertJsonCompatibleContext(
  value: unknown,
  state: JsonCompatibilityValidationState = {
    seen: new WeakSet(),
    visitedNodeCount: 0,
  },
  depth = 0,
): void {
  try {
    assertJsonCompatibleContextValue(value, state, depth);
  } catch (error) {
    if (error instanceof CommandRegistryError) {
      throw error;
    }

    throw new CommandRegistryError(
      "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      "command context",
    );
  }
}

function assertJsonCompatibleContextValue(
  value: unknown,
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  assertJsonContextBudgetAvailable(state, depth);

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
      if (state.seen.has(value)) {
        break;
      }

      state.seen.add(value);

      try {
        if (Array.isArray(value)) {
          assertJsonArrayCompatible(value, state, depth);
          return;
        }

        if (isPlainObjectValue(value)) {
          assertJsonObjectCompatible(value, state, depth);
          return;
        }
      } finally {
        state.seen.delete(value);
      }

      break;
    default:
      break;
  }

  throw new CommandRegistryError(
    "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
    "command context",
  );
}

function assertJsonArrayCompatible(
  value: unknown[],
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CommandRegistryError(
      "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      "command context",
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    if (propertyName === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new CommandRegistryError(
        "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
        "command context",
      );
    }

    if (!isValidPresentArrayIndexProperty(value, propertyName)) {
      throw new CommandRegistryError(
        "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
        "command context",
      );
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new CommandRegistryError(
        "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
        "command context",
      );
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, index);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new CommandRegistryError(
        "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
        "command context",
      );
    }

    assertJsonCompatibleContext(descriptor.value, state, depth + 1);
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
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CommandRegistryError(
      "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      "command context",
    );
  }

  for (const propertyName of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, propertyName);

    if (
      descriptor === undefined ||
      isAccessorDescriptor(descriptor) ||
      !descriptor.enumerable
    ) {
      throw new CommandRegistryError(
        "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
        "command context",
      );
    }

    assertJsonCompatibleContext(descriptor.value, state, depth + 1);
  }
}

function assertJsonContextBudgetAvailable(
  state: JsonCompatibilityValidationState,
  depth: number,
): void {
  state.visitedNodeCount += 1;

  if (
    depth > maxJsonContextDepth ||
    state.visitedNodeCount > maxJsonContextNodes
  ) {
    throw new CommandRegistryError(
      "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      "command context",
    );
  }
}

function cloneContext<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    throw new CommandRegistryError(
      "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      "command context",
    );
  }
}

function isAccessorDescriptor(descriptor: PropertyDescriptor): boolean {
  return "get" in descriptor || "set" in descriptor;
}

function isPlainObjectValue(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

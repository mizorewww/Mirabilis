import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { CommandRegistryError, createInMemoryCommandRegistry } from "../core";
import {
  CommandRegistryError as CommandRegistryErrorFromCommands,
  createInMemoryCommandRegistry as createInMemoryCommandRegistryFromCommands,
} from "../core/commands";
import type {
  CommandBus,
  CommandDefinition,
  CommandDescriptor,
  CommandHandler,
  CommandRegistry,
  CommandRegistryErrorCode,
  CommandService,
} from "../core";
import type {
  CommandRegistry as CommandRegistryFromCommands,
  CommandRegistryErrorCode as CommandRegistryErrorCodeFromCommands,
  CommandService as CommandServiceFromCommands,
} from "../core/commands";

describe("in-memory Command Registry and Command Bus", () => {
  it("exports the public Command Registry API from Core entrypoints", () => {
    expect(createInMemoryCommandRegistry).toEqual(expect.any(Function));
    expect(createInMemoryCommandRegistryFromCommands).toBe(
      createInMemoryCommandRegistry,
    );
    expect(CommandRegistryError).toEqual(expect.any(Function));
    expect(CommandRegistryErrorFromCommands).toBe(CommandRegistryError);

    expectTypeOf<CommandRegistryFromCommands>().toEqualTypeOf<CommandRegistry>();
    expectTypeOf<CommandServiceFromCommands>().toEqualTypeOf<CommandService>();
    expectTypeOf<CommandRegistryErrorCodeFromCommands>().toEqualTypeOf<
      CommandRegistryErrorCode
    >();
    expectTypeOf<CommandHandler<{ value: string }, number>>().toEqualTypeOf<
      (input: { value: string }) => number | Promise<number>
    >();
    expectTypeOf<CommandDefinition<{ value: string }, number>>().toEqualTypeOf<{
      id: string;
      pluginId: string;
      title: string;
      description?: string;
      defaultShortcut?: string;
      context?: unknown;
      handler: CommandHandler<{ value: string }, number>;
    }>();
    expectTypeOf<CommandDescriptor>().toEqualTypeOf<{
      id: string;
      pluginId: string;
      title: string;
      description?: string;
      defaultShortcut?: string;
      context?: unknown;
    }>();
    expectTypeOf<CommandRegistry>().toEqualTypeOf<{
      register<Input = unknown, Output = unknown>(
        definition: CommandDefinition<Input, Output>,
      ): CommandDescriptor;
      get(commandId: string): CommandDescriptor;
      list(options?: { pluginId?: string }): CommandDescriptor[];
      unregister(commandId: string): CommandDescriptor;
    }>();
    expectTypeOf<CommandBus>().toEqualTypeOf<{
      execute(commandId: string, input?: unknown): Promise<unknown>;
    }>();
    expectTypeOf<CommandService>().toEqualTypeOf<CommandRegistry & CommandBus>();
    expectTypeOf<ReturnType<typeof createInMemoryCommandRegistry>>()
      .toEqualTypeOf<CommandService>();
    expectTypeOf<CommandRegistryError>().toMatchObjectType<{
      code: CommandRegistryErrorCode;
      cause?: unknown;
    }>();
    expectTypeOf<CommandRegistryErrorCode>().toEqualTypeOf<
      | "COMMAND_NOT_FOUND"
      | "COMMAND_ID_COLLISION"
      | "COMMAND_IDENTITY_REQUIRED"
      | "COMMAND_PLUGIN_ID_REQUIRED"
      | "COMMAND_TITLE_REQUIRED"
      | "COMMAND_HANDLER_REQUIRED"
      | "COMMAND_SHORTCUT_INVALID"
      | "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE"
      | "COMMAND_HANDLER_FAILED"
    >();
  });

  it("registers handler-free descriptors and lists them in registration order with exact plugin filters", () => {
    const commands = createInMemoryCommandRegistry();

    const alpha = commands.register(
      commandDefinition({
        id: "workspace.open-tools",
        pluginId: "workspace",
        title: "Open tools",
        description: "Open workspace tools",
        defaultShortcut: "Mod+Shift+O",
        context: { surface: "workspace" },
        handler: () => "opened",
      }),
    );
    const beta = commands.register(
      commandDefinition({
        id: "layout.toggle-density",
        pluginId: "layout",
        title: "Toggle density",
        handler: () => "toggled",
      }),
    );
    const gamma = commands.register(
      commandDefinition({
        id: "workspace.focus-search",
        pluginId: "workspace.extra",
        title: "Focus search",
        context: { surface: "search" },
        handler: () => "focused",
      }),
    );

    expect(alpha).toStrictEqual({
      id: "workspace.open-tools",
      pluginId: "workspace",
      title: "Open tools",
      description: "Open workspace tools",
      defaultShortcut: "Mod+Shift+O",
      context: { surface: "workspace" },
    });
    expect(beta).toStrictEqual({
      id: "layout.toggle-density",
      pluginId: "layout",
      title: "Toggle density",
    });
    expectNoHandler(alpha);
    expectNoHandler(beta);
    expectNoHandler(gamma);
    expect(commands.list()).toStrictEqual([alpha, beta, gamma]);
    expect(
      commands.list().map((command: CommandDescriptor) => command.id),
    ).toStrictEqual([
      "workspace.open-tools",
      "layout.toggle-density",
      "workspace.focus-search",
    ]);
    expect(commands.list({ pluginId: "workspace" })).toStrictEqual([alpha]);
    expect(commands.list({ pluginId: "workspace.extra" })).toStrictEqual([
      gamma,
    ]);
    expect(commands.list({ pluginId: "missing" })).toStrictEqual([]);
  });

  it("keeps descriptor handlers private and returns defensive metadata copies from every descriptor boundary", () => {
    const commands = createInMemoryCommandRegistry();
    const context = {
      surfaces: ["workspace"],
      availability: { panel: "closed" },
    };
    const registered = commands.register(
      commandDefinition({
        id: "workspace.toggle-panel",
        pluginId: "workspace",
        title: "Toggle panel",
        description: "Toggle workspace panel",
        defaultShortcut: "Mod+\\",
        context,
        handler: () => "toggled",
      }),
    );

    context.surfaces.push("changed-input");
    context.availability.panel = "changed-input";
    mutateContext(registered, "changed-register-return");

    const expectedDescriptor: CommandDescriptor = {
      id: "workspace.toggle-panel",
      pluginId: "workspace",
      title: "Toggle panel",
      description: "Toggle workspace panel",
      defaultShortcut: "Mod+\\",
      context: {
        surfaces: ["workspace"],
        availability: { panel: "closed" },
      },
    };

    expect(commands.get("workspace.toggle-panel")).toStrictEqual(
      expectedDescriptor,
    );

    const readDescriptor = commands.get("workspace.toggle-panel");
    mutateContext(readDescriptor, "changed-get-return");
    expect(commands.get("workspace.toggle-panel")).toStrictEqual(
      expectedDescriptor,
    );

    const listedDescriptors = commands.list();
    mutateContext(listedDescriptors[0]!, "changed-list-return");
    listedDescriptors.push({
      id: "extra.command",
      pluginId: "extra",
      title: "Extra command",
    });
    expect(commands.list()).toStrictEqual([expectedDescriptor]);

    const unregistered = commands.unregister("workspace.toggle-panel");

    expect(unregistered).toStrictEqual(expectedDescriptor);
    expectNoHandler(unregistered);
    expect(unregistered.context).not.toBe(context);
    expect(unregistered.context).not.toBe(registered.context);
    mutateContext(unregistered, "changed-unregister-return");
    expectCommandRegistryError(
      () => commands.get("workspace.toggle-panel"),
      "COMMAND_NOT_FOUND",
    );
  });

  it("executes sync and async handlers through the bus with the exact input reference and unknown output", async () => {
    const commands = createInMemoryCommandRegistry();
    const syncInput = { value: 3 };
    const asyncInput = { value: "ready" };
    const syncHandler = vi.fn<
      CommandHandler<typeof syncInput, { doubled: number }>
    >(
      (input: typeof syncInput) => ({ doubled: input.value * 2 }),
    );
    const asyncHandler = vi.fn<CommandHandler<typeof asyncInput, string>>(
      async (input: typeof asyncInput) => `async:${input.value}`,
    );

    commands.register(
      commandDefinition({
        id: "workspace.calculate-value",
        pluginId: "workspace",
        title: "Calculate value",
        handler: syncHandler,
      }),
    );
    commands.register(
      commandDefinition({
        id: "workspace.resolve-label",
        pluginId: "workspace",
        title: "Resolve label",
        handler: asyncHandler,
      }),
    );

    const syncExecution = commands.execute(
      "workspace.calculate-value",
      syncInput,
    );
    const asyncExecution = commands.execute(
      "workspace.resolve-label",
      asyncInput,
    );

    expectTypeOf<typeof syncExecution>().toEqualTypeOf<Promise<unknown>>();
    expect(syncExecution).toBeInstanceOf(Promise);
    await expect(syncExecution).resolves.toStrictEqual({ doubled: 6 });
    await expect(asyncExecution).resolves.toBe("async:ready");
    expect(syncHandler).toHaveBeenCalledWith(syncInput);
    expect(syncHandler.mock.calls[0]?.[0]).toBe(syncInput);
    expect(asyncHandler).toHaveBeenCalledWith(asyncInput);
    expect(asyncHandler.mock.calls[0]?.[0]).toBe(asyncInput);
  });

  it("rejects duplicate command ids with typed errors and preserves the original command", async () => {
    const commands = createInMemoryCommandRegistry();
    const originalHandler = vi.fn(() => "original");
    const duplicateHandler = vi.fn(() => "duplicate");
    const original = commands.register(
      commandDefinition({
        id: "workspace.open-tools",
        pluginId: "workspace",
        title: "Open tools",
        handler: originalHandler,
      }),
    );

    expectCommandRegistryError(
      () =>
        commands.register(
          commandDefinition({
            id: "workspace.open-tools",
            pluginId: "other-plugin",
            title: "Duplicate tools",
            handler: duplicateHandler,
          }),
        ),
      "COMMAND_ID_COLLISION",
    );

    expect(commands.get("workspace.open-tools")).toStrictEqual(original);
    expect(commands.list()).toStrictEqual([original]);
    await expect(commands.execute("workspace.open-tools")).resolves.toBe(
      "original",
    );
    expect(originalHandler).toHaveBeenCalledTimes(1);
    expect(duplicateHandler).not.toHaveBeenCalled();
  });

  it("unregisters commands, reports missing commands with typed errors, and allows re-registration", async () => {
    const commands = createInMemoryCommandRegistry();
    const first = commands.register(
      commandDefinition({
        id: "workspace.open-tools",
        pluginId: "workspace",
        title: "Open tools",
        handler: () => "first",
      }),
    );

    expect(commands.unregister("workspace.open-tools")).toStrictEqual(first);
    expect(commands.list()).toStrictEqual([]);
    expectCommandRegistryError(
      () => commands.get("workspace.open-tools"),
      "COMMAND_NOT_FOUND",
    );
    await expectCommandRegistryErrorAsync(
      () => commands.execute("workspace.open-tools"),
      "COMMAND_NOT_FOUND",
    );
    expectCommandRegistryError(
      () => commands.unregister("workspace.open-tools"),
      "COMMAND_NOT_FOUND",
    );

    const second = commands.register(
      commandDefinition({
        id: "workspace.open-tools",
        pluginId: "workspace",
        title: "Open tools again",
        handler: () => "second",
      }),
    );

    expect(second.title).toBe("Open tools again");
    await expect(commands.execute("workspace.open-tools")).resolves.toBe(
      "second",
    );
  });

  it("wraps sync throws, async rejections, and non-Error thrown values without unregistering commands", async () => {
    const commands = createInMemoryCommandRegistry();
    const syncCause = new Error("sync failure");
    const asyncCause = new Error("async failure");
    const nonErrorCause = { reason: "plain object failure" };

    commands.register(
      commandDefinition({
        id: "workspace.sync-failure",
        pluginId: "workspace",
        title: "Sync failure",
        handler: () => {
          throw syncCause;
        },
      }),
    );
    commands.register(
      commandDefinition({
        id: "workspace.async-failure",
        pluginId: "workspace",
        title: "Async failure",
        handler: async () => {
          throw asyncCause;
        },
      }),
    );
    commands.register(
      commandDefinition({
        id: "workspace.non-error-failure",
        pluginId: "workspace",
        title: "Non-error failure",
        handler: () => {
          throw nonErrorCause;
        },
      }),
    );

    await expectCommandRegistryErrorAsync(
      () => commands.execute("workspace.sync-failure"),
      "COMMAND_HANDLER_FAILED",
      { cause: syncCause },
    );
    await expectCommandRegistryErrorAsync(
      () => commands.execute("workspace.async-failure"),
      "COMMAND_HANDLER_FAILED",
      { cause: asyncCause },
    );
    await expectCommandRegistryErrorAsync(
      () => commands.execute("workspace.non-error-failure"),
      "COMMAND_HANDLER_FAILED",
      { cause: nonErrorCause },
    );
    expect(
      commands.list().map((command: CommandDescriptor) => command.id),
    ).toStrictEqual([
      "workspace.sync-failure",
      "workspace.async-failure",
      "workspace.non-error-failure",
    ]);
  });

  it("rejects invalid definitions with typed validation errors without mutating the registry", () => {
    const invalidCases: Array<{
      name: string;
      definition: () => CommandDefinition;
      code: CommandRegistryErrorCode;
    }> = [
      {
        name: "non-string id",
        definition: () =>
          commandDefinition({ id: 42 as unknown as string }),
        code: "COMMAND_IDENTITY_REQUIRED",
      },
      {
        name: "blank id",
        definition: () => commandDefinition({ id: " \n\t " }),
        code: "COMMAND_IDENTITY_REQUIRED",
      },
      {
        name: "non-string plugin id",
        definition: () =>
          commandDefinition({ pluginId: 42 as unknown as string }),
        code: "COMMAND_PLUGIN_ID_REQUIRED",
      },
      {
        name: "blank plugin id",
        definition: () => commandDefinition({ pluginId: " " }),
        code: "COMMAND_PLUGIN_ID_REQUIRED",
      },
      {
        name: "non-string title",
        definition: () =>
          commandDefinition({ title: 42 as unknown as string }),
        code: "COMMAND_TITLE_REQUIRED",
      },
      {
        name: "blank title",
        definition: () => commandDefinition({ title: "\t" }),
        code: "COMMAND_TITLE_REQUIRED",
      },
      {
        name: "non-function handler",
        definition: () =>
          commandDefinition({
            handler: "not a function" as unknown as CommandHandler,
          }),
        code: "COMMAND_HANDLER_REQUIRED",
      },
      {
        name: "non-string shortcut",
        definition: () =>
          commandDefinition({
            defaultShortcut: 42 as unknown as string,
          }),
        code: "COMMAND_SHORTCUT_INVALID",
      },
      {
        name: "blank shortcut",
        definition: () => commandDefinition({ defaultShortcut: " " }),
        code: "COMMAND_SHORTCUT_INVALID",
      },
      {
        name: "function context",
        definition: () =>
          commandDefinition({ context: { value: () => "not json" } }),
        code: "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      },
      {
        name: "cyclic context",
        definition: () => {
          const cyclicContext: Record<string, unknown> = {
            surface: "workspace",
          };
          cyclicContext.self = cyclicContext;

          return commandDefinition({ context: cyclicContext });
        },
        code: "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      },
      {
        name: "class instance context",
        definition: () =>
          commandDefinition({ context: new WorkspaceContext() }),
        code: "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE",
      },
    ];

    for (const invalidCase of invalidCases) {
      const commands = createInMemoryCommandRegistry();
      const existing = commands.register(
        commandDefinition({
          id: "workspace.existing-command",
          pluginId: "workspace",
          title: "Existing command",
          handler: () => "existing",
        }),
      );

      expectCommandRegistryError(
        () => commands.register(invalidCase.definition()),
        invalidCase.code,
      );
      expect(commands.list()).toStrictEqual([existing]);
      expect(commands.get("workspace.existing-command")).toStrictEqual(
        existing,
      );
    }
  });

  it("treats context as inert descriptor data instead of matching execution context", async () => {
    const commands = createInMemoryCommandRegistry();
    const handler = vi.fn((input: unknown) => input);

    commands.register(
      commandDefinition({
        id: "workspace.contextual-command",
        pluginId: "workspace",
        title: "Contextual command",
        context: {
          surface: "workspace",
          requiredSelection: ["single-item"],
        },
        handler,
      }),
    );
    const mismatchedInput = {
      surface: "different-surface",
      requiredSelection: [],
    };

    await expect(
      commands.execute("workspace.contextual-command", mismatchedInput),
    ).resolves.toBe(mismatchedInput);
    expect(handler).toHaveBeenCalledWith(mismatchedInput);
    expect(commands.get("workspace.contextual-command").context).toStrictEqual({
      surface: "workspace",
      requiredSelection: ["single-item"],
    });
  });

  it("snapshots in-flight handlers before awaits so unregistering cannot cancel or switch execution", async () => {
    const commands = createInMemoryCommandRegistry();
    let releasePendingHandler!: () => void;
    const pendingHandler = new Promise<void>((resolve) => {
      releasePendingHandler = resolve;
    });
    const firstHandler = vi.fn(async () => {
      await pendingHandler;

      return "first-handler";
    });
    const secondHandler = vi.fn(() => "second-handler");

    commands.register(
      commandDefinition({
        id: "workspace.pending-command",
        pluginId: "workspace",
        title: "Pending command",
        handler: firstHandler,
      }),
    );

    const firstExecution = commands.execute("workspace.pending-command");

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(commands.unregister("workspace.pending-command").id).toBe(
      "workspace.pending-command",
    );
    commands.register(
      commandDefinition({
        id: "workspace.pending-command",
        pluginId: "workspace",
        title: "Pending command replacement",
        handler: secondHandler,
      }),
    );
    releasePendingHandler();

    await expect(firstExecution).resolves.toBe("first-handler");
    expect(secondHandler).not.toHaveBeenCalled();
    await expect(commands.execute("workspace.pending-command")).resolves.toBe(
      "second-handler",
    );
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});

function commandDefinition<Input = unknown, Output = unknown>(
  overrides: Partial<CommandDefinition<Input, Output>> = {},
): CommandDefinition<Input, Output> {
  return {
    id: "workspace.default-command",
    pluginId: "workspace",
    title: "Default command",
    handler: (() => undefined as Output) as CommandHandler<Input, Output>,
    ...overrides,
  };
}

function expectNoHandler(descriptor: CommandDescriptor): void {
  expect(descriptor).not.toHaveProperty("handler");
}

function mutateContext(
  descriptor: CommandDescriptor,
  value: string,
): void {
  const context = descriptor.context as
    | {
        surfaces?: string[];
        availability?: {
          panel?: string;
        };
      }
    | undefined;

  context?.surfaces?.push(value);

  if (context?.availability !== undefined) {
    context.availability.panel = value;
  }
}

type CommandRegistryErrorExpectationOptions = {
  cause?: unknown;
};

function expectCommandRegistryError(
  action: () => unknown,
  code: CommandRegistryErrorCode,
  options: CommandRegistryErrorExpectationOptions = {},
): void {
  try {
    action();
  } catch (error) {
    expectCommandRegistryErrorObject(error, code, options);
    return;
  }

  throw new Error("Expected CommandRegistryError");
}

async function expectCommandRegistryErrorAsync(
  action: () => Promise<unknown>,
  code: CommandRegistryErrorCode,
  options: CommandRegistryErrorExpectationOptions = {},
): Promise<void> {
  try {
    await action();
  } catch (error) {
    expectCommandRegistryErrorObject(error, code, options);
    return;
  }

  throw new Error("Expected CommandRegistryError");
}

function expectCommandRegistryErrorObject(
  error: unknown,
  code: CommandRegistryErrorCode,
  options: CommandRegistryErrorExpectationOptions,
): void {
  if (options.cause !== undefined) {
    expect(error).not.toBe(options.cause);
  }

  expect(error).toBeInstanceOf(CommandRegistryError);

  expect((error as { code: CommandRegistryErrorCode }).code).toBe(code);

  if (options.cause !== undefined) {
    expect((error as { cause?: unknown }).cause).toBe(options.cause);
  }
}

class WorkspaceContext {
  readonly surface = "workspace";
}

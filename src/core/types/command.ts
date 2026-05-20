export type CommandHandler<Input = unknown, Output = unknown> = (
  input: Input,
) => Output | Promise<Output>;

export type CommandDefinition<Input = unknown, Output = unknown> = {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: unknown;
  handler: CommandHandler<Input, Output>;
};

export type CommandDescriptor = {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: unknown;
};

export type CommandRegistryErrorCode =
  | "COMMAND_NOT_FOUND"
  | "COMMAND_ID_COLLISION"
  | "COMMAND_IDENTITY_REQUIRED"
  | "COMMAND_PLUGIN_ID_REQUIRED"
  | "COMMAND_TITLE_REQUIRED"
  | "COMMAND_HANDLER_REQUIRED"
  | "COMMAND_SHORTCUT_INVALID"
  | "COMMAND_CONTEXT_NOT_JSON_COMPATIBLE"
  | "COMMAND_HANDLER_FAILED";

export type ListCommandsOptions = {
  pluginId?: string;
};

export type CommandRegistry = {
  register<Input = unknown, Output = unknown>(
    definition: CommandDefinition<Input, Output>,
  ): CommandDescriptor;
  get(commandId: string): CommandDescriptor;
  list(options?: ListCommandsOptions): CommandDescriptor[];
  unregister(commandId: string): CommandDescriptor;
};

export type CommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

export type CommandService = CommandRegistry & CommandBus;

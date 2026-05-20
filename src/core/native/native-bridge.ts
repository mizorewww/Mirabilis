type NativeBridgeCommands = Readonly<{
  dbExecute: string;
  dbTransaction: string;
  shortcutsRegister: string;
  shortcutsUnregister: string;
  notificationsNotify: string;
  filesImportMarkdown: string;
  filesExportMarkdown: string;
}>;

export const NATIVE_BRIDGE_COMMANDS: NativeBridgeCommands = Object.freeze({
  dbExecute: "db_execute",
  dbTransaction: "db_transaction",
  shortcutsRegister: "shortcuts_register",
  shortcutsUnregister: "shortcuts_unregister",
  notificationsNotify: "notifications_notify",
  filesImportMarkdown: "files_import_markdown",
  filesExportMarkdown: "files_export_markdown",
});

export type NativeBridgeCommand =
  (typeof NATIVE_BRIDGE_COMMANDS)[keyof typeof NATIVE_BRIDGE_COMMANDS];

export type NativeBridgeErrorCode =
  | "NATIVE_COMMAND_FAILED"
  | "NATIVE_RESPONSE_INVALID";

export class NativeBridgeError extends Error {
  readonly code: NativeBridgeErrorCode;
  readonly command: NativeBridgeCommand;

  constructor(
    code: NativeBridgeErrorCode,
    command: NativeBridgeCommand,
    message: string,
  ) {
    super(message);
    this.name = "NativeBridgeError";
    this.code = code;
    this.command = command;
  }
}

export type DbValue = string | number | boolean | null;

export type DbQuery = {
  sql: string;
  params?: readonly DbValue[];
};

export type NotificationInput = {
  title: string;
  body?: string;
};

export type NativeInvoke = <Response>(
  command: NativeBridgeCommand,
  args: Record<string, unknown>,
) => Promise<Response>;

export type NativeBridge = {
  db: {
    execute<Response>(query: DbQuery): Promise<Response>;
    transaction<Response>(queries: DbQuery[]): Promise<Response>;
  };
  shortcuts: {
    register(shortcut: string, commandId: string): Promise<void>;
    unregister(shortcut: string): Promise<void>;
  };
  notifications: {
    notify(input: NotificationInput): Promise<void>;
  };
  files: {
    importMarkdown(path: string): Promise<string>;
    exportMarkdown(pageId: string, path: string): Promise<void>;
  };
};

export function createNativeBridge(options: {
  invoke: NativeInvoke;
}): NativeBridge {
  const invoke = options.invoke;

  return {
    db: {
      execute<Response>(query: DbQuery) {
        return invokeCommand<Response>(invoke, NATIVE_BRIDGE_COMMANDS.dbExecute, {
          query,
        });
      },
      transaction<Response>(queries: DbQuery[]) {
        return invokeCommand<Response>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.dbTransaction,
          { queries },
        );
      },
    },
    shortcuts: {
      async register(shortcut, commandId) {
        await invokeCommand<unknown>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.shortcutsRegister,
          {
            shortcut,
            commandId,
          },
        );
      },
      async unregister(shortcut) {
        await invokeCommand<unknown>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.shortcutsUnregister,
          { shortcut },
        );
      },
    },
    notifications: {
      async notify(input) {
        await invokeCommand<unknown>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.notificationsNotify,
          { input },
        );
      },
    },
    files: {
      async importMarkdown(path) {
        const response = await invokeCommand<unknown>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.filesImportMarkdown,
          { path },
        );

        if (typeof response !== "string") {
          throw new NativeBridgeError(
            "NATIVE_RESPONSE_INVALID",
            NATIVE_BRIDGE_COMMANDS.filesImportMarkdown,
            "Native command returned an invalid response",
          );
        }

        return response;
      },
      async exportMarkdown(pageId, path) {
        await invokeCommand<unknown>(
          invoke,
          NATIVE_BRIDGE_COMMANDS.filesExportMarkdown,
          {
            pageId,
            path,
          },
        );
      },
    },
  };
}

async function invokeCommand<Response>(
  invoke: NativeInvoke,
  command: NativeBridgeCommand,
  args: Record<string, unknown>,
): Promise<Response> {
  try {
    return await invoke<Response>(command, args);
  } catch (error) {
    throw normalizeNativeBridgeError(error, command);
  }
}

function normalizeNativeBridgeError(
  error: unknown,
  command: NativeBridgeCommand,
): NativeBridgeError {
  if (error instanceof NativeBridgeError) {
    return error;
  }

  return new NativeBridgeError(
    "NATIVE_COMMAND_FAILED",
    command,
    readNativeErrorMessage(error),
  );
}

function readNativeErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  const objectMessage = readObjectMessage(error);

  if (objectMessage !== undefined && objectMessage.length > 0) {
    return objectMessage;
  }

  return "Native command failed";
}

function readObjectMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  try {
    const message = (error as { message?: unknown }).message;

    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

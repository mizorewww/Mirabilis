type NativeBridgeCommandKey =
  | "dbExecute"
  | "dbTransaction"
  | "shortcutsRegister"
  | "shortcutsUnregister"
  | "notificationsNotify"
  | "filesImportMarkdown"
  | "filesExportMarkdown";

type NativeBridgeCommands = Readonly<Record<NativeBridgeCommandKey, string>>;

export const NATIVE_BRIDGE_COMMANDS = Object.freeze({
  dbExecute: "db_execute",
  dbTransaction: "db_transaction",
  shortcutsRegister: "shortcuts_register",
  shortcutsUnregister: "shortcuts_unregister",
  notificationsNotify: "notifications_notify",
  filesImportMarkdown: "files_import_markdown",
  filesExportMarkdown: "files_export_markdown",
} as const satisfies NativeBridgeCommands);

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

export type DbValue =
  | string
  | number
  | boolean
  | null
  | readonly DbValue[]
  | { readonly [key: string]: DbValue };

export type DbQuery = {
  operation: string;
  payload?: DbValue;
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
  } catch {
    throw normalizeNativeBridgeError(command);
  }
}

function normalizeNativeBridgeError(
  command: NativeBridgeCommand,
): NativeBridgeError {
  return new NativeBridgeError(
    "NATIVE_COMMAND_FAILED",
    command,
    "Native command failed",
  );
}

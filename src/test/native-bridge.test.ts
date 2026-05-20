import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Mock } from "vitest";

const { tauriInvokeMock } = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriInvokeMock,
}));

import {
  DB_PERSISTENCE_OPERATIONS,
  NATIVE_BRIDGE_COMMANDS,
  NativeBridgeError,
  createNativeBridge,
  createTauriNativeBridge,
} from "../core/native";
import {
  DB_PERSISTENCE_OPERATIONS as CORE_DB_PERSISTENCE_OPERATIONS,
  NATIVE_BRIDGE_COMMANDS as CORE_NATIVE_BRIDGE_COMMANDS,
  NativeBridgeError as CoreNativeBridgeError,
  createNativeBridge as createCoreNativeBridge,
  createTauriNativeBridge as createCoreTauriNativeBridge,
} from "../core";
import type {
  DbPersistenceOperation,
  DbQuery,
  DbValue,
  NativeBridge,
  NativeBridgeCommand,
  NativeBridgeErrorCode,
  NativeInvoke,
  NotificationInput,
} from "../core/native";
import type {
  DbPersistenceOperation as DbPersistenceOperationFromCore,
  DbQuery as DbQueryFromCore,
  DbValue as DbValueFromCore,
  NativeBridge as NativeBridgeFromCore,
  NativeBridgeCommand as NativeBridgeCommandFromCore,
  NativeBridgeErrorCode as NativeBridgeErrorCodeFromCore,
  NativeInvoke as NativeInvokeFromCore,
  NotificationInput as NotificationInputFromCore,
  PluginContext,
} from "../core";
import type { PluginContext as PluginContextFromPluginApi } from "../core/plugin-api";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const srcDirectory = path.join(repoRoot, "src");
const pluginApiDirectory = path.join(srcDirectory, "core", "plugin-api");
const tauriNativeBridgeFile = path.join(
  srcDirectory,
  "core",
  "native",
  "tauri-native-bridge.ts",
);
const sourceExtensions = new Set([".ts", ".tsx"]);
const testFilePattern = /\.(test|spec)\.[cm]?[tj]sx?$/;

type NativeInvokeMock = Mock<
  (
    command: NativeBridgeCommand,
    args: Record<string, unknown>,
  ) => Promise<unknown>
> &
  NativeInvoke;
const EXPECTED_NATIVE_BRIDGE_COMMANDS = {
  dbExecute: "db_execute",
  dbTransaction: "db_transaction",
  shortcutsRegister: "shortcuts_register",
  shortcutsUnregister: "shortcuts_unregister",
  notificationsNotify: "notifications_notify",
  filesImportMarkdown: "files_import_markdown",
  filesExportMarkdown: "files_export_markdown",
} as const;
const EXPECTED_DB_PERSISTENCE_OPERATIONS = {
  pagesCreate: "core.pages.create",
  pagesGet: "core.pages.get",
  pagesList: "core.pages.list",
  pagesUpdate: "core.pages.update",
  pagesArchive: "core.pages.archive",
  metadataSet: "core.metadata.set",
  metadataGet: "core.metadata.get",
  metadataListForPage: "core.metadata.listForPage",
  metadataDelete: "core.metadata.delete",
  eventsAppend: "core.events.append",
  eventsList: "core.events.list",
  filtersSave: "core.filters.save",
  filtersGet: "core.filters.get",
  filtersList: "core.filters.list",
  filtersDelete: "core.filters.delete",
} as const;
type ExpectedNativeBridgeCommands = Readonly<
  typeof EXPECTED_NATIVE_BRIDGE_COMMANDS
>;
type ExpectedNativeBridgeCommand =
  ExpectedNativeBridgeCommands[keyof ExpectedNativeBridgeCommands];
type ExpectedDbPersistenceOperations = Readonly<
  typeof EXPECTED_DB_PERSISTENCE_OPERATIONS
>;
type ExpectedDbPersistenceOperation =
  ExpectedDbPersistenceOperations[keyof ExpectedDbPersistenceOperations];
type WidenedNativeBridgeCommandLeak =
  string extends NativeBridgeCommand
    ? "native-command-widened-to-string"
    : never;
type GreetNativeBridgeCommandLeak =
  "greet" extends NativeBridgeCommand ? "unexpected-greet-command" : never;
type WidenedDbPersistenceOperationLeak =
  string extends DbPersistenceOperation
    ? "db-persistence-operation-widened-to-string"
    : never;
type UnknownDbPersistenceOperationLeak =
  | ("core.pages.getById" extends DbPersistenceOperation
      ? "unexpected-legacy-page-operation"
      : never)
  | ("core.tasks.create" extends DbPersistenceOperation
      ? "unexpected-business-plugin-operation"
      : never)
  | ("select * from core_pages" extends DbPersistenceOperation
      ? "unexpected-raw-sql-operation"
      : never);
type ExpectedDbPayloadValue =
  | string
  | number
  | boolean
  | null
  | ExpectedDbPayloadValue[]
  | { [key: string]: ExpectedDbPayloadValue };
type ExpectedOperationPayload = {
  page: {
    id: string;
    title: string;
    tags: string[];
    archived: boolean | null;
  };
};
type DistributiveKeys<T> = T extends unknown ? keyof T : never;
type ExpectedDbQueryTopLevelKey = "operation" | "payload";
type SqlShapedDbQueryLeak = Extract<
  DistributiveKeys<DbQuery>,
  "sql" | "params"
>;
type DbQueryExtraTopLevelKeyLeak = Exclude<
  DistributiveKeys<DbQuery>,
  ExpectedDbQueryTopLevelKey
>;
type DbQueryMissingTopLevelKeyLeak<T> = T extends unknown
  ? Exclude<ExpectedDbQueryTopLevelKey, keyof T>
  : never;
type DbQueryOperationShapeLeak<T> = T extends unknown
  ? T extends { operation: infer Operation }
    ? [Operation] extends [DbPersistenceOperation]
      ? string extends Operation
        ? "db-query-operation-widened-to-string"
        : never
      : "db-query-operation-is-not-the-persistence-operation-allowlist"
    : "db-query-operation-key-is-missing"
  : never;
type DbQueryRequiredPayloadLeak<T> = T extends unknown
  ? T extends { payload: unknown }
    ? "db-query-payload-is-required"
    : never
  : never;
type DbQueryPayloadShapeLeak<T> = T extends unknown
  ? "payload" extends keyof T
    ? T["payload"] extends DbValue | undefined
      ? never
      : "db-query-payload-is-not-json-compatible"
    : "db-query-payload-key-is-missing"
  : never;
type DbValueJsonPayloadLeak =
  ExpectedOperationPayload extends DbValue
    ? never
    : "db-value-does-not-accept-json-object-payloads";
type DbValueFunctionPayloadLeak =
  (() => void) extends DbValue ? "db-value-accepts-function-payloads" : never;
type ExpectedNativeBridge = {
  db: {
    execute<Response>(query: DbQuery): Promise<Response>;
    transaction<Response>(queries: DbQuery[]): Promise<Response[]>;
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
type NativeBridgeSurfaceLeak =
  | Extract<keyof NativeBridge, "greet">
  | Extract<keyof typeof NATIVE_BRIDGE_COMMANDS, "greet">;
type ForbiddenPluginContextNativeKey =
  | "NativeBridge"
  | "nativeBridge"
  | "NativeInvoke"
  | "invoke"
  | "tauri"
  | "__TAURI__"
  | "native"
  | "sqlite"
  | "database"
  | "filesystem"
  | "fileSystem"
  | "fs"
  | "Resource";
type PluginContextNativeLeak =
  | Extract<keyof PluginContext, ForbiddenPluginContextNativeKey>
  | Extract<keyof PluginContextFromPluginApi, ForbiddenPluginContextNativeKey>;

describe("NativeBridge TypeScript boundary", () => {
  beforeEach(() => {
    tauriInvokeMock.mockReset();
  });

  it("exports the public NativeBridge API from Core entrypoints", () => {
    expect(NativeBridgeError).toEqual(expect.any(Function));
    expect(CoreNativeBridgeError).toBe(NativeBridgeError);
    expect(createNativeBridge).toEqual(expect.any(Function));
    expect(createCoreNativeBridge).toBe(createNativeBridge);
    expect(createTauriNativeBridge).toEqual(expect.any(Function));
    expect(createCoreTauriNativeBridge).toBe(createTauriNativeBridge);
    expect(CORE_NATIVE_BRIDGE_COMMANDS).toBe(NATIVE_BRIDGE_COMMANDS);
    expect(CORE_DB_PERSISTENCE_OPERATIONS).toBe(DB_PERSISTENCE_OPERATIONS);
    expect(NATIVE_BRIDGE_COMMANDS).toStrictEqual(
      EXPECTED_NATIVE_BRIDGE_COMMANDS,
    );
    expect(Object.keys(NATIVE_BRIDGE_COMMANDS).sort()).toStrictEqual(
      Object.keys(EXPECTED_NATIVE_BRIDGE_COMMANDS).sort(),
    );
    expect(new Set(Object.values(NATIVE_BRIDGE_COMMANDS)).size).toBe(7);
    expect(Object.values(NATIVE_BRIDGE_COMMANDS)).not.toContain("greet");
    expect(DB_PERSISTENCE_OPERATIONS).toStrictEqual(
      EXPECTED_DB_PERSISTENCE_OPERATIONS,
    );
    expect(Object.keys(DB_PERSISTENCE_OPERATIONS).sort()).toStrictEqual(
      Object.keys(EXPECTED_DB_PERSISTENCE_OPERATIONS).sort(),
    );
    expect(new Set(Object.values(DB_PERSISTENCE_OPERATIONS)).size).toBe(15);

    expectTypeOf<NativeBridgeFromCore>().toEqualTypeOf<NativeBridge>();
    expectTypeOf<NativeInvokeFromCore>().toEqualTypeOf<NativeInvoke>();
    expectTypeOf<NativeBridgeCommandFromCore>().toEqualTypeOf<
      NativeBridgeCommand
    >();
    expectTypeOf<NativeBridgeErrorCodeFromCore>().toEqualTypeOf<
      NativeBridgeErrorCode
    >();
    expectTypeOf<DbPersistenceOperationFromCore>().toEqualTypeOf<
      DbPersistenceOperation
    >();
    expectTypeOf<DbQueryFromCore>().toEqualTypeOf<DbQuery>();
    expectTypeOf<DbValueFromCore>().toEqualTypeOf<DbValue>();
    expectTypeOf<NotificationInputFromCore>().toEqualTypeOf<
      NotificationInput
    >();
    expectTypeOf<typeof NATIVE_BRIDGE_COMMANDS>().toEqualTypeOf<
      ExpectedNativeBridgeCommands
    >();
    expectTypeOf<typeof DB_PERSISTENCE_OPERATIONS>().toEqualTypeOf<
      ExpectedDbPersistenceOperations
    >();
    expectTypeOf<typeof NATIVE_BRIDGE_COMMANDS.dbExecute>().toEqualTypeOf<
      "db_execute"
    >();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.dbTransaction
    >().toEqualTypeOf<"db_transaction">();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.shortcutsRegister
    >().toEqualTypeOf<"shortcuts_register">();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.shortcutsUnregister
    >().toEqualTypeOf<"shortcuts_unregister">();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.notificationsNotify
    >().toEqualTypeOf<"notifications_notify">();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.filesImportMarkdown
    >().toEqualTypeOf<"files_import_markdown">();
    expectTypeOf<
      typeof NATIVE_BRIDGE_COMMANDS.filesExportMarkdown
    >().toEqualTypeOf<"files_export_markdown">();
    expectTypeOf<NativeBridgeCommand>().toEqualTypeOf<
      ExpectedNativeBridgeCommand
    >();
    expectTypeOf<NativeBridgeCommand>().toEqualTypeOf<
      (typeof NATIVE_BRIDGE_COMMANDS)[keyof typeof NATIVE_BRIDGE_COMMANDS]
    >();
    expectTypeOf<DbPersistenceOperation>().toEqualTypeOf<
      ExpectedDbPersistenceOperation
    >();
    expectTypeOf<DbPersistenceOperation>().toEqualTypeOf<
      (typeof DB_PERSISTENCE_OPERATIONS)[keyof typeof DB_PERSISTENCE_OPERATIONS]
    >();
    expectTypeOf<NativeInvoke>().toEqualTypeOf<
      <Response>(
        command: NativeBridgeCommand,
        args: Record<string, unknown>,
      ) => Promise<Response>
    >();
    expectTypeOf<typeof createNativeBridge>().toEqualTypeOf<
      (options: { invoke: NativeInvoke }) => NativeBridge
    >();
    expectTypeOf<typeof createTauriNativeBridge>().toEqualTypeOf<
      () => NativeBridge
    >();
    expectTypeOf<NativeBridgeErrorCode>().toEqualTypeOf<
      "NATIVE_COMMAND_FAILED" | "NATIVE_RESPONSE_INVALID"
    >();
    expectTypeOf<ExpectedOperationPayload>().toMatchTypeOf<
      ExpectedDbPayloadValue
    >();
    expectTypeOf<DbQuery>().toMatchTypeOf<{
      operation: DbPersistenceOperation;
      payload?: DbValue;
    }>();
    expectTypeOf<NotificationInput>().toEqualTypeOf<{
      title: string;
      body?: string;
    }>();
    expectTypeOf<NativeBridge>().toEqualTypeOf<ExpectedNativeBridge>();
    expectNoTypeLeak<WidenedNativeBridgeCommandLeak>();
    expectNoTypeLeak<GreetNativeBridgeCommandLeak>();
    expectNoTypeLeak<WidenedDbPersistenceOperationLeak>();
    expectNoTypeLeak<UnknownDbPersistenceOperationLeak>();
    expectNoTypeLeak<SqlShapedDbQueryLeak>();
    expectNoTypeLeak<DbQueryExtraTopLevelKeyLeak>();
    expectNoTypeLeak<DbQueryMissingTopLevelKeyLeak<DbQuery>>();
    expectNoTypeLeak<DbQueryOperationShapeLeak<DbQuery>>();
    expectNoTypeLeak<DbQueryRequiredPayloadLeak<DbQuery>>();
    expectNoTypeLeak<DbQueryPayloadShapeLeak<DbQuery>>();
    expectNoTypeLeak<DbValueJsonPayloadLeak>();
    expectNoTypeLeak<DbValueFunctionPayloadLeak>();
    expectNoTypeLeak<NativeBridgeSurfaceLeak>();
  });

  it("creates grouped db, shortcut, notification, and file surfaces", () => {
    const bridge = createNativeBridge({ invoke: createResolvedInvoke() });

    expect(Object.keys(bridge).sort()).toStrictEqual([
      "db",
      "files",
      "notifications",
      "shortcuts",
    ]);
    expect(bridge.db.execute).toEqual(expect.any(Function));
    expect(bridge.db.transaction).toEqual(expect.any(Function));
    expect(bridge.shortcuts.register).toEqual(expect.any(Function));
    expect(bridge.shortcuts.unregister).toEqual(expect.any(Function));
    expect(bridge.notifications.notify).toEqual(expect.any(Function));
    expect(bridge.files.importMarkdown).toEqual(expect.any(Function));
    expect(bridge.files.exportMarkdown).toEqual(expect.any(Function));
    expect("greet" in bridge).toBe(false);
  });

  it("invokes database commands once with centralized commands and exact DTOs", async () => {
    const executeRows = [{ id: "page-1", title: "Roadmap" }];
    const executeInvoke = createResolvedInvoke(executeRows);
    const executeBridge = createNativeBridge({ invoke: executeInvoke });
    const query = dbQuery(DB_PERSISTENCE_OPERATIONS.pagesGet, {
      id: "page-1",
    });

    const executeResult = executeBridge.db.execute<
      Array<{ id: string; title: string }>
    >(query);

    expectTypeOf<typeof executeResult>().toEqualTypeOf<
      Promise<Array<{ id: string; title: string }>>
    >();
    await expect(executeResult).resolves.toStrictEqual(executeRows);
    expectSingleInvoke(executeInvoke, NATIVE_BRIDGE_COMMANDS.dbExecute, {
      query,
    });

    const transactionResults = [{ changed: 1 }, { changed: 2 }];
    const transactionInvoke = createResolvedInvoke(transactionResults);
    const transactionBridge = createNativeBridge({ invoke: transactionInvoke });
    const queries = [
      dbQuery(DB_PERSISTENCE_OPERATIONS.pagesCreate, {
        page: { id: "page-1", title: "Roadmap" },
      }),
      dbQuery(DB_PERSISTENCE_OPERATIONS.pagesCreate, {
        page: { id: "page-2", title: "Inbox" },
      }),
    ] satisfies DbQuery[];

    const transactionPromise =
      transactionBridge.db.transaction<{ changed: number }>(queries);

    expectTypeOf<typeof transactionPromise>().toEqualTypeOf<
      Promise<Array<{ changed: number }>>
    >();
    await expect(transactionPromise).resolves.toStrictEqual(transactionResults);
    expectSingleInvoke(
      transactionInvoke,
      NATIVE_BRIDGE_COMMANDS.dbTransaction,
      { queries },
    );
  });

  it("invokes void native commands once with exact DTOs and no response payload requirement", async () => {
    const registerInvoke = createResolvedInvoke();
    await expect(
      createNativeBridge({ invoke: registerInvoke }).shortcuts.register(
        "Mod+Shift+P",
        "workspace.open-command-palette",
      ),
    ).resolves.toBeUndefined();
    expectSingleInvoke(
      registerInvoke,
      NATIVE_BRIDGE_COMMANDS.shortcutsRegister,
      {
        shortcut: "Mod+Shift+P",
        commandId: "workspace.open-command-palette",
      },
    );

    const unregisterInvoke = createResolvedInvoke();
    await expect(
      createNativeBridge({ invoke: unregisterInvoke }).shortcuts.unregister(
        "Mod+Shift+P",
      ),
    ).resolves.toBeUndefined();
    expectSingleInvoke(
      unregisterInvoke,
      NATIVE_BRIDGE_COMMANDS.shortcutsUnregister,
      {
        shortcut: "Mod+Shift+P",
      },
    );

    const notificationInput = {
      title: "Import complete",
      body: "Imported 1 page",
    } satisfies NotificationInput;
    const notifyInvoke = createResolvedInvoke();
    await expect(
      createNativeBridge({ invoke: notifyInvoke }).notifications.notify(
        notificationInput,
      ),
    ).resolves.toBeUndefined();
    expectSingleInvoke(
      notifyInvoke,
      NATIVE_BRIDGE_COMMANDS.notificationsNotify,
      {
        input: notificationInput,
      },
    );

    const exportInvoke = createResolvedInvoke();
    await expect(
      createNativeBridge({ invoke: exportInvoke }).files.exportMarkdown(
        "page-1",
        "/tmp/page.md",
      ),
    ).resolves.toBeUndefined();
    expectSingleInvoke(exportInvoke, NATIVE_BRIDGE_COMMANDS.filesExportMarkdown, {
      pageId: "page-1",
      path: "/tmp/page.md",
    });
  });

  it("invokes markdown import once with an exact DTO and validates its string response", async () => {
    const importInvoke = createResolvedInvoke("# Imported page");

    await expect(
      createNativeBridge({ invoke: importInvoke }).files.importMarkdown(
        "/tmp/page.md",
      ),
    ).resolves.toBe("# Imported page");
    expectSingleInvoke(importInvoke, NATIVE_BRIDGE_COMMANDS.filesImportMarkdown, {
      path: "/tmp/page.md",
    });
  });

  it("delegates the production Tauri adapter to mocked invoke with exact command and DTO", async () => {
    tauriInvokeMock.mockResolvedValueOnce(undefined);

    const input = {
      title: "Import complete",
      body: "Imported 1 page",
    } satisfies NotificationInput;

    await expect(
      createTauriNativeBridge().notifications.notify(input),
    ).resolves.toBeUndefined();

    expect(tauriInvokeMock).toHaveBeenCalledTimes(1);
    expect(tauriInvokeMock).toHaveBeenCalledWith("notifications_notify", {
      input,
    });
  });

  it.each([
    {
      label: "object .message rejection",
      raw: {
        code: "SQLITE_CONSTRAINT",
        message:
          "failed SQL select * from core_pages where token = 'secret-token'",
      },
      forbiddenMessageFragments: ["select *", "secret-token"],
    },
    {
      label: "string rejection",
      raw: "failed to read /Users/alice/private/page.md",
      forbiddenMessageFragments: ["/Users/alice/private/page.md"],
    },
    {
      label: "JavaScript Error rejection",
      raw: new Error("backend token=secret-token rejected command"),
      forbiddenMessageFragments: ["secret-token"],
    },
    {
      label: "null rejection",
      raw: null,
      forbiddenMessageFragments: [],
    },
    {
      label: "unknown object rejection",
      raw: { reason: "opaque backend object" },
      forbiddenMessageFragments: ["opaque backend object"],
    },
  ])("normalizes rejected invoker values from $label", async (caseItem) => {
    const bridge = createNativeBridge({
      invoke: createRejectedInvoke(caseItem.raw),
    });

    await expectNativeBridgeError(
      bridge.db.execute(
        dbQuery(DB_PERSISTENCE_OPERATIONS.pagesList, { limit: 1 }),
      ),
      caseItem.raw,
      {
        code: "NATIVE_COMMAND_FAILED",
        command: NATIVE_BRIDGE_COMMANDS.dbExecute,
        message: "Native command failed",
        forbiddenMessageFragments: caseItem.forbiddenMessageFragments,
      },
    );
  });

  it("normalizes rejected non-database invocations without leaking native details", async () => {
    const rawError = new Error(
      "notification token secret-token failed for /Users/alice/Inbox.md",
    );
    const bridge = createNativeBridge({
      invoke: createRejectedInvoke(rawError),
    });

    await expectNativeBridgeError(
      bridge.notifications.notify({ title: "Import complete" }),
      rawError,
      {
        code: "NATIVE_COMMAND_FAILED",
        command: NATIVE_BRIDGE_COMMANDS.notificationsNotify,
        message: "Native command failed",
        forbiddenMessageFragments: ["secret-token", "/Users/alice/Inbox.md"],
      },
    );
  });

  it.each([null, 42, { markdown: "# Imported page" }])(
    "rejects malformed markdown import response %j as NativeBridgeError",
    async (nativeResponse) => {
      const bridge = createNativeBridge({
        invoke: createResolvedInvoke(nativeResponse),
      });

      await expectNativeBridgeError(
        bridge.files.importMarkdown("/tmp/page.md"),
        nativeResponse,
        {
          code: "NATIVE_RESPONSE_INVALID",
          command: NATIVE_BRIDGE_COMMANDS.filesImportMarkdown,
          message: "Native command returned an invalid response",
        },
      );
    },
  );

  it("keeps raw Tauri invoke usage inside the Tauri NativeBridge adapter", async () => {
    const productionFiles = await listProductionSourceFiles(srcDirectory);
    const violations = new Map<string, string[]>();

    expect(productionFiles).not.toHaveLength(0);

    for (const filePath of productionFiles) {
      if (filePath === tauriNativeBridgeFile) {
        continue;
      }

      const contents = await readFile(filePath, "utf8");
      const fileViolations = findRawNativeBoundaryReferences(contents);

      if (fileViolations.length > 0) {
        violations.set(path.relative(repoRoot, filePath), fileViolations);
      }
    }

    expect(formatViolations(violations)).toEqual([]);
  });

  it("keeps PluginContext and plugin-api contracts away from native handles", async () => {
    const pluginApiFiles = await listProductionSourceFiles(pluginApiDirectory);
    const violations = new Map<string, string[]>();

    expect(pluginApiFiles).not.toHaveLength(0);
    expectNoTypeLeak<PluginContextNativeLeak>();

    for (const filePath of pluginApiFiles) {
      const contents = await readFile(filePath, "utf8");
      const fileViolations = findPluginApiNativeReferences(contents);

      if (fileViolations.length > 0) {
        violations.set(path.relative(repoRoot, filePath), fileViolations);
      }
    }

    expect(formatViolations(violations)).toEqual([]);
  });
});

function dbQuery(
  operation: DbPersistenceOperation,
  payload?: ExpectedDbPayloadValue,
): DbQuery {
  return (payload === undefined
    ? { operation }
    : { operation, payload }) as unknown as DbQuery;
}

function createResolvedInvoke(response?: unknown): NativeInvokeMock {
  return vi.fn(
    async <Response>() => response as Response,
  ) as unknown as NativeInvokeMock;
}

function createRejectedInvoke(rawError: unknown): NativeInvokeMock {
  return vi.fn(async () => {
    throw rawError;
  }) as unknown as NativeInvokeMock;
}

function expectSingleInvoke(
  invoke: NativeInvokeMock,
  command: NativeBridgeCommand,
  args: Record<string, unknown>,
): void {
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith(command, args);
}

async function expectNativeBridgeError(
  promise: Promise<unknown>,
  rawError: unknown,
  expected: {
    code: NativeBridgeErrorCode;
    command: NativeBridgeCommand;
    message: string;
    forbiddenMessageFragments?: readonly string[];
  },
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected NativeBridgeError");
  } catch (error) {
    expect(error).toBeInstanceOf(NativeBridgeError);
    expect(error).not.toBe(rawError);
    expect(error).toMatchObject({
      name: "NativeBridgeError",
      code: expected.code,
      command: expected.command,
      message: expected.message,
    });
    for (const fragment of expected.forbiddenMessageFragments ?? []) {
      expect((error as Error).message).not.toContain(fragment);
    }
  }
}

async function listProductionSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listProductionSourceFiles(entryPath);
      }

      if (
        entry.isFile() &&
        sourceExtensions.has(path.extname(entry.name)) &&
        !testFilePattern.test(entry.name)
      ) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

function findRawNativeBoundaryReferences(contents: string): string[] {
  const hasRootTauriImport = /from\s+["']@tauri-apps\/api["']/.test(contents);
  const hasTauriCoreImport = /from\s+["']@tauri-apps\/api\/core["']/.test(
    contents,
  );
  const hasLegacyTauriImport = /from\s+["']@tauri-apps\/api\/tauri["']/.test(
    contents,
  );
  const violations = [
    [hasRootTauriImport, "root-tauri-import"],
    [hasTauriCoreImport, "tauri-core-import"],
    [hasLegacyTauriImport, "legacy-tauri-import"],
    [/\b__TAURI__\b/, "window-tauri-handle"],
  ] as const;
  const rawInvokeCall =
    (hasRootTauriImport || hasTauriCoreImport || hasLegacyTauriImport) &&
    /\binvoke\s*(?:<[^>]+>)?\(/.test(contents);

  const foundViolations: string[] = violations
    .filter(([pattern]) =>
      pattern instanceof RegExp ? pattern.test(contents) : pattern,
    )
    .map(([, label]) => label);

  return foundViolations.concat(rawInvokeCall ? ["raw-invoke-call"] : []);
}

function findPluginApiNativeReferences(contents: string): string[] {
  const violations = [
    [/\bNativeBridge\b/, "NativeBridge"],
    [/\bNativeInvoke\b/, "NativeInvoke"],
    [/\bResource\b/, "Resource"],
    [/\b__TAURI__\b/, "__TAURI__"],
    [/\binvoke\b/, "invoke"],
    [/@tauri-apps\/api/, "tauri-api"],
    [/\bsqlite\b/i, "sqlite"],
    [/\bfilesystem\b/i, "filesystem"],
  ] as const;

  return violations
    .filter(([pattern]) => pattern.test(contents))
    .map(([, label]) => label);
}

function formatViolations(violations: Map<string, string[]>): string[] {
  return [...violations.entries()].map(
    ([filePath, labels]) => `${filePath}: ${[...labels].sort().join(", ")}`,
  );
}

function expectNoTypeLeak<Leak extends never>(): void {
  void (undefined as unknown as Leak);
}

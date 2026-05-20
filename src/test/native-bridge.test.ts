import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Mock } from "vitest";

import {
  NATIVE_BRIDGE_COMMANDS,
  NativeBridgeError,
  createNativeBridge,
  createTauriNativeBridge,
} from "../core/native";
import {
  NATIVE_BRIDGE_COMMANDS as CORE_NATIVE_BRIDGE_COMMANDS,
  NativeBridgeError as CoreNativeBridgeError,
  createNativeBridge as createCoreNativeBridge,
  createTauriNativeBridge as createCoreTauriNativeBridge,
} from "../core";
import type {
  DbQuery,
  DbValue,
  NativeBridge,
  NativeBridgeCommand,
  NativeBridgeErrorCode,
  NativeInvoke,
  NotificationInput,
} from "../core/native";
import type {
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
type ExpectedNativeBridgeCommands = Readonly<{
  dbExecute: string;
  dbTransaction: string;
  shortcutsRegister: string;
  shortcutsUnregister: string;
  notificationsNotify: string;
  filesImportMarkdown: string;
  filesExportMarkdown: string;
}>;
type ExpectedNativeBridge = {
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
  it("exports the public NativeBridge API from Core entrypoints", () => {
    expect(NativeBridgeError).toEqual(expect.any(Function));
    expect(CoreNativeBridgeError).toBe(NativeBridgeError);
    expect(createNativeBridge).toEqual(expect.any(Function));
    expect(createCoreNativeBridge).toBe(createNativeBridge);
    expect(createTauriNativeBridge).toEqual(expect.any(Function));
    expect(createCoreTauriNativeBridge).toBe(createTauriNativeBridge);
    expect(CORE_NATIVE_BRIDGE_COMMANDS).toBe(NATIVE_BRIDGE_COMMANDS);
    expect(Object.keys(NATIVE_BRIDGE_COMMANDS).sort()).toStrictEqual([
      "dbExecute",
      "dbTransaction",
      "shortcutsRegister",
      "shortcutsUnregister",
      "notificationsNotify",
      "filesImportMarkdown",
      "filesExportMarkdown",
    ].sort());
    expect(new Set(Object.values(NATIVE_BRIDGE_COMMANDS)).size).toBe(7);
    expect(Object.values(NATIVE_BRIDGE_COMMANDS)).not.toContain("greet");

    expectTypeOf<NativeBridgeFromCore>().toEqualTypeOf<NativeBridge>();
    expectTypeOf<NativeInvokeFromCore>().toEqualTypeOf<NativeInvoke>();
    expectTypeOf<NativeBridgeCommandFromCore>().toEqualTypeOf<
      NativeBridgeCommand
    >();
    expectTypeOf<NativeBridgeErrorCodeFromCore>().toEqualTypeOf<
      NativeBridgeErrorCode
    >();
    expectTypeOf<DbQueryFromCore>().toEqualTypeOf<DbQuery>();
    expectTypeOf<DbValueFromCore>().toEqualTypeOf<DbValue>();
    expectTypeOf<NotificationInputFromCore>().toEqualTypeOf<
      NotificationInput
    >();
    expectTypeOf<typeof NATIVE_BRIDGE_COMMANDS>().toMatchObjectType<
      ExpectedNativeBridgeCommands
    >();
    expectTypeOf<NativeBridgeCommand>().toEqualTypeOf<
      (typeof NATIVE_BRIDGE_COMMANDS)[keyof typeof NATIVE_BRIDGE_COMMANDS]
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
    expectTypeOf<DbValue>().toEqualTypeOf<string | number | boolean | null>();
    expectTypeOf<DbQuery>().toEqualTypeOf<{
      sql: string;
      params?: readonly DbValue[];
    }>();
    expectTypeOf<NotificationInput>().toEqualTypeOf<{
      title: string;
      body?: string;
    }>();
    expectTypeOf<NativeBridge>().toEqualTypeOf<ExpectedNativeBridge>();
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
    const query = dbQuery("select id, title from core_pages where id = ?", [
      "page-1",
    ]);

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

    const transactionResult = { changed: 2 };
    const transactionInvoke = createResolvedInvoke(transactionResult);
    const transactionBridge = createNativeBridge({ invoke: transactionInvoke });
    const queries = [
      dbQuery("insert into core_pages (id, title) values (?, ?)", [
        "page-1",
        "Roadmap",
      ]),
      dbQuery("insert into core_pages (id, title) values (?, ?)", [
        "page-2",
        "Inbox",
      ]),
    ] satisfies DbQuery[];

    const transactionPromise =
      transactionBridge.db.transaction<{ changed: number }>(queries);

    expectTypeOf<typeof transactionPromise>().toEqualTypeOf<
      Promise<{ changed: number }>
    >();
    await expect(transactionPromise).resolves.toStrictEqual(transactionResult);
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

  it.each([
    {
      label: "typed native error object",
      raw: {
        code: "NATIVE_COMMAND_FAILED" satisfies NativeBridgeErrorCode,
        message: "Native command rejected",
      },
      expectedMessage: "Native command rejected",
    },
    {
      label: "string rejection",
      raw: "Native command rejected",
      expectedMessage: "Native command rejected",
    },
    {
      label: "JavaScript Error rejection",
      raw: new Error("Native command rejected"),
      expectedMessage: "Native command rejected",
    },
    {
      label: "null rejection",
      raw: null,
      expectedMessage: "Native command failed",
    },
    {
      label: "unknown object rejection",
      raw: { reason: "opaque backend object" },
      expectedMessage: "Native command failed",
    },
  ])("normalizes rejected invoker values from $label", async (caseItem) => {
    const bridge = createNativeBridge({
      invoke: createRejectedInvoke(caseItem.raw),
    });

    await expectNativeBridgeError(
      bridge.db.execute(dbQuery("select 1")),
      caseItem.raw,
      {
        code: "NATIVE_COMMAND_FAILED",
        command: NATIVE_BRIDGE_COMMANDS.dbExecute,
        message: caseItem.expectedMessage,
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

function dbQuery(sql: string, params?: readonly DbValue[]): DbQuery {
  return params === undefined ? { sql } : { sql, params };
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
  const hasTauriCoreImport = /from\s+["']@tauri-apps\/api\/core["']/.test(
    contents,
  );
  const hasLegacyTauriImport = /from\s+["']@tauri-apps\/api\/tauri["']/.test(
    contents,
  );
  const violations = [
    [hasTauriCoreImport, "tauri-core-import"],
    [hasLegacyTauriImport, "legacy-tauri-import"],
    [/\b__TAURI__\b/, "window-tauri-handle"],
  ] as const;
  const rawInvokeCall =
    (hasTauriCoreImport || hasLegacyTauriImport) &&
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

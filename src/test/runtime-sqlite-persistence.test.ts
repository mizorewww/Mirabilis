import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  DB_PERSISTENCE_OPERATIONS,
  NATIVE_BRIDGE_COMMANDS,
  NativeBridgeError,
  createNativeBridge,
  type AppEvent,
  type AppPlugin,
  type DbPersistenceOperation,
  type DbQuery,
  type FilterDefinition,
  type MarkdownPage,
  type MetadataRecord,
  type NativeBridge,
  type NativeBridgeCommand,
  type NativeInvoke,
  type StructuredMarkdownDocument,
} from "../core";
import { RuntimeProvider } from "../providers";

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

type NativeInvokeMock = Mock<
  (
    command: NativeBridgeCommand,
    args: Record<string, unknown>,
  ) => Promise<unknown>
> &
  NativeInvoke;

type StoragePersistenceMarker = {
  readonly persistence: string;
};

type RuntimeWithStorage = AppRuntime & {
  readonly storage?: StoragePersistenceMarker;
};

type NativeDbCall =
  | {
      readonly kind: "execute";
      readonly query: DbQuery;
    }
  | {
      readonly kind: "transaction";
      readonly queries: readonly DbQuery[];
    };

type RecordingNativeBridge = NativeBridge & {
  readonly calls: NativeDbCall[];
  clearCalls(): void;
  rejectNextTransaction(error: unknown): void;
};

type RecordingNativeBridgeOptions = {
  pages?: readonly MarkdownPage[];
  metadata?: readonly MetadataRecord[];
  events?: readonly AppEvent[];
  filters?: readonly FilterDefinition[];
  rejectOperations?: ReadonlySet<DbPersistenceOperation>;
};

type JsonRecord = Record<string, unknown>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const srcDirectory = path.join(repoRoot, "src");
const tauriAdapterFile = path.join(
  srcDirectory,
  "core",
  "native",
  "tauri-native-bridge.ts",
);
const sourceExtensions = new Set([".ts", ".tsx"]);
const testFilePattern = /\.(?:test|spec)\.[cm]?[tj]sx?$/u;
const expectedDbOperations = [
  DB_PERSISTENCE_OPERATIONS.pagesCreate,
  DB_PERSISTENCE_OPERATIONS.pagesGet,
  DB_PERSISTENCE_OPERATIONS.pagesList,
  DB_PERSISTENCE_OPERATIONS.pagesUpdate,
  DB_PERSISTENCE_OPERATIONS.pagesArchive,
  DB_PERSISTENCE_OPERATIONS.metadataSet,
  DB_PERSISTENCE_OPERATIONS.metadataGet,
  DB_PERSISTENCE_OPERATIONS.metadataListForPage,
  DB_PERSISTENCE_OPERATIONS.metadataDelete,
  DB_PERSISTENCE_OPERATIONS.eventsAppend,
  DB_PERSISTENCE_OPERATIONS.eventsList,
  DB_PERSISTENCE_OPERATIONS.filtersSave,
  DB_PERSISTENCE_OPERATIONS.filtersGet,
  DB_PERSISTENCE_OPERATIONS.filtersList,
  DB_PERSISTENCE_OPERATIONS.filtersDelete,
] as const;

const instant = "2026-06-14T10:00:00.000Z";
const leakPattern =
  /SELECT\s+\*|core_pages|\/home\/aac6fef|C:\\|Bearer|secret-token|token=|PluginHost|NativeBridge|sqlite|stack|at\s+\S+:\d+:\d+/iu;

describe("runtime SQLite persistence", () => {
  it("hydrates pages, metadata, events, and filters before plugin activation", async () => {
    const pageOne = pageRecord("page-hydrated-1", "Hydrated inbox");
    const pageTwo = pageRecord("page-hydrated-2", "Hydrated child", {
      parentPageId: pageOne.id,
    });
    const metadata = [
      metadataRecord("metadata-1", pageOne.id, "tag", "tags", ["today"], "tag"),
      metadataRecord("metadata-2", pageTwo.id, "task", "status", "todo", "task"),
    ];
    const events = [
      eventRecord("event-1", pageOne.id, "timer", "started", {
        segmentId: "segment-1",
      }),
    ];
    const filters = [
      filterRecord("filter-1", "Today", "task.filter", "page.list"),
    ];
    const timeline: string[] = [];
    const bridge = createTimelineBridge();
    const activationProbe = createPlugin("hydration.probe", {
      activate() {
        timeline.push("plugin.activate");
      },
    });

    const runtime = (await createAppRuntime({
      builtInPlugins: [activationProbe],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    const activationIndex = timeline.indexOf("plugin.activate");
    const operationsBeforeActivation = timeline
      .slice(0, activationIndex)
      .filter((entry) => entry.startsWith("db."));

    expect(activationIndex).toBeGreaterThanOrEqual(0);
    expect(operationsBeforeActivation).toStrictEqual([
      `db.${DB_PERSISTENCE_OPERATIONS.pagesList}`,
      `db.${DB_PERSISTENCE_OPERATIONS.metadataListForPage}:${pageOne.id}`,
      `db.${DB_PERSISTENCE_OPERATIONS.metadataListForPage}:${pageTwo.id}`,
      `db.${DB_PERSISTENCE_OPERATIONS.eventsList}`,
      `db.${DB_PERSISTENCE_OPERATIONS.filtersList}`,
    ]);
    expect(runtime.pages.list({ includeArchived: true })).toMatchObject([
      { id: pageOne.id, title: pageOne.title },
      { id: pageTwo.id, title: pageTwo.title },
    ]);
    expect(runtime.metadata.list()).toMatchObject([
      {
        id: "metadata-1",
        pageId: pageOne.id,
        namespace: "tag",
        key: "tags",
        sourcePluginId: "tag",
      },
      {
        id: "metadata-2",
        pageId: pageTwo.id,
        namespace: "task",
        key: "status",
        sourcePluginId: "task",
      },
    ]);
    expect(runtime.events.list()).toMatchObject([
      {
        id: "event-1",
        pageId: pageOne.id,
        namespace: "timer",
        sourcePluginId: "timer",
      },
    ]);
    expect(runtime.filters.list()).toMatchObject([
      {
        id: "filter-1",
        name: "Today",
        sourcePluginId: "task.filter",
      },
    ]);

    function createTimelineBridge(): RecordingNativeBridge {
      const recordingBridge = createRecordingNativeBridge({
        pages: [pageOne, pageTwo],
        metadata,
        events,
        filters,
      });
      const execute = recordingBridge.db.execute.bind(recordingBridge.db);
      const transaction = recordingBridge.db.transaction.bind(recordingBridge.db);

      recordingBridge.db.execute = async <Response,>(
        query: DbQuery,
      ): Promise<Response> => {
        timeline.push(formatDbOperation(query));

        return execute<Response>(query);
      };
      recordingBridge.db.transaction = async <Response,>(
        queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> => {
        timeline.push(...queries.map(formatDbOperation));

        return transaction<Response>(queries);
      };

      return recordingBridge;
    }
  });

  it("reports SQLite-backed persistence by default while explicit in-memory bootstraps can stay in-memory", async () => {
    const persistedRuntime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => createRecordingNativeBridge(),
    })) as RuntimeWithStorage;

    expect(persistedRuntime.storage?.persistence).toMatch(/sqlite/i);
    expect(persistedRuntime.storage?.persistence).not.toBe("in-memory-core");

    const explicitStorage = {
      persistence: "in-memory-core",
    } satisfies StoragePersistenceMarker;
    const inMemoryRuntime = await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => createRecordingNativeBridge(),
      createStorageFacade: () => explicitStorage,
      createRuntime: ({ app }) => ({
        app,
        storage: explicitStorage,
      }),
    });

    expect((inMemoryRuntime as RuntimeWithStorage).storage?.persistence).toBe(
      "in-memory-core",
    );
  });

  it("persists runtime.transaction.run multi-store writes through one ordered native transaction", async () => {
    const bridge = createRecordingNativeBridge();
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.clearCalls();

    const transactionResult = await runtime.transaction.run((tx) => {
      const page = tx.pages.create({
        title: "Durable transaction page",
        body: emptyDocument(),
      });
      tx.metadata.set({
        pageId: page.id,
        namespace: "test-plugin",
        key: "state",
        value: "ready",
        valueType: "string",
        sourcePluginId: "test-plugin",
      });
      tx.events.append({
        pageId: page.id,
        namespace: "test-plugin",
        type: "created",
        payload: { pageId: page.id },
        sourcePluginId: "test-plugin",
      });
      tx.filters.save({
        id: "test-plugin.filter.transaction",
        name: "Transaction filter",
        query: {
          where: [
            {
              field: "metadata.test-plugin.state",
              op: "eq",
              value: "ready",
            },
          ],
        },
        viewType: "page.list",
        sourcePluginId: "test-plugin",
      });

      return {
        pageId: page.id,
      };
    });
    const transactionBatch = expectSingleNativeTransaction(bridge);

    expect(transactionResult).toMatchObject({
      pageId: expect.stringMatching(/^page_/u),
    });
    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
      DB_PERSISTENCE_OPERATIONS.metadataSet,
      DB_PERSISTENCE_OPERATIONS.eventsAppend,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(payloadRecord(transactionBatch[0])).toMatchObject({
      id: transactionResult.pageId,
      title: "Durable transaction page",
    });
    expect(payloadRecord(transactionBatch[1])).toMatchObject({
      pageId: transactionResult.pageId,
      namespace: "test-plugin",
      key: "state",
      sourcePluginId: "test-plugin",
    });
    expect(payloadRecord(transactionBatch[2])).toMatchObject({
      pageId: transactionResult.pageId,
      namespace: "test-plugin",
      type: "created",
      sourcePluginId: "test-plugin",
    });
    expect(payloadRecord(transactionBatch[3])).toMatchObject({
      id: "test-plugin.filter.transaction",
      sourcePluginId: "test-plugin",
      viewType: "page.list",
    });
    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "Durable transaction page",
    });
    expect(runtime.metadata.get(
      transactionResult.pageId,
      "test-plugin",
      "state",
    )).toMatchObject({
      value: "ready",
      sourcePluginId: "test-plugin",
    });
  });

  it("does not commit live stores when the native transaction rejects", async () => {
    const bridge = createRecordingNativeBridge();
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;
    const rawPersistenceError = new Error(
      "SQLITE_BUSY SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
    );

    bridge.clearCalls();
    bridge.rejectNextTransaction(rawPersistenceError);

    const transactionError = await captureError(async () => {
      await runtime.transaction.run((tx) => {
        const page = tx.pages.create({
          title: "Rejected durable page",
          body: emptyDocument(),
        });
        tx.metadata.set({
          pageId: page.id,
          namespace: "test-plugin",
          key: "state",
          value: "should rollback",
          valueType: "string",
          sourcePluginId: "test-plugin",
        });

        return page.id;
      });
    });

    expect(transactionError).toBeDefined();
    expect(String(transactionError)).not.toMatch(leakPattern);
    expect(runtime.pages.list({ includeArchived: true })).not.toContainEqual(
      expect.objectContaining({ title: "Rejected durable page" }),
    );
    expect(runtime.metadata.list()).not.toContainEqual(
      expect.objectContaining({
        namespace: "test-plugin",
        key: "state",
        value: "should rollback",
      }),
    );
  });

  it("persists FilterStore.update as filter get plus merged save inside one transaction", async () => {
    const existingFilter = filterRecord(
      "tag.filter.today",
      "#today",
      "tag",
      "page.list",
    );
    const bridge = createRecordingNativeBridge({
      filters: [existingFilter],
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.clearCalls();

    await runtime.transaction.run((tx) => {
      const updated = tx.filters.update(existingFilter.id, {
        name: "#today updated",
        group: { field: "metadata.tag.tags" },
      });

      expect(updated).toMatchObject({
        id: existingFilter.id,
        name: "#today updated",
        query: existingFilter.query,
        sourcePluginId: "tag",
        group: { field: "metadata.tag.tags" },
      });
    });

    const transactionBatch = expectSingleNativeTransaction(bridge);

    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.filtersGet,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(payloadRecord(transactionBatch[0])).toStrictEqual({
      id: existingFilter.id,
    });
    expect(payloadRecord(transactionBatch[1])).toMatchObject({
      id: existingFilter.id,
      name: "#today updated",
      query: existingFilter.query,
      viewType: existingFilter.viewType,
      sourcePluginId: "tag",
      group: { field: "metadata.tag.tags" },
    });
    expect(Object.values(DB_PERSISTENCE_OPERATIONS)).not.toContain(
      "core.filters.update",
    );
  });

  it("keeps plugin transaction facades owner-scoped and durable without native handle leaks", async () => {
    const bridge = createRecordingNativeBridge();
    const alphaObservation: {
      unsafePaths: string[];
      pageId: string;
      filterId: string;
    } = {
      unsafePaths: ["not captured"],
      pageId: "",
      filterId: "",
    };
    let betaObservation:
      | {
          unsafePaths: string[];
          metadataList: readonly unknown[];
          eventList: readonly unknown[];
          filterList: readonly unknown[];
          metadataGetRejected: boolean;
          filterGetRejected: boolean;
          spoofRejected: boolean;
        }
      | undefined;
    const alpha = createPlugin("alpha", {
      async register(ctx) {
        await ctx.transaction.run((tx) => {
          alphaObservation.unsafePaths = findUnsafeSurfacePaths(tx);
          const page = tx.pages.create({
            title: "Alpha durable page",
            body: emptyDocument(),
          });
          alphaObservation.pageId = page.id;
          tx.metadata.set({
            pageId: page.id,
            namespace: "alpha",
            key: "state",
            value: "owned",
            valueType: "string",
          });
          tx.events.append({
            pageId: page.id,
            namespace: "alpha",
            type: "registered",
            payload: { owner: "alpha" },
          });
          alphaObservation.filterId = tx.filters.save({
            id: "alpha.filter.owned",
            name: "Alpha owned",
            query: {
              where: [{ field: "metadata.alpha.state", op: "eq", value: "owned" }],
            },
            viewType: "page.list",
          }).id;
        });
      },
    });
    const beta = createPlugin("beta", {
      async register(ctx) {
        betaObservation = await ctx.transaction.run((tx) => {
          const metadataGetError = captureSyncError(() =>
            tx.metadata.get(alphaObservation.pageId, "alpha", "state"),
          );
          const filterGetError = captureSyncError(() =>
            tx.filters.get(alphaObservation.filterId),
          );
          const spoofError = captureSyncError(() =>
            tx.metadata.set({
              pageId: alphaObservation.pageId,
              namespace: "beta",
              key: "spoof",
              value: "bad",
              valueType: "string",
              sourcePluginId: "alpha",
            } as unknown as Parameters<typeof tx.metadata.set>[0]),
          );

          return {
            unsafePaths: findUnsafeSurfacePaths(tx),
            metadataList: tx.metadata.list(),
            eventList: tx.events.list(),
            filterList: tx.filters.list(),
            metadataGetRejected: metadataGetError !== undefined,
            filterGetRejected: filterGetError !== undefined,
            spoofRejected: spoofError !== undefined,
          };
        });
      },
    });

    await createAppRuntime({
      builtInPlugins: [alpha, beta],
      createNativeBridge: () => bridge,
    });

    const writeBatch = bridge.calls
      .filter((call): call is Extract<NativeDbCall, { kind: "transaction" }> =>
        call.kind === "transaction",
      )
      .map((call) => call.queries)
      .find((queries) =>
        queries.some(
          (query) => query.operation === DB_PERSISTENCE_OPERATIONS.metadataSet,
        ),
      );

    expect(alphaObservation.unsafePaths).toStrictEqual([]);
    expect(betaObservation).toMatchObject({
      unsafePaths: [],
      metadataList: [],
      eventList: [],
      filterList: [],
      metadataGetRejected: true,
      filterGetRejected: true,
      spoofRejected: true,
    });
    expect(writeBatch?.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
      DB_PERSISTENCE_OPERATIONS.metadataSet,
      DB_PERSISTENCE_OPERATIONS.eventsAppend,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(writeBatch?.map((query) => payloadRecord(query))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: alphaObservation.pageId,
          namespace: "alpha",
          key: "state",
          sourcePluginId: "alpha",
        }),
        expect.objectContaining({
          pageId: alphaObservation.pageId,
          namespace: "alpha",
          type: "registered",
          sourcePluginId: "alpha",
        }),
        expect.objectContaining({
          id: "alpha.filter.owned",
          sourcePluginId: "alpha",
        }),
      ]),
    );
  });

  it("redacts startup hydration failures and public NativeBridge transaction failures", async () => {
    const rawFailure = new Error(
      "SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
    );
    const startupBridge = createRecordingNativeBridge({
      rejectOperations: new Set([DB_PERSISTENCE_OPERATIONS.pagesList]),
    });
    const initializeRuntime = vi.fn(() =>
      createAppRuntime({
        builtInPlugins: [],
        createNativeBridge: () => startupBridge,
      }),
    );

    render(
      createElement(RuntimeProvider, {
        initializeRuntime,
        children: createElement("p", { role: "status" }, "runtime ready"),
      }),
    );

    const alert = await screen.findByRole("alert");
    const alertText = alert.textContent ?? "";

    expect(alert).toBeVisible();
    expect(alertText).not.toMatch(leakPattern);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await expectPublicNativeBridgeError(rawFailure);
  });

  it("keeps frontend and Tauri persistence boundaries narrow", async () => {
    const sourceFiles = await listProductionSourceFiles(srcDirectory);
    const packageJson = parseJsonRecord(await readRepoFile("package.json"));
    const cargoToml = await readRepoFile("src-tauri/Cargo.toml");
    const capability = parseJsonRecord(
      await readRepoFile("src-tauri/capabilities/default.json"),
    );
    const permissionFiles = await listRelativeFiles("src-tauri/permissions");
    const commandManifest = await readRepoFile("src-tauri/build.rs");
    const tauriLib = await readRepoFile("src-tauri/src/lib.rs");

    expect(Object.values(DB_PERSISTENCE_OPERATIONS)).toStrictEqual(
      expectedDbOperations,
    );
    expect(Object.values(DB_PERSISTENCE_OPERATIONS)).not.toContain(
      "core.filters.update",
    );
    expect(findTauriSqlSurfaceViolations(packageJson, cargoToml)).toStrictEqual(
      [],
    );
    await expect(findRawDbDtoViolations(sourceFiles)).resolves.toStrictEqual([]);
    await expect(findTauriApiImportViolations(sourceFiles)).resolves.toStrictEqual(
      [],
    );
    expect(extractBuildManifestCommands(commandManifest)).toStrictEqual([
      "db_execute",
      "db_transaction",
    ]);
    expect(extractGenerateHandlerCommands(tauriLib)).toStrictEqual([
      "db_execute",
      "db_transaction",
    ]);
    expect(capability.permissions).toStrictEqual([
      "core:default",
      "opener:default",
      "allow-db-execute",
      "allow-db-transaction",
    ]);
    expect(permissionFiles).toStrictEqual([
      "src-tauri/permissions/autogenerated/db_execute.toml",
      "src-tauri/permissions/autogenerated/db_transaction.toml",
    ]);
    expect(await readRepoFile(permissionFiles[0] ?? "")).toContain(
      'commands.allow = ["db_execute"]',
    );
    expect(await readRepoFile(permissionFiles[1] ?? "")).toContain(
      'commands.allow = ["db_transaction"]',
    );
  });
});

function createRecordingNativeBridge(
  options: RecordingNativeBridgeOptions = {},
): RecordingNativeBridge {
  const pages = new Map((options.pages ?? []).map((page) => [page.id, page]));
  const metadata = options.metadata ?? [];
  const events = options.events ?? [];
  const filters = new Map(
    (options.filters ?? []).map((filter) => [filter.id, filter]),
  );
  const calls: NativeDbCall[] = [];
  let nextTransactionRejection: unknown;

  const bridge: RecordingNativeBridge = {
    calls,
    clearCalls() {
      calls.length = 0;
    },
    rejectNextTransaction(error) {
      nextTransactionRejection = error;
    },
    db: {
      async execute<Response>(query: DbQuery): Promise<Response> {
        calls.push({ kind: "execute", query: cloneData(query) });

        return responseForQuery(query) as Response;
      },
      async transaction<Response>(
        queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        calls.push({ kind: "transaction", queries: cloneData(queries) });

        if (nextTransactionRejection !== undefined) {
          const rejection = nextTransactionRejection;

          nextTransactionRejection = undefined;
          throw rejection;
        }

        return queries.map(responseForQuery) as NativeBridgeTransactionResult<Response>;
      },
    },
    shortcuts: {
      register: async () => undefined,
      unregister: async () => undefined,
    },
    notifications: {
      notify: async () => undefined,
    },
    files: {
      importMarkdown: async () => "",
      exportMarkdown: async () => undefined,
    },
  };

  return bridge;

  function responseForQuery(query: DbQuery): unknown {
    if (options.rejectOperations?.has(query.operation)) {
      throw new Error(
        "SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
      );
    }

    switch (query.operation) {
      case DB_PERSISTENCE_OPERATIONS.pagesList:
        return [...pages.values()].map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.pagesGet:
        return pages.get(readPayloadId(query)) ?? null;
      case DB_PERSISTENCE_OPERATIONS.metadataListForPage:
        return metadata
          .filter((record) => record.pageId === readPayloadPageId(query))
          .map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.metadataGet: {
        const payload = payloadRecord(query);

        return (
          metadata.find(
            (record) =>
              record.pageId === payload.pageId &&
              record.namespace === payload.namespace &&
              record.key === payload.key,
          ) ?? null
        );
      }
      case DB_PERSISTENCE_OPERATIONS.eventsList:
        return events.map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.filtersList:
        return [...filters.values()].map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.filtersGet:
        return filters.get(readPayloadId(query)) ?? null;
      default:
        return null;
    }
  }
}

function pageRecord(
  id: string,
  title: string,
  options: { parentPageId?: string } = {},
): MarkdownPage {
  return {
    id,
    title,
    body: emptyDocument(),
    createdAt: instant,
    updatedAt: instant,
    ...(options.parentPageId === undefined
      ? {}
      : { parentPageId: options.parentPageId }),
  };
}

function metadataRecord(
  id: string,
  pageId: string,
  namespace: string,
  key: string,
  value: unknown,
  sourcePluginId: string,
): MetadataRecord {
  return {
    id,
    pageId,
    namespace,
    key,
    value,
    valueType: Array.isArray(value) ? "json" : "string",
    sourcePluginId,
    createdAt: instant,
    updatedAt: instant,
  };
}

function eventRecord(
  id: string,
  pageId: string,
  namespace: string,
  type: string,
  payload: unknown,
): AppEvent {
  return {
    id,
    pageId,
    namespace,
    type,
    payload,
    sourcePluginId: namespace,
    createdAt: instant,
  };
}

function filterRecord(
  id: string,
  name: string,
  sourcePluginId: string,
  viewType: string,
): FilterDefinition {
  return {
    id,
    name,
    query: {
      where: [{ field: "metadata.tag.tags", op: "includes", value: "today" }],
    },
    viewType,
    sourcePluginId,
    createdAt: instant,
    updatedAt: instant,
  };
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function createPlugin(
  id: string,
  lifecycle: Partial<
    Pick<AppPlugin, "activate" | "install" | "register">
  > = {},
): AppPlugin {
  return {
    manifest: {
      id,
      name: id,
      version: "1.0.0",
      minAppVersion: "0.1.0",
    },
    register: lifecycle.register ?? (() => undefined),
    install: lifecycle.install,
    activate: lifecycle.activate,
  };
}

function expectSingleNativeTransaction(
  bridge: RecordingNativeBridge,
): readonly DbQuery[] {
  const transactionCalls = bridge.calls.filter(
    (call): call is Extract<NativeDbCall, { kind: "transaction" }> =>
      call.kind === "transaction",
  );

  expect(transactionCalls).toHaveLength(1);

  return transactionCalls[0]?.queries ?? [];
}

function payloadRecord(query: DbQuery | undefined): JsonRecord {
  if (
    query === undefined ||
    typeof query.payload !== "object" ||
    query.payload === null ||
    Array.isArray(query.payload)
  ) {
    throw new Error("Expected query payload object");
  }

  return query.payload as JsonRecord;
}

function readPayloadId(query: DbQuery): string {
  const id = payloadRecord(query).id;

  if (typeof id !== "string") {
    throw new Error("Expected payload id");
  }

  return id;
}

function readPayloadPageId(query: DbQuery): string {
  const pageId = payloadRecord(query).pageId;

  if (typeof pageId !== "string") {
    throw new Error("Expected payload pageId");
  }

  return pageId;
}

function formatDbOperation(query: DbQuery): string {
  if (query.operation === DB_PERSISTENCE_OPERATIONS.metadataListForPage) {
    return `db.${query.operation}:${readPayloadPageId(query)}`;
  }

  return `db.${query.operation}`;
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();

    return undefined;
  } catch (error) {
    return error;
  }
}

function captureSyncError(run: () => unknown): unknown {
  try {
    run();

    return undefined;
  } catch (error) {
    return error;
  }
}

function findUnsafeSurfacePaths(value: unknown): string[] {
  return collectUnsafeSurfacePaths(value, "$", new Set<object>()).sort();
}

function collectUnsafeSurfacePaths(
  value: unknown,
  currentPath: string,
  seen: Set<object>,
): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return [];
  }

  seen.add(value);

  return Object.entries(value as JsonRecord).flatMap(([key, child]) => {
    const childPath = `${currentPath}.${key}`;
    const keyViolation = isUnsafeSurfaceKey(key) ? [childPath] : [];

    return [
      ...keyViolation,
      ...collectUnsafeSurfacePaths(child, childPath, seen),
    ];
  });
}

function isUnsafeSurfaceKey(key: string): boolean {
  const normalized = key.replace(/[-_]/gu, "").toLowerCase();

  return /^(?:nativebridge|native|invoke|tauri|db|database|dbquery|sqlite|sql|connection|handle|storage|storagedriver|driver|drivers|filesystem|files|fs|path|paths|pluginhost|runtime|stores|registries|services)$/u.test(
    normalized,
  );
}

async function expectPublicNativeBridgeError(rawFailure: unknown): Promise<void> {
  const invoke = vi.fn(async () => {
    throw rawFailure;
  }) as unknown as NativeInvokeMock;
  const bridge = createNativeBridge({ invoke });
  const query = {
    operation: DB_PERSISTENCE_OPERATIONS.pagesList,
  } satisfies DbQuery;

  await expect(bridge.db.transaction([query])).rejects.toMatchObject({
    name: "NativeBridgeError",
    code: "NATIVE_COMMAND_FAILED",
    command: NATIVE_BRIDGE_COMMANDS.dbTransaction,
    message: "Native command failed",
  } satisfies Partial<NativeBridgeError>);
  await expect(bridge.db.transaction([query])).rejects.not.toThrow(leakPattern);
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

  return files.flat().sort();
}

async function listRelativeFiles(relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  const absoluteFiles = await listFiles(absoluteDirectory);

  return absoluteFiles
    .map((filePath) => path.relative(repoRoot, filePath))
    .sort();
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }

      return entry.isFile() ? [entryPath] : [];
    }),
  );

  return files.flat();
}

async function readRepoFile(relativeFilePath: string): Promise<string> {
  if (relativeFilePath.trim().length === 0) {
    throw new Error("Expected repository-relative file path");
  }

  return readFile(path.join(repoRoot, relativeFilePath), "utf8");
}

function parseJsonRecord(contents: string): JsonRecord {
  const value = JSON.parse(contents) as unknown;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON object");
  }

  return value as JsonRecord;
}

function findTauriSqlSurfaceViolations(
  packageJson: JsonRecord,
  cargoToml: string,
): string[] {
  const dependencies = {
    ...(readJsonRecordProperty(packageJson, "dependencies") ?? {}),
    ...(readJsonRecordProperty(packageJson, "devDependencies") ?? {}),
  };
  const dependencyNames = Object.keys(dependencies);
  const violations = dependencyNames
    .filter((dependencyName) =>
      /(?:@tauri-apps\/plugin-sql|tauri-plugin-sql|sql\.js|better-sqlite)/iu.test(
        dependencyName,
      ),
    )
    .map((dependencyName) => `package.json:${dependencyName}`);

  if (/tauri[-_]plugin[-_]sql|@tauri-apps\/plugin-sql/iu.test(cargoToml)) {
    violations.push("src-tauri/Cargo.toml:tauri-plugin-sql");
  }

  return violations;
}

function readJsonRecordProperty(
  record: JsonRecord,
  key: string,
): JsonRecord | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${key} to be a JSON object`);
  }

  return value as JsonRecord;
}

async function findRawDbDtoViolations(files: readonly string[]): Promise<string[]> {
  const violations: string[] = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const hasDbBridgeCall = /\bdb\s*\.\s*(?:execute|transaction)\b/u.test(
      source,
    );
    const hasNativeDbContract =
      /\b(?:DbQuery|DbPersistenceOperation|DB_PERSISTENCE_OPERATIONS)\b/u.test(
        source,
      );

    if (!hasDbBridgeCall && !hasNativeDbContract) {
      continue;
    }

    const rawDtoFields = [
      ...source.matchAll(
        /\b(?:sql|params|dbPath|databasePath|connection)\??\s*:/giu,
      ),
    ].map((match) => match[0]);

    if (rawDtoFields.length > 0) {
      violations.push(
        `${path.relative(repoRoot, filePath)}: ${rawDtoFields.join(", ")}`,
      );
    }
  }

  return violations;
}

async function findTauriApiImportViolations(
  files: readonly string[],
): Promise<string[]> {
  const violations: string[] = [];

  for (const filePath of files) {
    if (filePath === tauriAdapterFile) {
      continue;
    }

    const source = await readFile(filePath, "utf8");

    if (/from\s+["']@tauri-apps\/api(?:\/[^"']*)?["']/u.test(source)) {
      violations.push(path.relative(repoRoot, filePath));
    }
  }

  return violations;
}

function extractBuildManifestCommands(source: string): string[] {
  return [...source.matchAll(/"([a-z_]+)"/gu)]
    .map((match) => match[1])
    .filter((command): command is string => command !== undefined)
    .filter((command) => command.startsWith("db_"));
}

function extractGenerateHandlerCommands(source: string): string[] {
  return [...source.matchAll(/commands::db::([a-z_]+)/gu)]
    .map((match) => match[1])
    .filter((command): command is string => command !== undefined);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}

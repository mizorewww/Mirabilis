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

type NativeDbState = {
  pages: Map<string, MarkdownPage>;
  metadata: MetadataRecord[];
  events: AppEvent[];
  filters: Map<string, FilterDefinition>;
};

type TransactionResponseContext = {
  missingFilterGets: Set<string>;
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
  queryResponses?: ReadonlyMap<DbPersistenceOperation, unknown>;
  rejectOperations?: ReadonlySet<DbPersistenceOperation>;
};

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value | PromiseLike<Value>): void;
  reject(error: unknown): void;
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
    const pageOne = pageRecord("page-hydrated-1", "Hydrated inbox", {
      body: documentWithLine("hydrated-inbox-line", "First hydrated line"),
    });
    const pageTwo = pageRecord("page-hydrated-2", "Hydrated child", {
      parentPageId: pageOne.id,
      body: documentWithLine("hydrated-child-line", "Archived child line"),
      archivedAt: "2026-06-14T10:15:00.000Z",
    });
    const metadata = [
      metadataRecord(
        "metadata-1",
        pageOne.id,
        "tag",
        "tags",
        ["today"],
        "json",
        "tag",
      ),
      metadataRecord(
        "metadata-2",
        pageTwo.id,
        "task",
        "estimate",
        3,
        "number",
        "task",
      ),
    ];
    const events = [
      eventRecord(
        "event-1",
        pageOne.id,
        "timer",
        "time_segment_created",
        {
          durationMinutes: 25,
          segmentId: "segment-1",
        },
      ),
    ];
    const filters = [
      filterRecord("filter-1", "Today", "task.filter", "page.list", {
        group: { field: "metadata.task.status" },
        query: {
          where: [
            { field: "metadata.task.estimate", op: "gt", value: 1 },
          ],
        },
        sort: [{ field: "updatedAt", direction: "desc" }],
      }),
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
    const requiredHydrationOperations = [
      `db.${DB_PERSISTENCE_OPERATIONS.pagesList}`,
      `db.${DB_PERSISTENCE_OPERATIONS.metadataListForPage}:${pageOne.id}`,
      `db.${DB_PERSISTENCE_OPERATIONS.metadataListForPage}:${pageTwo.id}`,
      `db.${DB_PERSISTENCE_OPERATIONS.eventsList}`,
      `db.${DB_PERSISTENCE_OPERATIONS.filtersList}`,
    ];

    expect(activationIndex).toBeGreaterThanOrEqual(0);
    for (const operation of requiredHydrationOperations) {
      const operationIndex = timeline.indexOf(operation);

      expect(operationIndex).toBeGreaterThanOrEqual(0);
      expect(operationIndex).toBeLessThan(activationIndex);
    }
    expect(runtime.pages.list()).toStrictEqual([pageOne]);
    expect(runtime.pages.list({ includeArchived: true })).toStrictEqual([
      pageOne,
      pageTwo,
    ]);
    expect(runtime.pages.get(pageOne.id)).toStrictEqual(pageOne);
    expect(runtime.pages.get(pageTwo.id)).toStrictEqual(pageTwo);
    expect(runtime.metadata.list()).toStrictEqual(metadata);
    expect(runtime.metadata.get(pageOne.id, "tag", "tags")).toStrictEqual(
      metadata[0],
    );
    expect(runtime.metadata.get(pageTwo.id, "task", "estimate")).toStrictEqual(
      metadata[1],
    );
    expect(runtime.events.list()).toStrictEqual(events);
    expect(runtime.filters.list()).toStrictEqual(filters);
    expect(runtime.filters.get("filter-1")).toStrictEqual(filters[0]);

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

  it("does not let direct runtime page writes create memory-only rows in a fresh SQLite-backed runtime", async () => {
    const bridge = createRecordingNativeBridge();
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.clearCalls();

    const createdPage = runtime.pages.create({
      title: "Direct Home Page",
      body: documentWithLine("direct-home-line", "Direct home draft"),
    });

    const createBatch = findNativeTransactionContaining(
      bridge,
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    );

    expect(createBatch?.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);
    expect(payloadRecord(createBatch?.[0])).toMatchObject({
      id: createdPage.id,
      title: "Direct Home Page",
      body: documentWithLine("direct-home-line", "Direct home draft"),
    });

    bridge.clearCalls();

    await expect(
      runtime.transaction.run((tx) =>
        tx.pages.update(createdPage.id, {
          title: "Direct Home Page Saved",
          body: documentWithLine("direct-home-line-2", "Direct home saved"),
        }),
      ),
    ).resolves.toMatchObject({
      id: createdPage.id,
      title: "Direct Home Page Saved",
    });
    expect(expectSingleNativeTransaction(bridge).map((query) => query.operation))
      .toStrictEqual([DB_PERSISTENCE_OPERATIONS.pagesUpdate]);
  });

  it("keeps a direct runtime page write in live memory after an in-flight persisted transaction commits", async () => {
    const bridge = createRecordingNativeBridge();
    const releaseTransactionCommit = createDeferred<void>();
    const transactionCommitStarted = createDeferred<readonly DbQuery[]>();
    const directWriteResolved = createDeferred<void>();
    const originalTransaction = bridge.db.transaction.bind(bridge.db);
    let delayedTransactionCommit = false;
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.db.transaction = async <Response,>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>> => {
      if (
        !delayedTransactionCommit &&
        queries.some((query) =>
          queryCreatesPageWithTitle(query, "In-flight transaction page"),
        )
      ) {
        delayedTransactionCommit = true;
        transactionCommitStarted.resolve(queries);
        await releaseTransactionCommit.promise;
      }

      const result = await originalTransaction<Response>(queries);

      if (
        queries.some((query) =>
          queryCreatesPageWithTitle(query, "Concurrent direct page"),
        )
      ) {
        directWriteResolved.resolve(undefined);
      }

      return result;
    };

    bridge.clearCalls();

    const transactionCommit = runtime.transaction.run((tx) => {
      const page = tx.pages.create({
        title: "In-flight transaction page",
        body: documentWithLine("in-flight-line", "Staged transaction body"),
      });

      return { pageId: page.id };
    });
    const transactionBatch = await transactionCommitStarted.promise;

    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);

    const directPage = runtime.pages.create({
      title: "Concurrent direct page",
      body: documentWithLine("concurrent-direct-line", "Direct write body"),
    });

    await directWriteResolved.promise;
    expect(runtime.pages.get(directPage.id)).toMatchObject({
      title: "Concurrent direct page",
    });

    releaseTransactionCommit.resolve(undefined);

    const transactionResult = await transactionCommit;

    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "In-flight transaction page",
    });
    expect(runtime.pages.get(directPage.id)).toMatchObject({
      title: "Concurrent direct page",
    });
  });

  it("does not let a failed direct page write-through rollback erase an unrelated committed Core transaction", async () => {
    const bridge = createRecordingNativeBridge();
    const releaseTransactionCommit = createDeferred<void>();
    const transactionCommitStarted = createDeferred<readonly DbQuery[]>();
    const directPagePersistStarted = createDeferred<readonly DbQuery[]>();
    const rejectDirectPageWrite = createDeferred<void>();
    const originalTransaction = bridge.db.transaction.bind(bridge.db);
    let delayedTransactionCommit = false;
    let delayedDirectPageWrite = false;
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.db.transaction = async <Response,>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>> => {
      if (
        !delayedTransactionCommit &&
        queries.some((query) =>
          queryCreatesPageWithTitle(query, "Committed core transaction page"),
        )
      ) {
        delayedTransactionCommit = true;
        transactionCommitStarted.resolve(queries);
        await releaseTransactionCommit.promise;

        return originalTransaction<Response>(queries);
      }

      if (
        !delayedDirectPageWrite &&
        queries.some((query) =>
          queryCreatesPageWithTitle(query, "Rejected direct page"),
        )
      ) {
        delayedDirectPageWrite = true;
        directPagePersistStarted.resolve(queries);
        await rejectDirectPageWrite.promise;
        throw new Error(
          "SQLITE_BUSY SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
        );
      }

      return originalTransaction<Response>(queries);
    };

    bridge.clearCalls();

    const transactionCommit = runtime.transaction.run((tx) => {
      const page = tx.pages.create({
        title: "Committed core transaction page",
        body: documentWithLine("committed-core-line", "Committed core body"),
      });

      return { pageId: page.id };
    });
    const transactionBatch = await transactionCommitStarted.promise;

    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);

    const directPage = runtime.pages.create({
      title: "Rejected direct page",
      body: documentWithLine("rejected-direct-line", "Rejected direct body"),
    });
    const directBatch = await directPagePersistStarted.promise;

    expect(directBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);
    expect(runtime.pages.get(directPage.id)).toMatchObject({
      title: "Rejected direct page",
    });

    releaseTransactionCommit.resolve(undefined);

    const transactionResult = await transactionCommit;

    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "Committed core transaction page",
    });

    rejectDirectPageWrite.resolve(undefined);

    await expect(runtime.transaction.run(() => undefined)).rejects.toThrow(
      "Native command failed",
    );
    expect(runtime.pages.list({ includeArchived: true })).not.toContainEqual(
      expect.objectContaining({ id: directPage.id }),
    );
    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "Committed core transaction page",
    });
  });

  it("keeps plugin direct metadata, event, and filter writes in live memory after an in-flight persisted transaction commits", async () => {
    const targetPage = pageRecord(
      "page-plugin-direct-target",
      "Plugin direct target",
    );
    const bridge = createRecordingNativeBridge({
      pages: [targetPage],
    });
    const releaseTransactionCommit = createDeferred<void>();
    const transactionCommitStarted = createDeferred<readonly DbQuery[]>();
    const directWritePersisted = createDeferred<void>();
    const originalTransaction = bridge.db.transaction.bind(bridge.db);
    let delayedTransactionCommit = false;
    let observedDirectWritePersistence = false;
    const concurrentWriter = createPlugin("concurrent-writer", {
      register(ctx) {
        ctx.commands.register({
          id: "concurrent-writer.write-facts",
          title: "Write concurrent facts",
          handler(_input, commandContext) {
            commandContext.metadata.set({
              pageId: targetPage.id,
              namespace: "concurrent-writer",
              key: "state",
              value: "written-during-core-commit",
              valueType: "string",
            });
            commandContext.events.append({
              pageId: targetPage.id,
              namespace: "concurrent-writer",
              type: "fact-written",
              payload: { state: "written-during-core-commit" },
            });

            const filter = commandContext.filters.save({
              id: "concurrent-writer.filter.live",
              name: "Concurrent writer live filter",
              query: {
                where: [
                  {
                    field: "metadata.concurrent-writer.state",
                    op: "eq",
                    value: "written-during-core-commit",
                  },
                ],
              },
              viewType: "page.list",
            });

            return {
              filterId: filter.id,
            };
          },
        });
      },
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [concurrentWriter],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.db.transaction = async <Response,>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>> => {
      if (
        !delayedTransactionCommit &&
        queries.some((query) =>
          queryCreatesPageWithTitle(query, "In-flight core transaction page"),
        )
      ) {
        delayedTransactionCommit = true;
        transactionCommitStarted.resolve(queries);
        await releaseTransactionCommit.promise;
      }

      const result = await originalTransaction<Response>(queries);
      const operations = queries.map((query) => query.operation);

      if (
        !observedDirectWritePersistence &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.metadataSet) &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.eventsAppend) &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.filtersSave)
      ) {
        observedDirectWritePersistence = true;
        directWritePersisted.resolve(undefined);
      }

      return result;
    };

    bridge.clearCalls();

    const transactionCommit = runtime.transaction.run((tx) => {
      const page = tx.pages.create({
        title: "In-flight core transaction page",
        body: documentWithLine("in-flight-core-line", "Staged core body"),
      });

      return { pageId: page.id };
    });
    const transactionBatch = await transactionCommitStarted.promise;

    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);

    const directWrite = runtime.commands.execute(
      "concurrent-writer.write-facts",
      {},
    );

    await directWritePersisted.promise;
    await expect(directWrite).resolves.toStrictEqual({
      filterId: "concurrent-writer.filter.live",
    });
    expect(runtime.metadata.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "concurrent-writer",
          key: "state",
          value: "written-during-core-commit",
          sourcePluginId: "concurrent-writer",
        }),
      ]),
    );
    expect(runtime.events.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "concurrent-writer",
          type: "fact-written",
          payload: { state: "written-during-core-commit" },
          sourcePluginId: "concurrent-writer",
        }),
      ]),
    );
    expect(runtime.filters.get("concurrent-writer.filter.live")).toMatchObject({
      id: "concurrent-writer.filter.live",
      sourcePluginId: "concurrent-writer",
      viewType: "page.list",
    });

    releaseTransactionCommit.resolve(undefined);

    await expect(transactionCommit).resolves.toMatchObject({
      pageId: expect.stringMatching(/^page_/u),
    });
    expect(runtime.metadata.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "concurrent-writer",
          key: "state",
          value: "written-during-core-commit",
          sourcePluginId: "concurrent-writer",
        }),
      ]),
    );
    expect(runtime.events.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "concurrent-writer",
          type: "fact-written",
          payload: { state: "written-during-core-commit" },
          sourcePluginId: "concurrent-writer",
        }),
      ]),
    );
    expect(runtime.filters.get("concurrent-writer.filter.live")).toMatchObject({
      id: "concurrent-writer.filter.live",
      sourcePluginId: "concurrent-writer",
      viewType: "page.list",
    });
  });

  it("rolls back failed plugin direct metadata, event, and filter writes without erasing an unrelated committed Core transaction", async () => {
    const targetPage = pageRecord(
      "page-plugin-rollback-target",
      "Plugin rollback target",
    );
    const bridge = createRecordingNativeBridge({
      pages: [targetPage],
    });
    const releaseTransactionCommit = createDeferred<void>();
    const transactionCommitStarted = createDeferred<readonly DbQuery[]>();
    const directWritePersistStarted = createDeferred<readonly DbQuery[]>();
    const rejectDirectWrite = createDeferred<void>();
    const originalTransaction = bridge.db.transaction.bind(bridge.db);
    let delayedTransactionCommit = false;
    let delayedDirectWrite = false;
    const rollbackWriter = createPlugin("rollback-writer", {
      register(ctx) {
        ctx.commands.register({
          id: "rollback-writer.write-facts",
          title: "Write rollback facts",
          handler(_input, commandContext) {
            commandContext.metadata.set({
              pageId: targetPage.id,
              namespace: "rollback-writer",
              key: "state",
              value: "should-rollback",
              valueType: "string",
            });
            commandContext.events.append({
              pageId: targetPage.id,
              namespace: "rollback-writer",
              type: "fact-written",
              payload: { state: "should-rollback" },
            });

            const filter = commandContext.filters.save({
              id: "rollback-writer.filter.failed",
              name: "Rollback writer failed filter",
              query: {
                where: [
                  {
                    field: "metadata.rollback-writer.state",
                    op: "eq",
                    value: "should-rollback",
                  },
                ],
              },
              viewType: "page.list",
            });

            return {
              filterId: filter.id,
            };
          },
        });
      },
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [rollbackWriter],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.db.transaction = async <Response,>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>> => {
      if (
        !delayedTransactionCommit &&
        queries.some((query) =>
          queryCreatesPageWithTitle(
            query,
            "Committed core transaction during plugin rollback",
          ),
        )
      ) {
        delayedTransactionCommit = true;
        transactionCommitStarted.resolve(queries);
        await releaseTransactionCommit.promise;

        return originalTransaction<Response>(queries);
      }

      const operations = queries.map((query) => query.operation);

      if (
        !delayedDirectWrite &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.metadataSet) &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.eventsAppend) &&
        operations.includes(DB_PERSISTENCE_OPERATIONS.filtersSave)
      ) {
        delayedDirectWrite = true;
        directWritePersistStarted.resolve(queries);
        await rejectDirectWrite.promise;
        throw new Error(
          "SQLITE_BUSY SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
        );
      }

      return originalTransaction<Response>(queries);
    };

    bridge.clearCalls();

    const transactionCommit = runtime.transaction.run((tx) => {
      const page = tx.pages.create({
        title: "Committed core transaction during plugin rollback",
        body: documentWithLine(
          "committed-plugin-rollback-line",
          "Committed while plugin rollback is pending",
        ),
      });

      return { pageId: page.id };
    });
    const transactionBatch = await transactionCommitStarted.promise;

    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    ]);

    const directWrite = runtime.commands.execute(
      "rollback-writer.write-facts",
      {},
    );
    const directBatch = await directWritePersistStarted.promise;

    expect(directBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.metadataSet,
      DB_PERSISTENCE_OPERATIONS.eventsAppend,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(runtime.metadata.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "rollback-writer",
          key: "state",
          value: "should-rollback",
          sourcePluginId: "rollback-writer",
        }),
      ]),
    );
    expect(runtime.events.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "rollback-writer",
          type: "fact-written",
          payload: { state: "should-rollback" },
          sourcePluginId: "rollback-writer",
        }),
      ]),
    );
    expect(runtime.filters.get("rollback-writer.filter.failed")).toMatchObject({
      id: "rollback-writer.filter.failed",
      sourcePluginId: "rollback-writer",
      viewType: "page.list",
    });

    releaseTransactionCommit.resolve(undefined);

    const transactionResult = await transactionCommit;

    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "Committed core transaction during plugin rollback",
    });

    rejectDirectWrite.resolve(undefined);

    await expect(directWrite).rejects.toThrow(
      "COMMAND_HANDLER_FAILED: rollback-writer.write-facts",
    );
    expect(runtime.metadata.list()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "rollback-writer",
          key: "state",
        }),
      ]),
    );
    expect(runtime.events.list()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: targetPage.id,
          namespace: "rollback-writer",
          type: "fact-written",
        }),
      ]),
    );
    expect(runtime.filters.list()).not.toContainEqual(
      expect.objectContaining({ id: "rollback-writer.filter.failed" }),
    );
    expect(runtime.pages.get(transactionResult.pageId)).toMatchObject({
      title: "Committed core transaction during plugin rollback",
    });
  });

  it("does not let plugin direct store writes bypass SQLite transaction semantics", async () => {
    const bridge = createRecordingNativeBridge();
    const directWriter = createPlugin("direct-writer", {
      register(ctx) {
        ctx.commands.register({
          id: "direct-writer.write",
          title: "Direct writer",
          handler(_input, commandContext) {
            const page = commandContext.pages.create({
              title: "Plugin direct page",
              body: documentWithLine("plugin-direct-line", "Plugin direct body"),
            });

            commandContext.metadata.set({
              pageId: page.id,
              namespace: "direct-writer",
              key: "state",
              value: "direct",
              valueType: "string",
            });
            commandContext.events.append({
              pageId: page.id,
              namespace: "direct-writer",
              type: "direct-write",
              payload: { mode: "direct" },
            });

            const filter = commandContext.filters.save({
              id: "direct-writer.filter.direct",
              name: "Direct writer filter",
              query: {
                where: [
                  {
                    field: "metadata.direct-writer.state",
                    op: "eq",
                    value: "direct",
                  },
                ],
              },
              viewType: "page.list",
            });

            return {
              filterId: filter.id,
              pageId: page.id,
            };
          },
        });
      },
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [directWriter],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.clearCalls();

    const commandResult = await runtime.commands.execute(
      "direct-writer.write",
      {},
    );

    expect(commandResult).toMatchObject({
      filterId: "direct-writer.filter.direct",
      pageId: expect.stringMatching(/^page_/u),
    });

    const writeBatch = findNativeTransactionContaining(
      bridge,
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
    );

    expect(writeBatch?.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesCreate,
      DB_PERSISTENCE_OPERATIONS.metadataSet,
      DB_PERSISTENCE_OPERATIONS.eventsAppend,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(writeBatch?.map((query) => payloadRecord(query))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Plugin direct page" }),
        expect.objectContaining({
          namespace: "direct-writer",
          key: "state",
          sourcePluginId: "direct-writer",
        }),
        expect.objectContaining({
          namespace: "direct-writer",
          type: "direct-write",
          sourcePluginId: "direct-writer",
        }),
        expect.objectContaining({
          id: "direct-writer.filter.direct",
          sourcePluginId: "direct-writer",
        }),
      ]),
    );
  });

  it("does not reject unrelated read-only plugin commands while another command is pending", async () => {
    const readablePage = pageRecord("page-readable", "Readable page", {
      body: documentWithLine("readable-line", "Readable body"),
    });
    const slowCommandStarted = createDeferred<void>();
    const releaseSlowCommand = createDeferred<void>();
    const bridge = createRecordingNativeBridge({
      pages: [readablePage],
    });
    const slowReader = createPlugin("slow-reader", {
      register(ctx) {
        ctx.commands.register({
          id: "slow-reader.wait",
          title: "Slow read-only command",
          async handler(_input, commandContext) {
            expect(commandContext.pages.list()).toStrictEqual([readablePage]);
            slowCommandStarted.resolve(undefined);
            await releaseSlowCommand.promise;

            return {
              pageCount: commandContext.pages.list().length,
            };
          },
        });
      },
    });
    const fastReader = createPlugin("fast-reader", {
      register(ctx) {
        ctx.commands.register({
          id: "fast-reader.read",
          title: "Fast read-only command",
          handler(_input, commandContext) {
            return {
              pageTitles: commandContext.pages
                .list()
                .map((page) => page.title),
            };
          },
        });
      },
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [slowReader, fastReader],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;

    bridge.clearCalls();

    const slowCommand = runtime.commands.execute("slow-reader.wait", {});

    await slowCommandStarted.promise;

    const fastCommand = runtime.commands.execute("fast-reader.read", {});
    const fastExpectation = expect(fastCommand).resolves.toStrictEqual({
      pageTitles: ["Readable page"],
    });

    await Promise.resolve();
    releaseSlowCommand.resolve(undefined);

    await fastExpectation;
    await expect(slowCommand).resolves.toStrictEqual({
      pageCount: 1,
    });
    expect(
      bridge.calls.filter((call) => call.kind === "transaction"),
    ).toStrictEqual([]);
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

  it("does not silently create a missing native filter when updating a live-only filter", async () => {
    const bridge = createRecordingNativeBridge();
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;
    let liveOnlyFilter: FilterDefinition | undefined;

    bridge.clearCalls();

    const directSaveError = captureSyncError(() => {
      liveOnlyFilter = runtime.filters.save({
        id: "test-plugin.filter.live-only",
        name: "Live-only filter",
        query: { where: [] },
        viewType: "page.list",
        sourcePluginId: "test-plugin",
      });
    });

    if (directSaveError !== undefined) {
      expect(runtime.filters.list()).not.toContainEqual(
        expect.objectContaining({ id: "test-plugin.filter.live-only" }),
      );

      return;
    }

    expect(liveOnlyFilter).toBeDefined();

    const updateError = await captureError(async () => {
      await runtime.transaction.run((tx) => {
        tx.filters.update(expectDefined(liveOnlyFilter).id, {
          name: "Should not be created natively",
        });
      });
    });
    const transactionBatch = expectSingleNativeTransaction(bridge);

    expect(updateError).toBeDefined();
    expect(String(updateError)).not.toMatch(leakPattern);
    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.filtersGet,
      DB_PERSISTENCE_OPERATIONS.filtersSave,
    ]);
    expect(runtime.filters.get(expectDefined(liveOnlyFilter).id)).toMatchObject({
      name: "Live-only filter",
    });
  });

  it("persists page update, page archive, metadata delete, and filter delete through one native transaction", async () => {
    const updateTarget = pageRecord("page-update-target", "Update target", {
      body: documentWithLine("update-target-line", "Original body"),
    });
    const archiveTarget = pageRecord("page-archive-target", "Archive target");
    const metadataToDelete = metadataRecord(
      "metadata-delete-target",
      updateTarget.id,
      "test-plugin",
      "obsolete",
      "remove me",
      "string",
      "test-plugin",
    );
    const filterToDelete = filterRecord(
      "test-plugin.filter.delete-target",
      "Delete target",
      "test-plugin",
      "page.list",
    );
    const bridge = createRecordingNativeBridge({
      filters: [filterToDelete],
      metadata: [metadataToDelete],
      pages: [updateTarget, archiveTarget],
    });
    const runtime = (await createAppRuntime({
      builtInPlugins: [],
      createNativeBridge: () => bridge,
    })) as RuntimeWithStorage;
    const updatedBody = documentWithLine(
      "updated-target-line",
      "Updated durable body",
    );

    bridge.clearCalls();

    const transactionResult = await runtime.transaction.run((tx) => {
      const updated = tx.pages.update(updateTarget.id, {
        title: "Updated durable title",
        parentPageId: archiveTarget.id,
        body: updatedBody,
      });
      const archived = tx.pages.archive(archiveTarget.id);
      const deletedMetadata = tx.metadata.delete(
        updateTarget.id,
        "test-plugin",
        "obsolete",
      );
      const deletedFilter = tx.filters.delete(filterToDelete.id);

      return {
        archivedAt: archived.archivedAt,
        deletedFilterId: deletedFilter.id,
        deletedMetadataId: deletedMetadata.id,
        updatedTitle: updated.title,
      };
    });
    const transactionBatch = expectSingleNativeTransaction(bridge);

    expect(transactionResult).toMatchObject({
      archivedAt: expect.any(String),
      deletedFilterId: filterToDelete.id,
      deletedMetadataId: metadataToDelete.id,
      updatedTitle: "Updated durable title",
    });
    expect(transactionBatch.map((query) => query.operation)).toStrictEqual([
      DB_PERSISTENCE_OPERATIONS.pagesUpdate,
      DB_PERSISTENCE_OPERATIONS.pagesArchive,
      DB_PERSISTENCE_OPERATIONS.metadataDelete,
      DB_PERSISTENCE_OPERATIONS.filtersDelete,
    ]);
    expect(payloadRecord(transactionBatch[0])).toMatchObject({
      id: updateTarget.id,
      title: "Updated durable title",
      parentPageId: archiveTarget.id,
      body: updatedBody,
    });
    expect(payloadRecord(transactionBatch[1])).toStrictEqual({
      id: archiveTarget.id,
      archivedAt: transactionResult.archivedAt,
    });
    expect(payloadRecord(transactionBatch[2])).toStrictEqual({
      pageId: updateTarget.id,
      namespace: "test-plugin",
      key: "obsolete",
    });
    expect(payloadRecord(transactionBatch[3])).toStrictEqual({
      id: filterToDelete.id,
    });
    expect(runtime.pages.get(updateTarget.id)).toMatchObject({
      body: updatedBody,
      parentPageId: archiveTarget.id,
      title: "Updated durable title",
    });
    expect(runtime.pages.get(archiveTarget.id).archivedAt).toBe(
      transactionResult.archivedAt,
    );
    expect(
      captureSyncError(() =>
        runtime.metadata.get(updateTarget.id, "test-plugin", "obsolete"),
      ),
    ).toBeDefined();
    expect(captureSyncError(() => runtime.filters.get(filterToDelete.id)))
      .toBeDefined();
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

  it("fails closed with a redacted startup error when native hydration returns null records", async () => {
    const bridge = createRecordingNativeBridge({
      queryResponses: new Map([[DB_PERSISTENCE_OPERATIONS.pagesList, null]]),
    });

    const startupError = await captureError(async () => {
      await createAppRuntime({
        builtInPlugins: [],
        createNativeBridge: () => bridge,
      });
    });

    expect(startupError).toBeDefined();
    expect(String(startupError)).toMatch(/Native command failed/u);
    expect(String(startupError)).not.toMatch(leakPattern);
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
  let state: NativeDbState = {
    pages: new Map(
      (options.pages ?? []).map((page) => [page.id, cloneData(page)]),
    ),
    metadata: (options.metadata ?? []).map(cloneData),
    events: (options.events ?? []).map(cloneData),
    filters: new Map(
      (options.filters ?? []).map((filter) => [filter.id, cloneData(filter)]),
    ),
  };
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

        return responseForQuery(query, state) as Response;
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

        const draft = cloneNativeDbState(state);
        const context: TransactionResponseContext = {
          missingFilterGets: new Set(),
        };
        const responses = queries.map((query) =>
          responseForQuery(query, draft, context),
        );

        state = draft;

        return responses as NativeBridgeTransactionResult<Response>;
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

  function responseForQuery(
    query: DbQuery,
    targetState: NativeDbState,
    context?: TransactionResponseContext,
  ): unknown {
    if (options.rejectOperations?.has(query.operation)) {
      throw new Error(
        "SELECT * FROM core_pages at /home/aac6fef/private.sqlite token=secret-token",
      );
    }

    if (options.queryResponses?.has(query.operation)) {
      return options.queryResponses.get(query.operation);
    }

    switch (query.operation) {
      case DB_PERSISTENCE_OPERATIONS.pagesList:
        return [...targetState.pages.values()].map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.pagesGet:
        return cloneData(targetState.pages.get(readPayloadId(query)) ?? null);
      case DB_PERSISTENCE_OPERATIONS.pagesCreate:
        targetState.pages.set(readPayloadId(query), pageFromPayload(query));
        return null;
      case DB_PERSISTENCE_OPERATIONS.pagesUpdate:
        updateNativePage(targetState, query);
        return null;
      case DB_PERSISTENCE_OPERATIONS.pagesArchive:
        archiveNativePage(targetState, query);
        return null;
      case DB_PERSISTENCE_OPERATIONS.metadataListForPage:
        return targetState.metadata
          .filter((record) => record.pageId === readPayloadPageId(query))
          .map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.metadataGet: {
        const payload = payloadRecord(query);

        return cloneData(
          targetState.metadata.find(
            (record) =>
              record.pageId === payload.pageId &&
              record.namespace === payload.namespace &&
              record.key === payload.key,
          ) ?? null,
        );
      }
      case DB_PERSISTENCE_OPERATIONS.metadataSet:
        setNativeMetadata(targetState, query);
        return null;
      case DB_PERSISTENCE_OPERATIONS.metadataDelete:
        deleteNativeMetadata(targetState, query);
        return null;
      case DB_PERSISTENCE_OPERATIONS.eventsList:
        return targetState.events.map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.eventsAppend:
        targetState.events.push(eventFromPayload(query));
        return null;
      case DB_PERSISTENCE_OPERATIONS.filtersList:
        return [...targetState.filters.values()].map(cloneData);
      case DB_PERSISTENCE_OPERATIONS.filtersGet: {
        const filterId = readPayloadId(query);
        const filter = targetState.filters.get(filterId) ?? null;

        if (filter === null) {
          context?.missingFilterGets.add(filterId);
        }

        return cloneData(filter);
      }
      case DB_PERSISTENCE_OPERATIONS.filtersSave:
        saveNativeFilter(targetState, query, context);
        return null;
      case DB_PERSISTENCE_OPERATIONS.filtersDelete:
        deleteNativeFilter(targetState, query);
        return null;
    }
  }
}

function cloneNativeDbState(state: NativeDbState): NativeDbState {
  return {
    pages: new Map(
      [...state.pages].map(([pageId, page]) => [pageId, cloneData(page)]),
    ),
    metadata: state.metadata.map(cloneData),
    events: state.events.map(cloneData),
    filters: new Map(
      [...state.filters].map(([filterId, filter]) => [
        filterId,
        cloneData(filter),
      ]),
    ),
  };
}

function pageFromPayload(query: DbQuery): MarkdownPage {
  const payload = payloadRecord(query);

  return {
    id: readStringPayload(payload, "id"),
    title: readStringPayload(payload, "title"),
    body: payload.body as StructuredMarkdownDocument,
    createdAt: readStringPayload(payload, "createdAt"),
    updatedAt: readStringPayload(payload, "updatedAt"),
    ...(typeof payload.parentPageId === "string"
      ? { parentPageId: payload.parentPageId }
      : {}),
    ...(typeof payload.archivedAt === "string"
      ? { archivedAt: payload.archivedAt }
      : {}),
  };
}

function updateNativePage(state: NativeDbState, query: DbQuery): void {
  const payload = payloadRecord(query);
  const pageId = readStringPayload(payload, "id");
  const current = state.pages.get(pageId);

  if (current === undefined) {
    throw new Error("Native command failed");
  }

  const next: MarkdownPage = {
    ...current,
    title:
      typeof payload.title === "string" ? payload.title : current.title,
    body:
      payload.body === undefined
        ? current.body
        : (payload.body as StructuredMarkdownDocument),
    updatedAt:
      typeof payload.updatedAt === "string"
        ? payload.updatedAt
        : current.updatedAt,
  };

  if (payload.parentPageId === null) {
    delete next.parentPageId;
  } else if (typeof payload.parentPageId === "string") {
    next.parentPageId = payload.parentPageId;
  }

  state.pages.set(pageId, cloneData(next));
}

function archiveNativePage(state: NativeDbState, query: DbQuery): void {
  const payload = payloadRecord(query);
  const pageId = readStringPayload(payload, "id");
  const current = state.pages.get(pageId);

  if (current === undefined) {
    throw new Error("Native command failed");
  }

  state.pages.set(pageId, {
    ...current,
    archivedAt: readStringPayload(payload, "archivedAt"),
    updatedAt: readStringPayload(payload, "archivedAt"),
  });
}

function setNativeMetadata(state: NativeDbState, query: DbQuery): void {
  const record = metadataFromPayload(query);
  const existingIndex = state.metadata.findIndex(
    (candidate) =>
      candidate.pageId === record.pageId &&
      candidate.namespace === record.namespace &&
      candidate.key === record.key,
  );

  if (existingIndex >= 0) {
    state.metadata[existingIndex] = record;
  } else {
    state.metadata.push(record);
  }
}

function deleteNativeMetadata(state: NativeDbState, query: DbQuery): void {
  const payload = payloadRecord(query);
  const pageId = readStringPayload(payload, "pageId");
  const namespace = readStringPayload(payload, "namespace");
  const key = readStringPayload(payload, "key");
  const existingIndex = state.metadata.findIndex(
    (record) =>
      record.pageId === pageId &&
      record.namespace === namespace &&
      record.key === key,
  );

  if (existingIndex < 0) {
    throw new Error("Native command failed");
  }

  state.metadata.splice(existingIndex, 1);
}

function eventFromPayload(query: DbQuery): AppEvent {
  const payload = payloadRecord(query);
  const event: AppEvent = {
    id: readStringPayload(payload, "id"),
    namespace: readStringPayload(payload, "namespace"),
    type: readStringPayload(payload, "type"),
    payload: payload.payload,
    sourcePluginId: readStringPayload(payload, "sourcePluginId"),
    createdAt: readStringPayload(payload, "createdAt"),
  };

  if (typeof payload.pageId === "string") {
    event.pageId = payload.pageId;
  }

  return event;
}

function metadataFromPayload(query: DbQuery): MetadataRecord {
  const payload = payloadRecord(query);

  return {
    id: readStringPayload(payload, "id"),
    pageId: readStringPayload(payload, "pageId"),
    namespace: readStringPayload(payload, "namespace"),
    key: readStringPayload(payload, "key"),
    value: payload.value,
    valueType: readStringPayload(payload, "valueType") as MetadataRecord["valueType"],
    sourcePluginId: readStringPayload(payload, "sourcePluginId"),
    createdAt: readStringPayload(payload, "createdAt"),
    updatedAt: readStringPayload(payload, "updatedAt"),
  };
}

function saveNativeFilter(
  state: NativeDbState,
  query: DbQuery,
  context?: TransactionResponseContext,
): void {
  const filter = filterFromPayload(query);

  if (context?.missingFilterGets.has(filter.id) === true) {
    throw new Error("Native command failed");
  }

  state.filters.set(filter.id, filter);
}

function deleteNativeFilter(state: NativeDbState, query: DbQuery): void {
  const filterId = readPayloadId(query);

  if (!state.filters.delete(filterId)) {
    throw new Error("Native command failed");
  }
}

function filterFromPayload(query: DbQuery): FilterDefinition {
  const payload = payloadRecord(query);
  const filter: FilterDefinition = {
    id: readStringPayload(payload, "id"),
    name: readStringPayload(payload, "name"),
    query: payload.query as FilterDefinition["query"],
    viewType: readStringPayload(payload, "viewType"),
    createdAt: readStringPayload(payload, "createdAt"),
    updatedAt: readStringPayload(payload, "updatedAt"),
  };

  if (Array.isArray(payload.sort)) {
    filter.sort = payload.sort as FilterDefinition["sort"];
  }

  if (
    typeof payload.group === "object" &&
    payload.group !== null &&
    !Array.isArray(payload.group)
  ) {
    filter.group = payload.group as FilterDefinition["group"];
  }

  if (typeof payload.sourcePluginId === "string") {
    filter.sourcePluginId = payload.sourcePluginId;
  }

  return filter;
}

function pageRecord(
  id: string,
  title: string,
  options: {
    archivedAt?: string;
    body?: StructuredMarkdownDocument;
    parentPageId?: string;
  } = {},
): MarkdownPage {
  const page: MarkdownPage = {
    id,
    title,
    body: options.body ?? emptyDocument(),
    createdAt: instant,
    updatedAt: instant,
  };

  if (options.parentPageId !== undefined) {
    page.parentPageId = options.parentPageId;
  }

  if (options.archivedAt !== undefined) {
    page.archivedAt = options.archivedAt;
  }

  return page;
}

function metadataRecord(
  id: string,
  pageId: string,
  namespace: string,
  key: string,
  value: unknown,
  valueType: MetadataRecord["valueType"],
  sourcePluginId: string,
): MetadataRecord {
  return {
    id,
    pageId,
    namespace,
    key,
    value,
    valueType,
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
  sourcePluginId = namespace,
): AppEvent {
  return {
    id,
    pageId,
    namespace,
    type,
    payload,
    sourcePluginId,
    createdAt: instant,
  };
}

function filterRecord(
  id: string,
  name: string,
  sourcePluginId: string,
  viewType: string,
  options: Partial<Pick<FilterDefinition, "group" | "query" | "sort">> = {},
): FilterDefinition {
  const filter: FilterDefinition = {
    id,
    name,
    query: options.query ?? {
      where: [{ field: "metadata.tag.tags", op: "includes", value: "today" }],
    },
    viewType,
    sourcePluginId,
    createdAt: instant,
    updatedAt: instant,
  };

  if (options.sort !== undefined) {
    filter.sort = options.sort;
  }

  if (options.group !== undefined) {
    filter.group = options.group;
  }

  return filter;
}

function emptyDocument(): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [],
  };
}

function documentWithLine(
  blockId: string,
  text: string,
): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId,
        type: "markdown.line",
        text,
      },
    ],
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

function findNativeTransactionContaining(
  bridge: RecordingNativeBridge,
  operation: DbPersistenceOperation,
): readonly DbQuery[] | undefined {
  return bridge.calls
    .filter((call): call is Extract<NativeDbCall, { kind: "transaction" }> =>
      call.kind === "transaction",
    )
    .map((call) => call.queries)
    .find((queries) => queries.some((query) => query.operation === operation));
}

function queryCreatesPageWithTitle(query: DbQuery, title: string): boolean {
  return (
    query.operation === DB_PERSISTENCE_OPERATIONS.pagesCreate &&
    payloadRecord(query).title === title
  );
}

function createDeferred<Value>(): Deferred<Value> {
  let resolveDeferred:
    | ((value: Value | PromiseLike<Value>) => void)
    | undefined;
  let rejectDeferred: ((error: unknown) => void) | undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });

  return {
    promise,
    resolve(value) {
      expect(resolveDeferred).toBeDefined();
      expect(rejectDeferred).toBeDefined();
      expectDefined(resolveDeferred)(value);
    },
    reject(error) {
      expect(resolveDeferred).toBeDefined();
      expect(rejectDeferred).toBeDefined();
      expectDefined(rejectDeferred)(error);
    },
  };
}

function expectDefined<Value>(value: Value | undefined): Value {
  expect(value).toBeDefined();

  return value as Value;
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

function readStringPayload(payload: JsonRecord, key: string): string {
  const value = payload[key];

  if (typeof value !== "string") {
    throw new Error(`Expected payload ${key}`);
  }

  return value;
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

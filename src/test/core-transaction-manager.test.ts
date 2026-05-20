import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createCoreStores,
  createInMemoryAppRuntime,
  MetadataStoreError,
} from "../core";
import type {
  CoreRuntime,
  CoreTransaction,
  AppEvent,
  FilterDefinition,
  FilterQuery,
  MarkdownPage,
  MetadataRecord,
  StructuredMarkdownDocument,
  TransactionHandler,
} from "../core";

describe("in-memory Transaction Manager", () => {
  it("commits page, metadata, event, and filter writes together and preserves the handler result", async () => {
    const runtime = createRuntime({
      ids: [
        "page_created",
        "metadata_created",
        "event_created",
        "filter_created",
      ],
      instants: [
        "2026-05-20T01:00:00.000Z",
        "2026-05-20T01:01:00.000Z",
        "2026-05-20T01:02:00.000Z",
        "2026-05-20T01:03:00.000Z",
      ],
    });

    const result = await runtime.transaction.run(async (tx: CoreTransaction) => {
      const page = tx.pages.create({
        title: "Transaction page",
        body: documentWithText("inside transaction"),
      });
      const metadata = tx.metadata.set({
        pageId: page.id,
        namespace: "task",
        key: "status",
        value: "todo",
        valueType: "string",
        sourcePluginId: "task",
      });
      const event = tx.events.append({
        pageId: page.id,
        namespace: "task",
        type: "created",
        payload: { pageId: page.id },
        sourcePluginId: "task",
      });
      const filter = tx.filters.save({
        name: "Task pages",
        query: existsQuery("metadata.task.status"),
        viewType: "task.list",
        sourcePluginId: "task",
      });

      expect(tx.pages.get(page.id)).toStrictEqual(page);
      expect(tx.metadata.get(page.id, "task", "status")).toStrictEqual(
        metadata,
      );
      expect(tx.events.list({ pageId: page.id })).toStrictEqual([event]);
      expect(tx.filters.get(filter.id)).toStrictEqual(filter);
      expect(runtime.pages.list()).toStrictEqual([]);
      expect(runtime.metadata.list()).toStrictEqual([]);
      expect(runtime.events.list()).toStrictEqual([]);
      expect(runtime.filters.list()).toStrictEqual([]);

      return {
        pageId: page.id,
        metadataId: metadata.id,
        eventId: event.id,
        filterId: filter.id,
      };
    });

    expect(result).toStrictEqual({
      pageId: "page_created",
      metadataId: "metadata_created",
      eventId: "event_created",
      filterId: "filter_created",
    });
    expect(runtime.pages.list()).toHaveLength(1);
    expect(runtime.metadata.list()).toHaveLength(1);
    expect(runtime.events.list()).toHaveLength(1);
    expect(runtime.filters.list()).toHaveLength(1);
    expect(runtime.pages.get("page_created")).toStrictEqual({
      id: "page_created",
      title: "Transaction page",
      body: documentWithText("inside transaction"),
      createdAt: "2026-05-20T01:00:00.000Z",
      updatedAt: "2026-05-20T01:00:00.000Z",
    });
    expect(
      runtime.metadata.get("page_created", "task", "status"),
    ).toStrictEqual({
      id: "metadata_created",
      pageId: "page_created",
      namespace: "task",
      key: "status",
      value: "todo",
      valueType: "string",
      sourcePluginId: "task",
      createdAt: "2026-05-20T01:01:00.000Z",
      updatedAt: "2026-05-20T01:01:00.000Z",
    });
    expect(runtime.events.list({ pageId: "page_created" })).toStrictEqual([
      {
        id: "event_created",
        pageId: "page_created",
        namespace: "task",
        type: "created",
        payload: { pageId: "page_created" },
        sourcePluginId: "task",
        createdAt: "2026-05-20T01:02:00.000Z",
      },
    ]);
    expect(runtime.filters.get("filter_created")).toStrictEqual({
      id: "filter_created",
      name: "Task pages",
      query: existsQuery("metadata.task.status"),
      viewType: "task.list",
      sourcePluginId: "task",
      createdAt: "2026-05-20T01:03:00.000Z",
      updatedAt: "2026-05-20T01:03:00.000Z",
    });
  });

  it("keeps live stores unchanged while an async transaction is pending, then publishes on commit", async () => {
    const runtime = createRuntime({
      ids: ["page_pending"],
      instants: ["2026-05-20T02:00:00.000Z"],
    });
    const staged = createDeferred<void>();
    const commit = createDeferred<void>();

    const running = runtime.transaction.run(async (tx: CoreTransaction) => {
      const page = tx.pages.create({
        title: "Pending page",
        body: documentWithText("pending"),
      });

      expect(tx.pages.get(page.id)).toStrictEqual(page);
      staged.resolve();

      await commit.promise;

      return page.id;
    });

    await staged.promise;

    expect(runtime.pages.list()).toStrictEqual([]);

    commit.resolve();

    await expect(running).resolves.toBe("page_pending");
    expect(runtime.pages.list()).toStrictEqual([
      {
        id: "page_pending",
        title: "Pending page",
        body: documentWithText("pending"),
        createdAt: "2026-05-20T02:00:00.000Z",
        updatedAt: "2026-05-20T02:00:00.000Z",
      },
    ]);
  });

  it("rejects nested and concurrent transactions through the same runtime manager", async () => {
    const runtime = createRuntime({
      ids: ["page_outer"],
      instants: ["2026-05-20T02:30:00.000Z"],
    });
    const staged = createDeferred<void>();
    const finish = createDeferred<void>();

    const running = runtime.transaction.run(async (tx: CoreTransaction) => {
      tx.pages.create({
        title: "Outer transaction",
        body: documentWithText("outer"),
      });
      staged.resolve();

      await expect(
        runtime.transaction.run(() => "nested"),
      ).rejects.toThrow("A Core transaction is already running");

      await finish.promise;

      return "outer";
    });

    await staged.promise;
    await expect(runtime.transaction.run(() => "concurrent")).rejects.toThrow(
      "A Core transaction is already running",
    );

    finish.resolve();

    await expect(running).resolves.toBe("outer");
    expect(runtime.pages.list()).toHaveLength(1);
  });

  it("rejects commit when live stores changed during a pending transaction and preserves the live write", async () => {
    const runtime = createRuntime({
      ids: ["page_tx", "page_live"],
      instants: [
        "2026-05-20T02:40:00.000Z",
        "2026-05-20T02:41:00.000Z",
      ],
    });
    const staged = createDeferred<void>();
    const commit = createDeferred<void>();

    const running = runtime.transaction.run(async (tx: CoreTransaction) => {
      tx.pages.create({
        title: "Transaction page",
        body: documentWithText("tx"),
      });
      staged.resolve();

      await commit.promise;

      return "should not commit";
    });

    await staged.promise;

    const livePage = runtime.pages.create({
      title: "Live page",
      body: documentWithText("live"),
    });

    commit.resolve();

    await expect(running).rejects.toThrow(
      "Core transaction conflict: live page store changed before commit",
    );
    expect(runtime.pages.list()).toStrictEqual([livePage]);
  });

  it("rolls back staged writes when a synchronous handler throws", async () => {
    const runtime = createSeededRuntime();
    const baseline = snapshot(runtime);
    const failure = new Error("sync rollback");

    await expect(
      runtime.transaction.run((tx: CoreTransaction) => {
        tx.pages.update("page_seed", {
          title: "Mutated in transaction",
          body: documentWithText("mutated"),
        });
        tx.pages.archive("page_seed");
        tx.pages.create({
          title: "Created then rolled back",
          body: documentWithText("new"),
        });
        tx.metadata.set({
          pageId: "page_seed",
          namespace: "task",
          key: "status",
          value: "done",
          valueType: "string",
          sourcePluginId: "task",
        });
        tx.metadata.delete("page_seed", "task", "status");
        tx.events.append({
          pageId: "page_seed",
          namespace: "task",
          type: "rolled-back",
          payload: { changed: true },
          sourcePluginId: "task",
        });
        tx.filters.update("filter_seed", {
          name: "Mutated filter",
          query: eqQuery("metadata.task.status", "done"),
        });
        tx.filters.delete("filter_seed");

        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(snapshot(runtime)).toStrictEqual(baseline);
  });

  it("rolls back staged writes when an async handler rejects after awaiting", async () => {
    const runtime = createSeededRuntime();
    const baseline = snapshot(runtime);
    const failure = new Error("async rollback");

    await expect(
      runtime.transaction.run(async (tx: CoreTransaction) => {
        tx.pages.create({
          title: "Async rolled back",
          body: documentWithText("async"),
        });
        tx.metadata.set({
          pageId: "page_seed",
          namespace: "task",
          key: "priority",
          value: 5,
          valueType: "number",
          sourcePluginId: "task",
        });
        tx.events.append({
          pageId: "page_seed",
          namespace: "task",
          type: "async-rolled-back",
          payload: { changed: true },
          sourcePluginId: "task",
        });
        tx.filters.save({
          name: "Async rolled back filter",
          query: existsQuery("metadata.task.priority"),
          viewType: "task.list",
          sourcePluginId: "task",
        });

        await Promise.resolve();

        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(snapshot(runtime)).toStrictEqual(baseline);
  });

  it("rolls back earlier staged writes when store validation fails inside a transaction", async () => {
    const runtime = createSeededRuntime();
    const baseline = snapshot(runtime);

    await expect(
      runtime.transaction.run((tx: CoreTransaction) => {
        tx.pages.create({
          title: "Should roll back",
          body: documentWithText("rolled back"),
        });
        tx.metadata.set({
          pageId: "page_seed",
          namespace: "task",
          key: "invalidType",
          value: 10,
          valueType: "string",
          sourcePluginId: "task",
        });
      }),
    ).rejects.toMatchObject({
      name: "MetadataStoreError",
      code: "METADATA_VALUE_TYPE_MISMATCH",
    });
    await expect(
      runtime.transaction.run((tx: CoreTransaction) => {
        tx.pages.create({
          title: "Should roll back again",
          body: documentWithText("rolled back"),
        });
        tx.metadata.set({
          pageId: "page_seed",
          namespace: "task",
          key: "invalidType",
          value: 10,
          valueType: "string",
          sourcePluginId: "task",
        });
      }),
    ).rejects.toBeInstanceOf(MetadataStoreError);

    expect(snapshot(runtime)).toStrictEqual(baseline);
  });

  it("keeps defensive clone boundaries for transactional reads and committed runtime reads", async () => {
    const runtime = createRuntime({
      ids: ["page_clone", "metadata_clone"],
      instants: [
        "2026-05-20T04:00:00.000Z",
        "2026-05-20T04:01:00.000Z",
      ],
    });
    let pageId = "";

    await runtime.transaction.run((tx: CoreTransaction) => {
      const page = tx.pages.create({
        title: "Clone page",
        body: documentWithText("original"),
      });
      const metadata = tx.metadata.set({
        pageId: page.id,
        namespace: "clone",
        key: "payload",
        value: { nested: ["original"] },
        valueType: "json",
        sourcePluginId: "clone",
      });
      const event = tx.events.append({
        pageId: page.id,
        namespace: "clone",
        type: "payload",
        payload: { nested: ["original"] },
        sourcePluginId: "clone",
      });
      const filter = tx.filters.save({
        name: "Clone filter",
        query: eqQuery("metadata.clone.payload", { nested: ["original"] }),
        viewType: "clone.list",
        sourcePluginId: "clone",
      });

      pageId = page.id;
      mutatePage(page, "mutated return");
      mutateMetadata(metadata, "mutated return");
      mutateEvent(event, "mutated return");
      mutateFilter(filter, "mutated return");

      expect(pageText(tx.pages.get(page.id))).toBe("original");
      expect(
        metadataValue(tx.metadata.get(page.id, "clone", "payload")).nested[0],
      ).toBe("original");
      expect(eventPayload(tx.events.list({ pageId: page.id })[0]!).nested[0])
        .toBe("original");
      expect(filterValue(tx.filters.get(filter.id)).nested[0]).toBe(
        "original",
      );

      const readPage = tx.pages.get(page.id);
      const readMetadata = tx.metadata.get(page.id, "clone", "payload");
      const readEvent = tx.events.list({ pageId: page.id })[0]!;
      const readFilter = tx.filters.get(filter.id);

      mutatePage(readPage, "mutated read");
      mutateMetadata(readMetadata, "mutated read");
      mutateEvent(readEvent, "mutated read");
      mutateFilter(readFilter, "mutated read");

      expect(pageText(tx.pages.get(page.id))).toBe("original");
      expect(
        metadataValue(tx.metadata.get(page.id, "clone", "payload")).nested[0],
      ).toBe("original");
      expect(eventPayload(tx.events.list({ pageId: page.id })[0]!).nested[0])
        .toBe("original");
      expect(filterValue(tx.filters.get(filter.id)).nested[0]).toBe(
        "original",
      );
    });

    const committedPage = runtime.pages.get(pageId);
    const committedMetadata = runtime.metadata.get(pageId, "clone", "payload");
    const committedEvent = runtime.events.list({ pageId })[0]!;
    const committedFilter = runtime.filters.list()[0]!;

    mutatePage(committedPage, "mutated committed read");
    mutateMetadata(committedMetadata, "mutated committed read");
    mutateEvent(committedEvent, "mutated committed read");
    mutateFilter(committedFilter, "mutated committed read");

    expect(pageText(runtime.pages.get(pageId))).toBe("original");
    expect(
      metadataValue(runtime.metadata.get(pageId, "clone", "payload")).nested[0],
    ).toBe("original");
    expect(eventPayload(runtime.events.list({ pageId })[0]!).nested[0]).toBe(
      "original",
    );
    expect(filterValue(runtime.filters.list()[0]!).nested[0]).toBe("original");
  });

  it("does not expose transaction participants as discoverable store properties", () => {
    const runtime = createRuntime({
      ids: [],
      instants: [],
    });

    expect(Object.getOwnPropertySymbols(runtime.pages)).toStrictEqual([]);
    expect(Object.getOwnPropertySymbols(runtime.metadata)).toStrictEqual([]);
    expect(Object.getOwnPropertySymbols(runtime.events)).toStrictEqual([]);
    expect(Object.getOwnPropertySymbols(runtime.filters)).toStrictEqual([]);
  });

  it("keeps transaction handler types aligned with the public transaction context", () => {
    expectTypeOf<TransactionHandler<number>>().toEqualTypeOf<
      (transaction: CoreTransaction) => number | Promise<number>
    >();
    expectTypeOf<CoreRuntime["transaction"]["run"]>().parameter(0).toExtend<
      TransactionHandler<unknown>
    >();
    expectTypeOf<CoreTransaction["pages"]>().toEqualTypeOf<
      CoreRuntime["pages"]
    >();
    expectTypeOf<CoreTransaction["metadata"]>().toEqualTypeOf<
      CoreRuntime["metadata"]
    >();
    expectTypeOf<CoreTransaction["events"]>().toEqualTypeOf<
      CoreRuntime["events"]
    >();
    expectTypeOf<CoreTransaction["filters"]>().toEqualTypeOf<
      CoreRuntime["filters"]
    >();
  });
});

function createRuntime(options: {
  ids: string[];
  instants: string[];
}): CoreRuntime {
  const nextId = createSequence(options.ids);
  const nextInstant = createSequence(options.instants);

  return createInMemoryAppRuntime({
    stores: createCoreStores({
      pages: { createId: nextId, now: nextInstant },
      metadata: { createId: nextId, now: nextInstant },
      events: { createId: nextId, now: nextInstant },
      filters: { createId: nextId, now: nextInstant },
    }),
  });
}

function createSeededRuntime(): CoreRuntime {
  const runtime = createRuntime({
    ids: [
      "page_seed",
      "metadata_seed",
      "event_seed",
      "filter_seed",
      "page_tx_created",
      "metadata_tx_created",
      "event_tx_created",
      "filter_tx_created",
    ],
    instants: [
      "2026-05-20T03:00:00.000Z",
      "2026-05-20T03:01:00.000Z",
      "2026-05-20T03:02:00.000Z",
      "2026-05-20T03:03:00.000Z",
      "2026-05-20T03:04:00.000Z",
      "2026-05-20T03:05:00.000Z",
      "2026-05-20T03:06:00.000Z",
      "2026-05-20T03:07:00.000Z",
      "2026-05-20T03:08:00.000Z",
      "2026-05-20T03:09:00.000Z",
    ],
  });

  runtime.pages.create({
    title: "Seed page",
    body: documentWithText("seed"),
  });
  runtime.metadata.set({
    pageId: "page_seed",
    namespace: "task",
    key: "status",
    value: "todo",
    valueType: "string",
    sourcePluginId: "task",
  });
  runtime.events.append({
    pageId: "page_seed",
    namespace: "task",
    type: "seeded",
    payload: { pageId: "page_seed" },
    sourcePluginId: "task",
  });
  runtime.filters.save({
    name: "Seed filter",
    query: existsQuery("metadata.task.status"),
    viewType: "task.list",
    sourcePluginId: "task",
  });

  return runtime;
}

function snapshot(runtime: CoreRuntime) {
  return {
    pages: runtime.pages.list({ includeArchived: true }),
    metadata: runtime.metadata.list(),
    events: runtime.events.list(),
    filters: runtime.filters.list(),
  };
}

function createSequence(values: string[]): () => string {
  let index = 0;

  return () =>
    values[index++] ?? `${values[values.length - 1] ?? "value"}_${index}`;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function documentWithText(text: string): StructuredMarkdownDocument {
  return {
    type: "doc",
    content: [
      {
        blockId: `block_${text.replace(/\W+/g, "_")}`,
        type: "paragraph",
        text,
      },
    ],
  };
}

function existsQuery(field: string): FilterQuery {
  return {
    where: [{ field, op: "exists" }],
  };
}

function eqQuery(field: string, value: unknown): FilterQuery {
  return {
    where: [{ field, op: "eq", value }],
  };
}

function mutatePage(page: MarkdownPage, text: string): void {
  page.body.content[0]!.text = text;
}

function pageText(page: MarkdownPage): string {
  return page.body.content[0]!.text ?? "";
}

function mutateMetadata(record: MetadataRecord, text: string): void {
  metadataValue(record).nested[0] = text;
}

function metadataValue(record: MetadataRecord): { nested: string[] } {
  return record.value as { nested: string[] };
}

function mutateEvent(event: AppEvent, text: string): void {
  eventPayload(event).nested[0] = text;
}

function eventPayload(event: AppEvent): { nested: string[] } {
  return event.payload as { nested: string[] };
}

function mutateFilter(filter: FilterDefinition, text: string): void {
  filterValue(filter).nested[0] = text;
}

function filterValue(filter: FilterDefinition): { nested: string[] } {
  return filter.query.where[0]!.value as { nested: string[] };
}

import {
  type EventStore,
  type FilterStore,
  type MetadataStore,
  type PageStore,
} from "../stores";
import { getInMemoryEventStoreTransactionParticipant } from "../stores/event-store";
import { getInMemoryFilterStoreTransactionParticipant } from "../stores/filter-store";
import { getInMemoryMetadataStoreTransactionParticipant } from "../stores/metadata-store";
import { getInMemoryPageStoreTransactionParticipant } from "../stores/page-store";
import type {
  AppendEventInput,
  SaveFilterInput,
  SetMetadataInput,
  UpdateFilterInput,
} from "../stores";
import type {
  AppEvent,
  FilterDefinition,
  MarkdownPage,
  MetadataRecord,
} from "../types";
import {
  DB_PERSISTENCE_OPERATIONS,
  type DbQuery,
  type DbValue,
  type NativeBridge,
} from "../native";
import type {
  CoreStores,
  CoreTransaction,
  CoreDirectStoreRunner,
  TransactionPersistence,
  TransactionPersistenceScope,
} from "../services";

type NativePageRecord = Omit<MarkdownPage, "parentPageId" | "archivedAt"> & {
  parentPageId?: string | null;
  archivedAt?: string | null;
};

type NativeEventRecord = Omit<AppEvent, "type" | "pageId"> & {
  type?: string;
  eventType?: string;
  pageId?: string | null;
};

type NativeFilterRecord = Omit<
  FilterDefinition,
  "sort" | "group" | "sourcePluginId"
> & {
  sort?: FilterDefinition["sort"] | null;
  group?: FilterDefinition["group"] | null;
  sourcePluginId?: string | null;
};

type MetadataIndex = Map<string, Map<string, Map<string, MetadataRecord>>>;

export type NativeDirectWriteCoordinator = {
  persist(queries: readonly DbQuery[], rollback: () => void): void;
  flush(): Promise<void>;
};

export type NativePageWriteThrough = {
  pages: PageStore;
  flush(): Promise<void>;
};

type DirectStoreRollbackSnapshot = {
  pages: ReturnType<
    NonNullable<
      ReturnType<typeof getInMemoryPageStoreTransactionParticipant>
    >["snapshot"]
  >;
  metadata: ReturnType<
    NonNullable<
      ReturnType<typeof getInMemoryMetadataStoreTransactionParticipant>
    >["snapshot"]
  >;
  events: ReturnType<
    NonNullable<
      ReturnType<typeof getInMemoryEventStoreTransactionParticipant>
    >["snapshot"]
  >;
  filters: ReturnType<
    NonNullable<
      ReturnType<typeof getInMemoryFilterStoreTransactionParticipant>
    >["snapshot"]
  >;
};

class RuntimePersistenceError extends Error {
  readonly code = "PERSISTENCE_FAILED";

  constructor() {
    super("Native command failed");
    this.name = "RuntimePersistenceError";
  }
}

export async function hydrateCoreStoresFromNativeBridge(
  stores: CoreStores,
  nativeBridge: Pick<NativeBridge, "db">,
): Promise<void> {
  try {
    const pages = normalizeArrayResponse<NativePageRecord>(
      await nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.pagesList,
        payload: {
          includeArchived: true,
        },
      }),
    ).map(normalizePageRecord);
    const metadata: MetadataRecord[] = [];

    for (const page of pages) {
      metadata.push(
        ...normalizeArrayResponse<MetadataRecord>(
          await nativeBridge.db.execute({
            operation: DB_PERSISTENCE_OPERATIONS.metadataListForPage,
            payload: {
              pageId: page.id,
            },
          }),
        ),
      );
    }

    const events = normalizeArrayResponse<NativeEventRecord>(
      await nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.eventsList,
      }),
    ).map(normalizeEventRecord);
    const filters = normalizeArrayResponse<NativeFilterRecord>(
      await nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.filtersList,
      }),
    ).map(normalizeFilterRecord);

    replacePageStoreState(stores.pages, pages);
    replaceMetadataStoreState(stores.metadata, metadata);
    replaceEventStoreState(stores.events, events);
    replaceFilterStoreState(stores.filters, filters);
  } catch (error) {
    throw normalizeNativePersistenceError(error);
  }
}

export function createNativeTransactionPersistence(
  nativeBridge: Pick<NativeBridge, "db">,
  options: {
    beforeCommit?: () => Promise<void>;
  } = {},
): TransactionPersistence {
  return {
    createScope(transaction) {
      return createNativeTransactionPersistenceScope(
        nativeBridge,
        transaction,
        options,
      );
    },
  };
}

export function createNativeDirectWriteCoordinator(
  nativeBridge: Pick<NativeBridge, "db">,
): NativeDirectWriteCoordinator {
  const pendingWrites = new Set<Promise<void>>();
  let failedWrite: RuntimePersistenceError | undefined;

  return {
    persist(queries, rollback) {
      if (queries.length === 0) {
        return;
      }

      if (failedWrite !== undefined) {
        rollback();
        return;
      }

      let write: Promise<unknown>;

      try {
        write = nativeBridge.db.transaction([...queries]);
      } catch (error) {
        rollback();
        failedWrite = normalizeNativePersistenceError(error);
        return;
      }

      const trackedWrite = write.then(
        () => undefined,
        (error: unknown) => {
          rollback();
          failedWrite = normalizeNativePersistenceError(error);
        },
      );

      pendingWrites.add(trackedWrite);
      void trackedWrite.finally(() => {
        pendingWrites.delete(trackedWrite);
      });
    },
    async flush() {
      while (pendingWrites.size > 0) {
        await Promise.all([...pendingWrites]);
      }

      if (failedWrite !== undefined) {
        throw failedWrite;
      }
    },
  };
}

export function createNativePageWriteThrough(
  pages: PageStore,
  nativeBridge: Pick<NativeBridge, "db">,
): NativePageWriteThrough {
  const coordinator = createNativeDirectWriteCoordinator(nativeBridge);
  const participant = requireHydratableParticipant(
    getInMemoryPageStoreTransactionParticipant(pages),
    "page",
  );

  return {
    pages: createPersistentDirectPageStore(pages, participant, coordinator),
    flush: () => coordinator.flush(),
  };
}

export function createNativeDirectStoreRunner(
  stores: CoreStores,
  nativeBridge: Pick<NativeBridge, "db">,
  options: {
    beforeCommit?: () => Promise<void>;
  } = {},
): CoreDirectStoreRunner {
  return {
    async run<Result>(
      handler: (transaction: CoreTransaction) => Result | Promise<Result>,
    ): Promise<Awaited<Result>> {
      const session = createNativeDirectStoreSession(stores);

      try {
        const result = await handler(session.transaction);

        await session.commit(nativeBridge, options);

        return result;
      } catch (error) {
        session.rollback();
        throw error;
      }
    },
  };
}

function createNativeTransactionPersistenceScope(
  nativeBridge: Pick<NativeBridge, "db">,
  transaction: CoreTransaction,
  options: {
    beforeCommit?: () => Promise<void>;
  },
): TransactionPersistenceScope {
  const queries: DbQuery[] = [];

  return {
    transaction: {
      pages: createPersistentPageStore(transaction.pages, queries),
      metadata: createPersistentMetadataStore(transaction.metadata, queries),
      events: createPersistentEventStore(transaction.events, queries),
      filters: createPersistentFilterStore(transaction.filters, queries),
    },
    async commit() {
      await options.beforeCommit?.();

      if (queries.length === 0) {
        return;
      }

      try {
        await nativeBridge.db.transaction(queries);
      } catch (error) {
        throw normalizeNativePersistenceError(error);
      }
    },
  };
}

function createPersistentDirectPageStore(
  pages: PageStore,
  participant: NonNullable<
    ReturnType<typeof getInMemoryPageStoreTransactionParticipant>
  >,
  coordinator: NativeDirectWriteCoordinator,
): PageStore {
  return {
    create(input) {
      const rollbackSnapshot = participant.snapshot();
      const page = pages.create(input);

      coordinator.persist(
        [
          {
            operation: DB_PERSISTENCE_OPERATIONS.pagesCreate,
            payload: pageCreatePayload(page),
          },
        ],
        () => {
          participant.replaceState(rollbackSnapshot);
        },
      );

      return page;
    },
    get: (pageId) => pages.get(pageId),
    update(pageId, input) {
      const rollbackSnapshot = participant.snapshot();
      const page = pages.update(pageId, input);

      coordinator.persist(
        [
          {
            operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
            payload: pageUpdatePayload(page),
          },
        ],
        () => {
          participant.replaceState(rollbackSnapshot);
        },
      );

      return page;
    },
    archive(pageId) {
      const rollbackSnapshot = participant.snapshot();
      const page = pages.archive(pageId);

      coordinator.persist(
        [
          {
            operation: DB_PERSISTENCE_OPERATIONS.pagesArchive,
            payload: {
              id: page.id,
              archivedAt: page.archivedAt ?? page.updatedAt,
            },
          },
        ],
        () => {
          participant.replaceState(rollbackSnapshot);
        },
      );

      return page;
    },
    list: (options) => pages.list(options),
  };
}

function createNativeDirectStoreSession(stores: CoreStores): {
  transaction: CoreTransaction;
  commit(
    nativeBridge: Pick<NativeBridge, "db">,
    options: { beforeCommit?: () => Promise<void> },
  ): Promise<void>;
  rollback(): void;
} {
  const pageParticipant = requireHydratableParticipant(
    getInMemoryPageStoreTransactionParticipant(stores.pages),
    "page",
  );
  const metadataParticipant = requireHydratableParticipant(
    getInMemoryMetadataStoreTransactionParticipant(stores.metadata),
    "metadata",
  );
  const eventParticipant = requireHydratableParticipant(
    getInMemoryEventStoreTransactionParticipant(stores.events),
    "event",
  );
  const filterParticipant = requireHydratableParticipant(
    getInMemoryFilterStoreTransactionParticipant(stores.filters),
    "filter",
  );
  const queries: DbQuery[] = [];
  let rollbackSnapshot: DirectStoreRollbackSnapshot | undefined;
  let committed = false;

  function prepareWrite(): void {
    if (rollbackSnapshot !== undefined) {
      return;
    }

    rollbackSnapshot = {
      pages: pageParticipant.snapshot(),
      metadata: metadataParticipant.snapshot(),
      events: eventParticipant.snapshot(),
      filters: filterParticipant.snapshot(),
    };
  }

  function rollback(): void {
    if (committed || rollbackSnapshot === undefined) {
      return;
    }

    pageParticipant.replaceState(rollbackSnapshot.pages);
    metadataParticipant.replaceState(rollbackSnapshot.metadata);
    eventParticipant.replaceState(rollbackSnapshot.events);
    filterParticipant.replaceState(rollbackSnapshot.filters);
  }

  return {
    transaction: {
      pages: createTrackedDirectPageStore(
        stores.pages,
        queries,
        prepareWrite,
      ),
      metadata: createTrackedDirectMetadataStore(
        stores.metadata,
        queries,
        prepareWrite,
      ),
      events: createTrackedDirectEventStore(
        stores.events,
        queries,
        prepareWrite,
      ),
      filters: createTrackedDirectFilterStore(
        stores.filters,
        queries,
        prepareWrite,
      ),
    },
    async commit(nativeBridge, options) {
      if (queries.length === 0) {
        committed = true;
        return;
      }

      try {
        await options.beforeCommit?.();
        await nativeBridge.db.transaction(queries);
        committed = true;
      } catch (error) {
        rollback();
        throw normalizeNativePersistenceError(error);
      }
    },
    rollback,
  };
}

function createTrackedDirectPageStore(
  pages: PageStore,
  queries: DbQuery[],
  prepareWrite: () => void,
): PageStore {
  return {
    create(input) {
      prepareWrite();
      const page = pages.create(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesCreate,
        payload: pageCreatePayload(page),
      });

      return page;
    },
    get: (pageId) => pages.get(pageId),
    update(pageId, input) {
      prepareWrite();
      const page = pages.update(pageId, input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: pageUpdatePayload(page),
      });

      return page;
    },
    archive(pageId) {
      prepareWrite();
      const page = pages.archive(pageId);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesArchive,
        payload: {
          id: page.id,
          archivedAt: page.archivedAt ?? page.updatedAt,
        },
      });

      return page;
    },
    list: (options) => pages.list(options),
  };
}

function createTrackedDirectMetadataStore(
  metadata: MetadataStore,
  queries: DbQuery[],
  prepareWrite: () => void,
): MetadataStore {
  return {
    set(input) {
      prepareWrite();
      const record = metadata.set(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.metadataSet,
        payload: record as unknown as DbValue,
      });

      return record;
    },
    get: (pageId, namespace, key) => metadata.get(pageId, namespace, key),
    list: (options) => metadata.list(options),
    delete(pageId, namespace, key) {
      prepareWrite();
      const record = metadata.delete(pageId, namespace, key);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.metadataDelete,
        payload: {
          pageId,
          namespace,
          key,
        },
      });

      return record;
    },
  };
}

function createTrackedDirectEventStore(
  events: EventStore,
  queries: DbQuery[],
  prepareWrite: () => void,
): EventStore {
  return {
    append(input) {
      prepareWrite();
      const event = events.append(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.eventsAppend,
        payload: event as unknown as DbValue,
      });

      return event;
    },
    list: (options) => events.list(options),
  };
}

function createTrackedDirectFilterStore(
  filters: FilterStore,
  queries: DbQuery[],
  prepareWrite: () => void,
): FilterStore {
  return {
    save(input) {
      prepareWrite();
      const filter = filters.save(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.filtersSave,
        payload: filter as unknown as DbValue,
      });

      return filter;
    },
    get: (filterId) => filters.get(filterId),
    update(filterId, input) {
      prepareWrite();
      const filter = filters.update(filterId, input);

      queries.push(
        {
          operation: DB_PERSISTENCE_OPERATIONS.filtersGet,
          payload: {
            id: filter.id,
          },
        },
        {
          operation: DB_PERSISTENCE_OPERATIONS.filtersSave,
          payload: filter as unknown as DbValue,
        },
      );

      return filter;
    },
    list: (options) => filters.list(options),
    delete(filterId) {
      prepareWrite();
      const filter = filters.delete(filterId);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.filtersDelete,
        payload: {
          id: filter.id,
        },
      });

      return filter;
    },
  };
}

function createPersistentPageStore(
  pages: PageStore,
  queries: DbQuery[],
): PageStore {
  return {
    create(input) {
      const page = pages.create(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesCreate,
        payload: pageCreatePayload(page),
      });

      return page;
    },
    get: (pageId) => pages.get(pageId),
    update(pageId, input) {
      const page = pages.update(pageId, input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: pageUpdatePayload(page),
      });

      return page;
    },
    archive(pageId) {
      const page = pages.archive(pageId);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.pagesArchive,
        payload: {
          id: page.id,
          archivedAt: page.archivedAt ?? page.updatedAt,
        },
      });

      return page;
    },
    list: (options) => pages.list(options),
  };
}

function createPersistentMetadataStore(
  metadata: MetadataStore,
  queries: DbQuery[],
): MetadataStore {
  return {
    set(input: SetMetadataInput) {
      const record = metadata.set(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.metadataSet,
        payload: record as unknown as DbValue,
      });

      return record;
    },
    get: (pageId, namespace, key) => metadata.get(pageId, namespace, key),
    list: (options) => metadata.list(options),
    delete(pageId, namespace, key) {
      const record = metadata.delete(pageId, namespace, key);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.metadataDelete,
        payload: {
          pageId,
          namespace,
          key,
        },
      });

      return record;
    },
  };
}

function createPersistentEventStore(
  events: EventStore,
  queries: DbQuery[],
): EventStore {
  return {
    append(input: AppendEventInput) {
      const event = events.append(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.eventsAppend,
        payload: event as unknown as DbValue,
      });

      return event;
    },
    list: (options) => events.list(options),
  };
}

function createPersistentFilterStore(
  filters: FilterStore,
  queries: DbQuery[],
): FilterStore {
  return {
    save(input: SaveFilterInput) {
      const filter = filters.save(input);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.filtersSave,
        payload: filter as unknown as DbValue,
      });

      return filter;
    },
    get: (filterId) => filters.get(filterId),
    update(filterId, input: UpdateFilterInput) {
      const filter = filters.update(filterId, input);

      queries.push(
        {
          operation: DB_PERSISTENCE_OPERATIONS.filtersGet,
          payload: {
            id: filter.id,
          },
        },
        {
          operation: DB_PERSISTENCE_OPERATIONS.filtersSave,
          payload: filter as unknown as DbValue,
        },
      );

      return filter;
    },
    list: (options) => filters.list(options),
    delete(filterId) {
      const filter = filters.delete(filterId);

      queries.push({
        operation: DB_PERSISTENCE_OPERATIONS.filtersDelete,
        payload: {
          id: filter.id,
        },
      });

      return filter;
    },
  };
}

function pageCreatePayload(page: MarkdownPage): DbValue {
  const payload: Record<string, unknown> = {
    id: page.id,
    title: page.title,
    body: page.body,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };

  if (page.parentPageId !== undefined) {
    payload.parentPageId = page.parentPageId;
  }

  return payload as DbValue;
}

function pageUpdatePayload(page: MarkdownPage): DbValue {
  const payload: Record<string, unknown> = {
    id: page.id,
    title: page.title,
    parentPageId: page.parentPageId ?? null,
    body: page.body,
    updatedAt: page.updatedAt,
  };

  return payload as DbValue;
}

function replacePageStoreState(
  pages: PageStore,
  hydratedPages: readonly MarkdownPage[],
): void {
  const participant = requireHydratableParticipant(
    getInMemoryPageStoreTransactionParticipant(pages),
    "page",
  );
  const snapshot = {
    pages: new Map(hydratedPages.map((page) => [page.id, page])),
  } as ReturnType<typeof participant.snapshot>;

  participant.replaceState(snapshot);
}

function replaceMetadataStoreState(
  metadata: MetadataStore,
  records: readonly MetadataRecord[],
): void {
  const participant = requireHydratableParticipant(
    getInMemoryMetadataStoreTransactionParticipant(metadata),
    "metadata",
  );
  const snapshot = {
    records: [...records],
    recordsByIdentity: createMetadataIndex(records),
  } as ReturnType<typeof participant.snapshot>;

  participant.replaceState(snapshot);
}

function replaceEventStoreState(
  events: EventStore,
  hydratedEvents: readonly AppEvent[],
): void {
  const participant = requireHydratableParticipant(
    getInMemoryEventStoreTransactionParticipant(events),
    "event",
  );
  const snapshot = {
    events: [...hydratedEvents],
  } as ReturnType<typeof participant.snapshot>;

  participant.replaceState(snapshot);
}

function replaceFilterStoreState(
  filters: FilterStore,
  hydratedFilters: readonly FilterDefinition[],
): void {
  const participant = requireHydratableParticipant(
    getInMemoryFilterStoreTransactionParticipant(filters),
    "filter",
  );
  const snapshot = {
    filters: new Map(hydratedFilters.map((filter) => [filter.id, filter])),
  } as ReturnType<typeof participant.snapshot>;

  participant.replaceState(snapshot);
}

function requireHydratableParticipant<Participant>(
  participant: Participant | undefined,
  storeName: string,
): Participant {
  if (participant === undefined) {
    throw new Error(`Cannot hydrate non-memory ${storeName} store`);
  }

  return participant;
}

function createMetadataIndex(
  records: readonly MetadataRecord[],
): MetadataIndex {
  const index: MetadataIndex = new Map();

  for (const record of records) {
    let namespaceIndex = index.get(record.pageId);

    if (namespaceIndex === undefined) {
      namespaceIndex = new Map();
      index.set(record.pageId, namespaceIndex);
    }

    let keyIndex = namespaceIndex.get(record.namespace);

    if (keyIndex === undefined) {
      keyIndex = new Map();
      namespaceIndex.set(record.namespace, keyIndex);
    }

    keyIndex.set(record.key, record);
  }

  return index;
}

function normalizeArrayResponse<Record>(
  response: readonly Record[] | null | undefined,
): Record[] {
  if (response === null) {
    throw new RuntimePersistenceError();
  }

  if (response === undefined) {
    return [];
  }

  if (!Array.isArray(response)) {
    throw new RuntimePersistenceError();
  }

  return [...response];
}

function normalizePageRecord(record: NativePageRecord): MarkdownPage {
  const page: MarkdownPage = {
    id: record.id,
    title: record.title,
    body: record.body,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (record.parentPageId !== undefined && record.parentPageId !== null) {
    page.parentPageId = record.parentPageId;
  }

  if (record.archivedAt !== undefined && record.archivedAt !== null) {
    page.archivedAt = record.archivedAt;
  }

  return page;
}

function normalizeEventRecord(record: NativeEventRecord): AppEvent {
  const type = record.type ?? record.eventType;

  if (type === undefined) {
    throw new RuntimePersistenceError();
  }

  const event: AppEvent = {
    id: record.id,
    namespace: record.namespace,
    type,
    payload: record.payload,
    sourcePluginId: record.sourcePluginId,
    createdAt: record.createdAt,
  };

  if (record.pageId !== undefined && record.pageId !== null) {
    event.pageId = record.pageId;
  }

  return event;
}

function normalizeFilterRecord(record: NativeFilterRecord): FilterDefinition {
  const filter: FilterDefinition = {
    id: record.id,
    name: record.name,
    query: record.query,
    viewType: record.viewType,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (record.sort !== undefined && record.sort !== null) {
    filter.sort = record.sort;
  }

  if (record.group !== undefined && record.group !== null) {
    filter.group = record.group;
  }

  if (record.sourcePluginId !== undefined && record.sourcePluginId !== null) {
    filter.sourcePluginId = record.sourcePluginId;
  }

  return filter;
}

function normalizeNativePersistenceError(
  _error: unknown,
): RuntimePersistenceError {
  if (_error instanceof RuntimePersistenceError) {
    return _error;
  }

  return new RuntimePersistenceError();
}

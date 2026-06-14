import type {
  EventStore,
  FilterStore,
  MetadataStore,
  PageStore,
} from "../stores";
import {
  getInMemoryEventStoreTransactionParticipant,
  type InMemoryEventStoreTransactionParticipant,
} from "../stores/event-store";
import {
  getInMemoryFilterStoreTransactionParticipant,
  type InMemoryFilterStoreTransactionParticipant,
} from "../stores/filter-store";
import {
  getInMemoryMetadataStoreTransactionParticipant,
  type InMemoryMetadataStoreTransactionParticipant,
} from "../stores/metadata-store";
import {
  getInMemoryPageStoreTransactionParticipant,
  type InMemoryPageStoreTransactionParticipant,
} from "../stores/page-store";

export type CoreTransaction = {
  pages: PageStore;
  metadata: MetadataStore;
  events: EventStore;
  filters: FilterStore;
};

export type TransactionHandler<Result> = (
  transaction: CoreTransaction,
) => Result | Promise<Result>;

export type TransactionManager = {
  run<Result>(
    handler: TransactionHandler<Result>,
  ): Promise<Awaited<Result>>;
};

export type CoreDirectStoreRunner = {
  run<Result>(
    handler: TransactionHandler<Result>,
  ): Promise<Awaited<Result>>;
};

export type TransactionPersistenceScope = {
  transaction: CoreTransaction;
  commit(): Promise<void>;
};

export type TransactionPersistence = {
  createScope(transaction: CoreTransaction): TransactionPersistenceScope;
};

type PageSnapshot = ReturnType<
  InMemoryPageStoreTransactionParticipant["snapshot"]
>;
type MetadataSnapshot = ReturnType<
  InMemoryMetadataStoreTransactionParticipant["snapshot"]
>;
type MetadataSnapshotRecord = MetadataSnapshot["records"][number];
type EventSnapshot = ReturnType<
  InMemoryEventStoreTransactionParticipant["snapshot"]
>;
type EventSnapshotRecord = EventSnapshot["events"][number];
type FilterSnapshot = ReturnType<
  InMemoryFilterStoreTransactionParticipant["snapshot"]
>;

export function createTransactionManager(
  stores: CoreTransaction,
  options: {
    persistence?: TransactionPersistence;
  } = {},
): TransactionManager {
  let active = false;
  const persistence = options.persistence;

  return {
    async run<Result>(
      handler: TransactionHandler<Result>,
    ): Promise<Awaited<Result>> {
      if (active) {
        throw new Error("A Core transaction is already running");
      }

      active = true;

      try {
        const pageParticipant = requirePageParticipant(stores.pages);
        const metadataParticipant = requireMetadataParticipant(stores.metadata);
        const eventParticipant = requireEventParticipant(stores.events);
        const filterParticipant = requireFilterParticipant(stores.filters);
        const initialPageState = pageParticipant.snapshot();
        const initialMetadataState = metadataParticipant.snapshot();
        const initialEventState = eventParticipant.snapshot();
        const initialFilterState = filterParticipant.snapshot();

        const stagedPages = pageParticipant.createStoreFromSnapshot(
          initialPageState,
        );
        const stagedMetadata = metadataParticipant.createStoreFromSnapshot(
          initialMetadataState,
        );
        const stagedEvents = eventParticipant.createStoreFromSnapshot(
          initialEventState,
        );
        const stagedFilters = filterParticipant.createStoreFromSnapshot(
          initialFilterState,
        );
        const transaction: CoreTransaction = {
          pages: stagedPages,
          metadata: stagedMetadata,
          events: stagedEvents,
          filters: stagedFilters,
        };
        const persistenceScope = persistence?.createScope(transaction);
        const handlerTransaction = persistenceScope?.transaction ?? transaction;

        const result = await handler(handlerTransaction);
        const stagedPageParticipant = requirePageParticipant(stagedPages);
        const stagedMetadataParticipant =
          requireMetadataParticipant(stagedMetadata);
        const stagedEventParticipant = requireEventParticipant(stagedEvents);
        const stagedFilterParticipant = requireFilterParticipant(stagedFilters);
        const nextPageState = stagedPageParticipant.snapshot();
        const nextMetadataState = stagedMetadataParticipant.snapshot();
        const nextEventState = stagedEventParticipant.snapshot();
        const nextFilterState = stagedFilterParticipant.snapshot();
        const livePageState = pageParticipant.snapshot();
        const liveMetadataState = metadataParticipant.snapshot();
        const liveEventState = eventParticipant.snapshot();
        const liveFilterState = filterParticipant.snapshot();

        assertLiveSnapshotUnchanged("page", livePageState, initialPageState);
        assertLiveSnapshotUnchanged(
          "metadata",
          liveMetadataState,
          initialMetadataState,
        );
        assertLiveSnapshotUnchanged("event", liveEventState, initialEventState);
        assertLiveSnapshotUnchanged(
          "filter",
          liveFilterState,
          initialFilterState,
        );

        await persistenceScope?.commit();

        const committedLivePageState = pageParticipant.snapshot();
        const committedLiveMetadataState = metadataParticipant.snapshot();
        const committedLiveEventState = eventParticipant.snapshot();
        const committedLiveFilterState = filterParticipant.snapshot();
        const finalPageState =
          persistenceScope !== undefined &&
          !snapshotsEqual(committedLivePageState, livePageState)
            ? mergePageTransactionState(
                initialPageState,
                nextPageState,
                committedLivePageState,
              )
            : nextPageState;
        const finalMetadataState =
          persistenceScope !== undefined &&
          !snapshotsEqual(committedLiveMetadataState, liveMetadataState)
            ? mergeMetadataTransactionState(
                initialMetadataState,
                nextMetadataState,
                committedLiveMetadataState,
              )
            : nextMetadataState;
        const finalEventState =
          persistenceScope !== undefined &&
          !snapshotsEqual(committedLiveEventState, liveEventState)
            ? mergeEventTransactionState(
                initialEventState,
                nextEventState,
                committedLiveEventState,
              )
            : nextEventState;
        const finalFilterState =
          persistenceScope !== undefined &&
          !snapshotsEqual(committedLiveFilterState, liveFilterState)
            ? mergeFilterTransactionState(
                initialFilterState,
                nextFilterState,
                committedLiveFilterState,
              )
            : nextFilterState;

        pageParticipant.replaceState(finalPageState);
        metadataParticipant.replaceState(finalMetadataState);
        eventParticipant.replaceState(finalEventState);
        filterParticipant.replaceState(finalFilterState);

        return result;
      } finally {
        active = false;
      }
    },
  };
}

function requirePageParticipant(
  store: PageStore,
): InMemoryPageStoreTransactionParticipant {
  return requireParticipant(
    getInMemoryPageStoreTransactionParticipant(store),
    "page",
  );
}

function requireMetadataParticipant(
  store: MetadataStore,
): InMemoryMetadataStoreTransactionParticipant {
  return requireParticipant(
    getInMemoryMetadataStoreTransactionParticipant(store),
    "metadata",
  );
}

function requireEventParticipant(
  store: EventStore,
): InMemoryEventStoreTransactionParticipant {
  return requireParticipant(
    getInMemoryEventStoreTransactionParticipant(store),
    "event",
  );
}

function requireFilterParticipant(
  store: FilterStore,
): InMemoryFilterStoreTransactionParticipant {
  return requireParticipant(
    getInMemoryFilterStoreTransactionParticipant(store),
    "filter",
  );
}

function requireParticipant<Participant>(
  participant: Participant | undefined,
  storeName: string,
): Participant {
  if (participant === undefined) {
    throw new Error(
      `Core transactions require an in-memory ${storeName} store`,
    );
  }

  return participant;
}

function assertLiveSnapshotUnchanged(
  storeName: string,
  liveSnapshot: unknown,
  initialSnapshot: unknown,
): void {
  if (!snapshotsEqual(liveSnapshot, initialSnapshot)) {
    throw new Error(
      `Core transaction conflict: live ${storeName} store changed before commit`,
    );
  }
}

function mergePageTransactionState(
  initialState: PageSnapshot,
  nextState: PageSnapshot,
  liveState: PageSnapshot,
): PageSnapshot {
  const pages = new Map(liveState.pages);

  for (const [pageId, nextPage] of nextState.pages) {
    const initialPage = initialState.pages.get(pageId);

    if (!snapshotsEqual(nextPage, initialPage)) {
      pages.set(pageId, nextPage);
    }
  }

  for (const [pageId, initialPage] of initialState.pages) {
    if (
      !nextState.pages.has(pageId) &&
      snapshotsEqual(liveState.pages.get(pageId), initialPage)
    ) {
      pages.delete(pageId);
    }
  }

  return {
    ...liveState,
    pages,
  };
}

function mergeMetadataTransactionState(
  initialState: MetadataSnapshot,
  nextState: MetadataSnapshot,
  liveState: MetadataSnapshot,
): MetadataSnapshot {
  const records = [...liveState.records];
  const initialRecords = createMetadataRecordMap(initialState.records);
  const nextRecords = createMetadataRecordMap(nextState.records);

  for (const nextRecord of nextState.records) {
    const identity = metadataIdentityKey(nextRecord);
    const initialRecord = initialRecords.get(identity);

    if (!snapshotsEqual(nextRecord, initialRecord)) {
      upsertMetadataRecord(records, nextRecord);
    }
  }

  for (const [identity, initialRecord] of initialRecords) {
    if (!nextRecords.has(identity)) {
      deleteMetadataRecord(records, initialRecord);
    }
  }

  return {
    records,
    recordsByIdentity: createMetadataIndex(records),
  };
}

function mergeEventTransactionState(
  initialState: EventSnapshot,
  nextState: EventSnapshot,
  liveState: EventSnapshot,
): EventSnapshot {
  const events = [...liveState.events];
  const initialEvents = new Map(
    initialState.events.map((event) => [event.id, event]),
  );

  for (const nextEvent of nextState.events) {
    const initialEvent = initialEvents.get(nextEvent.id);

    if (!snapshotsEqual(nextEvent, initialEvent)) {
      upsertEvent(events, nextEvent);
    }
  }

  return {
    events,
  };
}

function mergeFilterTransactionState(
  initialState: FilterSnapshot,
  nextState: FilterSnapshot,
  liveState: FilterSnapshot,
): FilterSnapshot {
  const filters = new Map(liveState.filters);

  for (const [filterId, nextFilter] of nextState.filters) {
    const initialFilter = initialState.filters.get(filterId);

    if (!snapshotsEqual(nextFilter, initialFilter)) {
      filters.set(filterId, nextFilter);
    }
  }

  for (const filterId of initialState.filters.keys()) {
    if (!nextState.filters.has(filterId)) {
      filters.delete(filterId);
    }
  }

  return {
    filters,
  };
}

function createMetadataRecordMap(
  records: readonly MetadataSnapshotRecord[],
): Map<string, MetadataSnapshotRecord> {
  return new Map(records.map((record) => [metadataIdentityKey(record), record]));
}

function metadataIdentityKey(record: MetadataSnapshotRecord): string {
  return JSON.stringify([record.pageId, record.namespace, record.key]);
}

function upsertMetadataRecord(
  records: MetadataSnapshotRecord[],
  nextRecord: MetadataSnapshotRecord,
): void {
  const index = records.findIndex(
    (record) => metadataIdentityKey(record) === metadataIdentityKey(nextRecord),
  );

  if (index >= 0) {
    records[index] = nextRecord;
    return;
  }

  records.push(nextRecord);
}

function deleteMetadataRecord(
  records: MetadataSnapshotRecord[],
  recordToDelete: MetadataSnapshotRecord,
): void {
  const index = records.findIndex(
    (record) =>
      metadataIdentityKey(record) === metadataIdentityKey(recordToDelete),
  );

  if (index >= 0) {
    records.splice(index, 1);
  }
}

function upsertEvent(
  events: EventSnapshotRecord[],
  nextEvent: EventSnapshotRecord,
): void {
  const index = events.findIndex((event) => event.id === nextEvent.id);

  if (index >= 0) {
    events[index] = nextEvent;
    return;
  }

  events.push(nextEvent);
}

function createMetadataIndex(
  records: readonly MetadataSnapshotRecord[],
): MetadataSnapshot["recordsByIdentity"] {
  const index: MetadataSnapshot["recordsByIdentity"] = new Map();

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

function snapshotsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== "object" || left === null) {
    return false;
  }

  if (typeof right !== "object" || right === null) {
    return false;
  }

  if (left instanceof Date || right instanceof Date) {
    return datesEqual(left, right);
  }

  if (left instanceof Map || right instanceof Map) {
    return mapsEqual(left, right);
  }

  if (left instanceof Set || right instanceof Set) {
    return setsEqual(left, right);
  }

  if (left instanceof RegExp || right instanceof RegExp) {
    return regexpsEqual(left, right);
  }

  if (isArrayBuffer(left) || isArrayBuffer(right)) {
    return arrayBuffersEqual(left, right);
  }

  if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
    return arrayBufferViewsEqual(left, right);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return arraysEqual(left, right);
  }

  return objectsEqual(left, right);
}

function datesEqual(left: object, right: object): boolean {
  if (!(left instanceof Date) || !(right instanceof Date)) {
    return false;
  }

  return Object.is(left.getTime(), right.getTime());
}

function mapsEqual(left: object, right: object): boolean {
  if (!(left instanceof Map) || !(right instanceof Map)) {
    return false;
  }

  if (left.size !== right.size) {
    return false;
  }

  const leftEntries = [...left.entries()];
  const rightEntries = [...right.entries()];

  return leftEntries.every(
    ([leftKey, leftValue], index) =>
      snapshotsEqual(leftKey, rightEntries[index]?.[0]) &&
      snapshotsEqual(leftValue, rightEntries[index]?.[1]),
  );
}

function arraysEqual(left: object, right: object): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }

    return snapshotsEqual(
      readSnapshotProperty(left, key),
      readSnapshotProperty(right, key),
    );
  });
}

function setsEqual(left: object, right: object): boolean {
  if (!(left instanceof Set) || !(right instanceof Set)) {
    return false;
  }

  if (left.size !== right.size) {
    return false;
  }

  const leftValues = [...left.values()];
  const rightValues = [...right.values()];

  return leftValues.every((leftValue, index) =>
    snapshotsEqual(leftValue, rightValues[index]),
  );
}

function regexpsEqual(left: object, right: object): boolean {
  if (!(left instanceof RegExp) || !(right instanceof RegExp)) {
    return false;
  }

  return (
    left.source === right.source &&
    left.flags === right.flags &&
    left.lastIndex === right.lastIndex
  );
}

function arrayBuffersEqual(left: object, right: object): boolean {
  if (!isArrayBuffer(left) || !isArrayBuffer(right)) {
    return false;
  }

  return arrayBufferBytesEqual(left, right);
}

function isArrayBuffer(value: object): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function arrayBufferViewsEqual(left: object, right: object): boolean {
  if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) {
    return false;
  }

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }

  if (
    left.byteOffset !== right.byteOffset ||
    left.byteLength !== right.byteLength
  ) {
    return false;
  }

  return arrayBufferBytesEqual(left.buffer, right.buffer);
}

function arrayBufferBytesEqual(
  left: ArrayBufferLike,
  right: ArrayBufferLike,
): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);

  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function objectsEqual(left: object, right: object): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }

    return snapshotsEqual(
      readSnapshotProperty(left, key),
      readSnapshotProperty(right, key),
    );
  });
}

function readSnapshotProperty(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

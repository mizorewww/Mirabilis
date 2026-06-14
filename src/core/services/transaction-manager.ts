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
        const finalPageState =
          persistenceScope !== undefined &&
          !snapshotsEqual(committedLivePageState, livePageState)
            ? mergePageTransactionState(
                initialPageState,
                nextPageState,
                committedLivePageState,
              )
            : nextPageState;

        pageParticipant.replaceState(finalPageState);
        metadataParticipant.replaceState(nextMetadataState);
        eventParticipant.replaceState(nextEventState);
        filterParticipant.replaceState(nextFilterState);

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

function mergePageTransactionState<
  Snapshot extends {
    pages: Map<string, unknown>;
  },
>(
  initialState: Snapshot,
  nextState: Snapshot,
  liveState: Snapshot,
): Snapshot {
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

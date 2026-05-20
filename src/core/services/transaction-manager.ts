import type {
  EventStore,
  FilterStore,
  MetadataStore,
  PageStore,
} from "../stores";
import {
  inMemoryEventStoreTransactionParticipant,
  type InMemoryEventStoreTransactionParticipant,
} from "../stores/event-store";
import {
  inMemoryFilterStoreTransactionParticipant,
  type InMemoryFilterStoreTransactionParticipant,
} from "../stores/filter-store";
import {
  inMemoryMetadataStoreTransactionParticipant,
  type InMemoryMetadataStoreTransactionParticipant,
} from "../stores/metadata-store";
import {
  inMemoryPageStoreTransactionParticipant,
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

export function createTransactionManager(
  stores: CoreTransaction,
): TransactionManager {
  let active = false;

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

        const stagedPages = pageParticipant.createStoreFromSnapshot(
          pageParticipant.snapshot(),
        );
        const stagedMetadata = metadataParticipant.createStoreFromSnapshot(
          metadataParticipant.snapshot(),
        );
        const stagedEvents = eventParticipant.createStoreFromSnapshot(
          eventParticipant.snapshot(),
        );
        const stagedFilters = filterParticipant.createStoreFromSnapshot(
          filterParticipant.snapshot(),
        );
        const transaction: CoreTransaction = {
          pages: stagedPages,
          metadata: stagedMetadata,
          events: stagedEvents,
          filters: stagedFilters,
        };

        const result = await handler(transaction);
        const stagedPageParticipant = requirePageParticipant(stagedPages);
        const stagedMetadataParticipant =
          requireMetadataParticipant(stagedMetadata);
        const stagedEventParticipant = requireEventParticipant(stagedEvents);
        const stagedFilterParticipant = requireFilterParticipant(stagedFilters);
        const nextPageState = stagedPageParticipant.snapshot();
        const nextMetadataState = stagedMetadataParticipant.snapshot();
        const nextEventState = stagedEventParticipant.snapshot();
        const nextFilterState = stagedFilterParticipant.snapshot();

        pageParticipant.replaceState(nextPageState);
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

type PageStoreWithTransactionParticipant = PageStore & {
  [inMemoryPageStoreTransactionParticipant]?: InMemoryPageStoreTransactionParticipant;
};

type MetadataStoreWithTransactionParticipant = MetadataStore & {
  [inMemoryMetadataStoreTransactionParticipant]?: InMemoryMetadataStoreTransactionParticipant;
};

type EventStoreWithTransactionParticipant = EventStore & {
  [inMemoryEventStoreTransactionParticipant]?: InMemoryEventStoreTransactionParticipant;
};

type FilterStoreWithTransactionParticipant = FilterStore & {
  [inMemoryFilterStoreTransactionParticipant]?: InMemoryFilterStoreTransactionParticipant;
};

function requirePageParticipant(
  store: PageStore,
): InMemoryPageStoreTransactionParticipant {
  return requireParticipant(
    (store as PageStoreWithTransactionParticipant)[
      inMemoryPageStoreTransactionParticipant
    ],
    "page",
  );
}

function requireMetadataParticipant(
  store: MetadataStore,
): InMemoryMetadataStoreTransactionParticipant {
  return requireParticipant(
    (store as MetadataStoreWithTransactionParticipant)[
      inMemoryMetadataStoreTransactionParticipant
    ],
    "metadata",
  );
}

function requireEventParticipant(
  store: EventStore,
): InMemoryEventStoreTransactionParticipant {
  return requireParticipant(
    (store as EventStoreWithTransactionParticipant)[
      inMemoryEventStoreTransactionParticipant
    ],
    "event",
  );
}

function requireFilterParticipant(
  store: FilterStore,
): InMemoryFilterStoreTransactionParticipant {
  return requireParticipant(
    (store as FilterStoreWithTransactionParticipant)[
      inMemoryFilterStoreTransactionParticipant
    ],
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

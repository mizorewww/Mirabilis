import {
  createInMemoryEventStore,
  createInMemoryFilterStore,
  createInMemoryMetadataStore,
  createInMemoryPageStore,
  type CreateInMemoryEventStoreOptions,
  type CreateInMemoryFilterStoreOptions,
  type CreateInMemoryMetadataStoreOptions,
  type CreateInMemoryPageStoreOptions,
  type EventStore,
  type FilterStore,
  type MetadataStore,
  type PageStore,
} from "../stores";
import { createInMemoryCommandRegistry } from "../commands";
import {
  createInMemorySlotRegistry,
  createInMemoryViewRegistry,
} from "../registries";
import type { CommandService, SlotRegistry, ViewRegistry } from "../types";
import {
  createTransactionManager,
  type TransactionPersistence,
  type TransactionManager,
} from "./transaction-manager";

export type CoreStores = {
  pages: PageStore;
  metadata: MetadataStore;
  events: EventStore;
  filters: FilterStore;
};

export type CoreRegistries = {
  commands: CommandService;
  views: ViewRegistry;
  slots: SlotRegistry;
};

export type CoreServices = CoreStores &
  CoreRegistries & {
    transaction: TransactionManager;
  };

type CreateCoreStoresOptions = {
  pages?: CreateInMemoryPageStoreOptions;
  metadata?: CreateInMemoryMetadataStoreOptions;
  events?: CreateInMemoryEventStoreOptions;
  filters?: CreateInMemoryFilterStoreOptions;
};

type CreateCoreServicesOptions = {
  stores: CoreStores;
  registries: CoreRegistries;
  transaction?: TransactionManager;
  transactionPersistence?: TransactionPersistence;
};

export function createCoreStores(
  options: CreateCoreStoresOptions = {},
): CoreStores {
  return {
    pages: createInMemoryPageStore(options.pages),
    metadata: createInMemoryMetadataStore(options.metadata),
    events: createInMemoryEventStore(options.events),
    filters: createInMemoryFilterStore(options.filters),
  };
}

export function createCoreRegistries(): CoreRegistries {
  return {
    commands: createInMemoryCommandRegistry(),
    views: createInMemoryViewRegistry(),
    slots: createInMemorySlotRegistry(),
  };
}

export function createCoreServices({
  stores,
  registries,
  transaction,
  transactionPersistence,
}: CreateCoreServicesOptions): CoreServices {
  return {
    pages: stores.pages,
    metadata: stores.metadata,
    events: stores.events,
    filters: stores.filters,
    commands: registries.commands,
    views: registries.views,
    slots: registries.slots,
    transaction:
      transaction ??
      createTransactionManager(stores, {
        persistence: transactionPersistence,
      }),
  };
}

export type {
  CoreTransaction,
  TransactionHandler,
  TransactionManager,
  TransactionPersistence,
  TransactionPersistenceScope,
} from "./transaction-manager";

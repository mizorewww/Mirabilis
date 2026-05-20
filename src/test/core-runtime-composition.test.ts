import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createCoreRegistries,
  createCoreServices,
  createCoreStores,
  createInMemoryAppRuntime,
} from "../core";
import { createInMemoryAppRuntime as createInMemoryAppRuntimeFromRuntime } from "../core/runtime";
import {
  createCoreRegistries as createCoreRegistriesFromServices,
  createCoreServices as createCoreServicesFromServices,
  createCoreStores as createCoreStoresFromServices,
} from "../core/services";
import type {
  CommandService,
  EventStore,
  FilterStore,
  MetadataStore,
  PageStore,
  SlotRegistry,
  ViewRegistry,
} from "../core";
import type {
  CoreRegistries,
  CoreRuntime,
  CoreServices,
  CoreStores,
} from "../core";
import type {
  CoreRuntime as CoreRuntimeFromRuntime,
} from "../core/runtime";
import type {
  CoreRegistries as CoreRegistriesFromServices,
  CoreServices as CoreServicesFromServices,
  CoreStores as CoreStoresFromServices,
  CoreTransaction,
  TransactionHandler,
  TransactionManager,
} from "../core/services";

describe("Core runtime composition", () => {
  it("exports the public Core runtime and service composition API", () => {
    expect(createCoreStores).toEqual(expect.any(Function));
    expect(createCoreStoresFromServices).toBe(createCoreStores);
    expect(createCoreRegistries).toEqual(expect.any(Function));
    expect(createCoreRegistriesFromServices).toBe(createCoreRegistries);
    expect(createCoreServices).toEqual(expect.any(Function));
    expect(createCoreServicesFromServices).toBe(createCoreServices);
    expect(createInMemoryAppRuntime).toEqual(expect.any(Function));
    expect(createInMemoryAppRuntimeFromRuntime).toBe(createInMemoryAppRuntime);

    expectTypeOf<CoreStoresFromServices>().toEqualTypeOf<CoreStores>();
    expectTypeOf<CoreRegistriesFromServices>().toEqualTypeOf<CoreRegistries>();
    expectTypeOf<CoreServicesFromServices>().toEqualTypeOf<CoreServices>();
    expectTypeOf<CoreRuntimeFromRuntime>().toEqualTypeOf<CoreRuntime>();
    expectTypeOf<CoreStores>().toEqualTypeOf<{
      pages: PageStore;
      metadata: MetadataStore;
      events: EventStore;
      filters: FilterStore;
    }>();
    expectTypeOf<CoreRegistries>().toEqualTypeOf<{
      commands: CommandService;
      views: ViewRegistry;
      slots: SlotRegistry;
    }>();
    expectTypeOf<CoreTransaction>().toEqualTypeOf<CoreStores>();
    expectTypeOf<TransactionHandler<string>>().toEqualTypeOf<
      (transaction: CoreTransaction) => string | Promise<string>
    >();
    expectTypeOf<TransactionManager>().toEqualTypeOf<{
      run<Result>(
        handler: TransactionHandler<Result>,
      ): Promise<Awaited<Result>>;
    }>();
    expectTypeOf<CoreServices>().toEqualTypeOf<
      CoreStores &
        CoreRegistries & {
          transaction: TransactionManager;
        }
    >();
    expectTypeOf<CoreRuntime>().toEqualTypeOf<
      CoreServices & {
        stores: CoreStores;
        registries: CoreRegistries;
        services: CoreServices;
      }
    >();
    expectTypeOf<ReturnType<typeof createCoreStores>>().toEqualTypeOf<
      CoreStores
    >();
    expectTypeOf<ReturnType<typeof createCoreRegistries>>().toEqualTypeOf<
      CoreRegistries
    >();
    expectTypeOf<ReturnType<typeof createCoreServices>>().toEqualTypeOf<
      CoreServices
    >();
    expectTypeOf<ReturnType<typeof createInMemoryAppRuntime>>().toEqualTypeOf<
      CoreRuntime
    >();
  });

  it("exposes documented service names through stores, registries, services, and top-level runtime aliases", async () => {
    const stores = createCoreStores(createDeterministicStoreOptions());
    const registries = createCoreRegistries();
    const runtime = createInMemoryAppRuntime({ stores, registries });

    expect(runtime.stores).toBe(stores);
    expect(runtime.registries).toBe(registries);
    expect(runtime.pages).toBe(stores.pages);
    expect(runtime.metadata).toBe(stores.metadata);
    expect(runtime.events).toBe(stores.events);
    expect(runtime.filters).toBe(stores.filters);
    expect(runtime.commands).toBe(registries.commands);
    expect(runtime.views).toBe(registries.views);
    expect(runtime.slots).toBe(registries.slots);
    expect(runtime.transaction).toBe(runtime.services.transaction);
    expect(runtime.services.pages).toBe(runtime.pages);
    expect(runtime.services.metadata).toBe(runtime.metadata);
    expect(runtime.services.events).toBe(runtime.events);
    expect(runtime.services.filters).toBe(runtime.filters);
    expect(runtime.services.commands).toBe(runtime.commands);
    expect(runtime.services.views).toBe(runtime.views);
    expect(runtime.services.slots).toBe(runtime.slots);

    runtime.commands.register({
      id: "runtime.echo",
      pluginId: "runtime",
      title: "Echo",
      handler: (input: unknown) =>
        (input as { value: string }).value.toUpperCase(),
    });

    await expect(
      runtime.commands.execute("runtime.echo", { value: "ready" }),
    ).resolves.toBe("READY");
  });

  it("composes services from existing stores and registries without creating different service instances", () => {
    const stores = createCoreStores(createDeterministicStoreOptions());
    const registries = createCoreRegistries();
    const services = createCoreServices({ stores, registries });

    expect(services.pages).toBe(stores.pages);
    expect(services.metadata).toBe(stores.metadata);
    expect(services.events).toBe(stores.events);
    expect(services.filters).toBe(stores.filters);
    expect(services.commands).toBe(registries.commands);
    expect(services.views).toBe(registries.views);
    expect(services.slots).toBe(registries.slots);
    expect(services.transaction).toEqual({
      run: expect.any(Function),
    });
  });
});

function createDeterministicStoreOptions() {
  const nextId = createSequence([
    "page_alpha",
    "metadata_alpha",
    "event_alpha",
    "filter_alpha",
  ]);
  const nextInstant = createSequence([
    "2026-05-20T00:00:00.000Z",
    "2026-05-20T00:01:00.000Z",
    "2026-05-20T00:02:00.000Z",
    "2026-05-20T00:03:00.000Z",
  ]);

  return {
    pages: { createId: nextId, now: nextInstant },
    metadata: { createId: nextId, now: nextInstant },
    events: { createId: nextId, now: nextInstant },
    filters: { createId: nextId, now: nextInstant },
  };
}

function createSequence(values: string[]): () => string {
  let index = 0;

  return () =>
    values[index++] ?? `${values[values.length - 1] ?? "value"}_${index}`;
}

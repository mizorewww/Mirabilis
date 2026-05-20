import {
  createCoreRegistries,
  createCoreServices,
  createCoreStores,
  type CoreRegistries,
  type CoreServices,
  type CoreStores,
} from "../services";

export type CoreRuntime = CoreServices & {
  stores: CoreStores;
  registries: CoreRegistries;
  services: CoreServices;
};

type CreateInMemoryAppRuntimeOptions = {
  stores?: CoreStores;
  registries?: CoreRegistries;
};

export function createInMemoryAppRuntime(
  options: CreateInMemoryAppRuntimeOptions = {},
): CoreRuntime {
  const stores = options.stores ?? createCoreStores();
  const registries = options.registries ?? createCoreRegistries();
  const services = createCoreServices({ stores, registries });

  return {
    stores,
    registries,
    services,
    ...services,
  };
}

import type {
  AppendEventInput,
  AppEvent,
  CommandHandler,
  CreatePageInput,
  FilterDefinition,
  ListEventsOptions,
  ListFiltersOptions,
  ListMetadataOptions,
  ListPagesOptions,
  MarkdownPage,
  MetadataRecord,
  MetadataJsonValue,
  RegistryComponent,
  SaveFilterInput,
  SetMetadataInput,
  SlotCondition,
  UpdateFilterInput,
  UpdatePageInput,
  ViewDataShape,
} from "../index";

export type AppRuntimeInfo = {
  version: string;
  pluginApiVersion?: string;
};

type PluginOwnershipKeyReserved = {
  readonly [key: `plugin${string}`]: never;
};

type SourcePluginOwnershipKeyReserved = {
  readonly [key: `sourcePlugin${string}`]: never;
};

export type PluginPageStore = {
  create(input: CreatePageInput): MarkdownPage;
  get(pageId: string): MarkdownPage;
  update(pageId: string, input: UpdatePageInput): MarkdownPage;
  archive(pageId: string): MarkdownPage;
  list(options?: ListPagesOptions): readonly MarkdownPage[];
};

export type PluginSetMetadataInput = Omit<
  SetMetadataInput,
  "sourcePluginId"
> &
  SourcePluginOwnershipKeyReserved;

export type PluginMetadataStore = {
  set(input: PluginSetMetadataInput): MetadataRecord;
  get(pageId: string, namespace: string, key: string): MetadataRecord;
  list(options?: ListMetadataOptions): readonly MetadataRecord[];
  delete(pageId: string, namespace: string, key: string): MetadataRecord;
};

export type PluginAppendEventInput = Omit<
  AppendEventInput,
  "sourcePluginId"
> &
  SourcePluginOwnershipKeyReserved;

export type PluginEventStore = {
  append(input: PluginAppendEventInput): AppEvent;
  list(options?: ListEventsOptions): readonly AppEvent[];
};

export type PluginSaveFilterInput = Omit<
  SaveFilterInput,
  "sourcePluginId"
> &
  SourcePluginOwnershipKeyReserved;

export type PluginUpdateFilterInput = Omit<
  UpdateFilterInput,
  "sourcePluginId"
> &
  SourcePluginOwnershipKeyReserved;

export type PluginListFiltersOptions = Omit<
  ListFiltersOptions,
  "sourcePluginId"
> &
  SourcePluginOwnershipKeyReserved;

export type PluginFilterStore = {
  save(input: PluginSaveFilterInput): FilterDefinition;
  get(filterId: string): FilterDefinition;
  update(filterId: string, input: PluginUpdateFilterInput): FilterDefinition;
  list(options?: PluginListFiltersOptions): readonly FilterDefinition[];
  delete(filterId: string): FilterDefinition;
};

export type PluginCommandDefinition<Input = unknown, Output = unknown> = {
  id: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: MetadataJsonValue;
  handler: CommandHandler<Input, Output>;
} & PluginOwnershipKeyReserved;

export type PluginCommandDescriptor = {
  id: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: MetadataJsonValue;
};

export type PluginCommandListOptions = Record<string, never> &
  PluginOwnershipKeyReserved;

export type PluginCommandRegistry = {
  register<Input = unknown, Output = unknown>(
    definition: PluginCommandDefinition<Input, Output>,
  ): PluginCommandDescriptor;
  get(commandId: string): PluginCommandDescriptor;
  list(options?: PluginCommandListOptions): readonly PluginCommandDescriptor[];
};

export type PluginViewDefinition<Props = unknown> = {
  id: string;
  type: string;
  title: string;
  component: RegistryComponent<Props>;
  accepts: ViewDataShape;
  description?: string;
} & PluginOwnershipKeyReserved;

export type PluginViewDescriptor = {
  id: string;
  type: string;
  title: string;
  accepts: ViewDataShape;
  description?: string;
};

export type PluginViewListOptions =
  | (Record<string, never> & PluginOwnershipKeyReserved)
  | ({
      type: string;
    } & PluginOwnershipKeyReserved);

export type PluginViewRegistry = {
  register<Props = unknown>(
    definition: PluginViewDefinition<Props>,
  ): PluginViewDescriptor;
  get(viewId: string): PluginViewDescriptor;
  list(options?: PluginViewListOptions): readonly PluginViewDescriptor[];
};

export type PluginSlotDefinition<Props = unknown> = {
  id: string;
  slot: string;
  order?: number;
  component: RegistryComponent<Props>;
  when?: SlotCondition<Props>;
} & PluginOwnershipKeyReserved;

export type PluginSlotDescriptor = {
  id: string;
  slot: string;
  order?: number;
};

export type PluginSlotListOptions =
  | (Record<string, never> & PluginOwnershipKeyReserved)
  | ({
      slot: string;
    } & PluginOwnershipKeyReserved);

export type PluginSlotRegistry = {
  register<Props = unknown>(
    contribution: PluginSlotDefinition<Props>,
  ): PluginSlotDescriptor;
  get(contributionId: string): PluginSlotDescriptor;
  list(options?: PluginSlotListOptions): readonly PluginSlotDescriptor[];
};

export type PluginTransaction = {
  pluginId: string;
  pages: PluginPageStore;
  metadata: PluginMetadataStore;
  events: PluginEventStore;
  filters: PluginFilterStore;
};

export type PluginTransactionHandler<Result> = (
  transaction: PluginTransaction,
) => Result | Promise<Result>;

export type PluginTransactionManager = {
  run: <Result>(
    handler: PluginTransactionHandler<Result>,
  ) => Promise<Awaited<Result>>;
};

export type PluginContext = {
  pluginId: string;
  app: AppRuntimeInfo;
  pages: PluginPageStore;
  metadata: PluginMetadataStore;
  events: PluginEventStore;
  filters: PluginFilterStore;
  commands: PluginCommandRegistry;
  views: PluginViewRegistry;
  slots: PluginSlotRegistry;
  transaction: PluginTransactionManager;
};

export type PluginInstallContext = PluginContext;

export type PluginUninstallContext = PluginContext;

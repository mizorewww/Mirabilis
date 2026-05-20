import type {
  AppendEventInput,
  AppEvent,
  CommandDefinition,
  CommandDescriptor,
  CreatePageInput,
  FilterDefinition,
  ListCommandsOptions,
  ListEventsOptions,
  ListFiltersOptions,
  ListMetadataOptions,
  ListPagesOptions,
  ListSlotContributionsOptions,
  ListViewsOptions,
  MarkdownPage,
  MetadataRecord,
  SaveFilterInput,
  SetMetadataInput,
  SlotContribution,
  UpdateFilterInput,
  UpdatePageInput,
  ViewDefinition,
} from "../index";

export type AppRuntimeInfo = {
  version: string;
  pluginApiVersion?: string;
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
>;

export type PluginMetadataStore = {
  set(input: PluginSetMetadataInput): MetadataRecord;
  get(pageId: string, namespace: string, key: string): MetadataRecord;
  list(options?: ListMetadataOptions): readonly MetadataRecord[];
  delete(pageId: string, namespace: string, key: string): MetadataRecord;
};

export type PluginAppendEventInput = Omit<
  AppendEventInput,
  "sourcePluginId"
>;

export type PluginEventStore = {
  append(input: PluginAppendEventInput): AppEvent;
  list(options?: ListEventsOptions): readonly AppEvent[];
};

export type PluginSaveFilterInput = Omit<
  SaveFilterInput,
  "sourcePluginId"
>;

export type PluginUpdateFilterInput = Omit<
  UpdateFilterInput,
  "sourcePluginId"
>;

export type PluginListFiltersOptions = Omit<
  ListFiltersOptions,
  "sourcePluginId"
>;

export type PluginFilterStore = {
  save(input: PluginSaveFilterInput): FilterDefinition;
  get(filterId: string): FilterDefinition;
  update(filterId: string, input: PluginUpdateFilterInput): FilterDefinition;
  list(options?: PluginListFiltersOptions): readonly FilterDefinition[];
  delete(filterId: string): FilterDefinition;
};

export type PluginCommandDefinition<Input = unknown, Output = unknown> = Omit<
  CommandDefinition<Input, Output>,
  "pluginId"
>;

export type PluginCommandRegistry = {
  register<Input = unknown, Output = unknown>(
    definition: PluginCommandDefinition<Input, Output>,
  ): CommandDescriptor;
  get(commandId: string): CommandDescriptor;
  list(options?: Omit<ListCommandsOptions, "pluginId">): readonly CommandDescriptor[];
};

export type PluginViewDefinition<Props = unknown> = Omit<
  ViewDefinition<Props>,
  "pluginId"
>;

export type PluginViewRegistry = {
  register<Props = unknown>(
    definition: PluginViewDefinition<Props>,
  ): ViewDefinition<Props>;
  get(viewId: string): ViewDefinition;
  list(options?: Omit<ListViewsOptions, "pluginId">): readonly ViewDefinition[];
};

export type PluginSlotDefinition<Props = unknown> = Omit<
  SlotContribution<Props>,
  "pluginId"
>;

export type PluginSlotRegistry = {
  register<Props = unknown>(
    contribution: PluginSlotDefinition<Props>,
  ): SlotContribution<Props>;
  get(contributionId: string): SlotContribution;
  list(
    options?: Omit<ListSlotContributionsOptions, "pluginId">,
  ): readonly SlotContribution[];
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

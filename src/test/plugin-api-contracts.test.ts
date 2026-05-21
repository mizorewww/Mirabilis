import { describe, expect, expectTypeOf, it } from "vitest";

import { PluginHost, createInMemoryAppRuntime } from "../core";
import * as pluginApiEntrypoint from "../core/plugin-api";
import type {
  AlgorithmContribution,
  AppPlugin,
  AppRuntimeInfo,
  CommandContribution,
  EventTypeContribution,
  FilterContribution,
  IndexerContribution,
  MarkdownSyntaxContribution,
  MetadataFieldContribution,
  MobileToolbarContribution,
  PluginCommandDescriptor,
  PluginCommandRegistry,
  PluginCommandHandler,
  PluginCommandListOptions,
  PluginContext,
  PluginContributions,
  PluginCommandDefinition,
  PluginAppendEventInput,
  PluginDependency,
  PluginDependencyReference,
  PluginEventStore,
  PluginFilterCondition,
  PluginFilterQuery,
  PluginFilterStore,
  PluginInstallContext,
  PluginLifecycleResult,
  PluginListEventsOptions,
  PluginListFiltersOptions,
  PluginListMetadataOptions,
  PluginManifest,
  PluginMetadataStore,
  PluginPageStore,
  PluginPermission,
  PluginSaveFilterInput,
  PluginSetMetadataInput,
  PluginSlotDescriptor,
  PluginSlotContribution,
  PluginSlotDefinition,
  PluginSlotListOptions,
  PluginSlotRegistry,
  PluginTransaction,
  PluginTransactionHandler,
  PluginTransactionManager,
  PluginUninstallContext,
  PluginUpdateFilterInput,
  PluginViewDescriptor,
  PluginViewDefinition,
  PluginViewListOptions,
  PluginViewRegistry,
  SettingsPanelContribution,
  ViewContribution,
} from "../core/plugin-api";
import type {
  AlgorithmContribution as AlgorithmContributionFromCore,
  AppPlugin as AppPluginFromCore,
  AppRuntimeInfo as AppRuntimeInfoFromCore,
  CommandContribution as CommandContributionFromCore,
  CommandRegistry,
  EventStore,
  EventTypeContribution as EventTypeContributionFromCore,
  FilterContribution as FilterContributionFromCore,
  FilterGroup,
  FilterStore,
  FilterSort,
  IndexerContribution as IndexerContributionFromCore,
  MarkdownSyntaxContribution as MarkdownSyntaxContributionFromCore,
  MetadataFieldContribution as MetadataFieldContributionFromCore,
  MetadataStore,
  MobileToolbarContribution as MobileToolbarContributionFromCore,
  PluginAppendEventInput as PluginAppendEventInputFromCore,
  PluginCommandDescriptor as PluginCommandDescriptorFromCore,
  PluginCommandRegistry as PluginCommandRegistryFromCore,
  PluginCommandHandler as PluginCommandHandlerFromCore,
  PluginCommandListOptions as PluginCommandListOptionsFromCore,
  PluginCommandDefinition as PluginCommandDefinitionFromCore,
  PluginContext as PluginContextFromCore,
  PluginContributions as PluginContributionsFromCore,
  PluginDependency as PluginDependencyFromCore,
  PluginDependencyReference as PluginDependencyReferenceFromCore,
  PluginListEventsOptions as PluginListEventsOptionsFromCore,
  PluginListFiltersOptions as PluginListFiltersOptionsFromCore,
  PluginListMetadataOptions as PluginListMetadataOptionsFromCore,
  PluginInstallContext as PluginInstallContextFromCore,
  PluginLifecycleResult as PluginLifecycleResultFromCore,
  PluginManifest as PluginManifestFromCore,
  MetadataJsonValue,
  MetadataValueType,
  PluginPermission as PluginPermissionFromCore,
  PluginFilterCondition as PluginFilterConditionFromCore,
  PluginFilterQuery as PluginFilterQueryFromCore,
  PluginSaveFilterInput as PluginSaveFilterInputFromCore,
  PluginSetMetadataInput as PluginSetMetadataInputFromCore,
  PluginSlotDescriptor as PluginSlotDescriptorFromCore,
  PluginSlotContribution as PluginSlotContributionFromCore,
  PluginSlotDefinition as PluginSlotDefinitionFromCore,
  PluginSlotListOptions as PluginSlotListOptionsFromCore,
  PluginSlotRegistry as PluginSlotRegistryFromCore,
  PluginTransaction as PluginTransactionFromCore,
  PluginTransactionHandler as PluginTransactionHandlerFromCore,
  PluginTransactionManager as PluginTransactionManagerFromCore,
  PluginUninstallContext as PluginUninstallContextFromCore,
  PluginUpdateFilterInput as PluginUpdateFilterInputFromCore,
  PluginViewDescriptor as PluginViewDescriptorFromCore,
  PluginViewDefinition as PluginViewDefinitionFromCore,
  PluginViewListOptions as PluginViewListOptionsFromCore,
  PluginViewRegistry as PluginViewRegistryFromCore,
  PageStore,
  SettingsPanelContribution as SettingsPanelContributionFromCore,
  SlotRegistry,
  TransactionManager,
  ViewContribution as ViewContributionFromCore,
  ViewRegistry,
} from "../core";

type LifecycleResult = PluginLifecycleResult;
type ArrayElement<Value> = Value extends readonly (infer Element)[]
  ? Element
  : never;
type KeyLeak<
  Surface,
  Key extends PropertyKey,
  Label extends string,
> = Extract<keyof Surface, Key> extends never ? never : Label;
type BroadStringKeyLeak<
  Surface,
  Pattern extends string,
  Label extends string,
> = Pattern extends keyof Surface ? Label : never;
type OwnershipKeyValueLeak<
  Surface,
  Key extends PropertyKey,
  Label extends string,
> = Key extends keyof Surface
  ? [NonNullable<Surface[Key]>] extends [never]
    ? never
    : Label
  : never;
type AssignableLeak<Candidate, Surface, Label extends string> =
  Candidate extends Surface ? Label : never;
type SourcePluginReservationPattern = `sourcePluginId${string}`;
type PublicStoreShapeKeys<Surface> = Exclude<
  keyof Surface,
  SourcePluginReservationPattern
>;
type UnexpectedPublicStoreKeyLeak<
  Surface,
  Allowed extends PropertyKey,
  Label extends string,
> = Exclude<PublicStoreShapeKeys<Surface>, Allowed> extends never
  ? never
  : Label;
type MissingPublicStoreKeyLeak<
  Surface,
  Required extends PropertyKey,
  Label extends string,
> = Exclude<Required, PublicStoreShapeKeys<Surface>> extends never
  ? never
  : Label;
type PublicStoreShapeKeyLeak<
  Surface,
  Keys extends PropertyKey,
  Label extends string,
> =
  | UnexpectedPublicStoreKeyLeak<Surface, Keys, `${Label}.extra-key`>
  | MissingPublicStoreKeyLeak<Surface, Keys, `${Label}.missing-key`>;
type FunctionAssignableLeak<Value, Label extends string> = (() => boolean) extends
  NonNullable<Value>
  ? Label
  : never;
type JsonCompatibilityLeak<Value, Label extends string> = NonNullable<
  Value
> extends MetadataJsonValue
  ? never
  : Label;
type SlotExecutableSurfaceConditionLeak<
  Surface,
  Label extends string,
> = Surface extends { when?: infer Condition }
  ? FunctionAssignableLeak<Condition, Label>
  : never;
type ForbiddenPluginContextKey =
  | "stores"
  | "registries"
  | "services"
  | "invoke"
  | "tauri"
  | "native"
  | "sqlite"
  | "filesystem"
  | "fileSystem"
  | "fs";
type RawPermissionLeak = string extends PluginPermission
  ? "permissions.raw-string"
  : never;
type LegacyContributionKey = Extract<keyof PluginContributions, "viewSlots">;
type RawRegistryFacadeLeak =
  | (PluginCommandRegistry extends CommandRegistry ? "commands" : never)
  | (PluginViewRegistry extends ViewRegistry ? "views" : never)
  | (PluginSlotRegistry extends SlotRegistry ? "slots" : never)
  | (PluginTransactionManager extends TransactionManager
      ? "transaction"
      : never);
type RawStoreFacadeLeak =
  | (PluginContext["pages"] extends PageStore ? "pages" : never)
  | (PluginContext["metadata"] extends MetadataStore ? "metadata" : never)
  | (PluginContext["events"] extends EventStore ? "events" : never)
  | (PluginContext["filters"] extends FilterStore ? "filters" : never);
type ManifestExecutableDescriptorKey =
  | Extract<keyof CommandContribution, "handler">
  | Extract<keyof ViewContribution, "component">
  | Extract<keyof PluginSlotContribution, "component">;
type SlotExecutableConditionLeak =
  PluginSlotContribution extends { when?: infer Condition }
    ? (() => boolean) extends NonNullable<Condition>
      ? "when"
      : never
    : "when";
type PluginMetadataSetInput = Parameters<PluginContext["metadata"]["set"]>[0];
type PluginMetadataListOptions = NonNullable<
  Parameters<PluginContext["metadata"]["list"]>[0]
>;
type PluginEventAppendInput = Parameters<PluginContext["events"]["append"]>[0];
type PluginEventListOptions = NonNullable<
  Parameters<PluginContext["events"]["list"]>[0]
>;
type PluginFilterSaveInput = Parameters<PluginContext["filters"]["save"]>[0];
type PluginFilterUpdateInput = Parameters<
  PluginContext["filters"]["update"]
>[1];
type PluginFilterListOptions = NonNullable<
  Parameters<PluginContext["filters"]["list"]>[0]
>;
type ExpectedPluginSetMetadataInput = {
  pageId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
};
type ExpectedPluginListMetadataOptions = {
  pageId?: string;
  namespace?: string;
  key?: string;
};
type ExpectedPluginAppendEventInput = {
  pageId?: string;
  namespace: string;
  type: string;
  payload: MetadataJsonValue;
};
type ExpectedPluginListEventsOptions = {
  pageId?: string;
  namespace?: string;
};
type ExpectedPluginSaveFilterInput = {
  id?: string;
  name: string;
  query: PluginFilterQuery;
  sort?: FilterSort[];
  group?: FilterGroup;
  viewType: string;
};
type ExpectedPluginUpdateFilterInput = {
  name?: string;
  query?: PluginFilterQuery;
  sort?: FilterSort[] | null;
  group?: FilterGroup | null;
  viewType?: string;
};
type ExpectedPluginListFiltersOptions = {
  viewType?: string;
};
type PluginPublicStoreShapeLeak =
  | PublicStoreShapeKeyLeak<
      PluginSetMetadataInput,
      keyof ExpectedPluginSetMetadataInput,
      "metadata.set"
    >
  | PublicStoreShapeKeyLeak<
      PluginListMetadataOptions,
      keyof ExpectedPluginListMetadataOptions,
      "metadata.list"
    >
  | PublicStoreShapeKeyLeak<
      PluginAppendEventInput,
      keyof ExpectedPluginAppendEventInput,
      "events.append"
    >
  | PublicStoreShapeKeyLeak<
      PluginListEventsOptions,
      keyof ExpectedPluginListEventsOptions,
      "events.list"
    >
  | PublicStoreShapeKeyLeak<
      PluginSaveFilterInput,
      keyof ExpectedPluginSaveFilterInput,
      "filters.save"
    >
  | PublicStoreShapeKeyLeak<
      PluginUpdateFilterInput,
      keyof ExpectedPluginUpdateFilterInput,
      "filters.update"
    >
  | PublicStoreShapeKeyLeak<
      PluginListFiltersOptions,
      keyof ExpectedPluginListFiltersOptions,
      "filters.list"
    >;
type CallerSuppliedSourcePluginIdKey =
  | OwnershipKeyValueLeak<
      PluginMetadataSetInput,
      "sourcePluginId",
      "metadata.set.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginMetadataListOptions,
      "sourcePluginId",
      "metadata.list.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginEventAppendInput,
      "sourcePluginId",
      "events.append.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginEventListOptions,
      "sourcePluginId",
      "events.list.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginFilterSaveInput,
      "sourcePluginId",
      "filters.save.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginFilterUpdateInput,
      "sourcePluginId",
      "filters.update.sourcePluginId"
    >
  | OwnershipKeyValueLeak<
      PluginFilterListOptions,
      "sourcePluginId",
      "filters.list.sourcePluginId"
    >;
type CallerSuppliedSourcePluginIdTemplateKeyLeak =
  | BroadStringKeyLeak<
      PluginMetadataSetInput,
      `sourcePlugin${string}`,
      "metadata.set.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginMetadataListOptions,
      `sourcePlugin${string}`,
      "metadata.list.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginEventAppendInput,
      `sourcePlugin${string}`,
      "events.append.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginEventListOptions,
      `sourcePlugin${string}`,
      "events.list.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginFilterSaveInput,
      `sourcePlugin${string}`,
      "filters.save.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginFilterUpdateInput,
      `sourcePlugin${string}`,
      "filters.update.sourcePlugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginFilterListOptions,
      `sourcePlugin${string}`,
      "filters.list.sourcePlugin-template-key"
    >;
type CallerSourcePluginIdMetadataSetVariable = {
  pageId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
  sourcePluginId: string;
};
type CallerSourcePluginIdMetadataListVariable = {
  pageId: string;
  sourcePluginId: string;
};
type CallerSourcePluginIdEventAppendVariable = {
  pageId: string;
  namespace: string;
  type: string;
  payload: MetadataJsonValue;
  sourcePluginId: string;
};
type CallerSourcePluginIdEventListVariable = {
  namespace: string;
  sourcePluginId: string;
};
type CallerSourcePluginIdFilterSaveVariable = {
  name: string;
  query: PluginFilterQuery;
  viewType: string;
  sourcePluginId: string;
};
type CallerSourcePluginIdFilterUpdateVariable = {
  viewType: string;
  sourcePluginId: string;
};
type CallerSourcePluginIdFilterListVariable = {
  viewType: string;
  sourcePluginId: string;
};
type CallerSourcePluginIdMetadataSetLeak = AssignableLeak<
  CallerSourcePluginIdMetadataSetVariable,
  PluginMetadataSetInput,
  "metadata.set.sourcePluginId.variable"
>;
type CallerSourcePluginIdMetadataListLeak = AssignableLeak<
  CallerSourcePluginIdMetadataListVariable,
  PluginMetadataListOptions,
  "metadata.list.sourcePluginId.variable"
>;
type CallerSourcePluginIdEventAppendLeak = AssignableLeak<
  CallerSourcePluginIdEventAppendVariable,
  PluginEventAppendInput,
  "events.append.sourcePluginId.variable"
>;
type CallerSourcePluginIdEventListLeak = AssignableLeak<
  CallerSourcePluginIdEventListVariable,
  PluginEventListOptions,
  "events.list.sourcePluginId.variable"
>;
type CallerSourcePluginIdFilterSaveLeak = AssignableLeak<
  CallerSourcePluginIdFilterSaveVariable,
  PluginFilterSaveInput,
  "filters.save.sourcePluginId.variable"
>;
type CallerSourcePluginIdFilterUpdateLeak = AssignableLeak<
  CallerSourcePluginIdFilterUpdateVariable,
  PluginFilterUpdateInput,
  "filters.update.sourcePluginId.variable"
>;
type CallerSourcePluginIdFilterListLeak = AssignableLeak<
  CallerSourcePluginIdFilterListVariable,
  PluginFilterListOptions,
  "filters.list.sourcePluginId.variable"
>;
type CallerSuppliedSourcePluginIdAssignableLeak =
  | CallerSourcePluginIdMetadataSetLeak
  | CallerSourcePluginIdMetadataListLeak
  | CallerSourcePluginIdEventAppendLeak
  | CallerSourcePluginIdEventListLeak
  | CallerSourcePluginIdFilterSaveLeak
  | CallerSourcePluginIdFilterUpdateLeak
  | CallerSourcePluginIdFilterListLeak;
type CallerSourcePluginIdMetadataSetUndefinedVariable = {
  pageId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdMetadataListUndefinedVariable = {
  pageId: string;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdEventAppendUndefinedVariable = {
  pageId: string;
  namespace: string;
  type: string;
  payload: MetadataJsonValue;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdEventListUndefinedVariable = {
  namespace: string;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdFilterSaveUndefinedVariable = {
  name: string;
  query: PluginFilterQuery;
  viewType: string;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdFilterUpdateUndefinedVariable = {
  viewType: string;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdFilterListUndefinedVariable = {
  viewType: string;
  sourcePluginId: undefined;
};
type CallerSourcePluginIdMetadataSetUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdMetadataSetUndefinedVariable,
  PluginMetadataSetInput,
  "metadata.set.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdMetadataListUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdMetadataListUndefinedVariable,
  PluginMetadataListOptions,
  "metadata.list.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdEventAppendUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdEventAppendUndefinedVariable,
  PluginEventAppendInput,
  "events.append.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdEventListUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdEventListUndefinedVariable,
  PluginEventListOptions,
  "events.list.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdFilterSaveUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdFilterSaveUndefinedVariable,
  PluginFilterSaveInput,
  "filters.save.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdFilterUpdateUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdFilterUpdateUndefinedVariable,
  PluginFilterUpdateInput,
  "filters.update.sourcePluginId.undefined-variable"
>;
type CallerSourcePluginIdFilterListUndefinedLeak = AssignableLeak<
  CallerSourcePluginIdFilterListUndefinedVariable,
  PluginFilterListOptions,
  "filters.list.sourcePluginId.undefined-variable"
>;
type CallerSuppliedSourcePluginIdUndefinedAssignableLeak =
  | CallerSourcePluginIdMetadataSetUndefinedLeak
  | CallerSourcePluginIdMetadataListUndefinedLeak
  | CallerSourcePluginIdEventAppendUndefinedLeak
  | CallerSourcePluginIdEventListUndefinedLeak
  | CallerSourcePluginIdFilterSaveUndefinedLeak
  | CallerSourcePluginIdFilterUpdateUndefinedLeak
  | CallerSourcePluginIdFilterListUndefinedLeak;
type PluginCommandRegisterInput = Parameters<
  PluginCommandRegistry["register"]
>[0];
type PluginViewRegisterInput = Parameters<PluginViewRegistry["register"]>[0];
type PluginSlotRegisterInput = Parameters<PluginSlotRegistry["register"]>[0];
type PluginCommandRegistryListOptions = NonNullable<
  Parameters<PluginCommandRegistry["list"]>[0]
>;
type PluginViewRegistryListOptions = NonNullable<
  Parameters<PluginViewRegistry["list"]>[0]
>;
type PluginSlotRegistryListOptions = NonNullable<
  Parameters<PluginSlotRegistry["list"]>[0]
>;
type CallerSuppliedRegistryPluginIdKey =
  | OwnershipKeyValueLeak<
      PluginCommandRegisterInput,
      "pluginId",
      "commands.register.pluginId"
    >
  | OwnershipKeyValueLeak<
      PluginViewRegisterInput,
      "pluginId",
      "views.register.pluginId"
    >
  | OwnershipKeyValueLeak<
      PluginSlotRegisterInput,
      "pluginId",
      "slots.register.pluginId"
    >
  | OwnershipKeyValueLeak<
      PluginCommandRegistryListOptions,
      "pluginId",
      "commands.list.pluginId"
    >
  | OwnershipKeyValueLeak<
      PluginViewRegistryListOptions,
      "pluginId",
      "views.list.pluginId"
    >
  | OwnershipKeyValueLeak<
      PluginSlotRegistryListOptions,
      "pluginId",
      "slots.list.pluginId"
    >;
type CallerSuppliedRegistryPluginIdTemplateKeyLeak =
  | BroadStringKeyLeak<
      PluginCommandRegisterInput,
      `plugin${string}`,
      "commands.register.plugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginViewRegisterInput,
      `plugin${string}`,
      "views.register.plugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginSlotRegisterInput,
      `plugin${string}`,
      "slots.register.plugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginCommandRegistryListOptions,
      `plugin${string}`,
      "commands.list.plugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginViewRegistryListOptions,
      `plugin${string}`,
      "views.list.plugin-template-key"
    >
  | BroadStringKeyLeak<
      PluginSlotRegistryListOptions,
      `plugin${string}`,
      "slots.list.plugin-template-key"
    >;
type CallerPluginIdCommandDefinitionVariable = {
  id: string;
  pluginId: string;
  title: string;
  handler(input: unknown): unknown;
};
type CallerPluginIdViewDefinitionVariable = {
  id: string;
  pluginId: string;
  type: string;
  title: string;
  accepts: MetadataJsonValue;
  component(): null;
};
type CallerPluginIdSlotDefinitionVariable = {
  id: string;
  pluginId: string;
  slot: string;
  component(): null;
};
type CallerPluginIdCommandListVariable = {
  pluginId: string;
};
type CallerPluginIdViewListVariable = {
  type: string;
  pluginId: string;
};
type CallerPluginIdSlotListVariable = {
  slot: string;
  pluginId: string;
};
type CallerPluginIdCommandDefinitionLeak = AssignableLeak<
  CallerPluginIdCommandDefinitionVariable,
  PluginCommandRegisterInput,
  "commands.register.pluginId.variable"
>;
type CallerPluginIdViewDefinitionLeak = AssignableLeak<
  CallerPluginIdViewDefinitionVariable,
  PluginViewRegisterInput,
  "views.register.pluginId.variable"
>;
type CallerPluginIdSlotDefinitionLeak = AssignableLeak<
  CallerPluginIdSlotDefinitionVariable,
  PluginSlotRegisterInput,
  "slots.register.pluginId.variable"
>;
type CallerPluginIdCommandListLeak = AssignableLeak<
  CallerPluginIdCommandListVariable,
  PluginCommandRegistryListOptions,
  "commands.list.pluginId.variable"
>;
type CallerPluginIdViewListLeak = AssignableLeak<
  CallerPluginIdViewListVariable,
  PluginViewRegistryListOptions,
  "views.list.pluginId.variable"
>;
type CallerPluginIdSlotListLeak = AssignableLeak<
  CallerPluginIdSlotListVariable,
  PluginSlotRegistryListOptions,
  "slots.list.pluginId.variable"
>;
type CallerSuppliedRegistryPluginIdAssignableLeak =
  | CallerPluginIdCommandDefinitionLeak
  | CallerPluginIdViewDefinitionLeak
  | CallerPluginIdSlotDefinitionLeak
  | CallerPluginIdCommandListLeak
  | CallerPluginIdViewListLeak
  | CallerPluginIdSlotListLeak;
type CallerPluginIdCommandDefinitionUndefinedVariable = {
  id: string;
  pluginId: undefined;
  title: string;
  handler(input: unknown): unknown;
};
type CallerPluginIdViewDefinitionUndefinedVariable = {
  id: string;
  pluginId: undefined;
  type: string;
  title: string;
  accepts: MetadataJsonValue;
  component(): null;
};
type CallerPluginIdSlotDefinitionUndefinedVariable = {
  id: string;
  pluginId: undefined;
  slot: string;
  component(): null;
};
type CallerPluginIdCommandListUndefinedVariable = {
  pluginId: undefined;
};
type CallerPluginIdViewListUndefinedVariable = {
  type: string;
  pluginId: undefined;
};
type CallerPluginIdSlotListUndefinedVariable = {
  slot: string;
  pluginId: undefined;
};
type CallerPluginIdCommandDefinitionUndefinedLeak = AssignableLeak<
  CallerPluginIdCommandDefinitionUndefinedVariable,
  PluginCommandRegisterInput,
  "commands.register.pluginId.undefined-variable"
>;
type CallerPluginIdViewDefinitionUndefinedLeak = AssignableLeak<
  CallerPluginIdViewDefinitionUndefinedVariable,
  PluginViewRegisterInput,
  "views.register.pluginId.undefined-variable"
>;
type CallerPluginIdSlotDefinitionUndefinedLeak = AssignableLeak<
  CallerPluginIdSlotDefinitionUndefinedVariable,
  PluginSlotRegisterInput,
  "slots.register.pluginId.undefined-variable"
>;
type CallerPluginIdCommandListUndefinedLeak = AssignableLeak<
  CallerPluginIdCommandListUndefinedVariable,
  PluginCommandRegistryListOptions,
  "commands.list.pluginId.undefined-variable"
>;
type CallerPluginIdViewListUndefinedLeak = AssignableLeak<
  CallerPluginIdViewListUndefinedVariable,
  PluginViewRegistryListOptions,
  "views.list.pluginId.undefined-variable"
>;
type CallerPluginIdSlotListUndefinedLeak = AssignableLeak<
  CallerPluginIdSlotListUndefinedVariable,
  PluginSlotRegistryListOptions,
  "slots.list.pluginId.undefined-variable"
>;
type CallerSuppliedRegistryPluginIdUndefinedAssignableLeak =
  | CallerPluginIdCommandDefinitionUndefinedLeak
  | CallerPluginIdViewDefinitionUndefinedLeak
  | CallerPluginIdSlotDefinitionUndefinedLeak
  | CallerPluginIdCommandListUndefinedLeak
  | CallerPluginIdViewListUndefinedLeak
  | CallerPluginIdSlotListUndefinedLeak;
type PluginViewRegisterResult = ReturnType<PluginViewRegistry["register"]>;
type PluginViewGetResult = ReturnType<PluginViewRegistry["get"]>;
type PluginViewListResult = ArrayElement<ReturnType<PluginViewRegistry["list"]>>;
type PluginSlotRegisterResult = ReturnType<PluginSlotRegistry["register"]>;
type PluginSlotGetResult = ReturnType<PluginSlotRegistry["get"]>;
type PluginSlotListResult = ArrayElement<ReturnType<PluginSlotRegistry["list"]>>;
type PluginRegistryExecutableReturnLeak =
  | KeyLeak<
      PluginViewRegisterResult,
      "component",
      "views.register.component"
    >
  | KeyLeak<PluginViewGetResult, "component", "views.get.component">
  | KeyLeak<PluginViewListResult, "component", "views.list.component">
  | KeyLeak<
      PluginSlotRegisterResult,
      "component",
      "slots.register.component"
    >
  | KeyLeak<PluginSlotGetResult, "component", "slots.get.component">
  | KeyLeak<PluginSlotListResult, "component", "slots.list.component">
  | SlotExecutableSurfaceConditionLeak<
      PluginSlotRegisterResult,
      "slots.register.when"
    >
  | SlotExecutableSurfaceConditionLeak<PluginSlotGetResult, "slots.get.when">
  | SlotExecutableSurfaceConditionLeak<PluginSlotListResult, "slots.list.when">;
type PluginContributionJsonCompatibilityLeak =
  | JsonCompatibilityLeak<
      EventTypeContribution["payloadSchema"],
      "eventTypes.payloadSchema"
    >
  | JsonCompatibilityLeak<
      AlgorithmContribution["inputSchema"],
      "algorithms.inputSchema"
    >
  | JsonCompatibilityLeak<
      AlgorithmContribution["outputSchema"],
      "algorithms.outputSchema"
    >
  | JsonCompatibilityLeak<
      FilterContribution["query"]["where"][number]["value"],
      "filters.query.where.value"
    >;
type PluginApiBoundaryLeak =
  | RawPermissionLeak
  | LegacyContributionKey
  | Extract<keyof PluginContext, ForbiddenPluginContextKey>
  | RawRegistryFacadeLeak
  | RawStoreFacadeLeak
  | Extract<
      | keyof PluginCommandRegistry
      | keyof PluginViewRegistry
      | keyof PluginSlotRegistry,
      "unregister"
    >
  | ManifestExecutableDescriptorKey
  | SlotExecutableConditionLeak
  | CallerSuppliedSourcePluginIdKey
  | CallerSuppliedSourcePluginIdAssignableLeak
  | CallerSuppliedRegistryPluginIdKey
  | CallerSuppliedRegistryPluginIdAssignableLeak
  | PluginPublicStoreShapeLeak
  | PluginContributionJsonCompatibilityLeak
  | PluginRegistryExecutableReturnLeak;

function expectNoTypeLeak<Leak extends never>(): void {
  void (undefined as unknown as Leak);
}

describe("Plugin API contracts", () => {
  it("provides a public plugin-api module and re-exports contracts from Core", () => {
    expect(pluginApiEntrypoint).toEqual(expect.any(Object));

    expectTypeOf<PluginManifestFromCore>().toEqualTypeOf<PluginManifest>();
    expectTypeOf<PluginDependencyFromCore>().toEqualTypeOf<PluginDependency>();
    expectTypeOf<PluginDependencyReferenceFromCore>().toEqualTypeOf<
      PluginDependencyReference
    >();
    expectTypeOf<PluginPermissionFromCore>().toEqualTypeOf<PluginPermission>();
    expectTypeOf<PluginContributionsFromCore>().toEqualTypeOf<
      PluginContributions
    >();
    expectTypeOf<MarkdownSyntaxContributionFromCore>().toEqualTypeOf<
      MarkdownSyntaxContribution
    >();
    expectTypeOf<MetadataFieldContributionFromCore>().toEqualTypeOf<
      MetadataFieldContribution
    >();
    expectTypeOf<EventTypeContributionFromCore>().toEqualTypeOf<
      EventTypeContribution
    >();
    expectTypeOf<CommandContributionFromCore>().toEqualTypeOf<
      CommandContribution
    >();
    expectTypeOf<FilterContributionFromCore>().toEqualTypeOf<
      FilterContribution
    >();
    expectTypeOf<PluginFilterConditionFromCore>().toEqualTypeOf<
      PluginFilterCondition
    >();
    expectTypeOf<PluginFilterQueryFromCore>().toEqualTypeOf<
      PluginFilterQuery
    >();
    expectTypeOf<ViewContributionFromCore>().toEqualTypeOf<ViewContribution>();
    expectTypeOf<PluginSlotContributionFromCore>().toEqualTypeOf<
      PluginSlotContribution
    >();
    expectTypeOf<IndexerContributionFromCore>().toEqualTypeOf<
      IndexerContribution
    >();
    expectTypeOf<AlgorithmContributionFromCore>().toEqualTypeOf<
      AlgorithmContribution
    >();
    expectTypeOf<MobileToolbarContributionFromCore>().toEqualTypeOf<
      MobileToolbarContribution
    >();
    expectTypeOf<SettingsPanelContributionFromCore>().toEqualTypeOf<
      SettingsPanelContribution
    >();
    expectTypeOf<AppPluginFromCore>().toEqualTypeOf<AppPlugin>();
    expectTypeOf<PluginContextFromCore>().toEqualTypeOf<PluginContext>();
    expectTypeOf<PluginInstallContextFromCore>().toEqualTypeOf<
      PluginInstallContext
    >();
    expectTypeOf<PluginUninstallContextFromCore>().toEqualTypeOf<
      PluginUninstallContext
    >();
    expectTypeOf<AppRuntimeInfoFromCore>().toEqualTypeOf<AppRuntimeInfo>();
    expectTypeOf<PluginSetMetadataInputFromCore>().toEqualTypeOf<
      PluginSetMetadataInput
    >();
    expectTypeOf<PluginListMetadataOptionsFromCore>().toEqualTypeOf<
      PluginListMetadataOptions
    >();
    expectTypeOf<PluginAppendEventInputFromCore>().toEqualTypeOf<
      PluginAppendEventInput
    >();
    expectTypeOf<PluginListEventsOptionsFromCore>().toEqualTypeOf<
      PluginListEventsOptions
    >();
    expectTypeOf<PluginSaveFilterInputFromCore>().toEqualTypeOf<
      PluginSaveFilterInput
    >();
    expectTypeOf<PluginUpdateFilterInputFromCore>().toEqualTypeOf<
      PluginUpdateFilterInput
    >();
    expectTypeOf<PluginListFiltersOptionsFromCore>().toEqualTypeOf<
      PluginListFiltersOptions
    >();
    expectTypeOf<PluginCommandRegistryFromCore>().toEqualTypeOf<
      PluginCommandRegistry
    >();
    expectTypeOf<PluginCommandDescriptorFromCore>().toEqualTypeOf<
      PluginCommandDescriptor
    >();
    expectTypeOf<
      PluginCommandHandlerFromCore<{ pageId: string }, string>
    >().toEqualTypeOf<PluginCommandHandler<{ pageId: string }, string>>();
    expectTypeOf<PluginCommandListOptionsFromCore>().toEqualTypeOf<
      PluginCommandListOptions
    >();
    expectTypeOf<
      PluginCommandDefinitionFromCore<{ pageId: string }, string>
    >().toEqualTypeOf<PluginCommandDefinition<{ pageId: string }, string>>();
    expectTypeOf<PluginViewRegistryFromCore>().toEqualTypeOf<
      PluginViewRegistry
    >();
    expectTypeOf<PluginViewDescriptorFromCore>().toEqualTypeOf<
      PluginViewDescriptor
    >();
    expectTypeOf<PluginViewListOptionsFromCore>().toEqualTypeOf<
      PluginViewListOptions
    >();
    expectTypeOf<PluginViewDefinitionFromCore<{ pageId: string }>>()
      .toEqualTypeOf<PluginViewDefinition<{ pageId: string }>>();
    expectTypeOf<PluginSlotRegistryFromCore>().toEqualTypeOf<
      PluginSlotRegistry
    >();
    expectTypeOf<PluginSlotDescriptorFromCore>().toEqualTypeOf<
      PluginSlotDescriptor
    >();
    expectTypeOf<PluginSlotListOptionsFromCore>().toEqualTypeOf<
      PluginSlotListOptions
    >();
    expectTypeOf<PluginSlotDefinitionFromCore<{ pageId: string }>>()
      .toEqualTypeOf<PluginSlotDefinition<{ pageId: string }>>();
    expectTypeOf<PluginTransactionFromCore>().toEqualTypeOf<
      PluginTransaction
    >();
    expectTypeOf<PluginTransactionHandlerFromCore<string>>()
      .toEqualTypeOf<PluginTransactionHandler<string>>();
    expectTypeOf<PluginTransactionManagerFromCore>().toEqualTypeOf<
      PluginTransactionManager
    >();
    expectTypeOf<PluginLifecycleResultFromCore>().toEqualTypeOf<
      PluginLifecycleResult
    >();
    expectTypeOf<PluginMetadataSetInput>().toEqualTypeOf<
      PluginSetMetadataInput
    >();
    expectTypeOf<PluginMetadataListOptions>().toEqualTypeOf<
      PluginListMetadataOptions
    >();
    expectTypeOf<PluginEventAppendInput>().toEqualTypeOf<
      PluginAppendEventInput
    >();
    expectTypeOf<PluginEventListOptions>().toEqualTypeOf<
      PluginListEventsOptions
    >();
    expectTypeOf<PluginFilterSaveInput>().toEqualTypeOf<
      PluginSaveFilterInput
    >();
    expectTypeOf<PluginFilterUpdateInput>().toEqualTypeOf<
      PluginUpdateFilterInput
    >();
    expectTypeOf<PluginFilterListOptions>().toEqualTypeOf<
      PluginListFiltersOptions
    >();
    expectTypeOf<PluginCommandRegistryListOptions>().toEqualTypeOf<
      PluginCommandListOptions
    >();
    expectTypeOf<PluginViewRegistryListOptions>().toEqualTypeOf<
      PluginViewListOptions
    >();
    expectTypeOf<PluginSlotRegistryListOptions>().toEqualTypeOf<
      PluginSlotListOptions
    >();
  });

  it("allows plugin command handlers to receive input plus command-time context while keeping one-argument handlers source-compatible", () => {
    type CommandInput = {
      pageId: string;
    };
    type CommandOutput = {
      pageId: string;
    };

    const contextAwareHandler = ((
      input: CommandInput,
      context: PluginContext,
    ) => {
      context.metadata.set({
        pageId: input.pageId,
        namespace: "example",
        key: "lastRun",
        value: true,
        valueType: "boolean",
      });

      return { pageId: input.pageId };
    }) satisfies PluginCommandHandler<CommandInput, CommandOutput>;
    const oneArgumentHandler = ((input: CommandInput) =>
      input.pageId) satisfies PluginCommandHandler<CommandInput, string>;
    const contextAwareDefinition = {
      id: "example.context-aware-command",
      title: "Context aware command",
      handler: contextAwareHandler,
    } satisfies PluginCommandDefinition<CommandInput, CommandOutput>;
    const oneArgumentDefinition = {
      id: "example.one-argument-command",
      title: "One argument command",
      handler: oneArgumentHandler,
    } satisfies PluginCommandDefinition<CommandInput, string>;

    expectTypeOf<Parameters<PluginCommandHandler<CommandInput, CommandOutput>>>()
      .toEqualTypeOf<[CommandInput, PluginContext]>();
    expectTypeOf<typeof contextAwareHandler>().toExtend<
      PluginCommandHandler<CommandInput, CommandOutput>
    >();
    expectTypeOf<typeof oneArgumentHandler>().toExtend<
      PluginCommandHandler<CommandInput, string>
    >();
    expect(contextAwareDefinition.handler).toBe(contextAwareHandler);
    expect(oneArgumentDefinition.handler).toBe(oneArgumentHandler);
  });

  it("defines manifests with optional entrypoints, readonly dependencies, and app-domain permissions", () => {
    const requiredDependency = {
      id: "example.base",
    } satisfies PluginDependency;
    const optionalDependency = {
      id: "example.optional",
    } satisfies PluginDependency;
    const permissions = [
      {
        id: "example.pages.read",
      },
      {
        id: "example.events.write",
      },
    ] as const satisfies readonly PluginPermission[];

    expectTypeOf<PluginDependency["id"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginDependency["version"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<PluginDependency["optional"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<PluginPermission["id"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginPermission["scope"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<PluginPermission["action"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<PluginPermission["description"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<readonly string[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<readonly PluginDependency[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<readonly (string | PluginDependency)[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<PluginManifest["id"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginManifest["name"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginManifest["version"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginManifest["description"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<PluginManifest["author"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<PluginManifest["minAppVersion"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginManifest["main"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<PluginManifest["dependencies"]>().toEqualTypeOf<
      readonly PluginDependencyReference[] | undefined
    >();
    expectTypeOf<PluginManifest["optionalDependencies"]>().toEqualTypeOf<
      readonly PluginDependencyReference[] | undefined
    >();
    expectTypeOf<PluginManifest["permissions"]>().toEqualTypeOf<
      readonly PluginPermission[] | undefined
    >();
    expectTypeOf<PluginManifest["contributes"]>().toEqualTypeOf<
      PluginContributions | undefined
    >();

    const manifestWithoutMain = {
      id: "example.coreless",
      name: "Example Coreless",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      dependencies: ["example.base", requiredDependency] as const,
      optionalDependencies: ["example.optional", optionalDependency] as const,
      permissions,
    } satisfies PluginManifest;

    expect("main" in manifestWithoutMain).toBe(false);
    expect(manifestWithoutMain.dependencies).toHaveLength(2);
    expect(manifestWithoutMain.permissions[0]?.id).toBe("example.pages.read");

    const manifestWithMain = {
      id: "example.entry",
      name: "Example Entry",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      main: "plugins/example-entry/main",
    } satisfies PluginManifest;

    expect(manifestWithMain.main).toBe("plugins/example-entry/main");
  });

  it("defines every manifest contribution bucket with canonical slots", () => {
    const markdownSyntaxContribution = {
      id: "example.markdown.syntax",
    } satisfies MarkdownSyntaxContribution;
    const metadataFieldContribution = {
      id: "example.metadata.field",
    } satisfies MetadataFieldContribution;
    const eventTypeContribution = {
      id: "example.event.type",
    } satisfies EventTypeContribution;
    const commandContribution = {
      id: "example.command.open",
      title: "Open Example",
    } satisfies CommandContribution;
    const filterContribution = {
      id: "example.filter.recent",
      name: "Recent Examples",
      query: { where: [] },
      viewType: "example.view",
    } satisfies FilterContribution;
    const viewContribution = {
      id: "example.view.primary",
      type: "example.view",
      title: "Example View",
      accepts: { kind: "example.item" },
    } satisfies ViewContribution;
    const slotContribution = {
      id: "example.slot.primary",
      slot: "example.workspace.panel",
      order: 10,
      when: { surface: "example.workspace" },
    } satisfies PluginSlotContribution;
    const indexerContribution = {
      id: "example.indexer",
    } satisfies IndexerContribution;
    const algorithmContribution = {
      id: "example.algorithm",
    } satisfies AlgorithmContribution;
    const mobileToolbarContribution = {
      id: "example.mobile-toolbar.open",
      commandId: "example.command.open",
      title: "Open",
    } satisfies MobileToolbarContribution;
    const settingsPanelContribution = {
      id: "example.settings.general",
      title: "Example Settings",
    } satisfies SettingsPanelContribution;

    expectTypeOf<PluginContributions["markdownSyntax"]>().toEqualTypeOf<
      readonly MarkdownSyntaxContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["metadataFields"]>().toEqualTypeOf<
      readonly MetadataFieldContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["eventTypes"]>().toEqualTypeOf<
      readonly EventTypeContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["commands"]>().toEqualTypeOf<
      readonly CommandContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["filters"]>().toEqualTypeOf<
      readonly FilterContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["views"]>().toEqualTypeOf<
      readonly ViewContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["slots"]>().toEqualTypeOf<
      readonly PluginSlotContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["indexers"]>().toEqualTypeOf<
      readonly IndexerContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["algorithms"]>().toEqualTypeOf<
      readonly AlgorithmContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["mobileToolbarItems"]>().toEqualTypeOf<
      readonly MobileToolbarContribution[] | undefined
    >();
    expectTypeOf<PluginContributions["settingsPanels"]>().toEqualTypeOf<
      readonly SettingsPanelContribution[] | undefined
    >();

    expectTypeOf<MetadataFieldContribution["valueType"]>().toEqualTypeOf<
      MetadataValueType | undefined
    >();

    const contributions = {
      markdownSyntax: [markdownSyntaxContribution],
      metadataFields: [metadataFieldContribution],
      eventTypes: [eventTypeContribution],
      commands: [commandContribution],
      filters: [filterContribution],
      views: [viewContribution],
      slots: [slotContribution],
      indexers: [indexerContribution],
      algorithms: [algorithmContribution],
      mobileToolbarItems: [mobileToolbarContribution],
      settingsPanels: [settingsPanelContribution],
    } satisfies PluginContributions;

    const manifest = {
      id: "example.contributions",
      name: "Example Contributions",
      version: "0.1.0",
      minAppVersion: "0.1.0",
      contributes: contributions,
    } satisfies PluginManifest;

    expect(Object.keys(contributions).sort()).toEqual([
      "algorithms",
      "commands",
      "eventTypes",
      "filters",
      "indexers",
      "markdownSyntax",
      "metadataFields",
      "mobileToolbarItems",
      "settingsPanels",
      "slots",
      "views",
    ]);
    expect(manifest.contributes.slots?.[0]?.slot).toBe(
      "example.workspace.panel",
    );
  });

  it("defines AppPlugin lifecycle hooks around plugin-facing contexts", () => {
    expectTypeOf<AppPlugin["manifest"]>().toEqualTypeOf<PluginManifest>();
    expectTypeOf<AppPlugin["register"]>().toEqualTypeOf<
      (ctx: PluginContext) => LifecycleResult
    >();
    expectTypeOf<NonNullable<AppPlugin["install"]>>().toEqualTypeOf<
      (ctx: PluginInstallContext) => LifecycleResult
    >();
    expectTypeOf<NonNullable<AppPlugin["activate"]>>().toEqualTypeOf<
      (ctx: PluginContext) => LifecycleResult
    >();
    expectTypeOf<NonNullable<AppPlugin["deactivate"]>>().toEqualTypeOf<
      (ctx: PluginContext) => LifecycleResult
    >();
    expectTypeOf<NonNullable<AppPlugin["uninstall"]>>().toEqualTypeOf<
      (ctx: PluginUninstallContext) => LifecycleResult
    >();

    const manifest = {
      id: "example.lifecycle",
      name: "Example Lifecycle",
      version: "0.1.0",
      minAppVersion: "0.1.0",
    } satisfies PluginManifest;
    const plugin = {
      manifest,
      install(ctx: PluginInstallContext) {
        void ctx;
        expectTypeOf<typeof ctx>().toEqualTypeOf<PluginInstallContext>();
      },
      activate(ctx: PluginContext) {
        void ctx;
        expectTypeOf<typeof ctx>().toEqualTypeOf<PluginContext>();
        return Promise.resolve();
      },
      register(ctx: PluginContext) {
        void ctx;
        expectTypeOf<typeof ctx>().toEqualTypeOf<PluginContext>();
      },
      deactivate(ctx: PluginContext) {
        void ctx;
        expectTypeOf<typeof ctx>().toEqualTypeOf<PluginContext>();
      },
      uninstall(ctx: PluginUninstallContext) {
        void ctx;
        expectTypeOf<typeof ctx>().toEqualTypeOf<PluginUninstallContext>();
        return Promise.resolve();
      },
    } satisfies AppPlugin;

    expect(plugin.manifest.id).toBe("example.lifecycle");
  });

  it("keeps manifest descriptors inert and JSON-compatible", () => {
    const payloadSchema = {
      type: "object",
      properties: {
        pageId: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["pageId"],
      additionalProperties: false,
    } satisfies MetadataJsonValue;
    const inputSchema = {
      type: "array",
      items: { type: "number" },
    } satisfies MetadataJsonValue;
    const outputSchema = {
      anyOf: [{ type: "string" }, { type: "null" }],
    } satisfies MetadataJsonValue;
    const filterValue = {
      namespace: "task",
      tags: ["focus", "review"],
      active: true,
      limit: 3,
      empty: null,
    } satisfies MetadataJsonValue;

    const eventType = {
      id: "example.event.completed",
      namespace: "example",
      type: "completed",
      payloadSchema,
    } satisfies EventTypeContribution;
    const algorithm = {
      id: "example.algorithm.rank",
      inputSchema,
      outputSchema,
    } satisfies AlgorithmContribution;
    const filter = {
      id: "example.filter.focus",
      name: "Focused Examples",
      query: {
        where: [
          {
            field: "metadata.example.tags",
            op: "eq",
            value: filterValue,
          },
        ],
      },
      viewType: "example.view",
    } satisfies FilterContribution;

    expect(eventType.payloadSchema).toBe(payloadSchema);
    expect(algorithm.inputSchema).toBe(inputSchema);
    expect(algorithm.outputSchema).toBe(outputSchema);
    expect(filter.query.where[0]?.value).toBe(filterValue);

    expectTypeOf<EventTypeContribution["payloadSchema"]>().toEqualTypeOf<
      MetadataJsonValue | undefined
    >();
    expectTypeOf<AlgorithmContribution["inputSchema"]>().toEqualTypeOf<
      MetadataJsonValue | undefined
    >();
    expectTypeOf<AlgorithmContribution["outputSchema"]>().toEqualTypeOf<
      MetadataJsonValue | undefined
    >();
    expectTypeOf<
      FilterContribution["query"]["where"][number]["value"]
    >().toEqualTypeOf<MetadataJsonValue | undefined>();
  });

  it("uses Core metadata value types for metadata field contributions", () => {
    const field = {
      id: "example.metadata.status",
      namespace: "example",
      key: "status",
      name: "Status",
      valueType: "string",
    } satisfies MetadataFieldContribution;
    const valueTypes = [
      "string",
      "number",
      "boolean",
      "json",
      "date",
      "null",
    ] as const satisfies readonly MetadataValueType[];

    expect(field.valueType).toBe("string");
    expect(valueTypes).toContain("json");
  });

  it("keeps plugin registry registration inputs caller-scoped and return surfaces inert", () => {
    const commandDefinition = {
      id: "example.command.open",
      title: "Open Example",
      context: { surface: "example.workspace" },
      handler(input: { pageId: string }) {
        return input.pageId;
      },
    } satisfies PluginCommandDefinition<{ pageId: string }, string>;
    const viewDefinition = {
      id: "example.view.primary",
      type: "example.view",
      title: "Example View",
      accepts: { kind: "example.page" },
      component() {
        return null;
      },
    } satisfies PluginViewDefinition;
    const slotDefinition = {
      id: "example.slot.primary",
      slot: "example.workspace.panel",
      order: 10,
      component() {
        return null;
      },
      when() {
        return true;
      },
    } satisfies PluginSlotDefinition;
    const commandListOptions = {} satisfies PluginCommandListOptions;
    const viewListOptions = {
      type: "example.view",
    } satisfies PluginViewListOptions;
    const slotListOptions = {
      slot: "example.workspace.panel",
    } satisfies PluginSlotListOptions;

    expect(commandDefinition.id).toBe("example.command.open");
    expect(viewDefinition.type).toBe("example.view");
    expect(slotDefinition.slot).toBe("example.workspace.panel");
    expect(commandListOptions).toEqual({});
    expect(viewListOptions.type).toBe("example.view");
    expect(slotListOptions.slot).toBe("example.workspace.panel");

    expectNoTypeLeak<PluginRegistryExecutableReturnLeak>();

    ({
      id: "example.command.bad-owner",
      // @ts-expect-error the Plugin Host supplies command plugin ownership
      pluginId: "other.plugin",
      title: "Bad Owner",
      handler() {},
    } satisfies PluginCommandDefinition);

    ({
      id: "example.view.bad-owner",
      // @ts-expect-error the Plugin Host supplies view plugin ownership
      pluginId: "other.plugin",
      type: "example.view",
      title: "Bad Owner",
      accepts: { kind: "example.page" },
      component() {
        return null;
      },
    } satisfies PluginViewDefinition);

    ({
      id: "example.slot.bad-owner",
      // @ts-expect-error the Plugin Host supplies slot plugin ownership
      pluginId: "other.plugin",
      slot: "example.workspace.panel",
      component() {
        return null;
      },
    } satisfies PluginSlotDefinition);
  });

  it("rejects caller-supplied plugin ids from plugin registry variables", () => {
    expectNoTypeLeak<CallerSuppliedRegistryPluginIdTemplateKeyLeak>();
    expectNoTypeLeak<CallerPluginIdCommandDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdViewDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdSlotDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdCommandListLeak>();
    expectNoTypeLeak<CallerPluginIdViewListLeak>();
    expectNoTypeLeak<CallerPluginIdSlotListLeak>();
  });

  it("locks plugin-facing store input aliases to public shapes", () => {
    const metadataInput = {
      pageId: "page-1",
      namespace: "example",
      key: "status",
      value: "open",
      valueType: "string",
    } satisfies PluginSetMetadataInput;
    const metadataListOptions = {
      pageId: "page-1",
      namespace: "example",
      key: "status",
    } satisfies PluginListMetadataOptions;
    const eventInput = {
      pageId: "page-1",
      namespace: "example",
      type: "opened",
      payload: { from: "shortcut" },
    } satisfies PluginAppendEventInput;
    const eventListOptions = {
      pageId: "page-1",
      namespace: "example",
    } satisfies PluginListEventsOptions;
    const filterInput = {
      id: "filter-open-examples",
      name: "Open Examples",
      query: {
        where: [{ field: "metadata.example.status", op: "eq", value: "open" }],
      },
      sort: [{ field: "metadata.example.status", direction: "asc" }],
      group: { field: "metadata.example.status" },
      viewType: "example.view",
    } satisfies PluginSaveFilterInput;
    const filterUpdate = {
      query: {
        where: [{ field: "metadata.example.status", op: "eq", value: null }],
      },
      sort: null,
      group: null,
      viewType: "example.timeline",
    } satisfies PluginUpdateFilterInput;
    const filterListOptions = {
      viewType: "example.view",
    } satisfies PluginListFiltersOptions;

    expect(metadataInput.key).toBe("status");
    expect(metadataListOptions.namespace).toBe("example");
    expect(eventInput.payload).toEqual({ from: "shortcut" });
    expect(eventListOptions.pageId).toBe("page-1");
    expect(filterInput.id).toBe("filter-open-examples");
    expect(filterInput.query.where[0]?.value).toBe("open");
    expect(filterUpdate.sort).toBeNull();
    expect(filterListOptions.viewType).toBe("example.view");

    expectNoTypeLeak<PluginPublicStoreShapeLeak>();
    expectTypeOf<
      Pick<PluginSetMetadataInput, keyof ExpectedPluginSetMetadataInput>
    >().toEqualTypeOf<ExpectedPluginSetMetadataInput>();
    expectTypeOf<
      Pick<PluginListMetadataOptions, keyof ExpectedPluginListMetadataOptions>
    >().toEqualTypeOf<ExpectedPluginListMetadataOptions>();
    expectTypeOf<
      Pick<PluginAppendEventInput, keyof ExpectedPluginAppendEventInput>
    >().toEqualTypeOf<ExpectedPluginAppendEventInput>();
    expectTypeOf<
      Pick<PluginListEventsOptions, keyof ExpectedPluginListEventsOptions>
    >().toEqualTypeOf<ExpectedPluginListEventsOptions>();
    expectTypeOf<
      Pick<PluginSaveFilterInput, keyof ExpectedPluginSaveFilterInput>
    >().toEqualTypeOf<ExpectedPluginSaveFilterInput>();
    expectTypeOf<
      Pick<PluginUpdateFilterInput, keyof ExpectedPluginUpdateFilterInput>
    >().toEqualTypeOf<ExpectedPluginUpdateFilterInput>();
    expectTypeOf<
      Pick<PluginListFiltersOptions, keyof ExpectedPluginListFiltersOptions>
    >().toEqualTypeOf<ExpectedPluginListFiltersOptions>();
  });

  it.each(["task.filter.today", "task.filter.custom"] as const)(
    "prevents plugin-facing fixed filter id %s from claiming another plugin namespace",
    async (fixedFilterId) => {
      const { runtime, host } = createPluginApiTestHost();

      await expect(
        host.loadBuiltInPlugins([
          filterSavingPlugin("review", fixedFilterId),
        ]),
      ).rejects.toMatchObject({
        name: "PluginHostError",
        code: "PLUGIN_LIFECYCLE_FAILED",
        pluginId: "review",
        phase: "register",
        cause: expect.objectContaining({
          name: "PluginHostError",
          code: "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
          pluginId: "review",
        }),
      });
      expect(runtime.services.filters.list()).toStrictEqual([]);
    },
  );

  it("prevents accessor-backed plugin-facing fixed filter ids from claiming another plugin namespace", async () => {
    const { runtime, host } = createPluginApiTestHost();

    await expect(
      host.loadBuiltInPlugins([
        accessorBackedFilterSavingPlugin("review", "task.filter.today"),
      ]),
    ).rejects.toMatchObject({
      name: "PluginHostError",
      code: "PLUGIN_LIFECYCLE_FAILED",
      pluginId: "review",
      phase: "register",
      cause: expect.objectContaining({
        name: "PluginHostError",
        code: "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
        pluginId: "review",
      }),
    });
    expect(runtime.services.filters.list()).toStrictEqual([]);
    expect(() => runtime.services.filters.get("task.filter.today")).toThrow();
  });

  it("allows plugin-facing fixed filter ids inside the current plugin namespace", async () => {
    const { runtime, host } = createPluginApiTestHost();
    const records = await host.loadBuiltInPlugins([
      filterSavingPlugin("task", "task.filter.custom"),
    ]);

    expect(records).toStrictEqual([
      expect.objectContaining({
        id: "task",
        enabled: false,
        status: "registered",
      }),
    ]);
    expect(runtime.services.filters.get("task.filter.custom")).toMatchObject({
      id: "task.filter.custom",
      name: "task fixed filter",
      sourcePluginId: "task",
    });
  });

  it("reserves built-in task and tag metadata identities for their owning plugins", async () => {
    await expectBuiltInMetadataWriteRejected({
      pluginId: "review",
      namespace: "task",
      key: "enabled",
      value: true,
      valueType: "boolean",
    });
    await expectBuiltInMetadataWriteRejected({
      pluginId: "review",
      namespace: "tag",
      key: "tags",
      value: ["product"],
      valueType: "json",
    });

    const { runtime, host } = createPluginApiTestHost();

    await expect(
      host.loadBuiltInPlugins([
        metadataSavingPlugin({
          pluginId: "task",
          namespace: "task",
          key: "enabled",
          value: true,
          valueType: "boolean",
        }),
        metadataSavingPlugin({
          pluginId: "tag",
          namespace: "tag",
          key: "tags",
          value: ["product"],
          valueType: "json",
        }),
        metadataSavingPlugin({
          pluginId: "review",
          namespace: "quality",
          key: "status",
          value: "open",
          valueType: "string",
        }),
      ]),
    ).resolves.toHaveLength(3);
    expect(runtime.services.metadata.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "task",
          key: "enabled",
          value: true,
          sourcePluginId: "task",
        }),
        expect.objectContaining({
          namespace: "tag",
          key: "tags",
          value: ["product"],
          sourcePluginId: "tag",
        }),
        expect.objectContaining({
          namespace: "quality",
          key: "status",
          value: "open",
          sourcePluginId: "review",
        }),
      ]),
    );
  });

  it("rejects explicit undefined plugin ids from plugin registry inputs", () => {
    const component = () => null;
    const commandDefinitionWithUndefinedPluginId = {
      id: "example.command.undefined-owner-variable",
      pluginId: undefined,
      title: "Undefined Owner",
      handler() {},
    };
    const viewDefinitionWithUndefinedPluginId = {
      id: "example.view.undefined-owner-variable",
      pluginId: undefined,
      type: "example.view",
      title: "Undefined Owner",
      accepts: null,
      component,
    };
    const slotDefinitionWithUndefinedPluginId = {
      id: "example.slot.undefined-owner-variable",
      pluginId: undefined,
      slot: "example.workspace.panel",
      component,
    };
    const commandListOptionsWithUndefinedPluginId = {
      pluginId: undefined,
    };
    const viewListOptionsWithUndefinedPluginId = {
      type: "example.view",
      pluginId: undefined,
    };
    const slotListOptionsWithUndefinedPluginId = {
      slot: "example.workspace.panel",
      pluginId: undefined,
    };

    expectNoTypeLeak<CallerSuppliedRegistryPluginIdUndefinedAssignableLeak>();

    // @ts-expect-error the Plugin Host supplies command plugin ownership
    void ({ id: "example.command.undefined-owner", pluginId: undefined, title: "Undefined Owner", handler() {} } satisfies PluginCommandDefinition);
    // @ts-expect-error the Plugin Host supplies view plugin ownership
    void ({ id: "example.view.undefined-owner", pluginId: undefined, type: "example.view", title: "Undefined Owner", accepts: null, component } satisfies PluginViewDefinition);
    // @ts-expect-error the Plugin Host supplies slot plugin ownership
    void ({ id: "example.slot.undefined-owner", pluginId: undefined, slot: "example.workspace.panel", component } satisfies PluginSlotDefinition);
    // @ts-expect-error the Plugin Host scopes command list ownership
    void ({ pluginId: undefined } satisfies PluginCommandListOptions);
    // @ts-expect-error the Plugin Host scopes view list ownership
    void ({ type: "example.view", pluginId: undefined } satisfies PluginViewListOptions);
    // @ts-expect-error the Plugin Host scopes slot list ownership
    void ({ slot: "example.workspace.panel", pluginId: undefined } satisfies PluginSlotListOptions);

    // @ts-expect-error the Plugin Host supplies command plugin ownership
    const rejectedCommandDefinition: PluginCommandDefinition =
      commandDefinitionWithUndefinedPluginId;
    // @ts-expect-error the Plugin Host supplies view plugin ownership
    const rejectedViewDefinition: PluginViewDefinition =
      viewDefinitionWithUndefinedPluginId;
    // @ts-expect-error the Plugin Host supplies slot plugin ownership
    const rejectedSlotDefinition: PluginSlotDefinition =
      slotDefinitionWithUndefinedPluginId;
    // @ts-expect-error the Plugin Host scopes command list ownership
    const rejectedCommandListOptions: PluginCommandListOptions =
      commandListOptionsWithUndefinedPluginId;
    // @ts-expect-error the Plugin Host scopes view list ownership
    const rejectedViewListOptions: PluginViewListOptions =
      viewListOptionsWithUndefinedPluginId;
    // @ts-expect-error the Plugin Host scopes slot list ownership
    const rejectedSlotListOptions: PluginSlotListOptions =
      slotListOptionsWithUndefinedPluginId;

    void rejectedCommandDefinition;
    void rejectedViewDefinition;
    void rejectedSlotDefinition;
    void rejectedCommandListOptions;
    void rejectedViewListOptions;
    void rejectedSlotListOptions;
  });

  it("rejects caller-supplied source plugin ids from plugin store variables", () => {
    expectNoTypeLeak<CallerSuppliedSourcePluginIdTemplateKeyLeak>();
    expectNoTypeLeak<CallerSourcePluginIdMetadataSetLeak>();
    expectNoTypeLeak<CallerSourcePluginIdMetadataListLeak>();
    expectNoTypeLeak<CallerSourcePluginIdEventAppendLeak>();
    expectNoTypeLeak<CallerSourcePluginIdEventListLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterSaveLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterUpdateLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterListLeak>();
  });

  it("rejects explicit undefined source plugin ids from plugin store inputs", () => {
    const metadataSetWithUndefinedSourcePluginId = {
      pageId: "page-1",
      namespace: "example",
      key: "status",
      value: null,
      valueType: "null" as const,
      sourcePluginId: undefined,
    };
    const metadataListWithUndefinedSourcePluginId = {
      pageId: "page-1",
      sourcePluginId: undefined,
    };
    const eventAppendWithUndefinedSourcePluginId = {
      pageId: "page-1",
      namespace: "example",
      type: "opened",
      payload: null,
      sourcePluginId: undefined,
    };
    const eventListWithUndefinedSourcePluginId = {
      namespace: "example",
      sourcePluginId: undefined,
    };
    const filterSaveWithUndefinedSourcePluginId = {
      name: "Examples",
      query: { where: [] },
      viewType: "example.view",
      sourcePluginId: undefined,
    };
    const filterUpdateWithUndefinedSourcePluginId = {
      viewType: "example.view",
      sourcePluginId: undefined,
    };
    const filterListWithUndefinedSourcePluginId = {
      viewType: "example.view",
      sourcePluginId: undefined,
    };

    expectNoTypeLeak<CallerSuppliedSourcePluginIdUndefinedAssignableLeak>();

    // @ts-expect-error the Plugin Host supplies metadata source ownership
    void ({ pageId: "page-1", namespace: "example", key: "status", value: null, valueType: "null", sourcePluginId: undefined } satisfies PluginMetadataSetInput);
    // @ts-expect-error the Plugin Host scopes metadata list source ownership
    void ({ pageId: "page-1", sourcePluginId: undefined } satisfies PluginMetadataListOptions);
    // @ts-expect-error the Plugin Host supplies event source ownership
    void ({ pageId: "page-1", namespace: "example", type: "opened", payload: null, sourcePluginId: undefined } satisfies PluginEventAppendInput);
    // @ts-expect-error the Plugin Host scopes event list source ownership
    void ({ namespace: "example", sourcePluginId: undefined } satisfies PluginEventListOptions);
    // @ts-expect-error the Plugin Host supplies filter source ownership
    void ({ name: "Examples", query: { where: [] }, viewType: "example.view", sourcePluginId: undefined } satisfies PluginFilterSaveInput);
    // @ts-expect-error the Plugin Host supplies filter source ownership
    void ({ viewType: "example.view", sourcePluginId: undefined } satisfies PluginFilterUpdateInput);
    // @ts-expect-error the Plugin Host scopes filter list source ownership
    void ({ viewType: "example.view", sourcePluginId: undefined } satisfies PluginFilterListOptions);

    // @ts-expect-error the Plugin Host supplies metadata source ownership
    const rejectedMetadataSetInput: PluginMetadataSetInput =
      metadataSetWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host scopes metadata list source ownership
    const rejectedMetadataListOptions: PluginMetadataListOptions =
      metadataListWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host supplies event source ownership
    const rejectedEventAppendInput: PluginEventAppendInput =
      eventAppendWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host scopes event list source ownership
    const rejectedEventListOptions: PluginEventListOptions =
      eventListWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host supplies filter source ownership
    const rejectedFilterSaveInput: PluginFilterSaveInput =
      filterSaveWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host supplies filter source ownership
    const rejectedFilterUpdateInput: PluginFilterUpdateInput =
      filterUpdateWithUndefinedSourcePluginId;
    // @ts-expect-error the Plugin Host scopes filter list source ownership
    const rejectedFilterListOptions: PluginFilterListOptions =
      filterListWithUndefinedSourcePluginId;

    void rejectedMetadataSetInput;
    void rejectedMetadataListOptions;
    void rejectedEventAppendInput;
    void rejectedEventListOptions;
    void rejectedFilterSaveInput;
    void rejectedFilterUpdateInput;
    void rejectedFilterListOptions;
  });

  it("keeps PluginContext scoped to plugin-facing facades and away from raw runtime handles", () => {
    expectTypeOf<PluginContext["pluginId"]>().toEqualTypeOf<string>();
    expectTypeOf<PluginContext["app"]>().toEqualTypeOf<AppRuntimeInfo>();
    expectTypeOf<PluginContext["pages"]>().toEqualTypeOf<PluginPageStore>();
    expectTypeOf<PluginContext["metadata"]>().toEqualTypeOf<
      PluginMetadataStore
    >();
    expectTypeOf<PluginContext["events"]>().toEqualTypeOf<PluginEventStore>();
    expectTypeOf<PluginContext["filters"]>().toEqualTypeOf<PluginFilterStore>();
    expectTypeOf<PluginContext["commands"]>().toEqualTypeOf<
      PluginCommandRegistry
    >();
    expectTypeOf<PluginContext["views"]>().toEqualTypeOf<PluginViewRegistry>();
    expectTypeOf<PluginContext["slots"]>().toEqualTypeOf<PluginSlotRegistry>();
    expectTypeOf<PluginContext["transaction"]>().toEqualTypeOf<
      PluginTransactionManager
    >();
  });

  it("keeps plugin-facing boundaries scoped, inert, and caller-bound", () => {
    expectNoTypeLeak<PluginApiBoundaryLeak>();
  });
});

function createPluginApiTestHost() {
  const runtime = createInMemoryAppRuntime();
  const host = new PluginHost({
    services: runtime.services,
    registries: runtime.registries,
    app: {
      version: "test",
      pluginApiVersion: "test",
    },
  });

  return { runtime, host };
}

function filterSavingPlugin(
  pluginId: string,
  fixedFilterId: string,
): AppPlugin {
  return {
    manifest: {
      id: pluginId,
      name: `${pluginId} Plugin`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
    },
    register(ctx) {
      ctx.filters.save({
        id: fixedFilterId,
        name: `${pluginId} fixed filter`,
        query: { where: [] },
        viewType: `${pluginId}.list`,
      });
    },
  };
}

function accessorBackedFilterSavingPlugin(
  pluginId: string,
  fixedFilterId: string,
): AppPlugin {
  return {
    manifest: {
      id: pluginId,
      name: `${pluginId} Plugin`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
    },
    register(ctx) {
      const filterInput = {
        get id() {
          return fixedFilterId;
        },
        name: `${pluginId} accessor filter`,
        query: { where: [] },
        viewType: `${pluginId}.list`,
      } satisfies PluginSaveFilterInput;

      ctx.filters.save(filterInput);
    },
  };
}

type MetadataSavingPluginInput = {
  pluginId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
  pageId?: string;
};

function metadataSavingPlugin(
  input: MetadataSavingPluginInput,
): AppPlugin {
  return {
    manifest: {
      id: input.pluginId,
      name: `${input.pluginId} Plugin`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
    },
    register(ctx) {
      ctx.metadata.set({
        pageId: input.pageId ?? "page-plugin-api-boundary",
        namespace: input.namespace,
        key: input.key,
        value: input.value,
        valueType: input.valueType,
      });
    },
  };
}

function metadataFieldDeclaringPlugin(
  input: Pick<
    MetadataSavingPluginInput,
    "pluginId" | "namespace" | "key" | "valueType"
  >,
): AppPlugin {
  return {
    manifest: {
      id: input.pluginId,
      name: `${input.pluginId} Plugin`,
      version: "1.0.0",
      minAppVersion: "0.1.0",
      contributes: {
        metadataFields: [
          {
            id: `${input.namespace}.${input.key}`,
            namespace: input.namespace,
            key: input.key,
            valueType: input.valueType,
          },
        ],
      },
    },
    register() {},
  };
}

async function expectBuiltInMetadataWriteRejected(
  input: MetadataSavingPluginInput,
): Promise<void> {
  const { runtime, host } = createPluginApiTestHost();

  await expect(
    host.loadBuiltInPlugins([
      metadataFieldDeclaringPlugin({
        pluginId: input.namespace,
        namespace: input.namespace,
        key: input.key,
        valueType: input.valueType,
      }),
      metadataSavingPlugin(input),
    ]),
  ).rejects.toMatchObject({
    name: "PluginHostError",
    code: "PLUGIN_LIFECYCLE_FAILED",
    pluginId: input.pluginId,
    phase: "register",
    cause: expect.objectContaining({
      name: "PluginHostError",
      code: "PLUGIN_FACADE_OWNERSHIP_FORBIDDEN",
      pluginId: input.pluginId,
    }),
  });
  expect(runtime.services.metadata.list()).toStrictEqual([]);
}

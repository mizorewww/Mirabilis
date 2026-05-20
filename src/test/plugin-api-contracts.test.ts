import { describe, expect, expectTypeOf, it } from "vitest";

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
  PluginCommandListOptions,
  PluginContext,
  PluginContributions,
  PluginCommandDefinition,
  PluginDependency,
  PluginDependencyReference,
  PluginEventStore,
  PluginFilterCondition,
  PluginFilterQuery,
  PluginFilterStore,
  PluginInstallContext,
  PluginLifecycleResult,
  PluginManifest,
  PluginMetadataStore,
  PluginPageStore,
  PluginPermission,
  PluginSlotDescriptor,
  PluginSlotContribution,
  PluginSlotDefinition,
  PluginSlotListOptions,
  PluginSlotRegistry,
  PluginTransaction,
  PluginTransactionHandler,
  PluginTransactionManager,
  PluginUninstallContext,
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
  FilterStore,
  IndexerContribution as IndexerContributionFromCore,
  MarkdownSyntaxContribution as MarkdownSyntaxContributionFromCore,
  MetadataFieldContribution as MetadataFieldContributionFromCore,
  MetadataStore,
  MobileToolbarContribution as MobileToolbarContributionFromCore,
  PluginCommandDescriptor as PluginCommandDescriptorFromCore,
  PluginCommandRegistry as PluginCommandRegistryFromCore,
  PluginCommandListOptions as PluginCommandListOptionsFromCore,
  PluginCommandDefinition as PluginCommandDefinitionFromCore,
  PluginContext as PluginContextFromCore,
  PluginContributions as PluginContributionsFromCore,
  PluginDependency as PluginDependencyFromCore,
  PluginDependencyReference as PluginDependencyReferenceFromCore,
  PluginInstallContext as PluginInstallContextFromCore,
  PluginLifecycleResult as PluginLifecycleResultFromCore,
  PluginManifest as PluginManifestFromCore,
  MetadataJsonValue,
  MetadataValueType,
  PluginPermission as PluginPermissionFromCore,
  PluginFilterCondition as PluginFilterConditionFromCore,
  PluginFilterQuery as PluginFilterQueryFromCore,
  PluginSlotDescriptor as PluginSlotDescriptorFromCore,
  PluginSlotContribution as PluginSlotContributionFromCore,
  PluginSlotDefinition as PluginSlotDefinitionFromCore,
  PluginSlotListOptions as PluginSlotListOptionsFromCore,
  PluginSlotRegistry as PluginSlotRegistryFromCore,
  PluginTransaction as PluginTransactionFromCore,
  PluginTransactionHandler as PluginTransactionHandlerFromCore,
  PluginTransactionManager as PluginTransactionManagerFromCore,
  PluginUninstallContext as PluginUninstallContextFromCore,
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
type AssignableLeak<Candidate, Surface, Label extends string> =
  Candidate extends Surface ? Label : never;
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
type PluginEventAppendInput = Parameters<PluginContext["events"]["append"]>[0];
type PluginFilterSaveInput = Parameters<PluginContext["filters"]["save"]>[0];
type PluginFilterUpdateInput = Parameters<
  PluginContext["filters"]["update"]
>[1];
type PluginFilterListOptions = NonNullable<
  Parameters<PluginContext["filters"]["list"]>[0]
>;
type CallerSuppliedSourcePluginIdKey =
  | Extract<keyof PluginMetadataSetInput, "sourcePluginId">
  | Extract<keyof PluginEventAppendInput, "sourcePluginId">
  | Extract<keyof PluginFilterSaveInput, "sourcePluginId">
  | Extract<keyof PluginFilterUpdateInput, "sourcePluginId">
  | Extract<keyof PluginFilterListOptions, "sourcePluginId">;
type CallerSourcePluginIdMetadataSetVariable = {
  pageId: string;
  namespace: string;
  key: string;
  value: MetadataJsonValue;
  valueType: MetadataValueType;
  sourcePluginId: string;
};
type CallerSourcePluginIdEventAppendVariable = {
  pageId: string;
  namespace: string;
  type: string;
  payload: MetadataJsonValue;
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
type CallerSourcePluginIdEventAppendLeak = AssignableLeak<
  CallerSourcePluginIdEventAppendVariable,
  PluginEventAppendInput,
  "events.append.sourcePluginId.variable"
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
  | CallerSourcePluginIdEventAppendLeak
  | CallerSourcePluginIdFilterSaveLeak
  | CallerSourcePluginIdFilterUpdateLeak
  | CallerSourcePluginIdFilterListLeak;
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
  | KeyLeak<
      PluginCommandRegisterInput,
      "pluginId",
      "commands.register.pluginId"
    >
  | KeyLeak<PluginViewRegisterInput, "pluginId", "views.register.pluginId">
  | KeyLeak<PluginSlotRegisterInput, "pluginId", "slots.register.pluginId">
  | KeyLeak<
      PluginCommandRegistryListOptions,
      "pluginId",
      "commands.list.pluginId"
    >
  | KeyLeak<PluginViewRegistryListOptions, "pluginId", "views.list.pluginId">
  | KeyLeak<PluginSlotRegistryListOptions, "pluginId", "slots.list.pluginId">;
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
    expectTypeOf<PluginCommandRegistryFromCore>().toEqualTypeOf<
      PluginCommandRegistry
    >();
    expectTypeOf<PluginCommandDescriptorFromCore>().toEqualTypeOf<
      PluginCommandDescriptor
    >();
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
    expectNoTypeLeak<CallerPluginIdCommandDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdViewDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdSlotDefinitionLeak>();
    expectNoTypeLeak<CallerPluginIdCommandListLeak>();
    expectNoTypeLeak<CallerPluginIdViewListLeak>();
    expectNoTypeLeak<CallerPluginIdSlotListLeak>();
  });

  it("rejects caller-supplied source plugin ids from plugin store variables", () => {
    expectNoTypeLeak<CallerSourcePluginIdMetadataSetLeak>();
    expectNoTypeLeak<CallerSourcePluginIdEventAppendLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterSaveLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterUpdateLeak>();
    expectNoTypeLeak<CallerSourcePluginIdFilterListLeak>();
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

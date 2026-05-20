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
  PluginCommandRegistry,
  PluginContext,
  PluginContributions,
  PluginDependency,
  PluginInstallContext,
  PluginManifest,
  PluginPermission,
  PluginSlotContribution,
  PluginSlotRegistry,
  PluginTransactionManager,
  PluginUninstallContext,
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
  PluginCommandRegistry as PluginCommandRegistryFromCore,
  PluginContext as PluginContextFromCore,
  PluginContributions as PluginContributionsFromCore,
  PluginDependency as PluginDependencyFromCore,
  PluginInstallContext as PluginInstallContextFromCore,
  PluginManifest as PluginManifestFromCore,
  PluginPermission as PluginPermissionFromCore,
  PluginSlotContribution as PluginSlotContributionFromCore,
  PluginSlotRegistry as PluginSlotRegistryFromCore,
  PluginTransactionManager as PluginTransactionManagerFromCore,
  PluginUninstallContext as PluginUninstallContextFromCore,
  PluginViewRegistry as PluginViewRegistryFromCore,
  PageStore,
  SettingsPanelContribution as SettingsPanelContributionFromCore,
  SlotRegistry,
  TransactionManager,
  ViewContribution as ViewContributionFromCore,
  ViewRegistry,
} from "../core";

type LifecycleResult = void | Promise<void>;
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
  | CallerSuppliedSourcePluginIdKey;

describe("Plugin API contracts", () => {
  it("provides a public plugin-api module and re-exports contracts from Core", () => {
    expect(pluginApiEntrypoint).toEqual(expect.any(Object));

    expectTypeOf<PluginManifestFromCore>().toEqualTypeOf<PluginManifest>();
    expectTypeOf<PluginDependencyFromCore>().toEqualTypeOf<PluginDependency>();
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
    expectTypeOf<PluginViewRegistryFromCore>().toEqualTypeOf<
      PluginViewRegistry
    >();
    expectTypeOf<PluginSlotRegistryFromCore>().toEqualTypeOf<
      PluginSlotRegistry
    >();
    expectTypeOf<PluginTransactionManagerFromCore>().toEqualTypeOf<
      PluginTransactionManager
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

    expectTypeOf<PluginDependency>().toMatchObjectType<{ id: string }>();
    expectTypeOf<PluginPermission>().toMatchObjectType<{ id: string }>();
    expectTypeOf<readonly string[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<readonly PluginDependency[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<readonly (string | PluginDependency)[]>().toExtend<
      NonNullable<PluginManifest["dependencies"]>
    >();
    expectTypeOf<PluginManifest>().toMatchObjectType<{
      id: string;
      name: string;
      version: string;
      description?: string;
      author?: string;
      minAppVersion: string;
      main?: string;
      dependencies?: readonly (string | PluginDependency)[];
      optionalDependencies?: readonly (string | PluginDependency)[];
      permissions?: readonly PluginPermission[];
      contributes?: PluginContributions;
    }>();

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

    expectTypeOf<PluginContributions>().toMatchObjectType<{
      markdownSyntax?: readonly MarkdownSyntaxContribution[];
      metadataFields?: readonly MetadataFieldContribution[];
      eventTypes?: readonly EventTypeContribution[];
      commands?: readonly CommandContribution[];
      filters?: readonly FilterContribution[];
      views?: readonly ViewContribution[];
      slots?: readonly PluginSlotContribution[];
      indexers?: readonly IndexerContribution[];
      algorithms?: readonly AlgorithmContribution[];
      mobileToolbarItems?: readonly MobileToolbarContribution[];
      settingsPanels?: readonly SettingsPanelContribution[];
    }>();

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
    expectTypeOf<AppPlugin>().toMatchObjectType<{
      manifest: PluginManifest;
      register(ctx: PluginContext): LifecycleResult;
      install?: (ctx: PluginInstallContext) => LifecycleResult;
      activate?: (ctx: PluginContext) => LifecycleResult;
      deactivate?: (ctx: PluginContext) => LifecycleResult;
      uninstall?: (ctx: PluginUninstallContext) => LifecycleResult;
    }>();
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

  it("keeps PluginContext scoped to plugin-facing facades and away from raw runtime handles", () => {
    expectTypeOf<PluginContext>().toMatchObjectType<{
      app: AppRuntimeInfo;
      pages: unknown;
      metadata: unknown;
      events: unknown;
      filters: unknown;
      commands: PluginCommandRegistry;
      views: PluginViewRegistry;
      slots: PluginSlotRegistry;
      transaction: PluginTransactionManager;
    }>();
  });

  it("keeps plugin-facing boundaries scoped, inert, and caller-bound", () => {
    expectTypeOf<PluginApiBoundaryLeak>().toEqualTypeOf<never>();
  });
});

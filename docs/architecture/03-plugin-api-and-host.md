# Plugin API 与 Plugin Host

定义当前 `src/core/plugin-api` 的过渡期契约、插件上下文，以及 Plugin Host 的加载与生命周期职责。后续如果拆成独立包，目标位置是 `packages/plugin-api`。

## 5. Plugin API 设计

`src/core/plugin-api` 是当前插件和 Core 之间的契约。`packages/plugin-api` 是后续 monorepo/package 拆分目标，不是 TASK-010 当前实现位置。

### 5.1 PluginManifest

```ts
export type PluginDependency = {
  id: string;
  version?: string;
  optional?: boolean;
};

export type PluginDependencyReference = string | PluginDependency;

export type PluginPermission = {
  id: string;
  scope?: string;
  action?: string;
  description?: string;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  minAppVersion: string;
  main?: string;
  dependencies?: readonly PluginDependencyReference[];
  optionalDependencies?: readonly PluginDependencyReference[];
  permissions?: readonly PluginPermission[];
  contributes?: PluginContributions;
};
```

### 5.2 PluginContributions

```ts
export type PluginContributions = {
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
};
```

这些 buckets 是 TASK-010 当前的 manifest contribution descriptor。
它们声明插件贡献的形状和身份，但不是同名 runtime facade：当前 `PluginContext` 没有用于 metadata field、event type、algorithm、indexer、mobile toolbar item 或 settings panel 的 runtime registration facade。
这些运行时 facade 属于后续 Plugin Host / Plugin Platform 工作。

---

### 5.3 AppPlugin

```ts
export type PluginLifecycleResult = void | Promise<void>;

export type AppPlugin = {
  manifest: PluginManifest;
  install?(ctx: PluginInstallContext): PluginLifecycleResult;
  activate?(ctx: PluginContext): PluginLifecycleResult;
  register(ctx: PluginContext): PluginLifecycleResult;
  deactivate?(ctx: PluginContext): PluginLifecycleResult;
  uninstall?(ctx: PluginUninstallContext): PluginLifecycleResult;
};
```

生命周期借鉴 Obsidian 的 `onload()` / `onunload()` 思路，但改成更适合本系统的 install / activate / register / deactivate / uninstall。Obsidian 官方文档中插件加载时运行 `onload()`，卸载时运行 `onunload()`，并能注册命令、编辑器扩展等能力。([Developer Documentation](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin "Build a plugin - Developer Documentation"))

---

### 5.4 PluginContext

```ts
export type PluginCommandRegistry = {
  register<Input = unknown, Output = unknown>(
    definition: PluginCommandDefinition<Input, Output>,
  ): PluginCommandDescriptor;
  get(commandId: string): PluginCommandDescriptor;
  list(options?: PluginCommandListOptions): readonly PluginCommandDescriptor[];
};

export type PluginViewRegistry = {
  register<Props = unknown>(
    definition: PluginViewDefinition<Props>,
  ): PluginViewDescriptor;
  get(viewId: string): PluginViewDescriptor;
  list(options?: PluginViewListOptions): readonly PluginViewDescriptor[];
};

export type PluginSlotRegistry = {
  register<Props = unknown>(
    contribution: PluginSlotDefinition<Props>,
  ): PluginSlotDescriptor;
  get(contributionId: string): PluginSlotDescriptor;
  list(options?: PluginSlotListOptions): readonly PluginSlotDescriptor[];
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
```

插件不直接操作全局数据库。
插件通过 `ctx.pages`、`ctx.metadata`、`ctx.events`、`ctx.filters`、`ctx.transaction` 操作 Core 数据。
插件通过 `PluginCommandRegistry`、`PluginViewRegistry`、`PluginSlotRegistry` 这类 plugin-facing facade 注册能力，并拿到 descriptor；不直接暴露 Core 内部的 `CommandRegistry`、`ViewRegistry`、`SlotRegistry`、`AlgorithmRegistry`。
`PluginCommandRegistry` 当前只有 `register`、`get` 和 `list`；命令执行属于 app runtime / Command Service，不在 TASK-010 `PluginContext` 中暴露。
Plugin-facing stores 和 registries 的输入不接受调用方传入的 `pluginId` 或 `sourcePluginId`，这些 ownership key 由 Plugin Host 按当前插件身份注入。
`settings`、`storage`、`query`、`eventBus` 和独立 `packages/plugin-api` 包拆分是后续接口面，不属于 TASK-010 当前 contract。

---

## 6. Plugin Host

Plugin Host 负责加载和运行插件。

```ts
export class PluginHost {
  constructor(
    private readonly registries: CoreRegistries,
    private readonly services: CoreServices
  ) {}

  async loadBuiltInPlugins(plugins: AppPlugin[]) {}

  async install(plugin: AppPlugin) {}

  async activate(pluginId: string) {}

  async deactivate(pluginId: string) {}

  async uninstall(pluginId: string) {}

  async register(plugin: AppPlugin) {}

  getPlugin(pluginId: string) {}
}
```

启动流程：

```text
1. 初始化 StorageDriver
2. 初始化 Core Stores
3. 初始化 Core Registries
4. 初始化 PluginHost
5. 加载内置插件 manifests
6. 处理插件依赖顺序
7. 执行 install（migration 后续加入）
8. 执行 register
9. 执行 activate
10. 收集编辑器扩展、命令、View、Slot
11. 渲染 App Shell
```

---

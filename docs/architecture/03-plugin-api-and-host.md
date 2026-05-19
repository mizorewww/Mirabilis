# Plugin API 与 Plugin Host

定义 `packages/plugin-api` 的契约、插件上下文，以及 Plugin Host 的加载与生命周期职责。

## 5. Plugin API 设计

`packages/plugin-api` 是插件和 Core 之间的契约。

### 5.1 PluginManifest

```ts
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  minAppVersion: string;
  dependencies?: string[];
  optionalDependencies?: string[];
  permissions?: PluginPermission[];
  contributes?: PluginContributions;
}
```

### 5.2 PluginContributions

```ts
export interface PluginContributions {
  markdownSyntax?: MarkdownSyntaxContribution[];
  metadataFields?: MetadataFieldContribution[];
  eventTypes?: EventTypeContribution[];
  commands?: CommandContribution[];
  filters?: FilterContribution[];
  views?: ViewContribution[];
  slots?: SlotContribution[];
  indexers?: IndexerContribution[];
  algorithms?: AlgorithmContribution[];
  mobileToolbarItems?: MobileToolbarContribution[];
  settingsPanels?: SettingsPanelContribution[];
}
```

---

### 5.3 AppPlugin

```ts
export interface AppPlugin {
  manifest: PluginManifest;

  install?(ctx: PluginInstallContext): Promise<void>;
  activate?(ctx: PluginContext): Promise<void>;
  register(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): Promise<void>;
  uninstall?(ctx: PluginUninstallContext): Promise<void>;
}
```

生命周期借鉴 Obsidian 的 `onload()` / `onunload()` 思路，但改成更适合本系统的 install / activate / register / deactivate / uninstall。Obsidian 官方文档中插件加载时运行 `onload()`，卸载时运行 `onunload()`，并能注册命令、编辑器扩展等能力。([Developer Documentation](https://docs.obsidian.md/Plugins/Getting%2Bstarted/Anatomy%2Bof%2Ba%2Bplugin "Anatomy of a plugin - Developer Documentation"))

---

### 5.4 PluginContext

```ts
export interface PluginContext {
  app: AppRuntimeInfo;

  pages: PageService;
  metadata: MetadataService;
  events: EventService;
  filters: FilterService;

  commands: CommandRegistry;
  views: ViewRegistry;
  slots: SlotRegistry;
  algorithms: AlgorithmRegistry;

  markdown: MarkdownExtensionRegistry;
  metadataFields: MetadataFieldRegistry;
  eventTypes: EventTypeRegistry;

  settings: PluginSettingsService;
  storage: PluginStorageService;

  query: QueryBus;
  eventBus: EventBus;
  transaction: TransactionManager;
}
```

插件不直接操作全局数据库。
插件通过 `ctx.pages`、`ctx.metadata`、`ctx.events`、`ctx.filters`、`ctx.transaction` 操作 Core 数据。

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
7. 执行 install / migration
8. 执行 register
9. 执行 activate
10. 收集编辑器扩展、命令、View、Slot
11. 渲染 App Shell
```

---

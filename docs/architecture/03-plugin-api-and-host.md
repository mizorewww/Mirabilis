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

TASK-022 后，`metadataFields` 还被 Plugin Host 用来派生 metadata owner reservations。这个派生只接受 complete valid descriptor：`namespace === manifest.id`、`namespace` / `key` 都是 metadata-safe segment、`valueType` 是有效 metadata value type。malformed、non-array 或 incomplete descriptors 不 reserve namespace。该 reservation 只建立 ownership/trust boundary，不代表 renderer/editor runtime 已实现。

TASK-016 增加了一个很窄的 Markdown runtime facade：`runtime.markdown.collectEditorExtensions()` 会从 active plugin manifest 的 `contributes.markdownSyntax` 收集 inert descriptor。它不会执行插件代码，也不是 Tiptap / ProseMirror extension 注册表；返回项的 `pluginId` 由 Plugin Host 的 manifest owner 注入，manifest contribution 自带的同名字段不能覆盖 host-owned identity。

TASK-021 后，`collectEditorExtensions()` 会同样收集内置 Tag Plugin 的 inert `tag.hashtag` descriptor（syntax `#tag`）。该 descriptor 只说明可见 Markdown syntax；它不代表 rich inline token、autocomplete、save-time scan 或 background indexer 已经存在。

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
export type PluginCommandHandler<Input = unknown, Output = unknown> = (
  input: Input,
  context: PluginContext,
) => Output | Promise<Output>;

export type PluginCommandDefinition<Input = unknown, Output = unknown> = {
  id: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: MetadataJsonValue;
  handler: PluginCommandHandler<Input, Output>;
};

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
`PluginCommandRegistry` 当前只有 `register`、`get` 和 `list`；`ctx.commands` 没有 `execute`。命令执行属于 app runtime / Command Service，由调用方通过 `runtime.commands.execute(commandId, input)` 进入 Command Registry。
Plugin-facing stores 和 registries 的输入不接受调用方传入的 `pluginId` 或 `sourcePluginId`，这些 ownership key 由 Plugin Host 按当前插件身份注入。
`settings`、`storage`、`query`、`eventBus` 和独立 `packages/plugin-api` 包拆分是后续接口面，不属于 TASK-010 当前 contract。

TASK-018 后，plugin command handler 的运行签名是 `PluginCommandHandler(input, context)`。`register(ctx)` 期间注册 command 时只交出 handler；真正执行 command 时，Plugin Host 会创建一个新的 command-time `PluginContext` 并传给 handler。因此 command handler 可以通过 fresh `context.pages`、`context.metadata`、`context.events`、`context.filters` 或 `context.transaction` 做数据写入，而不需要也不允许闭包复用 register-time `ctx` 做后续 mutation。

TASK-021 的 Tag Plugin command 使用同一 command-time context model：`tag.refresh-tags`、`tag.add-tag` 和 `tag.remove-tag` 通过 plugin-owned metadata facade 写 `tag.tags`；`tag.create-filter` 通过 plugin-owned filter facade 保存 filter definition。调用方不能在 payload 中提供 `pluginId`、`sourcePluginId`、query 或 view override。

TASK-022 的 Task Plugin registration 使用同一 plugin-facing model：Task Plugin 在 `register(ctx)` 中 upsert fixed filters `task.filter.all-tasks` 和 `task.filter.today`，注册 view `task.page-list` / `type: "page.list"`，并注册 `task.filter-empty-state` 到 `filter.empty_state`。Filter definitions 使用 plugin-owned `ctx.filters` 写入，view/slot ownership 由 Plugin Host 注入。

command-time `PluginContext` 仍是 plugin-scoped facade：不暴露 NativeBridge、Tauri/raw invoke、SQLite、filesystem、Core stores、Core registries、Core services 或 raw runtime handles。command-time context 允许数据 mutation，但不允许 runtime contribution registration；在 command handler 中调用 `context.commands.register`、`context.views.register` 或 `context.slots.register` 会抛出 typed Plugin Host lifecycle error。command handler 返回或抛错后，该 command-time context 会失效；任何捕获后继续使用的 stale command context 都不能再写入数据或注册贡献。

---

### 5.5 React Runtime Provider boundary

TASK-015 的 React `RuntimeProvider` 不是 Plugin API。它只给 React descendants 暴露 public `useRuntime()` facade：

```ts
type PublicRuntime = {
  readonly app: {
    readonly version: string;
    readonly pluginApiVersion?: string;
  };
};
```

Provider 从 full runtime 复制 app info，并发布 frozen `{ app: { version, pluginApiVersion? } }`。full `AppRuntime` handles 只属于 bootstrap 和 trusted App Shell composition，不属于 plugin-rendered UI 的公共入口。

`useRuntime()` / public provider value 必须继续禁止暴露：

- Core stores、registries、services。
- `pluginHost` 或 lifecycle/load/activate handles。
- `NativeBridge`、raw `invoke`、Tauri API 对象。
- `db`、SQLite、storage driver、filesystem、file、path、shortcut、notification APIs。
- Command registry mutation handles such as direct `register` / `unregister` / raw `execute`.

后续如果插件贡献 view、slot 或其他 plugin-rendered React subtree，这些 subtree 不能通过 `useRuntime()` 获取 full runtime。它们只能接收 `PluginContext`、plugin-scoped facades，或 App Shell 明确传入的 controlled props。

---

## 6. Plugin Host

Plugin Host 负责按生命周期加载和运行已提供的插件对象。
TASK-011 只处理显式传入的内置插件列表；不做文件系统发现、动态 import、native/Tauri 插件加载或插件状态持久化。

```ts
export type PluginHostStatus = "installed" | "registered" | "active";

export type PluginHostRecord = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  status: PluginHostStatus;
  manifest: PluginHostRecordManifest;
};

const pluginHost = new PluginHost({
  services,
  registries,
  app,
});

type PluginHostInstance = {
  loadBuiltInPlugins(
    plugins: readonly AppPlugin[],
  ): Promise<readonly PluginHostRecord[]>;

  install(plugin: AppPlugin): Promise<PluginHostRecord>;

  register(plugin: AppPlugin): Promise<PluginHostRecord>;

  activateAll(): Promise<readonly PluginHostRecord[]>;

  activate(pluginId: string): Promise<PluginHostRecord>;

  deactivate(pluginId: string): Promise<PluginHostRecord>;

  uninstall(pluginId: string): Promise<PluginHostRecord>;

  getPlugin(pluginId: string): PluginHostRecord;

  listPlugins(): readonly PluginHostRecord[];
};
```

启动流程：

```text
1. 初始化 StorageDriver
2. 初始化 Core Stores
3. 初始化 Core Registries
4. 初始化 PluginHost
5. 传入显式内置插件列表
6. 处理插件依赖顺序
7. 执行 install（migration 后续加入）
8. 执行 register
9. 执行 activateAll
10. 收集编辑器扩展、命令、View、Slot
11. 渲染 App Shell
```

生命周期语义：

- `loadBuiltInPlugins(plugins)` 按确定性依赖顺序安装并注册传入列表，但不激活插件；无依赖关系的插件保留输入顺序。批量安装每个插件前会重新检查同 ID live record；如果其他 lifecycle 调用已经安装或注册了同 ID 插件，当前批次会抛出 `PLUGIN_DUPLICATE_ID`，不会覆盖并发产生的记录或贡献追踪。
- `loadBuiltInPlugins(plugins)` 的批量 rollback 是 record-identity aware 的：只删除当前批次仍拥有的记录，回滚它们的 pending lifecycle scopes 和 tentative command/view/slot contributions；如果同 ID 的更新记录已经替换了旧记录，rollback 会保留更新记录及其已追踪贡献，避免留下 orphaned runtime contributions。批量 install 失败允许用同一显式列表重试。
- `install(plugin)` 只进入 `installed` 状态；显式 install 失败会移除 host 记录，后续 `register(plugin)` 会重新尝试 install；`register(plugin)` 会在必要时先 install，并进入 `registered` 状态；`activate(pluginId)` 只允许注册后的插件进入 `active` 状态。
- `register(plugin)` 对同 ID 并发调用是 single-flight/idempotent 的：一个 in-flight register hook 运行，其他并发调用共享同一个结果；成功后只追踪一组 runtime contributions，后续 `uninstall(pluginId)` 会清理这组贡献。
- required dependency 只有在 dependency 插件处于 `registered` 或 `active` 且未进入 `deactivate` / `uninstall` removal phase 时才被满足；`installed`、注册失败、安装失败、或正在移除的记录不满足后续 required dependency。
- `deactivate(pluginId)` 和 `uninstall(pluginId)` 不会让已注册、已激活或 pending-register dependent 失去 required dependency 后继续保持 incoherent 状态；当前实现会在 dependent 仍依赖目标插件时抛出 typed dependency error，并在调用被阻止插件的 lifecycle hook 前拒绝该操作。
- 生命周期 hook 失败会抛出带 `code`、`pluginId`、`phase`、`dependencyId` 或 `cause` 的 typed `PluginHostError`，并保留 safe state：activate/deactivate/uninstall 失败不会清掉仍有效的状态和贡献，register 失败会回滚该次 command/view/slot 注册。

运行时上下文语义：

- Plugin Host 为每次 lifecycle hook 创建 plugin-scoped `PluginContext`，只暴露 plugin-facing facades，不暴露 Core stores、registries、services、native/Tauri、SQLite、filesystem 或 raw runtime handles。
- Plugin Host 为每次 plugin command execution 创建 fresh command-time `PluginContext`，并调用 `PluginCommandHandler(input, context)`。command-time context 可以通过 plugin-facing stores 和 `transaction` 写入 Core 数据，但不能注册 command/view/slot 等 runtime contributions。
- `ctx.metadata`、`ctx.events`、`ctx.filters` 自动注入 `sourcePluginId`，并将读写限制在当前插件拥有的数据上。
- `ctx.commands`、`ctx.views`、`ctx.slots` 自动注入 `pluginId`，并将 `get` / `list` 限制在当前插件拥有的 runtime contribution 上。
- plugin-facing 输入拒绝调用方传入 `pluginId` 或 `sourcePluginId`；绕过 TypeScript 类型的 runtime spoofing 会抛出 `PLUGIN_FACADE_OWNERSHIP_FORBIDDEN` 且不应改变 registry 或 store。
- Metadata owner reservations 由 valid manifest `contributes.metadataFields` 派生。A plugin can reserve only its own namespace, because descriptor `namespace` must equal the declaring manifest id and must be a safe metadata segment. Built-in batch `loadBuiltInPlugins()` stages valid reservations before install/register writes run, including transaction-scoped writes, so same-batch plugins cannot claim another built-in plugin's reserved metadata namespace. Dotted plugin ids cannot reserve same-named metadata namespace under the current safe-segment rule.
- Low-level callers of `executeFilterQuery` must pass host-derived `metadataOwnerReservations` when they need built-in Task/Tag metadata trust enforcement. The executor itself stays business-agnostic and does not hard-code `task` or `tag`; no production app-shell filter route exists yet.
- 捕获到的 context 在 lifecycle 或 command execution 退出后不能继续注册 command、view 或 slot，也不能继续通过 `pages`、`metadata`、`events`、`filters` 或 `transaction` 写入 Core 数据；这些 stale context 写入会在 mutation 前抛出 typed `PLUGIN_LIFECYCLE_FAILED`。runtime contribution 注册只在尚未退出的 `register(ctx)` 调用期间有效。
- Plugin Host-marked command execution failures preserve their typed `PluginHostError` as `CommandRegistryError.cause`, so callers can inspect plugin id, phase `command`, and original plugin failure. Ordinary command handler failures remain redacted by Command Registry, including plain objects or directly constructed `PluginHostError` instances thrown outside the Plugin Host command wrapper.
- `listPlugins()` 返回按 host 安装顺序排序的 public `PluginHostRecord[]`，每条记录包含 cloned manifest metadata、`status` 和 `enabled`。Markdown runtime 用它读取 active plugin 的 manifest `contributes.markdownSyntax` descriptor；TASK-018 后这包括内置 `markdown` 和 `task` 插件贡献的 inert syntax descriptors。调用方不能通过返回值拿到 plugin instance、lifecycle scope、Core services、registries、NativeBridge、SQLite 或 filesystem handle。

---

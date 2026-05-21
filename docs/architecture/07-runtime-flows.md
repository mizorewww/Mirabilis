# 启动流程与代码路径

描述 AppRuntime 创建流程，以及用户输入任务、打开任务页、Start/Stop 计时时的代码调用链。

## 17. 启动流程

```ts
async function createAppRuntime() {
  const nativeBridge = await createTauriNativeBridge();

  const storage = {
    persistence: "in-memory-core"
  };

  const stores = await createCoreStores();

  const registries = await createCoreRegistries();

  const services = await createCoreServices({
    stores,
    registries
  });

  const app = {
    version: appVersion,
    pluginApiVersion
  };

  const pluginHost = new PluginHost({
    services,
    registries,
    app
  });

  const runtime = {
    app,
    markdown: createMarkdownRuntimeFacade(pluginHost, {
      pages: createMarkdownPageRuntimeFacade(nativeBridge)
    }),
    stores,
    registries,
    services,
    pluginHost,
    ...services
  };

  await pluginHost.loadBuiltInPlugins(BUILT_IN_PLUGINS);

  await pluginHost.activateAll();

  return runtime;
}
```

TASK-016 当前实现顺序是：`createTauriNativeBridge()` -> storage facade `{ persistence: "in-memory-core" }` -> `createCoreStores()` -> `createCoreRegistries()` -> `createCoreServices()` -> `PluginHost` -> runtime object with `runtime.markdown` -> `loadBuiltInPlugins(BUILT_IN_PLUGINS)` -> `activateAll()`。

`storage.persistence = "in-memory-core"` 是诚实的能力标记，不表示 Core stores 已经接入 SQLite persistence。TASK-016 没有做 broad Core store-to-SQLite rewiring。

`BUILT_IN_PLUGINS` 在 TASK-016 后只包含内置 `MarkdownEditorPlugin`。Quick capture、search、task、timer、calendar 等具体业务内置插件仍属于后续插件任务。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 接收的是 App 启动时显式传入的插件对象，不表示文件系统发现、动态 import 或 native 插件加载。

`runtime.markdown.collectEditorExtensions()` 从 `pluginHost.listPlugins()` 暴露的 public plugin metadata 收集 active plugin manifest 的 inert `contributes.markdownSyntax` descriptor。`runtime.markdown.pages` 是 narrow NativeBridge page facade，只发出 allowlisted `core.pages.get` / `core.pages.update` DTO，不接受 raw SQL、SQL params、filesystem path 或 file DTO。

任何 bootstrap 阶段失败都会 reject startup。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 或 `activateAll()` 失败时，`createAppRuntime()` 不返回 ready runtime；React `RuntimeProvider` 显示通用启动失败 UI，不渲染原始错误、堆栈、SQL、路径或 token。

---

## 18. 用户操作到代码流程

### 18.1 用户输入任务

用户在编辑器输入：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

流程：

```text
TASK-016 当前：
MarkdownEditorPlugin 渲染受控 textarea
用户输入的 - [ ]、#tag、[[Page]] 作为普通 Markdown 文本保留
工具栏按钮通过 markdown.insert-text command 插入 - [ ]、#、[[ ]]
保存时可通过 runtime.markdown.pages narrow facade 调用 core.pages.update

后续 Task Plugin 落地后：
TaskPlugin 识别 - [ ] task text
TaskPlugin 检查 block 是否有 boundPageId
没有 boundPageId → 执行 task.resolve-task-block command
Command 创建 Markdown Page
Command 写 task metadata
Command 更新 block attrs
FilterEngine 刷新 All Tasks
ViewRegistry 渲染任务列表
```

### 18.2 用户点击任务文字

```text
TaskBlock title clicked
→ CommandRegistry.execute("page.open", { pageId: boundPageId })
→ AppShell 路由到 /page/:pageId
→ MarkdownEditorPlugin 渲染该页面
→ SlotRenderer 渲染 page.header.metadata
```

### 18.3 用户点击 Start

```text
TimerMetadataSlot 中 Start button clicked
→ CommandRegistry.execute("timer.start", { pageId })
→ TimerPlugin append timer.started event
→ TimerPlugin set global metadata timer.activeSegmentId
→ GlobalTimerSlot 重新渲染
```

### 18.4 用户 Stop 并写 Note

```text
CommandRegistry.execute("timer.stop")
→ TimerPlugin append timer.time_segment_created event
→ TimerPlugin create note Markdown Page
→ TimerPlugin update timer metadata
→ CalendarPlugin 可读取 time segment
→ StatsPlugin 可聚合 duration
→ MLPlugin 可生成 feature
```

---

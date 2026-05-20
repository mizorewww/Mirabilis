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

TASK-015 当前实现顺序是：`createTauriNativeBridge()` -> storage facade `{ persistence: "in-memory-core" }` -> `createCoreStores()` -> `createCoreRegistries()` -> `createCoreServices()` -> `PluginHost` -> runtime object -> `loadBuiltInPlugins(BUILT_IN_PLUGINS)` -> `activateAll()`。

TASK-015 只在 bootstrap 阶段创建 in-memory Core runtime 和 Plugin Host。`storage.persistence = "in-memory-core"` 是诚实的能力标记，不表示 Core stores 已经接入 SQLite persistence。

`BUILT_IN_PLUGINS` 在 TASK-015 中有意为空数组。Markdown editor、quick capture、search、task、timer、calendar 等具体业务内置插件属于后续插件任务，不应出现在当前启动片段中。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 接收的是 App 启动时显式传入的插件对象，不表示文件系统发现、动态 import 或 native 插件加载。

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
MarkdownEditorPlugin 处理输入
TaskPlugin 的 Tiptap extension 识别 task block
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

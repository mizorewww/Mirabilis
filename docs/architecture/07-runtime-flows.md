# 启动流程与代码路径

描述 AppRuntime 创建流程，以及用户输入任务、打开任务页、Start/Stop 计时时的代码调用链。

## 17. 启动流程

```ts
async function createAppRuntime() {
  const nativeBridge = createTauriNativeBridge();

  const storage = new TauriStorageDriver(nativeBridge);

  const stores = createCoreStores(storage);

  const registries = createCoreRegistries();

  const services = createCoreServices({
    stores,
    registries,
    storage
  });

  const pluginHost = new PluginHost(registries, services);

  const runtime = new AppRuntime({
    stores,
    registries,
    services,
    pluginHost
  });

  await pluginHost.loadBuiltInPlugins([
    MarkdownEditorPlugin,
    TaskPlugin,
    TagPlugin,
    TimerPlugin,
    CalendarPlugin,
    HabitPlugin,
    HeatmapPlugin,
    StatsPlugin,
    ChartPlugin,
    MLPlugin,
    AIPlugin,
    QuickCapturePlugin,
    SearchPlugin,
    SyncPlugin
  ]);

  await pluginHost.activateAll();

  return runtime;
}
```

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

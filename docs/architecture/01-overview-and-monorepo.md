# 总体架构与 Monorepo

说明代码架构目标、分层结构、推荐 Monorepo 目录以及依赖方向。

## 代码架构设计：Plugin-first Markdown 时间管理系统

这套代码架构的核心目标是：

> 开发一个 **任务可以无限嵌套的 Markdown-first 本地时间管理 App**，其中 **Core 极小，Plugin 是一等公民**。
> Core 只负责 Markdown Page、Metadata、Event、Filter、View Registry、Command Registry、Plugin Host。
> 任务、习惯、计时、热力图、统计图、机器学习、AI、日历、快速收集箱都通过 Plugin 接入。

这套架构参考 Obsidian 的插件思路：Obsidian 插件通过 manifest 描述插件信息，通过生命周期方法加载/卸载，并通过注册命令、视图、编辑器扩展等方式接入宿主应用。我们的系统也采用“Core 提供注册点，Plugin 提供能力”的模式。([Developer Documentation](https://docs.obsidian.md/Plugins/Getting%20started/Build%20a%20plugin "Build a plugin - Developer Documentation"))

---

## 1. 总体架构

### 1.1 分层结构

```text
App Shell
  ├─ React UI
  ├─ Layout
  ├─ Routing
  ├─ Plugin Slot Renderer
  └─ Tauri Native Bridge

Core Kernel
  ├─ Markdown Page Store
  ├─ Metadata Store
  ├─ Event Store
  ├─ Filter Store
  ├─ View Registry
  ├─ Command Registry
  ├─ Plugin Host
  └─ Core Services

Plugin Runtime
  ├─ Plugin Loader
  ├─ Plugin Manifest Parser
  ├─ Plugin Lifecycle
  ├─ Plugin Context
  ├─ Extension Points
  └─ Plugin Permissions / Capabilities

Built-in Plugins
  ├─ Markdown Editor Plugin
  ├─ Task Plugin
  ├─ Tag Plugin
  ├─ Habit Plugin
  ├─ Timer Plugin
  ├─ Calendar Plugin
  ├─ Heatmap Plugin
  ├─ Filter UI Plugin
  ├─ Stats Plugin
  ├─ Chart Plugin
  ├─ Machine Learning Plugin
  ├─ AI Plugin
  ├─ Quick Capture Plugin
  ├─ Search Plugin
  └─ Sync Plugin

Native Layer
  ├─ SQLite
  ├─ File System
  ├─ Global Shortcut
  ├─ Notification
  ├─ Window / Tray
  ├─ Updater
  └─ Sync Transport
```

Tauri 负责桌面壳和本地系统能力。Tauri v2 的架构本身就是 Rust + WebView，通过消息传递让前端控制系统能力；Tauri 插件可以接入生命周期、暴露 Rust 命令和系统能力，适合承载全局快捷键、文件系统、SQLite、通知等 native 能力。([Tauri](https://v2.tauri.app/concept/architecture/ "Tauri Architecture"))

TASK-030 当前已经落地的 built-in plugin baseline 是 TypeScript app runtime 内的显式插件对象：Markdown Editor、Metadata UI、Task、Tag、Timer、Calendar、Habit、Heatmap、Stats、Chart、Quick Capture、Search 和 ML。Quick Capture 的 native/global shortcut adapter、Search persistent indexers、ML trusted query/feed/persistence/model-refresh scope、AI、Sync 和完整 release/native wiring 仍是后续范围。

---

## 2. Monorepo 目录结构

建议一开始就用 monorepo。

当前仓库在 TASK-030 仍是 flat layout，而不是下面的最终 monorepo 目录。当前已落地的 App bootstrap / provider / built-in plugin 路径是：

```text
src/
  App.tsx
  bootstrap/
    create-app-runtime.ts
    built-in-plugins.ts
  providers/
    RuntimeProvider.tsx
    runtime-context.ts
    use-runtime.ts
  plugins/
    quick-capture/
      index.ts
      plugin.ts
    search/
      index.ts
      plugin.ts
src-tauri/
```

下面的 `apps/desktop/...`、`packages/...` 和 `plugins/...` 仍是目标架构形态。实现或测试当前分支时，以现有 flat layout 的 `src/bootstrap/*`、`src/providers/*`、`src/App.tsx` 和 root-level `src-tauri/` 为准。

```text
task-time-app/
  apps/
    desktop/
      src/
        main.tsx
        App.tsx
        bootstrap/
          createAppRuntime.ts
          registerBuiltinPlugins.ts
          registerNativeBridge.ts
        shell/
          AppShell.tsx
          Sidebar.tsx
          MainArea.tsx
          CommandPalette.tsx
          SlotRenderer.tsx
        routes/
          PageRoute.tsx
          FilterRoute.tsx
          SettingsRoute.tsx
        providers/
          RuntimeProvider.tsx
          PluginProvider.tsx
          ThemeProvider.tsx
      src-tauri/
        src/
          main.rs
          commands/
            page_commands.rs
            metadata_commands.rs
            event_commands.rs
            filter_commands.rs
            plugin_commands.rs
            native_commands.rs
          db/
            mod.rs
            migrations/
            sqlite.rs
          native/
            shortcuts.rs
            notifications.rs
            files.rs
            windows.rs
            tray.rs
        tauri.conf.json
        Cargo.toml

  packages/
    plugin-api/
      src/
        index.ts
        manifest.ts
        plugin.ts
        context.ts
        command.ts
        view.ts
        metadata.ts
        event.ts
        filter.ts
        slot.ts
        algorithm.ts

    core-kernel/
      src/
        index.ts
        runtime/
          AppRuntime.ts
          PluginHost.ts
          PluginLoader.ts
          PluginLifecycle.ts
        stores/
          PageStore.ts
          MetadataStore.ts
          EventStore.ts
          FilterStore.ts
          PluginStore.ts
        registries/
          CommandRegistry.ts
          ViewRegistry.ts
          MetadataRegistry.ts
          EventRegistry.ts
          SlotRegistry.ts
          AlgorithmRegistry.ts
        services/
          TransactionManager.ts
          FilterEngine.ts
          EventBus.ts
          QueryBus.ts
          CommandBus.ts
          SettingsService.ts
        types/
          Page.ts
          Metadata.ts
          Event.ts
          Filter.ts

    core-ui/
      src/
        SlotRenderer.tsx
        ViewRenderer.tsx
        MetadataBar.tsx
        CommandPalette.tsx
        PluginSettingsPanel.tsx
        hooks/
          useRuntime.ts
          useCommand.ts
          usePage.ts
          useMetadata.ts
          useFilter.ts
          useSlot.ts

    storage/
      src/
        StorageDriver.ts
        TauriStorageDriver.ts
        InMemoryStorageDriver.ts
        repositories/
          PageRepository.ts
          MetadataRepository.ts
          EventRepository.ts
          FilterRepository.ts
          PluginRepository.ts

    editor/
      src/
        MarkdownEditor.tsx
        editorRuntime.ts
        extensionRegistry.ts
        blockIds.ts
        markdownExport.ts
        markdownImport.ts

    ui-kit/
      src/
        Button.tsx
        Popover.tsx
        DatePicker.tsx
        TagPicker.tsx
        IconButton.tsx
        Dropdown.tsx
        Toast.tsx

  plugins/
    markdown-editor/
      src/
        manifest.ts
        plugin.ts
        extensions/
        components/

    task/
      src/
        manifest.ts
        plugin.ts
        syntax/
        commands/
        metadata/
        filters/
        views/
        slots/
        indexers/

    tag/
      src/
        manifest.ts
        plugin.ts
        syntax/
        metadata/
        autocomplete/
        filters/
        views/

    timer/
      src/
        manifest.ts
        plugin.ts
        commands/
        metadata/
        events/
        views/
        slots/
        indexes/

    habit/
      src/
        manifest.ts
        plugin.ts
        metadata/
        events/
        filters/
        views/
        slots/

    calendar/
      src/
        manifest.ts
        plugin.ts
        views/
        components/

    heatmap/
      src/
        manifest.ts
        plugin.ts
        views/
        components/

    stats/
      src/
        manifest.ts
        plugin.ts
        aggregations/
        views/
        filters/

    chart/
      src/
        manifest.ts
        plugin.ts
        views/
        adapters/

    ml/
      src/
        manifest.ts
        plugin.ts
        algorithms/
        features/
        views/
        jobs/

    ai/
      src/
        manifest.ts
        plugin.ts
        providers/
        commands/
        tools/
        views/

    quick-capture/
      src/
        manifest.ts
        plugin.ts
        commands/
        views/
        native/    # future native/global shortcut adapter, not TASK-029

    search/
      src/
        manifest.ts
        plugin.ts
        indexers/  # future persistent Search indexing, not TASK-029
        commands/
        views/

    sync/
      src/
        manifest.ts
        plugin.ts
        transport/
        commands/
        jobs/
```

---

## 3. 依赖方向

必须严格控制依赖方向。

```text
apps/desktop
  ├─ depends on packages/core-kernel
  ├─ depends on packages/core-ui
  ├─ depends on packages/storage
  ├─ depends on packages/editor
  ├─ depends on plugins/*
  └─ depends on ui-kit

plugins/*
  ├─ depends on packages/plugin-api
  ├─ depends on packages/ui-kit
  └─ may depend on package-specific utilities

packages/core-kernel
  ├─ depends on packages/plugin-api
  └─ does not import plugins/*

packages/plugin-api
  └─ pure types only

packages/storage
  ├─ depends on plugin-api/core types
  └─ talks to Tauri native bridge

src-tauri
  └─ owns SQLite/native capabilities
```

关键规则：

```text
Core 不能 import Task Plugin
Core 不能 import Timer Plugin
Core 不能 import Habit Plugin
Core 不能 import Stats Plugin
Core 不能 import ML Plugin
Core 不能 import AI Plugin
```

插件通过注册能力进入 Core。

---

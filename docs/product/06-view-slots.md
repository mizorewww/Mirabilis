# View Slot 系统

定义插件向编辑器、页面、全局区域和具体视图挂载 UI 的 Slot 设计。

## 25. View Slot 系统

Core 提供 UI 插槽。
插件向插槽注册 UI。

### 25.1 编辑器插槽

```text
editor.block.leading
editor.block.trailing
editor.block.hover_menu
editor.inline.autocomplete
editor.mobile.toolbar
```

示例：

```text
Task Plugin 在 editor.block.leading 放 checkbox
Task Plugin 在 hover_menu 放 open / start
Tag Plugin 在 inline.autocomplete 放 tag suggestions
Quick Capture Plugin 在 mobile.toolbar 放 ☐ # @date
```

### 25.2 页面插槽

```text
page.header.metadata
page.header.actions
page.sidebar.panel
page.body.after
page.timeline
```

示例：

```text
Task Plugin 在 page.header.metadata 放 status / due / estimate
Timer Plugin 在 page.header.actions 放 Start
Timer Plugin 在 page.timeline 放 Time Segments
ML Plugin 在 sidebar 放 prediction panel
```

### 25.3 全局插槽

```text
global.command_palette
global.floating
global.status_bar
global.left_sidebar
```

示例：

```text
Timer Plugin 在 global.floating 放全局计时器
Command Plugin 在 global.command_palette 放所有命令
Filter Plugin 在 left_sidebar 放 saved filters
```

### 25.4 View 插槽

```text
view.calendar.block
view.chart.tooltip
view.filter.result_item
view.heatmap.cell
```

TASK-022 当前使用的 filter empty-state slot 是：

```text
filter.empty_state
```

Task Plugin 注册 `task.filter-empty-state` 到这个 slot，order 为 `100`，文案是 generic page empty state。

当前 canonical filter result view type 是：

```text
page.list
```

Task Plugin 注册 view `task.page-list`，type 为 `page.list`，用于 All Tasks / Today，并保留 TASK-021 Tag Plugin saved filters 的兼容性。

---

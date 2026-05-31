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
Markdown Editor Plugin 在 editor.mobile.toolbar 放 baseline ☐ # [[ ]] snippet buttons
```

TASK-029 当前 Quick Capture 只注册 `quick-capture.mobile-input` view，渲染 labelled region + textarea baseline。把 Quick Capture 输入挂进 `editor.mobile.toolbar`、自动弹键盘，以及提供 ☐ / # / @date / [[ ]] / slash 语法按钮仍是后续移动端集成范围。

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
Metadata UI Plugin 提供 reusable MetadataBar 组合 page.header.metadata
Task Plugin 在 page.header.metadata 放 read-only current fields
Tag Plugin 在 page.header.metadata 放 #tag display / add-remove controls
Timer Plugin 在 page.header.metadata 放 enabled Start timer control
Timer Plugin 后续可在 page.header.actions 放更完整 Start / Switch actions
Timer Plugin 在 page.timeline 放 timer.page-timeline.segments Time Segments
ML Plugin 在 page.sidebar.panel 放 ml.page-sidebar.prediction-panel
AI Plugin 注册 ai.suggestion-panel 和 ai.review-panel views
```

TASK-025 当前 slot 行为：

```text
metadata-ui exports MetadataBar
MetadataBar lists page.header.metadata slot contributions in SlotRegistry order
task.page-header-metadata.current-fields renders read-only enabled/status/source relation/scheduled/due
tag.page-header-metadata.tags keeps order 300 and preserves existing tag add/remove command behavior
timer.page-header-metadata.placeholder renders an enabled Start timer control
Start executes timer.start through descriptor-owner scoped command execution
timer.page-timeline.segments renders current-page Timer-owned segments and inert note text on page.timeline
```

`MetadataBar` 是 reusable slice；TASK-039 后，production app shell 在 page routes 上把 public `metadata-ui` `MetadataBar` 挂在 route title 下方、editor 上方。Manifest `metadataFields` 仍是 ownership descriptors/reservation inputs，不是 executable renderer/editor declarations。TASK-039 也在 page routes 上把 `page.timeline` 挂在 editor 下方，经 `SlotHost` 只传 `{ page: { id, title } }`；`timer.page-timeline.segments` 提供 accessible Add Note / Edit Note UI，并通过 `timer.add-note` 创建或更新 Markdown Page note；slot 渲染的 segment 和 note 文本保持 inert。Saved-filter routes、placeholder routes、`page.header.actions`、`page.sidebar.panel` 和 `page.body.after` 仍未挂载这些 page slot。

TASK-030 当前 `ml.page-sidebar.prediction-panel` 使用与 `ml.prediction-panel` view 相同的 validated React component，只渲染调用方提供的 `ml.remaining-time-prediction` DTO。Malformed、wrong-kind 或 unbounded DTO fail closed to an inert unavailable state；app-shell/sidebar broad mounting remains deferred.

TASK-031 当前 `ai.suggestion-panel` 和 `ai.review-panel` 是 registered views, not app-shell mounted AI workflows. They render accessible loading/unavailable status text and fail closed/inertly for caller data, provider output, and errors. AI suggestion acceptance UI, sidebar mounting, persistent settings, secret storage, and live provider execution remain deferred.

### 25.3 全局插槽

```text
global.command_palette
global.floating
global.status_bar
global.left_sidebar
```

示例：

```text
Timer Plugin 在 global.floating 放 timer.global-active-bar
Command Plugin 在 global.command_palette 放所有命令
Filter Plugin 在 left_sidebar 放 saved filters
```

TASK-025 当前 `timer.global-active-bar` 显示 active page title、elapsed time，以及 Pause / Resume / Stop controls。它使用 Timer Plugin registration-scoped in-memory active timer state。TASK-039 后，production app shell 通过 MUI `Portal` 挂载 `global.floating`，并把 contribution 作为 React-owned portal child 渲染，不创建 nested React root。该 floating surface 不接收 page props 或 raw `runtime.commands`；目前只给 Timer-owned contribution 一个 narrow command facade，允许 `timer.pause`、`timer.resume`、`timer.stop` 以 exact `{}` payload 执行。Timer finalization creates event-backed Time Segments. TASK-026 Calendar day/week views can render caller-provided `calendar.time-segments` DTOs when a caller mounts the view; Calendar app-shell route/feed, Stats integration, Timer metadata totals, Recently Worked, Unnoted Sessions, manual segment editing, calendar drag/drop, and native persistence/schema/Tauri/package/Rust changes remain deferred.

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

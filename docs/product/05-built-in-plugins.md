# 内置插件产品设计

集中描述 Metadata UI、Tag、Task、Habit、Timer、Calendar、Stats、Chart、ML、AI、Filter、Quick Capture 和 Search 等内置插件的产品语义。

## 14. Metadata UI Plugin

Metadata UI Plugin 是内置插件，manifest id 是 `metadata-ui`。TASK-023 当前交付的是 reusable unified metadata bar slice，不是完整 metadata renderer/editor registry，也不是 app-shell/editor 默认挂载。

当前注册和导出：

```text
Built-in plugin: MetadataUiPlugin
Manifest id: metadata-ui
Export: MetadataBar
Slot composed by the bar: page.header.metadata
```

`MetadataBar` 从 `SlotRegistry` 读取 `page.header.metadata` contributions，并按 registry order 渲染。它本身不把 Task、Tag、Timer 业务逻辑写进 Core，也不把 manifest `metadataFields` 当作 executable renderer/editor declaration；具体字段 UI 仍由插件通过 slot contribution 提供。

当前信任和安全边界：

- 需要 Plugin Host ownership data；缺失时 fail closed。
- 只使用 active plugin manifest 中 valid `metadataFields` descriptor 作为 trusted field descriptors。
- Metadata record 必须匹配当前 page、owner `sourcePluginId`、descriptor namespace/key 和 descriptor `valueType`。
- namespace/key 必须是安全 segment，`valueType` 必须有效，trusted values 使用 prototype-safe object。
- slot props 只包含 `pageId`、contributing `pluginId`、trusted fields、trusted values 和 narrow `commands.execute` facade；`MetadataBar` 通过 registered command descriptor owner 验证 command belongs to the contributing plugin，缺少 descriptor lookup 时 fail closed，不按 command id prefix fallback。
- 不向 slot component 暴露 full runtime、stores、registries、Plugin Host、NativeBridge、DB、filesystem、path、shell、notification 或 shortcut handles。
- 渲染值时使用 React text sinks；unsafe metadata strings 仍是 inert text。

当前 built-in metadata contributors：

```text
Task Plugin:
  slot: task.page-header-metadata.current-fields
  behavior: read-only display for enabled, status, sourcePageId, sourceBlockId, scheduled, due

Tag Plugin:
  slot: tag.page-header-metadata.tags
  order: 300
  behavior: inert #tag display plus tag.add-tag / tag.remove-tag controls

Timer Plugin:
  slot: timer.page-header-metadata.placeholder
  behavior: enabled Start control through scoped timer.start
```

Deferred after TASK-024:

```text
Full metadata renderer/editor registry
Date picker
Estimate editor semantics
Full tag picker polish beyond existing Tag controls
Timer tracked-total metadata, Time Segment timeline, and Note flow
App-shell/editor mounting if not already wired by a caller
Save-time scanning/indexing
Rich editor migration
Native/Tauri/package/Rust changes
Calendar/Habit/Stats/ML/AI metadata behavior
Release packaging
```

---

## 15. Tag Plugin

Tag Plugin 是内置插件，manifest id 是 `tag`。TASK-021 当前交付的是显式命令驱动的 tag baseline，不是保存时自动索引、富 inline token UI 或 autocomplete。TASK-022 后，Tag Plugin 保存的 `viewType: "page.list"` filter definition 可以通过 generic filter executor 和 registered `page.list` view path 执行/渲染；Tag Plugin 本身仍只负责保存 tag-owned filter definition。TASK-023 后，Tag Plugin 的 `page.header.metadata` contribution 会通过 `MetadataBar` 统一组合，但具体 tag UI 仍归 Tag Plugin 所有。

### 15.1 当前注册能力

TASK-021 当前通过 `BUILT_IN_PLUGINS` 注册 `TagPlugin`，manifest 贡献：

```text
Markdown Syntax:
tag.hashtag
syntax: #tag

Metadata Field:
id: tag.tags
namespace: tag
key: tags
valueType: json
value: string[]
```

`tag.tags` 的值是规范化后的 `string[]`，不带 `#`。Tag grammar 是保守 ASCII slug：

- 输入先 `trim`，最多剥掉一个前导 `#`。
- raw 输入必须先匹配 ASCII slug，再 lower-case；不会先做 Unicode case folding。
- 第一个字符必须是 ASCII letter/digit；后续只允许 ASCII letter/digit、`_`、`-`。
- 规范化值全部小写，最长 32 字符。
- 每页最多保存 32 个唯一 tag，按第一次出现顺序去重。
- 非 ASCII 和类似 `K` 这类值会被拒绝，而不是 case-fold 成 ASCII。

### 15.2 Markdown 输入

用户写：

```markdown
- [ ] 写 Timer Plugin #architecture #timer
```

TASK-021 不在保存时自动扫描正文。调用方必须显式执行：

```ts
runtime.commands.execute("tag.refresh-tags", { pageId });
```

`tag.refresh-tags({ pageId })` 扫描已保存的结构化 `markdown.line` blocks，并把该页的 `tag.tags` 精确替换为当前 source tags；没有 source tags 时也写入显式空数组 `[]`。

识别结果：

```text
tags = ["architecture", "timer"]
```

扫描会忽略 heading 行、fenced code、escaped hash、非 token 边界的 `foo#bar`、URL-ish / invalid source token、HTML-like fragment 内的 `#tag`、非 ASCII token 和 control-ish token。

### 15.3 UI 添加

TASK-021 注册 `page.header.metadata` slot contribution：

```text
id: tag.page-header-metadata.tags
order: 300
component: TagMetadataSlot
```

当前 `TagMetadataSlot` 显示 inert `#tag` 文本 chip，并提供 add/remove 控件。它通过命令更新页面 scoped metadata：

```text
tag.add-tag({ pageId, tag })
tag.remove-tag({ pageId, tag })
```

TASK-023 后，这个 contribution 可由 `MetadataBar` 统一组合。它仍不是完整 tag picker、autocomplete 或 metadata field editor registry；长期 tag picker polish 和统一字段编辑器仍属于后续任务。

添加 `product` 后：

```text
tags = ["architecture", "timer", "product"]
```

移除已存在或缺失的 tag 都会写入该页的显式 `tag.tags` 值；移除后没有 tag 时保存 `[]`。

### 15.4 Filter 定义

TASK-021 当前提供：

```ts
runtime.commands.execute("tag.create-filter", { tag: "architecture" });
```

该命令保存一个 Tag Plugin 拥有的 filter definition：

```json
{
  "name": "#architecture",
  "query": {
    "where": [
      {
        "field": "metadata.tag.tags",
        "op": "includes",
        "value": "architecture"
      }
    ]
  },
  "viewType": "page.list"
}
```

TASK-022 交付了 generic `page.list` filter execution/rendering path，因此这个 Tag filter 保持兼容：`metadata.tag.tags includes <tag>` 仍由 Tag Plugin 生成，执行和展示由 Core 的 data-only executor、registered view 和 empty-state slot 组合完成。

长期 Tag Plugin 还会负责：

```text
tag autocomplete
tag index
tag-based stats
```

---

## 16. Task Plugin

Task Plugin 是一个插件，不是 Core 功能。

### 16.1 注册能力

TASK-018/TASK-022 当前已经交付的注册能力：

```text
Markdown Syntax:
- [ ]

Metadata:
task.enabled
task.status
task.sourcePageId
task.sourceBlockId
task.scheduled
task.due

Commands:
task.resolve-task-block
task.open-task-page
task.toggle-status

Filters:
task.filter.all-tasks
task.filter.today

Views:
task.page-list, type page.list

Slots:
task.filter-empty-state on filter.empty_state
task.page-header-metadata.current-fields on page.header.metadata
```

`task` 是内置插件。manifest 暴露 `task.checkbox` markdown syntax descriptor，语法文本为 `- [ ]`；descriptor 只是编辑器扩展 metadata，不会自己创建任务页。`task.resolve-task-block` 是命令级 resolver，payload 为：

```ts
{
  sourcePageId: string;
  sourceBlockId: string;
}
```

resolver 从当前 source block 派生任务标题，创建或复用任务页，并把 source block 复制更新为带 `attrs.boundPageId` 的 block。重复执行同一 `(sourcePageId, sourceBlockId)` 不会创建重复任务页。

TASK-019 新增 `task.open-task-page`。它使用同一个 payload：

```ts
{
  sourcePageId: string;
  sourceBlockId: string;
}
```

open command 与 `task.resolve-task-block` 共享 resolver/source relation 行为，但返回值收窄为：

```ts
{
  pageId: string;
}
```

UI/editor 点击任务标题时只发送 source page/block 身份，并只打开 command 返回的 `pageId`。`attrs.boundPageId` 是经过 Task Plugin 验证或恢复的 source binding 数据；它不是受信任的导航目标。伪造、不匹配或 malformed `boundPageId` 都按未绑定/不可信处理。

当前和后续能力边界：

```text
Current Markdown Syntax:
Task Plugin reads - [ ], - [x], and - [X] source task lines for open/toggle

Current Events:
namespace=task, type=completed
namespace=task, type=reopened

Current Commands:
task.resolve-task-block
task.open-task-page
task.toggle-status

Current Filters:
All Tasks
Today

Current Views:
page.list

Future Events:
task.renamed

Future Commands:
task.insert_task_syntax
due/estimate setters

Future Filters:
Overdue
Done
No Estimate
Unlinked Tasks

Future Views:
task.metadata_fields
```

TASK-020 已实现 checkbox status toggle 和完成/重开 events。TASK-022 已声明 `task.due` 和 `task.scheduled` date metadata fields，并交付 All Tasks / Today filters、`task.page-list` registered view 和 `filter.empty_state` empty-state slot。TASK-023 添加了 `task.page-header-metadata.current-fields` slot contribution，用于在 `MetadataBar` 中 read-only 显示当前字段：`enabled`、`status`、`sourcePageId`、`sourceBlockId`、`scheduled` 和 `due`。`task.estimate`、`task.priority`、完成时间 metadata、Overdue / Done / No Estimate / Unlinked filters、task metadata editors、`task.renamed` 和非 toggle commands 仍是后续 Task Plugin 范围；后续新增 task metadata 时应继续使用 camelCase key。当前 command ID 使用 kebab-case：`task.resolve-task-block`、`task.open-task-page`、`task.toggle-status`；`task.set_due` / `task.set-due` 仍未实现。

### 16.2 输入到任务页面的完整流程

用户输入：

```markdown
- [ ] 写快速收集箱交互 #product
```

流程：

```text
Markdown Page 更新
TASK-017 保存为带稳定 blockId 的 markdown.line blocks
TASK-018 可执行 task.resolve-task-block({ sourcePageId, sourceBlockId })
Task Plugin 校验 source block 是未完成任务语法 - [ ] ...
Task Plugin 创建或复用任务对应 Markdown Page
Task Plugin 写入 task.enabled、task.status、task.sourcePageId、task.sourceBlockId
Task Plugin 通过 source block attrs.boundPageId 记录 source relation
TASK-019 可执行 task.open-task-page({ sourcePageId, sourceBlockId }) 并返回 { pageId }
TASK-020 可执行 task.toggle-status({ sourcePageId, sourceBlockId }) 并返回 { pageId, status }
Task Plugin 将 - [ ] 完成写回 - [x]，将 - [x] / - [X] 重开写回 - [ ]
Task Plugin 更新 task.status，并追加 namespace: "task", type: "completed" 或 "reopened" event
```

当前不会因为保存 Markdown Page 自动扫描所有 task block；也不会处理 `#product`、保存时自动刷新 All Tasks / Today / Tag Filter，或接入全局 saved-filter navigation / app-shell filter route。这些属于后续 editor integration、navigation 和 app-shell wiring 任务。`task.open-task-page` 可以为尚未绑定的 checked source task line 创建、绑定并打开 status 为 `done` 的任务页，且不会写 completion/reopen event；`task.resolve-task-block` 仍只接受 unchecked `- [ ]` source task line。TASK-022 已注册 `page.list` 任务列表 view 和 generic empty-state slot，可用于已经拿到 filter results 的渲染路径。

### 16.3 点击逻辑

任务行：

```text
☐ 写快速收集箱交互
```

点击 checkbox：

```text
Command: task.toggle-status
Payload: { sourcePageId, sourceBlockId }
Return: { pageId, status }
Markdown: - [ ] -> - [x]，- [x] / - [X] -> - [ ]
Metadata: task.status 更新为 todo 或 done
Event: namespace: "task", type: "completed" 或 "reopened"
```

点击文字：

```text
Command: task.open-task-page
Payload: { sourcePageId, sourceBlockId }
Return: { pageId }
Target: command 返回的 Markdown Page
```

点击文字打开任务页是 TASK-019 当前行为；点击 checkbox 切换 source task line 状态是 TASK-020 当前行为。Markdown 编辑器只在 task syntax extension 存在、当前 Markdown 与结构化 body 快照一致时显示 task-title 按钮和 checkbox 控件；loaded `pageId/pageFacade` 模式从 runtime Markdown page facade 携带结构化 `body`，因此重新打开的页面也能显示按钮和 checkbox。若用户在未保存 textarea 中删除或改名任务行，旧控件会隐藏；若 `task.open-task-page` 或 `task.toggle-status` 的异步结果在页面切换或内容变化后才返回，结果会被忽略。

TASK-022 filters 和 task `page.list` view 已实现为 data-only / registered-view slice；自动保存时索引、全局 filter route、日期选择器、`@date` parser 和 richer task list item UI 仍未实现。

---

## 17. Habit Plugin

Habit Plugin 是内置插件，manifest id 是 `habit`。TASK-027 当前交付的是 daily Habit baseline 和 generic Heatmap Plugin baseline，不是 Task checkbox 自动桥接、Habit Review、完整 recurrence/streak 算法或 app-shell route polish。

Habit Plugin 不进入 Core。Core 只保存 Markdown Page、metadata、event、filter 和 registry 数据；habit 语义由 `habit` plugin 通过 PluginContext facade 维护。

### 17.1 创建习惯

用户写：

```markdown
- [ ] 每天复盘 10 分钟 #habit
```

调用方显式执行：

```ts
runtime.commands.execute("habit.refresh-habit", { pageId });
```

Habit Plugin 识别 title 或 saved `markdown.line` body 中的有效 `#habit`，并写入 Habit-owned metadata：

```text
habit.enabled = true
habit.frequency = daily
habit.nextDue = local today
```

escaped hash、joined token、HTML-like fragment 和 fenced code 中的 `#habit` 保持 inert。这个页面仍然是 Markdown Page；如果页面同时来自 Task syntax，checkbox/source relation 仍由 Task Plugin 拥有。

### 17.2 注册能力

Habit Plugin 注册：

```text
Plugin id:
habit

Markdown Syntax:
habit.hashtag
syntax: #habit

Metadata:
habit.enabled
habit.frequency
habit.lastCheckedAt
habit.nextDue

Events:
namespace: habit, type: checked
namespace: habit, type: unchecked

Commands:
habit.refresh-habit
habit.check-today
habit.uncheck-today
habit.set-frequency

Filters:
habit.filter.habits
habit.filter.today-habits
```

`habit.set-frequency` 当前只接受 `frequency: "daily"`。`habit.target`、`habit.streak`、skipped events、weekly/monthly recurrence、Habit Review、Habit card/list polish 和 snake_case command aliases 都是后续范围。

### 17.3 习惯完成

TASK-027 当前完成路径是显式 command，不是 Task checkbox 自动桥接：

```ts
runtime.commands.execute("habit.check-today", { pageId });
```

Habit Plugin 验证 page 存在且是 trusted Habit page，然后写入：

```text
Metadata:
habit.lastCheckedAt = local today
habit.nextDue = local tomorrow

Event:
namespace: habit
type: checked
payload: { habitPageId, date }
```

取消今天完成：

```ts
runtime.commands.execute("habit.uncheck-today", { pageId });
```

会追加 `namespace: "habit"`、`type: "unchecked"` event，payload 同样是 `{ habitPageId, date }`，并把 `habit.nextDue` 设回 today。

`Today Habits` filter 使用 Habit-owned metadata 查询 daily habits whose `habit.nextDue` equals today or is earlier than today；当前 filter executor 没有 `lte` operator，所以 query 使用 `eq today OR lt today`。

### 17.4 热力图

热力图不是 Core 功能。
TASK-027 中由独立 `heatmap` plugin 注册 generic view：

```text
Plugin id:
heatmap

View:
heatmap.calendar

View type:
heatmap

Accepted data:
kind: "heatmap.date-series"
```

Heatmap Plugin 消费调用方或 view host 提供的 normalized DTO，不导入 Habit internals，也不直接读取 Habit events。测试 harness 可以把 public Habit `checked` / `unchecked` events 规范化为 `heatmap.date-series` rows；这种规范化属于 caller/view-host 行为。Heatmap 渲染 inert text/native button UI，malformed/wrong-owner/accessor/prototype/symbol/non-enumerable rows fail closed。

Deferred after TASK-027:

```text
Task checkbox auto-bridge
Habit Review
Habit card/list polish
habit.target / habit.streak
skipped / weekly / monthly recurrence
Stats/ML/Calendar feeds
app-shell route/navigation polish
native/Tauri/package/Rust/schema persistence changes
```

---

## 18. Timer Plugin

Timer Plugin 是核心体验插件，但仍然不是 Core 功能。

TASK-025 当前交付 Timer Plugin 的 runtime command、Time Segment 和 Note slice。内置 `TimerPlugin` 注册 canonical commands `timer.start`、`timer.stop`、`timer.pause`、`timer.resume`、`timer.switch`、`timer.add-note`，把 enabled Start control 注册到 `page.header.metadata`，把 `timer.global-active-bar` 注册到 `global.floating`，并把 `timer.page-timeline.segments` 注册到 `page.timeline`。一个 global active timer 由 Timer Plugin-owned、registration-scoped、in-memory runtime state 表示；它不是 Core-owned、native、persistent 或 schema-backed state。

TASK-025 会在 timer finalization 时创建 event-backed Time Segment，并通过 Markdown Page 保存 stopped-segment Note。TASK-026 的 Calendar baseline 可以渲染调用方提供的 normalized Timer segment DTO；TASK-028 的 Stats baseline 可以聚合调用方提供的 normalized Timer/Habit/Task/Tag DTO。Timer Plugin 自身仍不更新 `timer.total_tracked_time`，也不直接推送 Calendar/Stats/ML feed。

### 18.1 计时的重要性

计时是这个产品的关键差异化。

任务告诉用户：

```text
我要做什么
```

计时告诉用户：

```text
我真实做了什么
做了多久
为什么做
做到哪里
哪里卡住
下一步是什么
```

长期目标中，每段计时都会生成 Time Segment，每个 stopped Time Segment 都可以写 Note。TASK-025 当前已经在 Timer Plugin 内交付 event-backed Time Segment、Markdown Page-backed Note 和 `page.timeline` slot；TASK-026 当前可以在 Calendar day/week view 中渲染调用方传入的 normalized segment DTO。Timer metadata totals、Timer-to-Stats/ML feed、manual segment editing、Calendar app-shell feed/routing 和 native persistence 仍是后续范围。

---

### 18.2 Timer Plugin 注册能力

当前 TASK-025 注册能力：

```text
Slot:
timer.page-header-metadata.placeholder on page.header.metadata
timer.global-active-bar on global.floating
timer.page-timeline.segments on page.timeline

Commands:
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add-note

Events emitted:
namespace: timer, type: started
namespace: timer, type: paused
namespace: timer, type: resumed
namespace: timer, type: stopped
namespace: timer, type: time_segment_created
namespace: timer, type: time_segment_note_added
```

后续 Timer Plugin 范围：

```text
Metadata:
timer.total_tracked_time
timer.last_tracked_at
timer.active_segment_id

Commands:
timer.edit_segment
timer.create_manual_segment

Filters:
Tracked Today
Tracked This Week
Recently Worked
Long Sessions
Unnoted Sessions

Views:
timer.timeline
timer.segment_detail
timer.active_bar

Events:
namespace: timer, type: time_segment_adjusted
```

---

### 18.3 Time Segment

Time Segment 是 Timer Plugin 管理的 event-backed 实体。TASK-025 当前通过 append-only event 记录 segment，而不是写独立 Core business store 或 native schema。

Timer finalization path 追加 event record：

```text
namespace: timer
type: time_segment_created
payload:
  segmentId
  pageId
  startAt
  endAt
  durationSeconds
  source: "timer"
```

Payload 使用 camelCase 并省略缺失 optional fields。TASK-025 的 finalization event 不写 `notePageId`；Note linkage 通过独立 `time_segment_note_added` event 派生。`durationSeconds` 排除 paused duration。

Note 是一个 Markdown Page：

```markdown
# Time Segment Note

刚才主要在重新想插件系统：
- Core 只保留 Markdown Page / Metadata / Event / Filter / View registry / Command registry
- 任务、习惯、热力图、统计和 ML 都要通过 plugin 接入
```

### 18.4 开始计时

用户在任务页面点击 Start。

系统：

```text
Command: timer.start
Event: timer.started
View: global active timer bar 显示
```

`timer.started` event payload 使用 `startAt`。Command result 的 active timer DTO 使用 `startedAt`，并保持 narrow DTO shape：`pageId`、`pageTitle`、`segmentId`、`startedAt`、`elapsedSeconds`、`status`，stopped DTO 另有 `stoppedAt`。

`timer.start` 只接受 exact `{ pageId }` payload 并验证 page 存在。若已有 active timer，Timer Plugin 先 append `timer.stopped`，再 append `namespace: "timer"`、`type: "time_segment_created"` event，然后 append `timer.started` for the new page，并返回 `{ activeTimer, stoppedTimer, createdSegment }`。Same-page start 也按 stop then restart 处理。

全局计时器：

```text
设计 Timer Plugin · 00:23:18
Pause · Stop
```

Paused timer 显示 Resume。

### 18.5 为 stopped segment 写 Note

TASK-025 当前 Note 只针对 stopped segment。用户在 `page.timeline` 的 Timer segment UI 点击 Add Note / Edit Note：

```text
刚发现 heatmap 也应该是 View Plugin，不应该写死。
```

Timer Plugin 通过 `timer.add-note({ segmentId, markdown })` 创建或更新 Time Segment Note Markdown Page，返回 `{ notePageId }`，并追加：

```text
namespace: timer
type: time_segment_note_added
payload:
  segmentId
  notePageId
  notedAt
```

原始 `time_segment_created` event 保持 immutable，不会被回写或补上 `notePageId`。

### 18.6 停止计时

用户点击 Stop。

TASK-025 当前系统：

```text
Command: timer.stop
Event: timer.stopped
Event: namespace timer, type time_segment_created
Active timer state cleared
Result: { activeTimer: null, stoppedTimer, createdSegment }
```

`timer.pause`、`timer.resume` 和 `timer.stop` 使用 exact empty payloads。`undefined` 和 exact null-prototype empty payloads are allowed；caller-owned/non-empty/prototype/accessor/symbol/non-enumerable unsafe payloads are rejected。`timer.switch({ pageId })` stops the previous active timer, starts the next, supports no-active, paused, and same-page cases, and preserves active state/events when the target page is missing.

TASK-025 still defers:

```text
Metadata: timer.total_tracked_time
Metadata: timer.last_tracked_at
Calendar app-shell feed/routing and direct cross-plugin read facade
Timer-to-Stats feed normalization and app-shell Stats routes
ML Plugin prediction inputs
Recently Worked / Unnoted Sessions
Manual segment editing
Calendar drag/drop
Native persistence/schema/Tauri/package/Rust changes
```

---

## 19. Calendar Plugin

Calendar 是插件。

### 19.1 Calendar Plugin 注册能力

TASK-026 当前交付的是最小 Calendar baseline：

```text
Plugin id:
calendar

Views:
calendar.day
calendar.week

Commands:
calendar.open-time-segment

Accepted Data Shape:
kind: "calendar.time-segments"
segments: CalendarTimeSegmentInput[]
```

`calendar.month`、`calendar.create_manual_segment`、`calendar.edit_time_block`、`calendar.open_time_segment` 以及 hyphenated manual create/edit aliases 都没有在 TASK-026 注册。

当前 DTO 是调用方或 view host 传入的 normalized projection，不是 Calendar Plugin 自己从 Timer store 读取：

```ts
type CalendarTimeSegmentsData = {
  kind: "calendar.time-segments";
  segments: readonly CalendarTimeSegmentInput[];
};

type CalendarTimeSegmentInput = {
  segmentId: string;
  pageId: string;
  pageTitle: string;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  source: "timer";
  provenance: {
    eventPageId: string;
    namespace: "timer";
    sourcePluginId: "timer";
    type: "time_segment_created";
  };
  note?: string;
  detail?: string;
};
```

Calendar treats `note` and `detail` as already-normalized projection text. It renders them as inert React text only after a user opens the segment detail.

### 19.2 Calendar 展示 Time Segment

TASK-025 已产生 Timer-owned Time Segment events。TASK-026 中，Calendar View 可以展示调用方规范化后的 Timer segments：

```text
10:00–10:47 设计 Timer Plugin
14:00–14:45 写 Field Plugin
21:00–21:50 整理 ML Plugin
```

`calendar.day` and `calendar.week` render accessible `Calendar day` / `Calendar week` regions with native time-block buttons. Display uses UTC time ranges. If `date` or `weekStart` is omitted, the view derives the selected day from the current UTC date; deterministic tests pass explicit UTC date-only props or set the test clock.

Segments are visible when their UTC interval overlaps the selected day or week. A segment that starts before midnight or before the selected week still appears if it carries over into the selected range.

Clicking a time block executes:

```text
calendar.open-time-segment({ segmentId, pageId })
```

The command validates an exact `{ segmentId, pageId }` payload, rejects accessors, symbols, prototype-carried fields, non-enumerable fields, extra fields, blank or non-string ids, and unknown segments, and only accepts segments known to the current Calendar runtime/view lifecycle. A valid click opens an in-view `Segment detail` region. Detail rendering is read-only and inert; Calendar does not mutate Timer events, notes, pages, metadata, or native storage.

### 19.3 Calendar 也能展示其他插件数据

Long-term, Task Plugin can supply scheduled / due tasks to Calendar, and Habit Plugin can supply habit checked events. TASK-026 does not implement those feeds yet.

Current boundary:

- Calendar Plugin only renders a supplied normalized timeline projection.
- Calendar does not read Timer-owned events directly through the plugin-facing event facade in this slice. That facade is plugin-scoped; a later task may add a reviewed cross-plugin read/query facade.
- The test harness may normalize public Timer `time_segment_created` events into `calendar.time-segments` DTOs, but that normalization is caller/view-host behavior.

Deferred after TASK-026:

```text
calendar.month
manual segment creation/editing
snake_case Calendar command aliases
app-shell route mounting/navigation
drag/drop calendar editing
broad cross-plugin event query/read facade
Timer metadata totals
Stats/ML/Habit/Task scheduled feeds
external calendar sync
native/Tauri/package/Rust/schema changes
strict UTC Z-only and duration-match hardening
stale detail clearing after data/date/week changes
```

---

## 20. Stats Plugin 与 Chart Plugin

统计也全部插件化。

### 20.1 Stats Plugin 注册能力

TASK-028 当前注册内置 `stats` plugin。Stats 聚合在插件内完成，不属于 Core 业务逻辑。

```text
Command:
stats.run-aggregation({ aggregationId, input })

Manifest algorithm descriptors:
stats.sum-time-by-tag
stats.sum-time-by-page
stats.estimate-vs-actual
stats.habit-completion-rate
stats.task-switch-count
stats.unnoted-sessions-count

Input kinds:
stats.time-by-tag-input
stats.time-by-page-input
stats.estimate-vs-actual-input
stats.habit-completion-input
stats.task-switch-count-input
stats.unnoted-sessions-input
```

这些 algorithm descriptor 当前是 manifest metadata；runtime 执行入口是 `stats.run-aggregation` command，不存在 per-aggregation command alias。

Stats 消费调用方或 view host 传入的 normalized DTO。这些 DTO 可以来自公开的 plugin output、event 或 metadata 投影，但 Stats 不直接读取 Timer/Habit/Task/Tag internals，也不通过私有 store 查询其他插件数据。

当前聚合输出：

```text
stats.sum-time-by-tag -> chart.category-series
stats.sum-time-by-page -> chart.category-series
stats.estimate-vs-actual -> chart.comparison-series
stats.habit-completion-rate -> chart.category-series
stats.task-switch-count -> chart.category-series
stats.unnoted-sessions-count -> chart.category-series
```

`stats.unnoted-sessions-count` 统计有效 Timer segment 中没有匹配 Timer note-added event 的 session，并按 page identity 分组；同名页面不会被合并。

### 20.2 Chart Plugin 注册图表视图

TASK-028 当前注册内置 `chart` plugin。Chart 渲染 generic DTO，不查询 Stats internals。

```text
Views:
chart.bar
chart.line
chart.pie

DTO kinds:
chart.category-series
chart.time-series
chart.comparison-series
```

当前 view 接收范围：

```text
chart.bar: chart.category-series, chart.comparison-series
chart.line: chart.time-series
chart.pie: chart.category-series
```

Chart baseline 使用 React inert text、table/list/status markup，提供 loading 和 empty states；当前没有引入 production charting library。

### 20.3 估时偏差

估时偏差当前通过 normalized DTO 输入计算：

```text
aggregationId: stats.estimate-vs-actual
input.kind: stats.estimate-vs-actual-input
```

Stats Plugin 返回：

```text
kind: chart.comparison-series
columns: label / expectedSeconds / actualSeconds / deltaSeconds / errorPercent
```

Chart Plugin 可以用 `chart.bar` 以 accessible comparison table 渲染该 DTO。

### 20.4 TASK-028 后仍延期

```text
Stats dashboard / insight card views
Planning Review / Weekly Review / Estimate Error / Recently Stalled / Unnoted Sessions saved filters
persistent stats indexes
production charting libraries
ML/AI insight generation
broad cross-plugin query/read facade
app-shell Stats or Chart routes
scatter/timeline/stacked chart polish
```

---

## 21. Machine Learning Plugin

机器学习算法也通过 Plugin 接入。

### 21.1 ML Plugin 注册能力

```text
Algorithms:
ml.predict_remaining_time
ml.recommend_next_task
ml.detect_best_work_time
ml.detect_estimate_bias
ml.cluster_similar_tasks
ml.rank_today_tasks

Metadata:
ml.predicted_remaining_time
ml.prediction_confidence
ml.best_work_time
ml.estimate_bias_score

Events:
ml.prediction_generated
ml.recommendation_generated

Views:
ml.prediction_panel
ml.recommendation_card
ml.explanation_panel

Commands:
ml.run_prediction
ml.refresh_models
```

### 21.2 任务剩余时间预测

输入：

```text
task.estimate
timer.total_tracked_time
child task completion
tag history
similar task history
recent work velocity
Time Segment Notes
```

输出：

```text
预计剩余 6–9 小时
置信度 0.72
主要原因：
- 子任务完成 4/9
- 同类 #architecture 任务平均超时 35%
- 最近 Note 多次提到“重新设计插件架构”
```

### 21.3 哪一天做什么最高效

ML Plugin 可以分析：

```text
time segments
task tags
completion events
focus duration
task switching
time of day
habit completion
```

输出：

```text
上午更适合 #writing
晚上更适合 #architecture
下午容易发生任务切换
```

这些都作为插件输出。
Core 不包含算法逻辑。

---

## 22. AI Plugin

AI Plugin 通过 Command / View / Metadata 接入。

### 22.1 AI Plugin 注册能力

```text
Commands:
ai.cleanup_inbox
ai.turn_text_into_task
ai.suggest_tags
ai.suggest_due_date
ai.generate_subtasks
ai.generate_filter
ai.summarize_time_notes
ai.generate_weekly_review
ai.explain_prediction

Metadata:
ai.summary
ai.suggested_tags
ai.suggested_estimate

Events:
ai.suggestion_generated
ai.summary_generated

Views:
ai.suggestion_panel
ai.review_panel
```

### 22.2 快速收集箱 AI

用户输入：

```text
明天下午把计时插件的交互写完，属于产品设计
```

AI Plugin 建议：

```markdown
- [ ] 写完计时插件交互 #product #timer
```

Metadata 建议：

```text
task.scheduled = 明天下午
task.estimate = 1h
```

用户接受后，由 Task Plugin、Tag Plugin、Metadata 系统落地。

---

## 23. Filter Plugin

Filter 是 Core 数据类型，但 Filter 的高级能力由 Filter Plugin 扩展。

### 23.1 内置 Filter

插件可以注册默认 Filter：

```text
Task Plugin:
- All Tasks (current id task.filter.all-tasks)
- Today (current id task.filter.today)
- Done
- Overdue
- No Estimate

Habit Plugin:
- Habits
- Today Habits

Timer Plugin:
- Recently Worked
- Tracked Today
- Unnoted Sessions

Stats Plugin:
- Planning Review (deferred after TASK-028)
- Recently Stalled (deferred after TASK-028)
- Unnoted Sessions (deferred as a saved filter; `stats.unnoted-sessions-count` exists as an aggregation)

ML Plugin:
- Recommended Next Tasks
```

TASK-022 当前只交付 Task Plugin 的 All Tasks 和 Today 两个默认 filter：

```text
All Tasks:
  id: task.filter.all-tasks
  name: All Tasks
  viewType: page.list
  query: metadata.task.enabled eq true
  includes done tasks
  archived pages are excluded by execution/listing behavior

Today:
  id: task.filter.today
  name: Today
  viewType: page.list
  query:
    metadata.task.enabled eq true
    metadata.task.status neq "done"
    and (metadata.task.scheduled eq today or metadata.task.due eq today)
  date metadata valueType: date
  date metadata value: local YYYY-MM-DD string
```

`today` 在 filter query 中表示 `{ kind: "relative-date", value: "today" }`，当前测试通过注入 deterministic `currentDate` 固定本地日期。`page.list` 是当前 canonical list view type，保留 TASK-021 Tag Plugin saved filters 的兼容性。Task Plugin 同时注册 `task.page-list` view 和 `filter.empty_state` slot contribution；empty-state copy 是 generic page empty state，不是 task-only 文案。

### 23.2 JS Filter

JS Filter 是后续高级插件能力；TASK-022 没有执行任意 JavaScript。

示例：

```javascript
item.metadata.task?.enabled &&
item.metadata.task?.status !== "done" &&
item.metadata.tag?.tags?.includes("product") &&
item.aggregates.timer?.lastTrackedWithinDays <= 7
```

JS Filter 用来实现：

```text
系统存储的一切内容都可以被筛选
```

---

## 24. Quick Capture Plugin

快速收集箱也是 Plugin。TASK-029 当前交付的是 TypeScript built-in baseline，manifest id 是 `quick-capture`。它把 Markdown 捕获到 Quick Capture 自己标记的 Inbox Page，不是 app-shell 级完整弹窗、不是 native/global shortcut 集成，也不会自动执行 Task / Tag 语义处理。

### 24.1 注册能力

```text
Plugin id:
quick-capture

Commands:
quick-capture.open
quick-capture.save
quick-capture.save-and-open

Views:
quick-capture.modal
quick-capture.mobile-input

Metadata:
quick-capture.unprocessed
  namespace: quick-capture
  key: unprocessed
  valueType: boolean

Filters:
quick-capture.filter.inbox
  name: Inbox
  viewType: page.list
  query: metadata.quick-capture.unprocessed eq true
```

`quick-capture.modal` 和 `quick-capture.mobile-input` 当前都是 labelled `region` + labelled `textarea` baseline。`quick-capture.modal` 不声明真正的 `dialog` 语义；focus containment、close/save controls、app-shell modal mounting 和 route polish 仍是后续工作。

### 24.2 捕获行为

`quick-capture.open` 只返回打开 Quick Capture baseline view 所需的窄 DTO：

```ts
{ kind: "quick-capture.open-result", viewId: "quick-capture.modal" }
```

`quick-capture.save({ markdown })` 接受 bounded nonblank Markdown string。首次保存创建 title 为 `Inbox` 的 Markdown Page，并写入 `quick-capture.unprocessed = true` metadata；后续保存只会复用这个经过 Quick Capture metadata 标记且未 archived 的 trusted Inbox。若用户已有一个 title-only `Inbox` 页面但没有 Quick Capture metadata，Quick Capture 不会隐式接管它，而是创建自己的 trusted Inbox。

返回值：

```ts
{
  kind: "quick-capture.save-result";
  pageId: string;
  createdInbox: boolean;
  appendedBlockIds: string[];
}
```

`quick-capture.save-and-open({ markdown })` 使用同一保存语义，并额外返回 `openPageId: pageId`。它不负责导航，不调用 native shortcut、filesystem、notification、DB 或 opener 能力。

输入：

```markdown
- [ ] 整理 plugin registry 设计 #architecture
```

保存后 Markdown 作为 inert structured text 进入 trusted Inbox。Quick Capture 不自动创建 Task page、不写 Task metadata/event，也不自动刷新 Tag metadata。Task / Tag handoff 必须通过公开命令显式完成，例如：

```text
tag.refresh-tags({ pageId })
task.resolve-task-block({ sourcePageId, sourceBlockId })
task.open-task-page({ sourcePageId, sourceBlockId })
```

这保证 Quick Capture 只负责收集 Markdown，Task / Tag 业务仍归各自插件所有。

### 24.3 桌面端

桌面快速入口和全局快捷键已经在 TASK-029 中完成文档和安全影响 review，但实际 native/global shortcut 接入被推迟。当前没有新增 Tauri permission/capability、package、Rust、schema、filesystem、notification、window/tray 或 generated-permission 变更。

### 24.4 移动端

TASK-029 当前只注册 `quick-capture.mobile-input` view baseline。把它挂到移动端 toolbar、自动弹键盘、以及提供完整移动输入流程仍是后续 app-shell / editor integration。

长期工具栏目标仍是：

```text
☐   #   @date   [[ ]]   /
```

这些按钮只插入 Markdown 语法；TASK-029 没有实现 Quick Capture mobile toolbar buttons。

---

## 25. Search Plugin

Search Plugin 是内置插件，manifest id 是 `search`。TASK-029 当前交付的是 transient on-demand page scan baseline，不是 persistent indexer、worker、SQLite/FTS 或 native search service。

### 25.1 注册能力

```text
Plugin id:
search

Command:
search.query

View / data kind:
search.results
```

### 25.2 查询行为

`search.query({ query, limit? })` 对未 archived 的 Markdown Page title 和 structured body text 做 case-insensitive literal substring scan。空白 query 返回空结果；regex-looking input 仍按普通文本处理。

返回值：

```ts
{
  kind: "search.results";
  query: string;
  results: Array<{
    pageId: string;
    title: string;
    snippet: string;
    matchedFields: Array<"title" | "body">;
  }>;
}
```

当前边界：

```text
default limit: 20
max results: 50
max query length: 200
max scanned pages: 1,000
max scanned body text per page: 50,000 chars
max returned title length: 200 chars
max snippet length: 160 chars
```

Search results 不返回完整页面正文。后续 page edit 会被下一次 `search.query` 看到，因为当前实现每次查询都直接扫描当前 page store，而不是读取持久索引。

### 25.3 结果视图

`search.results` view 渲染：

```text
role=status summary
aria-label="Search results" list
listitem per result
```

title、snippet 和 matched fields 都通过 React text sinks 显示；unsafe-looking HTML、Markdown 或 `javascript:` 文本不会执行。

### 25.4 Deferred

以下能力不属于 TASK-029：

```text
persistent Search indexing
background search indexer / worker
SQLite FTS
package/dependency changes
native/Tauri/Rust/schema/capability changes
app-shell search route and command-palette polish
cross-plugin query facade
ranking beyond current page-list scan order
```

---

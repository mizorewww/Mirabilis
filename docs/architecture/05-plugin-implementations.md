# 核心插件实现架构

描述 Tag、Timer、Habit、Heatmap、Stats、Chart、Quick Capture、Search、ML 和 AI 插件在代码层的目录与注册方式。

TASK-010 当前 `PluginContext` 暴露 `pages`、`metadata`、`events`、`filters`、`commands`、`views`、`slots` 和 `transaction`。
只有 `commands`、`views`、`slots` 有当前 plugin-facing `register/get/list` facade；metadata fields、event types、indexers、algorithms、mobile toolbar items 和 settings panels 目前是 manifest contribution descriptor。
插件调用 plugin-facing APIs 时不传 `pluginId` 或 `sourcePluginId`；Plugin Host 根据当前插件身份注入 ownership。

## 10. Tag Plugin 代码架构

TASK-021 当前实现内置 `TagPlugin`，代码位于 `src/plugins/tag/`，并通过 `BUILT_IN_PLUGINS` 显式加载。它不增加 native/Tauri/package/Cargo/capability surface。

```text
plugins/tag/
  plugin.ts
  components/
    TagMetadataSlot.tsx
```

### 10.1 Tag Plugin 注册内容

当前 manifest 和 runtime registration：

```ts
export const TagPlugin: AppPlugin = {
  manifest: {
    id: "tag",
    contributes: {
      markdownSyntax: [
        {
          id: "tag.hashtag",
          name: "Hashtag",
          syntax: "#tag"
        }
      ],
      metadataFields: [
        {
          id: "tag.tags",
          namespace: "tag",
          key: "tags",
          valueType: "json"
        }
      ]
    }
  },
  register(ctx) {
    ctx.commands.register({ id: "tag.refresh-tags", handler: refreshTags });
    ctx.commands.register({ id: "tag.add-tag", handler: addTag });
    ctx.commands.register({ id: "tag.remove-tag", handler: removeTag });
    ctx.commands.register({ id: "tag.create-filter", handler: createTagFilter });
    ctx.slots.register({
      id: "tag.page-header-metadata.tags",
      slot: "page.header.metadata",
      order: 300,
      component: TagMetadataSlot
    });
  }
};
```

`tag.hashtag` 和 `tag.tags` 是 manifest descriptors。它们不会创建 rich inline tokens、autocomplete、automatic save-time scanning 或 indexer。TASK-022 后，Tag Plugin saved filters that use `viewType: "page.list"` can run through the generic page/metadata executor and registered `page.list` view path; Tag Plugin itself still only saves the filter definition.

### 10.2 Tag commands

`tag.refresh-tags({ pageId })` explicitly scans saved top-level `markdown.line` blocks. It ignores headings, fenced code, escaped hashes, URL-ish invalid source tokens, non-ASCII/control-ish tokens, and HTML-like fragments. It replaces `tag.tags` exactly with current source tags, or `[]`.

`tag.add-tag({ pageId, tag })` and `tag.remove-tag({ pageId, tag })` update page-scoped metadata through command-time `PluginContext`. Removing on a touched page writes an explicit empty `[]` when no tags remain.

Tag normalization is deliberately conservative:

```text
trim input
strip at most one leading #
raw input must match ASCII slug before lowercasing
first char: ASCII letter/digit
remaining chars: ASCII letter/digit/_/-
normalized value: lowercase, no #, max 32 chars
page limit: first 32 unique tags, first-seen order
```

Non-ASCII values such as `K` are rejected instead of being Unicode case-folded.

### 10.3 Tag metadata slot and filter definition

`TagMetadataSlot` is a narrow `page.header.metadata` contribution. It displays inert tag text and local add/remove controls that execute `tag.add-tag` / `tag.remove-tag` with exact `{ pageId, tag }` payloads. TASK-023 composes this existing contribution through `MetadataBar`, but the full tag picker polish and generic metadata field editor registry remain deferred.

`tag.create-filter({ tag })` saves a plugin-owned filter definition:

```json
{
  "name": "#tag",
  "query": {
    "where": [
      { "field": "metadata.tag.tags", "op": "includes", "value": "tag" }
    ]
  },
  "viewType": "page.list"
}
```

TASK-022 delivers compatible generic `page.list` execution/rendering for this saved filter shape. `tag.create-filter` still does not own app-shell navigation, automatic refresh, or a tag-specific result renderer.

## 11. Timer Plugin 代码架构

Timer Plugin 是另一个核心插件。

TASK-025 当前实现的文件范围仍集中在 TypeScript Timer Plugin 和 Plugin Host/MetadataBar command boundary：

```text
src/plugins/timer/
  index.ts
  plugin.ts
  components/
    TimerMetadataPlaceholder.tsx
```

长期目录可能继续扩展为：

```text
plugins/timer/
  src/
    manifest.ts
    plugin.ts
    commands/
      startTimer.ts
      stopTimer.ts
      pauseTimer.ts
      resumeTimer.ts
      switchTimer.ts
      addSegmentNote.ts
      createManualSegment.ts
    metadata/
      timerFields.ts
      timerMetadataSlot.tsx
    events/
      timerEventTypes.ts
    views/
      ActiveTimerBar.tsx
      TimeSegmentTimeline.tsx
      TimeSegmentDetailView.tsx
    slots/
      GlobalTimerSlot.tsx
      PageTimerActionSlot.tsx
      PageTimelineSlot.tsx
    filters/
      recentlyWorked.ts
      trackedToday.ts
      unnotedSessions.ts
    indexers/
      timerIndexer.ts
    store/
      activeTimerStore.ts
```

### 11.1 Timer Plugin 注册内容

Timer manifest 长期会声明 metadata fields、event types、default filters 和 indexers 等 descriptor。
TASK-025 当前注册 canonical Timer commands、metadata Start control、global active bar 和 page timeline segment slot。它不注册 timer metadata writers、indexers、native/Tauri commands 或 schema-backed persistence。

```ts
export const TimerPlugin: AppPlugin = {
  manifest: {
    id: "timer",
    name: "Timer Plugin",
    version: "1.0.0",
    description: "Track one active timer through plugin-owned runtime state.",
    minAppVersion: "0.1.0"
  },

  register(ctx) {
    ctx.commands.register({ id: "timer.start", title: "Start timer", handler: startTimer });
    ctx.commands.register({ id: "timer.stop", title: "Stop timer", handler: stopTimer });
    ctx.commands.register({ id: "timer.pause", title: "Pause timer", handler: pauseTimer });
    ctx.commands.register({ id: "timer.resume", title: "Resume timer", handler: resumeTimer });
    ctx.commands.register({ id: "timer.switch", title: "Switch timer", handler: switchTimer });
    ctx.commands.register({ id: "timer.add-note", title: "Add time segment note", handler: addTimeSegmentNote });

    ctx.slots.register({
      id: "timer.page-header-metadata.placeholder",
      slot: "page.header.metadata",
      order: 400,
      component: TimerMetadataPlaceholder
    });

    ctx.slots.register({
      id: "timer.global-active-bar",
      slot: "global.floating",
      order: 100,
      component: TimerGlobalActiveBar
    });

    ctx.slots.register({
      id: "timer.page-timeline.segments",
      slot: "page.timeline",
      order: 100,
      component: TimerPageTimeline
    });
  }
};
```

The one global active timer is plugin-owned, registration-scoped, in-memory runtime state created inside `TimerPlugin.register(ctx)`. It is not Core-owned state, not a NativeBridge/Tauri surface, not persistent, and not schema-backed.

### 11.2 Timer command contract

Current commands:

- `timer.start({ pageId })`
- `timer.stop()` / exact empty payload
- `timer.pause()` / exact empty payload
- `timer.resume()` / exact empty payload
- `timer.switch({ pageId })`
- `timer.add-note({ segmentId, markdown })`

`timer.start` and `timer.switch` validate exact payload shape and page existence. Extra keys, missing `pageId`, non-string/blank `pageId`, missing pages, caller-supplied segment/time/event fields, accessors, symbol keys, non-enumerable keys, prototype-carried fields, arrays, class instances, and unsafe `__proto__` / `constructor` / `prototype` keys are rejected. Non-empty null-prototype page payloads are rejected; exact null-prototype empty payloads are allowed only for empty-payload commands.

`timer.pause`、`timer.resume` 和 `timer.stop` accept `undefined`, `{}`, or an exact null-prototype empty object. Non-empty, prototype-shaped, accessor, symbol-keyed, non-enumerable, or caller-owned unsafe payloads are rejected.

Command results are narrow DTOs:

```ts
type TimerCommandResult = {
  activeTimer: TimerDto | null;
  createdSegment?: TimeSegmentDto;
  stoppedTimer?: TimerDto;
};

type TimerDto = {
  elapsedSeconds: number;
  pageId: string;
  pageTitle: string;
  segmentId: string;
  startedAt: string;
  status: "running" | "paused" | "stopped";
  stoppedAt?: string;
};

type TimeSegmentDto = {
  durationSeconds: number;
  endAt: string;
  pageId: string;
  segmentId: string;
  source: "timer";
  startAt: string;
  notePageId?: string;
};

type TimerNoteResult = {
  notePageId: string;
};
```

DTOs do not expose runtime, store, transaction, registry, event, metadata, NativeBridge, filesystem, DB, stack, token, or handler surfaces.

### 11.3 Start / Pause / Resume / Stop / Switch

用户点击页面顶部：

```text
Start
```

UI 执行：

```ts
runtime.commands.execute("timer.start", { pageId });
```

Timer Plugin appends events with namespace `timer` and simple type names:

```text
started
paused
resumed
stopped
time_segment_created
time_segment_note_added
```

`timer.started` event payload uses `startAt`; active/stopped DTOs use `startedAt`. Pause/resume/stop event payloads use `pausedAt` / `resumedAt` / `stoppedAt` and elapsed seconds.

Current state transitions:

- `timer.start({ pageId })` starts a running active timer for the page and appends `timer.started`.
- If another timer is active, `timer.start({ pageId })` first appends `timer.stopped` for the previous timer, then appends `namespace: "timer"` / `type: "time_segment_created"` for that stopped timer, then appends `timer.started` for the new timer, and returns `{ activeTimer, stoppedTimer, createdSegment }`. Same-page start is treated as stop then restart.
- `timer.pause()` requires a running active timer, freezes elapsed time, appends `timer.paused`, and returns `{ activeTimer }`.
- `timer.resume()` requires a paused active timer, resumes elapsed time, appends `timer.resumed`, and returns `{ activeTimer }`.
- `timer.stop()` requires a running or paused active timer, appends `timer.stopped`, then appends `time_segment_created`, clears active state, and returns `{ activeTimer: null, stoppedTimer, createdSegment }`.
- `timer.switch({ pageId })` stops the previous active timer, appends its `time_segment_created`, then starts the next page timer. It supports no-active, paused, and same-page cases. If the target page is missing, active state and events are preserved.
- `timer.add-note({ segmentId, markdown })` requires a known stopped Time Segment, creates or updates a Markdown Page note, appends `time_segment_note_added`, and returns `{ notePageId }`. It rejects the active timer's segment id and does not mutate the original `time_segment_created` event.

`time_segment_created` payloads use camelCase `segmentId`, `pageId`, `startAt`, `endAt`, `durationSeconds`, and `source: "timer"`; absent optional fields are omitted. Pause/resume accounting excludes paused duration from `durationSeconds`.

`timer.global-active-bar` reads the registration-scoped active timer store and renders active page title, visible elapsed time, and Pause / Resume / Stop controls. The controls execute exactly `timer.pause`, `timer.resume`, and `timer.stop` with `{}` through Timer-scoped functions. The metadata Start control executes `timer.start` through the descriptor-owned scoped command executor passed by `MetadataBar`.

`timer.page-timeline.segments` reads Timer-owned `time_segment_created` and `time_segment_note_added` events for the current page, renders segment and Note text inertly, and exposes accessible Add Note / Edit Note controls. Saving a note executes `timer.add-note` through the internal Timer scoped executor.

The internal scoped executor authorizes by registered command descriptor ownership (`descriptor.pluginId === "timer"` for Timer UI), not by command id prefix. Known residual P2: this internal channel uses globally discoverable `Symbol.for("mirabilis.internal.pluginScopedCommandExecutor")` and is duplicated between Plugin Host and Timer; descriptor-owner checks protect execution, but future API cleanup should replace the hidden symbol channel.

No production fake-clock/global timer monkeypatch, eval, `Function(...)`, string timer handler, or broad active-bar command execution behavior belongs in Timer production code. The Vitest-only fake timer cleanup compatibility shim lives in `src/test/setup.ts`.

### 11.4 Time Segment and Note current slice

TASK-025 implements the narrow event/page slice:

- Timer finalization through `timer.stop`, active `timer.start`, or active `timer.switch` appends `namespace: "timer"`, `type: "time_segment_created"`.
- `timer.stopped` remains before the segment creation event where an active timer is finalized.
- Time Segment Note remains a Markdown Page. `timer.add-note` creates the page on first save, updates the same page on later saves, and appends `namespace: "timer"`, `type: "time_segment_note_added"`.
- The original segment event remains immutable; timeline data derives the latest note page from note-link events.
- `timer.page-timeline.segments` is the current page timeline contribution. It filters to current-page Timer-owned events and ignores malformed, wrong-owner, wrong-page, or unreadable note data.

Still deferred: `timer.total_tracked_time`, `timer.last_tracked_at`, `timer.active_segment_id` metadata, Calendar app-shell feed/routing, Timer-to-Stats feed normalization, trusted/persistent ML feed integration, Recently Worked / Unnoted Sessions saved filters, manual segment editing, calendar drag/drop, app-shell broad mounting, native persistence, schema changes, and Tauri/package/Rust/native changes.

### 11.5 Calendar Plugin baseline

TASK-026 adds the first built-in Calendar Plugin slice:

```text
src/plugins/calendar/
  index.ts
  plugin.ts
```

Calendar registration is intentionally small:

```ts
export const CalendarPlugin: AppPlugin = {
  manifest: {
    id: "calendar",
    name: "Calendar Plugin",
    version: "1.0.0"
  },
  register(ctx) {
    ctx.views.register({
      id: "calendar.day",
      type: "calendar.day",
      title: "Calendar day",
      accepts: { kind: "calendar.time-segments" }
    });
    ctx.views.register({
      id: "calendar.week",
      type: "calendar.week",
      title: "Calendar week",
      accepts: { kind: "calendar.time-segments" }
    });
    ctx.commands.register({
      id: "calendar.open-time-segment",
      title: "Open time segment"
    });
  }
};
```

Calendar views consume explicit normalized DTOs supplied by a caller or view host:

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

This is not a direct Timer event read path. Calendar does not import Timer internals, raw runtime stores, PluginHost, NativeBridge, Tauri APIs, markdown renderers, or HTML sinks. It does not call the plugin-facing event facade to query Timer-owned events. A future cross-plugin query/read facade must be reviewed before Calendar can read Timer events directly.

Current behavior:

- `calendar.day` and `calendar.week` render accessible regions and native buttons.
- Time ranges are displayed in UTC.
- Date/week selection uses UTC date-only props; tests should pass explicit dates or set the clock when relying on the current UTC date default.
- Segments are shown by interval overlap, so carryover segments that start before the selected day/week still render if they overlap the range.
- Clicking a block executes `calendar.open-time-segment({ segmentId, pageId })` and renders inert read-only detail text.
- DTO and command inputs fail closed for malformed, wrong-owner, extra-field, accessor, symbol, prototype-carried, and non-enumerable shapes.
- Command validity is scoped to the current `register(ctx)` runtime and to currently mounted/visible segments; unmount clears visibility.

Deferred after TASK-026: `calendar.month`, manual segment creation/editing, snake_case aliases, app-shell route/navigation, drag/drop editing, broad cross-plugin event query/read facade, Timer metadata totals, Stats app-shell/feed integration, ML/Habit/Task scheduled feeds, external calendar sync, native/Tauri/package/Rust/schema changes, strict UTC `Z`-only and duration-match validation, and stale detail clearing after data/date/week changes.

---

## 12. Habit / Heatmap 插件架构

### 12.1 Habit Plugin

```text
src/plugins/habit/
  index.ts
  plugin.ts
```

TASK-027 当前 Habit Plugin 只提供 daily habit 数据语义：manifest descriptors、command handlers、Habit-owned metadata/events 和 default filters。它不提供 Habit list/card view、不挂载 app-shell route、不桥接 Task checkbox，也不改 native/Tauri/package/Rust/schema surface。

```ts
export const HabitPlugin: AppPlugin = {
  manifest: {
    id: "habit",
    name: "Habit Plugin",
    version: "1.0.0",
    contributes: {
      markdownSyntax: [
        { id: "habit.hashtag", name: "Habit hashtag", syntax: "#habit" }
      ],
      metadataFields: [
        { id: "habit.enabled", namespace: "habit", key: "enabled", valueType: "boolean" },
        { id: "habit.frequency", namespace: "habit", key: "frequency", valueType: "string" },
        { id: "habit.lastCheckedAt", namespace: "habit", key: "lastCheckedAt", valueType: "date" },
        { id: "habit.nextDue", namespace: "habit", key: "nextDue", valueType: "date" }
      ]
    }
  },
  register(ctx) {
    ctx.commands.register({ id: "habit.refresh-habit", title: "Refresh habit" });
    ctx.commands.register({ id: "habit.check-today", title: "Check today" });
    ctx.commands.register({ id: "habit.uncheck-today", title: "Uncheck today" });
    ctx.commands.register({ id: "habit.set-frequency", title: "Set frequency" });
  }
};
```

`habit.refresh-habit({ pageId })` recognizes valid `#habit` syntax in title or saved `markdown.line` body and writes:

```text
namespace habit/key enabled/value true/valueType boolean
namespace habit/key frequency/value daily/valueType string
namespace habit/key nextDue/value local YYYY-MM-DD/valueType date
```

`habit.check-today({ pageId })` and `habit.uncheck-today({ pageId })` require an exact `{ pageId }` payload and a trusted Habit page. Completion appends Habit-owned events with split namespace/type:

```text
namespace: habit
type: checked | unchecked
payload: { habitPageId, date }
```

`habit.set-frequency({ pageId, frequency: "daily" })` is the only accepted frequency change in this slice. `habit.target`, `habit.streak`, skipped events, weekly/monthly recurrence, snake_case command aliases, Task checkbox auto-bridge, Habit Review, Habit card/list UI, automatic Stats/ML/Calendar feeds, and persistence/native changes remain deferred.

Current filters:

```text
habit.filter.habits
  name: Habits
  viewType: page.list
  query: metadata.habit.enabled eq true

habit.filter.today-habits
  name: Today Habits
  viewType: page.list
  query:
    metadata.habit.enabled eq true
    metadata.habit.frequency eq daily
    and (metadata.habit.nextDue eq today or metadata.habit.nextDue lt today)
```

The `lt today` branch exists because the current filter executor has no `lte` operator.

### 12.2 Heatmap Plugin

Heatmap 是独立 View Plugin。

```text
src/plugins/heatmap/
  index.ts
  plugin.ts
```

Heatmap Plugin 注册通用 heatmap view：

```ts
ctx.views.register({
  id: "heatmap.calendar",
  type: "heatmap",
  title: "Heatmap calendar",
  component: HeatmapView,
  accepts: {
    kind: "heatmap.date-series"
  }
});
```

Current DTO shape:

```ts
type HeatmapDateSeriesData = {
  kind: "heatmap.date-series";
  rows: readonly HeatmapDateSeriesRow[];
};

type HeatmapDateSeriesRow = {
  count: number;
  date: string;
  label: string;
  sourcePluginId: string;
  source: {
    namespace: string;
    sourcePluginId: string;
    type: string;
  };
};
```

Heatmap consumes normalized DTOs supplied by a caller or view host. It does not import Habit internals, does not read Habit events through `ctx.events`, and does not know what a habit or timer is. A caller/view host may normalize public Habit `namespace: "habit"` / `type: "checked" | "unchecked"` events into `heatmap.date-series` rows; that adapter is not inside Heatmap in TASK-027.

Rows fail closed when malformed, wrong-owner, extra-field, accessor, symbol-keyed, prototype-carried, non-enumerable, non-date-only, non-positive count, or mismatched source/sourcePluginId. Rendering uses inert React text and native buttons.

---

## 13. Stats / Chart / Quick Capture / Search / ML 插件架构

### 13.1 Stats Plugin

Stats Plugin 负责聚合 normalized reporting DTO。Stats 是内置插件，不是 Core 业务逻辑。

```text
src/plugins/stats/
  index.ts
  plugin.ts
```

Stats Plugin 通过 manifest descriptor 声明 aggregation。
TASK-028 当前没有 executable AlgorithmRegistry；这些 descriptor 是 inert metadata。runtime 执行入口是 Command Registry 中的 `stats.run-aggregation`。

```ts
export const statsManifest: PluginManifest = {
  id: "stats",
  name: "Stats Plugin",
  version: "1.0.0",
  minAppVersion: "0.1.0",
  contributes: {
    algorithms: [
      {
        id: "stats.sum-time-by-tag",
        name: "Sum time by tag"
      }
    ]
  }
};
```

当前 canonical aggregation ids：

```text
stats.sum-time-by-tag
stats.sum-time-by-page
stats.estimate-vs-actual
stats.habit-completion-rate
stats.task-switch-count
stats.unnoted-sessions-count
```

当前 command：

```ts
ctx.commands.register({
  id: "stats.run-aggregation",
  title: "Run aggregation",
  handler: runAggregation
});
```

`stats.run-aggregation({ aggregationId, input })` 只接受匹配 aggregation 的 input kind：

```text
stats.time-by-tag-input
stats.time-by-page-input
stats.estimate-vs-actual-input
stats.habit-completion-input
stats.task-switch-count-input
stats.unnoted-sessions-input
```

Stats 输入来自调用方或 view host 准备的公开 DTO 投影，例如 Timer `time_segment_created` / `time_segment_note_added` events、Tag metadata、Task estimate metadata、Habit checked/unchecked events 和 habit summary。Stats 不读取 Timer/Habit/Task/Tag private data，不直接访问其他插件 store，也不在 Core 中放置统计业务逻辑。

输出使用 Chart DTO：

```text
time by tag -> chart.category-series
time by page -> chart.category-series
estimate vs actual -> chart.comparison-series
habit completion -> chart.category-series
task switching -> chart.category-series
unnoted sessions -> chart.category-series
```

Trust boundary:

- `stats.run-aggregation` payload 必须是 exact plain data。
- Arrays 会先通过 descriptor inspection 复制成 inert plain arrays；accessor、symbol key、prototype-carried、non-enumerable、sparse、custom iterator 和 caller-overridden array method 都 fail closed。
- Top-level Stats arrays 当前最多 1,000 items。
- Labels/ids/titles 必须是 bounded trusted strings；numeric values 必须 finite 且 magnitude capped。
- Timer/Tag/Task/Habit DTO rows 必须带匹配 `sourcePluginId`、`namespace`、`type` 和 provenance；伪造 owner 或 malformed row 被忽略。

Stats dashboard、insight card views、saved filters、persistent indexes、ML/AI insight generation、broad cross-plugin query facade 和 app-shell routes 仍是后续范围。

### 13.2 Chart Plugin

Chart Plugin 负责 generic chart DTO 的可访问渲染。Chart 是内置插件，不是 Stats 子模块，也不查询 Stats internals。

```text
src/plugins/chart/
  index.ts
  plugin.ts
```

Chart Plugin 注册：

```ts
ctx.views.register({
  id: "chart.bar",
  type: "chart.bar",
  title: "Bar chart",
  component: BarChartView,
  accepts: { kinds: ["chart.category-series", "chart.comparison-series"] }
});
```

当前 registered views：

```text
chart.bar: accepts chart.category-series and chart.comparison-series
chart.line: accepts chart.time-series
chart.pie: accepts chart.category-series
```

当前 Chart DTO kinds：

```text
chart.category-series
chart.time-series
chart.comparison-series
```

Chart baseline 使用 React text/table/list/status markup，提供 loading (`role="status"`, `aria-busy`) 和 empty state (`No chart data`)。Comparison chart table exposes `Label`, `Expected`, `Actual`, `Delta`, and `Error` headers. TASK-028 没有生产 charting-library dependency，也没有 SVG/canvas geometry contract。

Trust boundary:

- DTO 必须是 exact plain object，rows 必须是 bounded inert plain arrays。
- Chart rows 当前最多 200 items。
- Labels/ids/titles 和 numeric magnitudes 使用同一类 trusted string / finite magnitude cap。
- Invalid DTOs fail closed to empty chart state。
- Chart 不执行 HTML、Markdown 或 caller-provided rendering code。

Production charting libraries、scatter/timeline/stacked chart polish、dashboard route integration 和 cross-plugin data query 仍是后续范围。

### 13.3 Quick Capture / Search Plugin

Quick Capture 和 Search 是 TASK-029 当前新增的 built-in TypeScript plugins，不是 Core 功能，也没有新增 native/Tauri/package/Cargo/capability/schema surface。

```text
src/plugins/quick-capture/
  index.ts
  plugin.ts

src/plugins/search/
  index.ts
  plugin.ts
```

Quick Capture runtime registration:

```text
manifest id: quick-capture
commands:
  quick-capture.open
  quick-capture.save
  quick-capture.save-and-open
views:
  quick-capture.modal
  quick-capture.mobile-input
metadata field:
  quick-capture.unprocessed
filter:
  quick-capture.filter.inbox
```

`quick-capture.save({ markdown })` imports bounded nonblank Markdown into structured `markdown.line` blocks, then creates or appends to a trusted plugin-marked title `Inbox` page inside a plugin transaction. Trust comes from `namespace: "quick-capture"`, `key: "unprocessed"`, `value: true`; title-only user Inbox pages are not adopted. The saved Markdown remains inert structured text. Quick Capture does not import Task/Tag internals and does not auto-create Task/Tag pages, metadata, or events; callers must explicitly run public commands such as `tag.refresh-tags`, `task.resolve-task-block`, or `task.open-task-page` for handoff.

The current Quick Capture views render labelled `region` + labelled `textarea` baselines. Real app-shell modal semantics, focus/close behavior, mobile toolbar mounting, native/global shortcuts, notifications, filesystem access, and Tauri permissions are deferred.

Search runtime registration:

```text
manifest id: search
command:
  search.query
view/data kind:
  search.results
```

`search.query({ query, limit? })` validates exact plain payload data, trims blank queries to no results, and performs bounded case-insensitive literal substring scans over unarchived page titles and structured body text. It returns `{ kind: "search.results", query, results }` with capped result count, title, snippet, scanned page count, and body text length. Search results do not include full page bodies. The `search.results` view validates DTOs, renders a `role="status"` summary plus list/listitem output, and uses inert React text.

Persistent Search indexing, background search indexer / worker, SQLite FTS, ranking, app-shell Search route/command-palette polish, and native/package/Rust/schema changes remain deferred.

### 13.4 Machine Learning Plugin

ML Plugin 负责 ML/prediction behavior；Core 不包含 ML business logic。TASK-030 当前只交付 TypeScript app-runtime baseline prediction，plugin id 是 `ml`。

```text
src/plugins/ml/
  algorithms/
    predictRemainingTime.ts
  features/
    buildRemainingTimeFeatures.ts
  views/
    PredictionPanel.tsx
  index.ts
  plugin.ts
```

Canonical TASK-030 ids:

```text
algorithm descriptor: ml.predict-remaining-time
runtime command: ml.run-prediction
input kind: ml.remaining-time-prediction-input
result kind: ml.remaining-time-prediction
view/type: ml.prediction-panel
slot contribution: ml.page-sidebar.prediction-panel -> page.sidebar.panel
metadata descriptors: ml.predictedRemainingTime, ml.predictionConfidence
event descriptor: ml.prediction-generated
```

`ml.predict-remaining-time` 是 inert manifest descriptor。TASK-030 没有 executable AlgorithmRegistry、runtime algorithm handler、worker, model storage, model training, or background refresh. Runtime execution goes through Command Registry:

```ts
runtime.commands.execute("ml.run-prediction", {
  algorithmId: "ml.predict-remaining-time",
  input: {
    kind: "ml.remaining-time-prediction-input",
    pageId,
    generatedAt,
    pages,
    metadata,
    events
  }
});
```

The input is exact bounded caller-provided page/metadata/event projections. ML validates plain-object/plain-array shape, bounds, exact UTC instants, numeric magnitude, current-page presence, and trusted provenance fields in those projections. It does not import Task/Timer/Tag/Habit/Stats internals and does not read sibling plugin private stores or facades.

`ml.run-prediction` returns a deterministic `ml.remaining-time-prediction` DTO only. It does not persist ML metadata/events from caller-provided projections in TASK-030. The manifest still declares `ml.predictedRemainingTime`, `ml.predictionConfidence`, and `ml.prediction-generated` so ownership ids are reserved for future trusted write paths; durable prediction records are deferred until a trusted query/feed/projection source exists.

Baseline model:

```text
baselineTotalSeconds =
  task estimate
  or similar completed task average
  or max(trackedSeconds * 2, 3600)

remaining =
  max(0, baselineTotalSeconds - trackedSeconds)
  optionally capped by child task completion ratio

confidence =
  heuristic evidence score starting at 0.35
  + estimate/tracking/child/similar-history evidence
  clamped to 0.90
```

This confidence is not trained/calibrated model confidence. Insufficient trusted evidence returns a low-confidence unavailable DTO with limitations.

ML Panel registers both a view and slot contribution:

```ts
ctx.views.register({
  id: "ml.prediction-panel",
  type: "ml.prediction-panel",
  accepts: { kind: "ml.remaining-time-prediction" },
  component: PredictionPanel
});

ctx.slots.register({
  id: "ml.page-sidebar.prediction-panel",
  slot: "page.sidebar.panel",
  component: PredictionPanel
});
```

`PredictionPanel` validates runtime DTOs before rendering and fails closed to an inert unavailable state for wrong-kind, malformed, forged, or unbounded data. It renders through React text sinks and avoids Markdown/HTML/code execution sinks.

Deferred after TASK-030:

```text
executable AlgorithmRegistry / runtime algorithm handler
trusted cross-plugin query/feed facade
persistent prediction metadata/events and model refresh
recommendation / best work time / estimate bias / clustering / ranking
AI explanation
app-shell/sidebar mounting polish
network/filesystem/workers/model storage/training/background jobs
native/package/Rust/schema/Tauri capability changes
```

---

## 14. AI Plugin 架构

```text
plugins/ai/
  src/
    manifest.ts
    plugin.ts
    providers/
      modelProvider.ts
      openAIProvider.ts
    commands/
      cleanupInbox.ts
      generateSubtasks.ts
      suggestMetadata.ts
      generateFilter.ts
      summarizeTimeNotes.ts
      explainPrediction.ts
    tools/
      pageTool.ts
      metadataTool.ts
      eventTool.ts
      filterTool.ts
    views/
      AiSuggestionPanel.tsx
      AiReviewPanel.tsx
```

AI Plugin 注册命令：

```ts
ctx.commands.register({
  id: "ai.generate-subtasks",
  title: "Generate subtasks",
  handler: generateSubtasks
});
```

用户在任务页点击 AI 拆解：

```text
AI 读取当前 Markdown Page
AI 输出 Markdown：
- [ ] 子任务 A
- [ ] 子任务 B
- [ ] 子任务 C
插入当前页面
Task Plugin 自动识别子任务
```

AI 不直接创建任务。
AI 生成 Markdown-ish 内容。
Task Plugin 负责解释 `- [ ]`。

---

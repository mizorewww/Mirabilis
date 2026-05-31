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

TASK-041 keeps that plugin baseline intact and adds an app-shell Search consumer: the top-bar MUI `Dialog` executes only active search-owned `search.query` with exact `{ query }`, copies a valid result into a shell-owned bounded results route DTO, renders route rows as inert text/buttons, validates that a selected page still exists, and then navigates through normal page route state. App Shell must not import Search plugin private modules, store full page bodies, or pass raw runtime objects through Search route state.

Persistent Search indexing, background search indexer / worker, SQLite FTS, ranking beyond existing plugin behavior, native/global Search shortcuts, command-palette search polish beyond the current top-bar dialog/results route, and native/package/Rust/schema changes remain deferred.

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
ML-native explanation beyond TASK-031 ai.explain-prediction advisory command
app-shell/sidebar mounting polish
network/filesystem/workers/model storage/training/background jobs
native/package/Rust/schema/Tauri capability changes
```

## 14. AI Plugin 架构

AI Plugin 负责 AI/provider behavior；Core 不包含 AI business logic、OpenAI model/prompt details、provider settings, network code, or secret handling. TASK-031 当前只交付 TypeScript app-runtime provider abstraction baseline，plugin id 是 `ai`。

```text
src/plugins/ai/
  index.ts
  plugin.ts
  settings.ts
  test-support.ts
  providers/
    modelProvider.ts
    openAIProvider.ts
  views/
    AiSuggestionPanel.tsx
    AiReviewPanel.tsx
```

Canonical TASK-031 ids:

```text
commands:
  ai.cleanup-inbox
  ai.turn-text-into-task
  ai.suggest-tags
  ai.suggest-due-date
  ai.generate-subtasks
  ai.generate-filter
  ai.summarize-time-notes
  ai.generate-weekly-review
  ai.explain-prediction

views/types:
  ai.suggestion-panel
  ai.review-panel

metadata descriptors:
  ai.summary
  ai.suggestedTags
  ai.suggestedEstimate

event descriptors:
  ai.suggestion-generated
  ai.summary-generated

settings descriptor:
  ai.provider-settings

provider id:
  openai
```

All current AI ids are kebab-case or camelCase where shown above. Stale underscore ids such as `ai.cleanup_inbox`, `ai.turn_text_into_task`, `ai.suggest_tags`, `ai.suggest_due_date`, `ai.generate_subtasks`, `ai.generate_filter`, `ai.summarize_time_notes`, `ai.generate_weekly_review`, `ai.explain_prediction`, `ai.suggestion_panel`, `ai.review_panel`, `ai.suggested_tags`, `ai.suggested_estimate`, `ai.suggestion_generated`, and `ai.summary_generated` are not aliases.

### 14.1 Registration and Commands

`AiPlugin` is included in `BUILT_IN_PLUGINS`. It contributes manifest command descriptors and registers the same runtime commands through Command Registry:

```ts
ctx.commands.register({
  id: "ai.generate-subtasks",
  title: "Generate subtasks",
  handler: generateSubtasks
});
```

Each command requires an exact bounded input kind and caller-provided projection payload. Current input sources include capture text, page projections, metadata projections, event projections, existing tag lists, child page projections, allowed filter field/operator descriptors, and caller-provided prediction DTOs. The command boundary rejects malformed records, extra fields, unsafe/prototype/accessor data, unbounded arrays/text/JSON, forbidden provider/secret fields, unsafe provider output, and unsupported generated filter operators before exposing public DTOs.

Current command results are advisory DTOs only:

```text
ai.cleanup-inbox -> ai.cleanup-inbox-suggestion
ai.turn-text-into-task -> ai.task-suggestion
ai.suggest-tags -> ai.suggested-tags
ai.suggest-due-date -> ai.suggested-due-date
ai.generate-subtasks -> ai.subtask-suggestions
ai.generate-filter -> ai.filter-suggestion
ai.summarize-time-notes -> ai.time-notes-summary
ai.generate-weekly-review -> ai.weekly-review
ai.explain-prediction -> ai.prediction-explanation
```

The AI Plugin does not call `ctx.pages`, `ctx.metadata`, `ctx.events`, or `ctx.filters` mutation methods in TASK-031. It does not write `ai.summary`, `ai.suggestedTags`, `ai.suggestedEstimate`, `ai.suggestion-generated`, or `ai.summary-generated`; these descriptors reserve future AI-owned durable write paths after a trusted acceptance flow exists. It does not import sibling plugin internals or read sibling plugin private stores/facades.

### 14.2 OpenAI Provider Boundary

`src/plugins/ai/providers/modelProvider.ts` defines the plugin-local provider interface. `src/plugins/ai/providers/openAIProvider.ts` normalizes raw Responses-like transport output behind the same interface. The current provider id is `openai`, and `defaultOpenAiModel` is `gpt-5.5`.

The provider request is shaped as:

```text
operation: cleanup-inbox | turn-text-into-task | suggest-tags | suggest-due-date | generate-subtasks | generate-filter | summarize-time-notes | generate-weekly-review | explain-prediction
providerId: openai
request.instructions: string
request.input: string
request.model: settings model or gpt-5.5
request.store: false
request.text.format.type: json_schema
request.text.format.strict: true
request.text.format.name: command-specific schema name
request.text.format.schema: object schema with additionalProperties false
```

The strict JSON schemas intentionally stay within the supported subset covered by TASK-031 tests. Runtime validation enforces bounds, exact dates, confidence range, safe text, safe JSON keys, and generated-filter field/operator allowlists separately instead of relying on unsupported strict-schema keywords such as `maxLength`, `pattern`, `format`, `minimum`, `maximum`, `maxItems`, `allOf`, or `patternProperties`.

Raw Responses normalization accepts successful completed payloads with `error: null` and `incomplete_details: null`. It parses JSON from top-level `output_text` or from `output` message content entries with `type: "output_text"`. Refusal content, incomplete responses, error responses, invalid response shapes, invalid JSON, null output, accessor-backed data, transport failures, and unavailable transport fail closed with redacted AI-owned errors.

TASK-031 does not add the OpenAI SDK, `fetch`, `XMLHttpRequest`, WebSocket, workers, localStorage/sessionStorage/IndexedDB, Node HTTP/filesystem modules, NativeBridge/Tauri imports, Tauri HTTP permissions/capabilities, Rust commands, package changes, Cargo changes, schema changes, keychain access, or live network calls. Tests inject mocked providers and mocked OpenAI transports.

### 14.3 Settings, Views, and Deferred Scope

`ai.provider-settings` is an inert manifest `settingsPanels` descriptor. The actual settings used by TASK-031 are AI-plugin-owned injectable runtime/test state with `{ providerId: "openai", model, apiKey }`, defaulting to unconfigured. Production public AI exports do not expose settings secrets or provider override hooks; test support is gated by test mode and wraps injected providers without changing request operation/provider identity.

`ai.suggestion-panel` and `ai.review-panel` are minimal accessible views. They render loading/unavailable `role="status"` text inside named regions and ignore unsafe data/error props, so malformed provider output or caller data remains inert.

用户在任务页点击 AI 拆解时，当前 slice can only return advisory Markdown-like text:

```text
Caller supplies bounded page projection
AI command returns advisory Markdown:
- [ ] 子任务 A
- [ ] 子任务 B
- [ ] 子任务 C
```

AI 不直接创建任务。
AI 不直接插入当前页面。
Task Plugin 后续通过 explicit user/caller acceptance workflow 负责解释 `- [ ]`。

Deferred after TASK-031:

```text
persistent plugin settings and settings UI
OS keychain / secret storage
native HTTP transport / OpenAI SDK / live provider execution
durable AI metadata and event writes
acceptance UX that applies suggestions to pages, metadata, events, or filters
AI tools / hosted tools / streaming / Agents SDK orchestration
app-shell route/sidebar mounting polish
raw Responses missing-status stricter parsing
exact preservation of public result words matching persist*
generate-filter parity with broader Core filter operators such as neq / exists
native/package/Rust/schema/Tauri capability changes
```

---

## 15. Sync Plugin 架构

Sync Plugin 负责 future sync contract ownership；Core 不包含 Sync business logic、transport code、remote endpoint settings, network code, or conflict UI. TASK-032 当前只交付 TypeScript app-runtime skeleton，plugin id 是 `sync`。

### 15.1 Registration and Runtime Surface

Current TASK-032 ids:

```text
Built-in plugin:
SyncPlugin

Plugin id:
sync

Runtime commands:
none

Views:
none

Settings panels:
none

Transport:
none
```

`SyncPlugin.register()` does not register runtime commands, views, slots, settings panels, indexers, algorithms, or mobile toolbar items. Stale or future ids such as `sync.start`, `sync.push`, `sync.pull`, `sync.connect`, `sync.login`, `sync.apply`, `sync.import`, `sync.configure-remote`, `sync.page`, `sync.pages`, `sync.plugin_settings`, and `sync.indexer` are not aliases.

### 15.2 Syncable Units

`src/plugins/sync/syncable-units.ts` exports `SYNCABLE_UNIT_DESCRIPTORS` with schema version `1` for the durable units Sync can eventually exchange:

```text
sync.unit.markdown-page     key: id
sync.unit.metadata          key: pageId + namespace + key
sync.unit.event             key: id
sync.unit.filter            key: id
sync.unit.plugin-settings   key: pluginId + key
```

The serializers produce deterministic DTO snapshots:

```text
serializeMarkdownPageSyncUnit(page)
serializeMetadataSyncUnit(metadata)
serializeEventSyncUnit(event)
serializeFilterSyncUnit(filter)
serializePluginSettingsSyncUnit(settings)
```

The Plugin Settings unit is only a DTO snapshot shape. TASK-032 does not add settings persistence, a settings UI, a Core settings facade, OS keychain/secret storage, or a remote configuration store. The snapshot distinguishes `{ state: "unset" }` from `{ state: "json", value: null }`, and top-level or nested secret/auth/credential/remote-endpoint-like keys are rejected rather than treated as durable sync data. Future settings sync should use explicit per-plugin allowlists and keep secrets/remote credentials in a separate keychain-backed path.

Serializer output clones JSON-compatible data and rejects non-JSON runtime or executable shapes such as functions, symbols, bigint, non-finite numbers, cycles, non-plain objects, sparse/custom arrays, accessors, non-enumerable fields, oversized data, and over-deep data. The clone is a payload boundary for future durable exchange, not a live store handle.

### 15.3 Rebuildable Indexes

`SYNC_REBUILDABLE_INDEX_POLICY` marks local plugin indexes as rebuildable derived data:

```text
marker: sync.rebuildable.plugin-indexes
durable: false
syncable: false
reason: Local plugin indexes are derived and rebuilt from durable units.
```

`core_plugin_indexes` remains a local registry for plugin-owned index metadata. Sync payloads do not include a durable `sync.plugin-index` unit; facts still live in Markdown Pages, Metadata, Events, Filters, and explicit Plugin Settings snapshots.

### 15.4 Conflict Policy and Deferred Scope

`src/plugins/sync/conflict-policy.ts` exports `SYNC_CONFLICT_POLICY` and `resolveSyncUnitConflict()` for the current documented policy:

```text
mutable units:
  markdown-page / metadata / filter / plugin-settings divergent edits -> manual-resolution-required

event units:
  append-only: true
  distinct ids -> union
  identical duplicate id/content -> dedupe
  same id with different content -> manual-resolution-required

deferred:
  tombstones
  deletes
  conflict-ui
```

The event conflict helper accepts only strict event DTOs. Event units and `syncKey` must be plain records with exact data keys, descriptor-safe properties, and no getter invocation; `snapshot.id` must equal `syncKey.id`; stale unit kinds, mismatched non-event units, non-plain records, malformed DTOs, bad schema versions, extra keys, and malformed event-unit arrays are rejected before merge classification.

TASK-032 does not add network sync, native sync transport, filesystem access, background workers, remote endpoint settings, package/Cargo dependencies, Rust commands, Tauri permissions/capabilities, schema changes, keychain storage, or conflict UI. Any future network/native Sync work requires explicit settings and security review before it can be enabled.

---

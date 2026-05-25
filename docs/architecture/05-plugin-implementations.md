# 核心插件实现架构

描述 Tag、Timer、Habit、Heatmap、Stats、Chart、ML 和 AI 插件在代码层的目录与注册方式。

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

Still deferred: `timer.total_tracked_time`, `timer.last_tracked_at`, `timer.active_segment_id` metadata, Calendar app-shell feed/routing, Stats/ML integration, Recently Worked, Unnoted Sessions, manual segment editing, calendar drag/drop, app-shell broad mounting, native persistence, schema changes, and Tauri/package/Rust/native changes.

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

Deferred after TASK-026: `calendar.month`, manual segment creation/editing, snake_case aliases, app-shell route/navigation, drag/drop editing, broad cross-plugin event query/read facade, Timer metadata totals, Stats/ML/Habit/Task scheduled feeds, external calendar sync, native/Tauri/package/Rust/schema changes, strict UTC `Z`-only and duration-match validation, and stale detail clearing after data/date/week changes.

---

## 12. Habit / Heatmap 插件架构

### 12.1 Habit Plugin

```text
plugins/habit/
  src/
    manifest.ts
    plugin.ts
    metadata/
      habitFields.ts
    commands/
      checkHabit.ts
      uncheckHabit.ts
      setHabitFrequency.ts
    events/
      habitEventTypes.ts
    filters/
      habits.ts
      todayHabits.ts
    views/
      HabitListView.tsx
      HabitCard.tsx
    slots/
      HabitMetadataSlot.tsx
```

Habit Plugin 只提供 habit 数据语义。
当前 TASK-010 通过 manifest descriptor 声明 metadata field；renderer / editor 注册是后续 UI runtime facade。

```ts
export const habitManifest: PluginManifest = {
  id: "habit",
  name: "Habit Plugin",
  version: "0.1.0",
  minAppVersion: "0.1.0",
  contributes: {
    metadataFields: [
      {
        id: "habit.enabled",
        namespace: "habit",
        key: "enabled",
        name: "Habit enabled",
        valueType: "boolean"
      }
    ]
  }
};
```

### 12.2 Heatmap Plugin

Heatmap 是独立 View Plugin。

```text
plugins/heatmap/
  src/
    manifest.ts
    plugin.ts
    views/
      HeatmapView.tsx
      HeatmapCell.tsx
    adapters/
      habitEventsToHeatmap.ts
      timeSegmentsToHeatmap.ts
```

Heatmap Plugin 注册通用 heatmap view：

```ts
ctx.views.register({
  id: "heatmap.calendar",
  type: "heatmap",
  title: "Heatmap calendar",
  component: HeatmapView,
  accepts: {
    kind: "date-series"
  }
});
```

Habit Plugin 可以把 habit checked events 转成 date-series。
Timer Plugin 也可以把 daily tracked duration 转成 date-series。
Heatmap Plugin 不需要知道什么是 habit 或 timer。

---

## 13. Stats / Chart / ML 插件架构

### 13.1 Stats Plugin

Stats Plugin 负责聚合数据。

```text
plugins/stats/
  src/
    aggregations/
      sumTimeByTag.ts
      sumTimeByPage.ts
      estimateVsActual.ts
      habitCompletionRate.ts
      taskSwitchCount.ts
    filters/
      planningReview.ts
      recentlyStalled.ts
    views/
      StatsDashboard.tsx
      InsightCard.tsx
```

Stats Plugin 通过 manifest descriptor 声明 aggregation。
可执行 algorithm registry 和 handler 绑定是后续 Plugin Platform 工作，不是 TASK-010 当前 runtime facade。

```ts
export const statsManifest: PluginManifest = {
  id: "stats",
  name: "Stats Plugin",
  version: "0.1.0",
  minAppVersion: "0.1.0",
  contributes: {
    algorithms: [
      {
        id: "stats.sum-time-by-tag",
        name: "Sum time by tag",
        inputSchema: SumTimeByTagInput,
        outputSchema: SumTimeByTagOutput
      }
    ]
  }
};
```

### 13.2 Chart Plugin

Chart Plugin 负责图表视图。

```text
plugins/chart/
  src/
    views/
      BarChartView.tsx
      LineChartView.tsx
      ScatterChartView.tsx
      PieChartView.tsx
```

Chart Plugin 注册：

```ts
ctx.views.register({
  id: "chart.bar",
  type: "chart.bar",
  title: "Bar chart",
  component: BarChartView,
  accepts: { kind: "series" }
});
```

Stats 产出数据，Chart 负责渲染。

### 13.3 Machine Learning Plugin

ML Plugin 负责算法。

```text
plugins/ml/
  src/
    algorithms/
      predictRemainingTime.ts
      recommendNextTask.ts
      detectBestWorkTime.ts
      detectEstimateBias.ts
      clusterSimilarTasks.ts
    features/
      buildTaskFeatures.ts
      buildTimeFeatures.ts
      buildHabitFeatures.ts
    views/
      PredictionPanel.tsx
      RecommendationCard.tsx
    jobs/
      refreshPredictions.ts
```

ML Plugin 通过 manifest descriptor 声明 algorithm；可执行 algorithm handler 绑定是后续 runtime facade。

```ts
export const mlManifest: PluginManifest = {
  id: "ml",
  name: "Machine Learning Plugin",
  version: "0.1.0",
  minAppVersion: "0.1.0",
  contributes: {
    algorithms: [
      {
        id: "ml.predict-remaining-time",
        name: "Predict remaining time",
        inputSchema: PredictRemainingInput,
        outputSchema: PredictRemainingOutput
      }
    ]
  }
};
```

预测结果写入 Metadata：

```ts
await ctx.metadata.set({
  pageId,
  namespace: "ml",
  key: "predictedRemainingTime",
  value: {
    minHours: 6,
    maxHours: 9,
    confidence: 0.72
  },
  valueType: "json"
});
```

ML Panel 通过 Slot 渲染在页面侧边：

```ts
ctx.slots.register({
  id: "ml.page-sidebar.prediction-panel",
  slot: "page.sidebar.panel",
  component: PredictionPanel,
  when: ({ pageId }) => isTaskPage(pageId)
});
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

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

`tag.hashtag` 和 `tag.tags` 是 manifest descriptors。它们不会创建 rich inline tokens、autocomplete、automatic save-time scanning、indexer 或 filter result rendering。

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

`TagMetadataSlot` is a narrow `page.header.metadata` contribution. It displays inert tag text and local add/remove controls that execute `tag.add-tag` / `tag.remove-tag` with exact `{ pageId, tag }` payloads. It is not the full Metadata UI Plugin from TASK-023.

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

Filter result execution and rendering remain TASK-022+.

## 11. Timer Plugin 代码架构

Timer Plugin 是另一个核心插件。

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

Timer manifest 声明 metadata fields、event types、default filters 和 indexers 等 descriptor。
当前 `register(ctx)` 只注册 commands、views 和 slots 这三个 TASK-010 runtime registration facades。

```ts
export const TimerPlugin: AppPlugin = {
  manifest,

  register(ctx) {
    registerTimerCommands(ctx);
    registerTimerViews(ctx);
    registerTimerSlots(ctx);
  }
};
```

### 11.2 Start Timer

用户点击页面顶部：

```text
Start
```

UI 执行：

```ts
runtime.commands.execute("timer.start", { pageId });
```

Timer Plugin handler：

这个 sketch 里的 active timer state 使用后续 plugin-local runtime storage，不是 TASK-010 当前的 `ctx.metadata` facade。

```ts
async function startTimer(ctx, { pageId }) {
  await ctx.transaction.run(async tx => {
    const active = await readTimerRuntimeState("activeSegmentId");

    if (active) {
      await stopActiveTimer(tx);
    }

    const segmentId = createId();

    await writeTimerRuntimeState("activeSegmentId", segmentId);

    await tx.events.append({
      pageId,
      namespace: "timer",
      type: "started",
      payload: {
        segmentId,
        startAt: now()
      }
    });
  });
}
```

### 11.3 Stop Timer

Stop 后生成 Time Segment。
当前 TASK-010 `PluginEventStore` 只暴露 `append` 和 `list`；插件需要通过 `list` 查询事件并在插件内收窄 payload。更专用的 timer event 查询 facade 属于后续接口面。

```ts
async function stopTimer(ctx) {
  await ctx.transaction.run(async tx => {
    const activeSegmentId = await readTimerRuntimeState("activeSegmentId");

    const startedEvent = tx.events
      .list({ namespace: "timer" })
      .find(event => {
        const payload = event.payload as { segmentId?: string };

        return event.type === "started" && payload.segmentId === activeSegmentId;
      });

    if (!startedEvent) {
      throw new Error("No active timer start event");
    }

    const startedPayload = startedEvent.payload as { startAt: string };

    const notePage = await tx.pages.create({
      title: "Time Segment Note",
      body: createEmptyMarkdownDoc()
    });

    await tx.events.append({
      pageId: startedEvent.pageId,
      namespace: "timer",
      type: "time_segment_created",
      payload: {
        segmentId: activeSegmentId,
        startAt: startedPayload.startAt,
        endAt: now(),
        durationSeconds: diffSeconds(startedPayload.startAt, now()),
        notePageId: notePage.id,
        source: "timer"
      }
    });

    await writeTimerRuntimeState("activeSegmentId", null);
  });
}
```

Time Segment Note 必须是 Markdown Page。
这样每段时间都能写结构化笔记。

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

# 核心插件实现架构

描述 Timer、Habit、Heatmap、Stats、Chart、ML 和 AI 插件在代码层的目录与注册方式。

## 10. Timer Plugin 代码架构

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

### 10.1 Timer Plugin 注册内容

```ts
export const TimerPlugin: AppPlugin = {
  manifest,

  register(ctx) {
    registerTimerMetadata(ctx);
    registerTimerEvents(ctx);
    registerTimerCommands(ctx);
    registerTimerFilters(ctx);
    registerTimerViews(ctx);
    registerTimerSlots(ctx);
    registerTimerIndexers(ctx);
  }
};
```

### 10.2 Start Timer

用户点击页面顶部：

```text
Start
```

UI 执行：

```ts
runtime.commands.execute("timer.start", { pageId });
```

Timer Plugin handler：

```ts
async function startTimer(ctx, { pageId }) {
  await ctx.transaction.run(async tx => {
    const active = await tx.metadata.getGlobal("timer", "activeSegmentId");

    if (active) {
      await stopActiveTimer(tx);
    }

    const segmentId = createId();

    await tx.metadata.setGlobal({
      namespace: "timer",
      key: "activeSegmentId",
      value: segmentId,
      sourcePluginId: "timer"
    });

    await tx.events.append({
      pageId,
      namespace: "timer",
      type: "started",
      payload: {
        segmentId,
        startAt: now()
      },
      sourcePluginId: "timer"
    });
  });
}
```

### 10.3 Stop Timer

Stop 后生成 Time Segment。

```ts
async function stopTimer(ctx) {
  await ctx.transaction.run(async tx => {
    const activeSegmentId = await tx.metadata.getGlobal("timer", "activeSegmentId");

    const startedEvent = await tx.events.findTimerStart(activeSegmentId);

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
        startAt: startedEvent.payload.startAt,
        endAt: now(),
        durationSeconds: diffSeconds(startedEvent.payload.startAt, now()),
        notePageId: notePage.id,
        source: "timer"
      },
      sourcePluginId: "timer"
    });

    await tx.metadata.setGlobal({
      namespace: "timer",
      key: "activeSegmentId",
      value: null,
      sourcePluginId: "timer"
    });
  });
}
```

Time Segment Note 必须是 Markdown Page。
这样每段时间都能写结构化笔记。

---

## 11. Habit / Heatmap 插件架构

### 11.1 Habit Plugin

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

```ts
ctx.metadataFields.register({
  namespace: "habit",
  key: "enabled",
  valueType: "boolean",
  renderer: HabitEnabledRenderer,
  editor: HabitEnabledEditor
});
```

### 11.2 Heatmap Plugin

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
  pluginId: "heatmap",
  type: "heatmap",
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

## 12. Stats / Chart / ML 插件架构

### 12.1 Stats Plugin

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

Stats Plugin 注册 aggregation：

```ts
ctx.algorithms.register({
  id: "stats.sum-time-by-tag",
  pluginId: "stats",
  inputSchema: SumTimeByTagInput,
  outputSchema: SumTimeByTagOutput,
  handler: sumTimeByTag
});
```

### 12.2 Chart Plugin

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
  pluginId: "chart",
  type: "chart.bar",
  component: BarChartView,
  accepts: { kind: "series" }
});
```

Stats 产出数据，Chart 负责渲染。

### 12.3 Machine Learning Plugin

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

ML Plugin 注册：

```ts
ctx.algorithms.register({
  id: "ml.predict-remaining-time",
  pluginId: "ml",
  inputSchema: PredictRemainingInput,
  outputSchema: PredictRemainingOutput,
  handler: predictRemainingTime
});
```

预测结果写入 Metadata：

```ts
await ctx.metadata.set(pageId, {
  namespace: "ml",
  key: "predictedRemainingTime",
  value: {
    minHours: 6,
    maxHours: 9,
    confidence: 0.72
  },
  sourcePluginId: "ml"
});
```

ML Panel 通过 Slot 渲染在页面侧边：

```ts
ctx.slots.register({
  slot: "page.sidebar.panel",
  pluginId: "ml",
  component: PredictionPanel,
  when: ({ pageId }) => isTaskPage(pageId)
});
```

---

## 13. AI Plugin 架构

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
  pluginId: "ai",
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

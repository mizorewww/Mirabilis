import type { AppPlugin } from "../core";
import { CalendarPlugin } from "../plugins/calendar";
import { ChartPlugin } from "../plugins/chart";
import { HabitPlugin } from "../plugins/habit";
import { HeatmapPlugin } from "../plugins/heatmap";
import { MarkdownEditorPlugin } from "../plugins/markdown-editor";
import { MetadataUiPlugin } from "../plugins/metadata-ui";
import { MlPlugin } from "../plugins/ml";
import { QuickCapturePlugin } from "../plugins/quick-capture";
import { SearchPlugin } from "../plugins/search";
import { StatsPlugin } from "../plugins/stats";
import { TagPlugin } from "../plugins/tag";
import { TaskPlugin } from "../plugins/task";
import { TimerPlugin } from "../plugins/timer";

export const BUILT_IN_PLUGINS = Object.freeze([
  MarkdownEditorPlugin,
  MetadataUiPlugin,
  TaskPlugin,
  TagPlugin,
  TimerPlugin,
  CalendarPlugin,
  HabitPlugin,
  HeatmapPlugin,
  StatsPlugin,
  ChartPlugin,
  QuickCapturePlugin,
  SearchPlugin,
  MlPlugin,
]) as readonly AppPlugin[];

import type { AppPlugin } from "../core";
import { CalendarPlugin } from "../plugins/calendar";
import { MarkdownEditorPlugin } from "../plugins/markdown-editor";
import { MetadataUiPlugin } from "../plugins/metadata-ui";
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
]) as readonly AppPlugin[];

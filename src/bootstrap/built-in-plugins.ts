import type { AppPlugin } from "../core";
import { MarkdownEditorPlugin } from "../plugins/markdown-editor";
import { TagPlugin } from "../plugins/tag";
import { TaskPlugin } from "../plugins/task";

export const BUILT_IN_PLUGINS = Object.freeze([
  MarkdownEditorPlugin,
  TaskPlugin,
  TagPlugin,
]) as readonly AppPlugin[];

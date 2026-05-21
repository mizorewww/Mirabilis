import type { AppPlugin } from "../core";
import { MarkdownEditorPlugin } from "../plugins/markdown-editor";
import { TaskPlugin } from "../plugins/task";

export const BUILT_IN_PLUGINS = Object.freeze([
  MarkdownEditorPlugin,
  TaskPlugin,
]) as readonly AppPlugin[];

import type { AppPlugin } from "../core";
import { MarkdownEditorPlugin } from "../plugins/markdown-editor";

export const BUILT_IN_PLUGINS = Object.freeze([
  MarkdownEditorPlugin,
]) as readonly AppPlugin[];

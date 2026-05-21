import type { AppPlugin } from "../../core";
import { BaseMarkdownToolbar } from "./components/BaseMarkdownToolbar";
import { MarkdownPageEditor } from "./components/MarkdownPageEditor";
import { insertMarkdownText } from "./commands/insert-text";

export const MarkdownEditorPlugin: AppPlugin = {
  manifest: {
    id: "markdown",
    name: "Markdown Editor",
    version: "1.0.0",
    minAppVersion: "0.1.0",
  },
  register(ctx) {
    ctx.views.register({
      id: "markdown.page-editor",
      type: "page.editor",
      title: "Markdown page editor",
      component: MarkdownPageEditor,
      accepts: {
        kind: "markdown-page",
      },
    });

    ctx.commands.register({
      id: "markdown.insert-text",
      title: "Insert text",
      handler: insertMarkdownText,
    });

    ctx.slots.register({
      id: "markdown.editor-mobile-toolbar.base",
      slot: "editor.mobile.toolbar",
      component: BaseMarkdownToolbar,
    });
  },
};

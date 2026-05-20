import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_PLUGINS, createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  type DbQuery,
  type NativeBridge,
} from "../core";

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type MarkdownPageEditorProps = {
  page: MarkdownEditorDocument;
  commands: MarkdownCommandBus;
};

type MarkdownInsertTextResult = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const markdownEditorPluginDirectory = path.join(
  repoRoot,
  "src",
  "plugins",
  "markdown-editor",
);
const sourceExtensions = new Set([".ts", ".tsx"]);
const testFilePattern = /\.(test|spec)\.[cm]?[tj]sx?$/;

describe("Markdown Editor Plugin shell", () => {
  it("is a built-in plugin that registers its owned page editor view, insert command, and mobile toolbar slot", async () => {
    const runtime = await createRuntime();
    const builtInPluginIds = BUILT_IN_PLUGINS.map((plugin) => plugin.manifest.id);
    const markdownViews = runtime.registries.views.list({
      pluginId: "markdown",
    });
    const markdownCommands = runtime.registries.commands.list({
      pluginId: "markdown",
    });
    const markdownSlots = runtime.registries.slots.list({
      pluginId: "markdown",
    });

    expect.soft(builtInPluginIds).toContain("markdown");
    expect.soft(markdownViews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "markdown.page-editor",
          pluginId: "markdown",
          type: "page.editor",
          title: "Markdown page editor",
          accepts: { kind: "markdown-page" },
          component: expect.anything(),
        }),
      ]),
    );
    expect.soft(markdownCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "markdown.insert-text",
          pluginId: "markdown",
          title: "Insert text",
        }),
      ]),
    );
    expect.soft(markdownSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "markdown.editor-mobile-toolbar.base",
          pluginId: "markdown",
          slot: "editor.mobile.toolbar",
          component: expect.anything(),
        }),
      ]),
    );
    expect
      .soft(runtime.registries.slots.list({ slot: "editor.mobile.toolbar" }))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "markdown.editor-mobile-toolbar.base",
            pluginId: "markdown",
          }),
        ]),
      );
  });

  it("executes markdown.insert-text through the command registry after plugin registration", async () => {
    const runtime = await createRuntime();

    await expect(
      runtime.commands.execute("markdown.insert-text", {
        pageId: "page-1",
        markdown: "Paragraph\n[[Page]]",
        text: "#",
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ).resolves.toStrictEqual({
      markdown: "#Paragraph\n[[Page]]",
      selectionStart: 1,
      selectionEnd: 1,
    } satisfies MarkdownInsertTextResult);
  });

  it("renders a labeled multiline editor and preserves baseline Markdown syntax exactly", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const commandBus = createCommandBus(runtime);
    const markdown = [
      "# Heading",
      "",
      "Paragraph text",
      "",
      "- item",
      "- [ ] task",
      "#tag",
      "[[Page]]",
    ].join("\n");

    renderMarkdownPageEditor(runtime, {
      page: createEditorDocument("page-visible", ""),
      commands: commandBus,
    });

    const editor = screen.getByRole("textbox", {
      name: /markdown/i,
    });

    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    await user.click(editor);
    await user.keyboard(markdown);

    expect(editor).toHaveValue(markdown);
  });

  it("inserts mobile toolbar Markdown snippets by dispatching markdown.insert-text", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const commandBus = createCommandBus(runtime);

    renderMarkdownPageEditor(runtime, {
      page: createEditorDocument("page-toolbar", ""),
      commands: commandBus,
    });

    const editor = screen.getByRole("textbox", {
      name: /markdown/i,
    });

    await user.click(
      screen.getByRole("button", { name: /insert task syntax/i }),
    );
    await waitFor(() =>
      expect(commandBus.execute).toHaveBeenLastCalledWith(
        "markdown.insert-text",
        expect.objectContaining({
          pageId: "page-toolbar",
          text: "- [ ] ",
        }),
      ),
    );
    expect(editor).toHaveValue("- [ ] ");

    await user.click(
      screen.getByRole("button", { name: /insert heading or tag marker/i }),
    );
    await waitFor(() =>
      expect(commandBus.execute).toHaveBeenLastCalledWith(
        "markdown.insert-text",
        expect.objectContaining({
          pageId: "page-toolbar",
          text: "#",
        }),
      ),
    );
    expect(editor).toHaveValue("- [ ] #");

    await user.click(
      screen.getByRole("button", { name: /insert page link syntax/i }),
    );
    await waitFor(() =>
      expect(commandBus.execute).toHaveBeenLastCalledWith(
        "markdown.insert-text",
        expect.objectContaining({
          pageId: "page-toolbar",
          text: "[[ ]]",
        }),
      ),
    );
    expect(editor).toHaveValue("- [ ] #[[ ]]");
  });

  it("keeps malicious Markdown inert in the editor surface", async () => {
    const runtime = await createRuntime();
    const maliciousMarkdown = [
      "<script>window.__owned = true</script>",
      '<img src="x" onerror="window.__owned = true">',
      '<section onclick="window.__owned = true">raw html block</section>',
      "[unsafe](javascript:alert(1))",
    ].join("\n");
    const commandBus = createCommandBus(runtime);

    renderMarkdownPageEditor(runtime, {
      page: createEditorDocument("page-malicious", maliciousMarkdown),
      commands: commandBus,
    });
    const renderedHtml = document.body.innerHTML;

    expect(
      screen.getByRole("textbox", { name: /markdown/i }),
    ).toHaveValue(maliciousMarkdown);
    expect(renderedHtml).not.toMatch(/<script[\s>]/i);
    expect(renderedHtml).not.toMatch(/\son(?:error|click)=/i);
    expect(renderedHtml).not.toMatch(/href=["']javascript:/i);
    expect(renderedHtml).not.toMatch(/<(?:iframe|object|embed)\b/i);
  });

  it("keeps Markdown editor UI code away from raw HTML sinks and privileged runtime props", async () => {
    const productionFiles = await listProductionSourceFiles(
      markdownEditorPluginDirectory,
    );
    const uiFiles = productionFiles.filter((filePath) =>
      filePath.endsWith(".tsx"),
    );
    const violations = new Map<string, string[]>();

    expect(uiFiles).not.toHaveLength(0);

    for (const filePath of uiFiles) {
      const contents = await readFile(filePath, "utf8");
      const fileViolations = findUnsafeMarkdownEditorUiPatterns(contents);

      if (fileViolations.length > 0) {
        violations.set(path.relative(repoRoot, filePath), fileViolations);
      }
    }

    expect(formatViolations(violations)).toStrictEqual([]);
  });
});

function renderMarkdownPageEditor(
  runtime: AppRuntime,
  props: MarkdownPageEditorProps,
) {
  const pageEditor = runtime.registries.views.get(
    "markdown.page-editor",
  ) as unknown as {
    component: ComponentType<MarkdownPageEditorProps>;
  };
  const Editor = pageEditor.component;

  return render(<Editor {...props} />);
}

function createEditorDocument(
  id: string,
  markdown: string,
): MarkdownEditorDocument {
  return {
    id,
    title: "Inbox",
    markdown,
  };
}

function createCommandBus(runtime: AppRuntime): MarkdownCommandBus {
  return {
    execute: vi.fn((commandId: string, input?: unknown) =>
      runtime.commands.execute(commandId, input),
    ),
  };
}

async function createRuntime(): Promise<AppRuntime> {
  return createAppRuntime({
    createNativeBridge: () => createNoopNativeBridge(),
  });
}

function createNoopNativeBridge(): NativeBridge {
  return {
    db: {
      async execute<Response>(_query: DbQuery): Promise<Response> {
        void _query;

        return undefined as Response;
      },
      async transaction<Response>(
        _queries: DbQuery[],
      ): Promise<NativeBridgeTransactionResult<Response>> {
        void _queries;

        return [] as NativeBridgeTransactionResult<Response>;
      },
    },
    shortcuts: {
      async register() {
        return undefined;
      },
      async unregister() {
        return undefined;
      },
    },
    notifications: {
      async notify() {
        return undefined;
      },
    },
    files: {
      async importMarkdown() {
        return "";
      },
      async exportMarkdown() {
        return undefined;
      },
    },
  };
}

async function listProductionSourceFiles(directory: string): Promise<string[]> {
  const entry = await statIfExists(directory);

  if (entry === undefined) {
    return [];
  }

  if (entry.isFile()) {
    return sourceExtensions.has(path.extname(directory)) &&
      !testFilePattern.test(directory)
      ? [directory]
      : [];
  }

  if (!entry.isDirectory()) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((child) =>
      listProductionSourceFiles(path.join(directory, child.name)),
    ),
  );

  return files.flat().sort();
}

async function statIfExists(absolutePath: string) {
  try {
    return await stat(absolutePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }

    throw error;
  }
}

function findUnsafeMarkdownEditorUiPatterns(contents: string): string[] {
  const patterns = new Map<RegExp, string>([
    [/dangerouslySetInnerHTML/, "raw HTML sink"],
    [/\buseRuntime\s*\(/, "public runtime hook inside plugin UI"],
    [/\bruntime\b/i, "runtime prop or handle"],
    [/\bstores?\b/i, "Core store prop or handle"],
    [/\bregistries\b/i, "Core registry prop or handle"],
    [/\bservices\b/i, "Core services prop or handle"],
    [/\bpluginHost\b/, "PluginHost prop or handle"],
    [/\bNativeBridge\b|\bnativeBridge\b/, "NativeBridge prop or handle"],
    [/\binvoke\b/, "raw native invoke prop or handle"],
    [/\bdb\b|\bdatabase\b|\bsqlite\b/i, "database prop or handle"],
    [/\bfilesystem\b|\bfileSystem\b|\bfs\b/i, "filesystem prop or handle"],
    [/\bpath\b|\bpaths\b/i, "path prop or handle"],
    [/\bregister\s*\(|\bunregister\s*\(/, "registry mutation handle"],
  ]);

  return [...patterns.entries()]
    .filter(([pattern]) => pattern.test(contents))
    .map(([, description]) => description);
}

function formatViolations(violations: Map<string, string[]>): string[] {
  return [...violations.entries()]
    .flatMap(([filePath, fileViolations]) =>
      fileViolations.map((violation) => `${filePath}: ${violation}`),
    )
    .sort();
}

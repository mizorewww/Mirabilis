import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { createAppRuntime, type AppRuntime } from "../bootstrap";
import {
  DB_PERSISTENCE_OPERATIONS,
  type DbQuery,
} from "../core";

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
};

type MarkdownPageFacade = {
  load(pageId: string): Promise<MarkdownEditorDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownEditorDocument>;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type PersistedMarkdownPageEditorProps = {
  pageId: string;
  pageFacade: MarkdownPageFacade;
  commands: MarkdownCommandBus;
};

type RecordingNativeBridge = {
  db: {
    execute: Mock<(query: DbQuery) => Promise<unknown>>;
    transaction<Response>(
      queries: DbQuery[],
    ): Promise<NativeBridgeTransactionResult<Response>>;
  };
  shortcuts: {
    register(shortcut: string, commandId: string): Promise<void>;
    unregister(shortcut: string): Promise<void>;
  };
  notifications: {
    notify(input: { title: string; body?: string }): Promise<void>;
  };
  files: {
    importMarkdown(path: string): Promise<string>;
    exportMarkdown(pageId: string, path: string): Promise<void>;
  };
};

type NativeBridgeTransactionResult<Response> =
  Response extends readonly unknown[]
    ? number extends Response["length"]
      ? Array<Response>
      : Response
    : Array<Response>;

const updatedAt = "2026-01-01T00:00:00.000Z";

describe("Markdown page persistence", () => {
  it("saves through a narrow page facade and reopens the same page with saved Markdown", async () => {
    const runtime = await createRuntime();
    const user = userEvent.setup();
    const nativeBridge = createRecordingNativeBridge({
      id: "page-persisted",
      title: "Inbox",
      markdown: "",
    });
    const pageFacade = createNativeBackedPageFacade(nativeBridge);
    const commandBus = createCommandBus(runtime);
    const savedMarkdown = [
      "# Saved",
      "",
      "Paragraph text",
      "- item",
      "- [ ] task",
      "#tag",
      "[[Page]]",
    ].join("\n");

    const { unmount } = renderPersistedMarkdownEditor(runtime, {
      pageId: "page-persisted",
      pageFacade,
      commands: commandBus,
    });
    const editor = await screen.findByRole("textbox", { name: /markdown/i });

    await waitFor(() => expect(editor).toHaveValue(""));
    await user.click(editor);
    await user.keyboard(savedMarkdown);
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(nativeBridge.db.execute).toHaveBeenCalledWith({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: {
          id: "page-persisted",
          title: "Inbox",
          parentPageId: null,
          body: {
            type: "doc",
            content: [
              {
                type: "markdown.text",
                text: savedMarkdown,
              },
            ],
          },
          updatedAt,
        },
      } satisfies DbQuery),
    );

    unmount();

    renderPersistedMarkdownEditor(runtime, {
      pageId: "page-persisted",
      pageFacade,
      commands: commandBus,
    });

    expect(
      await screen.findByRole("textbox", { name: /markdown/i }),
    ).toHaveValue(savedMarkdown);
    expect(nativeBridge.db.execute.mock.calls.map(([query]) => query)).toStrictEqual([
      {
        operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
        payload: {
          id: "page-persisted",
        },
      },
      {
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: {
          id: "page-persisted",
          title: "Inbox",
          parentPageId: null,
          body: {
            type: "doc",
            content: [
              {
                type: "markdown.text",
                text: savedMarkdown,
              },
            ],
          },
          updatedAt,
        },
      },
      {
        operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
        payload: {
          id: "page-persisted",
        },
      },
    ] satisfies DbQuery[]);
    expect(JSON.stringify(nativeBridge.db.execute.mock.calls)).not.toMatch(
      /\bsql\b|\bparams\b|select\s+\*|core_pages|\bpath\b|\bfile\b/i,
    );
  });
});

function renderPersistedMarkdownEditor(
  runtime: AppRuntime,
  props: PersistedMarkdownPageEditorProps,
) {
  const pageEditor = runtime.registries.views.get(
    "markdown.page-editor",
  ) as unknown as {
    component: ComponentType<PersistedMarkdownPageEditorProps>;
  };
  const Editor = pageEditor.component;

  return render(<Editor {...props} />);
}

async function createRuntime(): Promise<AppRuntime> {
  return createAppRuntime({
    createNativeBridge: () =>
      createRecordingNativeBridge({
        id: "unused",
        title: "Unused",
        markdown: "",
      }),
  });
}

function createCommandBus(runtime: AppRuntime): MarkdownCommandBus {
  return {
    execute: vi.fn((commandId: string, input?: unknown) =>
      runtime.commands.execute(commandId, input),
    ),
  };
}

function createNativeBackedPageFacade(
  nativeBridge: RecordingNativeBridge,
): MarkdownPageFacade {
  return {
    async load(pageId) {
      return nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.pagesGet,
        payload: {
          id: pageId,
        },
      }) as Promise<MarkdownEditorDocument>;
    },
    async save(input) {
      return nativeBridge.db.execute({
        operation: DB_PERSISTENCE_OPERATIONS.pagesUpdate,
        payload: {
          id: input.pageId,
          title: "Inbox",
          parentPageId: null,
          body: markdownToNativeBody(input.markdown),
          updatedAt,
        },
      }) as Promise<MarkdownEditorDocument>;
    },
  };
}

function createRecordingNativeBridge(
  initialPage: MarkdownEditorDocument,
): RecordingNativeBridge {
  let currentPage = initialPage;
  const execute = vi.fn(async (query: DbQuery) => {
    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesGet) {
      return currentPage;
    }

    if (query.operation === DB_PERSISTENCE_OPERATIONS.pagesUpdate) {
      const payload = query.payload as {
        id: string;
        title: string;
        body: ReturnType<typeof markdownToNativeBody>;
      };

      currentPage = {
        id: payload.id,
        title: payload.title,
        markdown: payload.body.content[0]?.text ?? "",
      };

      return currentPage;
    }

    return undefined;
  });

  return {
    db: {
      execute,
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

function markdownToNativeBody(markdown: string) {
  return {
    type: "doc",
    content: [
      {
        type: "markdown.text",
        text: markdown,
      },
    ],
  };
}

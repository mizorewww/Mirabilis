import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type ChangeEvent,
} from "react";

import {
  exportStructuredDocumentToMarkdown,
  type BlockNode,
  type StructuredMarkdownDocument,
} from "../../../core";
import type { MarkdownInsertTextResult } from "../commands/insert-text";
import { BaseMarkdownToolbar } from "./BaseMarkdownToolbar";

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
  body?: StructuredMarkdownDocument;
};

type MarkdownCommandBus = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

type MarkdownPageSource = {
  load(pageId: string): Promise<MarkdownEditorDocument>;
  save(input: {
    pageId: string;
    markdown: string;
  }): Promise<MarkdownEditorDocument>;
};

type MarkdownExtensionSource = {
  collectEditorExtensions(): readonly unknown[];
};

type MarkdownPageEditorBaseProps = {
  commands: MarkdownCommandBus;
  markdownRuntime?: MarkdownExtensionSource;
  onOpenPage?: (pageId: string) => void;
};

type DirectMarkdownPageEditorProps = MarkdownPageEditorBaseProps & {
  page: MarkdownEditorDocument;
};

type LoadedMarkdownPageEditorProps = MarkdownPageEditorBaseProps & {
  pageId: string;
  pageFacade: MarkdownPageSource;
};

export type MarkdownPageEditorProps =
  | DirectMarkdownPageEditorProps
  | LoadedMarkdownPageEditorProps;

type EditorState = {
  markdown: string;
  body?: StructuredMarkdownDocument;
  loadedPageId?: string;
  loading: boolean;
  saving: boolean;
};

type EditorAction =
  | {
      type: "direct-page";
      pageId: string;
      markdown: string;
      body?: StructuredMarkdownDocument;
    }
  | {
      type: "load-started";
    }
  | {
      type: "load-succeeded";
      pageId: string;
      markdown: string;
      body?: StructuredMarkdownDocument;
    }
  | {
      type: "edit";
      markdown: string;
      body?: StructuredMarkdownDocument;
    }
  | {
      type: "save-started";
    }
  | {
      type: "save-finished";
      pageId: string;
      markdown: string;
      body?: StructuredMarkdownDocument;
      applySavedMarkdown: boolean;
    };

const insertCommandId = "markdown.insert-text";
const openTaskPageCommandId = "task.open-task-page";
const toggleTaskStatusCommandId = "task.toggle-status";
const taskLinePattern =
  /^(?<beforeMarker> {0,3}-\s+\[)(?<marker> |x|X)(?<afterMarker>\]\s+)(?<title>.*)$/u;
const fenceLinePattern = /^\s{0,3}(?<fence>`{3,}|~{3,})/u;

export function MarkdownPageEditor(props: MarkdownPageEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextCaretRef = useRef<MarkdownInsertTextResult | null>(null);
  const contentVersionRef = useRef(0);
  const latestPageIdRef = useRef("");
  const loadGenerationRef = useRef(0);
  const pageId = readPageId(props);
  const pageFacade = readPageFacade(props);
  const initialMarkdown = readInitialMarkdown(props);
  const initialBody = readStructuredBody(props);
  const directPageSignatureRef = useRef(
    pageFacade === undefined
      ? createDirectPageSignature(pageId, initialMarkdown)
      : "",
  );
  const directPageBodyRef = useRef(
    pageFacade === undefined ? initialBody : undefined,
  );
  const commands = props.commands;
  const extensionSource = readExtensionSource(props);
  const [state, dispatch] = useReducer(
    editorStateReducer,
    undefined,
    () =>
      createInitialEditorState({
        initialMarkdown,
        initialBody,
        pageId,
        loadsFromPageSource: pageFacade !== undefined,
      }),
  );
  const { markdown, loadedPageId } = state;
  const structuredBody = state.body;
  const collectedExtensions = extensionSource?.collectEditorExtensions() ?? [];
  const currentStructuredBody = readCurrentStructuredBody(
    structuredBody,
    markdown,
  );
  const structuredTasks = collectStructuredTasks(
    currentStructuredBody,
    collectedExtensions,
  );
  const canSave =
    pageFacade !== undefined &&
    !state.loading &&
    !state.saving &&
    loadedPageId === pageId;
  const editorDisabled =
    pageFacade !== undefined && (state.loading || loadedPageId !== pageId);

  void collectedExtensions;

  useLayoutEffect(() => {
    latestPageIdRef.current = pageId;
  }, [pageId]);

  useEffect(() => {
    if (pageFacade !== undefined) {
      return;
    }

    const directPageSignature = createDirectPageSignature(
      pageId,
      initialMarkdown,
    );

    if (
      directPageSignatureRef.current === directPageSignature &&
      directPageBodyRef.current === initialBody
    ) {
      return;
    }

    directPageSignatureRef.current = directPageSignature;
    directPageBodyRef.current = initialBody;
    contentVersionRef.current += 1;
    dispatch({
      type: "direct-page",
      pageId,
      markdown: initialMarkdown,
      body: initialBody,
    });
  }, [initialBody, initialMarkdown, pageFacade, pageId]);

  useEffect(() => {
    if (pageFacade === undefined) {
      return;
    }

    let isCurrent = true;
    const loadGeneration = loadGenerationRef.current + 1;

    loadGenerationRef.current = loadGeneration;
    contentVersionRef.current += 1;
    dispatch({ type: "load-started" });
    void pageFacade.load(pageId).then((page) => {
      if (!isCurrent || loadGenerationRef.current !== loadGeneration) {
        return;
      }

      contentVersionRef.current += 1;
      dispatch({
        type: "load-succeeded",
        pageId,
        markdown: page.markdown,
        body: page.body,
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [pageFacade, pageId]);

  useEffect(() => {
    const nextCaret = nextCaretRef.current;

    if (nextCaret === null) {
      return;
    }

    nextCaretRef.current = null;
    areaRef.current?.focus();
    areaRef.current?.setSelectionRange(
      nextCaret.selectionStart,
      nextCaret.selectionEnd,
    );
  }, [markdown]);

  useLayoutEffect(() => {
    const textarea = areaRef.current;

    if (textarea !== null) {
      textarea.defaultValue = "";
      textarea.value = markdown;
    }
  }, [markdown]);

  async function insertText(text: string) {
    const textarea = areaRef.current;
    const insertPageId = pageId;
    const insertMarkdown = markdown;
    const insertVersion = contentVersionRef.current;
    const selectionStart = textarea?.selectionStart ?? insertMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const output = await commands.execute(insertCommandId, {
      pageId: insertPageId,
      markdown: insertMarkdown,
      text,
      selectionStart,
      selectionEnd,
    });

    if (
      latestPageIdRef.current !== insertPageId ||
      contentVersionRef.current !== insertVersion
    ) {
      return;
    }

    const next = readInsertTextResult(
      output,
      insertMarkdown,
      text,
      selectionStart,
    );

    nextCaretRef.current = next;
    contentVersionRef.current += 1;
    dispatch({
      type: "edit",
      markdown: next.markdown,
    });
  }

  async function saveMarkdown() {
    if (!canSave || pageFacade === undefined) {
      return;
    }

    const savePageId = pageId;
    const saveMarkdown = markdown;
    const saveVersion = contentVersionRef.current;

    dispatch({ type: "save-started" });

    let completedMarkdown = saveMarkdown;
    let completedBody: StructuredMarkdownDocument | undefined;
    let applySavedMarkdown = false;

    try {
      const savedPage = await pageFacade.save({
        pageId: savePageId,
        markdown: saveMarkdown,
      });

      completedMarkdown = savedPage.markdown;
      completedBody = savedPage.body;
      applySavedMarkdown =
        latestPageIdRef.current === savePageId &&
        contentVersionRef.current === saveVersion;
    } finally {
      dispatch({
        type: "save-finished",
        pageId: savePageId,
        markdown: completedMarkdown,
        body: completedBody,
        applySavedMarkdown,
      });
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    contentVersionRef.current += 1;
    dispatch({
      type: "edit",
      markdown: event.target.value,
    });
  }

  async function openStructuredTaskPage(sourceBlockId: string) {
    const openPageId = pageId;
    const openVersion = contentVersionRef.current;
    const output = await commands.execute(openTaskPageCommandId, {
      sourcePageId: openPageId,
      sourceBlockId,
    });

    if (
      latestPageIdRef.current !== openPageId ||
      contentVersionRef.current !== openVersion
    ) {
      return;
    }

    const openedPageId = readOpenedPageId(output);

    props.onOpenPage?.(openedPageId);
  }

  async function toggleStructuredTaskStatus(task: StructuredTask) {
    if (currentStructuredBody === undefined) {
      return;
    }

    const togglePageId = pageId;
    const toggleVersion = contentVersionRef.current;
    const toggleBody = currentStructuredBody;
    const output = await commands.execute(toggleTaskStatusCommandId, {
      sourcePageId: togglePageId,
      sourceBlockId: task.sourceBlockId,
    });

    if (
      latestPageIdRef.current !== togglePageId ||
      contentVersionRef.current !== toggleVersion
    ) {
      return;
    }

    const result = readToggleTaskStatusResult(output);
    const nextBody = createStructuredBodyWithTaskStatus(
      toggleBody,
      task.index,
      result.status,
    );

    contentVersionRef.current += 1;
    dispatch({
      type: "edit",
      markdown: exportStructuredDocumentToMarkdown(nextBody),
      body: nextBody,
    });
  }

  if (pageFacade !== undefined && loadedPageId === undefined && state.loading) {
    return <section aria-busy="true" aria-label="Markdown editor" />;
  }

  return (
    <section aria-busy={state.loading}>
      <label>
        Markdown
        <textarea
          ref={areaRef}
          aria-label="Markdown"
          disabled={editorDisabled}
          onChange={handleChange}
          rows={16}
          value={markdown}
        />
      </label>
      <BaseMarkdownToolbar
        disabled={editorDisabled}
        onInsertText={insertText}
      />
      <TaskTitleButtons
        disabled={editorDisabled}
        tasks={structuredTasks}
        onOpenTaskPage={openStructuredTaskPage}
        onToggleTaskStatus={toggleStructuredTaskStatus}
      />
      <button
        type="button"
        disabled={!canSave}
        onClick={saveMarkdown}
      >
        Save
      </button>
    </section>
  );
}

function TaskTitleButtons({
  disabled,
  tasks,
  onOpenTaskPage,
  onToggleTaskStatus,
}: {
  disabled: boolean;
  tasks: readonly StructuredTask[];
  onOpenTaskPage(sourceBlockId: string): Promise<void>;
  onToggleTaskStatus(task: StructuredTask): Promise<void>;
}) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <div aria-label="Task titles">
      {tasks.map((task) => (
        <div
          key={`${task.sourceBlockId}:${task.index}`}
        >
          <label>
            <input
              type="checkbox"
              checked={task.status === "done"}
              disabled={disabled}
              onChange={() => {
                void onToggleTaskStatus(task);
              }}
            />
            {task.title}
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              void onOpenTaskPage(task.sourceBlockId);
            }}
          >
            {task.title}
          </button>
        </div>
      ))}
    </div>
  );
}

function readPageId(props: MarkdownPageEditorProps): string {
  return "pageId" in props ? props.pageId : props.page.id;
}

function readPageFacade(
  props: MarkdownPageEditorProps,
): MarkdownPageSource | undefined {
  return "pageFacade" in props ? props.pageFacade : undefined;
}

function readInitialMarkdown(props: MarkdownPageEditorProps): string {
  return "page" in props ? props.page.markdown : "";
}

function readStructuredBody(
  props: MarkdownPageEditorProps,
): StructuredMarkdownDocument | undefined {
  return "page" in props ? props.page.body : undefined;
}

function readExtensionSource(
  props: MarkdownPageEditorProps,
): MarkdownExtensionSource | undefined {
  return props.markdownRuntime;
}

function readCurrentStructuredBody(
  body: StructuredMarkdownDocument | undefined,
  markdown: string,
): StructuredMarkdownDocument | undefined {
  if (body === undefined) {
    return undefined;
  }

  return exportStructuredDocumentToMarkdown(body) === markdown ? body : undefined;
}

function createInitialEditorState(input: {
  initialMarkdown: string;
  initialBody?: StructuredMarkdownDocument;
  pageId: string;
  loadsFromPageSource: boolean;
}): EditorState {
  return {
    markdown: input.initialMarkdown,
    body: input.initialBody,
    loadedPageId: input.loadsFromPageSource ? undefined : input.pageId,
    loading: input.loadsFromPageSource,
    saving: false,
  };
}

function createDirectPageSignature(pageId: string, markdown: string): string {
  return `${pageId}\u0000${markdown}`;
}

function editorStateReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "direct-page":
      return {
        markdown: action.markdown,
        body: action.body,
        loadedPageId: action.pageId,
        loading: false,
        saving: false,
      };
    case "load-started":
      return {
        ...state,
        loading: true,
        saving: false,
      };
    case "load-succeeded":
      return {
        markdown: action.markdown,
        body: action.body,
        loadedPageId: action.pageId,
        loading: false,
        saving: false,
      };
    case "edit":
      return {
        ...state,
        markdown: action.markdown,
        ...(action.body === undefined ? {} : { body: action.body }),
      };
    case "save-started":
      return {
        ...state,
        saving: true,
      };
    case "save-finished":
      if (!action.applySavedMarkdown) {
        return {
          ...state,
          saving: false,
        };
      }

      return {
        ...state,
        markdown: action.markdown,
        body: action.body,
        loadedPageId: action.pageId,
        saving: false,
      };
  }
}

function readInsertTextResult(
  output: unknown,
  markdown: string,
  text: string,
  selectionStart: number,
): MarkdownInsertTextResult {
  if (isMarkdownInsertTextResult(output)) {
    return output;
  }

  const nextMarkdown = `${markdown.slice(0, selectionStart)}${text}${markdown.slice(
    selectionStart,
  )}`;
  const nextSelection = selectionStart + text.length;

  return {
    markdown: nextMarkdown,
    selectionStart: nextSelection,
    selectionEnd: nextSelection,
  };
}

function isMarkdownInsertTextResult(
  value: unknown,
): value is MarkdownInsertTextResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "markdown" in value &&
    typeof value.markdown === "string" &&
    "selectionStart" in value &&
    typeof value.selectionStart === "number" &&
    "selectionEnd" in value &&
    typeof value.selectionEnd === "number"
  );
}

type StructuredTask = {
  index: number;
  sourceBlockId: string;
  title: string;
  status: "todo" | "done";
};

function collectStructuredTasks(
  body: StructuredMarkdownDocument | undefined,
  extensions: readonly unknown[],
): readonly StructuredTask[] {
  if (body === undefined || !hasUncheckedTaskSyntax(extensions)) {
    return [];
  }

  return body.content.flatMap((block, index) => {
    const task = readStructuredTask(body.content, block, index);

    if (task === undefined) {
      return [];
    }

    return [
      {
        index,
        sourceBlockId: block.blockId,
        title: task.title,
        status: task.status,
      },
    ];
  });
}

function hasUncheckedTaskSyntax(extensions: readonly unknown[]): boolean {
  return extensions.some(
    (extension) =>
      isRecord(extension) &&
      typeof extension.syntax === "string" &&
      extension.syntax.trim() === "- [ ]",
  );
}

function readStructuredTask(
  blocks: readonly BlockNode[],
  block: BlockNode,
  index: number,
): Pick<StructuredTask, "title" | "status"> | undefined {
  if (block.type !== "markdown.line" || typeof block.text !== "string") {
    return undefined;
  }

  if (isInsideFencedCodeBlock(blocks, index)) {
    return undefined;
  }

  const match = taskLinePattern.exec(block.text);
  const title = match?.groups?.title?.trim() ?? "";

  if (match === null || title.length === 0) {
    return undefined;
  }

  return {
    title,
    status: match.groups?.marker === " " ? "todo" : "done",
  };
}

function createStructuredBodyWithTaskStatus(
  body: StructuredMarkdownDocument,
  taskIndex: number,
  status: "todo" | "done",
): StructuredMarkdownDocument {
  return {
    ...body,
    content: body.content.map((block, index) => {
      if (index !== taskIndex) {
        return block;
      }

      if (block.type !== "markdown.line" || typeof block.text !== "string") {
        return block;
      }

      return {
        ...block,
        text: replaceTaskMarker(block.text, status),
      };
    }),
  };
}

function replaceTaskMarker(text: string, status: "todo" | "done"): string {
  const match = taskLinePattern.exec(text);

  if (match === null) {
    return text;
  }

  const beforeMarker = match.groups?.beforeMarker ?? "";
  const afterMarker = match.groups?.afterMarker ?? "";
  const title = match.groups?.title ?? "";
  const marker = status === "done" ? "x" : " ";

  return `${beforeMarker}${marker}${afterMarker}${title}`;
}

function isInsideFencedCodeBlock(
  blocks: readonly BlockNode[],
  targetIndex: number,
): boolean {
  let activeFence: string | undefined;

  for (let index = 0; index < targetIndex; index += 1) {
    const block = blocks[index];

    if (block?.type !== "markdown.line" || typeof block.text !== "string") {
      continue;
    }

    const fence = matchFenceMarker(block.text);

    if (fence === undefined) {
      continue;
    }

    if (activeFence === undefined) {
      activeFence = fence;
    } else if (fence[0] === activeFence[0] && fence.length >= activeFence.length) {
      activeFence = undefined;
    }
  }

  return activeFence !== undefined;
}

function matchFenceMarker(line: string): string | undefined {
  const match = fenceLinePattern.exec(line);

  return match?.groups?.fence;
}

function readOpenedPageId(output: unknown): string {
  if (
    isRecord(output) &&
    typeof output.pageId === "string" &&
    output.pageId.trim().length > 0
  ) {
    return output.pageId;
  }

  throw new Error("Task open command did not return pageId");
}

function readToggleTaskStatusResult(output: unknown): {
  pageId: string;
  status: "todo" | "done";
} {
  if (
    isRecord(output) &&
    typeof output.pageId === "string" &&
    output.pageId.trim().length > 0 &&
    (output.status === "todo" || output.status === "done")
  ) {
    return {
      pageId: output.pageId,
      status: output.status,
    };
  }

  throw new Error("Task toggle command did not return pageId and status");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type ChangeEvent,
} from "react";

import type { MarkdownInsertTextResult } from "../commands/insert-text";
import { BaseMarkdownToolbar } from "./BaseMarkdownToolbar";

type MarkdownEditorDocument = {
  id: string;
  title: string;
  markdown: string;
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

type DirectMarkdownPageEditorProps = {
  page: MarkdownEditorDocument;
  commands: MarkdownCommandBus;
  markdownRuntime?: MarkdownExtensionSource;
};

type LoadedMarkdownPageEditorProps = {
  pageId: string;
  pageFacade: MarkdownPageSource;
  commands: MarkdownCommandBus;
  markdownRuntime?: MarkdownExtensionSource;
};

export type MarkdownPageEditorProps =
  | DirectMarkdownPageEditorProps
  | LoadedMarkdownPageEditorProps;

type EditorState = {
  markdown: string;
  loadedPageId?: string;
  loading: boolean;
  saving: boolean;
};

type EditorAction =
  | {
      type: "direct-page";
      pageId: string;
      markdown: string;
    }
  | {
      type: "load-started";
    }
  | {
      type: "load-succeeded";
      pageId: string;
      markdown: string;
    }
  | {
      type: "edit";
      markdown: string;
    }
  | {
      type: "save-started";
    }
  | {
      type: "save-finished";
      pageId: string;
      markdown: string;
      applySavedMarkdown: boolean;
    };

const insertCommandId = "markdown.insert-text";

export function MarkdownPageEditor(props: MarkdownPageEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextCaretRef = useRef<MarkdownInsertTextResult | null>(null);
  const contentVersionRef = useRef(0);
  const latestPageIdRef = useRef("");
  const loadGenerationRef = useRef(0);
  const pageId = readPageId(props);
  const pageFacade = readPageFacade(props);
  const initialMarkdown = readInitialMarkdown(props);
  const directPageSignatureRef = useRef(
    pageFacade === undefined
      ? createDirectPageSignature(pageId, initialMarkdown)
      : "",
  );
  const commands = props.commands;
  const extensionSource = readExtensionSource(props);
  const [state, dispatch] = useReducer(
    editorStateReducer,
    undefined,
    () =>
      createInitialEditorState({
        initialMarkdown,
        pageId,
        loadsFromPageSource: pageFacade !== undefined,
      }),
  );
  const { markdown, loadedPageId } = state;
  const collectedExtensions = extensionSource?.collectEditorExtensions() ?? [];
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

    if (directPageSignatureRef.current === directPageSignature) {
      return;
    }

    directPageSignatureRef.current = directPageSignature;
    contentVersionRef.current += 1;
    dispatch({
      type: "direct-page",
      pageId,
      markdown: initialMarkdown,
    });
  }, [initialMarkdown, pageFacade, pageId]);

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
    let applySavedMarkdown = false;

    try {
      const savedPage = await pageFacade.save({
        pageId: savePageId,
        markdown: saveMarkdown,
      });

      completedMarkdown = savedPage.markdown;
      applySavedMarkdown =
        latestPageIdRef.current === savePageId &&
        contentVersionRef.current === saveVersion;
    } finally {
      dispatch({
        type: "save-finished",
        pageId: savePageId,
        markdown: completedMarkdown,
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

function readExtensionSource(
  props: MarkdownPageEditorProps,
): MarkdownExtensionSource | undefined {
  return props.markdownRuntime;
}

function createInitialEditorState(input: {
  initialMarkdown: string;
  pageId: string;
  loadsFromPageSource: boolean;
}): EditorState {
  return {
    markdown: input.initialMarkdown,
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
        loadedPageId: action.pageId,
        loading: false,
        saving: false,
      };
    case "edit":
      return {
        ...state,
        markdown: action.markdown,
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

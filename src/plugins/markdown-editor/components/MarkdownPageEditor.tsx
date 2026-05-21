import {
  useCallback,
  useEffect,
  useRef,
  useState,
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

type DirectMarkdownPageEditorProps = {
  page: MarkdownEditorDocument;
  commands: MarkdownCommandBus;
};

type LoadedMarkdownPageEditorProps = {
  pageId: string;
  pageFacade: MarkdownPageSource;
  commands: MarkdownCommandBus;
};

export type MarkdownPageEditorProps =
  | DirectMarkdownPageEditorProps
  | LoadedMarkdownPageEditorProps;

const insertCommandId = "markdown.insert-text";

export function MarkdownPageEditor(props: MarkdownPageEditorProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextCaretRef = useRef<MarkdownInsertTextResult | null>(null);
  const pageId = readPageId(props);
  const pageFacade = readPageFacade(props);
  const initialMarkdown = readInitialMarkdown(props);
  const commands = props.commands;
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [isLoading, setIsLoading] = useState(() => pageFacade !== undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (pageFacade === undefined) {
      return;
    }

    let isCurrent = true;

    void pageFacade.load(pageId).then((page) => {
      if (!isCurrent) {
        return;
      }

      setMarkdown(page.markdown);
      setIsLoading(false);
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

  useEffect(() => {
    const textarea = areaRef.current;

    if (textarea !== null && textarea.value !== markdown) {
      textarea.value = markdown;
    }
  }, [markdown]);

  const insertText = useCallback(
    async (text: string) => {
      const textarea = areaRef.current;
      const selectionStart = textarea?.selectionStart ?? markdown.length;
      const selectionEnd = textarea?.selectionEnd ?? selectionStart;
      const output = await commands.execute(insertCommandId, {
        pageId,
        markdown,
        text,
        selectionStart,
        selectionEnd,
      });
      const next = readInsertTextResult(output, markdown, text, selectionStart);

      nextCaretRef.current = next;
      setMarkdown(next.markdown);
    },
    [commands, markdown, pageId],
  );

  const saveMarkdown = useCallback(async () => {
    if (pageFacade === undefined) {
      return;
    }

    setIsSaving(true);

    try {
      const savedPage = await pageFacade.save({
        pageId,
        markdown,
      });

      setMarkdown(savedPage.markdown);
    } finally {
      setIsSaving(false);
    }
  }, [markdown, pageFacade, pageId]);

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setMarkdown(event.target.value);
  }, []);

  if (isLoading) {
    return <section aria-busy="true" aria-label="Markdown editor" />;
  }

  return (
    <section>
      <label>
        Markdown
        <textarea
          ref={areaRef}
          aria-label="Markdown"
          disabled={isLoading}
          onChange={handleChange}
          rows={16}
        />
      </label>
      <BaseMarkdownToolbar disabled={isLoading} onInsertText={insertText} />
      <button
        type="button"
        disabled={isLoading || isSaving || pageFacade === undefined}
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

export type MarkdownInsertTextInput = {
  pageId?: string;
  markdown: string;
  text: string;
  selectionStart?: number;
  selectionEnd?: number;
};

export type MarkdownInsertTextResult = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

export function insertMarkdownText(
  input: MarkdownInsertTextInput,
): MarkdownInsertTextResult {
  const normalizedInput =
    typeof input === "object" && input !== null ? input : {};
  const markdown =
    "markdown" in normalizedInput &&
    typeof normalizedInput.markdown === "string"
      ? normalizedInput.markdown
      : "";
  const text =
    "text" in normalizedInput && typeof normalizedInput.text === "string"
      ? normalizedInput.text
      : "";
  const selectionStart = normalizeSelectionOffset(
    "selectionStart" in normalizedInput
      ? normalizedInput.selectionStart
      : undefined,
    markdown.length,
  );
  const selectionEnd = normalizeSelectionOffset(
    "selectionEnd" in normalizedInput ? normalizedInput.selectionEnd : undefined,
    markdown.length,
  );
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const nextMarkdown = `${markdown.slice(0, start)}${text}${markdown.slice(
    end,
  )}`;
  const nextSelectionOffset = start + text.length;

  return {
    markdown: nextMarkdown,
    selectionStart: nextSelectionOffset,
    selectionEnd: nextSelectionOffset,
  };
}

function normalizeSelectionOffset(
  value: unknown,
  markdownLength: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return markdownLength;
  }

  return Math.min(Math.max(Math.trunc(value), 0), markdownLength);
}

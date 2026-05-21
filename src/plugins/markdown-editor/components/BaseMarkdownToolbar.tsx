export type BaseMarkdownToolbarProps = {
  disabled?: boolean;
  onInsertText(text: string): void;
};

export function BaseMarkdownToolbar({
  disabled = false,
  onInsertText,
}: BaseMarkdownToolbarProps) {
  return (
    <div aria-label="Markdown shortcuts">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onInsertText("- [ ] ")}
      >
        Insert task syntax
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onInsertText("#")}
      >
        Insert heading or tag marker
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onInsertText("[[ ]]")}
      >
        Insert page link syntax
      </button>
    </div>
  );
}

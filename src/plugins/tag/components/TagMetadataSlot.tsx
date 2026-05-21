import { useId, useState, type FormEvent } from "react";

export type TagMetadataSlotProps = {
  pageId: string;
  tags: readonly string[];
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

type TagCommandResult = {
  pageId: string;
  tags: string[];
};

type CommandTags = {
  pageId: string;
  tags: readonly string[];
};

const addTagCommandId = "tag.add-tag";
const removeTagCommandId = "tag.remove-tag";
const tagPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const rawTagPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u;

export function TagMetadataSlot({
  pageId,
  tags,
  commands,
}: TagMetadataSlotProps) {
  const inputId = useId();
  const [commandTags, setCommandTags] = useState<CommandTags | null>(null);
  const [draftTag, setDraftTag] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const visibleTags = commandTags?.pageId === pageId ? commandTags.tags : tags;

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidDraftTag(draftTag)) {
      setFeedback("Enter a valid tag before adding it.");
      return;
    }

    try {
      const result = await commands.execute(addTagCommandId, {
        pageId,
        tag: draftTag,
      });
      const commandResult = readTagCommandResult(result, pageId);

      setCommandTags({
        pageId: commandResult.pageId,
        tags: commandResult.tags,
      });
      setDraftTag("");
      setFeedback(null);
    } catch {
      setFeedback("Tag update failed.");
    }
  }

  async function removeTag(tag: string) {
    try {
      const result = await commands.execute(removeTagCommandId, {
        pageId,
        tag,
      });
      const commandResult = readTagCommandResult(result, pageId);

      setCommandTags({
        pageId: commandResult.pageId,
        tags: commandResult.tags,
      });
      setFeedback(null);
    } catch {
      setFeedback("Tag update failed.");
    }
  }

  return (
    <section aria-label="Tags">
      <ul aria-label="Page tags">
        {visibleTags.map((tag) => (
          <li key={tag}>
            <span>{`#${tag}`}</span>
            <button
              type="button"
              aria-label={`Remove #${tag}`}
              onClick={() => {
                void removeTag(tag);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void addTag(event)}>
        <label htmlFor={inputId}>Tag</label>
        <input
          id={inputId}
          value={draftTag}
          onChange={(event) => setDraftTag(event.currentTarget.value)}
        />
        <button type="submit">Add tag</button>
      </form>
      {feedback === null ? null : <p role="alert">{feedback}</p>}
    </section>
  );
}

function isValidDraftTag(value: string): boolean {
  const trimmed = value.trim();
  const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

  return (
    rawTagPattern.test(withoutHash) &&
    tagPattern.test(withoutHash.toLowerCase())
  );
}

function readTagCommandResult(
  result: unknown,
  expectedPageId: string,
): TagCommandResult {
  if (
    !isRecord(result) ||
    typeof result.pageId !== "string" ||
    !Array.isArray(result.tags)
  ) {
    throw new Error("Tag command returned an invalid result");
  }

  if (result.pageId !== expectedPageId) {
    throw new Error("Tag command returned tags for a different page");
  }

  for (const tag of result.tags) {
    if (typeof tag !== "string") {
      throw new Error("Tag command returned invalid tags");
    }
  }

  return {
    pageId: result.pageId,
    tags: result.tags,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

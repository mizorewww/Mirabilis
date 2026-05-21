import { useState, type FormEvent } from "react";

export type TagMetadataSlotProps = {
  pageId: string;
  tags: readonly string[];
  commands: {
    execute(commandId: string, input?: unknown): Promise<unknown>;
  };
};

type TagCommandResult = {
  tags: string[];
};

type CommandTags = {
  pageId: string;
  tags: readonly string[];
};

const addTagCommandId = "tag.add-tag";
const removeTagCommandId = "tag.remove-tag";

export function TagMetadataSlot({
  pageId,
  tags,
  commands,
}: TagMetadataSlotProps) {
  const [commandTags, setCommandTags] = useState<CommandTags | null>(null);
  const [draftTag, setDraftTag] = useState("");
  const visibleTags = commandTags?.pageId === pageId ? commandTags.tags : tags;

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await commands.execute(addTagCommandId, {
      pageId,
      tag: draftTag,
    });

    setCommandTags({
      pageId,
      tags: readTagCommandResult(result).tags,
    });
    setDraftTag("");
  }

  async function removeTag(tag: string) {
    const result = await commands.execute(removeTagCommandId, {
      pageId,
      tag,
    });

    setCommandTags({
      pageId,
      tags: readTagCommandResult(result).tags,
    });
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
        <label htmlFor="tag-metadata-slot-input">Tag</label>
        <input
          id="tag-metadata-slot-input"
          value={draftTag}
          onChange={(event) => setDraftTag(event.currentTarget.value)}
        />
        <button type="submit">Add tag</button>
      </form>
    </section>
  );
}

function readTagCommandResult(result: unknown): TagCommandResult {
  if (!isRecord(result) || !Array.isArray(result.tags)) {
    throw new Error("Tag command returned an invalid result");
  }

  for (const tag of result.tags) {
    if (typeof tag !== "string") {
      throw new Error("Tag command returned invalid tags");
    }
  }

  return {
    tags: result.tags,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

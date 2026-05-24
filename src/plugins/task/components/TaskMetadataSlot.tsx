export type TaskMetadataSlotProps = {
  values?: Readonly<Record<string, unknown>>;
};

const taskFields = [
  { key: "status", label: "Status" },
  { key: "scheduled", label: "Scheduled" },
  { key: "due", label: "Due" },
  { key: "enabled", label: "Enabled" },
  { key: "sourcePageId", label: "Source page" },
  { key: "sourceBlockId", label: "Source block" },
] as const;

export function TaskMetadataSlot({ values = {} }: TaskMetadataSlotProps) {
  const visibleFields = taskFields
    .map((field) => ({
      ...field,
      value: values[field.key],
    }))
    .filter((field) => field.value !== undefined);

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <section role="group" aria-label="Task metadata">
      <dl>
        {visibleFields.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{formatMetadataValue(field.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

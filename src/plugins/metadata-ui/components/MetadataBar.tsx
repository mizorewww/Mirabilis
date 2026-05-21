import { createElement, type ReactNode } from "react";

import type {
  MetadataFieldContribution,
  MetadataRecord,
  MetadataValueType,
  PluginHostRecord,
  SlotContribution,
  SlotRegistry,
} from "../../../core";

export type MetadataBarCommandExecutor = {
  execute(commandId: string, input?: unknown): Promise<unknown>;
};

export type MetadataBarProps = {
  pageId: string;
  metadata: readonly MetadataRecord[];
  slots: Pick<SlotRegistry, "list">;
  commands: MetadataBarCommandExecutor;
  pluginHost?: {
    listPlugins?(): readonly PluginHostRecord[];
  };
};

export type MetadataFieldSlotProps = {
  pageId: string;
  pluginId: string;
  fields: readonly TrustedMetadataField[];
  values: Readonly<Record<string, unknown>>;
  commands: MetadataBarCommandExecutor;
};

export type TrustedMetadataField = {
  id: string;
  namespace: string;
  key: string;
  valueType: MetadataValueType;
  name?: string;
  description?: string;
};

const pageHeaderMetadataSlot = "page.header.metadata";
const unsafeMetadataSegments = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const metadataSegmentPattern = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const metadataValueTypes = new Set([
  "string",
  "number",
  "boolean",
  "json",
  "date",
  "null",
]);

export function MetadataBar({
  pageId,
  metadata,
  slots,
  commands,
  pluginHost,
}: MetadataBarProps) {
  const activePlugins = collectActivePluginRecords(pluginHost);
  const contributions = slots.list({ slot: pageHeaderMetadataSlot });

  return (
    <section aria-label="Page metadata">
      {activePlugins === null
        ? null
        : contributions.map((contribution) =>
            renderContribution({
              activePlugins,
              commands,
              contribution,
              metadata,
              pageId,
            }),
          )}
    </section>
  );
}

function renderContribution(input: {
  activePlugins: ReadonlyMap<string, PluginHostRecord>;
  commands: MetadataBarCommandExecutor;
  contribution: SlotContribution;
  metadata: readonly MetadataRecord[];
  pageId: string;
}): ReactNode {
  const { activePlugins, commands, contribution, metadata, pageId } = input;
  const activePlugin = activePlugins.get(contribution.pluginId);

  if (activePlugin === undefined) {
    return null;
  }

  const fields = collectTrustedFields(activePlugin);
  const values = collectTrustedValues({
    fields,
    metadata,
    pageId,
    pluginId: contribution.pluginId,
  });
  const scopedCommands = createScopedCommandExecutor(
    commands,
    contribution.pluginId,
  );
  const props: MetadataFieldSlotProps = {
    pageId,
    pluginId: contribution.pluginId,
    fields,
    values,
    commands: scopedCommands,
  };

  if (typeof contribution.when === "function" && !contribution.when(props)) {
    return null;
  }

  return createElement(
    contribution.component as (props: MetadataFieldSlotProps) => ReactNode,
    {
      key: contribution.id,
      ...props,
    },
  );
}

function collectActivePluginRecords(
  pluginHost: MetadataBarProps["pluginHost"],
): ReadonlyMap<string, PluginHostRecord> | null {
  const records = pluginHost?.listPlugins?.();

  if (records === undefined) {
    return null;
  }

  const activePlugins = new Map<string, PluginHostRecord>();

  for (const record of records) {
    if (record.enabled && record.status === "active") {
      activePlugins.set(record.id, record);
    }
  }

  return activePlugins;
}

function collectTrustedFields(
  activePlugin: PluginHostRecord | undefined,
): TrustedMetadataField[] {
  if (activePlugin === undefined) {
    return [];
  }

  const fields = activePlugin.manifest.contributes?.metadataFields;

  if (!Array.isArray(fields)) {
    return [];
  }

  const trustedFields: TrustedMetadataField[] = [];

  for (const field of fields as readonly unknown[]) {
    if (!isTrustedMetadataField(field, activePlugin.id)) {
      continue;
    }

    trustedFields.push({
      id: field.id,
      namespace: field.namespace,
      key: field.key,
      valueType: field.valueType,
      ...(field.name === undefined ? {} : { name: field.name }),
      ...(field.description === undefined
        ? {}
        : { description: field.description }),
    });
  }

  return trustedFields;
}

function collectTrustedValues(input: {
  fields: readonly TrustedMetadataField[];
  metadata: readonly MetadataRecord[];
  pageId: string;
  pluginId: string;
}): Readonly<Record<string, unknown>> {
  const { fields, metadata, pageId, pluginId } = input;
  const trustedFields = new Map(
    fields.map((field) => [createMetadataFieldIdentity(field), field]),
  );
  const values = Object.create(null) as Record<string, unknown>;

  for (const record of metadata) {
    const trustedField = trustedFields.get(createMetadataFieldIdentity(record));

    if (
      record.pageId !== pageId ||
      record.sourcePluginId !== pluginId ||
      trustedField === undefined ||
      record.valueType !== trustedField.valueType
    ) {
      continue;
    }

    values[record.key] = record.value;
  }

  return values;
}

function isTrustedMetadataField(
  field: unknown,
  pluginId: string,
): field is Required<
  Pick<MetadataFieldContribution, "id" | "namespace" | "key" | "valueType">
> &
  MetadataFieldContribution & {
  namespace: string;
  key: string;
  valueType: MetadataValueType;
} {
  if (typeof field !== "object" || field === null || Array.isArray(field)) {
    return false;
  }

  const descriptor = field as {
    id?: unknown;
    namespace?: unknown;
    key?: unknown;
    name?: unknown;
    description?: unknown;
    valueType?: unknown;
  };

  return (
    typeof descriptor.id === "string" &&
    descriptor.id.trim().length > 0 &&
    typeof descriptor.namespace === "string" &&
    descriptor.namespace === pluginId &&
    isSafeMetadataSegment(descriptor.namespace) &&
    typeof descriptor.key === "string" &&
    isSafeMetadataSegment(descriptor.key) &&
    typeof descriptor.valueType === "string" &&
    isMetadataValueType(descriptor.valueType) &&
    (descriptor.name === undefined || typeof descriptor.name === "string") &&
    (descriptor.description === undefined ||
      typeof descriptor.description === "string")
  );
}

function isSafeMetadataSegment(value: string): boolean {
  return metadataSegmentPattern.test(value) && !unsafeMetadataSegments.has(value);
}

function isMetadataValueType(value: string): value is MetadataValueType {
  return metadataValueTypes.has(value);
}

function createScopedCommandExecutor(
  commands: MetadataBarCommandExecutor,
  pluginId: string,
): MetadataBarCommandExecutor {
  return {
    execute(commandId, input) {
      if (!commandBelongsToPlugin(commandId, pluginId)) {
        return Promise.reject(
          new Error(`Metadata field cannot execute command ${commandId}`),
        );
      }

      return commands.execute(commandId, input);
    },
  };
}

function commandBelongsToPlugin(commandId: string, pluginId: string): boolean {
  return commandId === pluginId || commandId.startsWith(`${pluginId}.`);
}

function createMetadataFieldIdentity(input: {
  namespace: string;
  key: string;
}): string {
  return `${input.namespace}\u0000${input.key}`;
}

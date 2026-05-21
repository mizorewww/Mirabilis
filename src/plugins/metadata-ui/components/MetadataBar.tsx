import { createElement, type ReactNode } from "react";

import type {
  MetadataFieldContribution,
  MetadataRecord,
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
  valueType: MetadataFieldContribution["valueType"];
  name?: string;
  description?: string;
};

const pageHeaderMetadataSlot = "page.header.metadata";
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
      {contributions.map((contribution) =>
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
  activePlugins: ReadonlyMap<string, PluginHostRecord> | null;
  commands: MetadataBarCommandExecutor;
  contribution: SlotContribution;
  metadata: readonly MetadataRecord[];
  pageId: string;
}): ReactNode {
  const { activePlugins, commands, contribution, metadata, pageId } = input;
  const activePlugin = activePlugins?.get(contribution.pluginId);

  if (activePlugins !== null && activePlugin === undefined) {
    return null;
  }

  const fields = collectTrustedFields(activePlugin);
  const values = collectTrustedValues({
    fields,
    metadata,
    pageId,
    pluginId: contribution.pluginId,
  });
  const props: MetadataFieldSlotProps = {
    pageId,
    pluginId: contribution.pluginId,
    fields,
    values,
    commands,
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

  const fields = activePlugin?.manifest.contributes?.metadataFields ?? [];
  const trustedFields: TrustedMetadataField[] = [];

  for (const field of fields) {
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
  const trustedFieldIds = new Set(
    fields.map((field) => createMetadataFieldIdentity(field)),
  );
  const values: Record<string, unknown> = {};

  for (const record of metadata) {
    if (
      record.pageId !== pageId ||
      record.sourcePluginId !== pluginId ||
      !trustedFieldIds.has(createMetadataFieldIdentity(record))
    ) {
      continue;
    }

    values[record.key] = record.value;
  }

  return values;
}

function isTrustedMetadataField(
  field: MetadataFieldContribution,
  pluginId: string,
): field is MetadataFieldContribution & {
  namespace: string;
  key: string;
  valueType: NonNullable<MetadataFieldContribution["valueType"]>;
} {
  return (
    typeof field.namespace === "string" &&
    field.namespace === pluginId &&
    typeof field.key === "string" &&
    field.key.trim().length > 0 &&
    typeof field.valueType === "string" &&
    metadataValueTypes.has(field.valueType)
  );
}

function createMetadataFieldIdentity(input: {
  namespace: string;
  key: string;
}): string {
  return `${input.namespace}\u0000${input.key}`;
}

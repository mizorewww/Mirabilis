import {
  Component,
  createElement,
  memo,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

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

export type MetadataBarCommandDescriptor = {
  id: string;
  pluginId: string;
};

export type MetadataBarCommandRegistry = MetadataBarCommandExecutor & {
  get(commandId: string): MetadataBarCommandDescriptor;
};

export type MetadataBarProps = {
  pageId: string;
  metadata: readonly MetadataRecord[];
  slots: Pick<SlotRegistry, "list">;
  commands: MetadataBarCommandRegistry;
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
  const contributions = useMemo(
    () => listMetadataContributions(slots),
    [slots],
  );
  const visibleContributionCount = useStagedContributionCount(
    createContributionListKey(contributions),
    activePlugins === null ? 0 : contributions.length,
  );

  return (
    <section aria-label="Page metadata">
      {activePlugins === null
        ? null
        : contributions.slice(0, visibleContributionCount).map((contribution) => (
            <MetadataContributionBoundary
              key={contribution.id}
              resetKey={`${contribution.pluginId}:${contribution.id}:${pageId}`}
            >
              <MemoizedMetadataContributionRenderer
                activePlugins={activePlugins}
                commands={commands}
                contribution={contribution}
                metadata={metadata}
                pageId={pageId}
              />
            </MetadataContributionBoundary>
          ))}
    </section>
  );
}

function listMetadataContributions(
  slots: MetadataBarProps["slots"],
): SlotContribution[] {
  try {
    return slots.list({ slot: pageHeaderMetadataSlot });
  } catch {
    return [];
  }
}

function MetadataContributionRenderer(input: {
  activePlugins: ReadonlyMap<string, PluginHostRecord>;
  commands: MetadataBarCommandRegistry;
  contribution: SlotContribution;
  metadata: readonly MetadataRecord[];
  pageId: string;
}) {
  return renderContribution(input);
}

const MemoizedMetadataContributionRenderer = memo(
  MetadataContributionRenderer,
  (previous, next) =>
    previous.activePlugins === next.activePlugins &&
    previous.commands === next.commands &&
    previous.contribution === next.contribution &&
    previous.metadata === next.metadata &&
    previous.pageId === next.pageId,
);

type MetadataContributionBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type MetadataContributionBoundaryState = {
  hasFailure: boolean;
};

class MetadataContributionBoundary extends Component<
  MetadataContributionBoundaryProps,
  MetadataContributionBoundaryState
> {
  override state: MetadataContributionBoundaryState = {
    hasFailure: false,
  };

  static getDerivedStateFromError(): MetadataContributionBoundaryState {
    return {
      hasFailure: true,
    };
  }

  override componentDidCatch(): void {
    return undefined;
  }

  override componentDidUpdate(
    previousProps: MetadataContributionBoundaryProps,
  ): void {
    if (
      this.state.hasFailure &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({
        hasFailure: false,
      });
    }
  }

  override render(): ReactNode {
    if (this.state.hasFailure) {
      return (
        <div aria-label="Metadata contribution unavailable" role="alert">
          Metadata contribution unavailable
        </div>
      );
    }

    return this.props.children;
  }
}

function renderContribution(input: {
  activePlugins: ReadonlyMap<string, PluginHostRecord>;
  commands: MetadataBarCommandRegistry;
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

  return renderMetadataComponent(
    contribution.component,
    props,
  );
}

function renderMetadataComponent(
  component: SlotContribution["component"],
  props: MetadataFieldSlotProps,
): ReactNode {
  return (
    <MemoizedDeferredMetadataComponent
      component={component as ComponentType<MetadataFieldSlotProps>}
      props={props}
      propsKey={createMetadataPropsKey(props)}
    />
  );
}

function DeferredMetadataComponent({
  component,
  props,
}: {
  component: ComponentType<MetadataFieldSlotProps>;
  props: MetadataFieldSlotProps;
  propsKey: string;
}) {
  return createElement(component, props);
}

const MemoizedDeferredMetadataComponent = memo(
  DeferredMetadataComponent,
  (previous, next) =>
    previous.component === next.component && previous.propsKey === next.propsKey,
);

function useStagedContributionCount(key: string, total: number): number {
  const [stage, setStage] = useState(() => ({
    count: 0,
    key,
  }));
  const visibleCount = stage.key === key ? Math.min(stage.count, total) : 0;

  useLayoutEffect(() => {
    if (stage.key !== key) {
      // Staged plugin mounting keeps earlier boundaries committed before later plugin failures.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage({
        count: total > 0 ? 1 : 0,
        key,
      });
      return;
    }

    if (stage.count < total) {
      setStage({
        count: stage.count + 1,
        key,
      });
      return;
    }

    if (stage.count > total) {
      setStage({
        count: total,
        key,
      });
    }
  }, [key, stage.count, stage.key, total]);

  return visibleCount;
}

function createContributionListKey(
  contributions: readonly SlotContribution[],
): string {
  return contributions
    .map((contribution) => `${contribution.pluginId}:${contribution.id}`)
    .join("\u0000");
}

function createMetadataPropsKey(props: MetadataFieldSlotProps): string {
  const fieldsKey = props.fields
    .map((field) => `${field.namespace}.${field.key}:${field.valueType}`)
    .join("|");
  let valuesKey = "";

  try {
    valuesKey = JSON.stringify(props.values);
  } catch {
    valuesKey = "metadata-values-unavailable";
  }

  return `${props.pageId}:${props.pluginId}:${fieldsKey}:${valuesKey}`;
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
  commands: MetadataBarCommandRegistry,
  pluginId: string,
): MetadataBarCommandExecutor {
  return {
    async execute(commandId, input) {
      const lookup = lookupRegisteredCommandDescriptor(commands, commandId);

      if (lookup.kind === "found") {
        if (lookup.descriptor.pluginId !== pluginId) {
          throw new Error(`Metadata field cannot execute command ${commandId}`);
        }

        return commands.execute(lookup.descriptor.id, input);
      }

      throw new Error(`Metadata field cannot execute command ${commandId}`);
    },
  };
}

type CommandDescriptorLookup =
  | {
      kind: "found";
      descriptor: {
        id: string;
        pluginId: string;
      };
    }
  | {
      kind: "rejected";
    }
  | {
      kind: "unavailable";
    };

function lookupRegisteredCommandDescriptor(
  commands: MetadataBarCommandRegistry,
  commandId: string,
): CommandDescriptorLookup {
  const commandRegistry = commands as MetadataBarCommandExecutor & {
    get?: unknown;
  };

  if (typeof commandRegistry.get !== "function") {
    return { kind: "unavailable" };
  }

  try {
    const descriptor = commandRegistry.get(commandId);

    if (!isCommandDescriptorOwner(descriptor, commandId)) {
      return { kind: "rejected" };
    }

    return {
      kind: "found",
      descriptor,
    };
  } catch {
    return { kind: "rejected" };
  }
}

function isCommandDescriptorOwner(
  value: unknown,
  commandId: string,
): value is { id: string; pluginId: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const descriptor = value as {
    id?: unknown;
    pluginId?: unknown;
  };

  return (
    typeof descriptor.id === "string" &&
    descriptor.id === commandId &&
    descriptor.id.trim().length > 0 &&
    typeof descriptor.pluginId === "string" &&
    descriptor.pluginId.trim().length > 0
  );
}

function createMetadataFieldIdentity(input: {
  namespace: string;
  key: string;
}): string {
  return `${input.namespace}\u0000${input.key}`;
}

import type {
  FilterGroup,
  FilterQuery,
  FilterSort,
  MetadataJsonValue,
  ViewDataShape,
} from "../types";

export type MarkdownSyntaxContribution = {
  id: string;
  name?: string;
  description?: string;
  syntax?: string;
};

export type MetadataFieldContribution = {
  id: string;
  namespace?: string;
  key?: string;
  name?: string;
  description?: string;
  valueType?: string;
};

export type EventTypeContribution = {
  id: string;
  namespace?: string;
  type?: string;
  name?: string;
  description?: string;
  payloadSchema?: unknown;
};

export type CommandContribution = {
  id: string;
  title: string;
  description?: string;
  defaultShortcut?: string;
  context?: MetadataJsonValue;
};

export type FilterContribution = {
  id: string;
  name: string;
  query: FilterQuery;
  sort?: readonly FilterSort[];
  group?: FilterGroup;
  viewType: string;
};

export type ViewContribution = {
  id: string;
  type: string;
  title: string;
  accepts: ViewDataShape;
  description?: string;
};

export type PluginSlotContribution = {
  id: string;
  slot: string;
  order?: number;
  when?: MetadataJsonValue;
};

export type IndexerContribution = {
  id: string;
  name?: string;
  description?: string;
  input?: MetadataJsonValue;
};

export type AlgorithmContribution = {
  id: string;
  name?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

export type MobileToolbarContribution = {
  id: string;
  commandId: string;
  title: string;
  icon?: string;
  order?: number;
};

export type SettingsPanelContribution = {
  id: string;
  title: string;
  description?: string;
  order?: number;
};

export type PluginContributions = {
  markdownSyntax?: readonly MarkdownSyntaxContribution[];
  metadataFields?: readonly MetadataFieldContribution[];
  eventTypes?: readonly EventTypeContribution[];
  commands?: readonly CommandContribution[];
  filters?: readonly FilterContribution[];
  views?: readonly ViewContribution[];
  slots?: readonly PluginSlotContribution[];
  indexers?: readonly IndexerContribution[];
  algorithms?: readonly AlgorithmContribution[];
  mobileToolbarItems?: readonly MobileToolbarContribution[];
  settingsPanels?: readonly SettingsPanelContribution[];
};

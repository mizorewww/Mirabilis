import type {
  ComponentType,
  ExoticComponent,
  LazyExoticComponent,
} from "react";

import type { MetadataJsonValue } from "./metadata";

declare const defaultViewDefinitionProps: unique symbol;

type DefaultViewDefinitionProps = {
  readonly [defaultViewDefinitionProps]: typeof defaultViewDefinitionProps;
};

type RegistryReactComponent<Props = unknown> =
  | ComponentType<Props>
  | ExoticComponent<Props>
  | LazyExoticComponent<ComponentType<Props>>;

export type RegistryComponent<Props = unknown> = RegistryReactComponent<Props>;

export type ViewDataShape = MetadataJsonValue;

type ViewDefinitionComponent<Props> =
  | RegistryComponent<Props>
  | ([Props] extends [DefaultViewDefinitionProps] ? unknown : never);

export type ViewDefinition<Props = DefaultViewDefinitionProps> = {
  id: string;
  pluginId: string;
  type: string;
  title: string;
  component: ViewDefinitionComponent<Props>;
  accepts: ViewDataShape;
};

export type ViewRegistryErrorCode =
  | "VIEW_NOT_FOUND"
  | "VIEW_ID_COLLISION"
  | "VIEW_IDENTITY_REQUIRED"
  | "VIEW_PLUGIN_ID_REQUIRED"
  | "VIEW_TYPE_REQUIRED"
  | "VIEW_TITLE_REQUIRED"
  | "VIEW_COMPONENT_REQUIRED"
  | "VIEW_ACCEPTS_NOT_JSON_COMPATIBLE";

export type ListViewsOptions = {
  pluginId?: string;
  type?: string;
};

export type ViewRegistry = {
  register<Props = unknown>(
    definition: ViewDefinition<Props>,
  ): ViewDefinition<Props>;
  get(viewId: string): ViewDefinition;
  list(options?: ListViewsOptions): ViewDefinition[];
  unregister(viewId: string): ViewDefinition;
};

import type {
  ComponentType,
  ExoticComponent,
  LazyExoticComponent,
} from "react";

import type { MetadataJsonValue } from "./metadata";

type IsExactlyUnknown<Props> = [unknown] extends [Props]
  ? [Props] extends [unknown]
    ? true
    : false
  : false;

type RegistryReactComponent<Props = unknown> =
  | ComponentType<Props>
  | ExoticComponent<Props>
  | LazyExoticComponent<ComponentType<Props>>;

export type RegistryComponent<Props = unknown> =
  | RegistryReactComponent<Props>
  | (IsExactlyUnknown<Props> extends true ? object : never);

export type ViewDataShape = MetadataJsonValue;

type ViewDefinitionComponent<Props> = [Props] extends [never]
  ? RegistryComponent<unknown>
  : RegistryComponent<Props>;

export type ViewDefinition<Props = never> = {
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

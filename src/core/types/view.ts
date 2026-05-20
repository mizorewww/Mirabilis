import type { ComponentType, ExoticComponent } from "react";

import type { MetadataJsonValue } from "./metadata";

type RegistryCallableComponent =
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown);

type RegistryReactComponent<Props = unknown> =
  | ComponentType<Props>
  | ExoticComponent<Props>
  | RegistryCallableComponent;

export type RegistryObjectComponent<Props = unknown> =
  | {
      readonly $$typeof: symbol;
      readonly type: RegistryReactComponent<Props>;
    }
  | {
      readonly $$typeof: symbol;
      readonly _payload: unknown;
      readonly _init: (...args: unknown[]) => RegistryReactComponent<Props>;
    }
  | {
      readonly $$typeof: symbol;
      readonly _result: RegistryReactComponent<Props>;
    };

export type RegistryComponent<Props = unknown> =
  | RegistryReactComponent<Props>
  | RegistryObjectComponent<Props>;

export type ViewDataShape = MetadataJsonValue;

export type ViewDefinition<Props = unknown> = {
  id: string;
  pluginId: string;
  type: string;
  title: string;
  component: RegistryComponent<Props>;
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

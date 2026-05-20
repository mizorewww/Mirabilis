import type { PluginContributions } from "./contributions";

export type PluginDependency = {
  id: string;
  version?: string;
  optional?: boolean;
};

export type PluginPermission = {
  id: string;
  scope?: string;
  action?: string;
  description?: string;
};

export type PluginDependencyReference = string | PluginDependency;

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  minAppVersion: string;
  main?: string;
  dependencies?: readonly PluginDependencyReference[];
  optionalDependencies?: readonly PluginDependencyReference[];
  permissions?: readonly PluginPermission[];
  contributes?: PluginContributions;
};

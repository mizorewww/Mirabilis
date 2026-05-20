import type {
  PluginContext,
  PluginInstallContext,
  PluginUninstallContext,
} from "./context";
import type { PluginManifest } from "./manifest";

export type PluginLifecycleResult = void | Promise<void>;

export type AppPlugin = {
  manifest: PluginManifest;
  install?(ctx: PluginInstallContext): PluginLifecycleResult;
  activate?(ctx: PluginContext): PluginLifecycleResult;
  register(ctx: PluginContext): PluginLifecycleResult;
  deactivate?(ctx: PluginContext): PluginLifecycleResult;
  uninstall?(ctx: PluginUninstallContext): PluginLifecycleResult;
};

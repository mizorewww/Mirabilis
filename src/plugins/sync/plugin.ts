import type { AppPlugin } from "../../core";

export const SyncPlugin: AppPlugin = {
  manifest: {
    id: "sync",
    name: "Sync Plugin",
    version: "1.0.0",
    description: "Defines durable local data units for future synchronization.",
    minAppVersion: "0.1.0",
  },
  register() {},
};

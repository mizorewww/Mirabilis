import type { AppPlugin } from "../../core";

export const MetadataUiPlugin: AppPlugin = {
  manifest: {
    id: "metadata-ui",
    name: "Metadata UI Plugin",
    version: "1.0.0",
    description: "Render plugin-owned page metadata field contributions.",
    minAppVersion: "0.1.0",
  },
  register() {
    return undefined;
  },
};

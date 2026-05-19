import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(async (configEnv) => {
  const appConfig = await (typeof viteConfig === "function"
    ? viteConfig(configEnv)
    : viteConfig);

  return mergeConfig(
    appConfig,
    defineConfig({
      test: {
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
      },
    }),
  );
});

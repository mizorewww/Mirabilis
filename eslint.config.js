import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import jestDom from "eslint-plugin-jest-dom";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import testingLibrary from "eslint-plugin-testing-library";
import globals from "globals";
import tseslint from "typescript-eslint";

const testFiles = [
  "**/__tests__/**/*.{js,jsx,ts,tsx}",
  "**/*.{test,spec}.{js,jsx,ts,tsx}",
];

const appSourceFiles = ["src/**/*.{ts,tsx}"];
const nodeConfigFiles = ["eslint.config.js", "vite.config.ts", "vitest.config.ts"];

export default defineConfig([
  {
    ignores: ["dist", "node_modules", "src-tauri/target"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: appSourceFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: nodeConfigFiles,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: appSourceFiles,
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["src/**/*.{jsx,tsx}"],
    ...reactRefresh.configs.vite(),
  },
  {
    files: testFiles,
    ...testingLibrary.configs["flat/react"],
  },
  {
    files: testFiles,
    ...jestDom.configs["flat/recommended"],
  },
]);

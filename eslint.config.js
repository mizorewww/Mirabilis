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

export default defineConfig([
  {
    ignores: ["dist", "node_modules", "src-tauri/target"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        ...globals.node,
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ["**/*.{jsx,tsx}"],
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

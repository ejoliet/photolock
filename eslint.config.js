// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-offline/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // AIDEV-NOTE: browser globals for the small amount of plain-JS/DOM-facing code
    // (donate snippet); TS files get DOM types from tsconfig lib instead.
    languageOptions: {
      globals: { document: "readonly", window: "readonly", navigator: "readonly" },
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);

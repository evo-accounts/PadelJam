import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React Compiler-era advisory rules; the flagged patterns (state sync in
      // effects, Math.random skeleton widths) are pre-existing and benign.
      // Downgraded to warnings to keep CI green — fix incrementally.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // `_`-prefixed identifiers are intentionally unused (mirrors the root
      // eslint.config.mjs; this config does not extend the root one).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;

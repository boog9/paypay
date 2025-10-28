import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseIgnores = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.pnpm/**",
  "**/playwright-report/**",
  "**/test-results/**",
  "apps/frontend/app/(auth)/**",
  "apps/frontend/app/invoices/**",
  "apps/frontend/app/tenants/**",
  "apps/frontend/lib/api.ts",
  "apps/frontend/next-env.d.ts",
  "apps/frontend/postcss.config.js",
  "packages/sdk/src/gen/*.d.ts",
  "eslint.config.mjs"
];

export default tseslint.config(
  {
    ignores: baseIgnores,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaVersion: 2023,
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["apps/frontend/**/*.{ts,tsx}", "apps/frontend/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./apps/frontend/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/server-api",
              message: "Use apps/frontend/lib/bff-fetch.ts instead of the deprecated server-api helper.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/server-api", "**/lib/server-api.ts"],
              message: "Use apps/frontend/lib/bff-fetch.ts instead of the deprecated server-api helper.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/bff/src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./apps/bff/tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ["apps/bff/test/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./apps/bff/tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["apps/bff/jest.config.ts"],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: false,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    extends: [
      reactPlugin.configs.flat.recommended,
      reactPlugin.configs.flat["jsx-runtime"],
    ],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "react/jsx-curly-brace-presence": ["error", { props: "never", children: "never" }],
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx,js,jsx}"],
    languageOptions: {
      globals: {
        ...globals.vitest,
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/frontend/e2e/**/*.ts"],
    languageOptions: {
      globals: {
        page: "readonly",
        browser: "readonly",
        context: "readonly",
        test: "readonly",
        expect: "readonly",
      },
    },
  },
  prettier,
);

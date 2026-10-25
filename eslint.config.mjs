import globals from "globals";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

import { defineConfig } from "eslint/config";

const unusedVarsOptions = {
    varsIgnorePattern: "^_",
    argsIgnorePattern: "^_",
    caughtErrorsIgnorePattern: "^_",
    destructuredArrayIgnorePattern: "^_",
};

const rules = {
    "camelcase": ["error", {
        allow: ["^zlib_"],
    }],
    "sort-imports": ["off"],
    "prefer-template": ["error"],
    "prefer-const": ["error"],
    "no-shadow": ["warn", {
        "builtinGlobals": true,
    }],
    "@stylistic/indent": ["error", 4, {
        SwitchCase: 0,
    }],
    "@stylistic/quotes": ["error", "double"],
    "@stylistic/semi": ["error", "always"],
    "@stylistic/no-trailing-spaces": ["error"],
    "@stylistic/no-multi-spaces": ["error"],
    "@stylistic/object-curly-spacing": ["error", "always"],
    "@stylistic/template-curly-spacing": ["error", "never"],
    "@stylistic/arrow-parens": ["error", "as-needed", {
        "requireForBlockBody": true,
    }],
    "@stylistic/comma-dangle": ["error", "always-multiline"],
};

export default defineConfig([
    {
        files: ["common/buffered_processor.js"],
        languageOptions: {
            globals: {
                AudioWorkletProcessor: "readonly",
                registerProcessor: "readonly",
            },
        },
    },
    {
        files: ["**/*.js"],
        extends: [js.configs.recommended],
        languageOptions: {
            globals: globals.browser,
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            ...rules,
            "simple-import-sort/imports": ["error"],
            "simple-import-sort/exports": ["error"],
            "no-unused-vars": ["error", unusedVarsOptions],
            "sort-imports": ["off"],
        },
        plugins: {
            "@stylistic": stylistic,
            "simple-import-sort": simpleImportSort,
        },
    },
    {
        files: ["**/*.ts"],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            globals: globals.node,
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            ...rules,
            "simple-import-sort/imports": ["error"],
            "simple-import-sort/exports": ["error"],
            "no-unused-vars": ["off"],
            "@typescript-eslint/no-unused-vars": ["error", unusedVarsOptions],
            "sort-imports": ["off"],
        },
        plugins: {
            "@stylistic": stylistic,
            "simple-import-sort": simpleImportSort,
        },
    },
]);

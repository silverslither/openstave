import globals from "globals";
import js from "@eslint/js";
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
    indent: ["error", 4, {
        SwitchCase: 1,
    }],
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "prefer-template": ["error"],
    "prefer-const": ["error"],
    "no-trailing-spaces": ["error"],
    "no-multi-spaces": ["error"],
    "object-curly-spacing": ["error", "always"],
    "template-curly-spacing": ["error", "never"],
    "arrow-parens": ["error", "as-needed", {
        "requireForBlockBody": true,
    }],
    "comma-dangle": ["error", "always-multiline"],
    "no-shadow": ["warn", {
        "builtinGlobals": true,
    }],
    "sort-imports": "off",
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
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "no-unused-vars": ["error", unusedVarsOptions],
            "sort-imports": "off",
        },
        plugins: {
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
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", unusedVarsOptions],
            "sort-imports": "off",
        },
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
    },
]);

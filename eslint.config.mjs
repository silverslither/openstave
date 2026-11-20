import globals from "globals";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

import { defineConfig } from "eslint/config";

const braceStyle = stylistic.rules["brace-style"];
const localBraceStyle = {
    ...braceStyle,
    create(context) {
        const standard = braceStyle.create(context);
        const allman = braceStyle.create(Object.create(context, {
            options: { value: ["allman", { allowSingleLine: false }] },
        }));

        return {
            ...standard,
            BlockStatement(node) {
                const parent = node.parent;
                const wrappedIf = parent.type === "IfStatement"
                    && parent.consequent === node
                    && context.sourceCode.getTokenBefore(node).loc.end.line > parent.loc.start.line;
                (wrappedIf ? allman : standard).BlockStatement(node);
            },
        };
    },
};

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
    "prefer-template": ["error"],
    "prefer-const": ["error"],
    "no-empty": ["error", {
        allowEmptyCatch: true,
    }],
    "no-shadow": ["warn", {
        "builtinGlobals": true,
    }],
    "require-await": ["error"],
    "@stylistic/brace-style": "off",
    "local/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    "@stylistic/comma-style": ["error", "last", { exceptions: { ArrayPattern: true } }],
    "@stylistic/indent": ["error", 4, {
        SwitchCase: 0,
    }],
    "@stylistic/indent-binary-ops": ["error", 4],
    "@stylistic/quotes": ["error", "double"],
    "@stylistic/semi": ["error", "always"],
};

export default defineConfig([
    {
        plugins: { local: { rules: { "brace-style": localBraceStyle } } },
    },
    {
        files: ["web/common/buffered_processor.js"],
        languageOptions: {
            globals: {
                AudioWorkletProcessor: "readonly",
                registerProcessor: "readonly",
            },
        },
    },
    {
        files: ["**/*.js"],
        extends: [js.configs.recommended, stylistic.configs.recommended],
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
        },
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
    },
    {
        files: ["**/*.ts"],
        extends: [js.configs.recommended, tseslint.configs.recommended, stylistic.configs.recommended],
        languageOptions: {
            globals: globals.node,
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            ...rules,
            "simple-import-sort/imports": ["error"],
            "simple-import-sort/exports": ["error"],
            "@stylistic/member-delimiter-style": ["error", {
                multiline: { delimiter: "semi", requireLast: true },
                singleline: { delimiter: "semi", requireLast: false },
            }],
            "@typescript-eslint/no-unused-vars": ["error", unusedVarsOptions],
        },
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
    },
]);

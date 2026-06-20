import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

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
    "comma-dangle": ["error", "always-multiline"],
    "no-shadow": ["warn", {
        "builtinGlobals": true
    }],
    "sort-imports": ["warn"],
};

export default defineConfig([
    {
        files: ["**/*.js"],
        extends: [js.configs.recommended],
        languageOptions: {
            globals: globals.browser,
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules,
    },
    {
        files: ["**/*.ts"],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            globals: globals.node,
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules,
    }
]);

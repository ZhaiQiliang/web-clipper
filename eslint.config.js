const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        CONFIG: 'readonly',
        Readability: 'readonly',
        TurndownService: 'readonly',
        importScripts: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        require: 'readonly',
        module: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        DOMParser: 'readonly',
        alert: 'readonly',
        confirm: 'readonly'
      }
    },
    rules: {
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-undef': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'no-redeclare': 'off'
    }
  }
];

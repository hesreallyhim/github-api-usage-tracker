const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: {
      quotes: ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'never']
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module'
    }
  }
];

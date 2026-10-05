import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dist-server', 'data', 'test-results', 'playwright-report', 'blob-report'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // From the type-aware set, only the rules that catch real mistakes here: a save or a sync
      // nobody awaits fails in silence. The no-unsafe-* rules mostly flag JSON.parse.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    },
  },
  {
    // Offline first: the app reads and writes locally, and only the sync engine talks to the API.
    // illustrations.ts fetches static pictures into the service worker's cache.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/sync/**',
      'src/main.tsx',
      'src/illustrations/illustrations.ts',
      'src/**/*.test.{ts,tsx}',
      'src/test/**',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Pages never call the network: read and save through LocalRepository.' },
        { name: 'XMLHttpRequest', message: 'Pages never call the network: read and save through LocalRepository.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sync/engine'],
              importNames: ['httpSyncApi'],
              message: 'Only main.tsx wires the API; pages read and save through LocalRepository.',
            },
          ],
        },
      ],
    },
  },
  {
    // Sync stamps are UTC in whole milliseconds, from one place; a DateOnly is never a timestamp.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/sync/clock.ts', 'src/training/dates.ts', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message: 'Stamp with now() or nextStamp() from src/sync/clock.ts; format dates with src/training/dates.ts.',
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.{js,mjs,ts}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
)

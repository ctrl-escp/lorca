import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const lintTargets = [
  'eslint.config.mjs',
  'vitest.config.ts',
  'apps/web/playwright.config.ts',
  'apps/web/vite.config.ts',
  'apps/web/src/**/*.ts',
  'apps/web/tests/**/*.ts',
  'packages/*/src/**/*.ts',
  'packages/*/tests/**/*.ts',
];

const baseRules = {
  indent: ['error', 2, {SwitchCase: 1}],
  semi: ['error', 'always'],
  quotes: ['error', 'single', {avoidEscape: true}],
  'comma-dangle': ['error', 'always-multiline'],
  'object-curly-spacing': ['error', 'never'],
  'array-bracket-spacing': ['error', 'never'],
  'no-trailing-spaces': 'error',
  'no-multiple-empty-lines': ['error', {max: 1, maxEOF: 0}],
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-redeclare': 'error',
  'no-shadow': 'error',
  'no-return-await': 'error',
  'no-useless-catch': 'error',
  'consistent-return': 'error',
  'dot-notation': 'error',
  'no-fallthrough': 'error',
  'no-unreachable': 'error',
  'no-throw-literal': 'error',
  'no-unused-vars': [
    'warn',
    {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
  ],
  'no-debugger': 'error',
  'prefer-arrow-callback': 'error',
  'prefer-spread': 'error',
  'prefer-rest-params': 'error',
  'object-shorthand': ['error', 'always'],
};

export default [
  {
    ignores: [
      'apps/web/dist/',
      '**/dist/',
      '**/coverage/',
      '**/test-results/',
      '**/.vite/',
      '**/*tmp*/',
      '**/*tmp*.*',
    ],
  },
  {
    files: lintTargets,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: baseRules,
  },
  {
    files: lintTargets.filter((target) => target.endsWith('.ts')),
    plugins: {'@typescript-eslint': tsPlugin},
    languageOptions: {
      parser: tsParser,
      parserOptions: {projectService: true},
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'consistent-return': 'off',
      '@typescript-eslint/consistent-return': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
      ],
    },
  },
];

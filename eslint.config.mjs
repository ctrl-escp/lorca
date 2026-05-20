import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

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

const vueLintTargets = ['apps/web/src/**/*.vue', 'packages/ui-kit/src/**/*.vue'];

const tsLintTargets = lintTargets.filter((target) => target.endsWith('.ts'));

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

const tsRules = {
  ...tsPlugin.configs.recommended.rules,
  'consistent-return': 'off',
  '@typescript-eslint/consistent-return': 'error',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
  ],
};

/** Core indent conflicts with vue/html-indent in SFCs. */
const vueRuleOverrides = {
  indent: 'off',
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
    files: tsLintTargets,
    plugins: {'@typescript-eslint': tsPlugin},
    languageOptions: {
      parser: tsParser,
      parserOptions: {projectService: true},
    },
    rules: tsRules,
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: vueLintTargets,
    rules: {
      ...baseRules,
      ...vueRuleOverrides,
    },
  },
  {
    files: vueLintTargets,
    plugins: {'@typescript-eslint': tsPlugin},
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        projectService: true,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      ...tsRules,
      ...vueRuleOverrides,
    },
  },
];

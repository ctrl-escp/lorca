#!/usr/bin/env node
/**
 * Enforce acyclic package boundaries for the pipeline generator work.
 * See docs/07-improve-build-from-description-plan.md Phase 0.
 */
import {readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;

function fail(message) {
  console.error(`check-package-deps: ${message}`);
  failed = true;
}

function readPkg(relPath) {
  return JSON.parse(readFileSync(path.join(root, relPath), 'utf8'));
}

const pipelinePkg = readPkg('packages/pipeline/package.json');
const promptPkg = readPkg('packages/prompt/package.json');

if (pipelinePkg.dependencies?.['@lorca/capsules']) {
  fail('@lorca/pipeline must not depend on @lorca/capsules');
}
if (promptPkg.dependencies?.['@lorca/capsules']) {
  fail('@lorca/prompt must not depend on @lorca/capsules');
}

const endpointsPkg = readPkg('packages/endpoints/package.json');
if (endpointsPkg.dependencies?.['@lorca/pipeline']) {
  fail('@lorca/endpoints must not depend on @lorca/pipeline (would cycle with pipeline→endpoints)');
}

try {
  execSync('rg "apps/web" packages/ --glob "!**/tests/**"', {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  fail('packages/ must not import from apps/web');
} catch (err) {
  const status = err.status ?? err.code;
  if (status !== 1) {
    fail(`rg failed: ${err.message}`);
  }
}

if (failed) process.exit(1);
console.log('check-package-deps: ok');

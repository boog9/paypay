#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { existsSync, readdirSync } = require('fs');
const path = require('path');
const os = require('os');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  return result.status === null ? 0 : result.status;
}

function directoryHasEntries(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch (err) {
    return false;
  }
}

function findBrowserInstall() {
  const candidatePaths = new Set();

  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    candidatePaths.add(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }

  const projectRoot = process.cwd();
  candidatePaths.add(path.join(projectRoot, 'node_modules', '.cache', 'ms-playwright'));
  candidatePaths.add(path.join(projectRoot, '..', '..', 'node_modules', '.cache', 'ms-playwright'));
  candidatePaths.add(path.join(os.homedir(), '.cache', 'ms-playwright'));

  for (const candidate of candidatePaths) {
    if (existsSync(candidate) && directoryHasEntries(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

const vitestStatus = run('pnpm', ['exec', 'vitest', 'run']);
if (vitestStatus !== 0) {
  process.exit(vitestStatus);
}

if (process.env.SKIP_PLAYWRIGHT === '1') {
  console.log('Skipping Playwright tests because SKIP_PLAYWRIGHT=1');
  process.exit(0);
}

const browserInstall = findBrowserInstall();
if (!browserInstall) {
  console.warn(
    'Skipping Playwright tests because no browser binaries were detected. ' +
      'Install them via `pnpm --filter frontend exec playwright install` before running the E2E suite.'
  );
  process.exit(0);
}

const playwrightStatus = run('pnpm', ['exec', 'playwright', 'test']);
process.exit(playwrightStatus);

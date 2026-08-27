import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const deployScript = join(projectRoot, 'deploy.sh');
const nvmrc = join(projectRoot, '.nvmrc');

async function writeFakeNode(path, version) {
  await writeFile(path, `#!/usr/bin/env bash\nprintf '%s\\n' '${version}'\n`);
  await chmod(path, 0o755);
}

async function createRuntimeFixture(currentVersion, installedVersion) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'system-design-flashcards-node-'));
  const currentBin = join(temporaryRoot, 'current-bin');
  const nvmDir = join(temporaryRoot, 'nvm');
  await mkdir(currentBin, { recursive: true });
  if (currentVersion) await writeFakeNode(join(currentBin, 'node'), currentVersion);
  if (installedVersion) {
    const installedBin = join(nvmDir, 'versions', 'node', `v${installedVersion}`, 'bin');
    await mkdir(installedBin, { recursive: true });
    await writeFakeNode(join(installedBin, 'node'), `v${installedVersion}`);
  }
  return { temporaryRoot, currentBin, nvmDir };
}

function probeRuntime({ currentBin, nvmDir }) {
  return spawnSync(
    'bash',
    ['-c', 'source "$1"; ensure_supported_node; printf "node=%s\\n" "$(node --version)"; command -v node', 'deploy-runtime-test', deployScript],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, NVM_DIR: nvmDir, PATH: `${currentBin}:${process.env.PATH}` }
    }
  );
}

test('deployment pins Node 22 and selects an installed NVM runtime when default Node is old', async () => {
  const fixture = await createRuntimeFixture('v20.19.2', '22.23.1');
  try {
    assert.equal((await readFile(nvmrc, 'utf8')).trim(), '22');
    const result = probeRuntime(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Using Node\.js v22\.23\.1/);
    assert.match(result.stdout, /node=v22\.23\.1/);
    assert.match(result.stdout, /\/nvm\/versions\/node\/v22\.23\.1\/bin\/node/);
  } finally {
    await rm(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('deployment keeps a compatible default Node instead of switching runtimes', async () => {
  const fixture = await createRuntimeFixture('v23.1.0', '20.19.2');
  try {
    const result = probeRuntime(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Using Node\.js/);
    assert.match(result.stdout, /node=v23\.1\.0/);
    assert.match(result.stdout, /\/current-bin\/node/);
  } finally {
    await rm(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

test('deployment reports an actionable error when no compatible Node is installed', async () => {
  const fixture = await createRuntimeFixture('v20.19.2');
  try {
    const result = spawnSync(
      'bash',
      ['-c', 'source "$1"; ensure_supported_node', 'deploy-runtime-test', deployScript],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, NVM_DIR: fixture.nvmDir, PATH: `${fixture.currentBin}:${process.env.PATH}` }
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Node\.js 22 or newer is required \(found v20\.19\.2\)/);
    assert.match(result.stderr, /nvm install 22/);
  } finally {
    await rm(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

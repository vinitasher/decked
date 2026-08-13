import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const checkScript = join(projectRoot, 'check.sh');
const validFixture = 'const checkScriptFixture = true;\n';
const invalidFixture = 'const checkScriptFixture = ;\n';

async function createProjectCopy() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'system-design-flashcards-check-'));
  const temporaryProject = join(temporaryRoot, 'project');
  await mkdir(temporaryProject, { recursive: true });
  await cp(checkScript, join(temporaryProject, 'check.sh'));
  await Promise.all(['js', 'functions', 'scripts', 'server', 'tests', '.pages-dist'].map(
    directory => mkdir(join(temporaryProject, directory), { recursive: true })
  ));
  return { temporaryRoot, temporaryProject };
}

function runSyntaxCheck(temporaryProject) {
  return spawnSync(
    'bash',
    ['-c', 'source "$1" && syntax_check_sources', 'check-script-test', join(temporaryProject, 'check.sh')],
    { cwd: temporaryProject, encoding: 'utf8' }
  );
}

async function writeFixture(temporaryProject, fixturePath, contents) {
  const absolutePath = join(temporaryProject, fixturePath);
  await mkdir(join(absolutePath, '..'), { recursive: true });
  await writeFile(absolutePath, contents);
  return absolutePath;
}

test('syntax discovery covers runtime directories and top-level modules', async () => {
  const { temporaryRoot, temporaryProject } = await createProjectCopy();
  const fixtures = [
    'js/nested/check-fixture.js',
    'functions/shared/nested/check-fixture.mjs',
    'scripts/nested/check-fixture.js',
    'server/nested/check-fixture.mjs',
    'sw.js',
    'check-fixture.js',
    'check-fixture.mjs'
  ];

  try {
    for (const fixture of fixtures) await writeFixture(temporaryProject, fixture, validFixture);
    assert.equal(runSyntaxCheck(temporaryProject).status, 0);

    for (const fixture of fixtures) {
      await writeFixture(temporaryProject, fixture, invalidFixture);
      const result = runSyntaxCheck(temporaryProject);
      assert.notEqual(result.status, 0, `syntax error in ${fixture} should fail the check`);
      await writeFixture(temporaryProject, fixture, validFixture);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('missing, renamed, test, and generated files do not affect discovery', async () => {
  const { temporaryRoot, temporaryProject } = await createProjectCopy();
  const fixture = await writeFixture(temporaryProject, 'server/nested/check-fixture.js', validFixture);

  try {
    await writeFixture(temporaryProject, 'tests/check-fixture.js', invalidFixture);
    await writeFixture(temporaryProject, '.pages-dist/check-fixture.mjs', invalidFixture);
    assert.equal(runSyntaxCheck(temporaryProject).status, 0);

    await rename(fixture, `${fixture}.renamed`);
    assert.equal(runSyntaxCheck(temporaryProject).status, 0);

    await rm(`${fixture}.renamed`);
    assert.equal(runSyntaxCheck(temporaryProject).status, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('check script retains the existing verification commands', async () => {
  const checkScriptContents = await readFile(checkScript, 'utf8');

  assert.match(checkScriptContents, /node scripts\/audit-card-difficulties\.mjs/);
  assert.match(checkScriptContents, /node --test tests\/\*\.test\.mjs/);
  assert.match(checkScriptContents, /bash -n build\.sh/);
  assert.match(checkScriptContents, /bash -n deploy\.sh/);
  assert.match(checkScriptContents, /__FILL_ME_IN__/);
});

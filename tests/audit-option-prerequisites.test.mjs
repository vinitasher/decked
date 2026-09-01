import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditSnapshot,
  auditSnapshotFile,
  formatFindings,
  main
} from '../scripts/audit-option-prerequisites.mjs';

const snapshotPath = fileURLToPath(new URL('../server/production-card-cache.json', import.meta.url));

function fixtureCard(overrides = {}) {
  return {
    id: 'fixture-card',
    topic: 'caching',
    prerequisiteTopics: [
      'cache-aside', 'cache-misses', 'ttl-expiry', 'stale-reads',
      'hot-key-caching', 'request-coalescing', 'cache-hit-ratio', 'capacity-planning'
    ],
    options: [
      { id: 'A', label: 'Use a cache-aside policy', prerequisiteTopics: ['cache-aside', 'cache-misses'] },
      { id: 'B', label: 'Expire entries with a bounded TTL', prerequisiteTopics: ['ttl-expiry', 'stale-reads'] },
      { id: 'C', label: 'Protect hot keys from a stampede', prerequisiteTopics: ['hot-key-caching', 'request-coalescing'] },
      { id: 'D', label: 'Track hit ratio against capacity', prerequisiteTopics: ['cache-hit-ratio', 'capacity-planning'] }
    ],
    ...overrides
  };
}

function fixtureSnapshot(card = fixtureCard()) {
  return { 'caching:3': card };
}

test('passing fixture satisfies option shape, granularity, and aggregate union', () => {
  // Arrange
  const snapshot = fixtureSnapshot();

  // Act
  const findings = auditSnapshot(snapshot, { broadCategories: new Set(['caching']) });

  // Assert
  assert.deepEqual(findings, []);
});

test('failing fixture reports actionable per-card and per-option findings', () => {
  // Arrange
  const card = fixtureCard({
    prerequisiteTopics: ['caching', 'extra-aggregate'],
    options: [
      { id: 'A', label: 'Use Redis cluster directly', prerequisiteTopics: ['redis'] },
      { id: 'B', label: 'Use broad categories', prerequisiteTopics: ['caching', 'fixture-card'] },
      { id: 'C', label: 'Use invalid spelling', prerequisiteTopics: ['not kebab', 'valid-topic'] },
      { id: 'D', label: 'Use duplicate concepts', prerequisiteTopics: ['one-topic', 'one-topic', 'two-topic', 'three-topic', 'four-topic'] }
    ]
  });

  // Act
  const findings = auditSnapshot(fixtureSnapshot(card), { broadCategories: new Set(['caching']) });
  const output = formatFindings(findings);

  // Assert
  assert.ok(findings.some(finding => finding.message.includes('option A')));
  assert.ok(findings.some(finding => finding.message.includes('option B')));
  assert.ok(findings.some(finding => finding.message.includes('option C')));
  assert.ok(findings.some(finding => finding.message.includes('option D')));
  assert.ok(findings.some(finding => finding.message.includes('card prerequisiteTopics')));
  assert.match(output, /fixture-card/);
  assert.match(output, /copied product\/technology name/);
  assert.match(output, /broad catalog category/);
  assert.match(output, /repeats the card topic/);
  assert.match(output, /lowercase kebab-case/);
});

test('aggregate mismatch identifies missing and unexpected concepts', () => {
  // Arrange
  const card = fixtureCard({
    prerequisiteTopics: ['cache-aside', 'unexpected-topic']
  });

  // Act
  const findings = auditSnapshot(fixtureSnapshot(card));

  // Assert
  const aggregateFinding = findings.find(finding => finding.message.includes('must equal the deduplicated option union'));
  assert.ok(aggregateFinding);
  assert.match(aggregateFinding.message, /missing cache-misses/);
  assert.match(aggregateFinding.message, /unexpected unexpected-topic/);
});

test('committed production snapshot passes and audit does not mutate it', async () => {
  // Arrange
  const before = JSON.parse(await readFile(snapshotPath, 'utf8'));

  // Act
  const { snapshot, findings } = await auditSnapshotFile();

  // Assert
  assert.equal(Object.keys(snapshot).length, 11);
  assert.deepEqual(findings, []);
  assert.deepEqual(snapshot, before);
});

test('CLI returns a nonzero exit code for a bad snapshot', async () => {
  // Arrange
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'option-prerequisite-audit-'));
  const badSnapshotPath = join(temporaryRoot, 'bad-snapshot.json');
  await writeFile(badSnapshotPath, JSON.stringify(fixtureSnapshot({
    prerequisiteTopics: [],
    options: [{ id: 'A', label: 'Use Redis', prerequisiteTopics: ['redis', 'cache'] }]
  })));

  try {
    // Act
    const exitCode = await main(['--snapshot', badSnapshotPath]);

    // Assert
    assert.notEqual(exitCode, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

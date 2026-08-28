import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const proSetup = await readFile(new URL('../docs/pro-setup.md', import.meta.url), 'utf8');
const prewarmWorkflow = await readFile(new URL('../../.github/workflows/sandbox-prewarm.yml', import.meta.url), 'utf8');

test('README documents the deployed AI generation and daily quota model', () => {
  for (const staleClaim of [
    'No AI dependency for v1',
    'cards are hand-authored',
    'AI-assisted card generation can come later',
    'free tier for 10 cards/week'
  ]) {
    assert.ok(!readme.toLowerCase().includes(staleClaim.toLowerCase()), `stale claim: ${staleClaim}`);
  }

  for (const requiredStatement of [
    /generated on demand with AI/i,
    /cached for reuse/i,
    /offline seed-card fallback/i,
    /10 freshly generated cards and 10 wiki entries\s+per\s+UTC\s+day/i,
    /3\s+fresh generated Sandbox definitions/i,
    /bounded-pressure/i,
    /never executes provider-authored code or formulas/i,
    /Pro removes those limits/i,
    /cache hits do not consume quota/i
  ]) {
    assert.match(readme, requiredStatement);
  }
});

test('prewarm operations are documented and configured for serial token-safe runs', () => {
  assert.match(readme, /sends one topic, waits for its result, and only then sends the next/i);
  assert.match(proSetup, /SANDBOX_PREWARM_TOKEN/);
  assert.match(proSetup, /one topic and\s+waits for its result before submitting the next/i);
  assert.match(prewarmWorkflow, /workflow_dispatch/);
  assert.match(prewarmWorkflow, /cron: '17 \*\/6 \* \* \*'/);
  assert.match(prewarmWorkflow, /cancel-in-progress: false/);
  assert.match(prewarmWorkflow, /SANDBOX_PREWARM_TOKEN/);
  assert.match(prewarmWorkflow, /node scripts\/prewarm-sandboxes\.mjs/);
});

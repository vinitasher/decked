import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

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
    /Pro removes those limits/i,
    /cache hits do not consume quota/i
  ]) {
    assert.match(readme, requiredStatement);
  }
});

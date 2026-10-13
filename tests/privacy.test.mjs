import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../build.sh', import.meta.url), 'utf8');

test('privacy policy covers GDPR rights and required disclosures', () => {
  assert.match(privacy, /<title>Privacy Policy — Decked<\/title>/);
  assert.match(privacy, /General Data Protection Regulation \(GDPR\)/);
  assert.match(privacy, /data controller/i);
  assert.match(privacy, /right to erasure/);
  assert.match(privacy, /access the personal data/i);
  assert.match(privacy, /withdraw consent/i);
  assert.match(privacy, /supervisory authority/i);
  assert.match(privacy, /Standard Contractual Clauses/);
  assert.match(privacy, /Google AdSense/);
  assert.match(privacy, /Stripe/);
  assert.match(privacy, /Cloudflare/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /do not sell your personal data/i);
  assert.match(privacy, /children under 16/);
  assert.match(privacy, /mailto:vinitasher@gmail\.com/);
});

test('the site links to the privacy policy and ships the page', () => {
  assert.match(index, /href="\/privacy"/);
  assert.match(build, /privacy\.html/);
});

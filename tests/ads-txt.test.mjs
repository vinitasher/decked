import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adsTxt = await readFile(new URL('../ads.txt', import.meta.url), 'utf8');
const build = await readFile(new URL('../build.sh', import.meta.url), 'utf8');
const config = await readFile(new URL('../functions/api/config.js', import.meta.url), 'utf8');

test('ads.txt authorizes the AdSense publisher used by the site', () => {
  const client = config.match(/'ca-pub-(\d{16})'/)[1];
  assert.equal(adsTxt, `google.com, pub-${client}, DIRECT, f08c47fec0942fa0\n`);
});

test('the build publishes ads.txt at the site root', () => {
  assert.match(build, /cp -R [^\n]*\bads\.txt\b[^\n]*"\$OUTPUT_DIR\/"/);
});

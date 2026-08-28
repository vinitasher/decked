#!/usr/bin/env node

/* Sequentially converge the generated Sandbox cache from the bundled Wiki.
 *
 * The one-topic request and await in runPrewarm are intentional. Keep this
 * maintenance job low-concurrency because provider token budget matters more
 * here than filling the cache as quickly as possible.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PREWARM_URL = 'https://decked.pages.dev/api/sandbox/prewarm';
const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readWikiTopics(wikiPath = new URL('../js/wiki.js', import.meta.url)) {
  const source = await readFile(wikiPath, 'utf8');
  const match = source.match(/const WIKI\s*=\s*(\{[\s\S]*\});\s*$/);
  if (!match) throw new Error('Could not find the bundled Wiki catalog');
  let catalog;
  try {
    catalog = JSON.parse(match[1]);
  } catch (_) {
    throw new Error('The bundled Wiki catalog is not valid JSON');
  }
  const topics = Object.keys(catalog).filter(topic => TOPIC_RE.test(topic));
  if (!topics.length) throw new Error('The bundled Wiki catalog has no canonical topics');
  return topics;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function parseNonNegativeInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

export function parseArgs(argv = []) {
  const options = { limit: null, dryRun: false, url: null, retries: 2 };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--limit') {
      options.limit = parsePositiveInteger(argv[++index], '--limit');
    } else if (argument === '--url') {
      options.url = argv[++index];
      if (!options.url) throw new Error('--url requires a value');
    } else if (argument === '--retries') {
      options.retries = parseNonNegativeInteger(argv[++index], '--retries');
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function requestTopic(topic, { url, token, fetchImpl = fetch }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ topics: [topic] })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = Array.isArray(body.results) ? body.results[0] : null;
  if (result?.status === 'failed' || result?.status === 'rejected') {
    throw new Error(`prewarm ${result.status}`);
  }
  return result || { topic, status: 'accepted' };
}

export async function runPrewarm({
  topics,
  url,
  token,
  retries = 2,
  fetchImpl = fetch,
  sleepImpl = async () => {}
}) {
  if (!Array.isArray(topics) || !topics.length) throw new Error('No topics to prewarm');
  if (!token) throw new Error('SANDBOX_PREWARM_TOKEN is required');
  const results = [];
  /* Keep this as a for/of loop with an await. It is the provider token-budget
     guardrail for the entire bulk job. */
  for (const topic of topics) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await requestTopic(topic, { url, token, fetchImpl });
        results.push({ topic, status: result.status });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await sleepImpl(1000 * (attempt + 1));
      }
    }
    if (lastError) results.push({ topic, status: 'failed', error: lastError.message });
  }
  return results;
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(argv);
  const topics = await readWikiTopics();
  const selectedTopics = options.limit ? topics.slice(0, options.limit) : topics;
  const url = options.url || environment.SANDBOX_PREWARM_URL || DEFAULT_PREWARM_URL;
  if (options.dryRun) {
    console.log(`Dry run: would prewarm ${selectedTopics.length} topics sequentially.`);
    console.log(selectedTopics.join(', '));
    return { topics: selectedTopics, results: [] };
  }
  const results = await runPrewarm({
    topics: selectedTopics,
    url,
    token: environment.SANDBOX_PREWARM_TOKEN,
    retries: options.retries
  });
  const succeeded = results.filter(result => result.status !== 'failed').length;
  console.log(`Prewarmed ${succeeded}/${results.length} topics sequentially.`);
  for (const result of results) {
    console.log(`${result.status}: ${result.topic}`);
  }
  if (succeeded !== results.length) process.exitCode = 1;
  return { topics: selectedTopics, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

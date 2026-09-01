#!/usr/bin/env node

/* Read-only audit for the option-prerequisite contract in the committed
   production card snapshot. This script intentionally has no KV or write
   path: it validates a file and exits nonzero when the file is not publishable.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const SNAPSHOT_URL = new URL('../server/production-card-cache.json', import.meta.url);
const CARDS_URL = new URL('../js/cards.js', import.meta.url);
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_IDS = ['A', 'B', 'C', 'D'];

// These are deliberately limited to names that can be identified without
// pretending to understand arbitrary natural-language option labels. A
// concept is rejected only when it is itself a known technology/product name
// (or a product name with a deployment suffix) and the label contains it.
const TECHNOLOGY_NAMES = new Set([
  'apache', 'cassandra', 'cloudflare', 'cloudfront', 'cockroachdb', 'datadog',
  'dynamodb', 'elasticsearch', 'graphql', 'grpc', 'haproxy', 'hazelcast',
  'jaeger', 'java', 'kafka', 'loki', 'mariadb', 'memcached', 'mongodb',
  'mysql', 'nginx', 'nfs', 'node', 'nodejs', 'opentelemetry', 'opensearch',
  'paxos', 'postgres', 'postgresql', 'prometheus', 'rabbitmq', 'raft',
  'redis', 's3', 'sqs', 'thanos', 'websocket'
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenSnapshot(snapshot) {
  const cards = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return cards;
  }
  for (const [key, value] of Object.entries(snapshot)) {
    const candidates = Array.isArray(value?.cards) ? value.cards : [value];
    for (const [index, card] of candidates.entries()) {
      if (card !== undefined) {
        cards.push({ key, index, card });
      }
    }
  }
  return cards;
}

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function conceptAppearsInLabel(concept, label) {
  const conceptWords = normalizeWords(concept);
  const labelWords = normalizeWords(label);
  if (conceptWords.length === 0 || conceptWords.length > labelWords.length) return false;
  return labelWords.some((_, index) => conceptWords.every(
    (word, offset) => labelWords[index + offset] === word
  ));
}

function isCopiedTechnology(concept, option, card) {
  if (typeof concept !== 'string' || !conceptAppearsInLabel(concept, option?.label)) {
    return false;
  }
  const conceptWords = normalizeWords(concept);
  const knownName = conceptWords.find(word => TECHNOLOGY_NAMES.has(word));
  if (!knownName) return false;

  // A multi-word concept such as "cache-hit-ratio" is not rejected merely
  // because it contains a common noun. The copied-name check is for a bare
  // product/technology name or a product name followed by a deployment term.
  const suffixes = new Set(['cluster', 'database', 'server', 'cache', 'queue', 'instance']);
  return conceptWords.every(word => word === knownName || suffixes.has(word))
    || asArray(card?.nodes).some(node => normalizeWords(node).join(' ') === conceptWords.join(' '));
}

function finding(cardRef, message, optionId) {
  return {
    cardId: cardRef.card?.id || '(missing id)',
    key: cardRef.key,
    optionId,
    message: `${cardRef.key}/${cardRef.card?.id || '(missing id)'}${optionId ? ` option ${optionId}` : ''}: ${message}`
  };
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && actual.every(value => expected.includes(value));
}

export function auditCard(cardRef, { broadCategories = new Set() } = {}) {
  const findings = [];
  const { card } = cardRef;
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return [finding(cardRef, 'card must be an object')];
  }
  if (typeof card.id !== 'string' || !card.id) findings.push(finding(cardRef, 'card id is required'));
  if (typeof card.topic !== 'string' || !card.topic) findings.push(finding(cardRef, 'card topic is required'));
  if (!Array.isArray(card.options)) {
    findings.push(finding(cardRef, 'options must be an array'));
    return findings;
  }

  const expectedOptionIds = new Set(OPTION_IDS);
  const seenOptionIds = new Set();
  const union = [];
  for (const option of card.options) {
    const optionId = option?.id;
    if (typeof optionId !== 'string' || !expectedOptionIds.has(optionId)) {
      findings.push(finding(cardRef, `option id must be one of ${OPTION_IDS.join(', ')}`, optionId));
      continue;
    }
    if (seenOptionIds.has(optionId)) {
      findings.push(finding(cardRef, 'duplicate option id', optionId));
    }
    seenOptionIds.add(optionId);

    const concepts = option.prerequisiteTopics;
    if (!Array.isArray(concepts)) {
      findings.push(finding(cardRef, 'prerequisiteTopics must be an array of 2-4 concepts', optionId));
      continue;
    }
    if (concepts.length < 2 || concepts.length > 4) {
      findings.push(finding(cardRef, `prerequisiteTopics must contain 2-4 concepts (found ${concepts.length})`, optionId));
    }
    const duplicateConcepts = concepts.filter((concept, index) => concepts.indexOf(concept) !== index);
    if (duplicateConcepts.length > 0) {
      findings.push(finding(cardRef, `prerequisiteTopics contains duplicate concept(s): ${[...new Set(duplicateConcepts)].join(', ')}`, optionId));
    }
    for (const concept of concepts) {
      if (typeof concept !== 'string' || !KEBAB_CASE.test(concept)) {
        findings.push(finding(cardRef, `concept ${JSON.stringify(concept)} must be lowercase kebab-case`, optionId));
        continue;
      }
      if (broadCategories.has(concept)) {
        findings.push(finding(cardRef, `concept ${JSON.stringify(concept)} is a broad catalog category; use a granular concept`, optionId));
      }
      if (concept === card.topic) {
        findings.push(finding(cardRef, `concept ${JSON.stringify(concept)} repeats the card topic`, optionId));
      }
      if (isCopiedTechnology(concept, option, card)) {
        findings.push(finding(cardRef, `concept ${JSON.stringify(concept)} is a copied product/technology name; use the trade-off concept it requires`, optionId));
      }
      if (!union.includes(concept)) union.push(concept);
    }
  }

  for (const optionId of OPTION_IDS) {
    if (!seenOptionIds.has(optionId)) {
      findings.push(finding(cardRef, 'missing option', optionId));
    }
  }

  const aggregate = card.prerequisiteTopics;
  if (!Array.isArray(aggregate)) {
    findings.push(finding(cardRef, 'card prerequisiteTopics must equal the deduplicated union of option concepts'));
  } else {
    const duplicateAggregate = aggregate.filter((concept, index) => aggregate.indexOf(concept) !== index);
    if (duplicateAggregate.length > 0) {
      findings.push(finding(cardRef, `card prerequisiteTopics contains duplicate concept(s): ${[...new Set(duplicateAggregate)].join(', ')}`));
    }
    if (!sameMembers(aggregate, union)) {
      const missing = union.filter(concept => !aggregate.includes(concept));
      const unexpected = aggregate.filter(concept => !union.includes(concept));
      const details = [
        missing.length ? `missing ${missing.join(', ')}` : '',
        unexpected.length ? `unexpected ${unexpected.join(', ')}` : ''
      ].filter(Boolean).join('; ');
      findings.push(finding(cardRef, `card prerequisiteTopics must equal the deduplicated option union (${details || 'values differ'})`));
    }
  }
  return findings;
}

export function auditSnapshot(snapshot, options = {}) {
  return flattenSnapshot(snapshot).flatMap(cardRef => auditCard(cardRef, options));
}

export function formatFindings(findings) {
  return [
    `Option-prerequisite audit failed: ${findings.length} finding(s):`,
    ...findings.map(({ message }) => `  - ${message}`)
  ].join('\n');
}

export async function loadCatalogTopics() {
  const source = await readFile(CARDS_URL, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.auditCatalog = TOPIC_CATALOG;`, context);
  return new Set(Object.keys(context.auditCatalog || {}));
}

export async function auditSnapshotFile(snapshotUrl = SNAPSHOT_URL) {
  const snapshot = JSON.parse(await readFile(snapshotUrl, 'utf8'));
  const broadCategories = await loadCatalogTopics();
  return { snapshot, findings: auditSnapshot(snapshot, { broadCategories }) };
}

function printUsage() {
  console.log('Usage: node scripts/audit-option-prerequisites.mjs [--snapshot <path>]');
  console.log('Audits a snapshot without contacting or mutating production KV.');
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    return 0;
  }
  let snapshotUrl = SNAPSHOT_URL;
  const snapshotIndex = argv.indexOf('--snapshot');
  if (snapshotIndex !== -1) {
    const snapshotPath = argv[snapshotIndex + 1];
    if (!snapshotPath || argv.length !== 2) throw new Error('--snapshot requires the only argument value');
    snapshotUrl = pathToFileURL(snapshotPath);
  } else if (argv.length > 0) {
    throw new Error(`unknown option ${JSON.stringify(argv[0])}`);
  }
  const { snapshot, findings } = await auditSnapshotFile(snapshotUrl);
  if (findings.length > 0) {
    console.error(formatFindings(findings));
    return 1;
  }
  console.log(`Option-prerequisite audit passed: ${flattenSnapshot(snapshot).length} production card(s) satisfy the invariant.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(code => process.exit(code)).catch(error => {
    console.error(`Option-prerequisite audit could not run: ${error.message}`);
    process.exit(1);
  });
}

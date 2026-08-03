#!/usr/bin/env node

/* Read-only dump of the production CARD_CACHE KV into a reviewable snapshot.
 *
 * Lists every key in the production CARD_CACHE namespace and stores each value
 * verbatim in server/production-card-cache.json as a topic:difficulty -> value
 * map. It never writes to KV; the only side effect is the snapshot file.
 *
 * Usage:
 *   node scripts/dump-production-card-cache.mjs
 *   node scripts/dump-production-card-cache.mjs --binding CARD_CACHE
 *   node scripts/dump-production-card-cache.mjs --namespace-id <id>
 *   node scripts/dump-production-card-cache.mjs --out /tmp/snapshot.json
 *   node scripts/dump-production-card-cache.mjs --fixture server/production-card-cache.json
 *
 * --fixture regenerates a canonical snapshot from an existing snapshot file
 * (no wrangler, no credentials) so the dump logic can be verified in CI.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT = fileURLToPath(new URL('../server/production-card-cache.json', import.meta.url));
const WRANGLER_TOML = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const TOPIC_DIFFICULTY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*:[0-9]+$/;

function parseWranglerKvNamespaces(tomlText) {
  const namespaces = [];
  let current = null;
  for (const line of tomlText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '[[kv_namespaces]]') {
      current = {};
      namespaces.push(current);
    } else if (current) {
      const binding = trimmed.match(/^binding\s*=\s*"([^"]+)"/);
      if (binding) {
        current.binding = binding[1];
        continue;
      }
      const id = trimmed.match(/^id\s*=\s*"([^"]+)"/);
      if (id) current.id = id[1];
    }
  }
  return namespaces;
}

function runWrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'wrangler', ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`wrangler ${args.join(' ')} exited ${code}: ${stderr.trim().slice(0, 500)}`));
      }
    });
  });
}

export function wranglerKV({ binding = 'CARD_CACHE', namespaceId = null } = {}) {
  const base = namespaceId
    ? ['--namespace-id', namespaceId]
    : ['--binding', binding];
  return {
    async listKeys() {
      const output = await runWrangler(['kv', 'key', 'list', '--remote', ...base]);
      const parsed = JSON.parse(output);
      if (!Array.isArray(parsed)) {
        throw new Error('kv key list returned an unexpected shape');
      }
      return parsed.map(entry => entry?.name).filter(Boolean);
    },
    async getKey(key) {
      return runWrangler(['kv', 'key', 'get', '--remote', ...base, key]);
    }
  };
}

export async function buildSnapshot(kv) {
  const warnings = [];
  let keys;
  try {
    keys = await kv.listKeys();
  } catch (error) {
    throw new Error(`listing CARD_CACHE keys: ${error.message}`);
  }

  const snapshot = {};
  for (const key of [...new Set(keys)].sort()) {
    if (!TOPIC_DIFFICULTY_KEY.test(key)) {
      warnings.push(`key ${JSON.stringify(key)} does not match the topic:difficulty pattern`);
    }
    let raw;
    try {
      raw = await kv.getKey(key);
    } catch (error) {
      warnings.push(`reading key ${JSON.stringify(key)}: ${error.message}`);
      continue;
    }
    try {
      snapshot[key] = JSON.parse(raw);
    } catch {
      warnings.push(`key ${JSON.stringify(key)} is not valid JSON; stored verbatim as text`);
      snapshot[key] = raw;
    }
  }
  return { snapshot, warnings };
}

function printUsage() {
  console.log(`Usage:
  node scripts/dump-production-card-cache.mjs [options]

Options:
  --binding <name>        KV binding from wrangler.toml (default: CARD_CACHE)
  --namespace-id <id>     Production namespace id (overrides --binding)
  --out <path>            Snapshot output path (default: server/production-card-cache.json)
  --fixture <path>        Regenerate from an existing snapshot file without wrangler
  -h, --help              Show this help`);
}

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    binding: 'CARD_CACHE',
    namespaceId: null,
    fixture: null
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      case '--binding':
        options.binding = argv[++index];
        if (!options.binding) throw new Error('--binding requires a value');
        break;
      case '--namespace-id':
        options.namespaceId = argv[++index];
        if (!options.namespaceId) throw new Error('--namespace-id requires a value');
        break;
      case '--out':
        options.out = argv[++index];
        if (!options.out) throw new Error('--out requires a path');
        break;
      case '--fixture':
        options.fixture = argv[++index];
        if (!options.fixture) throw new Error('--fixture requires a path');
        break;
      default:
        throw new Error(`unknown option ${JSON.stringify(arg)}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let kv;
  if (options.fixture) {
    const fixture = JSON.parse(await readFile(options.fixture, 'utf8'));
    kv = {
      async listKeys() {
        return Object.keys(fixture);
      },
      async getKey(key) {
        const value = fixture[key];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
    };
  } else if (options.namespaceId) {
    kv = wranglerKV({ namespaceId: options.namespaceId });
  } else {
    const toml = await readFile(WRANGLER_TOML, 'utf8');
    const namespaces = parseWranglerKvNamespaces(toml);
    const namespace = namespaces.find(entry => entry.binding === options.binding);
    if (!namespace?.id) {
      throw new Error(`binding ${JSON.stringify(options.binding)} not found in wrangler.toml`);
    }
    kv = wranglerKV({ binding: namespace.binding, namespaceId: namespace.id });
  }

  const { snapshot, warnings } = await buildSnapshot(kv);
  await writeFile(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(JSON.stringify({
    keys: Object.keys(snapshot).length,
    topics: [...new Set(Object.keys(snapshot).map(key => key.split(':')[0]))].length,
    warnings: warnings.length,
    out: options.out,
    source: options.fixture ?? 'production KV'
  }, null, 2));
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

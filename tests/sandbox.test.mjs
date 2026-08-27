import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/sandbox.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}
globalThis.modelsForTest = SANDBOX_NODE_MODELS;
globalThis.normalizeRedisForTest = normalizeRedisSandboxInput;
globalThis.normalizeQueueForTest = normalizeQueueSandboxInput;
globalThis.normalizeDatabaseForTest = normalizeDatabaseSandboxInput;
globalThis.simulateRedisForTest = simulateRedis;
globalThis.simulateQueueForTest = simulateQueue;
globalThis.simulateDatabaseForTest = simulateDatabase;
globalThis.getSandboxNodeForTest = getSandboxNode;
globalThis.getSandboxSituationForTest = getSandboxSituation;
globalThis.normalizeSandboxNodeInputForTest = normalizeSandboxNodeInput;
globalThis.simulateSandboxNodeForTest = simulateSandboxNode;
globalThis.getSandboxPredictionBucketForTest = getSandboxPredictionBucket;`, context);

const models = context.modelsForTest;
const redis = models.find(model => model.id === 'redis-cache');
const queue = models.find(model => model.id === 'queue-worker');
const database = models.find(model => model.id === 'relational-database');

function situation(model, id) {
  return model.situations.find(item => item.id === id).values;
}

test('sandbox catalog exposes reviewed models with escalating situations', () => {
  assert.equal(models.map(model => model.id).join(','), 'redis-cache,queue-worker,relational-database');
  for (const model of models) {
    assert.equal(model.situations.length, 5);
    assert.equal(model.controls.length > 0, true);
    assert.equal(model.metrics.length > 0, true);
    assert.equal(model.situations.map(item => item.level).join(','), '1,2,3,4,5');
    assert.equal(model.predictionOptions.length >= 2, true);
  }
  assert.equal(context.getSandboxNodeForTest('missing').id, 'redis-cache');
  assert.equal(context.getSandboxSituationForTest('queue-worker', 'missing').id, 'steady-workers');
});

test('each model clamps invalid input to its documented limits', () => {
  const normalizedRedis = context.normalizeRedisForTest({
    requestsPerSecond: -100,
    readRatio: 150,
    valueSizeKb: 0,
    memoryLimitMb: 'not-a-number'
  });
  assert.equal(normalizedRedis.requestsPerSecond, 1);
  assert.equal(normalizedRedis.readRatio, 100);
  assert.equal(normalizedRedis.valueSizeKb, 0.25);
  assert.equal(normalizedRedis.memoryLimitMb, 256);

  const normalizedQueue = context.normalizeQueueForTest({ workerCount: 0, retryRate: 140 });
  assert.equal(normalizedQueue.workerCount, 1);
  assert.equal(normalizedQueue.retryRate, 100);

  const normalizedDatabase = context.normalizeDatabaseForTest({ indexedReadPct: -1, replicaCount: 100 });
  assert.equal(normalizedDatabase.indexedReadPct, 0);
  assert.equal(normalizedDatabase.replicaCount, 10);
});

test('cache model is deterministic and exposes zero-read and miss paths', () => {
  const warm = context.simulateRedisForTest(situation(redis, 'warm-cache'));
  const warmAgain = context.simulateRedisForTest(situation(redis, 'warm-cache'));
  assert.equal(JSON.stringify(warm), JSON.stringify(warmAgain));
  assert.equal(warm.cacheHitsRps, 810);
  assert.equal(warm.backendReadRps, 90);
  assert.equal(warm.backendTrafficReductionPct, 81);
  assert.equal(context.getSandboxPredictionBucketForTest('redis-cache', warm.input), 'mostly-absorbed');

  const noReads = context.simulateRedisForTest({ ...warm.input, readRatio: 0 });
  assert.equal(noReads.cacheHitsRps, 0);
  assert.equal(noReads.cacheMissesRps, 0);
  assert.match(noReads.observations[1], /no reads/i);

  const cold = context.simulateRedisForTest(situation(redis, 'cold-cache'));
  assert.equal(context.getSandboxPredictionBucketForTest('redis-cache', cold.input), 'backend-heavy');
  assert.equal(cold.primaryRisk, 'backend-load');
});

test('cache pressure situations surface memory and hot-key risks', () => {
  const memory = context.simulateSandboxNodeForTest('redis-cache', situation(redis, 'memory-pressure'));
  const hotKey = context.simulateSandboxNodeForTest('redis-cache', situation(redis, 'hot-key'));
  assert.equal(memory.status, 'stress');
  assert.equal(memory.primaryRisk, 'memory');
  assert.equal(hotKey.status, 'stress');
  assert.equal(hotKey.primaryRisk, 'hot-key');
  assert.equal(hotKey.hotKeyUtilizationPct >= 100, true);
});

test('queue model distinguishes draining, growing, and overflowing work', () => {
  const steady = context.simulateQueueForTest(situation(queue, 'steady-workers'));
  const burst = context.simulateQueueForTest(situation(queue, 'burst-arrivals'));
  const retryStorm = context.simulateQueueForTest(situation(queue, 'retry-storm'));
  const bounded = context.simulateQueueForTest(situation(queue, 'bounded-queue'));

  assert.equal(context.getSandboxPredictionBucketForTest('queue-worker', steady.input), 'drains');
  assert.equal(steady.backlogMessages, 0);
  assert.equal(context.getSandboxPredictionBucketForTest('queue-worker', burst.input), 'grows');
  assert.equal(burst.backlogMessages < burst.input.queueCapacity, true);
  assert.equal(retryStorm.retryRps > 0, true);
  assert.equal(context.getSandboxPredictionBucketForTest('queue-worker', retryStorm.input), 'overflows');
  assert.equal(bounded.droppedRps > 0, true);
  assert.equal(bounded.primaryRisk, 'queue-capacity');
});

test('database model exposes query cost, lag, and hot-partition paths', () => {
  const steady = context.simulateDatabaseForTest(situation(database, 'indexed-steady'));
  const unindexed = context.simulateDatabaseForTest(situation(database, 'unindexed-reads'));
  const lag = context.simulateDatabaseForTest(situation(database, 'replica-lag'));
  const hotPartition = context.simulateDatabaseForTest(situation(database, 'hot-partition'));

  assert.equal(context.getSandboxPredictionBucketForTest('relational-database', steady.input), 'healthy');
  assert.equal(context.getSandboxPredictionBucketForTest('relational-database', unindexed.input), 'query-cost');
  assert.equal(unindexed.weightedQueryMs > steady.weightedQueryMs, true);
  assert.equal(context.getSandboxPredictionBucketForTest('relational-database', lag.input), 'replication-lag');
  assert.equal(lag.replicaLagMs >= 300, true);
  assert.equal(context.getSandboxPredictionBucketForTest('relational-database', hotPartition.input), 'saturated');
  assert.equal(hotPartition.hotPartitionUtilizationPct >= 75, true);
});

test('generic dispatch preserves the selected model identity', () => {
  const values = context.normalizeSandboxNodeInputForTest('queue-worker', situation(queue, 'steady-workers'));
  const result = context.simulateSandboxNodeForTest('queue-worker', values);
  assert.equal(result.nodeId, 'queue-worker');
  assert.equal(result.modelVersion, 1);
  assert.equal(result.simulation.stages.length, 3);
  assert.equal(result.simulation.outcomes.length, 3);
  assert.equal(context.simulateSandboxNodeForTest('unknown', {}).nodeId, 'redis-cache');
});

test('each node returns a readable simulation trace tied to its derived outputs', () => {
  const expectations = [
    ['redis-cache', 'Cache hits', 'Misses to store'],
    ['queue-worker', 'Completed', 'Retry loop'],
    ['relational-database', 'Primary path', 'Replica reads']
  ];

  for (const [nodeId, firstOutcome, secondOutcome] of expectations) {
    const node = context.getSandboxNodeForTest(nodeId);
    const result = context.simulateSandboxNodeForTest(nodeId, situation(node, node.situations[0].id));
    assert.equal(result.simulation.stages.length, 3);
    assert.equal(result.simulation.outcomes.length, 3);
    assert.match(result.simulation.caption, /\S/);
    assert.match(result.simulation.ariaLabel, /\S/);
    assert.equal(result.simulation.outcomes[0].label, firstOutcome);
    assert.equal(result.simulation.outcomes[1].label, secondOutcome);
  }
});

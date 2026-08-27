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
const expectedModelIds = [
  'redis-cache',
  'queue-worker',
  'relational-database',
  'social-feed',
  'realtime-messaging',
  'video-pipeline',
  'geospatial-dispatch',
  'url-shortener',
  'rate-limiter',
  'object-storage',
  'notification-fanout',
  'search-autocomplete',
  'distributed-kv'
];
const popularModelIds = expectedModelIds.slice(3);

function situation(model, id) {
  return model.situations.find(item => item.id === id).values;
}

test('sandbox catalog exposes reviewed models with escalating situations', () => {
  assert.equal(models.map(model => model.id).join(','), expectedModelIds.join(','));
  assert.equal(new Set(models.map(model => model.id)).size, 13);
  for (const model of models) {
    assert.equal(model.situations.length, 5);
    assert.equal(model.controls.length > 0, true);
    assert.equal(model.metrics.length > 0, true);
    assert.equal(model.situations.map(item => item.level).join(','), '1,2,3,4,5');
    assert.equal(model.predictionOptions.length >= 3, true);
    assert.equal(model.controls.every(control => model.limits[control.key]), true);
    assert.equal(model.controls.every(control => model.defaults[control.key] !== undefined), true);
    assert.equal(model.flowPreview.length, 3);
    assert.equal(typeof model.diagram, 'function');
  }
  for (const modelId of popularModelIds) {
    const model = models.find(item => item.id === modelId);
    assert.equal(model.interviewExamples.length > 0, true);
    assert.equal(Number.isInteger(model.popularityRank), true);
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

  for (const model of models) {
    const normalized = context.normalizeSandboxNodeInputForTest(
      model.id,
      Object.fromEntries(Object.keys(model.limits).map(key => [key, Number.NaN]))
    );
    for (const [key, limit] of Object.entries(model.limits)) {
      assert.equal(Number.isFinite(normalized[key]), true);
      assert.equal(normalized[key] >= limit.min && normalized[key] <= limit.max, true);
    }
  }
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

test('popular models produce deterministic derived metrics and pressure paths', () => {
  const pressureCases = {
    'social-feed': ['author-burst', 'fanout-backlog'],
    'realtime-messaging': ['reconnect-storm', 'connection-pressure'],
    'video-pipeline': ['many-renditions', 'processing-backlog'],
    'geospatial-dispatch': ['location-update-burst', 'hot-cell'],
    'url-shortener': ['small-code-space', 'code-generation-risk'],
    'rate-limiter': ['distributed-counter', 'decision-capacity'],
    'object-storage': ['large-upload', 'write-pressure'],
    'notification-fanout': ['preference-overload', 'preference-pressure'],
    'search-autocomplete': ['corpus-growth', 'memory-pressure'],
    'distributed-kv': ['weak-read', 'hot-shard']
  };

  for (const modelId of popularModelIds) {
    const model = context.getSandboxNodeForTest(modelId);
    const baseline = context.simulateSandboxNodeForTest(modelId, situation(model, model.situations[0].id));
    const baselineAgain = context.simulateSandboxNodeForTest(modelId, situation(model, model.situations[0].id));
    assert.equal(JSON.stringify(baseline), JSON.stringify(baselineAgain));
    assert.equal(baseline.modelVersion, 1);
    assert.equal(baseline.status, 'healthy');
    assert.notEqual(baseline.primaryRisk, undefined);
    assert.equal(baseline.simulation.title === 'Simulation trace', false);
    assert.equal(baseline.simulation.stages.length, 3);
    assert.equal(baseline.simulation.outcomes.length, 3);
    assert.match(baseline.teachingConclusion, /\S/);
    for (const value of Object.values(baseline)) {
      if (typeof value === 'number') assert.equal(Number.isFinite(value), true);
    }

    const [situationId, expectedBucket] = pressureCases[modelId];
    const pressureValues = situation(model, situationId);
    const pressure = context.simulateSandboxNodeForTest(modelId, pressureValues);
    assert.equal(context.getSandboxPredictionBucketForTest(modelId, pressureValues), expectedBucket);
    assert.equal(pressure.status, 'stress');
    assert.notEqual(pressure.primaryRisk, 'none');
  }
});

test('popular model equations preserve the key interview trade-offs', () => {
  const social = context.simulateSandboxNodeForTest('social-feed', situation(context.getSandboxNodeForTest('social-feed'), 'normal-fanout'));
  assert.equal(social.fanoutWritesRps, 950);
  assert.equal(social.timelineCacheHitsRps, 950);

  const messaging = context.simulateSandboxNodeForTest('realtime-messaging', situation(context.getSandboxNodeForTest('realtime-messaging'), 'group-chat'));
  assert.equal(messaging.deliveryAttemptsRps, 200000);
  assert.equal(messaging.onlineDeliveryRps, 190000);

  const video = context.simulateSandboxNodeForTest('video-pipeline', situation(context.getSandboxNodeForTest('video-pipeline'), 'many-renditions'));
  assert.equal(video.transcodeWorkVideoMinPerSec, 100);
  assert.equal(video.processingBacklogVideoMin, 4800);

  const geo = context.simulateSandboxNodeForTest('geospatial-dispatch', situation(context.getSandboxNodeForTest('geospatial-dispatch'), 'ride-surge'));
  assert.equal(geo.unmatchedRps, 5000);
  assert.equal(geo.staleLocationPct, 0);

  const shortener = context.simulateSandboxNodeForTest('url-shortener', situation(context.getSandboxNodeForTest('url-shortener'), 'cold-redirect-cache'));
  assert.equal(shortener.cacheHitsRps, 6000);
  assert.equal(shortener.mappingLookupRps, 24000);

  const limiter = context.simulateSandboxNodeForTest('rate-limiter', situation(context.getSandboxNodeForTest('rate-limiter'), 'burst-window'));
  assert.equal(limiter.allowedRps, 1050);
  assert.equal(limiter.throttledRps, 750);

  const storage = context.simulateSandboxNodeForTest('object-storage', situation(context.getSandboxNodeForTest('object-storage'), 'dedupe-heavy'));
  assert.equal(storage.changedMbPerSec, 200);
  assert.equal(storage.dedupedMbPerSec, 180);

  const notification = context.simulateSandboxNodeForTest('notification-fanout', situation(context.getSandboxNodeForTest('notification-fanout'), 'flaky-provider'));
  assert.equal(notification.channelDeliveriesRps, 24000);
  assert.equal(notification.retryRps, 7200);

  const search = context.simulateSandboxNodeForTest('search-autocomplete', situation(context.getSandboxNodeForTest('search-autocomplete'), 'index-rebuild'));
  assert.equal(search.trieLookupRps, 2000);
  assert.equal(search.rebuildLagSec, 240);

  const kv = context.simulateSandboxNodeForTest('distributed-kv', situation(context.getSandboxNodeForTest('distributed-kv'), 'quorum-latency'));
  assert.equal(kv.effectiveReadQuorum, 3);
  assert.equal(kv.quorumLatencyMs, 45);
});

test('each node returns a readable simulation trace tied to its derived outputs', () => {
  const expectations = [
    ['redis-cache', 'Cache hits', 'Misses to store'],
    ['queue-worker', 'Completed', 'Retry loop'],
    ['relational-database', 'Primary path', 'Replica reads'],
    ['social-feed', 'Precomputed hits', 'Celebrity merge'],
    ['realtime-messaging', 'Live deliveries', 'Offline queue'],
    ['video-pipeline', 'Encoded variants', 'Processing backlog'],
    ['geospatial-dispatch', 'Indexed updates', 'Nearby candidates'],
    ['url-shortener', 'Cached redirects', 'Mapping lookups'],
    ['rate-limiter', 'Allowed', 'Throttled'],
    ['object-storage', 'Changed chunks', 'Deduplicated bytes'],
    ['notification-fanout', 'Delivered', 'Retry loop'],
    ['search-autocomplete', 'Cache hits', 'Trie lookups'],
    ['distributed-kv', 'Quorum reads', 'Replicated writes']
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

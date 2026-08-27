/* Deterministic concept-sandbox models.
 *
 * The first reviewed models are deliberately small: a Redis-like cache, a
 * queue/worker, and a relational database. They are instructional models, not
 * benchmarks or claims about any particular vendor deployment. Keep the
 * inputs, equations, and assumptions explicit so a learner can inspect why an
 * output changed.
 */

const SANDBOX_MODEL_VERSION = 1;

const REDIS_SANDBOX_LIMITS = Object.freeze({
  requestsPerSecond: { min: 1, max: 100000, step: 1 },
  readRatio: { min: 0, max: 100, step: 1 },
  hitRate: { min: 0, max: 100, step: 1 },
  workingSetKeys: { min: 100, max: 10000000, step: 100 },
  valueSizeKb: { min: 0.25, max: 64, step: 0.25 },
  memoryLimitMb: { min: 16, max: 8192, step: 1 },
  nodeCapacityRps: { min: 100, max: 200000, step: 100 },
  commandCostUs: { min: 10, max: 1000, step: 1 },
  roundTripMs: { min: 0.1, max: 20, step: 0.1 },
  backendLatencyMs: { min: 1, max: 500, step: 1 },
  hotKeyShare: { min: 0, max: 100, step: 1 }
});

const REDIS_SANDBOX_DEFAULTS = Object.freeze({
  requestsPerSecond: 1000,
  readRatio: 90,
  hitRate: 90,
  workingSetKeys: 100000,
  valueSizeKb: 1,
  memoryLimitMb: 256,
  nodeCapacityRps: 50000,
  commandCostUs: 80,
  roundTripMs: 1,
  backendLatencyMs: 8,
  hotKeyShare: 5
});

const REDIS_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestsPerSecond', label: 'Requests / second', unit: 'req/s' },
  { key: 'readRatio', label: 'Read traffic', unit: '%' },
  { key: 'hitRate', label: 'Cache hit rate', unit: '%' },
  { key: 'workingSetKeys', label: 'Working-set keys', unit: 'keys' },
  { key: 'valueSizeKb', label: 'Average value size', unit: 'KB' },
  { key: 'memoryLimitMb', label: 'Memory limit', unit: 'MB' },
  { key: 'nodeCapacityRps', label: 'Assumed node budget', unit: 'ops/s' },
  { key: 'commandCostUs', label: 'Command cost', unit: 'us', advanced: true },
  { key: 'roundTripMs', label: 'Network round trip', unit: 'ms', advanced: true },
  { key: 'backendLatencyMs', label: 'Backing-store latency', unit: 'ms', advanced: true },
  { key: 'hotKeyShare', label: 'Hottest-key share', unit: '%', advanced: true }
]);

const REDIS_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'warm-cache',
    label: 'Warm cache',
    level: 1,
    description: 'A steady read-heavy workload with a well-fitting working set.',
    objective: 'See the basic cache-aside relationship between hit rate and backend load.',
    values: REDIS_SANDBOX_DEFAULTS
  },
  {
    id: 'traffic-spike',
    label: 'Traffic spike',
    level: 2,
    description: 'Traffic jumps while the cache remains warm.',
    objective: 'Notice that a good hit rate reduces backend work, but Redis still has a node budget.',
    values: { ...REDIS_SANDBOX_DEFAULTS, requestsPerSecond: 5000, hotKeyShare: 12 }
  },
  {
    id: 'cold-cache',
    label: 'Cold cache',
    level: 3,
    description: 'A deploy or key churn leaves most requested data uncached.',
    objective: 'Predict the miss storm before it reaches the backing store.',
    values: { ...REDIS_SANDBOX_DEFAULTS, hitRate: 20, backendLatencyMs: 12 }
  },
  {
    id: 'memory-pressure',
    label: 'Memory pressure',
    level: 4,
    description: 'The working set grows beyond the memory budget.',
    objective: 'Connect value size and working-set growth to eviction risk and latency.',
    values: {
      ...REDIS_SANDBOX_DEFAULTS,
      workingSetKeys: 500000,
      valueSizeKb: 4,
      memoryLimitMb: 128,
      hitRate: 82
    }
  },
  {
    id: 'hot-key',
    label: 'Hot key',
    level: 5,
    description: 'A small number of keys receive a disproportionate share of reads.',
    objective: 'Spot concentration risk even when aggregate utilization looks healthy.',
    values: {
      ...REDIS_SANDBOX_DEFAULTS,
      requestsPerSecond: 6000,
      hitRate: 98,
      hotKeyShare: 85,
      nodeCapacityRps: 40000
    }
  }
]);

const REDIS_PREDICTION_OPTIONS = Object.freeze([
  { id: 'mostly-absorbed', label: 'Only a small fraction reaches the backing store' },
  { id: 'mixed', label: 'A meaningful share reaches the backing store' },
  { id: 'backend-heavy', label: 'Most reads reach the backing store' }
]);

function sandboxFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sandboxDecimals(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function clampSandboxInput(value, limit, fallback) {
  const number = sandboxFiniteNumber(value, fallback);
  const clamped = Math.min(limit.max, Math.max(limit.min, number));
  return Number(clamped.toFixed(sandboxDecimals(limit.step)));
}

function normalizeModelInput(input, limits, defaults) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = {};
  for (const [key, limit] of Object.entries(limits)) {
    normalized[key] = clampSandboxInput(source[key], limit, defaults[key]);
  }
  return normalized;
}

function sandboxStatus(risks) {
  if (risks.includes('stress')) return 'stress';
  if (risks.includes('watch')) return 'watch';
  return 'healthy';
}

function normalizeRedisSandboxInput(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const normalized = {};
  for (const [key, limit] of Object.entries(REDIS_SANDBOX_LIMITS)) {
    normalized[key] = clampSandboxInput(
      source[key],
      limit,
      REDIS_SANDBOX_DEFAULTS[key]
    );
  }
  return normalized;
}

function getRedisSandboxSituation(id = 'warm-cache') {
  return REDIS_SANDBOX_SITUATIONS.find(situation => situation.id === id)
    || REDIS_SANDBOX_SITUATIONS[0];
}

function sandboxRounded(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function sandboxFormatNumber(value, places = 1) {
  const rounded = sandboxRounded(value, places);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(places);
}

function redisPredictionBucket(hitRate) {
  const rate = clampSandboxInput(hitRate, REDIS_SANDBOX_LIMITS.hitRate, REDIS_SANDBOX_DEFAULTS.hitRate);
  if (rate >= 75) return 'mostly-absorbed';
  if (rate >= 35) return 'mixed';
  return 'backend-heavy';
}

function simulateRedis(input = {}) {
  const values = normalizeRedisSandboxInput(input);
  const requestRate = values.requestsPerSecond;
  const readRps = requestRate * values.readRatio / 100;
  const writeRps = requestRate - readRps;
  const cacheHitsRps = readRps * values.hitRate / 100;
  const cacheMissesRps = readRps - cacheHitsRps;
  // Cache-aside assumption: reads miss through to the backing store and
  // writes bypass this cache. This keeps the experiment's causal story clear.
  const backendReadRps = cacheMissesRps;
  const backendWriteRps = writeRps;
  const backendRps = backendReadRps + backendWriteRps;
  const redisOpsRps = requestRate;
  const nodeUtilization = redisOpsRps / values.nodeCapacityRps;
  const memoryUsedMb = values.workingSetKeys * (values.valueSizeKb * 1024 + 64) / (1024 * 1024);
  const memoryPressure = memoryUsedMb / values.memoryLimitMb;
  // A concentrated key is a teaching signal, not a vendor limit. The model
  // reserves 10% of the assumed node budget as a simple per-key pressure line.
  const hotKeyRps = readRps * values.hotKeyShare / 100;
  const hotKeyBudgetRps = Math.max(100, values.nodeCapacityRps * 0.1);
  const hotKeyUtilization = hotKeyRps / hotKeyBudgetRps;
  const backendShare = requestRate > 0 ? backendRps / requestRate : 0;
  const cachePathLatencyMs = values.roundTripMs + values.commandCostUs / 1000;
  const loadPenaltyMs = nodeUtilization > 0.7 ? (nodeUtilization - 0.7) ** 2 * 20 : 0;
  const memoryPenaltyMs = memoryPressure > 0.85 ? (memoryPressure - 0.85) * 25 : 0;
  const estimatedP95LatencyMs = cachePathLatencyMs
    + backendShare * values.backendLatencyMs * 1.25
    + loadPenaltyMs
    + memoryPenaltyMs;
  const queueRps = Math.max(0, redisOpsRps - values.nodeCapacityRps);
  const backendTrafficReductionPct = requestRate > 0
    ? cacheHitsRps / requestRate * 100
    : 0;

  const memoryRisk = memoryPressure >= 1 ? 'stress' : memoryPressure >= 0.85 ? 'watch' : 'healthy';
  const hotKeyRisk = hotKeyUtilization >= 1 ? 'stress' : hotKeyUtilization >= 0.75 ? 'watch' : 'healthy';
  const nodeRisk = nodeUtilization >= 1 ? 'stress' : nodeUtilization >= 0.75 ? 'watch' : 'healthy';
  const status = [memoryRisk, hotKeyRisk, nodeRisk].includes('stress')
    ? 'stress'
    : [memoryRisk, hotKeyRisk, nodeRisk].includes('watch') || values.hitRate < 50
      ? 'watch'
      : 'healthy';
  const statusLabel = { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status];

  let primaryRisk = 'none';
  if (memoryRisk === 'stress' || memoryRisk === 'watch') primaryRisk = 'memory';
  else if (hotKeyRisk === 'stress' || hotKeyRisk === 'watch') primaryRisk = 'hot-key';
  else if (nodeRisk === 'stress' || nodeRisk === 'watch') primaryRisk = 'node-capacity';
  else if (values.hitRate < 50) primaryRisk = 'backend-load';

  const observations = [
    `Redis handles ${sandboxFormatNumber(redisOpsRps)} operations/s against an assumed ${sandboxFormatNumber(values.nodeCapacityRps)} operations/s node budget.`,
    `${sandboxFormatNumber(values.hitRate, 0)}% of reads hit the cache, leaving ${sandboxFormatNumber(backendReadRps)} backing-store reads/s.`,
    `The backing store receives ${sandboxFormatNumber(backendRps)} operations/s, ${sandboxFormatNumber(backendTrafficReductionPct, 0)}% fewer than sending every request through.`
  ];
  if (readRps === 0) {
    observations[1] = 'There are no reads in this workload, so the cache has no hits or misses to absorb.';
  }
  if (memoryPressure >= 0.85) {
    observations.push(`The working set uses about ${sandboxFormatNumber(memoryUsedMb)} MB of ${sandboxFormatNumber(values.memoryLimitMb)} MB, so eviction pressure is ${memoryPressure >= 1 ? 'over budget' : 'near the limit'}.`);
  }
  if (hotKeyUtilization >= 0.75) {
    observations.push(`The hottest key carries ${sandboxFormatNumber(hotKeyRps)} reads/s, above the model's ${sandboxFormatNumber(hotKeyBudgetRps)} reads/s concentration budget.`);
  }
  if (queueRps > 0) {
    observations.push(`The node is over its assumed budget by ${sandboxFormatNumber(queueRps)} operations/s, so work queues instead of completing immediately.`);
  }

  const teachingConclusion = {
    none: 'A warm cache absorbs most reads, so the backing store does less work while the cache stays inside its modeled budget.',
    'backend-load': 'A low hit rate makes the cache a thin detour: misses still pay the backing-store latency and load.',
    'node-capacity': 'The cache itself is the limiting stage in this model. More traffic requires capacity, partitioning, or admission control.',
    memory: 'A cache only helps while the working set fits its memory budget. Evictions can turn a warm workload into repeated misses.',
    'hot-key': 'Aggregate capacity can look healthy while one popular key concentrates work. Replication or a different keying strategy may be needed.'
  }[primaryRisk];

  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    redisOpsRps: sandboxRounded(redisOpsRps),
    readRps: sandboxRounded(readRps),
    writeRps: sandboxRounded(writeRps),
    cacheHitsRps: sandboxRounded(cacheHitsRps),
    cacheMissesRps: sandboxRounded(cacheMissesRps),
    backendReadRps: sandboxRounded(backendReadRps),
    backendWriteRps: sandboxRounded(backendWriteRps),
    backendRps: sandboxRounded(backendRps),
    backendTrafficReductionPct: sandboxRounded(backendTrafficReductionPct),
    nodeUtilizationPct: sandboxRounded(nodeUtilization * 100),
    memoryUsedMb: sandboxRounded(memoryUsedMb),
    memoryPressurePct: sandboxRounded(memoryPressure * 100),
    hotKeyRps: sandboxRounded(hotKeyRps),
    hotKeyUtilizationPct: sandboxRounded(hotKeyUtilization * 100),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    queueRps: sandboxRounded(queueRps),
    status,
    statusLabel,
    primaryRisk,
    observations,
    teachingConclusion,
    assumptions: [
      'Cache-aside: read misses query the backing store; writes bypass this cache.',
      'One request creates one modeled Redis operation.',
      'Node capacity, command cost, round trip, and backend latency are learner-supplied assumptions.',
      'Memory includes a fixed 64-byte per-entry overhead for teaching purposes.',
      'Hot-key pressure uses 10% of the assumed node budget as a simple concentration signal.'
    ]
  };
}

/* ——— Queue/worker model ——— */

const QUEUE_SANDBOX_LIMITS = Object.freeze({
  arrivalRate: { min: 1, max: 100000, step: 1 },
  workerCount: { min: 1, max: 1000, step: 1 },
  serviceTimeMs: { min: 1, max: 1000, step: 1 },
  queueCapacity: { min: 10, max: 1000000, step: 10 },
  failureRate: { min: 0, max: 50, step: 1 },
  retryRate: { min: 0, max: 100, step: 1 }
});

const QUEUE_SANDBOX_DEFAULTS = Object.freeze({
  arrivalRate: 1000,
  workerCount: 10,
  serviceTimeMs: 5,
  queueCapacity: 10000,
  failureRate: 0,
  retryRate: 0
});

const QUEUE_SANDBOX_CONTROLS = Object.freeze([
  { key: 'arrivalRate', label: 'Arrival rate', unit: 'jobs/s' },
  { key: 'workerCount', label: 'Workers', unit: 'workers' },
  { key: 'serviceTimeMs', label: 'Service time', unit: 'ms' },
  { key: 'queueCapacity', label: 'Queue capacity', unit: 'jobs' },
  { key: 'failureRate', label: 'Dependency failure rate', unit: '%' },
  { key: 'retryRate', label: 'Failed jobs retried', unit: '%' }
]);

const QUEUE_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-workers', label: 'Steady workers', level: 1,
    description: 'Workers comfortably keep up with a steady stream of jobs.',
    objective: 'See a queue drain when service capacity exceeds arrivals.',
    values: QUEUE_SANDBOX_DEFAULTS
  },
  {
    id: 'burst-arrivals', label: 'Burst arrivals', level: 2,
    description: 'A launch event sends a burst that briefly outruns the workers.',
    objective: 'Connect arrival rate and worker capacity to backlog growth.',
    values: { ...QUEUE_SANDBOX_DEFAULTS, arrivalRate: 15000, queueCapacity: 200000 }
  },
  {
    id: 'slow-workers', label: 'Slow workers', level: 3,
    description: 'A downstream dependency makes every job take longer.',
    objective: 'Predict the backlog before the queue fills.',
    values: { ...QUEUE_SANDBOX_DEFAULTS, workerCount: 4, serviceTimeMs: 15, arrivalRate: 2000, queueCapacity: 30000 }
  },
  {
    id: 'retry-storm', label: 'Retry storm', level: 4,
    description: 'A flaky dependency causes failures and automatic retries.',
    objective: 'Notice that retries are new work and can amplify overload.',
    values: { ...QUEUE_SANDBOX_DEFAULTS, arrivalRate: 5000, failureRate: 25, retryRate: 100, queueCapacity: 12000 }
  },
  {
    id: 'bounded-queue', label: 'Bounded queue', level: 5,
    description: 'A small queue protects memory but starts dropping excess work.',
    objective: 'Balance bounded memory against explicit loss or backpressure.',
    values: { ...QUEUE_SANDBOX_DEFAULTS, arrivalRate: 10000, workerCount: 4, serviceTimeMs: 20, queueCapacity: 1000 }
  }
]);

const QUEUE_PREDICTION_OPTIONS = Object.freeze([
  { id: 'drains', label: 'The queue drains or stays nearly empty' },
  { id: 'grows', label: 'The queue grows but remains within capacity' },
  { id: 'overflows', label: 'The queue overflows and drops work' }
]);

function normalizeQueueSandboxInput(input = {}) {
  return normalizeModelInput(input, QUEUE_SANDBOX_LIMITS, QUEUE_SANDBOX_DEFAULTS);
}

function queuePredictionBucket(input = {}) {
  const values = normalizeQueueSandboxInput(input);
  const capacity = values.workerCount * 1000 / values.serviceTimeMs;
  const offered = values.arrivalRate + values.arrivalRate * values.failureRate / 100 * values.retryRate / 100;
  const utilization = offered / capacity;
  const backlog = Math.max(0, offered - capacity) * 10;
  if (backlog > values.queueCapacity) return 'overflows';
  if (utilization >= 0.75) return 'grows';
  return 'drains';
}

function simulateQueue(input = {}) {
  const values = normalizeQueueSandboxInput(input);
  const serviceCapacityRps = values.workerCount * 1000 / values.serviceTimeMs;
  const retryRps = values.arrivalRate * values.failureRate / 100 * values.retryRate / 100;
  const offeredRps = values.arrivalRate + retryRps;
  const utilization = offeredRps / serviceCapacityRps;
  const processableRps = Math.min(offeredRps, serviceCapacityRps);
  const failedRps = processableRps * values.failureRate / 100;
  const successfulRps = processableRps - failedRps;
  const backlogGrowthRps = Math.max(0, offeredRps - serviceCapacityRps);
  const modeledBacklog = backlogGrowthRps * 10;
  const backlogMessages = Math.min(values.queueCapacity, modeledBacklog);
  const droppedRps = Math.max(0, modeledBacklog - values.queueCapacity) / 10;
  const estimatedP95LatencyMs = values.serviceTimeMs * 1.3
    + Math.max(0, utilization - 0.7) * values.serviceTimeMs * 5
    + backlogMessages / serviceCapacityRps * 1000;
  const capacityRisk = utilization >= 1 ? 'stress' : utilization >= 0.75 ? 'watch' : 'healthy';
  const dropRisk = droppedRps > 0 ? 'stress' : 'healthy';
  const failureRisk = values.failureRate >= 20 ? 'watch' : 'healthy';
  const status = sandboxStatus([capacityRisk, dropRisk, failureRisk]);
  let primaryRisk = 'none';
  if (droppedRps > 0) primaryRisk = 'queue-capacity';
  else if (utilization >= 0.75) primaryRisk = 'worker-capacity';
  else if (values.failureRate >= 20) primaryRisk = 'dependency-failures';

  const observations = [
    `Workers can process about ${sandboxFormatNumber(serviceCapacityRps)} jobs/s while producers offer ${sandboxFormatNumber(offeredRps)} jobs/s.`,
    `The worker pool is at ${sandboxFormatNumber(utilization * 100, 0)}% of its modeled capacity, including ${sandboxFormatNumber(retryRps)} jobs/s from retries.`,
    `Over a 10-second teaching window, the queue holds about ${sandboxFormatNumber(backlogMessages, 0)} jobs and drops ${sandboxFormatNumber(droppedRps)} jobs/s.`
  ];
  if (values.failureRate > 0) {
    observations.push(`${sandboxFormatNumber(failedRps)} jobs/s fail on the dependency before retry policy is applied.`);
  }

  const teachingConclusion = {
    none: 'The workers have headroom, so the queue absorbs small timing differences and returns to empty.',
    'worker-capacity': 'Backlog is a rate mismatch: until workers process faster than jobs arrive, waiting work keeps accumulating.',
    'queue-capacity': 'A bounded queue makes overload visible as drops. Backpressure, more workers, or a deliberate loss policy must follow.',
    'dependency-failures': 'Retries are extra traffic. A retry policy without backoff or a limit can turn a dependency failure into a retry storm.'
  }[primaryRisk];

  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    serviceCapacityRps: sandboxRounded(serviceCapacityRps),
    retryRps: sandboxRounded(retryRps),
    offeredRps: sandboxRounded(offeredRps),
    processableRps: sandboxRounded(processableRps),
    failedRps: sandboxRounded(failedRps),
    successfulRps: sandboxRounded(successfulRps),
    utilizationPct: sandboxRounded(utilization * 100),
    backlogGrowthRps: sandboxRounded(backlogGrowthRps),
    backlogMessages: sandboxRounded(backlogMessages),
    droppedRps: sandboxRounded(droppedRps),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations,
    teachingConclusion,
    assumptions: [
      'Workers process jobs independently with no batching.',
      'Backlog and drops are estimated over a 10-second teaching window.',
      'A failed job contributes retry work according to the selected retry rate.',
      'Service capacity is worker count multiplied by one second divided by service time.'
    ]
  };
}

/* ——— Relational database model ——— */

const DATABASE_SANDBOX_LIMITS = Object.freeze({
  queryRate: { min: 1, max: 100000, step: 1 },
  readRatio: { min: 0, max: 100, step: 1 },
  indexedReadPct: { min: 0, max: 100, step: 1 },
  connectionLimit: { min: 1, max: 10000, step: 1 },
  readServiceMs: { min: 1, max: 500, step: 1 },
  writeServiceMs: { min: 1, max: 500, step: 1 },
  replicaCount: { min: 1, max: 10, step: 1 },
  replicaReadPct: { min: 0, max: 100, step: 1 },
  baselineReplicaLagMs: { min: 0, max: 5000, step: 1 },
  hotPartitionShare: { min: 0, max: 100, step: 1 }
});

const DATABASE_SANDBOX_DEFAULTS = Object.freeze({
  queryRate: 1000,
  readRatio: 80,
  indexedReadPct: 90,
  connectionLimit: 100,
  readServiceMs: 4,
  writeServiceMs: 8,
  replicaCount: 2,
  replicaReadPct: 50,
  baselineReplicaLagMs: 20,
  hotPartitionShare: 10
});

const DATABASE_SANDBOX_CONTROLS = Object.freeze([
  { key: 'queryRate', label: 'Queries / second', unit: 'q/s' },
  { key: 'readRatio', label: 'Read traffic', unit: '%' },
  { key: 'indexedReadPct', label: 'Reads using an index', unit: '%' },
  { key: 'connectionLimit', label: 'Connection limit', unit: 'connections' },
  { key: 'readServiceMs', label: 'Indexed read time', unit: 'ms' },
  { key: 'writeServiceMs', label: 'Write time', unit: 'ms' },
  { key: 'replicaCount', label: 'Read replicas', unit: 'replicas', advanced: true },
  { key: 'replicaReadPct', label: 'Reads sent to replicas', unit: '%', advanced: true },
  { key: 'baselineReplicaLagMs', label: 'Baseline replica lag', unit: 'ms', advanced: true },
  { key: 'hotPartitionShare', label: 'Hottest partition share', unit: '%', advanced: true }
]);

const DATABASE_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'indexed-steady', label: 'Indexed steady state', level: 1,
    description: 'A mostly indexed workload fits within the primary connection budget.',
    objective: 'See how access-path cost and connection limits shape throughput.',
    values: DATABASE_SANDBOX_DEFAULTS
  },
  {
    id: 'unindexed-reads', label: 'Unindexed reads', level: 2,
    description: 'A schema change leaves many reads scanning instead of using an index.',
    objective: 'Predict the latency and connection pressure from a more expensive query.',
    values: { ...DATABASE_SANDBOX_DEFAULTS, queryRate: 2000, indexedReadPct: 30, readServiceMs: 6 }
  },
  {
    id: 'write-spike', label: 'Write spike', level: 3,
    description: 'A launch event shifts traffic toward writes on the primary.',
    objective: 'Notice that replicas help reads but do not remove primary write work.',
    values: { ...DATABASE_SANDBOX_DEFAULTS, queryRate: 5000, readRatio: 40, writeServiceMs: 12 }
  },
  {
    id: 'replica-lag', label: 'Replica lag', level: 4,
    description: 'Replicas receive most reads while the primary is under pressure.',
    objective: 'Trade read scale against freshness and replication lag.',
    values: { ...DATABASE_SANDBOX_DEFAULTS, queryRate: 3000, replicaReadPct: 90, baselineReplicaLagMs: 400 }
  },
  {
    id: 'hot-partition', label: 'Hot partition', level: 5,
    description: 'One partition receives most traffic even though the aggregate looks moderate.',
    objective: 'Find skew that aggregate throughput hides.',
    values: { ...DATABASE_SANDBOX_DEFAULTS, queryRate: 2500, hotPartitionShare: 85, connectionLimit: 80 }
  }
]);

const DATABASE_PREDICTION_OPTIONS = Object.freeze([
  { id: 'healthy', label: 'The database keeps comfortable headroom' },
  { id: 'query-cost', label: 'Query cost drives latency and connections up' },
  { id: 'saturated', label: 'The primary or a hot partition saturates' },
  { id: 'replication-lag', label: 'Read scale comes with visible replica lag' }
]);

function normalizeDatabaseSandboxInput(input = {}) {
  return normalizeModelInput(input, DATABASE_SANDBOX_LIMITS, DATABASE_SANDBOX_DEFAULTS);
}

function databasePredictionBucket(input = {}) {
  const result = simulateDatabase(input);
  if (result.replicaLagMs >= 300) return 'replication-lag';
  if (result.primaryUtilizationPct >= 100 || result.hotPartitionUtilizationPct >= 75) return 'saturated';
  if (result.weightedQueryMs > result.input.readServiceMs * 2 || result.connectionPressurePct >= 75) return 'query-cost';
  return 'healthy';
}

function simulateDatabase(input = {}) {
  const values = normalizeDatabaseSandboxInput(input);
  const queryRate = values.queryRate;
  const readRps = queryRate * values.readRatio / 100;
  const writeRps = queryRate - readRps;
  const indexedReadRps = readRps * values.indexedReadPct / 100;
  const unindexedReadRps = readRps - indexedReadRps;
  const weightedQueryMs = queryRate > 0
    ? (indexedReadRps * values.readServiceMs
      + unindexedReadRps * values.readServiceMs * 5
      + writeRps * values.writeServiceMs) / queryRate
    : 0;
  const connectionDemand = queryRate * weightedQueryMs / 1000;
  const connectionPressure = connectionDemand / values.connectionLimit;
  const primaryRps = writeRps + readRps * (1 - values.replicaReadPct / 100);
  const primaryCapacityRps = values.connectionLimit * 1000 / Math.max(1, weightedQueryMs);
  const primaryUtilization = primaryRps / primaryCapacityRps;
  const replicaReadRps = readRps * values.replicaReadPct / 100;
  const replicaRps = replicaReadRps / values.replicaCount;
  const replicaCapacityRps = values.connectionLimit * 1000 / Math.max(1, values.readServiceMs);
  const replicaUtilization = replicaRps / replicaCapacityRps;
  const hotPartitionRps = primaryRps * values.hotPartitionShare / 100;
  const hotPartitionBudget = Math.max(10, primaryCapacityRps * 0.1);
  const hotPartitionUtilization = hotPartitionRps / hotPartitionBudget;
  const replicaLagMs = values.baselineReplicaLagMs
    + Math.max(0, primaryUtilization - 0.7) * 500
    + Math.max(0, (100 - values.indexedReadPct) / 100 - 0.5) * 200;
  const estimatedP95LatencyMs = weightedQueryMs * 1.3
    + Math.max(0, connectionPressure - 0.7) * weightedQueryMs * 4
    + Math.max(0, primaryUtilization - 0.7) * 20;
  const primaryRisk = primaryUtilization >= 1 ? 'stress' : primaryUtilization >= 0.75 ? 'watch' : 'healthy';
  const connectionRisk = connectionPressure >= 1 ? 'stress' : connectionPressure >= 0.75 ? 'watch' : 'healthy';
  const hotRisk = hotPartitionUtilization >= 1 ? 'stress' : hotPartitionUtilization >= 0.75 ? 'watch' : 'healthy';
  const lagRisk = replicaLagMs >= 300 ? 'watch' : 'healthy';
  const status = sandboxStatus([primaryRisk, connectionRisk, hotRisk, lagRisk]);
  let risk = 'none';
  if (hotRisk !== 'healthy') risk = 'hot-partition';
  else if (primaryRisk !== 'healthy' || connectionRisk !== 'healthy') risk = 'primary-capacity';
  else if (lagRisk !== 'healthy') risk = 'replication-lag';
  else if (values.indexedReadPct < 60) risk = 'query-cost';

  const observations = [
    `The primary handles ${sandboxFormatNumber(primaryRps)} operations/s with ${sandboxFormatNumber(primaryUtilization * 100, 0)}% modeled utilization.`,
    `${sandboxFormatNumber(values.indexedReadPct, 0)}% of reads use an index; weighted query time is about ${sandboxFormatNumber(weightedQueryMs)} ms.`,
    `The workload needs about ${sandboxFormatNumber(connectionDemand)} concurrent connections against a ${sandboxFormatNumber(values.connectionLimit, 0)}-connection limit.`
  ];
  if (values.replicaReadPct > 0) {
    observations.push(`${sandboxFormatNumber(values.replicaReadPct, 0)}% of reads use replicas, with modeled lag at ${sandboxFormatNumber(replicaLagMs)} ms.`);
  }
  if (values.hotPartitionShare >= 75) {
    observations.push(`The hottest partition carries ${sandboxFormatNumber(hotPartitionRps)} primary operations/s against a simple ${sandboxFormatNumber(hotPartitionBudget)} operations/s skew budget.`);
  }

  const teachingConclusion = {
    none: 'The indexed workload and connection budget leave headroom in this model; that does not remove the need to measure a real query plan.',
    'query-cost': 'Expensive access paths consume connections for longer. Indexing or changing the access pattern can matter more than adding replicas.',
    'primary-capacity': 'Read replicas do not move writes off the primary. The primary or its connection pool is the limiting stage here.',
    'replication-lag': 'Replicas add read capacity with a freshness trade-off. A read-after-write requirement may need primary reads or another consistency design.',
    'hot-partition': 'Partitioning only helps when traffic spreads across partitions. A hot key or tenant can saturate one slice first.'
  }[risk];

  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    readRps: sandboxRounded(readRps),
    writeRps: sandboxRounded(writeRps),
    indexedReadRps: sandboxRounded(indexedReadRps),
    unindexedReadRps: sandboxRounded(unindexedReadRps),
    weightedQueryMs: sandboxRounded(weightedQueryMs),
    connectionDemand: sandboxRounded(connectionDemand),
    connectionPressurePct: sandboxRounded(connectionPressure * 100),
    primaryRps: sandboxRounded(primaryRps),
    primaryCapacityRps: sandboxRounded(primaryCapacityRps),
    primaryUtilizationPct: sandboxRounded(primaryUtilization * 100),
    replicaReadRps: sandboxRounded(replicaReadRps),
    replicaRps: sandboxRounded(replicaRps),
    replicaUtilizationPct: sandboxRounded(replicaUtilization * 100),
    hotPartitionRps: sandboxRounded(hotPartitionRps),
    hotPartitionUtilizationPct: sandboxRounded(hotPartitionUtilization * 100),
    replicaLagMs: sandboxRounded(replicaLagMs),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk: risk,
    observations,
    teachingConclusion,
    assumptions: [
      'Indexed reads use the selected read time; unindexed reads cost five times as much in this model.',
      'Connection demand is approximated with arrival rate multiplied by service time.',
      'Read replicas share reads evenly and do not accept writes.',
      'Replica lag is an educational pressure signal, not a database-engine forecast.',
      'The hot-partition budget is 10% of primary capacity to make skew visible.'
    ]
  };
}

/* ——— Simulation traces ——— */

const SANDBOX_FLOW_TONES = Object.freeze(['neutral', 'healthy', 'watch', 'stress']);

function sandboxFlowTone(tone = 'neutral') {
  return SANDBOX_FLOW_TONES.includes(tone) ? tone : 'neutral';
}

function sandboxFlowStage(id, label, value, unit, detail, tone = 'neutral') {
  return {
    id,
    label,
    value: String(value),
    unit,
    detail,
    tone: sandboxFlowTone(tone)
  };
}

function sandboxFlowOutcome(id, label, value, unit, detail, tone = 'neutral') {
  return {
    id,
    label,
    value: String(value),
    unit,
    detail,
    tone: sandboxFlowTone(tone)
  };
}

function buildRedisSimulationDiagram(result) {
  const input = result.input;
  const backendTone = result.primaryRisk === 'backend-load'
    ? 'stress'
    : result.backendRps > 0 ? 'watch' : 'healthy';
  const hitTone = result.cacheHitsRps > 0 ? 'healthy' : 'neutral';
  const missTone = result.backendReadRps > 0
    ? result.primaryRisk === 'backend-load' ? 'stress' : 'watch'
    : 'neutral';

  return {
    title: 'Request path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(result.cacheHitsRps)} reads stop at the cache; ${sandboxFormatNumber(result.backendReadRps)} misses continue to the backing store.`,
    stages: [
      sandboxFlowStage(
        'traffic',
        'Incoming traffic',
        sandboxFormatNumber(result.redisOpsRps),
        'ops/s',
        `${sandboxFormatNumber(input.readRatio, 0)}% reads · ${sandboxFormatNumber(result.writeRps)} writes`,
        'neutral'
      ),
      sandboxFlowStage(
        'cache',
        'Cache node',
        sandboxFormatNumber(result.cacheHitsRps),
        'hits/s',
        `${sandboxFormatNumber(result.cacheMissesRps)} misses · ${sandboxFormatNumber(result.nodeUtilizationPct, 0)}% node use`,
        result.primaryRisk === 'none' ? 'healthy' : result.status
      ),
      sandboxFlowStage(
        'store',
        'Backing store',
        sandboxFormatNumber(result.backendRps),
        'ops/s',
        `${sandboxFormatNumber(result.backendReadRps)} reads + ${sandboxFormatNumber(result.backendWriteRps)} writes`,
        backendTone
      )
    ],
    outcomes: [
      sandboxFlowOutcome(
        'cache-hit',
        'Cache hits',
        sandboxFormatNumber(result.cacheHitsRps),
        'reads/s',
        'Response returns from the cache.',
        hitTone
      ),
      sandboxFlowOutcome(
        'cache-miss',
        'Misses to store',
        sandboxFormatNumber(result.backendReadRps),
        'reads/s',
        'Read pays the backing-store path.',
        missTone
      ),
      sandboxFlowOutcome(
        'cache-write',
        'Writes to store',
        sandboxFormatNumber(result.backendWriteRps),
        'writes/s',
        'Writes bypass this cache model.',
        result.backendWriteRps > 0 ? 'neutral' : 'healthy'
      )
    ],
    callout: result.teachingConclusion,
    ariaLabel: `Incoming traffic flows through a cache. ${sandboxFormatNumber(result.cacheHitsRps)} reads are cache hits, ${sandboxFormatNumber(result.backendReadRps)} reads miss and reach the backing store, and ${sandboxFormatNumber(result.backendWriteRps)} writes reach the backing store.`
  };
}

function buildQueueSimulationDiagram(result) {
  const input = result.input;
  const queueTone = result.droppedRps > 0
    ? 'stress'
    : result.backlogMessages > 0 ? 'watch' : 'healthy';
  const workerTone = result.utilizationPct >= 100
    ? 'stress'
    : result.utilizationPct >= 75 ? 'watch' : 'healthy';

  return {
    title: 'Work path',
    windowLabel: '10-second teaching window',
    caption: `${sandboxFormatNumber(result.offeredRps)} jobs/s arrive; the worker pool can process ${sandboxFormatNumber(result.serviceCapacityRps)} jobs/s.`,
    stages: [
      sandboxFlowStage(
        'producers',
        'Producers',
        sandboxFormatNumber(input.arrivalRate),
        'jobs/s',
        `${sandboxFormatNumber(input.failureRate, 0)}% dependency failures · retries add work`,
        'neutral'
      ),
      sandboxFlowStage(
        'queue',
        'Queue',
        sandboxFormatNumber(result.backlogMessages, 0),
        'jobs held',
        `${sandboxFormatNumber(result.backlogGrowthRps)} jobs/s growth`,
        queueTone
      ),
      sandboxFlowStage(
        'workers',
        'Worker pool',
        sandboxFormatNumber(result.serviceCapacityRps),
        'jobs/s capacity',
        `${sandboxFormatNumber(result.utilizationPct, 0)}% utilized · ${sandboxFormatNumber(input.workerCount, 0)} workers`,
        workerTone
      )
    ],
    outcomes: [
      sandboxFlowOutcome(
        'completed',
        'Completed',
        sandboxFormatNumber(result.successfulRps),
        'jobs/s',
        'Work that finishes successfully.',
        result.successfulRps > 0 ? 'healthy' : 'neutral'
      ),
      sandboxFlowOutcome(
        'retries',
        'Retry loop',
        sandboxFormatNumber(result.retryRps),
        'jobs/s',
        'Failed work re-enters the offered load.',
        result.retryRps > 0 ? 'watch' : 'neutral'
      ),
      sandboxFlowOutcome(
        'dropped',
        'Dropped',
        sandboxFormatNumber(result.droppedRps),
        'jobs/s',
        'Overflow becomes explicit loss.',
        result.droppedRps > 0 ? 'stress' : 'healthy'
      )
    ],
    callout: result.teachingConclusion,
    ariaLabel: `Producers offer ${sandboxFormatNumber(result.offeredRps)} jobs per second to a queue. Workers can process ${sandboxFormatNumber(result.serviceCapacityRps)} jobs per second. ${sandboxFormatNumber(result.backlogMessages, 0)} jobs remain queued, ${sandboxFormatNumber(result.retryRps)} jobs per second retry, and ${sandboxFormatNumber(result.droppedRps)} jobs per second drop.`
  };
}

function buildDatabaseSimulationDiagram(result) {
  const input = result.input;
  const planTone = input.indexedReadPct < 60 ? 'watch' : 'healthy';
  const storageTone = result.primaryRisk === 'none' && result.status === 'healthy'
    ? 'healthy'
    : result.status;
  const replicaTone = result.replicaLagMs >= 300
    ? 'watch'
    : result.replicaReadRps > 0 ? 'healthy' : 'neutral';
  const hotTone = result.hotPartitionUtilizationPct >= 100
    ? 'stress'
    : result.hotPartitionUtilizationPct >= 75 ? 'watch' : 'neutral';

  return {
    title: 'Query path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(input.queryRate)} queries/s become a ${sandboxFormatNumber(result.weightedQueryMs)} ms weighted access path before storage is split.`,
    stages: [
      sandboxFlowStage(
        'client',
        'Client queries',
        sandboxFormatNumber(input.queryRate),
        'queries/s',
        `${sandboxFormatNumber(input.readRatio, 0)}% reads · ${sandboxFormatNumber(100 - input.readRatio, 0)}% writes`,
        'neutral'
      ),
      sandboxFlowStage(
        'query-plan',
        'Query plan',
        sandboxFormatNumber(result.weightedQueryMs),
        'ms weighted',
        `${sandboxFormatNumber(input.indexedReadPct, 0)}% of reads use an index`,
        planTone
      ),
      sandboxFlowStage(
        'storage',
        'Storage paths',
        sandboxFormatNumber(result.primaryRps),
        'primary ops/s',
        `${sandboxFormatNumber(result.replicaReadRps)} reads/s routed to replicas`,
        storageTone
      )
    ],
    outcomes: [
      sandboxFlowOutcome(
        'primary',
        'Primary path',
        sandboxFormatNumber(result.primaryRps),
        'ops/s',
        `${sandboxFormatNumber(result.writeRps)} writes/s stay on primary.`,
        result.primaryUtilizationPct >= 100 ? 'stress' : result.primaryUtilizationPct >= 75 ? 'watch' : 'healthy'
      ),
      sandboxFlowOutcome(
        'replicas',
        'Replica reads',
        sandboxFormatNumber(result.replicaReadRps),
        'reads/s',
        `${sandboxFormatNumber(input.replicaCount, 0)} replicas · ${sandboxFormatNumber(result.replicaRps)} each`,
        replicaTone
      ),
      sandboxFlowOutcome(
        'skew',
        'Hot partition',
        sandboxFormatNumber(result.hotPartitionRps),
        'ops/s',
        `${sandboxFormatNumber(input.hotPartitionShare, 0)}% of primary work in one slice`,
        hotTone
      )
    ],
    callout: result.teachingConclusion,
    ariaLabel: `Client queries pass through a query plan to primary and replica paths. The primary handles ${sandboxFormatNumber(result.primaryRps)} operations per second, replicas handle ${sandboxFormatNumber(result.replicaReadRps)} reads per second, and the modeled replica lag is ${sandboxFormatNumber(result.replicaLagMs)} milliseconds.`
  };
}

function buildGenericSimulationDiagram(result) {
  const metrics = Object.entries(result)
    .filter(([key, value]) => key !== 'input' && typeof value === 'number')
    .slice(0, 3);
  return {
    title: 'Simulation trace',
    windowLabel: 'Model output',
    caption: 'The model transformed your assumptions into these observable signals.',
    stages: [
      sandboxFlowStage('input', 'Inputs', '1', 'run', 'Your selected assumptions.', 'neutral'),
      sandboxFlowStage('node', 'Node model', '1', 'node', 'The reviewed model applies its rules.', 'healthy'),
      sandboxFlowStage('output', 'Outputs', String(metrics.length), 'signals', 'Derived metrics explain the result.', result.status)
    ],
    outcomes: metrics.map(([key, value]) => sandboxFlowOutcome(key, key, sandboxFormatNumber(value), 'signal', 'Derived from this run.', result.status)),
    callout: result.teachingConclusion || 'Inspect the assumptions and compare the derived signals.',
    ariaLabel: 'A generic sandbox model transforms inputs into derived output signals.'
  };
}

/* ——— Generic model catalog ——— */

const SANDBOX_NODE_MODELS = Object.freeze([
  {
    id: 'redis-cache',
    label: 'Redis-like cache',
    description: 'Explore hits, misses, memory, hot keys, and backing-store load.',
    predictionQuestion: 'What will happen to backing-store read traffic?',
    metrics: [
      { label: 'Cache hit rate', key: 'hitRate', source: 'input', unit: '%' },
      { label: 'Backend reads', key: 'backendReadRps', unit: '/s' },
      { label: 'Backend reduction', key: 'backendTrafficReductionPct', unit: '%' },
      { label: 'Node utilization', key: 'nodeUtilizationPct', unit: '%' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' },
      { label: 'Memory pressure', key: 'memoryPressurePct', unit: '%' }
    ],
    limits: REDIS_SANDBOX_LIMITS,
    controls: REDIS_SANDBOX_CONTROLS,
    situations: REDIS_SANDBOX_SITUATIONS,
    flowPreview: ['Incoming traffic', 'Cache node', 'Backing store'],
    predictionOptions: REDIS_PREDICTION_OPTIONS,
    defaults: REDIS_SANDBOX_DEFAULTS,
    normalize: normalizeRedisSandboxInput,
    simulate: simulateRedis,
    predictionBucket: input => redisPredictionBucket(input.hitRate),
    diagram: buildRedisSimulationDiagram
  },
  {
    id: 'queue-worker',
    label: 'Queue + worker',
    description: 'Explore worker capacity, backlog, retries, and bounded queues.',
    predictionQuestion: 'What will happen to the queue backlog?',
    metrics: [
      { label: 'Offered load', key: 'offeredRps', unit: 'jobs/s' },
      { label: 'Worker utilization', key: 'utilizationPct', unit: '%' },
      { label: 'Backlog', key: 'backlogMessages', unit: 'jobs' },
      { label: 'Dropped work', key: 'droppedRps', unit: '/s' },
      { label: 'Successful work', key: 'successfulRps', unit: '/s' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: QUEUE_SANDBOX_LIMITS,
    controls: QUEUE_SANDBOX_CONTROLS,
    situations: QUEUE_SANDBOX_SITUATIONS,
    flowPreview: ['Producers', 'Queue', 'Worker pool'],
    predictionOptions: QUEUE_PREDICTION_OPTIONS,
    defaults: QUEUE_SANDBOX_DEFAULTS,
    normalize: normalizeQueueSandboxInput,
    simulate: simulateQueue,
    predictionBucket: queuePredictionBucket,
    diagram: buildQueueSimulationDiagram
  },
  {
    id: 'relational-database',
    label: 'Relational database',
    description: 'Explore query cost, connections, replicas, lag, and skew.',
    predictionQuestion: 'What becomes the first constraint?',
    metrics: [
      { label: 'Weighted query time', key: 'weightedQueryMs', unit: 'ms' },
      { label: 'Connection pressure', key: 'connectionPressurePct', unit: '%' },
      { label: 'Primary utilization', key: 'primaryUtilizationPct', unit: '%' },
      { label: 'Replica lag', key: 'replicaLagMs', unit: 'ms' },
      { label: 'Hot partition', key: 'hotPartitionUtilizationPct', unit: '%' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: DATABASE_SANDBOX_LIMITS,
    controls: DATABASE_SANDBOX_CONTROLS,
    situations: DATABASE_SANDBOX_SITUATIONS,
    flowPreview: ['Client queries', 'Query plan', 'Storage paths'],
    predictionOptions: DATABASE_PREDICTION_OPTIONS,
    defaults: DATABASE_SANDBOX_DEFAULTS,
    normalize: normalizeDatabaseSandboxInput,
    simulate: simulateDatabase,
    predictionBucket: databasePredictionBucket,
    diagram: buildDatabaseSimulationDiagram
  }
]);

function getSandboxNode(id = 'redis-cache') {
  return SANDBOX_NODE_MODELS.find(model => model.id === id) || SANDBOX_NODE_MODELS[0];
}

function getSandboxSituation(nodeId = 'redis-cache', situationId) {
  const node = getSandboxNode(nodeId);
  return node.situations.find(situation => situation.id === situationId) || node.situations[0];
}

function normalizeSandboxNodeInput(nodeId, input = {}) {
  return getSandboxNode(nodeId).normalize(input);
}

function simulateSandboxNode(nodeId, input = {}) {
  const node = getSandboxNode(nodeId);
  const result = node.simulate(input);
  const simulation = node.diagram ? node.diagram(result) : buildGenericSimulationDiagram(result);
  return { ...result, nodeId: node.id, simulation };
}

function getSandboxPredictionBucket(nodeId, input = {}) {
  const node = getSandboxNode(nodeId);
  return node.predictionBucket(node.normalize(input));
}

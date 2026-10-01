/* Deterministic concept-sandbox models.
 *
 * The reviewed models are deliberately bounded: cache, queue/worker,
 * relational database, and ten common interview-pattern families. They are
 * instructional models, not benchmarks or claims about any particular vendor
 * deployment. Keep the inputs, equations, and assumptions explicit so a
 * learner can inspect why an output changed.
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

/* ——— Popular interview-pattern models ——— */

function sandboxPressureTone(value, watch = 0.75, stress = 1) {
  return value >= stress ? 'stress' : value >= watch ? 'watch' : 'healthy';
}

function sandboxClampPercent(value) {
  return Math.min(100, Math.max(0, value));
}

function sandboxInterviewTrace({ title, windowLabel, caption, stages, outcomes, callout, ariaLabel }) {
  return {
    title,
    windowLabel,
    caption,
    stages,
    outcomes,
    callout,
    ariaLabel
  };
}

function createInterviewSandboxModel(definition) {
  return {
    ...definition,
    normalize: input => normalizeModelInput(input, definition.limits, definition.defaults),
    diagram: result => result.trace
  };
}

/* URL shortener model. */

const URL_SHORTENER_SANDBOX_LIMITS = Object.freeze({
  createRate: { min: 1, max: 100000, step: 1 },
  redirectRate: { min: 1, max: 1000000, step: 1 },
  cacheHitRate: { min: 0, max: 100, step: 1 },
  codeSpaceMillions: { min: 0.001, max: 100000, step: 0.001 },
  storageWriteCapacity: { min: 1, max: 100000, step: 1 },
  redirectCapacity: { min: 1, max: 1000000, step: 1 },
  redirectLookupLatencyMs: { min: 0.1, max: 100, step: 0.1 },
  collisionCheckMs: { min: 0.01, max: 10, step: 0.01 }
});

const URL_SHORTENER_SANDBOX_DEFAULTS = Object.freeze({
  createRate: 100,
  redirectRate: 10000,
  cacheHitRate: 95,
  codeSpaceMillions: 1000,
  storageWriteCapacity: 1000,
  redirectCapacity: 50000,
  redirectLookupLatencyMs: 8,
  collisionCheckMs: 0.5
});

const URL_SHORTENER_SANDBOX_CONTROLS = Object.freeze([
  { key: 'createRate', label: 'Short links created', unit: '/s' },
  { key: 'redirectRate', label: 'Redirect traffic', unit: '/s' },
  { key: 'cacheHitRate', label: 'Redirect cache hit rate', unit: '%' },
  { key: 'codeSpaceMillions', label: 'Code space', unit: 'million codes' },
  { key: 'storageWriteCapacity', label: 'Mapping-write capacity', unit: '/s' },
  { key: 'redirectCapacity', label: 'Redirect capacity', unit: '/s' },
  { key: 'redirectLookupLatencyMs', label: 'Mapping lookup latency', unit: 'ms', advanced: true },
  { key: 'collisionCheckMs', label: 'Collision check cost', unit: 'ms', advanced: true }
]);

const URL_SHORTENER_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-redirects', label: 'Steady redirects', level: 1,
    description: 'A read-heavy short-link service with a warm redirect cache.',
    objective: 'Connect cache hits to mapping-store reads.',
    values: URL_SHORTENER_SANDBOX_DEFAULTS
  },
  {
    id: 'viral-link', label: 'Viral link', level: 2,
    description: 'One link becomes a global read hotspot.',
    objective: 'Predict whether redirect capacity, rather than storage writes, becomes the constraint.',
    values: { ...URL_SHORTENER_SANDBOX_DEFAULTS, redirectRate: 100000, cacheHitRate: 98, redirectCapacity: 50000 }
  },
  {
    id: 'cold-redirect-cache', label: 'Cold redirect cache', level: 3,
    description: 'A restart sends most redirect lookups to the mapping store.',
    objective: 'Spot the read amplification caused by cache misses.',
    values: { ...URL_SHORTENER_SANDBOX_DEFAULTS, redirectRate: 30000, cacheHitRate: 20 }
  },
  {
    id: 'creation-burst', label: 'Creation burst', level: 4,
    description: 'A campaign creates short links faster than mappings can be written.',
    objective: 'Compare ID creation throughput with durable mapping capacity.',
    values: { ...URL_SHORTENER_SANDBOX_DEFAULTS, createRate: 5000, storageWriteCapacity: 1000 }
  },
  {
    id: 'small-code-space', label: 'Small code space', level: 5,
    description: 'A compact code format approaches its available ID space.',
    objective: 'Recognize collision pressure before uniqueness checks dominate.',
    values: { ...URL_SHORTENER_SANDBOX_DEFAULTS, createRate: 100000, codeSpaceMillions: 0.01 }
  }
]);

const URL_SHORTENER_PREDICTION_OPTIONS = Object.freeze([
  { id: 'mostly-cached', label: 'Most redirects are served from cache' },
  { id: 'lookup-heavy', label: 'Mapping-store lookups become meaningful' },
  { id: 'redirect-saturation', label: 'Redirect capacity is the first constraint' },
  { id: 'code-generation-risk', label: 'Code creation or collision checks dominate' }
]);

function urlShortenerPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, URL_SHORTENER_SANDBOX_LIMITS, URL_SHORTENER_SANDBOX_DEFAULTS);
  const cacheMissRate = 1 - values.cacheHitRate / 100;
  const redirectUtilization = values.redirectRate / values.redirectCapacity;
  const creationUtilization = values.createRate / values.storageWriteCapacity;
  const dailyCodes = values.createRate * 86400;
  const collisionPressure = dailyCodes / (values.codeSpaceMillions * 1000000);
  if (redirectUtilization >= 1) return 'redirect-saturation';
  if (collisionPressure >= 1 || creationUtilization >= 1) return 'code-generation-risk';
  if (cacheMissRate >= 0.5 || redirectUtilization >= 0.75) return 'lookup-heavy';
  return 'mostly-cached';
}

function simulateUrlShortener(input = {}) {
  const values = normalizeModelInput(input, URL_SHORTENER_SANDBOX_LIMITS, URL_SHORTENER_SANDBOX_DEFAULTS);
  const cacheHitsRps = values.redirectRate * values.cacheHitRate / 100;
  const mappingLookupRps = values.redirectRate - cacheHitsRps;
  const dailyCodes = values.createRate * 86400;
  const collisionPressure = dailyCodes / (values.codeSpaceMillions * 1000000);
  const redirectUtilization = values.redirectRate / values.redirectCapacity;
  const creationUtilization = values.createRate / values.storageWriteCapacity;
  const lookupLatencyMs = values.redirectLookupLatencyMs + values.collisionCheckMs * mappingLookupRps / Math.max(1, values.redirectCapacity);
  const estimatedP95LatencyMs = lookupLatencyMs + Math.max(0, redirectUtilization - 0.7) ** 2 * 40;
  const redirectRisk = sandboxPressureTone(redirectUtilization);
  const creationRisk = sandboxPressureTone(creationUtilization);
  const collisionRisk = sandboxPressureTone(collisionPressure);
  const cacheRisk = values.cacheHitRate < 50 ? 'watch' : 'healthy';
  const risks = [redirectRisk, creationRisk, collisionRisk, cacheRisk];
  const status = sandboxStatus(risks);
  let primaryRisk = 'none';
  if (redirectRisk === 'stress' || redirectRisk === 'watch') primaryRisk = 'redirect-capacity';
  else if (collisionRisk === 'stress' || collisionRisk === 'watch') primaryRisk = 'code-collision';
  else if (creationRisk === 'stress' || creationRisk === 'watch') primaryRisk = 'mapping-writes';
  else if (cacheRisk === 'watch') primaryRisk = 'cache-miss';
  const teachingConclusion = {
    none: 'A warm redirect cache absorbs most reads, leaving the mapping store to handle only misses and new short links.',
    'redirect-capacity': 'Redirects are read-heavy, but a cache does not remove the need to provision the redirect path itself.',
    'code-collision': 'A finite code space makes uniqueness a capacity problem: generation must leave room for collision checks or a larger key space.',
    'mapping-writes': 'Short-link creation is a durable write path. A read-heavy service can still overload storage during a creation burst.',
    'cache-miss': 'Cold redirect caches turn a cheap lookup into mapping-store traffic, so warm-up and cacheability matter.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Short-link path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.redirectRate)} redirects split into ${sandboxFormatNumber(cacheHitsRps)} cache hits and ${sandboxFormatNumber(mappingLookupRps)} mapping lookups.`,
    stages: [
      sandboxFlowStage('links', 'Link requests', sandboxFormatNumber(values.redirectRate), 'redirects/s', `${sandboxFormatNumber(values.createRate)} new links/s`, 'neutral'),
      sandboxFlowStage('redirect-cache', 'Redirect cache', sandboxFormatNumber(cacheHitsRps), 'hits/s', `${sandboxFormatNumber(values.cacheHitRate, 0)}% cache hit rate`, values.cacheHitRate >= 75 ? 'healthy' : 'watch'),
      sandboxFlowStage('mapping-store', 'Mapping store', sandboxFormatNumber(mappingLookupRps + values.createRate), 'ops/s', `${sandboxFormatNumber(mappingLookupRps)} reads + ${sandboxFormatNumber(values.createRate)} writes`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('cached', 'Cached redirects', sandboxFormatNumber(cacheHitsRps), 'redirects/s', 'The hot path returns without a mapping lookup.', values.cacheHitRate >= 75 ? 'healthy' : 'watch'),
      sandboxFlowOutcome('lookups', 'Mapping lookups', sandboxFormatNumber(mappingLookupRps), 'reads/s', 'Cache misses continue to durable mapping storage.', mappingLookupRps > values.redirectCapacity * 0.25 ? 'watch' : 'healthy'),
      sandboxFlowOutcome('created', 'Short links created', sandboxFormatNumber(values.createRate), 'writes/s', `${sandboxFormatNumber(collisionPressure * 100, 1)}% of the daily code space is modeled as pressure`, collisionRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Link requests pass through a redirect cache to a mapping store. ${sandboxFormatNumber(cacheHitsRps)} redirects are cached, ${sandboxFormatNumber(mappingLookupRps)} require mapping lookups, and ${sandboxFormatNumber(values.createRate)} short links are created per second.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    cacheHitsRps: sandboxRounded(cacheHitsRps),
    mappingLookupRps: sandboxRounded(mappingLookupRps),
    dailyCodes: sandboxRounded(dailyCodes),
    collisionPressurePct: sandboxRounded(sandboxClampPercent(collisionPressure * 100)),
    redirectUtilizationPct: sandboxRounded(redirectUtilization * 100),
    creationUtilizationPct: sandboxRounded(creationUtilization * 100),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(cacheHitsRps)} redirects/s are served from cache and ${sandboxFormatNumber(mappingLookupRps)} redirects/s query the mapping store.`,
      `${sandboxFormatNumber(values.createRate)} mappings/s are written against an assumed ${sandboxFormatNumber(values.storageWriteCapacity)} writes/s capacity.`,
      `The code generator sees ${sandboxFormatNumber(dailyCodes)} new codes per day against a ${sandboxFormatNumber(values.codeSpaceMillions, 3)} million-code space.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Redirect cache hits skip the mapping store; cache misses perform one mapping read.',
      'One created short link performs one durable mapping write.',
      'Collision pressure compares one day of generated codes with the available code space; it is not a probability estimate.',
      'Capacity and latency values are learner-supplied teaching assumptions.'
    ]
  };
}

/* Rate limiter model. */

const RATE_LIMITER_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  steadyLimitRps: { min: 1, max: 1000000, step: 1 },
  burstTokens: { min: 1, max: 10000000, step: 1 },
  windowSeconds: { min: 0.1, max: 60, step: 0.1 },
  clientKeys: { min: 1, max: 10000000, step: 1 },
  hotClientShare: { min: 0, max: 100, step: 1 },
  decisionCapacity: { min: 1, max: 2000000, step: 1 },
  counterRoundTripMs: { min: 0.1, max: 100, step: 0.1 },
  clockSkewMs: { min: 0, max: 1000, step: 1 }
});

const RATE_LIMITER_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 800,
  steadyLimitRps: 1000,
  burstTokens: 1000,
  windowSeconds: 1,
  clientKeys: 10000,
  hotClientShare: 10,
  decisionCapacity: 100000,
  counterRoundTripMs: 1,
  clockSkewMs: 5
});

const RATE_LIMITER_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Incoming requests', unit: 'req/s' },
  { key: 'steadyLimitRps', label: 'Steady allowance', unit: 'req/s' },
  { key: 'burstTokens', label: 'Burst tokens', unit: 'tokens' },
  { key: 'windowSeconds', label: 'Refill window', unit: 's' },
  { key: 'clientKeys', label: 'Tracked client keys', unit: 'keys' },
  { key: 'hotClientShare', label: 'Hottest-client share', unit: '%' },
  { key: 'decisionCapacity', label: 'Decision capacity', unit: 'checks/s', advanced: true },
  { key: 'counterRoundTripMs', label: 'Counter round trip', unit: 'ms', advanced: true },
  { key: 'clockSkewMs', label: 'Clock skew', unit: 'ms', advanced: true }
]);

const RATE_LIMITER_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-allowance', label: 'Steady allowance', level: 1,
    description: 'Requests stay under the refill rate and burst budget.',
    objective: 'See a token bucket admit steady traffic without throttling.',
    values: RATE_LIMITER_SANDBOX_DEFAULTS
  },
  {
    id: 'burst-window', label: 'Burst window', level: 2,
    description: 'A short burst consumes the available tokens.',
    objective: 'Predict when burst capacity is spent even though the steady limit is unchanged.',
    values: { ...RATE_LIMITER_SANDBOX_DEFAULTS, requestRate: 1800, burstTokens: 500 }
  },
  {
    id: 'abusive-client', label: 'Abusive client', level: 3,
    description: 'One client owns most of the request volume.',
    objective: 'Spot per-key concentration that aggregate rate can hide.',
    values: { ...RATE_LIMITER_SANDBOX_DEFAULTS, requestRate: 3000, hotClientShare: 80, steadyLimitRps: 1500 }
  },
  {
    id: 'distributed-counter', label: 'Distributed counter', level: 4,
    description: 'Every request needs a shared limiter decision.',
    objective: 'Compare request admission with the capacity of the shared counter.',
    values: { ...RATE_LIMITER_SANDBOX_DEFAULTS, requestRate: 180000, decisionCapacity: 100000, counterRoundTripMs: 5 }
  },
  {
    id: 'clock-skew', label: 'Clock skew', level: 5,
    description: 'Distributed workers disagree about the current window boundary.',
    objective: 'Understand why time-window decisions can become noisy near a boundary.',
    values: { ...RATE_LIMITER_SANDBOX_DEFAULTS, requestRate: 900, steadyLimitRps: 800, burstTokens: 200, windowSeconds: 1, clockSkewMs: 400, hotClientShare: 5 }
  }
]);

const RATE_LIMITER_PREDICTION_OPTIONS = Object.freeze([
  { id: 'allowed', label: 'Most requests are allowed' },
  { id: 'throttled', label: 'The limiter throttles excess requests' },
  { id: 'hot-client', label: 'One client hits a per-key pressure point' },
  { id: 'decision-capacity', label: 'The shared decision path saturates' }
]);

function rateLimiterPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, RATE_LIMITER_SANDBOX_LIMITS, RATE_LIMITER_SANDBOX_DEFAULTS);
  const admissionCapacity = values.steadyLimitRps + values.burstTokens / 10;
  const throttledPct = sandboxClampPercent((1 - Math.min(1, admissionCapacity / values.requestRate)) * 100);
  const decisionUtilization = values.requestRate / values.decisionCapacity;
  const hotClientUtilization = values.requestRate * values.hotClientShare / 100 / Math.max(1, admissionCapacity * 0.1);
  const skewPct = values.clockSkewMs / (values.windowSeconds * 1000) * 100;
  if (decisionUtilization >= 1) return 'decision-capacity';
  if (hotClientUtilization >= 1) return 'hot-client';
  if (throttledPct > 0 || skewPct >= 25) return 'throttled';
  return 'allowed';
}

function simulateRateLimiter(input = {}) {
  const values = normalizeModelInput(input, RATE_LIMITER_SANDBOX_LIMITS, RATE_LIMITER_SANDBOX_DEFAULTS);
  const admissionCapacityRps = values.steadyLimitRps + values.burstTokens / 10;
  const allowedRps = Math.min(values.requestRate, admissionCapacityRps);
  const throttledRps = Math.max(0, values.requestRate - admissionCapacityRps);
  const throttledPct = values.requestRate > 0 ? throttledRps / values.requestRate * 100 : 0;
  const decisionUtilization = values.requestRate / values.decisionCapacity;
  const hotClientRps = values.requestRate * values.hotClientShare / 100;
  const hotClientBudgetRps = Math.max(1, admissionCapacityRps * 0.1);
  const hotClientUtilization = hotClientRps / hotClientBudgetRps;
  const boundarySkewPct = values.clockSkewMs / (values.windowSeconds * 1000) * 100;
  const estimatedP95LatencyMs = values.counterRoundTripMs + Math.max(0, decisionUtilization - 0.7) ** 2 * 30;
  const decisionRisk = sandboxPressureTone(decisionUtilization);
  const hotRisk = sandboxPressureTone(hotClientUtilization);
  const throttleRisk = throttledRps > 0 ? throttledPct >= 25 ? 'stress' : 'watch' : 'healthy';
  const skewRisk = sandboxPressureTone(boundarySkewPct / 100, 0.25, 1);
  const status = sandboxStatus([decisionRisk, hotRisk, throttleRisk, skewRisk]);
  let primaryRisk = 'none';
  if (decisionRisk === 'stress' || decisionRisk === 'watch') primaryRisk = 'decision-capacity';
  else if (hotRisk === 'stress' || hotRisk === 'watch') primaryRisk = 'hot-client';
  else if (throttledRps > 0) primaryRisk = 'throttling';
  else if (skewRisk !== 'healthy') primaryRisk = 'clock-skew';
  const teachingConclusion = {
    none: 'The token bucket has enough steady and burst budget for this workload, so the limiter admits traffic while recording a cheap decision.',
    'decision-capacity': 'A limiter can reject requests correctly and still fail if the shared counter cannot evaluate decisions at the incoming rate.',
    'hot-client': 'Aggregate allowance hides a per-key hotspot. A noisy client can consume the budget intended for many clients.',
    throttling: 'The request rate exceeds the modeled allowance, so rejection is the protective behavior rather than an outage.',
    'clock-skew': 'Window boundaries are sensitive to clock disagreement. A monotonic token-bucket clock or centralized time source reduces noisy decisions.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Admission path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.requestRate)} requests/s meet a modeled ${sandboxFormatNumber(admissionCapacityRps)} requests/s allowance before service admission.`,
    stages: [
      sandboxFlowStage('clients', 'Client requests', sandboxFormatNumber(values.requestRate), 'req/s', `${sandboxFormatNumber(values.clientKeys, 0)} keys tracked`, 'neutral'),
      sandboxFlowStage('bucket', 'Token bucket', sandboxFormatNumber(admissionCapacityRps), 'allowance/s', `${sandboxFormatNumber(values.burstTokens, 0)} burst tokens`, throttleRisk),
      sandboxFlowStage('service', 'Service admission', sandboxFormatNumber(allowedRps), 'allowed/s', `${sandboxFormatNumber(throttledRps)} throttled/s`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('allowed', 'Allowed', sandboxFormatNumber(allowedRps), 'req/s', 'Requests consume steady or burst budget.', allowedRps > 0 ? 'healthy' : 'neutral'),
      sandboxFlowOutcome('throttled', 'Throttled', sandboxFormatNumber(throttledRps), 'req/s', 'Excess requests receive the modeled limit response.', throttledRps > 0 ? throttleRisk : 'healthy'),
      sandboxFlowOutcome('hot-client', 'Hot-client pressure', sandboxFormatNumber(hotClientRps), 'req/s', `${sandboxFormatNumber(values.hotClientShare, 0)}% of traffic comes from one key`, hotRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Client requests pass through a token bucket to service admission. ${sandboxFormatNumber(allowedRps)} requests per second are allowed, ${sandboxFormatNumber(throttledRps)} are throttled, and the hottest client contributes ${sandboxFormatNumber(hotClientRps)} requests per second.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    admissionCapacityRps: sandboxRounded(admissionCapacityRps),
    allowedRps: sandboxRounded(allowedRps),
    throttledRps: sandboxRounded(throttledRps),
    throttledPct: sandboxRounded(throttledPct),
    decisionUtilizationPct: sandboxRounded(decisionUtilization * 100),
    hotClientRps: sandboxRounded(hotClientRps),
    hotClientUtilizationPct: sandboxRounded(hotClientUtilization * 100),
    boundarySkewPct: sandboxRounded(boundarySkewPct),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `The bucket admits ${sandboxFormatNumber(allowedRps)} requests/s from ${sandboxFormatNumber(values.requestRate)} offered requests/s.`,
      `${sandboxFormatNumber(values.requestRate)} limiter decisions/s use ${sandboxFormatNumber(values.decisionCapacity)} checks/s of assumed shared capacity.`,
      `The hottest client contributes ${sandboxFormatNumber(hotClientRps)} requests/s, or ${sandboxFormatNumber(values.hotClientShare, 0)}% of the workload.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Burst tokens are spread across a fixed 10-second teaching horizon.',
      'Every incoming request requires one shared limiter decision.',
      'The hottest client is compared with 10% of aggregate allowance as a concentration signal.',
      'Clock skew is shown as a fraction of the configured window, not as a production correctness guarantee.'
    ]
  };
}

/* Distributed key-value store model. */

const DISTRIBUTED_KV_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  readRatio: { min: 0, max: 100, step: 1 },
  shardCount: { min: 1, max: 10000, step: 1 },
  replicationFactor: { min: 1, max: 9, step: 1 },
  readCapacityPerShard: { min: 1, max: 1000000, step: 1 },
  writeCapacityPerShard: { min: 1, max: 1000000, step: 1 },
  readQuorum: { min: 1, max: 9, step: 1 },
  writeQuorum: { min: 1, max: 9, step: 1 },
  hotKeyShare: { min: 0, max: 100, step: 1 },
  repairCapacityRps: { min: 1, max: 1000000, step: 1 },
  networkRoundTripMs: { min: 0.1, max: 100, step: 0.1 }
});

const DISTRIBUTED_KV_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 2000,
  readRatio: 80,
  shardCount: 16,
  replicationFactor: 3,
  readCapacityPerShard: 10000,
  writeCapacityPerShard: 5000,
  readQuorum: 1,
  writeQuorum: 2,
  hotKeyShare: 10,
  repairCapacityRps: 1000,
  networkRoundTripMs: 1
});

const DISTRIBUTED_KV_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Key requests', unit: 'req/s' },
  { key: 'readRatio', label: 'Read traffic', unit: '%' },
  { key: 'shardCount', label: 'Shards', unit: 'shards' },
  { key: 'replicationFactor', label: 'Replication factor', unit: 'copies' },
  { key: 'readCapacityPerShard', label: 'Read capacity / shard', unit: 'ops/s' },
  { key: 'writeCapacityPerShard', label: 'Write capacity / shard', unit: 'ops/s' },
  { key: 'readQuorum', label: 'Read quorum', unit: 'acks' },
  { key: 'writeQuorum', label: 'Write quorum', unit: 'acks' },
  { key: 'hotKeyShare', label: 'Hottest-key share', unit: '%' },
  { key: 'repairCapacityRps', label: 'Repair capacity', unit: 'ops/s', advanced: true },
  { key: 'networkRoundTripMs', label: 'Replica round trip', unit: 'ms', advanced: true }
]);

const DISTRIBUTED_KV_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'balanced-shards', label: 'Balanced shards', level: 1,
    description: 'Reads and writes spread across a replicated shard ring.',
    objective: 'See quorum work split across shards without a dominant hotspot.',
    values: DISTRIBUTED_KV_SANDBOX_DEFAULTS
  },
  {
    id: 'hot-shard', label: 'Hot shard', level: 2,
    description: 'A popular key family concentrates traffic on one shard.',
    objective: 'Predict why average cluster capacity can hide one overloaded shard.',
    values: { ...DISTRIBUTED_KV_SANDBOX_DEFAULTS, requestRate: 12000, hotKeyShare: 80, shardCount: 32, repairCapacityRps: 10000 }
  },
  {
    id: 'write-storm', label: 'Write storm', level: 3,
    description: 'Updates increase replicated work and repair demand.',
    objective: 'Connect replication factor to write and repair pressure.',
    values: { ...DISTRIBUTED_KV_SANDBOX_DEFAULTS, requestRate: 30000, readRatio: 20, replicationFactor: 5, writeQuorum: 4, repairCapacityRps: 200 }
  },
  {
    id: 'quorum-latency', label: 'Quorum latency', level: 4,
    description: 'A strong quorum waits on several replica acknowledgements.',
    objective: 'Trade read/write consistency for more replica work and latency.',
    values: { ...DISTRIBUTED_KV_SANDBOX_DEFAULTS, readQuorum: 3, writeQuorum: 3, networkRoundTripMs: 15 }
  },
  {
    id: 'weak-read', label: 'Weak-read pressure', level: 5,
    description: 'The system favors availability with weak reads under a skewed workload.',
    objective: 'Recognize that a weak quorum lowers latency but does not remove hot-shard risk.',
    values: { ...DISTRIBUTED_KV_SANDBOX_DEFAULTS, requestRate: 30000, readRatio: 95, hotKeyShare: 80, readQuorum: 1, shardCount: 8, repairCapacityRps: 10000 }
  }
]);

const DISTRIBUTED_KV_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced', label: 'Work stays balanced across shards' },
  { id: 'hot-shard', label: 'One shard becomes the bottleneck' },
  { id: 'repair-pressure', label: 'Replicated writes create repair pressure' },
  { id: 'quorum-latency', label: 'Replica quorum cost drives latency' }
]);

function distributedKvPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, DISTRIBUTED_KV_SANDBOX_LIMITS, DISTRIBUTED_KV_SANDBOX_DEFAULTS);
  const readQuorum = Math.min(values.readQuorum, values.replicationFactor);
  const writeQuorum = Math.min(values.writeQuorum, values.replicationFactor);
  const readRps = values.requestRate * values.readRatio / 100;
  const writeRps = values.requestRate - readRps;
  const totalWork = readRps * readQuorum + writeRps * values.replicationFactor;
  const hotShardWork = totalWork * values.hotKeyShare / 100 + totalWork * (1 - values.hotKeyShare / 100) / values.shardCount;
  const hotShardCapacity = values.readCapacityPerShard * readQuorum + values.writeCapacityPerShard * values.replicationFactor;
  const hotUtilization = hotShardWork / hotShardCapacity;
  const repairBacklog = Math.max(0, writeRps * Math.max(0, values.replicationFactor - 1) - values.repairCapacityRps);
  const quorumLatency = values.networkRoundTripMs * Math.max(readQuorum, writeQuorum);
  if (hotUtilization >= 1) return 'hot-shard';
  if (repairBacklog > 0) return 'repair-pressure';
  if (quorumLatency >= 20 || readQuorum >= 3 || writeQuorum >= 3) return 'quorum-latency';
  return 'balanced';
}

function simulateDistributedKv(input = {}) {
  const values = normalizeModelInput(input, DISTRIBUTED_KV_SANDBOX_LIMITS, DISTRIBUTED_KV_SANDBOX_DEFAULTS);
  const readQuorum = Math.min(values.readQuorum, values.replicationFactor);
  const writeQuorum = Math.min(values.writeQuorum, values.replicationFactor);
  const readRps = values.requestRate * values.readRatio / 100;
  const writeRps = values.requestRate - readRps;
  const quorumReadWorkRps = readRps * readQuorum;
  const replicatedWriteWorkRps = writeRps * values.replicationFactor;
  const totalWorkRps = quorumReadWorkRps + replicatedWriteWorkRps;
  const averageShardWorkRps = totalWorkRps / values.shardCount;
  const hotShardWorkRps = totalWorkRps * values.hotKeyShare / 100 + averageShardWorkRps * (1 - values.hotKeyShare / 100);
  const hotShardCapacityRps = values.readCapacityPerShard * readQuorum + values.writeCapacityPerShard * values.replicationFactor;
  const hotShardUtilization = hotShardWorkRps / hotShardCapacityRps;
  const repairWorkRps = writeRps * Math.max(0, values.replicationFactor - 1);
  const repairBacklog = Math.max(0, repairWorkRps - values.repairCapacityRps) * 10;
  const repairUtilization = repairWorkRps / values.repairCapacityRps;
  const quorumLatencyMs = values.networkRoundTripMs * Math.max(readQuorum, writeQuorum);
  const estimatedP95LatencyMs = quorumLatencyMs + Math.max(0, hotShardUtilization - 0.7) ** 2 * 45;
  const hotRisk = sandboxPressureTone(hotShardUtilization);
  const repairRisk = sandboxPressureTone(repairUtilization, 0.9);
  const quorumRisk = sandboxPressureTone(quorumLatencyMs / 20, 0.75, 1);
  const status = sandboxStatus([hotRisk, repairRisk, quorumRisk]);
  let primaryRisk = 'none';
  if (hotRisk === 'stress' || hotRisk === 'watch') primaryRisk = 'hot-shard';
  else if (repairRisk === 'stress' || repairRisk === 'watch') primaryRisk = 'repair-pressure';
  else if (quorumRisk !== 'healthy') primaryRisk = 'quorum-latency';
  const teachingConclusion = {
    none: 'Requests are spread across shards and replica work stays below the modeled budgets.',
    'hot-shard': 'Partitioning increases aggregate capacity, but a concentrated key range can still exhaust one shard first.',
    'repair-pressure': 'Replication turns one write into work for several replicas. If repair capacity falls behind, inconsistency recovery accumulates.',
    'quorum-latency': 'A stronger quorum waits for more replica responses. It can improve consistency while increasing the critical-path latency.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Replicated key path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(readRps)} reads and ${sandboxFormatNumber(writeRps)} writes become ${sandboxFormatNumber(totalWorkRps)} replica operations/s across ${sandboxFormatNumber(values.shardCount, 0)} shards.`,
    stages: [
      sandboxFlowStage('requests', 'Key requests', sandboxFormatNumber(values.requestRate), 'req/s', `${sandboxFormatNumber(values.readRatio, 0)}% reads · ${sandboxFormatNumber(100 - values.readRatio, 0)}% writes`, 'neutral'),
      sandboxFlowStage('partition', 'Partition ring', sandboxFormatNumber(averageShardWorkRps), 'ops/s per shard', `${sandboxFormatNumber(values.hotKeyShare, 0)}% hot-key share`, hotRisk),
      sandboxFlowStage('quorum', 'Replica quorum', sandboxFormatNumber(totalWorkRps), 'replica ops/s', `${sandboxFormatNumber(readQuorum, 0)} read · ${sandboxFormatNumber(writeQuorum, 0)} write quorum`, quorumRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('reads', 'Quorum reads', sandboxFormatNumber(quorumReadWorkRps), 'replica ops/s', `${sandboxFormatNumber(readRps)} logical reads/s`, quorumRisk),
      sandboxFlowOutcome('writes', 'Replicated writes', sandboxFormatNumber(replicatedWriteWorkRps), 'replica ops/s', `${sandboxFormatNumber(writeRps)} writes/s × ${sandboxFormatNumber(values.replicationFactor, 0)} copies`, values.replicationFactor >= 4 ? 'watch' : 'healthy'),
      sandboxFlowOutcome('repair', 'Repair pressure', sandboxFormatNumber(repairBacklog, 0), 'ops queued', `${sandboxFormatNumber(repairWorkRps)} repair ops/s offered`, repairRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Key requests pass through a partition ring to replica quorums. The cluster performs ${sandboxFormatNumber(quorumReadWorkRps)} read replica operations and ${sandboxFormatNumber(replicatedWriteWorkRps)} replicated write operations per second, with ${sandboxFormatNumber(repairBacklog, 0)} repair operations queued.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    readRps: sandboxRounded(readRps),
    writeRps: sandboxRounded(writeRps),
    effectiveReadQuorum: readQuorum,
    effectiveWriteQuorum: writeQuorum,
    quorumReadWorkRps: sandboxRounded(quorumReadWorkRps),
    replicatedWriteWorkRps: sandboxRounded(replicatedWriteWorkRps),
    averageShardWorkRps: sandboxRounded(averageShardWorkRps),
    hotShardWorkRps: sandboxRounded(hotShardWorkRps),
    hotShardUtilizationPct: sandboxRounded(hotShardUtilization * 100),
    repairWorkRps: sandboxRounded(repairWorkRps),
    repairBacklog: sandboxRounded(repairBacklog),
    repairUtilizationPct: sandboxRounded(repairUtilization * 100),
    quorumLatencyMs: sandboxRounded(quorumLatencyMs),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(readRps)} reads/s use a ${sandboxFormatNumber(readQuorum, 0)}-replica read quorum; ${sandboxFormatNumber(writeRps)} writes/s replicate to ${sandboxFormatNumber(values.replicationFactor, 0)} copies.`,
      `Average shard work is ${sandboxFormatNumber(averageShardWorkRps)} replica operations/s, while the hottest shard sees ${sandboxFormatNumber(hotShardWorkRps)}.`,
      `Repair capacity is ${sandboxFormatNumber(values.repairCapacityRps)} operations/s against ${sandboxFormatNumber(repairWorkRps)} operations/s of repair work.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Reads consume one replica operation per read-quorum member.',
      'Writes are modeled against every replica, while repair work covers non-primary copies.',
      'The hot-key share is concentrated into one representative shard.',
      'Quorum latency is the slowest modeled round-trip count, not a consensus protocol benchmark.'
    ]
  };
}

/* Social feed model. */

const SOCIAL_FEED_SANDBOX_LIMITS = Object.freeze({
  postRate: { min: 1, max: 100000, step: 1 },
  feedReadRate: { min: 1, max: 1000000, step: 1 },
  averageFollowers: { min: 1, max: 1000000, step: 1 },
  celebrityPostShare: { min: 0, max: 100, step: 1 },
  fanoutThreshold: { min: 1, max: 1000000, step: 1 },
  timelineCacheHitRate: { min: 0, max: 100, step: 1 },
  fanoutCapacity: { min: 1, max: 10000000, step: 1 },
  feedReadCapacity: { min: 1, max: 10000000, step: 1 },
  celebrityMergeCapacity: { min: 1, max: 10000000, step: 1 }
});

const SOCIAL_FEED_SANDBOX_DEFAULTS = Object.freeze({
  postRate: 10,
  feedReadRate: 1000,
  averageFollowers: 100,
  celebrityPostShare: 5,
  fanoutThreshold: 10000,
  timelineCacheHitRate: 95,
  fanoutCapacity: 10000,
  feedReadCapacity: 50000,
  celebrityMergeCapacity: 10000
});

const SOCIAL_FEED_SANDBOX_CONTROLS = Object.freeze([
  { key: 'postRate', label: 'Posts', unit: '/s' },
  { key: 'feedReadRate', label: 'Timeline reads', unit: '/s' },
  { key: 'averageFollowers', label: 'Average followers', unit: 'followers' },
  { key: 'celebrityPostShare', label: 'Celebrity post share', unit: '%' },
  { key: 'fanoutThreshold', label: 'Fan-out threshold', unit: 'followers' },
  { key: 'timelineCacheHitRate', label: 'Timeline cache hit rate', unit: '%' },
  { key: 'fanoutCapacity', label: 'Fan-out capacity', unit: 'writes/s' },
  { key: 'feedReadCapacity', label: 'Feed-read capacity', unit: 'reads/s' },
  { key: 'celebrityMergeCapacity', label: 'Celebrity merge capacity', unit: 'merges/s', advanced: true }
]);

const SOCIAL_FEED_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'normal-fanout', label: 'Normal fan-out', level: 1,
    description: 'Most authors have modest follower counts and timelines are warm.',
    objective: 'See why precomputing regular posts can make reads cheap.',
    values: SOCIAL_FEED_SANDBOX_DEFAULTS
  },
  {
    id: 'celebrity-spike', label: 'Celebrity spike', level: 2,
    description: 'A large share of posts comes from authors too popular to fan out.',
    objective: 'Predict the read-time merge pressure created by celebrity accounts.',
    values: { ...SOCIAL_FEED_SANDBOX_DEFAULTS, feedReadRate: 4000, celebrityPostShare: 60, celebrityMergeCapacity: 1000 }
  },
  {
    id: 'read-surge', label: 'Read surge', level: 3,
    description: 'A breaking event multiplies timeline reads.',
    objective: 'Compare read capacity with the fan-out write path.',
    values: { ...SOCIAL_FEED_SANDBOX_DEFAULTS, feedReadRate: 60000, timelineCacheHitRate: 90, feedReadCapacity: 50000 }
  },
  {
    id: 'cold-timelines', label: 'Cold timelines', level: 4,
    description: 'A cache restart makes timeline reads miss more often.',
    objective: 'Connect cache misses to extra timeline assembly work.',
    values: { ...SOCIAL_FEED_SANDBOX_DEFAULTS, feedReadRate: 20000, timelineCacheHitRate: 35 }
  },
  {
    id: 'author-burst', label: 'Author burst', level: 5,
    description: 'A publishing event increases regular posts and follower fan-out.',
    objective: 'Spot write amplification before readers see the new posts.',
    values: { ...SOCIAL_FEED_SANDBOX_DEFAULTS, postRate: 500, averageFollowers: 200, fanoutCapacity: 10000 }
  }
]);

const SOCIAL_FEED_PREDICTION_OPTIONS = Object.freeze([
  { id: 'precomputed', label: 'Precomputed timelines absorb most reads' },
  { id: 'celebrity-merge', label: 'Celebrity posts need read-time merging' },
  { id: 'fanout-backlog', label: 'Fan-out writes become the bottleneck' },
  { id: 'read-saturation', label: 'Timeline reads saturate their capacity' }
]);

function socialFeedPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, SOCIAL_FEED_SANDBOX_LIMITS, SOCIAL_FEED_SANDBOX_DEFAULTS);
  const regularPostRate = values.postRate * (1 - values.celebrityPostShare / 100);
  const fanoutWrites = regularPostRate * Math.min(values.averageFollowers, values.fanoutThreshold);
  const fanoutUtilization = fanoutWrites / values.fanoutCapacity;
  const celebrityMergeRps = values.feedReadRate * values.celebrityPostShare / 100;
  const mergeUtilization = celebrityMergeRps / values.celebrityMergeCapacity;
  const readUtilization = values.feedReadRate / values.feedReadCapacity;
  if (fanoutUtilization >= 1) return 'fanout-backlog';
  if (mergeUtilization >= 1) return 'celebrity-merge';
  if (readUtilization >= 1) return 'read-saturation';
  return 'precomputed';
}

function simulateSocialFeed(input = {}) {
  const values = normalizeModelInput(input, SOCIAL_FEED_SANDBOX_LIMITS, SOCIAL_FEED_SANDBOX_DEFAULTS);
  const regularPostRate = values.postRate * (1 - values.celebrityPostShare / 100);
  const celebrityPostRate = values.postRate - regularPostRate;
  const fanoutFollowers = Math.min(values.averageFollowers, values.fanoutThreshold);
  const fanoutWritesRps = regularPostRate * fanoutFollowers;
  const celebrityMergeRps = values.feedReadRate * values.celebrityPostShare / 100;
  const timelineCacheHitsRps = values.feedReadRate * values.timelineCacheHitRate / 100;
  const timelineAssemblyRps = values.feedReadRate - timelineCacheHitsRps;
  const fanoutUtilization = fanoutWritesRps / values.fanoutCapacity;
  const readUtilization = values.feedReadRate / values.feedReadCapacity;
  const mergeUtilization = celebrityMergeRps / values.celebrityMergeCapacity;
  const fanoutBacklog = Math.max(0, fanoutWritesRps - values.fanoutCapacity) * 10;
  const estimatedP95LatencyMs = 12 + Math.max(0, readUtilization - 0.7) ** 2 * 35 + Math.max(0, mergeUtilization - 0.7) ** 2 * 25;
  const fanoutRisk = sandboxPressureTone(fanoutUtilization);
  const readRisk = sandboxPressureTone(readUtilization);
  const mergeRisk = sandboxPressureTone(mergeUtilization);
  const cacheRisk = values.timelineCacheHitRate < 50 ? 'watch' : 'healthy';
  const status = sandboxStatus([fanoutRisk, readRisk, mergeRisk, cacheRisk]);
  let primaryRisk = 'none';
  if (fanoutRisk === 'stress' || fanoutRisk === 'watch') primaryRisk = 'fanout-backlog';
  else if (mergeRisk === 'stress' || mergeRisk === 'watch') primaryRisk = 'celebrity-merge';
  else if (readRisk === 'stress' || readRisk === 'watch') primaryRisk = 'read-capacity';
  else if (cacheRisk === 'watch') primaryRisk = 'cold-timelines';
  const teachingConclusion = {
    none: 'Regular posts are precomputed into timelines, while the warm cache keeps reads below the modeled path capacities.',
    'fanout-backlog': 'Fan-out on write is fast for ordinary authors until follower count or post rate makes write amplification exceed capacity.',
    'celebrity-merge': 'Celebrity posts bypass broad fan-out and are merged at read time, trading write amplification for read-path work.',
    'read-capacity': 'A feed can have healthy post fan-out and still fail when a read surge exhausts timeline assembly capacity.',
    'cold-timelines': 'A cold timeline cache sends more requests through assembly and storage, making the read path less forgiving.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Timeline path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.postRate)} posts/s produce ${sandboxFormatNumber(fanoutWritesRps)} fan-out writes/s while ${sandboxFormatNumber(values.feedReadRate)} timeline reads/s arrive.`,
    stages: [
      sandboxFlowStage('activity', 'Posts and reads', sandboxFormatNumber(values.postRate + values.feedReadRate), 'events/s', `${sandboxFormatNumber(values.celebrityPostShare, 0)}% celebrity posts`, 'neutral'),
      sandboxFlowStage('strategy', 'Fan-out strategy', sandboxFormatNumber(fanoutWritesRps), 'timeline writes/s', `${sandboxFormatNumber(celebrityMergeRps)} celebrity merges/s`, fanoutRisk === 'healthy' && mergeRisk === 'healthy' ? 'healthy' : status),
      sandboxFlowStage('timeline', 'Timeline read', sandboxFormatNumber(values.feedReadRate), 'reads/s', `${sandboxFormatNumber(timelineCacheHitsRps)} cache hits/s`, readRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('precomputed', 'Precomputed hits', sandboxFormatNumber(timelineCacheHitsRps), 'reads/s', 'Warm timelines avoid assembly work.', values.timelineCacheHitRate >= 75 ? 'healthy' : 'watch'),
      sandboxFlowOutcome('celebrity', 'Celebrity merge', sandboxFormatNumber(celebrityMergeRps), 'merges/s', `${sandboxFormatNumber(celebrityPostRate)} celebrity posts/s use pull-on-read`, mergeRisk),
      sandboxFlowOutcome('backlog', 'Fan-out backlog', sandboxFormatNumber(fanoutBacklog, 0), 'timeline writes queued', `${sandboxFormatNumber(fanoutWritesRps)} writes/s offered`, fanoutRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Posts and reads pass through a fan-out strategy to timeline reads. ${sandboxFormatNumber(timelineCacheHitsRps)} reads are cache hits, ${sandboxFormatNumber(celebrityMergeRps)} reads require celebrity merging, and ${sandboxFormatNumber(fanoutBacklog, 0)} fan-out writes are queued.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    regularPostRate: sandboxRounded(regularPostRate),
    celebrityPostRate: sandboxRounded(celebrityPostRate),
    fanoutFollowers,
    fanoutWritesRps: sandboxRounded(fanoutWritesRps),
    celebrityMergeRps: sandboxRounded(celebrityMergeRps),
    timelineCacheHitsRps: sandboxRounded(timelineCacheHitsRps),
    timelineAssemblyRps: sandboxRounded(timelineAssemblyRps),
    fanoutUtilizationPct: sandboxRounded(fanoutUtilization * 100),
    readUtilizationPct: sandboxRounded(readUtilization * 100),
    mergeUtilizationPct: sandboxRounded(mergeUtilization * 100),
    fanoutBacklog: sandboxRounded(fanoutBacklog),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(regularPostRate)} regular posts/s create ${sandboxFormatNumber(fanoutWritesRps)} timeline writes/s.`,
      `${sandboxFormatNumber(timelineCacheHitsRps)} of ${sandboxFormatNumber(values.feedReadRate)} timeline reads/s hit the cache.`,
      `${sandboxFormatNumber(celebrityMergeRps)} reads/s carry the celebrity merge path instead of broad fan-out.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Regular posts fan out to the smaller of average followers and the configured threshold.',
      'Celebrity posts are pulled and merged at read time.',
      'Timeline cache hits skip modeled assembly work.',
      'Fan-out, read, and merge capacities are independent learner-supplied budgets.'
    ]
  };
}

/* Realtime messaging model. */

const REALTIME_MESSAGING_SANDBOX_LIMITS = Object.freeze({
  activeConnections: { min: 1, max: 10000000, step: 1 },
  messageRate: { min: 1, max: 1000000, step: 1 },
  recipientsPerMessage: { min: 1, max: 10000, step: 1 },
  onlinePct: { min: 0, max: 100, step: 1 },
  connectionCapacity: { min: 1, max: 10000000, step: 1 },
  deliveryCapacity: { min: 1, max: 10000000, step: 1 },
  offlineQueueCapacity: { min: 10, max: 10000000, step: 10 },
  reconnectRate: { min: 0, max: 100, step: 1 },
  messageStoreCapacity: { min: 1, max: 10000000, step: 1 },
  messageSizeKb: { min: 0.1, max: 1024, step: 0.1 }
});

const REALTIME_MESSAGING_SANDBOX_DEFAULTS = Object.freeze({
  activeConnections: 10000,
  messageRate: 1000,
  recipientsPerMessage: 2,
  onlinePct: 95,
  connectionCapacity: 100000,
  deliveryCapacity: 100000,
  offlineQueueCapacity: 100000,
  reconnectRate: 2,
  messageStoreCapacity: 100000,
  messageSizeKb: 1
});

const REALTIME_MESSAGING_SANDBOX_CONTROLS = Object.freeze([
  { key: 'activeConnections', label: 'Active connections', unit: 'connections' },
  { key: 'messageRate', label: 'Messages', unit: '/s' },
  { key: 'recipientsPerMessage', label: 'Recipients / message', unit: 'recipients' },
  { key: 'onlinePct', label: 'Recipients online', unit: '%' },
  { key: 'connectionCapacity', label: 'Connection capacity', unit: 'connections' },
  { key: 'deliveryCapacity', label: 'Delivery capacity', unit: 'deliveries/s' },
  { key: 'offlineQueueCapacity', label: 'Offline queue capacity', unit: 'messages' },
  { key: 'reconnectRate', label: 'Reconnect rate', unit: '%/s' },
  { key: 'messageStoreCapacity', label: 'History-write capacity', unit: 'writes/s', advanced: true },
  { key: 'messageSizeKb', label: 'Message size', unit: 'KB', advanced: true }
]);

const REALTIME_MESSAGING_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-connections', label: 'Steady connections', level: 1,
    description: 'A stable chat population sends small messages to mostly online recipients.',
    objective: 'Separate connection count from message delivery work.',
    values: REALTIME_MESSAGING_SANDBOX_DEFAULTS
  },
  {
    id: 'connection-surge', label: 'Connection surge', level: 2,
    description: 'A launch or reconnect event pushes active connections past capacity.',
    objective: 'Predict the connection-layer bottleneck before delivery is considered.',
    values: { ...REALTIME_MESSAGING_SANDBOX_DEFAULTS, activeConnections: 200000, reconnectRate: 20, connectionCapacity: 100000 }
  },
  {
    id: 'group-chat', label: 'Group chat', level: 3,
    description: 'Each message fans out to a large group of recipients.',
    objective: 'Connect recipient fan-out to delivery capacity.',
    values: { ...REALTIME_MESSAGING_SANDBOX_DEFAULTS, messageRate: 2000, recipientsPerMessage: 100, deliveryCapacity: 100000 }
  },
  {
    id: 'offline-recipients', label: 'Offline recipients', level: 4,
    description: 'Half the audience is offline and messages accumulate for later delivery.',
    objective: 'Balance durable offline queues against bounded memory.',
    values: { ...REALTIME_MESSAGING_SANDBOX_DEFAULTS, messageRate: 5000, onlinePct: 50, offlineQueueCapacity: 100000 }
  },
  {
    id: 'reconnect-storm', label: 'Reconnect storm', level: 5,
    description: 'A network flap makes many clients reconnect while chat traffic continues.',
    objective: 'Spot handshake pressure and history-write pressure together.',
    values: { ...REALTIME_MESSAGING_SANDBOX_DEFAULTS, activeConnections: 500000, messageRate: 10000, reconnectRate: 50, connectionCapacity: 600000, messageStoreCapacity: 5000 }
  }
]);

const REALTIME_MESSAGING_PREDICTION_OPTIONS = Object.freeze([
  { id: 'live', label: 'Most messages deliver live' },
  { id: 'offline-queue', label: 'Offline queues absorb recipients' },
  { id: 'connection-pressure', label: 'Connections or reconnects saturate the edge' },
  { id: 'delivery-saturation', label: 'Recipient delivery capacity saturates' }
]);

function realtimeMessagingPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, REALTIME_MESSAGING_SANDBOX_LIMITS, REALTIME_MESSAGING_SANDBOX_DEFAULTS);
  const deliveryRps = values.messageRate * values.recipientsPerMessage * values.onlinePct / 100;
  const deliveryUtilization = deliveryRps / values.deliveryCapacity;
  const connectionUtilization = values.activeConnections / values.connectionCapacity;
  const offlineDeliveries = values.messageRate * values.recipientsPerMessage * (1 - values.onlinePct / 100);
  const offlineBacklog = Math.max(0, offlineDeliveries * 10 - values.offlineQueueCapacity);
  if (connectionUtilization >= 1 || values.activeConnections * values.reconnectRate / 100 > values.connectionCapacity * 0.1) return 'connection-pressure';
  if (deliveryUtilization >= 1) return 'delivery-saturation';
  if (offlineBacklog > 0) return 'offline-queue';
  return 'live';
}

function simulateRealtimeMessaging(input = {}) {
  const values = normalizeModelInput(input, REALTIME_MESSAGING_SANDBOX_LIMITS, REALTIME_MESSAGING_SANDBOX_DEFAULTS);
  const deliveryAttemptsRps = values.messageRate * values.recipientsPerMessage;
  const onlineDeliveryRps = deliveryAttemptsRps * values.onlinePct / 100;
  const offlineDeliveryRps = deliveryAttemptsRps - onlineDeliveryRps;
  const reconnectsRps = values.activeConnections * values.reconnectRate / 100;
  const connectionUtilization = values.activeConnections / values.connectionCapacity;
  const deliveryUtilization = onlineDeliveryRps / values.deliveryCapacity;
  const historyWriteUtilization = values.messageRate / values.messageStoreCapacity;
  const offlineQueueDemand = offlineDeliveryRps * 10;
  const offlineBacklog = Math.min(values.offlineQueueCapacity, offlineQueueDemand);
  const droppedOfflineRps = Math.max(0, offlineQueueDemand - values.offlineQueueCapacity) / 10;
  const connectionRisk = sandboxPressureTone(connectionUtilization);
  const deliveryRisk = sandboxPressureTone(deliveryUtilization);
  const historyRisk = sandboxPressureTone(historyWriteUtilization);
  const reconnectRisk = sandboxPressureTone(reconnectsRps / Math.max(1, values.connectionCapacity * 0.1));
  const offlineRisk = droppedOfflineRps > 0
    ? 'stress'
    : offlineBacklog > values.offlineQueueCapacity * 0.5 ? 'watch' : 'healthy';
  const status = sandboxStatus([connectionRisk, deliveryRisk, historyRisk, reconnectRisk, offlineRisk]);
  let primaryRisk = 'none';
  if (connectionRisk === 'stress' || reconnectRisk === 'stress' || connectionRisk === 'watch') primaryRisk = 'connections';
  else if (deliveryRisk === 'stress' || deliveryRisk === 'watch') primaryRisk = 'delivery-capacity';
  else if (offlineRisk !== 'healthy') primaryRisk = 'offline-queue';
  else if (historyRisk === 'stress' || historyRisk === 'watch') primaryRisk = 'history-writes';
  const estimatedP95LatencyMs = 5 + Math.max(0, deliveryUtilization - 0.7) ** 2 * 30 + Math.max(0, connectionUtilization - 0.7) ** 2 * 20;
  const teachingConclusion = {
    none: 'The connection edge, live delivery path, and message history stay within their modeled budgets.',
    connections: 'Realtime systems pay for persistent connections and reconnects before a message is delivered. Edge capacity can be the first limit.',
    'delivery-capacity': 'One message may become many delivery attempts. Group size multiplies the live-delivery path.',
    'offline-queue': 'Offline delivery needs durable bounded storage. A queue protects live traffic but eventually needs a retention or backpressure policy.',
    'history-writes': 'Even when recipients are online, every message can create a history write. The append path needs its own capacity budget.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Message delivery path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.messageRate)} messages/s expand to ${sandboxFormatNumber(deliveryAttemptsRps)} recipient deliveries/s.`,
    stages: [
      sandboxFlowStage('senders', 'Sender messages', sandboxFormatNumber(values.messageRate), 'messages/s', `${sandboxFormatNumber(values.activeConnections, 0)} active connections`, 'neutral'),
      sandboxFlowStage('router', 'Connection router', sandboxFormatNumber(onlineDeliveryRps), 'live deliveries/s', `${sandboxFormatNumber(reconnectsRps)} reconnects/s`, connectionRisk),
      sandboxFlowStage('recipients', 'Recipient delivery/history', sandboxFormatNumber(onlineDeliveryRps + offlineDeliveryRps), 'attempts/s', `${sandboxFormatNumber(values.onlinePct, 0)}% recipients online`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('live', 'Live deliveries', sandboxFormatNumber(onlineDeliveryRps), 'deliveries/s', 'Online recipients receive the message over a persistent connection.', deliveryRisk),
      sandboxFlowOutcome('offline', 'Offline queue', sandboxFormatNumber(offlineBacklog, 0), 'messages held', `${sandboxFormatNumber(offlineDeliveryRps)} offline deliveries/s offered`, offlineRisk),
      sandboxFlowOutcome('history', 'Message history writes', sandboxFormatNumber(values.messageRate), 'writes/s', `${sandboxFormatNumber(values.messageSizeKb)} KB/message`, historyRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Sender messages pass through a connection router to recipient delivery and history. ${sandboxFormatNumber(onlineDeliveryRps)} live deliveries and ${sandboxFormatNumber(offlineDeliveryRps)} offline deliveries are attempted per second, with ${sandboxFormatNumber(offlineBacklog, 0)} messages held offline.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    deliveryAttemptsRps: sandboxRounded(deliveryAttemptsRps),
    onlineDeliveryRps: sandboxRounded(onlineDeliveryRps),
    offlineDeliveryRps: sandboxRounded(offlineDeliveryRps),
    reconnectsRps: sandboxRounded(reconnectsRps),
    connectionUtilizationPct: sandboxRounded(connectionUtilization * 100),
    deliveryUtilizationPct: sandboxRounded(deliveryUtilization * 100),
    historyWriteUtilizationPct: sandboxRounded(historyWriteUtilization * 100),
    offlineBacklog: sandboxRounded(offlineBacklog),
    droppedOfflineRps: sandboxRounded(droppedOfflineRps),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(deliveryAttemptsRps)} recipient deliveries/s expand from ${sandboxFormatNumber(values.messageRate)} messages/s.`,
      `${sandboxFormatNumber(onlineDeliveryRps)} deliveries/s are live and ${sandboxFormatNumber(offlineDeliveryRps)} deliveries/s target offline recipients.`,
      `${sandboxFormatNumber(reconnectsRps)} clients/s reconnect while history receives ${sandboxFormatNumber(values.messageRate)} writes/s.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Each message is delivered independently to its configured recipient count.',
      'Offline queue demand is shown over a fixed 10-second teaching window.',
      'Persistent connection capacity and reconnect capacity are represented by simple ratios.',
      'Every message creates one history write regardless of recipient status.'
    ]
  };
}

/* Video upload/transcode/CDN model. */

const VIDEO_PIPELINE_SANDBOX_LIMITS = Object.freeze({
  uploadRateVideosPerMin: { min: 1, max: 100000, step: 1 },
  averageDurationMin: { min: 0.1, max: 600, step: 0.1 },
  renditions: { min: 1, max: 12, step: 1 },
  transcodeCapacityVideoMinPerSec: { min: 0.1, max: 100000, step: 0.1 },
  playbackRate: { min: 1, max: 1000000, step: 1 },
  averageBitrateMbps: { min: 0.1, max: 100, step: 0.1 },
  cdnHitRate: { min: 0, max: 100, step: 1 },
  originEgressCapacityMbps: { min: 1, max: 1000000, step: 1 },
  processingQueueCapacity: { min: 1, max: 10000000, step: 1 }
});

const VIDEO_PIPELINE_SANDBOX_DEFAULTS = Object.freeze({
  uploadRateVideosPerMin: 10,
  averageDurationMin: 10,
  renditions: 4,
  transcodeCapacityVideoMinPerSec: 20,
  playbackRate: 1000,
  averageBitrateMbps: 4,
  cdnHitRate: 95,
  originEgressCapacityMbps: 10000,
  processingQueueCapacity: 10000
});

const VIDEO_PIPELINE_SANDBOX_CONTROLS = Object.freeze([
  { key: 'uploadRateVideosPerMin', label: 'Video uploads', unit: 'videos/min' },
  { key: 'averageDurationMin', label: 'Average duration', unit: 'min' },
  { key: 'renditions', label: 'Renditions / video', unit: 'variants' },
  { key: 'transcodeCapacityVideoMinPerSec', label: 'Transcode capacity', unit: 'video-min/s' },
  { key: 'playbackRate', label: 'Playback streams', unit: 'streams/s' },
  { key: 'averageBitrateMbps', label: 'Average bitrate', unit: 'Mbps' },
  { key: 'cdnHitRate', label: 'CDN hit rate', unit: '%' },
  { key: 'originEgressCapacityMbps', label: 'Origin egress capacity', unit: 'Mbps' },
  { key: 'processingQueueCapacity', label: 'Processing queue', unit: 'video-min', advanced: true }
]);

const VIDEO_PIPELINE_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-video', label: 'Steady video', level: 1,
    description: 'Uploads are steady and the CDN serves most playback bytes.',
    objective: 'Separate asynchronous encoding work from playback egress.',
    values: VIDEO_PIPELINE_SANDBOX_DEFAULTS
  },
  {
    id: 'upload-burst', label: 'Upload burst', level: 2,
    description: 'A live event causes many long videos to arrive together.',
    objective: 'Predict processing backlog before viewers arrive.',
    values: { ...VIDEO_PIPELINE_SANDBOX_DEFAULTS, uploadRateVideosPerMin: 100, averageDurationMin: 30, transcodeCapacityVideoMinPerSec: 20 }
  },
  {
    id: 'playback-surge', label: 'Playback surge', level: 3,
    description: 'A popular video drives a large number of concurrent streams.',
    objective: 'Compare CDN absorption with origin egress.',
    values: { ...VIDEO_PIPELINE_SANDBOX_DEFAULTS, playbackRate: 100000, cdnHitRate: 90, originEgressCapacityMbps: 10000 }
  },
  {
    id: 'cold-cdn', label: 'Cold CDN', level: 4,
    description: 'A cache miss wave sends playback bytes back to origin.',
    objective: 'Connect CDN hit rate to origin bandwidth.',
    values: { ...VIDEO_PIPELINE_SANDBOX_DEFAULTS, playbackRate: 10000, cdnHitRate: 40, originEgressCapacityMbps: 10000 }
  },
  {
    id: 'many-renditions', label: 'Many renditions', level: 5,
    description: 'Adaptive playback requires many encoded variants per upload.',
    objective: 'Spot the multiplicative cost of duration and rendition count.',
    values: { ...VIDEO_PIPELINE_SANDBOX_DEFAULTS, uploadRateVideosPerMin: 30, averageDurationMin: 20, renditions: 10, processingQueueCapacity: 5000 }
  }
]);

const VIDEO_PIPELINE_PREDICTION_OPTIONS = Object.freeze([
  { id: 'encoded-on-time', label: 'Uploads encode without a growing queue' },
  { id: 'processing-backlog', label: 'Transcode work builds a processing backlog' },
  { id: 'origin-saturation', label: 'Cold playback saturates origin egress' },
  { id: 'cdn-absorbs', label: 'The CDN absorbs most playback traffic' }
]);

function videoPipelinePredictionBucket(input = {}) {
  const values = normalizeModelInput(input, VIDEO_PIPELINE_SANDBOX_LIMITS, VIDEO_PIPELINE_SANDBOX_DEFAULTS);
  const transcodeWork = values.uploadRateVideosPerMin * values.averageDurationMin * values.renditions / 60;
  const processingUtilization = transcodeWork / values.transcodeCapacityVideoMinPerSec;
  const originEgress = values.playbackRate * values.averageBitrateMbps * (1 - values.cdnHitRate / 100);
  const originUtilization = originEgress / values.originEgressCapacityMbps;
  if (processingUtilization >= 1) return 'processing-backlog';
  if (originUtilization >= 1) return 'origin-saturation';
  if (values.cdnHitRate >= 75) return 'cdn-absorbs';
  return 'encoded-on-time';
}

function simulateVideoPipeline(input = {}) {
  const values = normalizeModelInput(input, VIDEO_PIPELINE_SANDBOX_LIMITS, VIDEO_PIPELINE_SANDBOX_DEFAULTS);
  const transcodeWorkVideoMinPerSec = values.uploadRateVideosPerMin * values.averageDurationMin * values.renditions / 60;
  const processingUtilization = transcodeWorkVideoMinPerSec / values.transcodeCapacityVideoMinPerSec;
  const processingBacklogVideoMin = Math.min(values.processingQueueCapacity, Math.max(0, transcodeWorkVideoMinPerSec - values.transcodeCapacityVideoMinPerSec) * 60);
  const cdnPlaybackMbps = values.playbackRate * values.averageBitrateMbps;
  const originEgressMbps = cdnPlaybackMbps * (1 - values.cdnHitRate / 100);
  const originUtilization = originEgressMbps / values.originEgressCapacityMbps;
  const processingRisk = sandboxPressureTone(processingUtilization);
  const originRisk = sandboxPressureTone(originUtilization);
  const cdnRisk = values.cdnHitRate < 50 ? 'watch' : 'healthy';
  const status = sandboxStatus([processingRisk, originRisk, cdnRisk]);
  let primaryRisk = 'none';
  if (processingRisk === 'stress' || processingRisk === 'watch') primaryRisk = 'processing-backlog';
  else if (originRisk === 'stress' || originRisk === 'watch') primaryRisk = 'origin-egress';
  else if (cdnRisk === 'watch') primaryRisk = 'cold-cdn';
  const startupLatencyMs = 100 + Math.max(0, originUtilization - 0.7) ** 2 * 100 + Math.max(0, processingUtilization - 0.7) ** 2 * 80;
  const teachingConclusion = {
    none: 'The transcode queue keeps up and the CDN absorbs most playback bytes, so origin egress remains inside its modeled budget.',
    'processing-backlog': 'Encoding work multiplies video duration by rendition count. A queue protects upload requests but grows when transcoders cannot keep up.',
    'origin-egress': 'CDN misses expose the origin to playback bandwidth. A high stream rate can saturate origin even when encoding is healthy.',
    'cold-cdn': 'A cold CDN shifts bandwidth to origin. Cache warming and edge capacity change the read path without changing upload work.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Video delivery path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(transcodeWorkVideoMinPerSec)} video-minutes/s enter encoding while playback requests need ${sandboxFormatNumber(cdnPlaybackMbps)} Mbps across CDN and origin.`,
    stages: [
      sandboxFlowStage('uploads', 'Uploads', sandboxFormatNumber(values.uploadRateVideosPerMin), 'videos/min', `${sandboxFormatNumber(values.averageDurationMin)} min × ${sandboxFormatNumber(values.renditions, 0)} variants`, 'neutral'),
      sandboxFlowStage('transcode', 'Transcode queue', sandboxFormatNumber(transcodeWorkVideoMinPerSec), 'video-min/s', `${sandboxFormatNumber(processingBacklogVideoMin, 0)} video-min queued`, processingRisk),
      sandboxFlowStage('playback', 'CDN playback', sandboxFormatNumber(cdnPlaybackMbps), 'Mbps', `${sandboxFormatNumber(originEgressMbps)} Mbps reaches origin`, originRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('encoded', 'Encoded variants', sandboxFormatNumber(transcodeWorkVideoMinPerSec), 'video-min/s', `${sandboxFormatNumber(values.renditions, 0)} renditions per upload`, processingRisk),
      sandboxFlowOutcome('backlog', 'Processing backlog', sandboxFormatNumber(processingBacklogVideoMin, 0), 'video-min held', 'Uploads wait when encoding work outruns capacity.', processingRisk),
      sandboxFlowOutcome('origin', 'CDN hits / origin reads', `${sandboxFormatNumber(values.cdnHitRate, 0)} / ${sandboxFormatNumber(100 - values.cdnHitRate, 0)}`, '%', `${sandboxFormatNumber(originEgressMbps)} Mbps origin egress`, originRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Video uploads pass through a transcode queue to CDN playback. Encoding receives ${sandboxFormatNumber(transcodeWorkVideoMinPerSec)} video minutes per second, playback uses ${sandboxFormatNumber(cdnPlaybackMbps)} megabits per second, and origin serves ${sandboxFormatNumber(originEgressMbps)} megabits per second after CDN hits.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    transcodeWorkVideoMinPerSec: sandboxRounded(transcodeWorkVideoMinPerSec),
    processingUtilizationPct: sandboxRounded(processingUtilization * 100),
    processingBacklogVideoMin: sandboxRounded(processingBacklogVideoMin),
    cdnPlaybackMbps: sandboxRounded(cdnPlaybackMbps),
    originEgressMbps: sandboxRounded(originEgressMbps),
    originUtilizationPct: sandboxRounded(originUtilization * 100),
    startupLatencyMs: sandboxRounded(startupLatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(values.uploadRateVideosPerMin)} uploads/min create ${sandboxFormatNumber(transcodeWorkVideoMinPerSec)} video-minutes/s of encoding work.`,
      `${sandboxFormatNumber(cdnPlaybackMbps)} Mbps of playback is reduced to ${sandboxFormatNumber(originEgressMbps)} Mbps by a ${sandboxFormatNumber(values.cdnHitRate, 0)}% CDN hit rate.`,
      `The origin uses ${sandboxFormatNumber(originUtilization * 100)}% of its assumed ${sandboxFormatNumber(values.originEgressCapacityMbps)} Mbps egress budget.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Transcode work is duration multiplied by rendition count and converted from videos/minute to video-minutes/second.',
      'CDN hits serve playback bytes without consuming origin egress.',
      'Processing backlog is shown over a fixed 60-second teaching window.',
      'Bitrate and capacity values are simplified learning assumptions.'
    ]
  };
}

/* Object storage and sync model. */

const OBJECT_STORAGE_SANDBOX_LIMITS = Object.freeze({
  uploadRate: { min: 1, max: 100000, step: 1 },
  downloadRate: { min: 1, max: 100000, step: 1 },
  averageFileSizeMb: { min: 0.1, max: 100000, step: 0.1 },
  changedDataPct: { min: 0, max: 100, step: 1 },
  chunkDedupHitRate: { min: 0, max: 100, step: 1 },
  storageWriteCapacityMbPerSec: { min: 1, max: 1000000, step: 1 },
  egressCapacityMbPerSec: { min: 1, max: 1000000, step: 1 },
  metadataCapacityOpsSec: { min: 1, max: 1000000, step: 1 },
  conflictRate: { min: 0, max: 100, step: 1 }
});

const OBJECT_STORAGE_SANDBOX_DEFAULTS = Object.freeze({
  uploadRate: 60,
  downloadRate: 120,
  averageFileSizeMb: 10,
  changedDataPct: 20,
  chunkDedupHitRate: 50,
  storageWriteCapacityMbPerSec: 1000,
  egressCapacityMbPerSec: 3000,
  metadataCapacityOpsSec: 10000,
  conflictRate: 2
});

const OBJECT_STORAGE_SANDBOX_CONTROLS = Object.freeze([
  { key: 'uploadRate', label: 'Uploads', unit: 'files/min' },
  { key: 'downloadRate', label: 'Downloads', unit: 'files/min' },
  { key: 'averageFileSizeMb', label: 'Average file size', unit: 'MB' },
  { key: 'changedDataPct', label: 'Changed data / file', unit: '%' },
  { key: 'chunkDedupHitRate', label: 'Chunk dedup hit rate', unit: '%' },
  { key: 'storageWriteCapacityMbPerSec', label: 'Storage write capacity', unit: 'MB/s' },
  { key: 'egressCapacityMbPerSec', label: 'Egress capacity', unit: 'MB/s' },
  { key: 'metadataCapacityOpsSec', label: 'Metadata capacity', unit: 'ops/s' },
  { key: 'conflictRate', label: 'Concurrent-edit conflict rate', unit: '%', advanced: true }
]);

const OBJECT_STORAGE_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'small-sync', label: 'Small sync', level: 1,
    description: 'Clients sync modest changed chunks with plenty of metadata capacity.',
    objective: 'Separate logical files from changed bytes and metadata operations.',
    values: OBJECT_STORAGE_SANDBOX_DEFAULTS
  },
  {
    id: 'large-upload', label: 'Large upload', level: 2,
    description: 'Large files arrive faster than the object store can durably write them.',
    objective: 'Predict write bandwidth pressure from file size and changed percentage.',
    values: { ...OBJECT_STORAGE_SANDBOX_DEFAULTS, uploadRate: 1800, averageFileSizeMb: 100, changedDataPct: 80, storageWriteCapacityMbPerSec: 1000 }
  },
  {
    id: 'download-surge', label: 'Download surge', level: 3,
    description: 'A shared folder becomes a read and egress hotspot.',
    objective: 'Connect download rate to egress bandwidth rather than storage writes.',
    values: { ...OBJECT_STORAGE_SANDBOX_DEFAULTS, downloadRate: 4000, averageFileSizeMb: 50, egressCapacityMbPerSec: 3000 }
  },
  {
    id: 'dedupe-heavy', label: 'Dedupe-heavy sync', level: 4,
    description: 'Many clients upload repeated chunks that the store already has.',
    objective: 'See how deduplication reduces physical writes without removing metadata work.',
    values: { ...OBJECT_STORAGE_SANDBOX_DEFAULTS, uploadRate: 1000, averageFileSizeMb: 20, changedDataPct: 60, chunkDedupHitRate: 90 }
  },
  {
    id: 'concurrent-edits', label: 'Concurrent edits', level: 5,
    description: 'Several clients modify the same files at the same time.',
    objective: 'Recognize conflict resolution as a correctness cost in sync systems.',
    values: { ...OBJECT_STORAGE_SANDBOX_DEFAULTS, uploadRate: 1000, conflictRate: 25, metadataCapacityOpsSec: 5000 }
  }
]);

const OBJECT_STORAGE_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced-sync', label: 'Sync stays inside storage and egress budgets' },
  { id: 'write-pressure', label: 'Changed chunks saturate storage writes' },
  { id: 'egress-pressure', label: 'Downloads saturate egress bandwidth' },
  { id: 'dedupe-saves', label: 'Deduplication absorbs most physical writes' },
  { id: 'sync-conflicts', label: 'Concurrent edits create conflict work' }
]);

function objectStoragePredictionBucket(input = {}) {
  const values = normalizeModelInput(input, OBJECT_STORAGE_SANDBOX_LIMITS, OBJECT_STORAGE_SANDBOX_DEFAULTS);
  const changedMbPerSec = values.uploadRate * values.averageFileSizeMb * values.changedDataPct / 100 / 60;
  const storedWriteMbPerSec = changedMbPerSec * (1 - values.chunkDedupHitRate / 100);
  const egressMbPerSec = values.downloadRate * values.averageFileSizeMb / 60;
  const metadataOpsPerSec = values.uploadRate + values.downloadRate;
  if (storedWriteMbPerSec / values.storageWriteCapacityMbPerSec >= 1) return 'write-pressure';
  if (egressMbPerSec / values.egressCapacityMbPerSec >= 1) return 'egress-pressure';
  if (values.conflictRate >= 20) return 'sync-conflicts';
  if (values.chunkDedupHitRate >= 75) return 'dedupe-saves';
  if (metadataOpsPerSec / values.metadataCapacityOpsSec >= 1) return 'write-pressure';
  return 'balanced-sync';
}

function simulateObjectStorage(input = {}) {
  const values = normalizeModelInput(input, OBJECT_STORAGE_SANDBOX_LIMITS, OBJECT_STORAGE_SANDBOX_DEFAULTS);
  const changedMbPerSec = values.uploadRate * values.averageFileSizeMb * values.changedDataPct / 100 / 60;
  const dedupedMbPerSec = changedMbPerSec * values.chunkDedupHitRate / 100;
  const storedWriteMbPerSec = changedMbPerSec - dedupedMbPerSec;
  const egressMbPerSec = values.downloadRate * values.averageFileSizeMb / 60;
  const metadataOpsPerSec = values.uploadRate + values.downloadRate;
  const storageUtilization = storedWriteMbPerSec / values.storageWriteCapacityMbPerSec;
  const egressUtilization = egressMbPerSec / values.egressCapacityMbPerSec;
  const metadataUtilization = metadataOpsPerSec / values.metadataCapacityOpsSec;
  const conflictsPerMin = values.uploadRate * values.conflictRate / 100;
  const syncLagSec = Math.max(0, storedWriteMbPerSec / values.storageWriteCapacityMbPerSec - 0.7) * 60;
  const storageRisk = sandboxPressureTone(storageUtilization);
  const egressRisk = sandboxPressureTone(egressUtilization);
  const metadataRisk = sandboxPressureTone(metadataUtilization);
  const conflictRisk = values.conflictRate >= 20 ? 'stress' : values.conflictRate >= 10 ? 'watch' : 'healthy';
  const status = sandboxStatus([storageRisk, egressRisk, metadataRisk, conflictRisk]);
  let primaryRisk = 'none';
  if (storageRisk === 'stress' || storageRisk === 'watch') primaryRisk = 'storage-writes';
  else if (egressRisk === 'stress' || egressRisk === 'watch') primaryRisk = 'egress';
  else if (metadataRisk === 'stress' || metadataRisk === 'watch') primaryRisk = 'metadata';
  else if (conflictRisk !== 'healthy') primaryRisk = 'sync-conflicts';
  const teachingConclusion = {
    none: 'Changed chunks fit within the modeled write budget, downloads fit within egress, and metadata operations remain manageable.',
    'storage-writes': 'Sync bandwidth is driven by changed bytes after deduplication. Large files or low dedupe can fill the durable write path.',
    egress: 'Downloads consume network egress even when the object store is not writing. CDN or regional placement can protect the origin path.',
    metadata: 'Chunked storage reduces large writes, but every upload and download still needs metadata coordination.',
    'sync-conflicts': 'Concurrent editing is a correctness path: capacity alone does not resolve conflicting versions without a merge or user decision.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Object sync path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(changedMbPerSec)} MB/s of changed data becomes ${sandboxFormatNumber(storedWriteMbPerSec)} MB/s of physical writes after deduplication.`,
    stages: [
      sandboxFlowStage('chunks', 'Client chunks', sandboxFormatNumber(changedMbPerSec), 'changed MB/s', `${sandboxFormatNumber(values.uploadRate)} uploads/min`, 'neutral'),
      sandboxFlowStage('store', 'Object store', sandboxFormatNumber(storedWriteMbPerSec), 'physical MB/s', `${sandboxFormatNumber(dedupedMbPerSec)} MB/s deduplicated`, storageRisk),
      sandboxFlowStage('delivery', 'CDN / metadata', sandboxFormatNumber(egressMbPerSec), 'egress MB/s', `${sandboxFormatNumber(metadataOpsPerSec)} metadata ops/s`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('changed', 'Changed chunks', sandboxFormatNumber(changedMbPerSec), 'MB/s', `${sandboxFormatNumber(values.changedDataPct, 0)}% of uploaded files changes`, 'neutral'),
      sandboxFlowOutcome('deduped', 'Deduplicated bytes', sandboxFormatNumber(dedupedMbPerSec), 'MB/s saved', `${sandboxFormatNumber(values.chunkDedupHitRate, 0)}% chunk hit rate`, values.chunkDedupHitRate >= 75 ? 'healthy' : 'watch'),
      sandboxFlowOutcome('egress', 'Egress reads', sandboxFormatNumber(egressMbPerSec), 'MB/s', `${sandboxFormatNumber(conflictsPerMin)} conflicts/min also need resolution`, egressRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Client chunks pass through an object store to delivery and metadata paths. ${sandboxFormatNumber(changedMbPerSec)} megabytes per second change, ${sandboxFormatNumber(dedupedMbPerSec)} megabytes per second are deduplicated, and downloads require ${sandboxFormatNumber(egressMbPerSec)} megabytes per second of egress.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    changedMbPerSec: sandboxRounded(changedMbPerSec),
    dedupedMbPerSec: sandboxRounded(dedupedMbPerSec),
    storedWriteMbPerSec: sandboxRounded(storedWriteMbPerSec),
    egressMbPerSec: sandboxRounded(egressMbPerSec),
    metadataOpsPerSec: sandboxRounded(metadataOpsPerSec),
    storageUtilizationPct: sandboxRounded(storageUtilization * 100),
    egressUtilizationPct: sandboxRounded(egressUtilization * 100),
    metadataUtilizationPct: sandboxRounded(metadataUtilization * 100),
    conflictsPerMin: sandboxRounded(conflictsPerMin),
    syncLagSec: sandboxRounded(syncLagSec),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(changedMbPerSec)} MB/s of changed data becomes ${sandboxFormatNumber(storedWriteMbPerSec)} MB/s of physical storage writes.`,
      `${sandboxFormatNumber(egressMbPerSec)} MB/s of downloads uses ${sandboxFormatNumber(egressUtilization * 100)}% of egress capacity.`,
      `${sandboxFormatNumber(metadataOpsPerSec)} metadata operations/s coordinate uploads and downloads; ${sandboxFormatNumber(conflictsPerMin)} conflicts/min are modeled.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Only changed data is uploaded, then the dedupe hit rate removes repeated physical chunks.',
      'File sizes are converted from files/minute to MB/second for bandwidth comparisons.',
      'Every upload and download performs one metadata operation in this teaching model.',
      'Conflicts are a rate signal and do not prescribe a merge algorithm.'
    ]
  };
}

/* Search autocomplete model. */

const SEARCH_AUTOCOMPLETE_SANDBOX_LIMITS = Object.freeze({
  queryRate: { min: 1, max: 1000000, step: 1 },
  averagePrefixLength: { min: 1, max: 50, step: 1 },
  corpusTerms: { min: 1000, max: 100000000, step: 1000 },
  updateRate: { min: 1, max: 1000000, step: 1 },
  queryCapacity: { min: 1, max: 10000000, step: 1 },
  indexBuildCapacity: { min: 1, max: 10000000, step: 1 },
  trieMemoryMb: { min: 1, max: 10000000, step: 1 },
  memoryLimitMb: { min: 16, max: 10000000, step: 1 },
  cacheHitRate: { min: 0, max: 100, step: 1 },
  hotPrefixShare: { min: 0, max: 100, step: 1 },
  lookupLatencyMs: { min: 0.1, max: 100, step: 0.1 }
});

const SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS = Object.freeze({
  queryRate: 10000,
  averagePrefixLength: 5,
  corpusTerms: 1000000,
  updateRate: 100,
  queryCapacity: 100000,
  indexBuildCapacity: 1000,
  trieMemoryMb: 512,
  memoryLimitMb: 1024,
  cacheHitRate: 80,
  hotPrefixShare: 5,
  lookupLatencyMs: 2
});

const SEARCH_AUTOCOMPLETE_SANDBOX_CONTROLS = Object.freeze([
  { key: 'queryRate', label: 'Autocomplete queries', unit: 'queries/s' },
  { key: 'averagePrefixLength', label: 'Average prefix length', unit: 'characters' },
  { key: 'corpusTerms', label: 'Indexed terms', unit: 'terms' },
  { key: 'updateRate', label: 'Term updates', unit: 'terms/s' },
  { key: 'queryCapacity', label: 'Query capacity', unit: 'queries/s' },
  { key: 'indexBuildCapacity', label: 'Index-build capacity', unit: 'terms/s' },
  { key: 'trieMemoryMb', label: 'Index memory', unit: 'MB' },
  { key: 'memoryLimitMb', label: 'Memory limit', unit: 'MB' },
  { key: 'cacheHitRate', label: 'Prefix cache hit rate', unit: '%' },
  { key: 'hotPrefixShare', label: 'Hottest-prefix share', unit: '%', advanced: true },
  { key: 'lookupLatencyMs', label: 'Trie lookup latency', unit: 'ms', advanced: true }
]);

const SEARCH_AUTOCOMPLETE_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-typeahead', label: 'Steady typeahead', level: 1,
    description: 'Prefix queries are mostly served by a warm cache and a fitting index.',
    objective: 'Connect cache hits to trie lookups and memory use.',
    values: SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS
  },
  {
    id: 'keystroke-surge', label: 'Keystroke surge', level: 2,
    description: 'A traffic event multiplies autocomplete queries.',
    objective: 'Predict query capacity pressure before rebuilding the index.',
    values: { ...SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS, queryRate: 100000, cacheHitRate: 70, queryCapacity: 100000 }
  },
  {
    id: 'corpus-growth', label: 'Corpus growth', level: 3,
    description: 'The indexed term corpus grows beyond the original memory budget.',
    objective: 'Spot memory pressure from an expanding prefix index.',
    values: { ...SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS, corpusTerms: 10000000, trieMemoryMb: 2048, memoryLimitMb: 1024 }
  },
  {
    id: 'index-rebuild', label: 'Index rebuild', level: 4,
    description: 'Updates arrive faster than a rebuilt suggestion index can consume them.',
    objective: 'Understand rebuild lag and stale suggestions as an asynchronous path.',
    values: { ...SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS, updateRate: 5000, indexBuildCapacity: 1000 }
  },
  {
    id: 'hot-prefix', label: 'Hot prefix', level: 5,
    description: 'A small set of prefixes dominates interactive traffic.',
    objective: 'Compare aggregate query capacity with concentrated prefix load.',
    values: { ...SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS, queryRate: 100000, hotPrefixShare: 80, queryCapacity: 200000 }
  }
]);

const SEARCH_AUTOCOMPLETE_PREDICTION_OPTIONS = Object.freeze([
  { id: 'cache-absorbs', label: 'The prefix cache absorbs most queries' },
  { id: 'trie-pressure', label: 'Trie lookups become the hot path' },
  { id: 'index-rebuild-lag', label: 'Index rebuild lag makes suggestions stale' },
  { id: 'memory-pressure', label: 'The prefix index exceeds its memory budget' },
  { id: 'hot-prefix', label: 'A hot prefix concentrates query pressure' }
]);

function searchAutocompletePredictionBucket(input = {}) {
  const values = normalizeModelInput(input, SEARCH_AUTOCOMPLETE_SANDBOX_LIMITS, SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS);
  const queryUtilization = values.queryRate / values.queryCapacity;
  const bytesPerTerm = 32 + values.averagePrefixLength * 2;
  const estimatedIndexMemoryMb = values.corpusTerms * bytesPerTerm / (1024 * 1024);
  const memoryUsedMb = Math.max(values.trieMemoryMb, estimatedIndexMemoryMb);
  const memoryPressure = memoryUsedMb / values.memoryLimitMb;
  const rebuildUtilization = values.updateRate / values.indexBuildCapacity;
  const hotPrefixUtilization = values.queryRate * values.hotPrefixShare / 100 / Math.max(1, values.queryCapacity * 0.1);
  if (memoryPressure >= 1) return 'memory-pressure';
  if (hotPrefixUtilization >= 1) return 'hot-prefix';
  if (rebuildUtilization >= 1) return 'index-rebuild-lag';
  if (queryUtilization >= 1 || values.cacheHitRate < 50) return 'trie-pressure';
  return 'cache-absorbs';
}

function simulateSearchAutocomplete(input = {}) {
  const values = normalizeModelInput(input, SEARCH_AUTOCOMPLETE_SANDBOX_LIMITS, SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS);
  const cacheHitsRps = values.queryRate * values.cacheHitRate / 100;
  const trieLookupRps = values.queryRate - cacheHitsRps;
  const bytesPerTerm = 32 + values.averagePrefixLength * 2;
  const estimatedIndexMemoryMb = values.corpusTerms * bytesPerTerm / (1024 * 1024);
  const indexMemoryMb = Math.max(values.trieMemoryMb, estimatedIndexMemoryMb);
  const memoryPressure = indexMemoryMb / values.memoryLimitMb;
  const queryUtilization = values.queryRate / values.queryCapacity;
  const rebuildUtilization = values.updateRate / values.indexBuildCapacity;
  const hotPrefixRps = values.queryRate * values.hotPrefixShare / 100;
  const hotPrefixBudgetRps = Math.max(1, values.queryCapacity * 0.1);
  const hotPrefixUtilization = hotPrefixRps / hotPrefixBudgetRps;
  const rebuildLagSec = Math.max(0, values.updateRate - values.indexBuildCapacity) * 60 / values.indexBuildCapacity;
  const queryRisk = sandboxPressureTone(queryUtilization);
  const memoryRisk = sandboxPressureTone(memoryPressure);
  const rebuildRisk = sandboxPressureTone(rebuildUtilization);
  const hotRisk = sandboxPressureTone(hotPrefixUtilization);
  const cacheRisk = values.cacheHitRate < 50 ? 'watch' : 'healthy';
  const status = sandboxStatus([queryRisk, memoryRisk, rebuildRisk, hotRisk, cacheRisk]);
  let primaryRisk = 'none';
  if (memoryRisk === 'stress' || memoryRisk === 'watch') primaryRisk = 'memory';
  else if (hotRisk === 'stress' || hotRisk === 'watch') primaryRisk = 'hot-prefix';
  else if (rebuildRisk === 'stress' || rebuildRisk === 'watch') primaryRisk = 'index-rebuild';
  else if (queryRisk === 'stress' || queryRisk === 'watch' || cacheRisk === 'watch') primaryRisk = 'query-capacity';
  const estimatedP95LatencyMs = values.lookupLatencyMs + Math.max(0, queryUtilization - 0.7) ** 2 * 35 + Math.max(0, memoryPressure - 0.85) * 10;
  const teachingConclusion = {
    none: 'A warm prefix cache absorbs most keystrokes and the index fits its memory and query budgets.',
    memory: 'Prefix indexes trade lookup speed for memory. Corpus growth can exceed the memory budget even when query traffic is steady.',
    'hot-prefix': 'Aggregate query capacity hides hot prefixes. Sharding or caching popular prefixes prevents one branch from dominating.',
    'index-rebuild': 'Autocomplete freshness is asynchronous. When updates outrun rebuild capacity, the index serves older suggestions.',
    'query-capacity': 'Each keystroke is a query. A cold cache or query surge can saturate lookup capacity before storage becomes relevant.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Suggestion path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.queryRate)} queries/s split into ${sandboxFormatNumber(cacheHitsRps)} cache hits and ${sandboxFormatNumber(trieLookupRps)} trie lookups.`,
    stages: [
      sandboxFlowStage('keystrokes', 'Keystrokes', sandboxFormatNumber(values.queryRate), 'queries/s', `${sandboxFormatNumber(values.averagePrefixLength, 0)} characters average prefix`, 'neutral'),
      sandboxFlowStage('index', 'Prefix index', sandboxFormatNumber(trieLookupRps), 'lookups/s', `${sandboxFormatNumber(indexMemoryMb)} MB modeled index`, memoryRisk),
      sandboxFlowStage('suggestions', 'Ranked suggestions', sandboxFormatNumber(cacheHitsRps + trieLookupRps), 'responses/s', `${sandboxFormatNumber(rebuildLagSec)} s rebuild lag`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('cache', 'Cache hits', sandboxFormatNumber(cacheHitsRps), 'queries/s', 'Popular prefixes return without a trie walk.', values.cacheHitRate >= 75 ? 'healthy' : 'watch'),
      sandboxFlowOutcome('lookup', 'Trie lookups', sandboxFormatNumber(trieLookupRps), 'queries/s', `${sandboxFormatNumber(values.hotPrefixShare, 0)}% of queries use the hottest prefix`, hotRisk),
      sandboxFlowOutcome('rebuild', 'Index rebuild lag', sandboxFormatNumber(rebuildLagSec), 'seconds', `${sandboxFormatNumber(values.updateRate)} updates/s offered`, rebuildRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Keystrokes pass through a prefix index to ranked suggestions. ${sandboxFormatNumber(cacheHitsRps)} queries per second hit the cache, ${sandboxFormatNumber(trieLookupRps)} walk the index, and modeled rebuild lag is ${sandboxFormatNumber(rebuildLagSec)} seconds.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    cacheHitsRps: sandboxRounded(cacheHitsRps),
    trieLookupRps: sandboxRounded(trieLookupRps),
    estimatedIndexMemoryMb: sandboxRounded(estimatedIndexMemoryMb),
    indexMemoryMb: sandboxRounded(indexMemoryMb),
    memoryPressurePct: sandboxRounded(memoryPressure * 100),
    queryUtilizationPct: sandboxRounded(queryUtilization * 100),
    rebuildUtilizationPct: sandboxRounded(rebuildUtilization * 100),
    hotPrefixRps: sandboxRounded(hotPrefixRps),
    hotPrefixUtilizationPct: sandboxRounded(hotPrefixUtilization * 100),
    rebuildLagSec: sandboxRounded(rebuildLagSec),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(cacheHitsRps)} queries/s hit the prefix cache and ${sandboxFormatNumber(trieLookupRps)} queries/s reach the index.`,
      `The modeled index uses ${sandboxFormatNumber(indexMemoryMb)} MB of a ${sandboxFormatNumber(values.memoryLimitMb)} MB memory budget.`,
      `${sandboxFormatNumber(values.updateRate)} term updates/s meet ${sandboxFormatNumber(values.indexBuildCapacity)} terms/s of build capacity, creating ${sandboxFormatNumber(rebuildLagSec)} seconds of lag.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'A cache hit avoids a prefix-index lookup.',
      'Index memory is the larger of the supplied baseline and a simple bytes-per-term estimate.',
      'Rebuild lag uses a fixed 60-second teaching horizon when updates exceed build capacity.',
      'Hot-prefix pressure compares one representative prefix with 10% of aggregate query capacity.'
    ]
  };
}

/* Geospatial dispatch model. */

const GEOSPATIAL_DISPATCH_SANDBOX_LIMITS = Object.freeze({
  activeDrivers: { min: 1, max: 10000000, step: 1 },
  locationUpdatesPerSecond: { min: 1, max: 1000000, step: 1 },
  rideRequestsPerSecond: { min: 1, max: 1000000, step: 1 },
  cellCount: { min: 1, max: 1000000, step: 1 },
  hotAreaShare: { min: 0, max: 100, step: 1 },
  indexUpdateCapacity: { min: 1, max: 10000000, step: 1 },
  matchCapacityPerSecond: { min: 1, max: 1000000, step: 1 },
  locationFreshnessSec: { min: 0.1, max: 600, step: 0.1 },
  matchingTimeMs: { min: 0.1, max: 1000, step: 0.1 },
  searchRadiusKm: { min: 0.1, max: 100, step: 0.1 }
});

const GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS = Object.freeze({
  activeDrivers: 100000,
  locationUpdatesPerSecond: 20000,
  rideRequestsPerSecond: 1000,
  cellCount: 10000,
  hotAreaShare: 10,
  indexUpdateCapacity: 100000,
  matchCapacityPerSecond: 5000,
  locationFreshnessSec: 5,
  matchingTimeMs: 10,
  searchRadiusKm: 5
});

const GEOSPATIAL_DISPATCH_SANDBOX_CONTROLS = Object.freeze([
  { key: 'activeDrivers', label: 'Active drivers', unit: 'drivers' },
  { key: 'locationUpdatesPerSecond', label: 'Location updates', unit: 'updates/s' },
  { key: 'rideRequestsPerSecond', label: 'Ride requests', unit: 'rides/s' },
  { key: 'cellCount', label: 'Spatial cells', unit: 'cells' },
  { key: 'hotAreaShare', label: 'Hottest-area share', unit: '%' },
  { key: 'indexUpdateCapacity', label: 'Geo-index capacity', unit: 'updates/s' },
  { key: 'matchCapacityPerSecond', label: 'Match capacity', unit: 'matches/s' },
  { key: 'locationFreshnessSec', label: 'Freshness target', unit: 's' },
  { key: 'matchingTimeMs', label: 'Match lookup time', unit: 'ms', advanced: true },
  { key: 'searchRadiusKm', label: 'Search radius', unit: 'km', advanced: true }
]);

const GEOSPATIAL_DISPATCH_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'city-steady', label: 'City steady state', level: 1,
    description: 'Driver locations and ride requests spread across a city.',
    objective: 'See the relationship between location freshness and matching work.',
    values: GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS
  },
  {
    id: 'event-hot-area', label: 'Event hot area', level: 2,
    description: 'A stadium or venue concentrates drivers and ride requests.',
    objective: 'Predict hot-cell pressure even when city-wide capacity looks safe.',
    values: { ...GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS, locationUpdatesPerSecond: 50000, rideRequestsPerSecond: 5000, hotAreaShare: 70, indexUpdateCapacity: 40000 }
  },
  {
    id: 'location-update-burst', label: 'Location-update burst', level: 3,
    description: 'Drivers report position frequently during a routing event.',
    objective: 'Compare location-index write volume with update capacity.',
    values: { ...GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS, locationUpdatesPerSecond: 300000, indexUpdateCapacity: 100000 }
  },
  {
    id: 'ride-surge', label: 'Ride surge', level: 4,
    description: 'Requests arrive faster than nearby-driver matches can complete.',
    objective: 'Spot unmatched demand on the read/match path.',
    values: { ...GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS, rideRequestsPerSecond: 10000, matchCapacityPerSecond: 5000 }
  },
  {
    id: 'stale-locations', label: 'Stale locations', level: 5,
    description: 'Drivers report infrequently while riders expect fresh matches.',
    objective: 'Connect update cadence to the quality of nearby candidates.',
    values: { ...GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS, activeDrivers: 200000, locationUpdatesPerSecond: 10000, locationFreshnessSec: 2 }
  }
]);

const GEOSPATIAL_DISPATCH_PREDICTION_OPTIONS = Object.freeze([
  { id: 'indexed', label: 'Locations stay indexed and matches keep up' },
  { id: 'hot-cell', label: 'A hot area overloads its spatial cell' },
  { id: 'unmatched', label: 'Ride requests remain unmatched' },
  { id: 'stale', label: 'Nearby candidates become stale' }
]);

function geospatialDispatchPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, GEOSPATIAL_DISPATCH_SANDBOX_LIMITS, GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS);
  const hotAreaUpdates = values.locationUpdatesPerSecond * values.hotAreaShare / 100
    + values.locationUpdatesPerSecond * (1 - values.hotAreaShare / 100) / values.cellCount;
  const hotAreaBudget = values.indexUpdateCapacity * Math.max(0.1, values.hotAreaShare / 100);
  const hotUtilization = hotAreaUpdates / hotAreaBudget;
  const unmatched = Math.max(0, values.rideRequestsPerSecond - values.matchCapacityPerSecond);
  const updatesNeeded = values.activeDrivers / values.locationFreshnessSec;
  if (hotUtilization >= 1) return 'hot-cell';
  if (unmatched > 0) return 'unmatched';
  if (values.locationUpdatesPerSecond < updatesNeeded) return 'stale';
  return 'indexed';
}

function simulateGeospatialDispatch(input = {}) {
  const values = normalizeModelInput(input, GEOSPATIAL_DISPATCH_SANDBOX_LIMITS, GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS);
  const hotAreaUpdatesPerSecond = values.locationUpdatesPerSecond * values.hotAreaShare / 100
    + values.locationUpdatesPerSecond * (1 - values.hotAreaShare / 100) / values.cellCount;
  const hotAreaBudgetPerSecond = values.indexUpdateCapacity * Math.max(0.1, values.hotAreaShare / 100);
  const indexUtilization = values.locationUpdatesPerSecond / values.indexUpdateCapacity;
  const hotAreaUtilization = hotAreaUpdatesPerSecond / hotAreaBudgetPerSecond;
  const matchUtilization = values.rideRequestsPerSecond / values.matchCapacityPerSecond;
  const unmatchedRps = Math.max(0, values.rideRequestsPerSecond - values.matchCapacityPerSecond);
  const updateRateNeeded = values.activeDrivers / values.locationFreshnessSec;
  const staleLocationPct = sandboxClampPercent(Math.max(0, 1 - values.locationUpdatesPerSecond / updateRateNeeded) * 100);
  const matchingP95Ms = values.matchingTimeMs + Math.max(0, matchUtilization - 0.7) ** 2 * 50 + Math.max(0, hotAreaUtilization - 0.7) ** 2 * 40;
  const indexRisk = sandboxPressureTone(indexUtilization);
  const hotRisk = sandboxPressureTone(hotAreaUtilization);
  const matchRisk = sandboxPressureTone(matchUtilization);
  const staleRisk = staleLocationPct >= 50 ? 'stress' : staleLocationPct > 0 ? 'watch' : 'healthy';
  const status = sandboxStatus([indexRisk, hotRisk, matchRisk, staleRisk]);
  let primaryRisk = 'none';
  if (hotRisk === 'stress' || hotRisk === 'watch') primaryRisk = 'hot-cell';
  else if (matchRisk === 'stress' || matchRisk === 'watch') primaryRisk = 'matching-capacity';
  else if (staleRisk !== 'healthy') primaryRisk = 'stale-locations';
  else if (indexRisk === 'stress' || indexRisk === 'watch') primaryRisk = 'index-updates';
  const teachingConclusion = {
    none: 'Location updates stay fresh enough, the spatial index keeps up, and match capacity covers the modeled ride demand.',
    'hot-cell': 'A spatial index can scale across cells while one event area overloads its local budget. Hot-area isolation and adaptive cells address skew.',
    'matching-capacity': 'Nearby-driver lookup is a read path with its own budget. When ride demand outruns matching capacity, requests remain unmatched even with fresh locations.',
    'stale-locations': 'Freshness is a rate requirement: the fleet must report often enough for the service to maintain current candidates.',
    'index-updates': 'Location updates are writes to the spatial index. Sampling or coalescing updates protects the match path when reports burst.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Dispatch path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.locationUpdatesPerSecond)} location updates/s meet ${sandboxFormatNumber(values.rideRequestsPerSecond)} ride requests/s across the spatial index.`,
    stages: [
      sandboxFlowStage('locations', 'Driver locations and rides', sandboxFormatNumber(values.locationUpdatesPerSecond + values.rideRequestsPerSecond), 'events/s', `${sandboxFormatNumber(values.activeDrivers, 0)} active drivers`, 'neutral'),
      sandboxFlowStage('geo-index', 'Geo index', sandboxFormatNumber(values.locationUpdatesPerSecond), 'updates/s', `${sandboxFormatNumber(hotAreaUpdatesPerSecond)} hot-area updates/s`, hotRisk),
      sandboxFlowStage('dispatch', 'Matching / dispatch', sandboxFormatNumber(values.rideRequestsPerSecond), 'rides/s', `${sandboxFormatNumber(unmatchedRps)} unmatched/s`, matchRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('indexed', 'Indexed updates', sandboxFormatNumber(values.locationUpdatesPerSecond), 'updates/s', `${sandboxFormatNumber(staleLocationPct)}% modeled stale locations`, staleRisk),
      sandboxFlowOutcome('candidates', 'Nearby candidates', sandboxFormatNumber(values.rideRequestsPerSecond - unmatchedRps), 'matches/s', `${sandboxFormatNumber(values.searchRadiusKm)} km search radius`, matchRisk),
      sandboxFlowOutcome('unmatched', 'Unmatched rides', sandboxFormatNumber(unmatchedRps), 'rides/s', `${sandboxFormatNumber(values.rideRequestsPerSecond)} requests/s offered`, unmatchedRps > 0 ? matchRisk : 'healthy')
    ],
    callout: teachingConclusion,
    ariaLabel: `Driver locations and ride requests pass through a geographic index to matching and dispatch. The index receives ${sandboxFormatNumber(values.locationUpdatesPerSecond)} updates per second, ${sandboxFormatNumber(values.rideRequestsPerSecond - unmatchedRps)} rides are matched per second, and ${sandboxFormatNumber(unmatchedRps)} remain unmatched.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    hotAreaUpdatesPerSecond: sandboxRounded(hotAreaUpdatesPerSecond),
    hotAreaUtilizationPct: sandboxRounded(hotAreaUtilization * 100),
    indexUtilizationPct: sandboxRounded(indexUtilization * 100),
    matchUtilizationPct: sandboxRounded(matchUtilization * 100),
    updateRateNeeded: sandboxRounded(updateRateNeeded),
    staleLocationPct: sandboxRounded(staleLocationPct),
    unmatchedRps: sandboxRounded(unmatchedRps),
    matchingP95Ms: sandboxRounded(matchingP95Ms),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(values.locationUpdatesPerSecond)} location updates/s feed a hot-area slice of ${sandboxFormatNumber(hotAreaUpdatesPerSecond)} updates/s.`,
      `${sandboxFormatNumber(values.rideRequestsPerSecond - unmatchedRps)} rides/s match within ${sandboxFormatNumber(values.matchCapacityPerSecond)} matches/s of capacity.`,
      `The fleet needs ${sandboxFormatNumber(updateRateNeeded)} updates/s to refresh ${sandboxFormatNumber(values.activeDrivers, 0)} drivers every ${sandboxFormatNumber(values.locationFreshnessSec)} seconds.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'The hottest area receives its share plus a small representative slice of the remaining cells.',
      'A match is available when the request is inside matching capacity; driver supply quality is summarized by freshness.',
      'Staleness is the fraction of the target update rate that is missing.',
      'Spatial radius and capacities are educational inputs, not map-provider guarantees.'
    ]
  };
}

/* Notification fanout model. */

const NOTIFICATION_FANOUT_SANDBOX_LIMITS = Object.freeze({
  eventRate: { min: 1, max: 100000, step: 1 },
  recipientsPerEvent: { min: 1, max: 1000000, step: 1 },
  optInRate: { min: 0, max: 100, step: 1 },
  channelCount: { min: 1, max: 10, step: 1 },
  providerCapacityPerChannel: { min: 1, max: 1000000, step: 1 },
  providerFailureRate: { min: 0, max: 100, step: 1 },
  retryRate: { min: 0, max: 100, step: 1 },
  queueCapacity: { min: 10, max: 10000000, step: 10 },
  preferenceLookupCapacity: { min: 1, max: 1000000, step: 1 }
});

const NOTIFICATION_FANOUT_SANDBOX_DEFAULTS = Object.freeze({
  eventRate: 100,
  recipientsPerEvent: 100,
  optInRate: 80,
  channelCount: 3,
  providerCapacityPerChannel: 10000,
  providerFailureRate: 1,
  retryRate: 100,
  queueCapacity: 100000,
  preferenceLookupCapacity: 100000
});

const NOTIFICATION_FANOUT_SANDBOX_CONTROLS = Object.freeze([
  { key: 'eventRate', label: 'Product events', unit: 'events/s' },
  { key: 'recipientsPerEvent', label: 'Recipients / event', unit: 'recipients' },
  { key: 'optInRate', label: 'Opt-in rate', unit: '%' },
  { key: 'channelCount', label: 'Delivery channels', unit: 'channels' },
  { key: 'providerCapacityPerChannel', label: 'Provider capacity / channel', unit: 'deliveries/s' },
  { key: 'providerFailureRate', label: 'Provider failure rate', unit: '%' },
  { key: 'retryRate', label: 'Failed deliveries retried', unit: '%' },
  { key: 'queueCapacity', label: 'Channel queue capacity', unit: 'deliveries' },
  { key: 'preferenceLookupCapacity', label: 'Preference capacity', unit: 'lookups/s', advanced: true }
]);

const NOTIFICATION_FANOUT_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-notifications', label: 'Steady notifications', level: 1,
    description: 'Product events fan out to opted-in recipients across reliable providers.',
    objective: 'See how one event becomes channel delivery work.',
    values: NOTIFICATION_FANOUT_SANDBOX_DEFAULTS
  },
  {
    id: 'audience-surge', label: 'Audience surge', level: 2,
    description: 'A product event reaches a much larger audience than usual.',
    objective: 'Predict provider capacity pressure from recipient fan-out.',
    values: { ...NOTIFICATION_FANOUT_SANDBOX_DEFAULTS, eventRate: 500, recipientsPerEvent: 1000, providerCapacityPerChannel: 10000, preferenceLookupCapacity: 1000000 }
  },
  {
    id: 'flaky-provider', label: 'Flaky provider', level: 3,
    description: 'A channel provider fails enough deliveries to trigger retries.',
    objective: 'Recognize retry loops as new load rather than free recovery.',
    values: { ...NOTIFICATION_FANOUT_SANDBOX_DEFAULTS, providerFailureRate: 30, retryRate: 100, queueCapacity: 100000 }
  },
  {
    id: 'bounded-notification-queue', label: 'Bounded queue', level: 4,
    description: 'A small queue protects memory while provider capacity falls behind.',
    objective: 'Balance retention against explicit drop or backpressure behavior.',
    values: { ...NOTIFICATION_FANOUT_SANDBOX_DEFAULTS, eventRate: 1000, recipientsPerEvent: 500, providerFailureRate: 20, queueCapacity: 10000, preferenceLookupCapacity: 1000000 }
  },
  {
    id: 'preference-overload', label: 'Preference overload', level: 5,
    description: 'Every event needs a preference lookup before it can fan out.',
    objective: 'Spot the coordination path that precedes provider delivery.',
    values: { ...NOTIFICATION_FANOUT_SANDBOX_DEFAULTS, eventRate: 2000, recipientsPerEvent: 200, preferenceLookupCapacity: 10000 }
  }
]);

const NOTIFICATION_FANOUT_PREDICTION_OPTIONS = Object.freeze([
  { id: 'delivered', label: 'Providers deliver most notifications' },
  { id: 'provider-pressure', label: 'Provider capacity becomes the bottleneck' },
  { id: 'retry-loop', label: 'Failures create a retry loop' },
  { id: 'queue-pressure', label: 'Channel queues fill or drop work' },
  { id: 'preference-pressure', label: 'Preference lookups limit fan-out' }
]);

function notificationFanoutPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, NOTIFICATION_FANOUT_SANDBOX_LIMITS, NOTIFICATION_FANOUT_SANDBOX_DEFAULTS);
  const eligible = values.eventRate * values.recipientsPerEvent * values.optInRate / 100;
  const deliveries = eligible * values.channelCount;
  const retries = deliveries * values.providerFailureRate / 100 * values.retryRate / 100;
  const providerUtilization = (deliveries + retries) / (values.channelCount * values.providerCapacityPerChannel);
  const preferenceUtilization = values.eventRate * values.recipientsPerEvent / values.preferenceLookupCapacity;
  const backlog = Math.max(0, deliveries + retries - values.channelCount * values.providerCapacityPerChannel) * 10;
  if (preferenceUtilization >= 1) return 'preference-pressure';
  if (backlog > values.queueCapacity) return 'queue-pressure';
  if (providerUtilization >= 1) return 'provider-pressure';
  if (retries > deliveries * 0.1) return 'retry-loop';
  return 'delivered';
}

function simulateNotificationFanout(input = {}) {
  const values = normalizeModelInput(input, NOTIFICATION_FANOUT_SANDBOX_LIMITS, NOTIFICATION_FANOUT_SANDBOX_DEFAULTS);
  const eligibleDeliveriesRps = values.eventRate * values.recipientsPerEvent * values.optInRate / 100;
  const channelDeliveriesRps = eligibleDeliveriesRps * values.channelCount;
  const retryRps = channelDeliveriesRps * values.providerFailureRate / 100 * values.retryRate / 100;
  const offeredProviderRps = channelDeliveriesRps + retryRps;
  const providerCapacityRps = values.channelCount * values.providerCapacityPerChannel;
  const providerUtilization = offeredProviderRps / providerCapacityRps;
  const preferenceLookupsRps = values.eventRate * values.recipientsPerEvent;
  const preferenceUtilization = preferenceLookupsRps / values.preferenceLookupCapacity;
  const queueDemand = Math.max(0, offeredProviderRps - providerCapacityRps) * 10;
  const queuedDeliveries = Math.min(values.queueCapacity, queueDemand);
  const droppedRps = Math.max(0, queueDemand - values.queueCapacity) / 10;
  const providerRisk = sandboxPressureTone(providerUtilization, 0.85, 1);
  const preferenceRisk = sandboxPressureTone(preferenceUtilization);
  const retryRisk = retryRps > channelDeliveriesRps * 0.1 ? 'watch' : 'healthy';
  const queueRisk = droppedRps > 0 ? 'stress' : queuedDeliveries > 0 ? 'watch' : 'healthy';
  const status = sandboxStatus([providerRisk, preferenceRisk, retryRisk, queueRisk]);
  let primaryRisk = 'none';
  if (preferenceRisk === 'stress' || preferenceRisk === 'watch') primaryRisk = 'preferences';
  else if (queueRisk !== 'healthy') primaryRisk = 'queue';
  else if (providerRisk === 'stress' || providerRisk === 'watch') primaryRisk = 'provider-capacity';
  else if (retryRisk !== 'healthy') primaryRisk = 'retry-loop';
  const estimatedP95LatencyMs = 50 + Math.max(0, providerUtilization - 0.7) ** 2 * 100 + Math.max(0, preferenceUtilization - 0.7) ** 2 * 50;
  const teachingConclusion = {
    none: 'Opted-in recipients fan out across channels and providers without filling the modeled queues.',
    preferences: 'Notification fan-out starts with preferences. If that lookup path is slow or saturated, providers never receive the work.',
    queue: 'Queues absorb short provider gaps, but a bounded queue eventually forces drops or backpressure when offered work stays above capacity.',
    'provider-capacity': 'One product event becomes a delivery per recipient per channel. Provider limits must be modeled per channel, not only per event.',
    'retry-loop': 'Retries are additional provider work. A flaky channel can amplify the original event rate and consume queue capacity.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Notification delivery path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.eventRate)} product events/s expand to ${sandboxFormatNumber(channelDeliveriesRps)} channel deliveries/s before retries.`,
    stages: [
      sandboxFlowStage('events', 'Product event', sandboxFormatNumber(values.eventRate), 'events/s', `${sandboxFormatNumber(values.recipientsPerEvent, 0)} recipients/event · ${sandboxFormatNumber(values.optInRate, 0)}% opt in`, 'neutral'),
      sandboxFlowStage('queues', 'Channel queues', sandboxFormatNumber(offeredProviderRps), 'deliveries/s', `${sandboxFormatNumber(retryRps)} retries/s`, queueRisk),
      sandboxFlowStage('providers', 'Providers', sandboxFormatNumber(providerCapacityRps), 'capacity/s', `${sandboxFormatNumber(queuedDeliveries, 0)} deliveries queued`, providerRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('delivered', 'Delivered', sandboxFormatNumber(Math.min(offeredProviderRps, providerCapacityRps)), 'deliveries/s', `${sandboxFormatNumber(channelDeliveriesRps)} initial + ${sandboxFormatNumber(retryRps)} retries offered`, providerRisk),
      sandboxFlowOutcome('retry', 'Retry loop', sandboxFormatNumber(retryRps), 'deliveries/s', `${sandboxFormatNumber(values.providerFailureRate, 0)}% provider failure rate`, retryRisk),
      sandboxFlowOutcome('queued', 'Queued / dropped', `${sandboxFormatNumber(queuedDeliveries, 0)} / ${sandboxFormatNumber(droppedRps)}`, 'held / dropped per s', `${sandboxFormatNumber(preferenceLookupsRps)} preference lookups/s`, queueRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `Product events pass through channel queues to providers. ${sandboxFormatNumber(channelDeliveriesRps)} initial deliveries and ${sandboxFormatNumber(retryRps)} retries are offered per second, with ${sandboxFormatNumber(queuedDeliveries, 0)} deliveries queued and ${sandboxFormatNumber(droppedRps)} dropped per second.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    eligibleDeliveriesRps: sandboxRounded(eligibleDeliveriesRps),
    channelDeliveriesRps: sandboxRounded(channelDeliveriesRps),
    retryRps: sandboxRounded(retryRps),
    offeredProviderRps: sandboxRounded(offeredProviderRps),
    providerCapacityRps,
    providerUtilizationPct: sandboxRounded(providerUtilization * 100),
    preferenceLookupsRps: sandboxRounded(preferenceLookupsRps),
    preferenceUtilizationPct: sandboxRounded(preferenceUtilization * 100),
    queuedDeliveries: sandboxRounded(queuedDeliveries),
    droppedRps: sandboxRounded(droppedRps),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(eligibleDeliveriesRps)} opted-in recipient deliveries/s become ${sandboxFormatNumber(channelDeliveriesRps)} channel deliveries/s.`,
      `${sandboxFormatNumber(retryRps)} retries/s add to ${sandboxFormatNumber(offeredProviderRps)} offered provider work/s.`,
      `${sandboxFormatNumber(preferenceLookupsRps)} preference lookups/s use ${sandboxFormatNumber(values.preferenceLookupCapacity)} lookups/s of capacity.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Each opted-in recipient receives one delivery per configured channel.',
      'Retries multiply provider work after the configured failure rate.',
      'A bounded queue holds ten seconds of excess work before drops are reported.',
      'Provider and preference capacity are independent learner-supplied assumptions.'
    ]
  };
}

/* ——— Consistent hashing model ——— */

const CONSISTENT_HASHING_SANDBOX_LIMITS = Object.freeze({
  nodeCount: { min: 1, max: 1000, step: 1 },
  virtualNodesPerNode: { min: 1, max: 1000, step: 1 },
  keyCount: { min: 1000, max: 100000000, step: 1000 },
  addedNodes: { min: 0, max: 500, step: 1 },
  hotKeyShare: { min: 0, max: 100, step: 1 }
});

const CONSISTENT_HASHING_SANDBOX_DEFAULTS = Object.freeze({
  nodeCount: 10,
  virtualNodesPerNode: 100,
  keyCount: 1000000,
  addedNodes: 1,
  hotKeyShare: 10
});

const CONSISTENT_HASHING_SANDBOX_CONTROLS = Object.freeze([
  { key: 'nodeCount', label: 'Nodes', unit: 'nodes' },
  { key: 'virtualNodesPerNode', label: 'Virtual nodes per node', unit: 'v-nodes' },
  { key: 'keyCount', label: 'Keys', unit: 'keys' },
  { key: 'addedNodes', label: 'Nodes added', unit: 'nodes' },
  { key: 'hotKeyShare', label: 'Hottest-key share', unit: '%', advanced: true }
]);

const CONSISTENT_HASHING_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'steady-ring', label: 'Steady ring', level: 1,
    description: 'A stable ring with many virtual nodes and a modest hot-key share.',
    objective: 'See a well-balanced ring keep most keys in place.',
    values: CONSISTENT_HASHING_SANDBOX_DEFAULTS
  },
  {
    id: 'scale-out', label: 'Scale out', level: 2,
    description: 'The cluster grows by several nodes and must reshuffle keys.',
    objective: 'Observe how few keys move when the ring absorbs new nodes.',
    values: { ...CONSISTENT_HASHING_SANDBOX_DEFAULTS, addedNodes: 5 }
  },
  {
    id: 'few-virtual-nodes', label: 'Few virtual nodes', level: 3,
    description: 'Each node has only a handful of ring positions.',
    objective: 'See uneven ownership when virtual nodes are scarce.',
    values: { ...CONSISTENT_HASHING_SANDBOX_DEFAULTS, virtualNodesPerNode: 5 }
  },
  {
    id: 'hot-keys', label: 'Hot keys', level: 4,
    description: 'A small set of keys absorbs most of the traffic.',
    objective: 'Understand why hashing cannot fix a hot key on its own.',
    values: { ...CONSISTENT_HASHING_SANDBOX_DEFAULTS, hotKeyShare: 60 }
  },
  {
    id: 'rebuild-storm', label: 'Rebuild storm', level: 5,
    description: 'Many nodes join at once, forcing a large key reshuffle.',
    objective: 'See a burst of churn when the ring absorbs many nodes.',
    values: { ...CONSISTENT_HASHING_SANDBOX_DEFAULTS, nodeCount: 20, addedNodes: 60, hotKeyShare: 5 }
  }
]);

const CONSISTENT_HASHING_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced', label: 'The ring stays balanced' },
  { id: 'churn', label: 'Many keys relocate' },
  { id: 'hot-key', label: 'A hot key concentrates load' },
  { id: 'uneven', label: 'Ownership becomes uneven' }
]);

function consistentHashingPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, CONSISTENT_HASHING_SANDBOX_LIMITS, CONSISTENT_HASHING_SANDBOX_DEFAULTS);
  const keysMovedPct = values.addedNodes / (values.nodeCount + values.addedNodes) * 100;
  if (values.hotKeyShare >= 40) return 'hot-key';
  if (values.virtualNodesPerNode < 10) return 'uneven';
  if (keysMovedPct >= 25) return 'churn';
  return 'balanced';
}

function simulateConsistentHashing(input = {}) {
  const values = normalizeModelInput(input, CONSISTENT_HASHING_SANDBOX_LIMITS, CONSISTENT_HASHING_SANDBOX_DEFAULTS);
  const keysPerNode = values.keyCount / values.nodeCount;
  const keysMovedPct = values.addedNodes / (values.nodeCount + values.addedNodes) * 100;
  const ringPositions = values.nodeCount * values.virtualNodesPerNode;
  const hotKeys = values.keyCount * values.hotKeyShare / 100;
  const balanceQualityPct = Math.min(100, values.virtualNodesPerNode);
  const hotKeyRisk = sandboxPressureTone(values.hotKeyShare / 100, 0.4, 1);
  const balanceRisk = values.virtualNodesPerNode < 10 ? 'watch' : 'healthy';
  const churnRisk = sandboxPressureTone(keysMovedPct / 100, 0.25, 0.5);
  const status = sandboxStatus([hotKeyRisk, balanceRisk, churnRisk]);
  let primaryRisk = 'none';
  if (values.hotKeyShare >= 40) primaryRisk = 'hot-key';
  else if (values.virtualNodesPerNode < 10) primaryRisk = 'uneven';
  else if (keysMovedPct >= 25) primaryRisk = 'churn';
  const teachingConclusion = {
    none: 'The ring is well balanced with enough virtual nodes, and growth relocates only a small slice of keys.',
    'hot-key': 'Hashing spreads keys, not popularity. A single hot key still lands on one node and concentrates load there.',
    uneven: 'Too few virtual nodes leave large, uneven ownership ranges, so some nodes hold far more keys than others.',
    churn: 'Adding many nodes at once relocates a meaningful share of keys, causing a burst of misses while caches refill.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Hashing ring',
    windowLabel: 'Per-rebalance view',
    caption: `${sandboxFormatNumber(values.keyCount, 0)} keys map onto ${sandboxFormatNumber(values.nodeCount, 0)} nodes with ${sandboxFormatNumber(values.virtualNodesPerNode, 0)} virtual nodes each.`,
    stages: [
      sandboxFlowStage('keys', 'Keys', sandboxFormatNumber(values.keyCount, 0), 'keys', `${sandboxFormatNumber(hotKeys, 0)} hot keys`, 'neutral'),
      sandboxFlowStage('ring', 'Hash ring', sandboxFormatNumber(ringPositions, 0), 'positions', `${sandboxFormatNumber(values.nodeCount, 0)} nodes · ${sandboxFormatNumber(values.virtualNodesPerNode, 0)} v-nodes each`, balanceRisk),
      sandboxFlowStage('nodes', 'Nodes', sandboxFormatNumber(values.nodeCount, 0), 'nodes', `${sandboxFormatNumber(keysPerNode, 0)} keys per node`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('moved', 'Keys relocated', sandboxFormatNumber(keysMovedPct), '%', 'Share of keys that move after adding nodes.', churnRisk),
      sandboxFlowOutcome('balance', 'Balance quality', sandboxFormatNumber(balanceQualityPct, 0), '%', 'Higher virtual-node counts smooth ownership.', balanceRisk),
      sandboxFlowOutcome('hot', 'Hot-key share', sandboxFormatNumber(values.hotKeyShare, 0), '%', 'Traffic concentrated on the hottest keys.', hotKeyRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A hash ring places ${sandboxFormatNumber(values.keyCount, 0)} keys onto ${sandboxFormatNumber(values.nodeCount, 0)} nodes. Adding ${sandboxFormatNumber(values.addedNodes, 0)} nodes relocates ${sandboxFormatNumber(keysMovedPct)} percent of keys, and ${sandboxFormatNumber(values.hotKeyShare, 0)} percent of keys are hot.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    keysPerNode: sandboxRounded(keysPerNode),
    keysMovedPct: sandboxRounded(keysMovedPct),
    ringPositions: sandboxRounded(ringPositions),
    hotKeys: sandboxRounded(hotKeys),
    balanceQualityPct: sandboxRounded(balanceQualityPct),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `Adding ${sandboxFormatNumber(values.addedNodes, 0)} nodes relocates ${sandboxFormatNumber(keysMovedPct)}% of keys instead of a full remap.`,
      `${sandboxFormatNumber(values.virtualNodesPerNode, 0)} virtual nodes per node produce ${sandboxFormatNumber(ringPositions, 0)} ring positions.`,
      `${sandboxFormatNumber(values.hotKeyShare, 0)}% of keys are hot, concentrating ${sandboxFormatNumber(hotKeys, 0)} keys of load.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Keys and nodes hash uniformly onto the ring.',
      'Added nodes only take over their clockwise range.',
      'Hot keys concentrate load regardless of the hash placement.',
      'Virtual-node count is treated as a proxy for balance quality.'
    ]
  };
}

/* ——— Load balancer model ——— */

const LOAD_BALANCER_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  serverCount: { min: 1, max: 1000, step: 1 },
  avgRequestMs: { min: 1, max: 1000, step: 1 },
  requestVariancePct: { min: 0, max: 300, step: 1 },
  hotClientShare: { min: 0, max: 100, step: 1 }
});

const LOAD_BALANCER_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 300,
  serverCount: 10,
  avgRequestMs: 10,
  requestVariancePct: 40,
  hotClientShare: 15
});

const LOAD_BALANCER_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Requests', unit: 'req/s' },
  { key: 'serverCount', label: 'Servers', unit: 'servers' },
  { key: 'avgRequestMs', label: 'Average request cost', unit: 'ms' },
  { key: 'requestVariancePct', label: 'Request variance', unit: '%', advanced: true },
  { key: 'hotClientShare', label: 'Hottest-client share', unit: '%' }
]);

const LOAD_BALANCER_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'uniform-load', label: 'Uniform load', level: 1,
    description: 'Requests are cheap and evenly distributed across servers.',
    objective: 'See a simple round-robin keep every server near the average.',
    values: LOAD_BALANCER_SANDBOX_DEFAULTS
  },
  {
    id: 'costly-requests', label: 'Costly requests', level: 2,
    description: 'Requests are expensive, so per-server capacity shrinks.',
    objective: 'Compare aggregate demand against a smaller per-server capacity.',
    values: { ...LOAD_BALANCER_SANDBOX_DEFAULTS, avgRequestMs: 40 }
  },
  {
    id: 'hot-client', label: 'Hot client', level: 3,
    description: 'One client sends a large share of traffic.',
    objective: 'Spot a single hot source overloading one server.',
    values: { ...LOAD_BALANCER_SANDBOX_DEFAULTS, hotClientShare: 80 }
  },
  {
    id: 'high-variance', label: 'High variance', level: 4,
    description: 'Request cost varies widely, so round-robin misplaces load.',
    objective: 'Understand why least-connections beats round-robin under variance.',
    values: { ...LOAD_BALANCER_SANDBOX_DEFAULTS, requestVariancePct: 250 }
  },
  {
    id: 'near-capacity', label: 'Near capacity', level: 5,
    description: 'The fleet runs at its modeled ceiling.',
    objective: 'See aggregate headroom vanish as demand approaches capacity.',
    values: { ...LOAD_BALANCER_SANDBOX_DEFAULTS, requestRate: 1100 }
  }
]);

const LOAD_BALANCER_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced', label: 'Servers stay balanced' },
  { id: 'hot-server', label: 'One server overheats' },
  { id: 'overloaded', label: 'The fleet saturates' },
  { id: 'misrouted', label: 'Uniform routing misplaces work' }
]);

function loadBalancerPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, LOAD_BALANCER_SANDBOX_LIMITS, LOAD_BALANCER_SANDBOX_DEFAULTS);
  const capacityPerServerRps = 1000 / values.avgRequestMs;
  const utilizationPct = values.requestRate / values.serverCount / capacityPerServerRps * 100;
  const hotServerUtilizationPct = utilizationPct + values.hotClientShare;
  if (utilizationPct >= 100) return 'overloaded';
  if (hotServerUtilizationPct >= 100) return 'hot-server';
  if (values.requestVariancePct >= 150) return 'misrouted';
  return 'balanced';
}

function simulateLoadBalancer(input = {}) {
  const values = normalizeModelInput(input, LOAD_BALANCER_SANDBOX_LIMITS, LOAD_BALANCER_SANDBOX_DEFAULTS);
  const capacityPerServerRps = 1000 / values.avgRequestMs;
  const perServerRps = values.requestRate / values.serverCount;
  const utilizationPct = perServerRps / capacityPerServerRps * 100;
  const hotClientRps = values.requestRate * values.hotClientShare / 100;
  const hotServerUtilizationPct = utilizationPct + values.hotClientShare;
  const varianceRisk = values.requestVariancePct >= 150 ? 'watch' : 'healthy';
  const hotRisk = sandboxPressureTone(hotServerUtilizationPct / 100);
  const saturationRisk = sandboxPressureTone(utilizationPct / 100);
  const status = sandboxStatus([saturationRisk, hotRisk, varianceRisk]);
  let primaryRisk = 'none';
  if (utilizationPct >= 100) primaryRisk = 'overloaded';
  else if (hotServerUtilizationPct >= 100) primaryRisk = 'hot-server';
  else if (values.requestVariancePct >= 150) primaryRisk = 'misrouted';
  const teachingConclusion = {
    none: 'The fleet has headroom and requests are uniform enough that any simple algorithm keeps servers balanced.',
    overloaded: 'Aggregate demand exceeds total capacity, so no routing algorithm can help; the fleet needs more servers.',
    'hot-server': 'A hot client concentrates load on fewer servers, so uniform routing can overheat one while others idle.',
    misrouted: 'High request-cost variance makes uniform routing misplace work; least-connections tracks in-flight load better.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Routing path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.requestRate)} requests/s spread across ${sandboxFormatNumber(values.serverCount, 0)} servers with ${sandboxFormatNumber(values.avgRequestMs)} ms average cost.`,
    stages: [
      sandboxFlowStage('clients', 'Client requests', sandboxFormatNumber(values.requestRate), 'req/s', `${sandboxFormatNumber(values.hotClientShare, 0)}% from one client`, 'neutral'),
      sandboxFlowStage('lb', 'Load balancer', sandboxFormatNumber(perServerRps), 'req/s per server', `${sandboxFormatNumber(values.requestVariancePct, 0)}% cost variance`, varianceRisk),
      sandboxFlowStage('servers', 'Server fleet', sandboxFormatNumber(values.serverCount, 0), 'servers', `${sandboxFormatNumber(utilizationPct, 0)}% utilized`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('utilization', 'Fleet utilization', sandboxFormatNumber(utilizationPct, 0), '%', 'Average across servers.', saturationRisk),
      sandboxFlowOutcome('hot-server', 'Hot server', sandboxFormatNumber(hotServerUtilizationPct, 0), '%', 'The busiest server under skew.', hotRisk),
      sandboxFlowOutcome('hot-client', 'Hot client', sandboxFormatNumber(hotClientRps), 'req/s', `${sandboxFormatNumber(values.hotClientShare, 0)}% of traffic from one source`, hotRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A load balancer spreads ${sandboxFormatNumber(values.requestRate)} requests per second across ${sandboxFormatNumber(values.serverCount, 0)} servers. The fleet runs at ${sandboxFormatNumber(utilizationPct)} percent utilization, and the busiest server runs at ${sandboxFormatNumber(hotServerUtilizationPct)} percent.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    perServerRps: sandboxRounded(perServerRps),
    utilizationPct: sandboxRounded(utilizationPct),
    hotClientRps: sandboxRounded(hotClientRps),
    hotServerUtilizationPct: sandboxRounded(hotServerUtilizationPct),
    capacityPerServerRps: sandboxRounded(capacityPerServerRps),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `Each server handles ${sandboxFormatNumber(perServerRps)} requests/s against a ${sandboxFormatNumber(capacityPerServerRps)} requests/s capacity.`,
      `The hottest client contributes ${sandboxFormatNumber(hotClientRps)} requests/s.`,
      `${sandboxFormatNumber(values.requestVariancePct, 0)}% request-cost variance changes how well uniform routing performs.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Each server can process one request per average request cost.',
      'The hottest client is routed uniformly, so skew lands on fewer servers.',
      'Request variance is modeled as a proxy for least-connections benefit.',
      'Capacity is an instructional, learner-supplied assumption.'
    ]
  };
}

/* ——— API gateway model ——— */

const API_GATEWAY_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  upstreamCount: { min: 1, max: 100, step: 1 },
  policyOverheadMs: { min: 0, max: 100, step: 0.5 },
  routingOverheadMs: { min: 0, max: 50, step: 0.5 },
  backendLatencyMs: { min: 1, max: 500, step: 1 },
  gatewayCapacityRps: { min: 100, max: 2000000, step: 100 }
});

const API_GATEWAY_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 2000,
  upstreamCount: 5,
  policyOverheadMs: 3,
  routingOverheadMs: 1,
  backendLatencyMs: 40,
  gatewayCapacityRps: 50000
});

const API_GATEWAY_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Requests', unit: 'req/s' },
  { key: 'upstreamCount', label: 'Upstream services', unit: 'services' },
  { key: 'policyOverheadMs', label: 'Policy overhead', unit: 'ms' },
  { key: 'routingOverheadMs', label: 'Routing overhead', unit: 'ms', advanced: true },
  { key: 'backendLatencyMs', label: 'Backend latency', unit: 'ms' },
  { key: 'gatewayCapacityRps', label: 'Gateway capacity', unit: 'req/s', advanced: true }
]);

const API_GATEWAY_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'light-policy', label: 'Light policy', level: 1,
    description: 'Minimal per-request policy keeps the gateway nearly invisible.',
    objective: 'See routing and policy add only a small overhead.',
    values: API_GATEWAY_SANDBOX_DEFAULTS
  },
  {
    id: 'heavy-policy', label: 'Heavy policy', level: 2,
    description: 'Authentication and validation add noticeable latency.',
    objective: 'Understand the latency tax of centralized policy.',
    values: { ...API_GATEWAY_SANDBOX_DEFAULTS, policyOverheadMs: 30, routingOverheadMs: 8 }
  },
  {
    id: 'many-upstreams', label: 'Many upstreams', level: 3,
    description: 'One gateway fronts a large number of services.',
    objective: 'See fan-out and routing complexity grow.',
    values: { ...API_GATEWAY_SANDBOX_DEFAULTS, upstreamCount: 40, routingOverheadMs: 6 }
  },
  {
    id: 'gateway-saturation', label: 'Gateway saturation', level: 4,
    description: 'Request volume approaches the gateway processing ceiling.',
    objective: 'Compare request throughput with the gateway capacity.',
    values: { ...API_GATEWAY_SANDBOX_DEFAULTS, requestRate: 120000, gatewayCapacityRps: 80000 }
  },
  {
    id: 'slow-backends', label: 'Slow backends', level: 5,
    description: 'Upstream latency dominates the end-to-end path.',
    objective: 'Separate gateway overhead from backend latency.',
    values: { ...API_GATEWAY_SANDBOX_DEFAULTS, backendLatencyMs: 300, requestRate: 15000, gatewayCapacityRps: 50000 }
  }
]);

const API_GATEWAY_PREDICTION_OPTIONS = Object.freeze([
  { id: 'invisible', label: 'The gateway stays invisible' },
  { id: 'policy-tax', label: 'Policy adds visible latency' },
  { id: 'saturated', label: 'The gateway saturates' },
  { id: 'backend-bound', label: 'Backend latency dominates' }
]);

function apiGatewayPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, API_GATEWAY_SANDBOX_LIMITS, API_GATEWAY_SANDBOX_DEFAULTS);
  const utilization = values.requestRate / values.gatewayCapacityRps;
  const overheadMs = values.policyOverheadMs + values.routingOverheadMs;
  if (utilization >= 1) return 'saturated';
  if (values.backendLatencyMs >= 150) return 'backend-bound';
  if (overheadMs >= 20) return 'policy-tax';
  return 'invisible';
}

function simulateApiGateway(input = {}) {
  const values = normalizeModelInput(input, API_GATEWAY_SANDBOX_LIMITS, API_GATEWAY_SANDBOX_DEFAULTS);
  const overheadMs = values.policyOverheadMs + values.routingOverheadMs;
  const totalLatencyMs = overheadMs + values.backendLatencyMs;
  const utilizationPct = values.requestRate / values.gatewayCapacityRps * 100;
  const overheadSharePct = totalLatencyMs > 0 ? overheadMs / totalLatencyMs * 100 : 0;
  const perUpstreamRps = values.requestRate / values.upstreamCount;
  const saturationRisk = sandboxPressureTone(utilizationPct / 100);
  const backendRisk = values.backendLatencyMs >= 150 ? 'watch' : 'healthy';
  const policyRisk = overheadMs >= 20 ? 'watch' : 'healthy';
  const status = sandboxStatus([saturationRisk, backendRisk, policyRisk]);
  let primaryRisk = 'none';
  if (utilizationPct >= 100) primaryRisk = 'saturated';
  else if (values.backendLatencyMs >= 150) primaryRisk = 'backend-bound';
  else if (overheadMs >= 20) primaryRisk = 'policy-tax';
  const teachingConclusion = {
    none: 'The gateway routes and polices requests with small overhead relative to backend work.',
    saturated: 'The gateway processing ceiling is the constraint; it cannot evaluate requests faster than its capacity.',
    'backend-bound': 'Backend latency dominates the path, so gateway tuning will not move the end-to-end number.',
    'policy-tax': 'Centralized policy is convenient but adds a per-request latency tax that scales with request rate.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Gateway path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.requestRate)} requests/s route through one gateway to ${sandboxFormatNumber(values.upstreamCount, 0)} upstream services.`,
    stages: [
      sandboxFlowStage('clients', 'Clients', sandboxFormatNumber(values.requestRate), 'req/s', 'All traffic enters here', 'neutral'),
      sandboxFlowStage('gateway', 'Gateway', sandboxFormatNumber(values.gatewayCapacityRps), 'req/s capacity', `${sandboxFormatNumber(utilizationPct, 0)}% utilized · ${sandboxFormatNumber(overheadMs)} ms overhead`, saturationRisk),
      sandboxFlowStage('upstreams', 'Upstreams', sandboxFormatNumber(values.upstreamCount, 0), 'services', `${sandboxFormatNumber(perUpstreamRps)} req/s each`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('latency', 'End-to-end latency', sandboxFormatNumber(totalLatencyMs), 'ms', `${sandboxFormatNumber(overheadMs)} ms gateway + ${sandboxFormatNumber(values.backendLatencyMs)} ms backend`, backendRisk),
      sandboxFlowOutcome('overhead-share', 'Gateway overhead share', sandboxFormatNumber(overheadSharePct, 0), '%', 'Policy + routing as a share of latency.', policyRisk),
      sandboxFlowOutcome('utilization', 'Gateway utilization', sandboxFormatNumber(utilizationPct, 0), '%', 'Request rate against gateway capacity.', saturationRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A gateway routes ${sandboxFormatNumber(values.requestRate)} requests per second to ${sandboxFormatNumber(values.upstreamCount, 0)} upstream services. End-to-end latency is ${sandboxFormatNumber(totalLatencyMs)} milliseconds and the gateway is ${sandboxFormatNumber(utilizationPct)} percent utilized.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    totalLatencyMs: sandboxRounded(totalLatencyMs),
    overheadMs: sandboxRounded(overheadMs),
    overheadSharePct: sandboxRounded(overheadSharePct),
    utilizationPct: sandboxRounded(utilizationPct),
    perUpstreamRps: sandboxRounded(perUpstreamRps),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(overheadMs)} ms of gateway overhead adds to ${sandboxFormatNumber(values.backendLatencyMs)} ms of backend latency.`,
      `${sandboxFormatNumber(values.requestRate)} requests/s use ${sandboxFormatNumber(values.gatewayCapacityRps)} requests/s of gateway capacity.`,
      `Each of ${sandboxFormatNumber(values.upstreamCount, 0)} upstream services receives ${sandboxFormatNumber(perUpstreamRps)} requests/s.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Every request passes through the gateway exactly once.',
      'Gateway overhead is a constant per-request cost.',
      'Gateway capacity is an instructional, learner-supplied ceiling.',
      'Backend latency is independent of the gateway.'
    ]
  };
}

/* ——— Reverse proxy model ——— */

const REVERSE_PROXY_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  backendCount: { min: 1, max: 1000, step: 1 },
  keepAliveReuse: { min: 0, max: 100, step: 1 },
  tlsHandshakeMs: { min: 0, max: 200, step: 1 },
  backendConnectMs: { min: 0.5, max: 50, step: 0.5 }
});

const REVERSE_PROXY_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 3000,
  backendCount: 5,
  keepAliveReuse: 80,
  tlsHandshakeMs: 8,
  backendConnectMs: 5
});

const REVERSE_PROXY_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Requests', unit: 'req/s' },
  { key: 'backendCount', label: 'Backends', unit: 'backends' },
  { key: 'keepAliveReuse', label: 'Connection reuse', unit: '%' },
  { key: 'tlsHandshakeMs', label: 'TLS handshake', unit: 'ms' },
  { key: 'backendConnectMs', label: 'Backend connect', unit: 'ms', advanced: true }
]);

const REVERSE_PROXY_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'healthy-reuse', label: 'Healthy reuse', level: 1,
    description: 'Most requests reuse an open backend connection.',
    objective: 'See connection reuse absorb the handshake cost.',
    values: REVERSE_PROXY_SANDBOX_DEFAULTS
  },
  {
    id: 'cold-connections', label: 'Cold connections', level: 2,
    description: 'Few connections are reused, so each request reconnects.',
    objective: 'Understand the per-request cost of re-establishing connections.',
    values: { ...REVERSE_PROXY_SANDBOX_DEFAULTS, keepAliveReuse: 5 }
  },
  {
    id: 'heavy-tls', label: 'Heavy TLS', level: 3,
    description: 'Expensive handshakes make reuse matter more.',
    objective: 'See TLS termination cost multiply without reuse.',
    values: { ...REVERSE_PROXY_SANDBOX_DEFAULTS, tlsHandshakeMs: 60, keepAliveReuse: 30 }
  },
  {
    id: 'many-backends', label: 'Many backends', level: 4,
    description: 'A large backend pool spreads connections thin.',
    objective: 'Compare connection reuse across a wide backend pool.',
    values: { ...REVERSE_PROXY_SANDBOX_DEFAULTS, backendCount: 50, keepAliveReuse: 50 }
  },
  {
    id: 'high-throughput', label: 'High throughput', level: 5,
    description: 'High request volume stresses connection management.',
    objective: 'See reuse and connect cost matter at scale.',
    values: { ...REVERSE_PROXY_SANDBOX_DEFAULTS, requestRate: 80000, backendCount: 20, keepAliveReuse: 60 }
  }
]);

const REVERSE_PROXY_PREDICTION_OPTIONS = Object.freeze([
  { id: 'efficient', label: 'Reuse keeps the path cheap' },
  { id: 'reconnect-cost', label: 'Reconnects dominate cost' },
  { id: 'tls-bound', label: 'TLS termination is the tax' },
  { id: 'spread-thin', label: 'Backends spread connections thin' }
]);

function reverseProxyPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, REVERSE_PROXY_SANDBOX_LIMITS, REVERSE_PROXY_SANDBOX_DEFAULTS);
  if (values.tlsHandshakeMs >= 50) return 'tls-bound';
  if (values.backendCount >= 40) return 'spread-thin';
  if (values.keepAliveReuse <= 10) return 'reconnect-cost';
  return 'efficient';
}

function simulateReverseProxy(input = {}) {
  const values = normalizeModelInput(input, REVERSE_PROXY_SANDBOX_LIMITS, REVERSE_PROXY_SANDBOX_DEFAULTS);
  const reuseMissPct = 100 - values.keepAliveReuse;
  const reconnectPerRequestMs = (values.tlsHandshakeMs + values.backendConnectMs) * reuseMissPct / 100;
  const perBackendRps = values.requestRate / values.backendCount;
  const connectionChurnRps = values.requestRate * reuseMissPct / 100;
  const reuseRisk = sandboxPressureTone(100 - values.keepAliveReuse, 60, 90);
  const tlsRisk = values.tlsHandshakeMs >= 50 ? 'watch' : 'healthy';
  const spreadRisk = values.backendCount >= 40 ? 'watch' : 'healthy';
  const status = sandboxStatus([reuseRisk, tlsRisk, spreadRisk]);
  let primaryRisk = 'none';
  if (values.tlsHandshakeMs >= 50) primaryRisk = 'tls-bound';
  else if (values.backendCount >= 40) primaryRisk = 'spread-thin';
  else if (values.keepAliveReuse < 40) primaryRisk = 'reconnect-cost';
  const teachingConclusion = {
    none: 'Connection reuse keeps the per-request handshake and connect cost close to zero.',
    'reconnect-cost': 'When reuse is low, every request pays to re-establish a backend connection, adding latency and churn.',
    'tls-bound': 'Terminating TLS at the proxy centralizes the handshake, but expensive handshakes multiply without reuse.',
    'spread-thin': 'A wide backend pool reduces how often any one connection is reused, so reconnects grow.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Proxy path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.requestRate)} requests/s pass through the proxy to ${sandboxFormatNumber(values.backendCount, 0)} backends.`,
    stages: [
      sandboxFlowStage('clients', 'Clients', sandboxFormatNumber(values.requestRate), 'req/s', `${sandboxFormatNumber(values.keepAliveReuse, 0)}% connection reuse`, 'neutral'),
      sandboxFlowStage('proxy', 'Reverse proxy', sandboxFormatNumber(values.backendCount, 0), 'backends', `${sandboxFormatNumber(reconnectPerRequestMs)} ms reconnect/request`, reuseRisk),
      sandboxFlowStage('backends', 'Backends', sandboxFormatNumber(perBackendRps), 'req/s each', `${sandboxFormatNumber(values.tlsHandshakeMs)} ms TLS handshake`, status)
    ],
    outcomes: [
      sandboxFlowOutcome('reconnect', 'Reconnect cost', sandboxFormatNumber(reconnectPerRequestMs), 'ms/req', 'Average added latency from missed reuse.', reuseRisk),
      sandboxFlowOutcome('churn', 'Connection churn', sandboxFormatNumber(connectionChurnRps), 'conn/s', 'New backend connections per second.', reuseRisk),
      sandboxFlowOutcome('tls', 'TLS handshake', sandboxFormatNumber(values.tlsHandshakeMs), 'ms', 'Terminated at the proxy.', tlsRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A reverse proxy forwards ${sandboxFormatNumber(values.requestRate)} requests per second to ${sandboxFormatNumber(values.backendCount, 0)} backends. Connection reuse is ${sandboxFormatNumber(values.keepAliveReuse)} percent, adding ${sandboxFormatNumber(reconnectPerRequestMs)} milliseconds of reconnect cost per request.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    reconnectPerRequestMs: sandboxRounded(reconnectPerRequestMs),
    connectionChurnRps: sandboxRounded(connectionChurnRps),
    perBackendRps: sandboxRounded(perBackendRps),
    reuseMissPct: sandboxRounded(reuseMissPct),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(values.keepAliveReuse, 0)}% connection reuse means ${sandboxFormatNumber(reuseMissPct, 0)}% of requests reconnect.`,
      `A missed reuse adds ${sandboxFormatNumber(values.tlsHandshakeMs + values.backendConnectMs)} ms of handshake and connect work.`,
      `${sandboxFormatNumber(connectionChurnRps)} new backend connections are opened per second.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'TLS terminates at the proxy, not the backend.',
      'Reused connections skip the handshake and connect cost.',
      'Backend pool size is treated as a proxy for reuse dilution.',
      'All costs are per-request, instructional assumptions.'
    ]
  };
}

/* ——— CDN model ——— */

const CDN_SANDBOX_LIMITS = Object.freeze({
  requestRate: { min: 1, max: 1000000, step: 1 },
  cacheHitRate: { min: 0, max: 100, step: 1 },
  ttlSeconds: { min: 1, max: 86400, step: 1 },
  originCapacityRps: { min: 10, max: 1000000, step: 10 },
  egressCostPerGb: { min: 0, max: 2, step: 0.01 }
});

const CDN_SANDBOX_DEFAULTS = Object.freeze({
  requestRate: 10000,
  cacheHitRate: 90,
  ttlSeconds: 3600,
  originCapacityRps: 5000,
  egressCostPerGb: 0.08
});

const CDN_SANDBOX_CONTROLS = Object.freeze([
  { key: 'requestRate', label: 'Requests', unit: 'req/s' },
  { key: 'cacheHitRate', label: 'Cache hit rate', unit: '%' },
  { key: 'ttlSeconds', label: 'Cache TTL', unit: 's' },
  { key: 'originCapacityRps', label: 'Origin capacity', unit: 'req/s', advanced: true },
  { key: 'egressCostPerGb', label: 'Egress cost', unit: '$/GB', advanced: true }
]);

const CDN_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'warm-edge', label: 'Warm edge', level: 1,
    description: 'A high hit rate keeps most traffic at the edge.',
    objective: 'See a warm cache absorb almost all requests.',
    values: CDN_SANDBOX_DEFAULTS
  },
  {
    id: 'cold-edge', label: 'Cold edge', level: 2,
    description: 'A low hit rate forces most requests to the origin.',
    objective: 'Understand how misses shift load back to the origin.',
    values: { ...CDN_SANDBOX_DEFAULTS, cacheHitRate: 30 }
  },
  {
    id: 'short-ttl', label: 'Short TTL', level: 3,
    description: 'Content expires quickly, so the edge revalidates often.',
    objective: 'See how short TTL reduces effective cacheability.',
    values: { ...CDN_SANDBOX_DEFAULTS, ttlSeconds: 30, cacheHitRate: 60 }
  },
  {
    id: 'origin-storm', label: 'Origin storm', level: 4,
    description: 'A cache miss spike collides with limited origin capacity.',
    objective: 'Compare miss traffic with the origin ceiling.',
    values: { ...CDN_SANDBOX_DEFAULTS, cacheHitRate: 20, requestRate: 50000, originCapacityRps: 4000 }
  },
  {
    id: 'high-egress', label: 'High egress', level: 5,
    description: 'Large payloads make egress cost the dominant concern.',
    objective: 'Trade cache freshness against egress and origin cost.',
    values: { ...CDN_SANDBOX_DEFAULTS, cacheHitRate: 70, requestRate: 20000, egressCostPerGb: 0.2 }
  }
]);

const CDN_PREDICTION_OPTIONS = Object.freeze([
  { id: 'absorbed', label: 'The edge absorbs traffic' },
  { id: 'origin-load', label: 'The origin is overloaded' },
  { id: 'freshness-cost', label: 'Freshness costs cacheability' },
  { id: 'egress-cost', label: 'Egress cost dominates' }
]);

function cdnPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, CDN_SANDBOX_LIMITS, CDN_SANDBOX_DEFAULTS);
  const missRps = values.requestRate * (100 - values.cacheHitRate) / 100;
  if (missRps >= values.originCapacityRps) return 'origin-load';
  if (values.ttlSeconds <= 60) return 'freshness-cost';
  if (values.egressCostPerGb >= 0.15) return 'egress-cost';
  return 'absorbed';
}

function simulateCdn(input = {}) {
  const values = normalizeModelInput(input, CDN_SANDBOX_LIMITS, CDN_SANDBOX_DEFAULTS);
  const hitRps = values.requestRate * values.cacheHitRate / 100;
  const missRps = values.requestRate - hitRps;
  const originUtilizationPct = missRps / values.originCapacityRps * 100;
  const originOffloadPct = values.cacheHitRate;
  const originRisk = sandboxPressureTone(originUtilizationPct / 100);
  const ttlRisk = values.ttlSeconds <= 60 ? 'watch' : 'healthy';
  const egressRisk = values.egressCostPerGb >= 0.15 ? 'watch' : 'healthy';
  const status = sandboxStatus([originRisk, ttlRisk, egressRisk]);
  let primaryRisk = 'none';
  if (missRps >= values.originCapacityRps) primaryRisk = 'origin-load';
  else if (values.ttlSeconds <= 60) primaryRisk = 'freshness-cost';
  else if (values.egressCostPerGb >= 0.15) primaryRisk = 'egress-cost';
  const teachingConclusion = {
    none: 'A warm edge cache absorbs most requests, leaving the origin with a small, manageable miss stream.',
    'origin-load': 'When the hit rate drops, the miss stream exceeds origin capacity, so the origin becomes the bottleneck.',
    'freshness-cost': 'A short TTL keeps content fresh but pushes more requests back to the origin, reducing cacheability.',
    'egress-cost': 'Even with good hit rates, serving large or high-egress content makes delivery cost the concern.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Delivery path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.requestRate)} requests/s split between the edge cache and the origin.`,
    stages: [
      sandboxFlowStage('clients', 'Clients', sandboxFormatNumber(values.requestRate), 'req/s', `${sandboxFormatNumber(values.cacheHitRate, 0)}% hit rate`, 'neutral'),
      sandboxFlowStage('edge', 'Edge cache', sandboxFormatNumber(hitRps), 'hits/s', `${sandboxFormatNumber(values.ttlSeconds, 0)}s TTL`, ttlRisk),
      sandboxFlowStage('origin', 'Origin', sandboxFormatNumber(missRps), 'misses/s', `${sandboxFormatNumber(values.originCapacityRps)} capacity`, originRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('hits', 'Edge hits', sandboxFormatNumber(hitRps), 'req/s', 'Served without touching the origin.', hitRps > 0 ? 'healthy' : 'neutral'),
      sandboxFlowOutcome('misses', 'Origin misses', sandboxFormatNumber(missRps), 'req/s', 'Forwarded to the origin.', originRisk),
      sandboxFlowOutcome('offload', 'Origin offload', sandboxFormatNumber(originOffloadPct, 0), '%', 'Share of traffic absorbed at the edge.', originOffloadPct > 50 ? 'healthy' : 'watch')
    ],
    callout: teachingConclusion,
    ariaLabel: `A CDN serves ${sandboxFormatNumber(values.requestRate)} requests per second with a ${sandboxFormatNumber(values.cacheHitRate)} percent hit rate. ${sandboxFormatNumber(hitRps)} requests are edge hits and ${sandboxFormatNumber(missRps)} requests miss to the origin.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    hitRps: sandboxRounded(hitRps),
    missRps: sandboxRounded(missRps),
    originUtilizationPct: sandboxRounded(originUtilizationPct),
    originOffloadPct: sandboxRounded(originOffloadPct),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(hitRps)} requests/s are edge hits and ${sandboxFormatNumber(missRps)} requests/s reach the origin.`,
      `The origin runs at ${sandboxFormatNumber(originUtilizationPct, 0)}% of its ${sandboxFormatNumber(values.originCapacityRps)} requests/s capacity.`,
      `A ${sandboxFormatNumber(values.ttlSeconds, 0)} second TTL sets how long content stays cacheable at the edge.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Every miss forwards exactly one request to the origin.',
      'Cache hits serve from the edge without origin involvement.',
      'TTL is treated as a proxy for freshness versus cacheability.',
      'Egress cost is a per-gigabyte instructional assumption.'
    ]
  };
}

/* ——— WebSockets model ——— */

const WEBSOCKETS_SANDBOX_LIMITS = Object.freeze({
  connections: { min: 1, max: 10000000, step: 1 },
  messagesPerSecond: { min: 1, max: 10000000, step: 1 },
  bytesPerMessage: { min: 1, max: 65536, step: 1 },
  connectionMemoryKb: { min: 1, max: 1024, step: 1 },
  serverMemoryMb: { min: 16, max: 65536, step: 16 },
  fanoutTargets: { min: 1, max: 100000, step: 1 }
});

const WEBSOCKETS_SANDBOX_DEFAULTS = Object.freeze({
  connections: 100000,
  messagesPerSecond: 5000,
  bytesPerMessage: 256,
  connectionMemoryKb: 32,
  serverMemoryMb: 8192,
  fanoutTargets: 10
});

const WEBSOCKETS_SANDBOX_CONTROLS = Object.freeze([
  { key: 'connections', label: 'Open connections', unit: 'connections' },
  { key: 'messagesPerSecond', label: 'Messages', unit: 'msg/s' },
  { key: 'bytesPerMessage', label: 'Message size', unit: 'B' },
  { key: 'connectionMemoryKb', label: 'Memory per connection', unit: 'KB' },
  { key: 'serverMemoryMb', label: 'Server memory', unit: 'MB', advanced: true },
  { key: 'fanoutTargets', label: 'Fan-out targets', unit: 'recipients' }
]);

const WEBSOCKETS_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'idle-connections', label: 'Idle connections', level: 1,
    description: 'Many connections stay open with modest messaging.',
    objective: 'See connection state dominate memory over message work.',
    values: WEBSOCKETS_SANDBOX_DEFAULTS
  },
  {
    id: 'memory-pressure', label: 'Memory pressure', level: 2,
    description: 'Open connections consume more memory than the server has.',
    objective: 'Understand why connection state limits how many users fit.',
    values: { ...WEBSOCKETS_SANDBOX_DEFAULTS, connections: 1000000, connectionMemoryKb: 64, serverMemoryMb: 4096 }
  },
  {
    id: 'high-message-rate', label: 'High message rate', level: 3,
    description: 'A small number of connections sends a flood of messages.',
    objective: 'Separate message throughput from connection count.',
    values: { ...WEBSOCKETS_SANDBOX_DEFAULTS, connections: 10000, messagesPerSecond: 500000 }
  },
  {
    id: 'large-fanout', label: 'Large fan-out', level: 4,
    description: 'Each message is delivered to many recipients.',
    objective: 'See delivery work multiply with fan-out size.',
    values: { ...WEBSOCKETS_SANDBOX_DEFAULTS, fanoutTargets: 5000, messagesPerSecond: 500 }
  },
  {
    id: 'large-messages', label: 'Large messages', level: 5,
    description: 'Messages are big, pushing bandwidth higher.',
    objective: 'Compare bandwidth cost against connection and memory pressure.',
    values: { ...WEBSOCKETS_SANDBOX_DEFAULTS, bytesPerMessage: 8192, messagesPerSecond: 10000 }
  }
]);

const WEBSOCKETS_PREDICTION_OPTIONS = Object.freeze([
  { id: 'healthy', label: 'Connections and messages stay cheap' },
  { id: 'memory-bound', label: 'Connection memory is the limit' },
  { id: 'throughput-bound', label: 'Message throughput is the limit' },
  { id: 'fanout-amplified', label: 'Fan-out amplifies delivery work' }
]);

function websocketsPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, WEBSOCKETS_SANDBOX_LIMITS, WEBSOCKETS_SANDBOX_DEFAULTS);
  const memoryMb = values.connections * values.connectionMemoryKb / 1024;
  const deliveriesRps = values.messagesPerSecond * values.fanoutTargets;
  if (memoryMb >= values.serverMemoryMb) return 'memory-bound';
  if (values.fanoutTargets >= 1000) return 'fanout-amplified';
  if (values.messagesPerSecond >= 100000) return 'throughput-bound';
  return 'healthy';
}

function simulateWebsockets(input = {}) {
  const values = normalizeModelInput(input, WEBSOCKETS_SANDBOX_LIMITS, WEBSOCKETS_SANDBOX_DEFAULTS);
  const connectionMemoryMb = values.connections * values.connectionMemoryKb / 1024;
  const memoryUtilizationPct = connectionMemoryMb / values.serverMemoryMb * 100;
  const deliveriesRps = values.messagesPerSecond * values.fanoutTargets;
  const bandwidthMbps = values.messagesPerSecond * values.bytesPerMessage * 8 / 1000000;
  const memoryRisk = sandboxPressureTone(memoryUtilizationPct / 100);
  const fanoutRisk = values.fanoutTargets >= 1000 ? 'watch' : 'healthy';
  const throughputRisk = values.messagesPerSecond >= 100000 ? 'watch' : 'healthy';
  const status = sandboxStatus([memoryRisk, fanoutRisk, throughputRisk]);
  let primaryRisk = 'none';
  if (memoryUtilizationPct >= 100) primaryRisk = 'memory-bound';
  else if (values.fanoutTargets >= 1000) primaryRisk = 'fanout-amplified';
  else if (values.messagesPerSecond >= 100000) primaryRisk = 'throughput-bound';
  const teachingConclusion = {
    none: 'Open connections and message work both fit comfortably within the modeled server.',
    'memory-bound': 'Each open connection holds state, so connection count times per-connection memory is the hard ceiling.',
    'throughput-bound': 'Even few connections can saturate message processing when the message rate is high.',
    'fanout-amplified': 'Fan-out multiplies one message into many deliveries, amplifying bandwidth and processing work.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Realtime path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.connections, 0)} open connections carry ${sandboxFormatNumber(values.messagesPerSecond)} messages/s.`,
    stages: [
      sandboxFlowStage('connections', 'Open connections', sandboxFormatNumber(values.connections, 0), 'connections', `${sandboxFormatNumber(connectionMemoryMb, 0)} MB state`, memoryRisk),
      sandboxFlowStage('router', 'Connection router', sandboxFormatNumber(values.messagesPerSecond), 'msg/s', `${sandboxFormatNumber(values.fanoutTargets, 0)} fan-out targets`, status),
      sandboxFlowStage('delivery', 'Deliveries', sandboxFormatNumber(deliveriesRps), 'deliveries/s', `${sandboxFormatNumber(bandwidthMbps)} Mbps`, fanoutRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('memory', 'Connection memory', sandboxFormatNumber(connectionMemoryMb, 0), 'MB', `${sandboxFormatNumber(memoryUtilizationPct, 0)}% of ${sandboxFormatNumber(values.serverMemoryMb, 0)} MB`, memoryRisk),
      sandboxFlowOutcome('deliveries', 'Delivery work', sandboxFormatNumber(deliveriesRps), 'deliveries/s', 'Fan-out multiplies each message.', fanoutRisk),
      sandboxFlowOutcome('bandwidth', 'Bandwidth', sandboxFormatNumber(bandwidthMbps), 'Mbps', 'Message size times message rate.', throughputRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A WebSocket server holds ${sandboxFormatNumber(values.connections, 0)} connections using ${sandboxFormatNumber(connectionMemoryMb)} megabytes, and processes ${sandboxFormatNumber(values.messagesPerSecond)} messages per second into ${sandboxFormatNumber(deliveriesRps)} deliveries per second.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    connectionMemoryMb: sandboxRounded(connectionMemoryMb),
    memoryUtilizationPct: sandboxRounded(memoryUtilizationPct),
    deliveriesRps: sandboxRounded(deliveriesRps),
    bandwidthMbps: sandboxRounded(bandwidthMbps),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(values.connections, 0)} connections hold ${sandboxFormatNumber(connectionMemoryMb, 0)} MB of state.`,
      `${sandboxFormatNumber(values.messagesPerSecond)} messages/s fan out to ${sandboxFormatNumber(deliveriesRps)} deliveries/s.`,
      `Message size of ${sandboxFormatNumber(values.bytesPerMessage, 0)} B produces ${sandboxFormatNumber(bandwidthMbps)} Mbps of traffic.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Every open connection holds a fixed per-connection state cost.',
      'Fan-out delivers every message to all target recipients.',
      'Bandwidth is computed from message size and rate.',
      'Server memory is an instructional, learner-supplied limit.'
    ]
  };
}

/* ——— Database sharding model ——— */

const DATABASE_SHARDING_SANDBOX_LIMITS = Object.freeze({
  shardCount: { min: 1, max: 1000, step: 1 },
  queryRate: { min: 1, max: 1000000, step: 1 },
  hotShardShare: { min: 0, max: 100, step: 1 },
  crossShardQueryPct: { min: 0, max: 100, step: 1 },
  shardCapacityRps: { min: 10, max: 1000000, step: 10 }
});

const DATABASE_SHARDING_SANDBOX_DEFAULTS = Object.freeze({
  shardCount: 16,
  queryRate: 20000,
  hotShardShare: 15,
  crossShardQueryPct: 5,
  shardCapacityRps: 5000
});

const DATABASE_SHARDING_SANDBOX_CONTROLS = Object.freeze([
  { key: 'shardCount', label: 'Shards', unit: 'shards' },
  { key: 'queryRate', label: 'Queries', unit: 'queries/s' },
  { key: 'hotShardShare', label: 'Hottest-shard share', unit: '%' },
  { key: 'crossShardQueryPct', label: 'Cross-shard queries', unit: '%' },
  { key: 'shardCapacityRps', label: 'Shard capacity', unit: 'queries/s', advanced: true }
]);

const DATABASE_SHARDING_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'even-shards', label: 'Even shards', level: 1,
    description: 'Queries spread evenly and stay within one shard.',
    objective: 'See a balanced sharded store serve queries locally.',
    values: DATABASE_SHARDING_SANDBOX_DEFAULTS
  },
  {
    id: 'hot-shard', label: 'Hot shard', level: 2,
    description: 'One shard receives a large share of queries.',
    objective: 'Spot the hottest shard hitting its ceiling first.',
    values: { ...DATABASE_SHARDING_SANDBOX_DEFAULTS, hotShardShare: 70 }
  },
  {
    id: 'cross-shard', label: 'Cross-shard queries', level: 3,
    description: 'Many queries need data from several shards.',
    objective: 'Understand how cross-shard work adds coordination cost.',
    values: { ...DATABASE_SHARDING_SANDBOX_DEFAULTS, crossShardQueryPct: 40 }
  },
  {
    id: 'few-shards', label: 'Few shards', level: 4,
    description: 'A small shard count concentrates load on each node.',
    objective: 'See per-shard load rise as the shard count drops.',
    values: { ...DATABASE_SHARDING_SANDBOX_DEFAULTS, shardCount: 2, hotShardShare: 20 }
  },
  {
    id: 'oversharded', label: 'Over-sharded', level: 5,
    description: 'Too many shards spread data thin and complicate routing.',
    objective: 'Balance shard count against cross-shard and routing overhead.',
    values: { ...DATABASE_SHARDING_SANDBOX_DEFAULTS, shardCount: 500, crossShardQueryPct: 25 }
  }
]);

const DATABASE_SHARDING_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced', label: 'Shards stay balanced' },
  { id: 'hot-shard', label: 'One shard overheats' },
  { id: 'cross-shard', label: 'Cross-shard work is the tax' },
  { id: 'oversharded', label: 'Too many shards add overhead' }
]);

function databaseShardingPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, DATABASE_SHARDING_SANDBOX_LIMITS, DATABASE_SHARDING_SANDBOX_DEFAULTS);
  const perShardRps = values.queryRate / values.shardCount;
  const hotShardRps = values.queryRate * values.hotShardShare / 100;
  if (hotShardRps >= values.shardCapacityRps) return 'hot-shard';
  if (values.crossShardQueryPct >= 30) return 'cross-shard';
  if (values.shardCount >= 300) return 'oversharded';
  return 'balanced';
}

function simulateDatabaseSharding(input = {}) {
  const values = normalizeModelInput(input, DATABASE_SHARDING_SANDBOX_LIMITS, DATABASE_SHARDING_SANDBOX_DEFAULTS);
  const perShardRps = values.queryRate / values.shardCount;
  const hotShardRps = values.queryRate * values.hotShardShare / 100;
  const hotShardUtilizationPct = hotShardRps / values.shardCapacityRps * 100;
  const perShardUtilizationPct = perShardRps / values.shardCapacityRps * 100;
  const crossShardRps = values.queryRate * values.crossShardQueryPct / 100;
  const hotRisk = sandboxPressureTone(hotShardUtilizationPct / 100);
  const crossShardRisk = values.crossShardQueryPct >= 30 ? 'watch' : 'healthy';
  const overshardRisk = values.shardCount >= 300 ? 'watch' : 'healthy';
  const status = sandboxStatus([hotRisk, crossShardRisk, overshardRisk]);
  let primaryRisk = 'none';
  if (hotShardUtilizationPct >= 100) primaryRisk = 'hot-shard';
  else if (values.crossShardQueryPct >= 30) primaryRisk = 'cross-shard';
  else if (values.shardCount >= 300) primaryRisk = 'oversharded';
  const teachingConclusion = {
    none: 'Shards are balanced and most queries resolve within a single shard.',
    'hot-shard': 'A hot shard receives a disproportionate share and hits its ceiling while other shards idle.',
    'cross-shard': 'Queries that span shards add fan-out and coordination cost that single-shard queries avoid.',
    oversharded: 'More shards add routing and coordination overhead without enough data to justify each one.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Shard path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.queryRate)} queries/s spread across ${sandboxFormatNumber(values.shardCount, 0)} shards.`,
    stages: [
      sandboxFlowStage('queries', 'Queries', sandboxFormatNumber(values.queryRate), 'queries/s', `${sandboxFormatNumber(values.crossShardQueryPct, 0)}% cross-shard`, 'neutral'),
      sandboxFlowStage('routing', 'Shard routing', sandboxFormatNumber(values.shardCount, 0), 'shards', `${sandboxFormatNumber(perShardRps)} queries/s each`, status),
      sandboxFlowStage('shards', 'Shard nodes', sandboxFormatNumber(perShardRps), 'queries/s avg', `${sandboxFormatNumber(values.shardCapacityRps)} capacity`, perShardUtilizationPct >= 100 ? 'stress' : perShardUtilizationPct >= 75 ? 'watch' : 'healthy')
    ],
    outcomes: [
      sandboxFlowOutcome('per-shard', 'Per-shard load', sandboxFormatNumber(perShardRps), 'queries/s', `${sandboxFormatNumber(perShardUtilizationPct, 0)}% of capacity`, perShardUtilizationPct >= 100 ? 'stress' : perShardUtilizationPct >= 75 ? 'watch' : 'healthy'),
      sandboxFlowOutcome('hot-shard', 'Hottest shard', sandboxFormatNumber(hotShardRps), 'queries/s', `${sandboxFormatNumber(hotShardUtilizationPct, 0)}% of capacity`, hotRisk),
      sandboxFlowOutcome('cross-shard', 'Cross-shard work', sandboxFormatNumber(crossShardRps), 'queries/s', `${sandboxFormatNumber(values.crossShardQueryPct, 0)}% of queries span shards`, crossShardRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A sharded database splits ${sandboxFormatNumber(values.queryRate)} queries per second across ${sandboxFormatNumber(values.shardCount, 0)} shards. The average shard handles ${sandboxFormatNumber(perShardRps)} queries per second, and the hottest shard handles ${sandboxFormatNumber(hotShardRps)} queries per second.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    perShardRps: sandboxRounded(perShardRps),
    hotShardRps: sandboxRounded(hotShardRps),
    hotShardUtilizationPct: sandboxRounded(hotShardUtilizationPct),
    perShardUtilizationPct: sandboxRounded(perShardUtilizationPct),
    crossShardRps: sandboxRounded(crossShardRps),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(values.queryRate)} queries/s split into ${sandboxFormatNumber(perShardRps)} queries/s per shard on average.`,
      `The hottest shard receives ${sandboxFormatNumber(hotShardRps)} queries/s, ${sandboxFormatNumber(hotShardUtilizationPct, 0)}% of its capacity.`,
      `${sandboxFormatNumber(crossShardRps)} queries/s span multiple shards.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Queries are shard-local unless marked cross-shard.',
      'The hottest shard receives the configured share of all queries.',
      'Each shard has the same capacity ceiling.',
      'Cross-shard work is counted as an additional coordination cost.'
    ]
  };
}

/* ——— Replication model ——— */

const REPLICATION_SANDBOX_LIMITS = Object.freeze({
  writeRate: { min: 1, max: 1000000, step: 1 },
  replicaCount: { min: 0, max: 100, step: 1 },
  syncMode: { min: 0, max: 1, step: 1 },
  replicationLagMs: { min: 0, max: 5000, step: 1 },
  readRate: { min: 1, max: 1000000, step: 1 },
  readFromReplicasPct: { min: 0, max: 100, step: 1 }
});

const REPLICATION_SANDBOX_DEFAULTS = Object.freeze({
  writeRate: 200,
  replicaCount: 3,
  syncMode: 0,
  replicationLagMs: 500,
  readRate: 8000,
  readFromReplicasPct: 80
});

const REPLICATION_SANDBOX_CONTROLS = Object.freeze([
  { key: 'writeRate', label: 'Writes', unit: 'writes/s' },
  { key: 'replicaCount', label: 'Replicas', unit: 'replicas' },
  { key: 'syncMode', label: 'Synchronous', unit: 'on/off' },
  { key: 'replicationLagMs', label: 'Replication lag', unit: 'ms' },
  { key: 'readRate', label: 'Reads', unit: 'reads/s' },
  { key: 'readFromReplicasPct', label: 'Reads from replicas', unit: '%' }
]);

const REPLICATION_SANDBOX_SITUATIONS = Object.freeze([
  {
    id: 'async-replicas', label: 'Async replicas', level: 1,
    description: 'Writes replicate in the background with modest lag.',
    objective: 'See replicas absorb reads while accepting a lag window.',
    values: REPLICATION_SANDBOX_DEFAULTS
  },
  {
    id: 'sync-replicas', label: 'Sync replicas', level: 2,
    description: 'Writes wait for replicas before committing.',
    objective: 'Understand the write-latency cost of synchronous replication.',
    values: { ...REPLICATION_SANDBOX_DEFAULTS, syncMode: 1, replicationLagMs: 5 }
  },
  {
    id: 'high-lag', label: 'High lag', level: 3,
    description: 'Replication falls far behind the primary.',
    objective: 'See stale reads grow as lag increases.',
    values: { ...REPLICATION_SANDBOX_DEFAULTS, replicationLagMs: 5000, readFromReplicasPct: 90 }
  },
  {
    id: 'many-replicas', label: 'Many replicas', level: 4,
    description: 'A large replica fleet fans out read traffic.',
    objective: 'Compare read fan-out against the write amplification of many replicas.',
    values: { ...REPLICATION_SANDBOX_DEFAULTS, replicaCount: 20, readFromReplicasPct: 95 }
  },
  {
    id: 'write-heavy', label: 'Write-heavy', level: 5,
    description: 'Writes dominate, so replicas add work without helping writes.',
    objective: 'Understand why replication does not scale writes.',
    values: { ...REPLICATION_SANDBOX_DEFAULTS, writeRate: 8000, readRate: 4000, syncMode: 1 }
  }
]);

const REPLICATION_PREDICTION_OPTIONS = Object.freeze([
  { id: 'balanced', label: 'Replicas scale reads cleanly' },
  { id: 'stale-reads', label: 'Lag serves stale reads' },
  { id: 'write-latency', label: 'Sync writes add latency' },
  { id: 'write-bound', label: 'Writes stay on the primary' }
]);

function replicationPredictionBucket(input = {}) {
  const values = normalizeModelInput(input, REPLICATION_SANDBOX_LIMITS, REPLICATION_SANDBOX_DEFAULTS);
  if (values.syncMode === 1 && values.writeRate >= 2000) return 'write-latency';
  if (values.replicationLagMs >= 2000 && values.readFromReplicasPct >= 80) return 'stale-reads';
  if (values.writeRate >= 5000) return 'write-bound';
  return 'balanced';
}

function simulateReplication(input = {}) {
  const values = normalizeModelInput(input, REPLICATION_SANDBOX_LIMITS, REPLICATION_SANDBOX_DEFAULTS);
  const readFromReplicasRps = values.readRate * values.readFromReplicasPct / 100;
  const writeAmplification = values.syncMode === 1 ? values.replicaCount + 1 : 1;
  const writeWorkRps = values.writeRate * writeAmplification;
  const staleReadRps = values.replicationLagMs >= 2000 ? readFromReplicasRps : 0;
  const perReplicaReadRps = values.replicaCount > 0 ? readFromReplicasRps / values.replicaCount : 0;
  const lagRisk = sandboxPressureTone(values.replicationLagMs, 2000, 5000);
  const syncRisk = values.syncMode === 1 ? 'watch' : 'healthy';
  const writeRisk = values.writeRate >= 5000 ? 'watch' : 'healthy';
  const status = sandboxStatus([lagRisk, syncRisk, writeRisk]);
  let primaryRisk = 'none';
  if (values.syncMode === 1 && values.writeRate >= 2000) primaryRisk = 'write-latency';
  else if (values.replicationLagMs >= 2000 && values.readFromReplicasPct >= 80) primaryRisk = 'stale-reads';
  else if (values.writeRate >= 5000) primaryRisk = 'write-bound';
  const teachingConclusion = {
    none: 'Replicas absorb most reads while writes stay light and lag is small.',
    'stale-reads': 'High lag plus heavy replica reads means users see stale data after a write.',
    'write-latency': 'Synchronous replication makes every write wait for replicas, adding latency that scales with the fleet.',
    'write-bound': 'Replication spreads reads, not writes; a write-heavy workload still converges on the primary.'
  }[primaryRisk];
  const trace = sandboxInterviewTrace({
    title: 'Replication path',
    windowLabel: 'Per-second flow',
    caption: `${sandboxFormatNumber(values.writeRate)} writes/s replicate to ${sandboxFormatNumber(values.replicaCount, 0)} replicas while ${sandboxFormatNumber(values.readRate)} reads/s are served.`,
    stages: [
      sandboxFlowStage('writes', 'Writes', sandboxFormatNumber(values.writeRate), 'writes/s', `${values.syncMode === 1 ? 'synchronous' : 'asynchronous'}`, syncRisk),
      sandboxFlowStage('primary', 'Primary', sandboxFormatNumber(values.writeRate), 'writes/s', `${sandboxFormatNumber(writeAmplification)}x write work`, writeRisk),
      sandboxFlowStage('replicas', 'Replicas', sandboxFormatNumber(readFromReplicasRps), 'reads/s', `${sandboxFormatNumber(values.replicationLagMs, 0)} ms lag`, lagRisk)
    ],
    outcomes: [
      sandboxFlowOutcome('replica-reads', 'Replica reads', sandboxFormatNumber(readFromReplicasRps), 'reads/s', `${sandboxFormatNumber(perReplicaReadRps)} per replica`, readFromReplicasRps > 0 ? 'healthy' : 'neutral'),
      sandboxFlowOutcome('write-work', 'Write work', sandboxFormatNumber(writeWorkRps), 'writes/s', `${sandboxFormatNumber(writeAmplification)}x amplification`, writeRisk),
      sandboxFlowOutcome('stale', 'Stale-read window', sandboxFormatNumber(staleReadRps), 'reads/s', 'Reads at risk from replication lag.', lagRisk)
    ],
    callout: teachingConclusion,
    ariaLabel: `A primary handles ${sandboxFormatNumber(values.writeRate)} writes per second and replicates to ${sandboxFormatNumber(values.replicaCount, 0)} replicas. ${sandboxFormatNumber(readFromReplicasRps)} reads per second are served from replicas with ${sandboxFormatNumber(values.replicationLagMs)} milliseconds of lag.`
  });
  return {
    modelVersion: SANDBOX_MODEL_VERSION,
    input: values,
    readFromReplicasRps: sandboxRounded(readFromReplicasRps),
    writeAmplification: sandboxRounded(writeAmplification),
    writeWorkRps: sandboxRounded(writeWorkRps),
    staleReadRps: sandboxRounded(staleReadRps),
    perReplicaReadRps: sandboxRounded(perReplicaReadRps),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(readFromReplicasRps)} reads/s are served from ${sandboxFormatNumber(values.replicaCount, 0)} replicas.`,
      `Synchronous mode ${values.syncMode === 1 ? 'amplifies' : 'does not amplify'} each write across ${sandboxFormatNumber(values.replicaCount, 0)} replicas.`,
      `${sandboxFormatNumber(values.replicationLagMs, 0)} ms of lag is the stale-read window for replica reads.`
    ],
    teachingConclusion,
    trace,
    assumptions: [
      'Synchronous mode waits for all replicas before a commit.',
      'Asynchronous mode applies changes in the background.',
      'Replica reads may be stale within the replication lag window.',
      'Writes still converge on the primary.'
    ]
  };
}

const SANDBOX_WIKI_TOPIC_MAP = Object.freeze({
  'redis-cache': Object.freeze(['caching', 'cache-aside', 'cache-eviction', 'cache-invalidation']),
  'queue-worker': Object.freeze(['queues', 'backpressure', 'asynchronous-processing', 'durable-queues']),
  'relational-database': Object.freeze(['databases', 'database-indexing', 'read-replication', 'replication-lag']),
  'social-feed': Object.freeze(['read-models', 'caching', 'eventual-consistency', 'workload-skew']),
  'realtime-messaging': Object.freeze(['real-time', 'messaging', 'message-ordering', 'connection-lifecycle']),
  'video-pipeline': Object.freeze(['storage', 'asynchronous-processing', 'durable-queues', 'cdn-caching']),
  'geospatial-dispatch': Object.freeze(['data-partitioning', 'workload-skew', 'caching', 'loadbalancing']),
  'url-shortener': Object.freeze(['http-cacheability', 'cache-aside', 'data-partitioning', 'idempotency']),
  'rate-limiter': Object.freeze(['rate-limiting', 'backpressure', 'workload-skew', 'latency-budgets']),
  'object-storage': Object.freeze(['storage', 'data-partitioning', 'conditional-writes', 'optimistic-concurrency', 'eventual-consistency']),
  'notification-fanout': Object.freeze(['asynchronous-processing', 'durable-queues', 'backpressure', 'idempotency', 'rate-limiting']),
  'search-autocomplete': Object.freeze(['database-indexing', 'caching', 'read-models', 'data-partitioning', 'content-freshness']),
  'distributed-kv': Object.freeze(['data-partitioning', 'distributed-databases', 'quorum-commit', 'eventual-consistency', 'workload-skew']),
  'consistent-hashing': Object.freeze(['consistent-hashing', 'sharding', 'caching', 'loadbalancing', 'data-partitioning']),
  'load-balancer': Object.freeze(['loadbalancing', 'consistent-hashing', 'reverse-proxy', 'latency-budgets']),
  'api-gateway': Object.freeze(['api-gateway', 'rate-limiting', 'reverse-proxy', 'api-design']),
  'reverse-proxy': Object.freeze(['reverse-proxy', 'loadbalancing', 'http-https', 'connection-lifecycle']),
  'cdn': Object.freeze(['cdn', 'caching', 'cdn-caching', 'content-freshness']),
  'websockets': Object.freeze(['websockets', 'connection-lifecycle', 'real-time', 'http-https']),
  'database-sharding': Object.freeze(['sharding', 'data-partitioning', 'databases', 'workload-skew']),
  'replication': Object.freeze(['replication', 'read-replication', 'replication-lag', 'databases'])
});

/* Generated sandboxes use a deliberately small, application-owned parameter
   vocabulary. AI can choose labels and situation values, but it cannot add a
   control, formula, or executable behavior. */
const GENERATED_SANDBOX_SCHEMA_VERSION = 1;
const GENERATED_SANDBOX_MODEL_KIND = 'bounded-pressure';
const GENERATED_SANDBOX_TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERATED_SANDBOX_CONTROL_SPECS = Object.freeze({
  arrivalRate: Object.freeze({ min: 1, max: 100000, step: 1, unit: 'req/s', default: 1000 }),
  capacity: Object.freeze({ min: 10, max: 200000, step: 10, unit: 'work/s', default: 10000 }),
  workMultiplier: Object.freeze({ min: 1, max: 10, step: 0.1, unit: 'x', default: 1 }),
  absorptionRate: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 50 }),
  retryRate: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 0 }),
  skew: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 0 })
});
const GENERATED_SANDBOX_PROBLEM_SPECS = Object.freeze({
  'keep-up': Object.freeze({
    label: 'Keep up with demand',
    evidenceKeys: Object.freeze(['offeredWorkRps', 'effectiveWorkRps', 'effectiveCapacityRps', 'backlogWork'])
  }),
  'protect-latency': Object.freeze({
    label: 'Protect user-visible latency',
    evidenceKeys: Object.freeze(['estimatedP95LatencyMs', 'utilizationPct', 'backlogWork', 'effectiveWorkRps'])
  }),
  'avoid-amplification': Object.freeze({
    label: 'Avoid pressure amplification',
    evidenceKeys: Object.freeze(['retryWorkRps', 'offeredWorkRps', 'effectiveWorkRps', 'backlogWork'])
  }),
  'find-concentration': Object.freeze({
    label: 'Find concentrated pressure',
    evidenceKeys: Object.freeze(['skew', 'effectiveCapacityRps', 'utilizationPct', 'backlogWork'])
  })
});
const GENERATED_SANDBOX_PROBLEM_IDS = Object.freeze(Object.keys(GENERATED_SANDBOX_PROBLEM_SPECS));
const GENERATED_SANDBOX_PREDICTION_IDS = Object.freeze(['healthy', 'watch', 'stress']);

const DEFAULT_SANDBOX_LEARNER_PROBLEMS = Object.freeze([
  Object.freeze({
    id: 'keep-up',
    question: 'Can this path keep up as demand grows?',
    explanation: 'Compare incoming work with the capacity that can actually process it before backlog grows.',
    evidenceKeys: Object.freeze([])
  }),
  Object.freeze({
    id: 'protect-latency',
    question: 'Where does user-visible delay appear first?',
    explanation: 'Watch utilization, waiting work, or lag to find the point where a healthy-looking path becomes slow.',
    evidenceKeys: Object.freeze([])
  }),
  Object.freeze({
    id: 'avoid-amplification',
    question: 'Do failures or extra work amplify pressure?',
    explanation: 'Retries and repeated processing can add load to the same constrained path when recovery is not bounded.',
    evidenceKeys: Object.freeze([])
  }),
  Object.freeze({
    id: 'find-concentration',
    question: 'Can one partition or key become the real limit?',
    explanation: 'Aggregate capacity can hide skew, so inspect the hottest slice instead of trusting only the average.',
    evidenceKeys: Object.freeze([])
  })
]);

function generatedSandboxText(value, field, min, max) {
  if (typeof value !== 'string') throw new Error(`Invalid field: ${field}`);
  const text = value.trim();
  if (text.length < min || text.length > max
      || /[\u0000-\u001f\u007f]/.test(text)
      || /<[^>]*>|(?:javascript:|https?:\/\/)|\b(?:function|return|eval)\b|=>/i.test(text)) {
    throw new Error(`Invalid field: ${field}`);
  }
  return text;
}

function generatedSandboxDecimalPlaces(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function generatedSandboxValue(value, key, field, strict = true) {
  const spec = GENERATED_SANDBOX_CONTROL_SPECS[key];
  const number = (typeof value === 'number' || (typeof value === 'string' && value.trim()))
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(number)) {
    if (strict) throw new Error(`Invalid field: ${field}`);
    return spec.default;
  }
  if (strict && (number < spec.min || number > spec.max)) throw new Error(`Invalid field: ${field}`);
  const bounded = Math.min(spec.max, Math.max(spec.min, number));
  const decimals = generatedSandboxDecimalPlaces(spec.step);
  const rounded = Number(bounded.toFixed(decimals));
  const steps = Math.round((rounded - spec.min) / spec.step);
  const stepped = Number((spec.min + steps * spec.step).toFixed(decimals));
  if (strict && Math.abs(rounded - stepped) > 1e-8) throw new Error(`Invalid field: ${field}`);
  return stepped;
}

function validateGeneratedSandboxDefinition(raw, expectedTopic = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Generated sandbox must be an object');
  const topic = raw.topic;
  if (typeof topic !== 'string' || !GENERATED_SANDBOX_TOPIC_RE.test(topic) || topic.length > 80
      || (expectedTopic && topic !== expectedTopic)) throw new Error('Invalid generated sandbox topic');
  if (raw.schemaVersion !== GENERATED_SANDBOX_SCHEMA_VERSION
      || raw.modelKind !== GENERATED_SANDBOX_MODEL_KIND || raw.generated !== true
      || raw.id !== `generated-${topic}`) throw new Error('Invalid generated sandbox metadata');

  if (!Array.isArray(raw.controls) || raw.controls.length < 3 || raw.controls.length > 5) {
    throw new Error('Invalid generated sandbox controls');
  }
  const keys = new Set();
  const controls = raw.controls.map((control, index) => {
    if (!control || typeof control !== 'object'
        || !Object.prototype.hasOwnProperty.call(GENERATED_SANDBOX_CONTROL_SPECS, control.key)
        || keys.has(control.key)) throw new Error(`Invalid generated sandbox control ${index}`);
    keys.add(control.key);
    const spec = GENERATED_SANDBOX_CONTROL_SPECS[control.key];
    return {
      key: control.key,
      label: generatedSandboxText(control.label, `controls[${index}].label`, 2, 60),
      unit: spec.unit,
      advanced: Boolean(control.advanced)
    };
  });
  if (!keys.has('arrivalRate') || !keys.has('capacity')) throw new Error('Generated sandbox needs arrivalRate and capacity');

  if (!Array.isArray(raw.learnerProblems)
      || raw.learnerProblems.length < 3
      || raw.learnerProblems.length > GENERATED_SANDBOX_PROBLEM_IDS.length) {
    throw new Error('Invalid generated sandbox learner problems');
  }
  const problemIds = new Set();
  const learnerProblems = raw.learnerProblems.map((problem, index) => {
    if (!problem || typeof problem !== 'object'
        || !GENERATED_SANDBOX_PROBLEM_IDS.includes(problem.id)
        || problemIds.has(problem.id)) {
      throw new Error(`Invalid generated sandbox learner problem ${index}`);
    }
    problemIds.add(problem.id);
    const allowedEvidence = GENERATED_SANDBOX_PROBLEM_SPECS[problem.id].evidenceKeys;
    if (!Array.isArray(problem.evidenceKeys)
        || problem.evidenceKeys.length < 2
        || problem.evidenceKeys.length > 3) {
      throw new Error(`Invalid generated sandbox learner problem evidence ${index}`);
    }
    const evidenceKeys = [...new Set(problem.evidenceKeys)];
    if (evidenceKeys.length !== problem.evidenceKeys.length
        || evidenceKeys.some(key => !allowedEvidence.includes(key))) {
      throw new Error(`Invalid generated sandbox learner problem evidence ${index}`);
    }
    if (evidenceKeys.includes('skew') && !keys.has('skew')) {
      throw new Error(`Invalid generated sandbox learner problem evidence ${index}`);
    }
    return {
      id: problem.id,
      question: generatedSandboxText(problem.question, `learnerProblems[${index}].question`, 25, 180),
      explanation: generatedSandboxText(problem.explanation, `learnerProblems[${index}].explanation`, 30, 220),
      evidenceKeys
    };
  });

  if (!Array.isArray(raw.situations) || raw.situations.length !== 5) throw new Error('Invalid generated sandbox situations');
  const situationIds = new Set();
  const controlKeys = controls.map(control => control.key);
  const situations = raw.situations.map((situation, index) => {
    if (!situation || typeof situation !== 'object' || situation.level !== index + 1
        || typeof situation.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(situation.id)
        || situationIds.has(situation.id)) throw new Error(`Invalid generated sandbox situation ${index}`);
    situationIds.add(situation.id);
    if (!situation.values || typeof situation.values !== 'object' || Array.isArray(situation.values)) {
      throw new Error(`Invalid generated sandbox situation values ${index}`);
    }
    const valueKeys = Object.keys(situation.values);
    if (valueKeys.length !== controlKeys.length || valueKeys.some(key => !controlKeys.includes(key))) {
      throw new Error(`Invalid generated sandbox situation values ${index}`);
    }
    const values = Object.fromEntries(controlKeys.map(key => [
      key,
      generatedSandboxValue(situation.values[key], key, `situations[${index}].values.${key}`)
    ]));
    return {
      id: situation.id,
      label: generatedSandboxText(situation.label, `situations[${index}].label`, 2, 60),
      level: index + 1,
      description: generatedSandboxText(situation.description, `situations[${index}].description`, 20, 220),
      objective: generatedSandboxText(situation.objective, `situations[${index}].objective`, 20, 220),
      focusProblemId: (() => {
        if (!problemIds.has(situation.focusProblemId)) {
          throw new Error(`Invalid generated sandbox focus problem ${index}`);
        }
        return situation.focusProblemId;
      })(),
      values
    };
  });

  if (!Array.isArray(raw.predictionOptions) || raw.predictionOptions.length !== GENERATED_SANDBOX_PREDICTION_IDS.length) {
    throw new Error('Invalid generated sandbox predictions');
  }
  const predictionOptions = GENERATED_SANDBOX_PREDICTION_IDS.map(id => {
    const option = raw.predictionOptions.find(item => item?.id === id);
    if (!option) throw new Error(`Missing generated sandbox prediction ${id}`);
    return { id, label: generatedSandboxText(option.label, `predictionOptions.${id}.label`, 8, 120) };
  });
  if (!Array.isArray(raw.assumptions) || raw.assumptions.length < 3 || raw.assumptions.length > 6) {
    throw new Error('Invalid generated sandbox assumptions');
  }

  return {
    schemaVersion: GENERATED_SANDBOX_SCHEMA_VERSION,
    modelKind: GENERATED_SANDBOX_MODEL_KIND,
    generated: true,
    id: `generated-${topic}`,
    topic,
    label: generatedSandboxText(raw.label, 'label', 2, 60),
    description: generatedSandboxText(raw.description, 'description', 30, 260),
    predictionQuestion: generatedSandboxText(raw.predictionQuestion, 'predictionQuestion', 20, 180),
    controls,
    learnerProblems,
    situations,
    predictionOptions,
    assumptions: raw.assumptions.map((assumption, index) =>
      generatedSandboxText(assumption, `assumptions[${index}]`, 20, 240)
    )
  };
}

function generatedSandboxInputValue(values, key) {
  return Number(values[key] ?? GENERATED_SANDBOX_CONTROL_SPECS[key].default);
}

function normalizeGeneratedSandboxInput(definition, input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(definition.controls.map(control => [
    control.key,
    generatedSandboxValue(source[control.key], control.key, control.key, false)
  ]));
}

function generatedSandboxPressure(definition, input = {}) {
  const values = normalizeGeneratedSandboxInput(definition, input);
  const arrivalRate = generatedSandboxInputValue(values, 'arrivalRate');
  const capacity = generatedSandboxInputValue(values, 'capacity');
  const workMultiplier = generatedSandboxInputValue(values, 'workMultiplier');
  const absorptionRate = generatedSandboxInputValue(values, 'absorptionRate');
  const retryRate = generatedSandboxInputValue(values, 'retryRate');
  const skew = generatedSandboxInputValue(values, 'skew');
  const baseWorkRps = arrivalRate * workMultiplier;
  const retryWorkRps = baseWorkRps * retryRate / 100;
  const offeredWorkRps = baseWorkRps + retryWorkRps;
  const absorbedWorkRps = offeredWorkRps * absorptionRate / 100;
  const effectiveWorkRps = offeredWorkRps - absorbedWorkRps;
  const effectiveCapacityRps = capacity / (1 + skew / 100);
  const utilization = effectiveWorkRps / effectiveCapacityRps;
  const backlogWork = Math.max(0, effectiveWorkRps - effectiveCapacityRps) * 10;
  const processedWorkRps = Math.min(effectiveWorkRps, effectiveCapacityRps);
  const estimatedP95LatencyMs = 20
    + Math.max(0, utilization - 0.6) * 120
    + backlogWork / Math.max(1, effectiveCapacityRps) * 10;
  let status = 'healthy';
  if (utilization >= 1 || backlogWork > capacity * 0.5) status = 'stress';
  else if (utilization >= 0.75 || retryRate >= 20 || skew >= 50) status = 'watch';
  let primaryRisk = 'none';
  if (utilization >= 1) primaryRisk = 'capacity';
  else if (retryRate >= 20) primaryRisk = 'retries';
  else if (skew >= 50) primaryRisk = 'skew';
  else if (absorptionRate >= 75) primaryRisk = 'absorption';
  const teachingConclusion = {
    none: 'The modeled node has headroom: effective work stays below its available capacity.',
    capacity: 'The first constraint is capacity. Once effective work outruns the node, waiting work and latency rise together.',
    retries: 'Retries are additional work. Without a bound or backoff, a dependency failure can amplify pressure on the same node.',
    skew: 'Aggregate capacity can hide concentration. Skew makes the hottest partition or key the practical constraint first.',
    absorption: 'Local handling absorbs most offered work in this model, reducing the pressure that reaches the node.'
  }[primaryRisk];
  return {
    modelVersion: `generated-v${GENERATED_SANDBOX_SCHEMA_VERSION}`,
    input: values,
    baseWorkRps: sandboxRounded(baseWorkRps),
    retryWorkRps: sandboxRounded(retryWorkRps),
    offeredWorkRps: sandboxRounded(offeredWorkRps),
    absorbedWorkRps: sandboxRounded(absorbedWorkRps),
    effectiveWorkRps: sandboxRounded(effectiveWorkRps),
    effectiveCapacityRps: sandboxRounded(effectiveCapacityRps),
    processedWorkRps: sandboxRounded(processedWorkRps),
    utilizationPct: sandboxRounded(utilization * 100),
    backlogWork: sandboxRounded(backlogWork),
    estimatedP95LatencyMs: sandboxRounded(estimatedP95LatencyMs),
    status,
    statusLabel: { healthy: 'Healthy model', watch: 'Watch the bottleneck', stress: 'Stress state' }[status],
    primaryRisk,
    observations: [
      `${sandboxFormatNumber(baseWorkRps)} work/s is offered before absorption and retries are accounted for.`,
      `${sandboxFormatNumber(effectiveWorkRps)} effective work/s reaches a node with ${sandboxFormatNumber(effectiveCapacityRps)} work/s of modeled capacity.`,
      `${sandboxFormatNumber(processedWorkRps)} work/s is processed while ${sandboxFormatNumber(backlogWork)} work units are held across a 10-second teaching window.`
    ],
    teachingConclusion,
    assumptions: [
      ...definition.assumptions,
      'The application-owned pressure model treats capacity, absorption, retries, and skew as bounded teaching signals.'
    ]
  };
}

function generatedSandboxPredictionBucket(definition, input = {}) {
  return generatedSandboxPressure(definition, input).status;
}

function buildGeneratedSimulationDiagram(result, definition) {
  const input = result.input;
  const pressureTone = result.status === 'stress' ? 'stress' : result.status === 'watch' ? 'watch' : 'healthy';
  return {
    title: `${definition.label} pressure path`,
    windowLabel: 'Per-second teaching flow',
    caption: `${sandboxFormatNumber(result.effectiveWorkRps)} effective work/s reaches the generated pressure model after absorption and retries.`,
    stages: [
      sandboxFlowStage('arrival', 'Incoming work', sandboxFormatNumber(input.arrivalRate), 'req/s', `${sandboxFormatNumber(input.workMultiplier ?? 1)}x work multiplier`, 'neutral'),
      sandboxFlowStage('pressure', 'Effective demand', sandboxFormatNumber(result.effectiveWorkRps), 'work/s', `${sandboxFormatNumber(result.absorbedWorkRps)} work/s absorbed locally`, pressureTone),
      sandboxFlowStage('node', 'Modeled node', sandboxFormatNumber(result.effectiveCapacityRps), 'capacity/s', `${sandboxFormatNumber(result.utilizationPct, 0)}% utilized`, pressureTone)
    ],
    outcomes: [
      sandboxFlowOutcome('absorbed', 'Absorbed locally', sandboxFormatNumber(result.absorbedWorkRps), 'work/s', 'The absorption assumption keeps this work off the modeled node.', result.absorbedWorkRps > 0 ? 'healthy' : 'neutral'),
      sandboxFlowOutcome('processed', 'Processed', sandboxFormatNumber(result.processedWorkRps), 'work/s', 'The node handles work within its modeled capacity.', pressureTone),
      sandboxFlowOutcome('backlog', 'Backlog', sandboxFormatNumber(result.backlogWork), 'work units', 'Excess effective work waits in the teaching window.', result.backlogWork > 0 ? pressureTone : 'healthy')
    ],
    callout: result.teachingConclusion,
    ariaLabel: `${definition.label} transforms ${sandboxFormatNumber(result.effectiveWorkRps)} effective work per second into ${sandboxFormatNumber(result.processedWorkRps)} processed work per second and ${sandboxFormatNumber(result.backlogWork)} backlog work units.`
  };

}

function createGeneratedSandboxModel(rawDefinition) {
  const definition = validateGeneratedSandboxDefinition(rawDefinition, rawDefinition?.topic || '');
  const inputMetrics = ['arrivalRate', 'capacity'].map(key => definition.controls.find(control => control.key === key)).map(control => ({
    label: control.label,
    key: control.key,
    source: 'input',
    unit: control.unit
  }));
  const model = {
    id: definition.id,
    label: `Generated · ${definition.label}`,
    description: definition.description,
    wikiTopics: [definition.topic],
    generated: true,
    sourceConcept: definition.topic,
    modelKind: definition.modelKind,
    predictionQuestion: definition.predictionQuestion,
    learnerProblems: definition.learnerProblems,
    metrics: [
      ...inputMetrics,
      { label: 'Effective work', key: 'effectiveWorkRps', unit: 'work/s' },
      { label: 'Node utilization', key: 'utilizationPct', unit: '%' },
      { label: 'Backlog', key: 'backlogWork', unit: 'work' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: Object.fromEntries(definition.controls.map(control => [
      control.key,
      GENERATED_SANDBOX_CONTROL_SPECS[control.key]
    ])),
    controls: definition.controls,
    situations: definition.situations,
    flowPreview: ['Incoming work', 'Pressure model', 'Modeled outcome'],
    predictionOptions: definition.predictionOptions,
    defaults: definition.situations[0].values,
    assumptions: definition.assumptions,
    normalize: input => normalizeGeneratedSandboxInput(definition, input),
    simulate: input => generatedSandboxPressure(definition, input),
    predictionBucket: input => generatedSandboxPredictionBucket(definition, input),
    diagram: result => buildGeneratedSimulationDiagram(result, definition)
  };
  return Object.freeze(model);
}

function registerGeneratedSandboxModel(rawDefinition) {
  const definition = validateGeneratedSandboxDefinition(rawDefinition, rawDefinition?.topic || '');
  const model = createGeneratedSandboxModel(definition);
  const existingIndex = SANDBOX_NODE_MODELS.findIndex(candidate => candidate.id === model.id);
  if (existingIndex >= 0 && !SANDBOX_NODE_MODELS[existingIndex].generated) {
    throw new Error('Generated sandbox id collides with a reviewed model');
  }
  if (existingIndex >= 0) SANDBOX_NODE_MODELS.splice(existingIndex, 1, model);
  else SANDBOX_NODE_MODELS.push(model);
  return model;
}

const POPULAR_SANDBOX_MODELS = Object.freeze([
  createInterviewSandboxModel({
    id: 'social-feed',
    label: 'Social feed',
    description: 'Explore fan-out on write/read, timeline caches, and celebrity skew.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['social-feed'],
    interviewExamples: ['Twitter/X', 'Instagram', 'Facebook News Feed'],
    popularityRank: 1,
    predictionQuestion: 'Which feed path becomes the first constraint?',
    metrics: [
      { label: 'Fan-out writes', key: 'fanoutWritesRps', unit: '/s' },
      { label: 'Timeline cache hits', key: 'timelineCacheHitsRps', unit: '/s' },
      { label: 'Fan-out utilization', key: 'fanoutUtilizationPct', unit: '%' },
      { label: 'Celebrity merges', key: 'celebrityMergeRps', unit: '/s' },
      { label: 'Read utilization', key: 'readUtilizationPct', unit: '%' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: SOCIAL_FEED_SANDBOX_LIMITS,
    controls: SOCIAL_FEED_SANDBOX_CONTROLS,
    situations: SOCIAL_FEED_SANDBOX_SITUATIONS,
    flowPreview: ['Posts and reads', 'Fan-out strategy', 'Timeline read'],
    predictionOptions: SOCIAL_FEED_PREDICTION_OPTIONS,
    defaults: SOCIAL_FEED_SANDBOX_DEFAULTS,
    simulate: simulateSocialFeed,
    predictionBucket: socialFeedPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'realtime-messaging',
    label: 'Realtime messaging',
    description: 'Explore persistent connections, delivery fan-out, offline queues, and history.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['realtime-messaging'],
    interviewExamples: ['WhatsApp', 'Chat', 'Live comments'],
    popularityRank: 2,
    predictionQuestion: 'Where does message delivery pressure accumulate?',
    metrics: [
      { label: 'Delivery attempts', key: 'deliveryAttemptsRps', unit: '/s' },
      { label: 'Live deliveries', key: 'onlineDeliveryRps', unit: '/s' },
      { label: 'Connection utilization', key: 'connectionUtilizationPct', unit: '%' },
      { label: 'Delivery utilization', key: 'deliveryUtilizationPct', unit: '%' },
      { label: 'Offline backlog', key: 'offlineBacklog', unit: 'messages' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: REALTIME_MESSAGING_SANDBOX_LIMITS,
    controls: REALTIME_MESSAGING_SANDBOX_CONTROLS,
    situations: REALTIME_MESSAGING_SANDBOX_SITUATIONS,
    flowPreview: ['Sender messages', 'Connection router', 'Recipient delivery'],
    predictionOptions: REALTIME_MESSAGING_PREDICTION_OPTIONS,
    defaults: REALTIME_MESSAGING_SANDBOX_DEFAULTS,
    simulate: simulateRealtimeMessaging,
    predictionBucket: realtimeMessagingPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'video-pipeline',
    label: 'Video pipeline',
    description: 'Explore uploads, asynchronous transcoding, CDN hits, and origin egress.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['video-pipeline'],
    interviewExamples: ['YouTube', 'Video streaming'],
    popularityRank: 3,
    predictionQuestion: 'Does upload processing or playback egress become the constraint?',
    metrics: [
      { label: 'Transcode work', key: 'transcodeWorkVideoMinPerSec', unit: 'video-min/s' },
      { label: 'Processing utilization', key: 'processingUtilizationPct', unit: '%' },
      { label: 'Processing backlog', key: 'processingBacklogVideoMin', unit: 'video-min' },
      { label: 'Origin egress', key: 'originEgressMbps', unit: 'Mbps' },
      { label: 'Origin utilization', key: 'originUtilizationPct', unit: '%' },
      { label: 'Startup p95', key: 'startupLatencyMs', unit: 'ms' }
    ],
    limits: VIDEO_PIPELINE_SANDBOX_LIMITS,
    controls: VIDEO_PIPELINE_SANDBOX_CONTROLS,
    situations: VIDEO_PIPELINE_SANDBOX_SITUATIONS,
    flowPreview: ['Uploads', 'Transcode queue', 'CDN playback'],
    predictionOptions: VIDEO_PIPELINE_PREDICTION_OPTIONS,
    defaults: VIDEO_PIPELINE_SANDBOX_DEFAULTS,
    simulate: simulateVideoPipeline,
    predictionBucket: videoPipelinePredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'geospatial-dispatch',
    label: 'Geospatial dispatch',
    description: 'Explore spatial indexing, hot areas, location freshness, and matching.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['geospatial-dispatch'],
    interviewExamples: ['Uber', 'Google Maps', 'Local delivery'],
    popularityRank: 4,
    predictionQuestion: 'Will locations stay fresh and ride requests find matches?',
    metrics: [
      { label: 'Hot-area updates', key: 'hotAreaUpdatesPerSecond', unit: '/s' },
      { label: 'Hot-area utilization', key: 'hotAreaUtilizationPct', unit: '%' },
      { label: 'Index utilization', key: 'indexUtilizationPct', unit: '%' },
      { label: 'Unmatched rides', key: 'unmatchedRps', unit: '/s' },
      { label: 'Stale locations', key: 'staleLocationPct', unit: '%' },
      { label: 'Matching p95', key: 'matchingP95Ms', unit: 'ms' }
    ],
    limits: GEOSPATIAL_DISPATCH_SANDBOX_LIMITS,
    controls: GEOSPATIAL_DISPATCH_SANDBOX_CONTROLS,
    situations: GEOSPATIAL_DISPATCH_SANDBOX_SITUATIONS,
    flowPreview: ['Driver locations and rides', 'Geo index', 'Matching / dispatch'],
    predictionOptions: GEOSPATIAL_DISPATCH_PREDICTION_OPTIONS,
    defaults: GEOSPATIAL_DISPATCH_SANDBOX_DEFAULTS,
    simulate: simulateGeospatialDispatch,
    predictionBucket: geospatialDispatchPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'url-shortener',
    label: 'URL shortener',
    description: 'Explore unique IDs, read-heavy redirects, mapping writes, and cacheability.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['url-shortener'],
    interviewExamples: ['Bitly'],
    popularityRank: 5,
    predictionQuestion: 'Do redirects stay cached or hit a mapping bottleneck?',
    metrics: [
      { label: 'Cache hits', key: 'cacheHitsRps', unit: '/s' },
      { label: 'Mapping lookups', key: 'mappingLookupRps', unit: '/s' },
      { label: 'Redirect utilization', key: 'redirectUtilizationPct', unit: '%' },
      { label: 'Creation utilization', key: 'creationUtilizationPct', unit: '%' },
      { label: 'Code-space pressure', key: 'collisionPressurePct', unit: '%' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: URL_SHORTENER_SANDBOX_LIMITS,
    controls: URL_SHORTENER_SANDBOX_CONTROLS,
    situations: URL_SHORTENER_SANDBOX_SITUATIONS,
    flowPreview: ['Link requests', 'Redirect cache', 'Mapping store'],
    predictionOptions: URL_SHORTENER_PREDICTION_OPTIONS,
    defaults: URL_SHORTENER_SANDBOX_DEFAULTS,
    simulate: simulateUrlShortener,
    predictionBucket: urlShortenerPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'rate-limiter',
    label: 'Rate limiter',
    description: 'Explore token buckets, bursts, per-client skew, and shared decisions.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['rate-limiter'],
    interviewExamples: ['API rate limiter'],
    popularityRank: 6,
    predictionQuestion: 'Are requests allowed, throttled, or blocked by limiter capacity?',
    metrics: [
      { label: 'Allowance', key: 'admissionCapacityRps', unit: '/s' },
      { label: 'Allowed requests', key: 'allowedRps', unit: '/s' },
      { label: 'Throttled requests', key: 'throttledRps', unit: '/s' },
      { label: 'Decision utilization', key: 'decisionUtilizationPct', unit: '%' },
      { label: 'Hot-client utilization', key: 'hotClientUtilizationPct', unit: '%' },
      { label: 'Estimated p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: RATE_LIMITER_SANDBOX_LIMITS,
    controls: RATE_LIMITER_SANDBOX_CONTROLS,
    situations: RATE_LIMITER_SANDBOX_SITUATIONS,
    flowPreview: ['Client requests', 'Token bucket', 'Service admission'],
    predictionOptions: RATE_LIMITER_PREDICTION_OPTIONS,
    defaults: RATE_LIMITER_SANDBOX_DEFAULTS,
    simulate: simulateRateLimiter,
    predictionBucket: rateLimiterPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'object-storage',
    label: 'Object storage + sync',
    description: 'Explore chunks, deduplication, metadata coordination, egress, and conflicts.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['object-storage'],
    interviewExamples: ['Google Drive', 'Dropbox', 'Pastebin'],
    popularityRank: 7,
    predictionQuestion: 'Do changed bytes, downloads, or conflicts dominate sync?',
    metrics: [
      { label: 'Changed data', key: 'changedMbPerSec', unit: 'MB/s' },
      { label: 'Physical writes', key: 'storedWriteMbPerSec', unit: 'MB/s' },
      { label: 'Deduplicated bytes', key: 'dedupedMbPerSec', unit: 'MB/s' },
      { label: 'Egress', key: 'egressMbPerSec', unit: 'MB/s' },
      { label: 'Metadata utilization', key: 'metadataUtilizationPct', unit: '%' },
      { label: 'Sync conflicts', key: 'conflictsPerMin', unit: '/min' }
    ],
    limits: OBJECT_STORAGE_SANDBOX_LIMITS,
    controls: OBJECT_STORAGE_SANDBOX_CONTROLS,
    situations: OBJECT_STORAGE_SANDBOX_SITUATIONS,
    flowPreview: ['Client chunks', 'Object store', 'CDN / metadata'],
    predictionOptions: OBJECT_STORAGE_PREDICTION_OPTIONS,
    defaults: OBJECT_STORAGE_SANDBOX_DEFAULTS,
    simulate: simulateObjectStorage,
    predictionBucket: objectStoragePredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'notification-fanout',
    label: 'Notification fanout',
    description: 'Explore preferences, channel queues, provider limits, retries, and drops.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['notification-fanout'],
    interviewExamples: ['Notification system'],
    popularityRank: 8,
    predictionQuestion: 'Do providers deliver the fan-out or do retries and queues grow?',
    metrics: [
      { label: 'Eligible deliveries', key: 'eligibleDeliveriesRps', unit: '/s' },
      { label: 'Channel deliveries', key: 'channelDeliveriesRps', unit: '/s' },
      { label: 'Retry work', key: 'retryRps', unit: '/s' },
      { label: 'Provider utilization', key: 'providerUtilizationPct', unit: '%' },
      { label: 'Queued deliveries', key: 'queuedDeliveries', unit: 'deliveries' },
      { label: 'Dropped notifications', key: 'droppedRps', unit: '/s' }
    ],
    limits: NOTIFICATION_FANOUT_SANDBOX_LIMITS,
    controls: NOTIFICATION_FANOUT_SANDBOX_CONTROLS,
    situations: NOTIFICATION_FANOUT_SANDBOX_SITUATIONS,
    flowPreview: ['Product event', 'Channel queues', 'Providers'],
    predictionOptions: NOTIFICATION_FANOUT_PREDICTION_OPTIONS,
    defaults: NOTIFICATION_FANOUT_SANDBOX_DEFAULTS,
    simulate: simulateNotificationFanout,
    predictionBucket: notificationFanoutPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'search-autocomplete',
    label: 'Search autocomplete',
    description: 'Explore prefix caches, trie lookups, index rebuild lag, and memory.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['search-autocomplete'],
    interviewExamples: ['Typeahead', 'Search suggestions'],
    popularityRank: 9,
    predictionQuestion: 'Does the prefix cache absorb queries or does the index become the bottleneck?',
    metrics: [
      { label: 'Cache hits', key: 'cacheHitsRps', unit: '/s' },
      { label: 'Trie lookups', key: 'trieLookupRps', unit: '/s' },
      { label: 'Index memory', key: 'indexMemoryMb', unit: 'MB' },
      { label: 'Query utilization', key: 'queryUtilizationPct', unit: '%' },
      { label: 'Rebuild lag', key: 'rebuildLagSec', unit: 's' },
      { label: 'Hot-prefix utilization', key: 'hotPrefixUtilizationPct', unit: '%' }
    ],
    limits: SEARCH_AUTOCOMPLETE_SANDBOX_LIMITS,
    controls: SEARCH_AUTOCOMPLETE_SANDBOX_CONTROLS,
    situations: SEARCH_AUTOCOMPLETE_SANDBOX_SITUATIONS,
    flowPreview: ['Keystrokes', 'Prefix index', 'Ranked suggestions'],
    predictionOptions: SEARCH_AUTOCOMPLETE_PREDICTION_OPTIONS,
    defaults: SEARCH_AUTOCOMPLETE_SANDBOX_DEFAULTS,
    simulate: simulateSearchAutocomplete,
    predictionBucket: searchAutocompletePredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'distributed-kv',
    label: 'Distributed key-value store',
    description: 'Explore partitioning, replication, quorums, hot shards, and repair.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['distributed-kv'],
    interviewExamples: ['Key-value store', 'DynamoDB-style storage'],
    popularityRank: 10,
    predictionQuestion: 'Will sharding, quorum cost, or hot-key repair become the constraint?',
    metrics: [
      { label: 'Quorum read work', key: 'quorumReadWorkRps', unit: '/s' },
      { label: 'Replicated write work', key: 'replicatedWriteWorkRps', unit: '/s' },
      { label: 'Hot-shard utilization', key: 'hotShardUtilizationPct', unit: '%' },
      { label: 'Repair backlog', key: 'repairBacklog', unit: 'ops' },
      { label: 'Repair utilization', key: 'repairUtilizationPct', unit: '%' },
      { label: 'Quorum p95', key: 'estimatedP95LatencyMs', unit: 'ms' }
    ],
    limits: DISTRIBUTED_KV_SANDBOX_LIMITS,
    controls: DISTRIBUTED_KV_SANDBOX_CONTROLS,
    situations: DISTRIBUTED_KV_SANDBOX_SITUATIONS,
    flowPreview: ['Key requests', 'Partition ring', 'Replica quorum'],
    predictionOptions: DISTRIBUTED_KV_PREDICTION_OPTIONS,
    defaults: DISTRIBUTED_KV_SANDBOX_DEFAULTS,
    simulate: simulateDistributedKv,
    predictionBucket: distributedKvPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'consistent-hashing',
    label: 'Consistent hashing',
    description: 'Explore ring balance, virtual nodes, scale-out churn, and hot keys.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['consistent-hashing'],
    interviewExamples: ['Distributed cache', 'Sharded store rebalancing'],
    popularityRank: 11,
    predictionQuestion: 'Will growth relocate many keys, or will balance or hot keys dominate?',
    metrics: [
      { label: 'Keys relocated', key: 'keysMovedPct', unit: '%' },
      { label: 'Balance quality', key: 'balanceQualityPct', unit: '%' },
      { label: 'Ring positions', key: 'ringPositions', unit: 'positions' },
      { label: 'Hot keys', key: 'hotKeys', unit: 'keys' },
      { label: 'Keys per node', key: 'keysPerNode', unit: 'keys' }
    ],
    limits: CONSISTENT_HASHING_SANDBOX_LIMITS,
    controls: CONSISTENT_HASHING_SANDBOX_CONTROLS,
    situations: CONSISTENT_HASHING_SANDBOX_SITUATIONS,
    flowPreview: ['Keys', 'Hash ring', 'Nodes'],
    predictionOptions: CONSISTENT_HASHING_PREDICTION_OPTIONS,
    defaults: CONSISTENT_HASHING_SANDBOX_DEFAULTS,
    simulate: simulateConsistentHashing,
    predictionBucket: consistentHashingPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'load-balancer',
    label: 'Load balancer',
    description: 'Explore request cost, variance, hot clients, and fleet saturation.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['load-balancer'],
    interviewExamples: ['Web fleet', 'API gateway front-end'],
    popularityRank: 12,
    predictionQuestion: 'Will routing stay balanced, or will skew or saturation win?',
    metrics: [
      { label: 'Fleet utilization', key: 'utilizationPct', unit: '%' },
      { label: 'Hot server', key: 'hotServerUtilizationPct', unit: '%' },
      { label: 'Hot client', key: 'hotClientRps', unit: '/s' },
      { label: 'Per-server load', key: 'perServerRps', unit: '/s' },
      { label: 'Per-server capacity', key: 'capacityPerServerRps', unit: '/s' }
    ],
    limits: LOAD_BALANCER_SANDBOX_LIMITS,
    controls: LOAD_BALANCER_SANDBOX_CONTROLS,
    situations: LOAD_BALANCER_SANDBOX_SITUATIONS,
    flowPreview: ['Client requests', 'Load balancer', 'Server fleet'],
    predictionOptions: LOAD_BALANCER_PREDICTION_OPTIONS,
    defaults: LOAD_BALANCER_SANDBOX_DEFAULTS,
    simulate: simulateLoadBalancer,
    predictionBucket: loadBalancerPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'api-gateway',
    label: 'API gateway',
    description: 'Explore routing overhead, policy latency, fan-out, and gateway capacity.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['api-gateway'],
    interviewExamples: ['Microservices gateway', 'Public API front door'],
    popularityRank: 13,
    predictionQuestion: 'Will the gateway stay invisible, or will policy, capacity, or backends dominate?',
    metrics: [
      { label: 'End-to-end latency', key: 'totalLatencyMs', unit: 'ms' },
      { label: 'Gateway overhead', key: 'overheadMs', unit: 'ms' },
      { label: 'Overhead share', key: 'overheadSharePct', unit: '%' },
      { label: 'Gateway utilization', key: 'utilizationPct', unit: '%' },
      { label: 'Per-upstream load', key: 'perUpstreamRps', unit: '/s' }
    ],
    limits: API_GATEWAY_SANDBOX_LIMITS,
    controls: API_GATEWAY_SANDBOX_CONTROLS,
    situations: API_GATEWAY_SANDBOX_SITUATIONS,
    flowPreview: ['Clients', 'Gateway', 'Upstreams'],
    predictionOptions: API_GATEWAY_PREDICTION_OPTIONS,
    defaults: API_GATEWAY_SANDBOX_DEFAULTS,
    simulate: simulateApiGateway,
    predictionBucket: apiGatewayPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'reverse-proxy',
    label: 'Reverse proxy',
    description: 'Explore connection reuse, TLS termination, and backend pool dilution.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['reverse-proxy'],
    interviewExamples: ['NGINX front-end', 'TLS terminator'],
    popularityRank: 14,
    predictionQuestion: 'Will connection reuse keep the path cheap, or will reconnects and TLS dominate?',
    metrics: [
      { label: 'Reconnect cost', key: 'reconnectPerRequestMs', unit: 'ms/req' },
      { label: 'Connection churn', key: 'connectionChurnRps', unit: 'conn/s' },
      { label: 'Per-backend load', key: 'perBackendRps', unit: '/s' },
      { label: 'Reuse miss', key: 'reuseMissPct', unit: '%' }
    ],
    limits: REVERSE_PROXY_SANDBOX_LIMITS,
    controls: REVERSE_PROXY_SANDBOX_CONTROLS,
    situations: REVERSE_PROXY_SANDBOX_SITUATIONS,
    flowPreview: ['Clients', 'Reverse proxy', 'Backends'],
    predictionOptions: REVERSE_PROXY_PREDICTION_OPTIONS,
    defaults: REVERSE_PROXY_SANDBOX_DEFAULTS,
    simulate: simulateReverseProxy,
    predictionBucket: reverseProxyPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'cdn',
    label: 'CDN',
    description: 'Explore edge hit rate, TTL freshness, origin offload, and egress cost.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['cdn'],
    interviewExamples: ['Static asset delivery', 'Video streaming'],
    popularityRank: 15,
    predictionQuestion: 'Will the edge absorb traffic, or will misses, freshness, or egress dominate?',
    metrics: [
      { label: 'Edge hits', key: 'hitRps', unit: '/s' },
      { label: 'Origin misses', key: 'missRps', unit: '/s' },
      { label: 'Origin utilization', key: 'originUtilizationPct', unit: '%' },
      { label: 'Origin offload', key: 'originOffloadPct', unit: '%' }
    ],
    limits: CDN_SANDBOX_LIMITS,
    controls: CDN_SANDBOX_CONTROLS,
    situations: CDN_SANDBOX_SITUATIONS,
    flowPreview: ['Clients', 'Edge cache', 'Origin'],
    predictionOptions: CDN_PREDICTION_OPTIONS,
    defaults: CDN_SANDBOX_DEFAULTS,
    simulate: simulateCdn,
    predictionBucket: cdnPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'websockets',
    label: 'WebSockets',
    description: 'Explore connection memory, message rate, fan-out, and bandwidth.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['websockets'],
    interviewExamples: ['Chat', 'Live collaboration'],
    popularityRank: 16,
    predictionQuestion: 'Will connection memory, message throughput, or fan-out become the constraint?',
    metrics: [
      { label: 'Connection memory', key: 'connectionMemoryMb', unit: 'MB' },
      { label: 'Memory utilization', key: 'memoryUtilizationPct', unit: '%' },
      { label: 'Delivery work', key: 'deliveriesRps', unit: '/s' },
      { label: 'Bandwidth', key: 'bandwidthMbps', unit: 'Mbps' }
    ],
    limits: WEBSOCKETS_SANDBOX_LIMITS,
    controls: WEBSOCKETS_SANDBOX_CONTROLS,
    situations: WEBSOCKETS_SANDBOX_SITUATIONS,
    flowPreview: ['Open connections', 'Connection router', 'Deliveries'],
    predictionOptions: WEBSOCKETS_PREDICTION_OPTIONS,
    defaults: WEBSOCKETS_SANDBOX_DEFAULTS,
    simulate: simulateWebsockets,
    predictionBucket: websocketsPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'database-sharding',
    label: 'Database sharding',
    description: 'Explore shard count, hot shards, cross-shard queries, and capacity.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['database-sharding'],
    interviewExamples: ['Sharded relational store', 'Multi-tenant database'],
    popularityRank: 17,
    predictionQuestion: 'Will shards stay balanced, or will a hot shard or cross-shard work dominate?',
    metrics: [
      { label: 'Per-shard load', key: 'perShardRps', unit: '/s' },
      { label: 'Hottest shard', key: 'hotShardRps', unit: '/s' },
      { label: 'Hot-shard utilization', key: 'hotShardUtilizationPct', unit: '%' },
      { label: 'Cross-shard work', key: 'crossShardRps', unit: '/s' }
    ],
    limits: DATABASE_SHARDING_SANDBOX_LIMITS,
    controls: DATABASE_SHARDING_SANDBOX_CONTROLS,
    situations: DATABASE_SHARDING_SANDBOX_SITUATIONS,
    flowPreview: ['Queries', 'Shard routing', 'Shard nodes'],
    predictionOptions: DATABASE_SHARDING_PREDICTION_OPTIONS,
    defaults: DATABASE_SHARDING_SANDBOX_DEFAULTS,
    simulate: simulateDatabaseSharding,
    predictionBucket: databaseShardingPredictionBucket
  }),
  createInterviewSandboxModel({
    id: 'replication',
    label: 'Replication',
    description: 'Explore sync/async writes, replica lag, stale reads, and write amplification.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['replication'],
    interviewExamples: ['Read replicas', 'Primary-replica database'],
    popularityRank: 18,
    predictionQuestion: 'Will replicas scale reads, or will lag, sync latency, or writes dominate?',
    metrics: [
      { label: 'Replica reads', key: 'readFromReplicasRps', unit: '/s' },
      { label: 'Write amplification', key: 'writeAmplification', unit: 'x' },
      { label: 'Write work', key: 'writeWorkRps', unit: '/s' },
      { label: 'Stale-read window', key: 'staleReadRps', unit: '/s' }
    ],
    limits: REPLICATION_SANDBOX_LIMITS,
    controls: REPLICATION_SANDBOX_CONTROLS,
    situations: REPLICATION_SANDBOX_SITUATIONS,
    flowPreview: ['Writes', 'Primary', 'Replicas'],
    predictionOptions: REPLICATION_PREDICTION_OPTIONS,
    defaults: REPLICATION_SANDBOX_DEFAULTS,
    simulate: simulateReplication,
    predictionBucket: replicationPredictionBucket
  })
]);

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

const SANDBOX_NODE_MODELS = [
  {
    id: 'redis-cache',
    label: 'Redis-like cache',
    description: 'Explore hits, misses, memory, hot keys, and backing-store load.',
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['redis-cache'],
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
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['queue-worker'],
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
    wikiTopics: SANDBOX_WIKI_TOPIC_MAP['relational-database'],
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
  },
  ...POPULAR_SANDBOX_MODELS
];

function getSandboxWikiTopics(nodeId = 'redis-cache') {
  const node = SANDBOX_NODE_MODELS.find(model => model.id === nodeId);
  return node && Array.isArray(node.wikiTopics) ? [...node.wikiTopics] : [];
}

function getSandboxLearnerProblems(nodeId = 'redis-cache') {
  const node = SANDBOX_NODE_MODELS.find(model => model.id === nodeId);
  const problems = node?.generated && Array.isArray(node.learnerProblems)
    ? node.learnerProblems
    : DEFAULT_SANDBOX_LEARNER_PROBLEMS;
  return problems.map(problem => ({
    id: problem.id,
    question: problem.question,
    explanation: problem.explanation,
    evidenceKeys: [...(problem.evidenceKeys || [])]
  }));
}

function getSandboxProblemEvidence(nodeId = 'redis-cache', problemId, result = {}) {
  const node = getSandboxNode(nodeId);
  const problem = getSandboxLearnerProblems(node.id).find(item => item.id === problemId);
  const fallback = (node.metrics || []).slice(0, 3).map(metric => ({
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    source: metric.source === 'input' ? 'input' : 'result'
  }));
  const keys = problem?.evidenceKeys?.length ? problem.evidenceKeys : fallback.map(item => item.key);
  const generatedEvidence = keys.map(key => {
    const spec = Object.values(GENERATED_SANDBOX_PROBLEM_SPECS)
      .flatMap(item => item.evidenceKeys)
      .includes(key)
      ? key
      : null;
    if (!spec) return null;
    const source = key === 'skew' ? 'input' : 'result';
    const labels = {
      offeredWorkRps: ['Offered work', 'work/s'],
      effectiveWorkRps: ['Effective work', 'work/s'],
      effectiveCapacityRps: ['Effective capacity', 'work/s'],
      backlogWork: ['Backlog', 'work units'],
      estimatedP95LatencyMs: ['Estimated p95 latency', 'ms'],
      utilizationPct: ['Node utilization', '%'],
      retryWorkRps: ['Retry work', 'work/s'],
      skew: ['Concentration skew', '%']
    }[key];
    return {
      key,
      label: labels[0],
      unit: labels[1],
      source,
      value: source === 'input' ? result.input?.[key] : result[key]
    };
  }).filter(Boolean);
  if (generatedEvidence.length) return generatedEvidence;
  return fallback.map(item => ({ ...item, value: item.source === 'input' ? result.input?.[item.key] : result[item.key] }));
}

function getSandboxModelsForWikiTopic(topic) {
  const normalizedTopic = String(topic || '').trim().toLowerCase();
  return SANDBOX_NODE_MODELS.filter(model =>
    Array.isArray(model.wikiTopics) && model.wikiTopics.includes(normalizedTopic)
  );
}

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

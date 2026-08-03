export const PRODUCTION_OPTION_PREREQUISITES = {
  "api-design-gen-1785309798717": {
    A: ["database-indexing", "query-cost", "disk-io-latency"],
    B: ["cache-aside", "write-through-caching", "cache-coherence"],
    C: ["ttl-expiry", "asynchronous-invalidation", "stale-reads"],
    D: ["in-memory-storage", "replication-cost", "data-durability"]
  },
  "api-design-gen-1785308031333": {
    A: ["database-bottlenecks", "disk-io-latency", "connection-pooling"],
    B: ["write-through-caching", "asynchronous-updates", "cache-coherence"],
    C: ["vertical-scaling", "capacity-planning", "hardware-cost"],
    D: ["in-memory-storage", "data-durability", "crash-recovery"]
  },
  "caching-gen-1785366879678": {
    A: ["cdn-caching", "cache-invalidation", "content-freshness"],
    B: ["cache-aside", "cache-eviction", "aggregation-latency"],
    C: ["read-replication", "replication-lag", "connection-pooling"],
    D: ["write-through-caching", "write-latency", "cache-coherence"]
  },
  "caching-gen-1785308045999": {
    A: ["write-through-caching", "write-latency", "cache-coherence"],
    B: ["write-behind-caching", "asynchronous-processing", "eventual-consistency"],
    C: ["ttl-expiry", "stale-reads", "content-freshness"],
    D: ["cache-hit-ratio", "replication-cost", "over-provisioning"]
  },
  "consensus-gen-1785308144285": {
    A: ["multi-phase-consensus", "quorum-commit", "cross-datacenter-latency"],
    B: ["leader-election", "log-replication", "write-batching"],
    C: ["eventual-consistency", "conflict-resolution", "serializability"],
    D: ["byzantine-fault-tolerance", "message-complexity", "replica-requirements"]
  },
  "databases-gen-1785307992817": {
    A: ["read-replication", "replication-lag", "write-bottlenecks"],
    B: ["distributed-transactions", "linearizability", "geo-replication"],
    C: ["eventual-consistency", "data-sharding", "write-conflicts"],
    D: ["provisioned-capacity", "capacity-cost", "strong-consistency"]
  },
  "databases-gen-1785311496718": {
    A: ["read-replication", "replication-lag", "read-after-write-consistency"],
    B: ["tunable-consistency", "local-quorum", "hot-key-caching"],
    C: ["vertical-scaling", "connection-pooling", "queueing-latency"],
    D: ["multi-master-replication", "write-conflicts", "conflict-resolution"]
  },
  "observability-gen-1785307943173": {
    A: ["ingestion-cost", "retention-cost", "granularity-vs-cost"],
    B: ["metrics-aggregation", "log-storage", "distributed-tracing"],
    C: ["log-indexing", "query-latency", "default-config-limits"],
    D: ["log-shipping", "correlation-ids", "trace-reconstruction"]
  },
  "observability-gen-1785703525081": {
    A: ["head-based-sampling", "trace-context-propagation", "kafka-buffering", "sampling-bias"],
    B: ["span-storage-cost", "hot-warm-tiering", "trace-id-indexing", "metric-cardinality"],
    C: ["tail-based-sampling", "consistent-hashing", "trace-id-indexing", "metric-cardinality"],
    D: ["probabilistic-sampling", "latency-filtering", "query-latency", "correlation-ids"]
  },
  "queues-gen-1785309937957": {
    A: ["durable-queues", "polling-consumers", "message-loss"],
    B: ["dead-letter-queues", "auto-scaling-workers", "at-least-once-delivery"],
    C: ["consumer-groups", "topic-partitioning", "tail-latency"],
    D: ["table-as-queue", "row-locking", "contention-bottlenecks"]
  },
  "queues-gen-1785307791427": {
    A: ["queue-per-key", "queue-proliferation", "management-overhead"],
    B: ["keyed-partitioning", "partition-ordering", "idempotent-producers"],
    C: ["fifo-queues", "throughput-limits", "ordering-guarantees"],
    D: ["pub-sub-messaging", "message-persistence", "at-least-once-delivery"]
  }
};

export function getOptionPrerequisites(cardId, optionId) {
  const options = PRODUCTION_OPTION_PREREQUISITES[cardId];
  const concepts = options?.[optionId];
  return Array.isArray(concepts) ? [...concepts] : undefined;
}

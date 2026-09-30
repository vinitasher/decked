/* Concept categories — groups the bundled Wiki concepts into domains so the
   Concept Lab index reads as a browsable map instead of one flat cloud.

   Categories are authored by hand and keyed to the topics in js/wiki.js. A
   topic that is lazily added later (and not listed here) falls back to the
   "Other" bucket, so the index never drops a concept. */
const CONCEPT_CATEGORIES = {
  /* API Basics */
  "api-design": "API Basics",
  "client-compatibility": "API Basics",
  "graphql-schemas": "API Basics",
  "grpc-streaming": "API Basics",
  "http-method-semantics": "API Basics",
  "idempotency": "API Basics",
  "mutation-semantics": "API Basics",
  "operation-lifecycle": "API Basics",
  "query-cost-control": "API Basics",
  "rate-limiting": "API Basics",
  "resource-modeling": "API Basics",
  "rest-resources": "API Basics",
  "webhook-callbacks": "API Basics",

  /* Networking */
  "async-io": "Networking",
  "blocking-io": "Networking",
  "connection-lifecycle": "Networking",
  "dns": "Networking",

  /* Databases */
  "asynchronous-replication": "Databases",
  "conditional-writes": "Databases",
  "connection-pooling": "Databases",
  "data-partitioning": "Databases",
  "database-bottlenecks": "Databases",
  "database-indexing": "Databases",
  "database-polling": "Databases",
  "databases": "Databases",
  "deadlocks": "Databases",
  "distributed-databases": "Databases",
  "optimistic-concurrency": "Databases",
  "read-after-write-consistency": "Databases",
  "read-models": "Databases",
  "read-modify-write-races": "Databases",
  "read-replication": "Databases",
  "replication-cost": "Databases",
  "replication-lag": "Databases",
  "row-locking": "Databases",
  "transaction-isolation": "Databases",
  "write-ordering": "Databases",

  /* Caching */
  "cache-aside": "Caching",
  "cache-coherence": "Caching",
  "cache-eviction": "Caching",
  "cache-invalidation": "Caching",
  "caching": "Caching",
  "cdn-caching": "Caching",
  "content-freshness": "Caching",
  "http-cacheability": "Caching",
  "local-caches": "Caching",
  "write-through-caching": "Caching",

  /* Messaging & Queues */
  "backpressure": "Messaging & Queues",
  "competing-consumers": "Messaging & Queues",
  "durable-queues": "Messaging & Queues",
  "fifo-queues": "Messaging & Queues",
  "message-ordering": "Messaging & Queues",
  "message-partitioning": "Messaging & Queues",
  "messaging": "Messaging & Queues",
  "queues": "Messaging & Queues",

  /* Data Processing */
  "asynchronous-processing": "Data Processing",
  "batch-processing": "Data Processing",
  "real-time": "Data Processing",
  "static-site-generation": "Data Processing",

  /* Distributed Systems */
  "consensus": "Distributed Systems",
  "eventual-consistency": "Distributed Systems",
  "gossip-protocols": "Distributed Systems",
  "leader-election": "Distributed Systems",
  "leader-failover": "Distributed Systems",
  "linearizability": "Distributed Systems",
  "quorum-commit": "Distributed Systems",
  "split-brain": "Distributed Systems",

  /* Reliability & Scaling */
  "failure-detection": "Reliability & Scaling",
  "failure-domains": "Reliability & Scaling",
  "latency-budgets": "Reliability & Scaling",
  "loadbalancing": "Reliability & Scaling",
  "serverless-cold-starts": "Reliability & Scaling",
  "single-point-of-failure": "Reliability & Scaling",
  "thread-pools": "Reliability & Scaling",
  "vertical-scaling": "Reliability & Scaling",
  "workload-skew": "Reliability & Scaling",

  /* Storage */
  "shared-filesystems": "Storage",
  "storage": "Storage",

  /* Security & Observability */
  "observability": "Security & Observability",
  "security": "Security & Observability"
};

/* Display order for the index. Categories not listed here (or the "Other"
   fallback) are appended alphabetically after the authored order. */
const CONCEPT_CATEGORY_ORDER = [
  "API Basics",
  "Networking",
  "Databases",
  "Caching",
  "Messaging & Queues",
  "Data Processing",
  "Distributed Systems",
  "Reliability & Scaling",
  "Storage",
  "Security & Observability"
];

function conceptCategory(topic) {
  return CONCEPT_CATEGORIES[topic] || "Other";
}

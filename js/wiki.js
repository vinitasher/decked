/* Auto-generated wiki (80 entries) — see scripts/generate-wiki.mjs */
const WIKI = {
  "api-design": {
    "topic": "api-design",
    "title": "API Design",
    "summary": "API design is the practice of defining the interface and behavior of a service's endpoints, including request/response formats, status codes, and error handling. A well-designed API makes it easy for clients to use correctly and hard to misuse. For example, a REST API for a blog might expose 'GET /posts' to list posts and 'POST /posts' to create one, with clear JSON responses and proper HTTP status codes.",
    "why_it_matters": "Engineers must understand API design because it directly impacts developer experience, system integration, and the long-term maintainability and evolution of the system.",
    "key_points": [
      "Use consistent naming conventions and resource-oriented URLs for REST APIs (e.g., '/users' and '/users/{id}').",
      "Define clear request and response schemas, including data types and required fields, to avoid ambiguity.",
      "Return appropriate HTTP status codes (e.g., 200 OK, 201 Created, 400 Bad Request, 404 Not Found) to indicate success or failure.",
      "Design for backward compatibility by versioning the API (e.g., '/v1/users') and avoiding breaking changes.",
      "Provide comprehensive documentation and examples to help clients integrate quickly and correctly."
    ],
    "common_pitfalls": [
      "Ignoring error handling and returning generic 500 errors instead of meaningful error messages.",
      "Overloading endpoints with too many actions (e.g., using POST for everything) instead of using HTTP methods properly.",
      "Not planning for evolution, leading to breaking changes that force clients to update frequently.",
      "Forgetting about pagination, filtering, and sorting for list endpoints, causing performance and usability issues."
    ],
    "related_topics": [
      "rest",
      "http",
      "microservices",
      "system-design"
    ]
  },
  "async-io": {
    "topic": "async-io",
    "title": "Async I/O",
    "summary": "Async I/O is a way of handling input/output operations (like reading files or network requests) without blocking the main thread of execution. Instead of waiting for the operation to finish, the program continues running other tasks and gets notified when the I/O completes. For example, a web server can handle thousands of concurrent connections by using async I/O to read from sockets without creating a thread per connection.",
    "why_it_matters": "Understanding async I/O is crucial for designing scalable, high-performance systems, as it directly impacts throughput, latency, and resource utilization under load.",
    "key_points": [
      "Async I/O allows a single thread to manage multiple I/O operations simultaneously by using an event loop or callback mechanism.",
      "It avoids blocking the CPU while waiting for slow I/O devices, improving overall system responsiveness and throughput.",
      "Common implementations include select, poll, epoll (Linux), kqueue (BSD/macOS), and async/await in modern languages.",
      "It is essential for building high-concurrency servers, such as web servers, databases, and message brokers.",
      "Async I/O can be combined with multi-threading to leverage multiple CPU cores while still avoiding thread-per-connection overhead."
    ],
    "common_pitfalls": [
      "Writing blocking I/O calls inside an async function, which defeats the purpose and can stall the entire event loop.",
      "Ignoring backpressure, leading to unbounded memory usage when producers outpace consumers.",
      "Assuming async I/O is always faster, but it adds complexity and may not benefit CPU-bound tasks.",
      "Failing to handle errors in callbacks or promises, causing silent failures or unhandled exceptions."
    ],
    "related_topics": [
      "event-loop",
      "non-blocking-io",
      "concurrency",
      "io-multiplexing"
    ]
  },
  "asynchronous-processing": {
    "topic": "asynchronous-processing",
    "title": "Async Processing Basics",
    "summary": "Asynchronous processing allows a system to handle tasks without blocking the main flow, by offloading work to a background worker or queue. For example, when a user uploads a video, the server immediately returns a success message while a separate worker compresses the video in the background. This improves responsiveness and scalability.",
    "why_it_matters": "Engineers must understand async processing to design systems that handle high loads without degrading user experience or losing data.",
    "key_points": [
      "Asynchronous processing decouples task execution from the request/response cycle, enabling faster responses to users.",
      "Common implementations include message queues (e.g., RabbitMQ, Kafka) and worker processes that consume tasks.",
      "It is ideal for time-consuming operations like sending emails, generating thumbnails, or processing payments.",
      "It requires careful handling of task state, retries, and idempotency to ensure reliability.",
      "Async processing can improve system throughput by parallelizing work across multiple workers."
    ],
    "common_pitfalls": [
      "Assuming async tasks are executed immediately, leading to race conditions or stale data.",
      "Forgetting to implement retries and dead-letter queues, causing silent task failures.",
      "Overusing async for trivial operations, adding unnecessary complexity and latency.",
      "Ignoring backpressure when queues fill up, leading to memory exhaustion or task loss."
    ],
    "related_topics": [
      "message-queues",
      "event-driven-architecture",
      "worker-pools",
      "idempotency"
    ]
  },
  "asynchronous-replication": {
    "topic": "asynchronous-replication",
    "title": "Async Replication",
    "summary": "Asynchronous replication copies data from a primary to replica nodes without waiting for the replica to acknowledge receipt. The primary continues processing writes immediately, so replicas may lag behind. For example, in a leader-follower database, the leader sends changes to followers but does not block on their confirmation.",
    "why_it_matters": "Engineers must understand async replication because it directly impacts data durability, read consistency, and system availability, and is a common trade-off in distributed databases.",
    "key_points": [
      "In async replication, the primary acknowledges a write without waiting for replicas to confirm, reducing write latency.",
      "Replicas can be temporarily behind the primary, leading to stale reads if read from replicas.",
      "Async replication is often used in multi-region setups to avoid cross-datacenter latency penalties.",
      "It improves availability because the primary can continue accepting writes even if replicas are slow or unreachable.",
      "Data loss is possible if the primary fails before replicas catch up, since recent writes may not be replicated."
    ],
    "common_pitfalls": [
      "Assuming replicas are always up-to-date when reading from them, causing consistency issues.",
      "Overlooking the risk of data loss during failover, especially in systems requiring strong durability.",
      "Using async replication for systems that require immediate failover without data loss.",
      "Not monitoring replication lag, which can grow under heavy write load."
    ],
    "related_topics": [
      "synchronous-replication",
      "replication-lag",
      "write-ahead-log",
      "eventual-consistency"
    ]
  },
  "backpressure": {
    "topic": "backpressure",
    "title": "Backpressure",
    "summary": "Backpressure is a flow-control mechanism that prevents a fast producer from overwhelming a slow consumer by signaling the producer to slow down or wait. For example, in a message queue, if a consumer is processing slower than messages arrive, the queue can send a signal to the producer to pause sending until the consumer catches up. It ensures system stability and prevents memory exhaustion or data loss.",
    "why_it_matters": "Without backpressure, systems can crash or lose data when load spikes, so engineers must design for it to build resilient, scalable systems.",
    "key_points": [
      "Backpressure propagates upstream from the slow consumer to the producer, throttling the rate of data flow.",
      "Common implementations include bounded queues, TCP flow control, and reactive streams with demand signaling.",
      "It helps maintain bounded memory usage and avoids unbounded queue growth under load.",
      "Backpressure can be applied at different layers, such as network, application, or database level.",
      "Effective backpressure requires monitoring and tuning to balance throughput and latency."
    ],
    "common_pitfalls": [
      "Using unbounded queues, which hide backpressure and lead to memory exhaustion.",
      "Ignoring backpressure signals and continuing to send data, causing dropped messages or timeouts.",
      "Applying backpressure only at one layer while other layers still overload, leading to cascading failures.",
      "Assuming backpressure is automatic in all messaging systems, when it often needs explicit configuration."
    ],
    "related_topics": [
      "load-balancing",
      "message-queues",
      "reactive-streams",
      "circuit-breaker"
    ]
  },
  "batch-processing": {
    "topic": "batch-processing",
    "title": "Batch Processing",
    "summary": "Batch processing is a computing paradigm where data is collected over a period and processed in bulk, typically at scheduled intervals, rather than in real time. For example, a bank may process all daily transactions at night to generate account statements. It is efficient for large volumes of data but introduces latency between data arrival and processing.",
    "why_it_matters": "Engineers must understand batch processing because it underpins many data pipelines, ETL jobs, and reporting systems, and choosing between batch and stream processing affects system latency, cost, and complexity.",
    "key_points": [
      "Batch processing handles data in discrete chunks or 'batches' rather than item-by-item in real time.",
      "It is well-suited for high-throughput, non-time-sensitive workloads like payroll, billing, or analytics.",
      "Common tools include MapReduce, Spark, and traditional cron jobs with scripts.",
      "Batches are often scheduled at fixed intervals (e.g., hourly, daily) or triggered by data volume thresholds.",
      "It simplifies fault tolerance because failed batches can be retried without affecting live operations."
    ],
    "common_pitfalls": [
      "Assuming batch processing is real-time and using it for latency-sensitive features like fraud detection.",
      "Ignoring the cost of reprocessing when a batch job fails mid-way, especially without idempotency.",
      "Overloading a single batch job with too many tasks, leading to long runtimes and resource contention.",
      "Forgetting to handle late-arriving data that misses a batch window."
    ],
    "related_topics": [
      "stream-processing",
      "etl",
      "mapreduce",
      "scheduling"
    ]
  },
  "blocking-io": {
    "topic": "blocking-io",
    "title": "Blocking I/O",
    "summary": "Blocking I/O is a synchronous input/output model where a thread or process pauses (blocks) until an I/O operation completes. For example, a web server thread reading from a socket will wait until data arrives, doing nothing else in the meantime. This is the simplest I/O model but can waste resources under high concurrency.",
    "why_it_matters": "Understanding blocking I/O is essential because it directly impacts system throughput, latency, and scalability, and it motivates the need for non-blocking or asynchronous alternatives.",
    "key_points": [
      "In blocking I/O, the calling thread is suspended until the operation finishes, which simplifies programming logic.",
      "Each concurrent I/O operation typically requires a dedicated thread, leading to high memory and context-switching overhead.",
      "Blocking I/O is common in traditional server designs like thread-per-request, which works fine for low concurrency.",
      "Blocking calls include file reads, network socket reads, and database queries, where the thread waits for the kernel to signal completion.",
      "When a thread blocks, the CPU can switch to another runnable thread, but excessive blocking can cause thread starvation and reduced throughput."
    ],
    "common_pitfalls": [
      "Assuming blocking I/O is always inefficient; it is actually fine for low-latency, low-concurrency workloads.",
      "Creating too many threads to handle blocking I/O, leading to memory exhaustion and thrashing.",
      "Not distinguishing between blocking I/O and non-blocking I/O when designing APIs or services.",
      "Ignoring the risk of thread pool exhaustion when using blocking calls inside a fixed-size thread pool."
    ],
    "related_topics": [
      "non-blocking-io",
      "asynchronous-io",
      "thread-pool",
      "event-loop"
    ]
  },
  "cache-aside": {
    "topic": "cache-aside",
    "title": "Cache-Aside Pattern",
    "summary": "Cache-aside is a caching strategy where the application loads data from the cache on a read; if the cache misses, it fetches from the database and populates the cache. Writes go directly to the database, and the cache is invalidated or updated. For example, a user profile service checks Redis first, and on a miss, queries PostgreSQL and stores the result in Redis.",
    "why_it_matters": "It is a foundational caching pattern that improves read performance and reduces database load, and engineers must know it to design scalable systems.",
    "key_points": [
      "Reads check the cache first; on a miss, the application fetches from the database and writes the data into the cache.",
      "Writes go directly to the database, and the cache entry for that key is either updated or invalidated to maintain consistency.",
      "The cache is populated lazily, meaning data is only cached when it is first requested.",
      "Cache expiration (TTL) is used to avoid stale data and to allow the cache to self-clean.",
      "This pattern is simple to implement and works well for read-heavy workloads with infrequent writes."
    ],
    "common_pitfalls": [
      "Forgetting to invalidate the cache on writes, leading to stale data being served.",
      "Using cache-aside for write-heavy workloads, causing frequent cache misses and extra complexity.",
      "Setting TTL too long or too short, either causing stale data or excessive cache churn.",
      "Not handling cache stampede when many requests miss simultaneously and overload the database."
    ],
    "related_topics": [
      "cache-penetration",
      "cache-stampede",
      "write-through-cache",
      "cache-eviction-policies"
    ]
  },
  "cache-coherence": {
    "topic": "cache-coherence",
    "title": "Cache Coherence",
    "summary": "Cache coherence ensures that multiple caches sharing a memory location see a consistent value, even when one cache updates it. For example, in a multi-core CPU, if core A writes to variable X, core B's cache must not serve stale data. It is maintained via protocols like MESI or MOESI that track cache line states.",
    "why_it_matters": "Without cache coherence, multi-core systems would produce incorrect results due to stale reads, breaking data consistency and leading to subtle bugs.",
    "key_points": [
      "Cache coherence is about maintaining a single, up-to-date view of shared memory across all caches.",
      "Coherence protocols like MESI (Modified, Exclusive, Shared, Invalid) define states and transitions for cache lines.",
      "Write-invalidate and write-update are two common strategies to propagate writes to other caches.",
      "Snooping (bus-based) and directory-based are the two main implementation approaches for coherence.",
      "Coherence is different from consistency, which defines the order in which writes become visible to different processors."
    ],
    "common_pitfalls": [
      "Confusing cache coherence with memory consistency, which is about ordering of operations.",
      "Assuming that a single shared bus is scalable for many cores; snooping can become a bottleneck.",
      "Forgetting that false sharing (multiple variables in one cache line) causes unnecessary invalidations and performance hits.",
      "Overlooking the impact of coherence traffic on memory latency and bandwidth in high-core-count systems."
    ],
    "related_topics": [
      "cache-memory-consistency",
      "mesi-protocol",
      "false-sharing",
      "multi-core-architecture"
    ]
  },
  "cache-eviction": {
    "topic": "cache-eviction",
    "title": "Cache Eviction Basics",
    "summary": "Cache eviction is the process of removing data from a cache to make room for new entries when the cache reaches its capacity limit. For example, an LRU (Least Recently Used) policy evicts the item that hasn't been accessed for the longest time. This ensures the cache stays within memory bounds while retaining the most relevant data.",
    "why_it_matters": "Engineers must understand eviction because choosing the wrong policy or parameters can drastically reduce cache hit rates, leading to increased latency and backend load.",
    "key_points": [
      "Eviction policies determine which cache entries are removed when the cache is full.",
      "Common policies include LRU (Least Recently Used), FIFO (First In First Out), and LFU (Least Frequently Used).",
      "The optimal policy depends on access patterns; for example, LRU works well for temporal locality, while LFU suits stable popularity.",
      "Eviction can be implemented with data structures like a doubly linked list and a hash map for O(1) operations in LRU.",
      "Some caches use adaptive or hybrid policies to handle changing workloads."
    ],
    "common_pitfalls": [
      "Assuming LRU is always best without analyzing workload access patterns.",
      "Ignoring the overhead of maintaining eviction metadata, which can reduce throughput.",
      "Setting cache size too small, causing frequent evictions and thrashing.",
      "Not accounting for cache invalidation (e.g., data updates) separately from eviction."
    ],
    "related_topics": [
      "cache-aside",
      "write-through-cache",
      "consistent-hashing",
      "time-to-live"
    ]
  },
  "cache-invalidation": {
    "topic": "cache-invalidation",
    "title": "Cache Invalidation",
    "summary": "Cache invalidation is the process of removing or updating cached data when the underlying source data changes, ensuring that clients don't read stale information. For example, after a user updates their profile, any cached copies of that profile must be invalidated or refreshed so subsequent reads show the new data.",
    "why_it_matters": "Without proper invalidation, caches serve stale data, leading to incorrect behavior, user-visible errors, and data consistency issues in distributed systems.",
    "key_points": [
      "Invalidation strategies include write-through (update cache on write), write-around (bypass cache on write), and write-back (update cache asynchronously).",
      "Time-to-live (TTL) expiration is a simple invalidation mechanism, but it can serve stale data until the TTL elapses.",
      "Event-driven invalidation uses messages (e.g., Kafka, Redis pub/sub) to notify cache nodes when data changes.",
      "Versioning or timestamping cached entries helps detect and discard outdated entries.",
      "Cache invalidation is often considered one of the hardest problems in computer science, especially in distributed systems."
    ],
    "common_pitfalls": [
      "Relying solely on TTL without considering data freshness requirements, leading to stale reads.",
      "Forgetting to invalidate all replicas in a multi-node cache cluster, causing inconsistent views.",
      "Invalidating too aggressively, causing cache misses and performance degradation.",
      "Not handling concurrent writes and invalidation races, which can resurrect stale data."
    ],
    "related_topics": [
      "cache-aside",
      "write-through-cache",
      "distributed-cache",
      "eventual-consistency"
    ]
  },
  "caching": {
    "topic": "caching",
    "title": "Caching",
    "summary": "Caching stores copies of frequently accessed data in a faster storage layer to reduce latency and load on the primary data source. For example, a web app might cache database query results in Redis so that repeated requests for the same data are served in milliseconds instead of hitting the database each time.",
    "why_it_matters": "Caching is essential for building scalable, low-latency systems, as it directly impacts performance and cost.",
    "key_points": [
      "Caching improves read performance by serving data from a fast store like memory instead of a slower disk or network.",
      "Cache eviction policies (e.g., LRU, TTL) determine when and how entries are removed to keep the cache fresh and bounded.",
      "Cache invalidation is critical to ensure stale data is not served after the underlying data changes.",
      "Caches can be placed at multiple levels: client-side, CDN, application, and database.",
      "Cache hit ratio measures effectiveness; a high ratio means most requests are served from cache."
    ],
    "common_pitfalls": [
      "Using a cache without a clear invalidation strategy, leading to stale data.",
      "Caching too much data, causing memory pressure and eviction of useful entries.",
      "Ignoring cache stampede (thundering herd) where many requests miss simultaneously and overload the backend.",
      "Treating cache as a source of truth instead of a performance layer, causing consistency issues."
    ],
    "related_topics": [
      "load-balancing",
      "database-indexing",
      "cdns",
      "distributed-systems"
    ]
  },
  "cdn-caching": {
    "topic": "cdn-caching",
    "title": "CDN Caching Basics",
    "summary": "CDN caching stores copies of static content (like images, CSS, JS) on edge servers geographically closer to users. When a user requests a resource, the CDN serves it from the nearest cache instead of the origin server, reducing latency and origin load. For example, a video thumbnail in a global app is cached in a Tokyo edge server, so a user in Japan gets it in milliseconds instead of hitting a server in the US.",
    "why_it_matters": "Engineers must understand CDN caching to design systems that are fast, scalable, and cost-effective for global audiences.",
    "key_points": [
      "CDN caching works by storing responses from the origin server at edge locations based on cache-control headers and TTLs.",
      "Cache hits serve content from the edge, while cache misses forward the request to the origin and then populate the cache.",
      "Cache invalidation is achieved through explicit purges, versioned URLs, or short TTLs to keep content fresh.",
      "CDNs often support caching of dynamic content with edge-side includes or surrogate keys, but static content is the primary use case."
    ],
    "common_pitfalls": [
      "Setting overly long TTLs for content that changes frequently, leading to stale data served to users.",
      "Ignoring cache-control headers, causing the CDN to cache private or user-specific data, risking privacy leaks.",
      "Forgetting to invalidate cache after deploying new versions, so users see old assets until TTL expires.",
      "Assuming all content is cacheable without considering query strings, cookies, or authentication, which can reduce hit rates."
    ],
    "related_topics": [
      "http-caching",
      "edge-computing",
      "load-balancing",
      "content-delivery-network"
    ]
  },
  "client-compatibility": {
    "topic": "client-compatibility",
    "title": "Client Compatibility",
    "summary": "Client-compatibility is the ability of a server or API to work with multiple versions of client software simultaneously. For example, a mobile app's older version may still call a v1 endpoint while the newest version uses v2, requiring the server to support both. It ensures that users on different device versions or update schedules can still use the service without breakage.",
    "why_it_matters": "Engineers must understand it to avoid breaking existing users when rolling out new features or changes.",
    "key_points": [
      "Use versioned APIs (e.g., /v1/, /v2/) to allow different client versions to coexist.",
      "Maintain backward compatibility by not removing or changing existing fields without a deprecation plan.",
      "Implement feature flags or capability negotiation to enable new features only for clients that support them.",
      "Test against older client versions in CI/CD to catch regressions early.",
      "Plan for a deprecation timeline and communicate it to clients before removing old versions."
    ],
    "common_pitfalls": [
      "Assuming all clients update immediately and breaking old versions without notice.",
      "Changing the semantics of an existing field instead of adding a new one.",
      "Not providing a migration path or documentation for clients to upgrade.",
      "Ignoring the cost of maintaining multiple versions, leading to technical debt."
    ],
    "related_topics": [
      "api-versioning",
      "backward-compatibility",
      "feature-flags",
      "semantic-versioning"
    ]
  },
  "competing-consumers": {
    "topic": "competing-consumers",
    "title": "Competing Consumers Pattern",
    "summary": "Competing consumers is a messaging pattern where multiple consumer instances process messages from the same queue or log, allowing parallel work and higher throughput. Each message is delivered to exactly one consumer, so work is distributed automatically. For example, a video processing pipeline might have several worker servers pulling encoding jobs from a shared queue, each handling a different video simultaneously.",
    "why_it_matters": "Engineers must understand this pattern to design scalable, fault-tolerant systems that can handle variable workloads without a single bottleneck.",
    "key_points": [
      "Multiple consumers share the same queue, but each message is processed by only one consumer, enabling horizontal scaling.",
      "This pattern improves throughput and reduces latency by parallelizing work across many instances.",
      "Consumers are stateless and can be added or removed dynamically to match load.",
      "Message ordering is not guaranteed unless explicitly enforced, so design for idempotency.",
      "It is often implemented using message brokers like Kafka, RabbitMQ, or SQS."
    ],
    "common_pitfalls": [
      "Assuming messages are processed in order, which can break if consumers run at different speeds.",
      "Forgetting to handle reprocessing of failed messages, leading to duplicates or lost work.",
      "Over-partitioning or under-partitioning the queue, causing uneven load or wasted resources.",
      "Making consumers stateful, which prevents easy scaling and complicates failure recovery."
    ],
    "related_topics": [
      "message-queue",
      "load-balancing",
      "event-driven-architecture",
      "idempotency"
    ]
  },
  "conditional-writes": {
    "topic": "conditional-writes",
    "title": "Conditional Writes",
    "summary": "Conditional writes are database operations that only apply if a specified condition is true at the time of the write, ensuring atomicity and consistency. For example, an inventory system might decrement stock only if the current quantity is greater than zero, preventing overselling. This pattern is common in optimistic concurrency control and distributed systems.",
    "why_it_matters": "Engineers must understand conditional writes to prevent race conditions and maintain data integrity in concurrent or distributed environments.",
    "key_points": [
      "A conditional write checks a condition (e.g., version number, value range) before applying the update, all in one atomic operation.",
      "They are often implemented using compare-and-swap (CAS) or compare-and-set semantics.",
      "If the condition fails, the write is rejected, and the client can retry or handle the conflict.",
      "They are essential for implementing optimistic locking without holding long-lived database locks.",
      "In distributed databases, conditional writes rely on linearizability or strong consistency to be correct."
    ],
    "common_pitfalls": [
      "Assuming a conditional write is atomic without checking the database's isolation level or transaction guarantees.",
      "Forgetting to handle the failure case (e.g., not retrying or not informing the user) when the condition is false.",
      "Using a stale condition value (e.g., reading a version number before a concurrent update) without re-reading.",
      "Overusing conditional writes in high-contention scenarios, leading to many rejected operations and poor performance."
    ],
    "related_topics": [
      "optimistic-locking",
      "compare-and-swap",
      "database-transactions",
      "consistency-models"
    ]
  },
  "connection-lifecycle": {
    "topic": "connection-lifecycle",
    "title": "Connection Lifecycle",
    "summary": "The connection lifecycle describes the stages a network connection goes through from establishment to termination, including setup, data transfer, and teardown. For example, an HTTP request over TCP involves a three-way handshake, request/response exchange, and a four-way handshake to close. Understanding this helps engineers design reliable and efficient systems.",
    "why_it_matters": "Engineers must understand it to manage resource usage, avoid connection leaks, and design protocols that handle failures gracefully.",
    "key_points": [
      "A connection typically has states: idle, establishing, established, closing, and closed.",
      "TCP uses a three-way handshake (SYN, SYN-ACK, ACK) to establish a connection.",
      "Graceful termination uses a four-way handshake (FIN, ACK, FIN, ACK) to close both directions.",
      "Connection pooling reuses established connections to reduce overhead of repeated handshakes.",
      "Timeouts and keepalives are essential to detect and clean up dead or idle connections."
    ],
    "common_pitfalls": [
      "Forgetting to close connections, leading to resource leaks and exhausted file descriptors.",
      "Assuming a connection is still alive without using keepalives or timeouts, causing stale connections.",
      "Ignoring half-open connections where one side has closed but the other hasn't detected it.",
      "Overusing new connections without pooling, causing unnecessary latency and overhead."
    ],
    "related_topics": [
      "tcp-handshake",
      "connection-pooling",
      "http-keepalive",
      "load-balancing"
    ]
  },
  "connection-pooling": {
    "topic": "connection-pooling",
    "title": "Connection Pooling",
    "summary": "Connection pooling is a technique where a set of pre-established network connections (e.g., to a database) are kept open and reused, rather than creating a new connection for each request. For example, a web server maintains a pool of 10 database connections, and each incoming request borrows one, uses it, and returns it. This reduces the overhead of handshakes and authentication, improving latency and throughput.",
    "why_it_matters": "Without connection pooling, systems can exhaust resources or suffer high latency under load, so engineers must design pools to ensure scalability and reliability.",
    "key_points": [
      "A connection pool maintains a cache of open connections to a backend, such as a database or message queue.",
      "Each client request borrows a connection from the pool, uses it, and returns it after completion.",
      "Pool size should be tuned based on concurrent load, backend capacity, and latency requirements.",
      "Pools often include timeout and eviction policies to handle idle or stale connections.",
      "Connection pooling can be implemented at the client library level (e.g., HikariCP for Java) or via middleware."
    ],
    "common_pitfalls": [
      "Setting the pool size too high can overwhelm the backend and cause performance degradation.",
      "Forgetting to return connections to the pool, leading to pool exhaustion and application hangs.",
      "Using a pool for short-lived operations when connection creation is cheap, adding unnecessary complexity.",
      "Ignoring connection validation (e.g., stale connections) which can cause intermittent failures."
    ],
    "related_topics": [
      "database-sharding",
      "load-balancing",
      "circuit-breaker",
      "latency-optimization"
    ]
  },
  "consensus": {
    "topic": "consensus",
    "title": "Consensus in Distributed Systems",
    "summary": "Consensus is the process by which multiple distributed nodes agree on a single value or state, despite failures. It ensures that all non-faulty nodes eventually reach the same decision, even if some nodes crash or messages are delayed. For example, in a replicated database, consensus decides which node's write is committed when multiple propose conflicting updates.",
    "why_it_matters": "Engineers must understand consensus because it underpins data consistency, fault tolerance, and correctness in distributed systems like databases, blockchains, and coordination services.",
    "key_points": [
      "Consensus algorithms guarantee that all non-faulty nodes agree on the same value.",
      "Common consensus algorithms include Paxos, Raft, and PBFT.",
      "Consensus typically requires a majority of nodes to be available to make progress.",
      "Consensus is used for leader election, log replication, and distributed locking.",
      "Consensus ensures safety (no conflicting decisions) and liveness (eventual progress)."
    ],
    "common_pitfalls": [
      "Assuming that consensus is the same as quorum-based replication without handling failures.",
      "Ignoring the split-brain problem where two groups of nodes each think they have a majority.",
      "Believing that consensus is fast and cheap; it often involves multiple round-trips and network overhead.",
      "Confusing consensus with atomic broadcast, which is a related but distinct problem."
    ],
    "related_topics": [
      "raft",
      "paxos",
      "replication",
      "quorum"
    ]
  },
  "content-freshness": {
    "topic": "content-freshness",
    "title": "Content Freshness",
    "summary": "Content freshness refers to how up-to-date cached or replicated data is relative to the source of truth. It is a trade-off between serving stale data quickly and serving fresh data with higher latency or load. For example, a news app might cache headlines for 5 minutes, accepting that breaking news may be slightly delayed in exchange for reduced backend load.",
    "why_it_matters": "Engineers must understand content freshness to design caches and replication strategies that meet user expectations for timeliness while balancing performance and cost.",
    "key_points": [
      "Freshness is typically defined by a time-to-live (TTL) or a maximum acceptable staleness window.",
      "Caches improve read performance but can serve stale data if the source updates before the TTL expires.",
      "Write-through caches update the cache on every write, ensuring high freshness but increasing write latency.",
      "Write-behind caches batch updates to the source, improving write throughput but risking data loss and lower freshness.",
      "Replication lag in distributed databases directly affects freshness for read replicas."
    ],
    "common_pitfalls": [
      "Setting TTLs too long, causing users to see outdated information like stock prices or social media feeds.",
      "Ignoring invalidation mechanisms, leading to stale data persisting even after the source changes.",
      "Assuming all data requires the same freshness level, when some data (e.g., user profile) needs immediate consistency while others (e.g., trending list) can tolerate minutes.",
      "Over-optimizing for freshness by bypassing caches, resulting in high load and poor scalability."
    ],
    "related_topics": [
      "cache-invalidation",
      "read-replicas",
      "eventual-consistency",
      "time-to-live"
    ]
  },
  "data-partitioning": {
    "topic": "data-partitioning",
    "title": "Data Partitioning",
    "summary": "Data partitioning is the practice of splitting a large dataset into smaller, manageable chunks distributed across multiple servers or storage systems. This improves scalability and performance by reducing individual node load. For example, a social media platform might partition user records by user ID range, so each server handles a specific subset of users.",
    "why_it_matters": "Engineers must understand partitioning to design systems that scale horizontally without hitting bottlenecks in storage or query throughput.",
    "key_points": [
      "Partitioning can be done by range, hash, or list-based methods, each with trade-offs in data distribution and query efficiency.",
      "Hash-based partitioning evenly distributes data but makes range queries inefficient because data is scattered.",
      "Range partitioning supports efficient range scans but can cause hotspots if data is skewed (e.g., many users in one region).",
      "Partitioning keys should be chosen to align with common query patterns to avoid cross-partition queries.",
      "Replication and consistency mechanisms must be considered because partitions are often stored on different nodes."
    ],
    "common_pitfalls": [
      "Choosing a poor partition key that leads to uneven data distribution and hotspot nodes.",
      "Ignoring the need for cross-partition queries, which can become slow and complex.",
      "Assuming partitioning alone solves all scalability issues without considering replication and fault tolerance.",
      "Forgetting that repartitioning data after growth is difficult and should be planned for upfront."
    ],
    "related_topics": [
      "sharding",
      "consistent-hashing",
      "database-indexing",
      "replication"
    ]
  },
  "database-bottlenecks": {
    "topic": "database-bottlenecks",
    "title": "Database Bottlenecks",
    "summary": "A database bottleneck occurs when the database becomes the limiting factor for system performance, often due to high query load, lock contention, or insufficient indexing. For example, a single write-heavy table with no index can cause queries to slow down dramatically as data grows, leading to timeouts.",
    "why_it_matters": "Engineers must understand database bottlenecks because they are a common cause of system degradation and outages, and identifying them early informs scaling and optimization strategies.",
    "key_points": [
      "Bottlenecks often arise from slow queries, missing indexes, or excessive row locks.",
      "Connection pool exhaustion can occur when requests wait for a database connection, amplifying latency.",
      "Read replicas can offload read traffic but do not solve write-heavy bottlenecks.",
      "Monitoring metrics like query latency, CPU usage, and lock waits helps pinpoint the exact bottleneck.",
      "Database sharding or partitioning can distribute load, but they add complexity and should be used after simpler fixes."
    ],
    "common_pitfalls": [
      "Assuming adding more application servers will fix a database bottleneck.",
      "Ignoring slow query logs and focusing only on CPU or memory usage.",
      "Over-indexing every column, which slows down writes and increases storage.",
      "Not testing with realistic data volumes, so bottlenecks only appear in production."
    ],
    "related_topics": [
      "connection-pooling",
      "query-optimization",
      "database-indexing",
      "read-replicas"
    ]
  },
  "database-indexing": {
    "topic": "database-indexing",
    "title": "Database Indexing",
    "summary": "A database index is a data structure (like a B-tree or hash table) that speeds up data retrieval by allowing the database to find rows without scanning the entire table. For example, an index on a 'users.email' column lets a query for a specific email return instantly instead of checking every row. Indexes are a trade-off: they make reads faster but writes slower and consume storage.",
    "why_it_matters": "Engineers must understand indexing because it is the most common way to fix slow queries, and misusing it can degrade write performance or waste storage.",
    "key_points": [
      "Indexes work by creating a sorted or hashed structure that points to table rows, enabling fast lookups by indexed columns.",
      "A primary key automatically gets a unique index, but additional indexes are needed for frequent query patterns (e.g., WHERE, JOIN, ORDER BY).",
      "Composite indexes (multiple columns) can optimize queries that filter on multiple columns, but the column order matters for leftmost prefix matching.",
      "Indexes speed up SELECT queries but slow down INSERT, UPDATE, and DELETE operations because the index must be updated on every write.",
      "Use EXPLAIN or query plans to verify that an index is actually being used for a given query."
    ],
    "common_pitfalls": [
      "Creating too many indexes on a table, which degrades write performance and increases storage overhead.",
      "Indexing every column 'just in case' without knowing the actual query patterns.",
      "Forgetting that indexing a low-cardinality column (e.g., a boolean) often doesn't help because it doesn't narrow results enough.",
      "Not considering that queries with leading wildcards (e.g., LIKE '%foo') cannot use a standard B-tree index."
    ],
    "related_topics": [
      "query-optimization",
      "b-tree",
      "database-design",
      "caching"
    ]
  },
  "database-polling": {
    "topic": "database-polling",
    "title": "Database Polling",
    "summary": "Database polling is a pattern where an application repeatedly queries a database at fixed intervals to check for new or updated data, rather than being notified instantly. For example, a job scheduler might poll a 'jobs' table every 5 seconds to pick up new tasks. It is simple to implement but introduces latency and extra load on the database.",
    "why_it_matters": "Engineers must understand polling because it is a common fallback when real-time push mechanisms (like webhooks or change data capture) are unavailable, and it directly impacts system latency, scalability, and cost.",
    "key_points": [
      "Polling works by executing a query on a timer, such as SELECT * FROM events WHERE processed = false.",
      "The polling interval determines the maximum delay between data change and detection, so shorter intervals reduce latency but increase database load.",
      "Polling can be optimized with indexing, cursors, or high-water marks to avoid scanning entire tables.",
      "It is often used in distributed systems where event streaming or message queues are not yet implemented.",
      "Polling is easier to debug than push-based systems because the state is visible in the database."
    ],
    "common_pitfalls": [
      "Setting the polling interval too short, causing database overload and performance degradation.",
      "Forgetting to add indexes on the columns used in the polling query, leading to full table scans.",
      "Not handling concurrent pollers, which can process the same record twice unless atomic updates (e.g., SELECT FOR UPDATE) are used.",
      "Assuming polling is real-time, when it actually introduces inherent delay equal to the polling interval."
    ],
    "related_topics": [
      "change-data-capture",
      "message-queue",
      "outbox-pattern",
      "event-driven-architecture"
    ]
  },
  "databases": {
    "topic": "databases",
    "title": "Databases",
    "summary": "A database is an organized collection of data stored and accessed electronically, allowing efficient retrieval, insertion, updating, and deletion. For example, an e-commerce app uses a database to store user accounts, products, and orders. Databases can be relational (SQL) or non-relational (NoSQL), each suited to different use cases.",
    "why_it_matters": "Databases are the backbone of most applications, and choosing the right one and designing it well directly impacts performance, scalability, and reliability.",
    "key_points": [
      "Databases store data persistently and provide structured ways to query and manipulate it.",
      "Relational databases use tables with rows and columns and enforce relationships via foreign keys.",
      "NoSQL databases like document stores or key-value stores offer flexible schemas and horizontal scaling.",
      "Indexes are used to speed up read operations at the cost of write performance and storage.",
      "ACID (Atomicity, Consistency, Isolation, Durability) properties ensure reliable transactions in relational databases.",
      "CAP theorem states that a distributed database can only guarantee two of consistency, availability, and partition tolerance."
    ],
    "common_pitfalls": [
      "Choosing a NoSQL database without understanding its consistency model, leading to data anomalies.",
      "Ignoring indexing, resulting in slow queries as data grows.",
      "Designing a schema without considering future access patterns, causing expensive migrations.",
      "Assuming that all databases are ACID-compliant or that NoSQL is always faster."
    ],
    "related_topics": [
      "sql",
      "nosql",
      "caching",
      "database-indexing"
    ]
  },
  "deadlocks": {
    "topic": "deadlocks",
    "title": "Deadlocks in Concurrency",
    "summary": "A deadlock occurs when two or more processes are each waiting for a resource held by another, causing all to stall indefinitely. For example, two transactions each hold a lock on one database row and wait for the other's row, so neither can proceed. Deadlocks are a classic failure mode in multi-threaded or distributed systems.",
    "why_it_matters": "Engineers must understand deadlocks to design systems that avoid or recover from them, ensuring availability and preventing silent hangs.",
    "key_points": [
      "Deadlock requires four conditions: mutual exclusion, hold-and-wait, no preemption, and circular wait.",
      "Prevention strategies include acquiring locks in a global order or using a timeout with retry.",
      "Detection involves building a wait-for graph and checking for cycles.",
      "Recovery methods include killing a process or preempting resources, often at a cost.",
      "In distributed systems, deadlocks can involve multiple resources across servers, complicating detection."
    ],
    "common_pitfalls": [
      "Assuming that using locks with timeouts always avoids deadlocks, but timeouts can cause cascading retries.",
      "Forgetting to consider all resources (e.g., database rows, network connections) when ordering locks.",
      "Ignoring the possibility of deadlocks in single-threaded event loops due to nested callbacks.",
      "Relying solely on database deadlock detection without handling application-level deadlocks."
    ],
    "related_topics": [
      "concurrency-control",
      "distributed-transactions",
      "lock-ordering",
      "wait-for-graph"
    ]
  },
  "distributed-databases": {
    "topic": "distributed-databases",
    "title": "Distributed Databases",
    "summary": "A distributed database is a single logical database that is stored and queried across multiple physical machines, often in different locations. It provides scalability and fault tolerance by replicating and partitioning data. For example, Google Spanner or Amazon DynamoDB are distributed databases that handle global traffic.",
    "why_it_matters": "Engineers must understand distributed databases because they underpin modern large-scale applications, and their design choices affect consistency, availability, and performance.",
    "key_points": [
      "Data is partitioned (sharded) across nodes to scale horizontally.",
      "Replication provides redundancy and high availability.",
      "Distributed transactions require coordination protocols like two-phase commit or consensus (e.g., Raft, Paxos).",
      "The CAP theorem dictates trade-offs between consistency, availability, and partition tolerance.",
      "Consistency models range from strong to eventual, affecting user experience and system complexity."
    ],
    "common_pitfalls": [
      "Assuming strong consistency is always achievable without performance costs.",
      "Ignoring network partitions and their impact on availability.",
      "Designing sharding keys poorly, leading to hotspots or uneven data distribution.",
      "Overlooking the complexity of distributed joins and transactions."
    ],
    "related_topics": [
      "cap-theorem",
      "sharding",
      "replication",
      "consensus-algorithms"
    ]
  },
  "dns": {
    "topic": "dns",
    "title": "DNS",
    "summary": "DNS (Domain Name System) translates human-readable domain names like example.com into IP addresses that computers use to route traffic. It acts like the internet's phonebook, enabling users to access websites without memorizing numeric addresses. For example, when you type 'google.com', DNS resolves it to an IP like 142.250.190.78.",
    "why_it_matters": "DNS is a fundamental building block of almost every network request, so engineers must understand its hierarchy, caching, and failure modes to design reliable and low-latency systems.",
    "key_points": [
      "DNS is a hierarchical system with root servers, TLD servers, and authoritative nameservers that resolve domain names to IP addresses.",
      "DNS responses are cached at multiple levels (browser, OS, resolver) to reduce latency and load on authoritative servers.",
      "DNS uses record types like A (IPv4), AAAA (IPv6), CNAME (alias), and MX (mail) to map names to different resources.",
      "TTL (Time-to-Live) values control how long DNS records are cached, balancing freshness versus performance.",
      "DNS can be used for load balancing via round-robin responses or geo-routing to direct users to different servers."
    ],
    "common_pitfalls": [
      "Forgetting to set appropriate TTLs can cause stale records during failover or traffic shifting.",
      "Assuming DNS propagation is instant; changes can take up to 48 hours due to caching.",
      "Overlooking DNS as a single point of failure; a misconfigured or downed DNS can take down the entire service.",
      "Using CNAME for the root domain (apex) which is not allowed by the DNS spec; use ALIAS or A records instead."
    ],
    "related_topics": [
      "load-balancing",
      "cdn",
      "http",
      "tls"
    ]
  },
  "durable-queues": {
    "topic": "durable-queues",
    "title": "Durable Queues",
    "summary": "A durable queue is a message queue that persists messages to stable storage (like disk) so they survive broker restarts or crashes. For example, in an e-commerce order system, if the order-service crashes after placing an order, the durable queue ensures the payment-processing message isn't lost and is delivered once the service recovers.",
    "why_it_matters": "Engineers must understand durable queues to guarantee at-least-once delivery and prevent data loss in distributed systems, which is critical for financial transactions, notifications, and other reliability-sensitive workflows.",
    "key_points": [
      "Durable queues store messages on disk or replicated storage before acknowledging receipt, ensuring they survive broker failures.",
      "They typically require a trade-off: higher latency and lower throughput compared to in-memory queues, due to disk I/O.",
      "Durability can be configured per message or queue, with options like synchronous fsync or asynchronous flushing.",
      "Consumers must handle duplicate messages because durable queues often provide at-least-once delivery, not exactly-once.",
      "Common implementations include Apache Kafka, RabbitMQ with publisher confirms, and AWS SQS with standard queues."
    ],
    "common_pitfalls": [
      "Assuming durable queues guarantee exactly-once delivery, but they only guarantee at-least-once, so consumers must be idempotent.",
      "Forgetting to set the correct durability flags (e.g., enabling persistence in RabbitMQ) and losing messages on restart.",
      "Overusing synchronous durability for every message, causing unnecessary performance bottlenecks when lower durability would suffice.",
      "Ignoring the need for replication across nodes, as a single-node durable queue still loses data if the disk fails."
    ],
    "related_topics": [
      "message-queues",
      "at-least-once-delivery",
      "idempotent-consumers",
      "replication"
    ]
  },
  "eventual-consistency": {
    "topic": "eventual-consistency",
    "title": "Eventual Consistency",
    "summary": "Eventual consistency is a data consistency model where, after a write, the system will eventually propagate the update to all replicas, but reads may temporarily return stale data. For example, in a social media feed, a user's post might not appear on all followers' feeds instantly, but it will appear within a few seconds or minutes.",
    "why_it_matters": "Engineers must understand it to design distributed systems that balance availability and partition tolerance, and to avoid building features that incorrectly assume immediate consistency.",
    "key_points": [
      "In eventual consistency, replicas converge to the same value over time, but there is no guarantee of when.",
      "Reads may return stale data until propagation completes, which is acceptable for many use cases like caches or activity feeds.",
      "It is often achieved using asynchronous replication or gossip protocols.",
      "It is a trade-off: it provides high availability and low latency but sacrifices strong read-your-writes guarantees.",
      "Conflict resolution strategies (e.g., last-write-wins) are needed when multiple writes happen concurrently."
    ],
    "common_pitfalls": [
      "Assuming that a write is immediately visible to all clients, which breaks user expectations for critical data.",
      "Ignoring the need for conflict resolution, leading to lost updates or inconsistent state.",
      "Using eventual consistency for financial transactions or other scenarios requiring strong consistency.",
      "Not setting appropriate timeouts or mechanisms to bound the convergence time."
    ],
    "related_topics": [
      "strong-consistency",
      "cap-theorem",
      "replication",
      "conflict-resolution"
    ]
  },
  "failure-detection": {
    "topic": "failure-detection",
    "title": "Failure Detection Basics",
    "summary": "Failure detection is the process of identifying when a component in a distributed system (like a server or network link) has stopped functioning correctly. It typically uses heartbeats, timeouts, or health checks to infer liveness. For example, a load balancer pings backend servers every 5 seconds and marks one as dead if it misses three consecutive pings.",
    "why_it_matters": "Without reliable failure detection, systems cannot trigger failover, retries, or rebalancing, leading to downtime and data loss.",
    "key_points": [
      "Heartbeat-based detection uses periodic messages to confirm a node is alive, with a timeout threshold to declare failure.",
      "Timeouts must balance between false positives (declaring a healthy node dead) and false negatives (missing a real failure).",
      "Distributed systems often use quorum-based or gossip protocols to avoid single points of failure in detection.",
      "Detection is often combined with leader election or membership protocols to maintain system consistency.",
      "In cloud environments, health checks can be active (sending requests) or passive (observing traffic patterns)."
    ],
    "common_pitfalls": [
      "Setting timeouts too short, causing frequent false positives and unnecessary failovers.",
      "Ignoring network partitions, which can make a node appear dead when it is actually isolated.",
      "Using a single centralized monitor, which becomes a single point of failure itself.",
      "Not distinguishing between process death and network unreachability, leading to incorrect actions."
    ],
    "related_topics": [
      "heartbeat",
      "timeout",
      "leader-election",
      "consensus"
    ]
  },
  "failure-domains": {
    "topic": "failure-domains",
    "title": "Failure Domains",
    "summary": "A failure domain is a boundary within which a single point of failure can affect all components inside it. For example, a single server rack is a failure domain because if its power supply fails, every server in that rack goes down. Designing systems with multiple independent failure domains (e.g., across racks, data centers, or regions) increases availability and resilience.",
    "why_it_matters": "Engineers must understand failure domains to distribute replicas and workloads across independent boundaries, preventing correlated failures from taking down the entire system.",
    "key_points": [
      "A failure domain is a set of components that share a common point of failure, such as power, network, or physical location.",
      "Examples include a single server, a rack, a data center, or an entire cloud region.",
      "To achieve high availability, place redundant components in separate failure domains so that one domain's failure does not eliminate all copies of data or service.",
      "The blast radius of a failure is limited to the domain it occurs in, so smaller domains reduce the impact of individual failures.",
      "Cloud providers expose failure domains as availability zones or regions, and you should use them for replication and load balancing."
    ],
    "common_pitfalls": [
      "Assuming that multiple servers in the same rack are independent, ignoring the rack's power or network as a shared failure point.",
      "Placing all replicas of data in the same availability zone, thinking it is sufficient for disaster recovery.",
      "Not considering software-level failure domains (e.g., a single database instance) as a single point of failure.",
      "Overlooking the need to test failure scenarios across domains, leading to surprises during real outages."
    ],
    "related_topics": [
      "availability-zones",
      "replication",
      "high-availability",
      "single-point-of-failure"
    ]
  },
  "fifo-queues": {
    "topic": "fifo-queues",
    "title": "FIFO Queues",
    "summary": "A FIFO (First-In, First-Out) queue is a data structure where the first element added is the first one removed, like a line of customers at a checkout. For example, a task scheduler processes jobs in the order they arrive, ensuring no job is skipped. It is fundamental for buffering, decoupling systems, and managing asynchronous work.",
    "why_it_matters": "Engineers must understand FIFO queues because they are the backbone of message brokers, task queues, and load leveling, ensuring reliable and ordered processing in distributed systems.",
    "key_points": [
      "FIFO queues guarantee that items are processed in the exact order they are enqueued.",
      "They provide two primary operations: enqueue (add to the tail) and dequeue (remove from the head).",
      "They are often used to decouple producers and consumers, allowing them to operate at different speeds.",
      "In distributed systems, FIFO ordering can be maintained per partition or per key, not globally.",
      "They are typically implemented with linked lists or circular buffers for efficient operations."
    ],
    "common_pitfalls": [
      "Assuming global FIFO ordering across multiple queues or partitions without explicit design.",
      "Forgetting to handle queue overflow or underflow conditions, leading to data loss or busy-waiting.",
      "Using a FIFO queue when a priority queue or LIFO stack is more appropriate for the use case.",
      "Ignoring the need for persistence or acknowledgments in distributed queues, causing message loss on failure."
    ],
    "related_topics": [
      "message-queues",
      "task-scheduling",
      "producer-consumer-pattern",
      "load-leveling"
    ]
  },
  "gossip-protocols": {
    "topic": "gossip-protocols",
    "title": "Gossip Protocols",
    "summary": "Gossip protocols are a decentralized way to spread information across a distributed system by having each node periodically exchange data with a few random peers, mimicking how rumors spread in a social network. This ensures that eventually all nodes converge to the same state without a central coordinator. For example, Cassandra uses gossip to propagate node membership and metadata across its cluster.",
    "why_it_matters": "Engineers must understand gossip protocols because they underpin the scalability and fault tolerance of many distributed databases and coordination services.",
    "key_points": [
      "Each node randomly selects a few peers to exchange state information with, ensuring eventual consistency across the system.",
      "Gossip protocols are highly scalable because each node only communicates with a constant number of peers, regardless of cluster size.",
      "They are resilient to node failures and network partitions because information spreads through multiple redundant paths.",
      "The protocol typically includes mechanisms to prevent infinite loops, such as version vectors or timestamps to discard stale updates.",
      "Common implementations include epidemic broadcast, failure detection, and membership management in systems like Cassandra, DynamoDB, and Consul."
    ],
    "common_pitfalls": [
      "Assuming gossip provides strong consistency; it only guarantees eventual consistency, so stale reads are possible.",
      "Ignoring the need for a termination condition or anti-entropy mechanism, which can cause endless message flooding.",
      "Choosing too small a fanout (number of peers per round), leading to slow convergence, or too large a fanout, causing network overload.",
      "Forgetting that gossip protocols require a seed or bootstrap mechanism to start the process, which can be a single point of failure if not designed well."
    ],
    "related_topics": [
      "eventual-consistency",
      "distributed-hash-table",
      "failure-detection",
      "epidemic-broadcast"
    ]
  },
  "graphql-schemas": {
    "topic": "graphql-schemas",
    "title": "GraphQL Schema Basics",
    "summary": "A GraphQL schema is a strongly typed contract that defines the shape of data available from an API, including types, fields, and relationships. For example, a schema might declare a `User` type with `id`, `name`, and `posts` fields, where `posts` returns a list of `Post` objects. It serves as the single source of truth for what clients can query and what mutations they can perform.",
    "why_it_matters": "Engineers must understand schemas to design APIs that are predictable, evolvable, and safe against breaking changes, and to effectively collaborate across frontend and backend teams.",
    "key_points": [
      "Schemas use a type system with scalar types (e.g., Int, String) and object types (e.g., User) to define data shapes.",
      "The schema includes a root `Query` type (for reads) and a root `Mutation` type (for writes), plus optional `Subscription` type.",
      "Fields can be nullable or non-nullable (using `!`), and lists can be defined with `[Type]`.",
      "Schema definitions are written in the Schema Definition Language (SDL) and can be introspected by clients.",
      "Resolvers are functions that map schema fields to actual data sources, but the schema itself is independent of the data layer."
    ],
    "common_pitfalls": [
      "Overly broad schemas that expose too much data, leading to performance and security issues.",
      "Ignoring nullability, which can cause unexpected client errors when fields return null.",
      "Making breaking changes (e.g., removing a field) without versioning or deprecation strategy.",
      "Not using interfaces or unions for polymorphism, leading to duplicated types and complex queries."
    ],
    "related_topics": [
      "graphql-resolvers",
      "graphql-mutations",
      "api-versioning",
      "rest-api-design"
    ]
  },
  "grpc-streaming": {
    "topic": "grpc-streaming",
    "title": "gRPC Streaming",
    "summary": "gRPC streaming allows clients and servers to send multiple messages over a single long-lived connection, instead of one request/response pair. There are four types: unary, server-streaming, client-streaming, and bidirectional streaming. For example, a chat service can use bidirectional streaming to continuously exchange messages between users and the server.",
    "why_it_matters": "Engineers must understand gRPC streaming because it enables efficient, low-latency, and real-time communication for large data transfers, event feeds, and interactive applications, which are common in distributed systems.",
    "key_points": [
      "gRPC streaming supports four modes: unary, server-streaming, client-streaming, and bidirectional streaming.",
      "Streaming uses HTTP/2 multiplexing, allowing multiple concurrent streams over one TCP connection.",
      "Bidirectional streaming enables full-duplex communication, where both sides can send messages independently.",
      "Streams are message-based, not byte-based, meaning each message is framed and can be handled independently.",
      "Flow control is built-in, preventing a fast producer from overwhelming a slow consumer."
    ],
    "common_pitfalls": [
      "Assuming streaming is always faster than unary; it adds overhead and is only beneficial for multiple messages or long-lived interactions.",
      "Forgetting to handle connection errors or reconnection logic, as streams can break unexpectedly.",
      "Not setting appropriate deadlines or timeouts, causing streams to hang indefinitely.",
      "Using blocking calls in a single-threaded environment, which can deadlock when both sides wait for each other."
    ],
    "related_topics": [
      "http2",
      "protocol-buffers",
      "long-polling",
      "websocket"
    ]
  },
  "http-cacheability": {
    "topic": "http-cacheability",
    "title": "HTTP Cacheability",
    "summary": "HTTP cacheability describes whether a response to a request can be stored and reused by caches (like browsers or CDNs) to serve future identical requests. It is determined by HTTP headers such as Cache-Control, Expires, and ETag, and by the request method (e.g., GET is cacheable, POST is not). For example, a static image with `Cache-Control: public, max-age=3600` can be cached for an hour, reducing server load and latency.",
    "why_it_matters": "Engineers must understand cacheability to design APIs and web services that balance performance and data freshness, avoiding stale content or unnecessary load.",
    "key_points": [
      "Cache-Control headers like `max-age` and `no-store` dictate how long and whether a response can be cached.",
      "Only safe methods (GET, HEAD) are cacheable by default; POST responses are not unless explicitly allowed.",
      "ETags and Last-Modified headers enable conditional requests for revalidation, reducing data transfer.",
      "Private caches (browser) and shared caches (CDN) have different visibility, controlled by `private` vs `public` directives.",
      "Vary header ensures caches store separate versions for different request headers (e.g., Accept-Encoding)."
    ],
    "common_pitfalls": [
      "Assuming all GET responses are cacheable without setting Cache-Control, leading to unexpected caching or no caching.",
      "Using `no-store` everywhere, which kills caching benefits even for static assets.",
      "Forgetting to update cache headers when content changes, causing stale data to be served.",
      "Ignoring the `Vary` header, which can cause caches to serve incorrect representations for different clients."
    ],
    "related_topics": [
      "cache-control",
      "etag",
      "cdn-caching",
      "http-methods"
    ]
  },
  "http-method-semantics": {
    "topic": "http-method-semantics",
    "title": "HTTP Method Semantics",
    "summary": "HTTP methods (GET, POST, PUT, DELETE, etc.) define the intended action on a resource, and each has specific semantics regarding safety, idempotency, and cacheability. For example, GET should only retrieve data without side effects, while POST can create a resource and is not idempotent.",
    "why_it_matters": "Misusing HTTP methods leads to broken APIs, unexpected side effects, and caching issues, which degrade system reliability and performance.",
    "key_points": [
      "GET is safe and idempotent, meaning it should not change server state and repeated calls yield the same result.",
      "POST is neither safe nor idempotent; it is used to create resources or trigger actions that may have side effects.",
      "PUT replaces a resource entirely and is idempotent, so multiple identical requests have the same effect as one.",
      "DELETE removes a resource and is idempotent; after the first deletion, subsequent DELETE requests return the same status (e.g., 404).",
      "PATCH applies partial modifications and is not necessarily idempotent, unlike PUT."
    ],
    "common_pitfalls": [
      "Using GET for actions that change state, which can cause unintended side effects and break caching.",
      "Assuming POST is idempotent, leading to duplicate resource creation when retries occur.",
      "Using PUT for partial updates instead of PATCH, causing overwrite of unspecified fields.",
      "Ignoring the difference between safe and idempotent, leading to incorrect retry logic."
    ],
    "related_topics": [
      "restful-api-design",
      "idempotency",
      "http-status-codes",
      "cache-strategies"
    ]
  },
  "idempotency": {
    "topic": "idempotency",
    "title": "Idempotency Basics",
    "summary": "Idempotency means that performing the same operation multiple times has the same effect as doing it once. For example, retrying a payment request with the same idempotency key should not charge the customer twice. It is a critical property for building reliable distributed systems.",
    "why_it_matters": "Engineers must understand idempotency to prevent duplicate side effects (like double charges or duplicate orders) when network retries or client retries occur.",
    "key_points": [
      "An operation is idempotent if repeating it produces the same result as a single execution, without unintended side effects.",
      "Idempotency is often implemented using a unique idempotency key sent by the client, which the server stores and checks.",
      "HTTP methods like GET, PUT, and DELETE are typically idempotent, while POST is not by default.",
      "Idempotency is essential for safe retries in distributed systems, message queues, and payment APIs.",
      "Designing idempotent endpoints requires storing the result of the first request and returning it for subsequent identical requests."
    ],
    "common_pitfalls": [
      "Assuming POST is idempotent without adding explicit idempotency handling.",
      "Using a non-unique key (like a timestamp) that can collide across different requests.",
      "Forgetting to handle concurrent duplicate requests, leading to race conditions.",
      "Storing idempotency keys indefinitely without cleanup, causing storage bloat."
    ],
    "related_topics": [
      "distributed-systems",
      "retry-strategies",
      "api-design",
      "consistency-models"
    ]
  },
  "latency-budgets": {
    "topic": "latency-budgets",
    "title": "Latency Budgets",
    "summary": "A latency budget is a predefined allocation of the total allowed response time across the components of a distributed system. For example, if a user-facing API must respond within 500ms, you might allocate 50ms to the web server, 200ms to a database query, and 250ms to a downstream third-party service. This ensures that each component's performance target is explicit and measurable.",
    "why_it_matters": "Without a latency budget, engineers cannot systematically reason about where delays accumulate, making it impossible to meet end-to-end performance SLAs.",
    "key_points": [
      "A latency budget sets a maximum time for each service call or processing step in a request's path.",
      "Budgets are typically derived from user-perceived performance goals, like the 95th percentile response time.",
      "Each team owns its portion of the budget and must optimize or scale to stay within it.",
      "Budgets should be revisited as traffic patterns and system architecture evolve.",
      "Monitoring must track actual latencies against the budget to detect violations early."
    ],
    "common_pitfalls": [
      "Allocating too much time to early components, leaving no room for downstream variability.",
      "Ignoring network latency and queueing delays, which often dominate in distributed systems.",
      "Setting budgets without considering tail latencies (e.g., p99) that can break user experience.",
      "Treating budgets as static when they should be adjusted based on load and failure modes."
    ],
    "related_topics": [
      "sla",
      "tail-latency",
      "distributed-tracing",
      "capacity-planning"
    ]
  },
  "leader-election": {
    "topic": "leader-election",
    "title": "Leader Election",
    "summary": "Leader election is a distributed systems technique where nodes in a cluster agree on a single active coordinator to manage tasks like replication or resource allocation. For example, in a Kafka cluster, one broker is elected as the controller to handle partition leadership and metadata updates. It ensures that only one node acts as the leader at a time, preventing conflicts and maintaining consistency.",
    "why_it_matters": "Engineers must understand leader election to design fault-tolerant systems that avoid split-brain scenarios and continue operating when the current leader fails.",
    "key_points": [
      "Leader election ensures exactly one node acts as the leader at any time, even if multiple nodes are eligible.",
      "Common algorithms include Bully, Raft, and Paxos, each with different trade-offs in simplicity and fault tolerance.",
      "Leaders typically send heartbeats to followers; if heartbeats time out, a new election is triggered.",
      "Elections require a quorum (majority) to avoid conflicting leaders in partitioned networks.",
      "The elected leader is often responsible for coordinating writes, distributing work, or maintaining state."
    ],
    "common_pitfalls": [
      "Assuming that a leader will always be available without handling network partitions, leading to split-brain.",
      "Choosing a non-durable or non-consistent election algorithm that can elect multiple leaders during failures.",
      "Forgetting to handle leader re-election gracefully, causing service downtime or data inconsistency.",
      "Using a single fixed leader without automatic re-election, which defeats the purpose of high availability."
    ],
    "related_topics": [
      "consensus",
      "distributed-locking",
      "raft",
      "zookeeper"
    ]
  },
  "leader-failover": {
    "topic": "leader-failover",
    "title": "Leader Failover",
    "summary": "Leader failover is the process of automatically or manually promoting a standby replica to become the new leader when the current leader fails, ensuring the system remains available. For example, in a PostgreSQL cluster with primary and standby nodes, if the primary crashes, a standby is promoted to primary and clients are redirected to it.",
    "why_it_matters": "Engineers must understand leader failover to design systems that tolerate leader failures without prolonged downtime or data loss.",
    "key_points": [
      "Failover can be automatic (via health checks and consensus) or manual (operator-driven).",
      "The new leader must have the most up-to-date data to avoid losing committed transactions.",
      "Clients and other nodes must be updated to route requests to the new leader.",
      "During failover, the system may experience a brief period of unavailability or read-only mode.",
      "After failover, the old leader may rejoin as a follower, requiring data resynchronization."
    ],
    "common_pitfalls": [
      "Assuming failover is instantaneous; it often takes seconds to minutes.",
      "Ignoring split-brain scenarios where both old and new leaders accept writes.",
      "Not ensuring the promoted replica has caught up with the leader's log before promotion.",
      "Forgetting to update connection strings or service discovery after failover."
    ],
    "related_topics": [
      "consensus-algorithms",
      "replication",
      "high-availability",
      "split-brain"
    ]
  },
  "linearizability": {
    "topic": "linearizability",
    "title": "Linearizability",
    "summary": "Linearizability is a consistency model for distributed systems that makes operations appear to occur atomically at a single point in time between their invocation and response. It ensures that once an operation completes, all subsequent operations see its effect, as if there is a global real-time ordering. For example, if a write to a key completes, any later read of that key must return the new value.",
    "why_it_matters": "Engineers must understand linearizability because it is the strongest single-object consistency guarantee, often required for correctness in systems like distributed locks, leader election, and financial transactions.",
    "key_points": [
      "Operations appear to take effect atomically at some point between their start and end.",
      "If operation A completes before operation B starts, then B must observe A's effect.",
      "Linearizability allows concurrent operations to be ordered arbitrarily, but the order must be consistent with real time.",
      "It is often implemented using consensus algorithms like Raft or Paxos to agree on operation order.",
      "It provides a simple mental model for clients, making reasoning about system behavior easier."
    ],
    "common_pitfalls": [
      "Confusing linearizability with serializability: serializability is about transactions, not single operations.",
      "Assuming that a system with strong consistency (e.g., linearizable) is always available; linearizability often requires trade-offs with availability under network partitions.",
      "Believing that linearizability is free; it typically requires coordination, which adds latency.",
      "Overlooking that linearizability does not guarantee total order across different keys unless using a global total order mechanism."
    ],
    "related_topics": [
      "consistency-models",
      "raft-consensus",
      "distributed-transactions",
      "cap-theorem"
    ]
  },
  "loadbalancing": {
    "topic": "loadbalancing",
    "title": "Load Balancing",
    "summary": "Load balancing distributes incoming network or application traffic across multiple servers to ensure no single server becomes overwhelmed. For example, a web app with three backend servers uses a load balancer to route each user request to the least busy server, improving responsiveness and availability. It also enables horizontal scaling and fault tolerance by automatically rerouting traffic when a server fails.",
    "why_it_matters": "Engineers must understand load balancing to design systems that handle high traffic, avoid single points of failure, and scale reliably.",
    "key_points": [
      "Load balancers sit between clients and servers, distributing requests based on algorithms like round-robin, least connections, or IP hash.",
      "They perform health checks on backend servers and stop sending traffic to unhealthy ones, enabling automatic failover.",
      "Load balancing can be implemented at different layers, such as L4 (transport, using IP and port) or L7 (application, using HTTP headers and URLs).",
      "They can also offload SSL/TLS termination and provide session persistence (sticky sessions) when needed.",
      "Common deployment patterns include a single load balancer, multiple load balancers in active-passive or active-active setups, and global load balancing across regions."
    ],
    "common_pitfalls": [
      "Assuming load balancers are a silver bullet without considering backend statelessness or session affinity requirements.",
      "Misconfiguring health check intervals or thresholds, causing flapping or delayed failover.",
      "Ignoring the load balancer itself as a single point of failure unless it is redundantly deployed.",
      "Using a single load balancing algorithm for all traffic types without considering varying request costs or connection durations."
    ],
    "related_topics": [
      "horizontal-scaling",
      "high-availability",
      "reverse-proxy",
      "dns-round-robin"
    ]
  },
  "local-caches": {
    "topic": "local-caches",
    "title": "Local Caches",
    "summary": "A local cache is a small, fast memory store (such as RAM) that sits close to a single application instance, holding recently or frequently accessed data to avoid repeated slow trips to a remote database or service. For example, a web server might cache user session data in memory so it doesn't query the database on every request. This reduces latency and load on downstream systems.",
    "why_it_matters": "Engineers must understand local caches because they are a fundamental tool for improving performance and scalability, but they introduce consistency and invalidation challenges that can break systems if ignored.",
    "key_points": [
      "Local caches are per-instance, meaning each server or process has its own copy of cached data.",
      "They are typically implemented using in-memory data structures like hash maps or specialized libraries such as Guava Cache or Caffeine.",
      "Cache hits dramatically reduce response time compared to network or disk access, often from milliseconds to microseconds.",
      "Data in a local cache is volatile and lost when the process restarts, so it must be repopulated on startup.",
      "Consistency between multiple instances' caches is not automatic; you need a strategy like TTLs or pub/sub invalidation to keep them fresh."
    ],
    "common_pitfalls": [
      "Assuming all instances have the same cache contents, leading to stale reads when one instance updates data and others don't.",
      "Using a local cache for data that changes frequently without a proper invalidation mechanism, causing users to see outdated information.",
      "Ignoring memory limits and eviction policies, leading to out-of-memory errors or excessive garbage collection.",
      "Not considering cache stampede, where many requests miss the cache simultaneously and overload the backend."
    ],
    "related_topics": [
      "cache-eviction-policies",
      "distributed-cache",
      "cache-aside",
      "time-to-live-ttl"
    ]
  },
  "message-ordering": {
    "topic": "message-ordering",
    "title": "Message Ordering",
    "summary": "Message ordering ensures that messages in a distributed system are processed in the sequence they were sent, even across multiple partitions or consumers. For example, in a chat app, messages from the same sender must appear in the order they were typed, not shuffled. It is often achieved using sequence numbers or single-partition per key.",
    "why_it_matters": "Without ordering guarantees, systems can produce inconsistent state, duplicate updates, or incorrect final results, breaking user trust and data integrity.",
    "key_points": [
      "Ordering can be guaranteed per key or partition, not globally across all messages.",
      "Sequence numbers or timestamps help detect and handle out-of-order arrivals.",
      "Using a single partition per key ensures strict FIFO order for that key.",
      "Exactly-once semantics often require combining ordering with idempotency.",
      "Ordering guarantees trade off with throughput and availability in distributed systems."
    ],
    "common_pitfalls": [
      "Assuming global ordering is feasible when it is not scalable.",
      "Ignoring that consumer failures can cause reordering if offsets are not managed.",
      "Using multiple partitions for the same key without a partitioning strategy.",
      "Overlooking that network retries can reorder messages unless sequence IDs are checked."
    ],
    "related_topics": [
      "exactly-once-semantics",
      "partitioning",
      "idempotency",
      "kafka"
    ]
  },
  "message-partitioning": {
    "topic": "message-partitioning",
    "title": "Message Partitioning",
    "summary": "Message partitioning is the practice of dividing a stream of messages into multiple parallel sub-streams, each handled by a separate consumer or partition, to achieve scalability and parallelism. For example, in Kafka, messages with the same key (like user ID) are routed to the same partition, ensuring ordered processing per key. This allows a system to process millions of events per second by distributing load across many brokers.",
    "why_it_matters": "Engineers must understand partitioning to design scalable, fault-tolerant message systems that preserve ordering guarantees and avoid bottlenecks.",
    "key_points": [
      "Partitioning distributes messages across multiple consumers or brokers to increase throughput and parallelism.",
      "Messages with the same partition key are always sent to the same partition, ensuring order for that key.",
      "The number of partitions determines the maximum parallelism for consuming a topic.",
      "Partitioning enables horizontal scaling by adding more consumers or brokers without redesigning the system.",
      "Partitioning is a core mechanism in systems like Kafka, Kinesis, and RabbitMQ (with sharded queues)."
    ],
    "common_pitfalls": [
      "Choosing a poor partition key that causes hot spots or uneven load across partitions.",
      "Assuming global ordering across all messages when only per-partition ordering is guaranteed.",
      "Increasing partitions without considering consumer rebalancing and stateful processing implications.",
      "Ignoring that partition count is fixed in some systems, requiring careful initial sizing."
    ],
    "related_topics": [
      "consumer-group",
      "message-ordering",
      "kafka",
      "sharding"
    ]
  },
  "messaging": {
    "topic": "messaging",
    "title": "Messaging Systems",
    "summary": "Messaging is a communication pattern where services exchange data asynchronously via a message broker or queue, decoupling producers from consumers. For example, an order service publishes an 'order-created' event, and a payment service subscribes to process it independently.",
    "why_it_matters": "Engineers must understand messaging because it enables scalable, resilient, and loosely coupled architectures, which are fundamental to modern distributed systems.",
    "key_points": [
      "Messages are sent asynchronously, allowing producers to continue without waiting for consumers.",
      "Message brokers (e.g., Kafka, RabbitMQ) manage delivery, ordering, and reliability.",
      "Common patterns include point-to-point queues and publish-subscribe topics.",
      "Messages often carry event data, enabling event-driven architectures.",
      "Delivery guarantees range from at-most-once to exactly-once, affecting system design."
    ],
    "common_pitfalls": [
      "Assuming messages are delivered exactly once when the broker only guarantees at-least-once.",
      "Ignoring message ordering requirements, which can cause inconsistent state.",
      "Making consumers tightly coupled to message schema, breaking evolution.",
      "Overusing synchronous request-reply instead of true async messaging."
    ],
    "related_topics": [
      "event-driven-architecture",
      "message-queues",
      "publish-subscribe",
      "asynchronous-processing"
    ]
  },
  "mutation-semantics": {
    "topic": "mutation-semantics",
    "title": "Mutation Semantics",
    "summary": "Mutation semantics define how and when changes to data become visible to other parts of a system, especially in distributed or concurrent environments. For example, in a key-value store, a write may be immediately visible to the client that issued it but eventually visible to other clients after a replication delay.",
    "why_it_matters": "Engineers must understand mutation semantics to design systems that meet consistency, durability, and performance requirements without surprising behavior.",
    "key_points": [
      "Mutation semantics specify the ordering and visibility of writes, reads, and updates across replicas or threads.",
      "Strong consistency guarantees that all readers see the most recent write, while eventual consistency allows temporary divergence.",
      "Idempotent mutations are operations that can be applied multiple times without changing the result, which is critical for retry logic.",
      "Conflict resolution strategies, such as last-write-wins or version vectors, are part of mutation semantics in distributed systems.",
      "Mutations can be atomic, meaning they all-or-nothing, or non-atomic, which can lead to partial updates."
    ],
    "common_pitfalls": [
      "Assuming that a write is immediately visible to all readers without considering replication lag.",
      "Ignoring the need for idempotency when retrying failed mutations, leading to duplicate side effects.",
      "Using non-atomic mutations in multi-threaded code without proper synchronization, causing race conditions.",
      "Confusing mutation semantics with transaction isolation levels, which are related but distinct."
    ],
    "related_topics": [
      "consistency-models",
      "replication",
      "conflict-resolution",
      "idempotency"
    ]
  },
  "observability": {
    "topic": "observability",
    "title": "Observability",
    "summary": "Observability is the ability to understand a system's internal state from its external outputs, such as logs, metrics, and traces. It helps engineers answer questions like 'why is this slow?' or 'what went wrong?' without guessing. For example, a distributed system might use tracing to see that a specific database query is the bottleneck in a request.",
    "why_it_matters": "Without observability, you cannot effectively debug, optimize, or maintain complex systems in production.",
    "key_points": [
      "Observability relies on three pillars: logs, metrics, and traces.",
      "Logs record discrete events, metrics are numeric aggregations over time, and traces map request paths across services.",
      "Good observability enables rapid root-cause analysis and reduces mean time to resolution (MTTR).",
      "It involves both collecting telemetry data and making it easily queryable and visualized.",
      "Observability is a prerequisite for reliable distributed systems and incident response."
    ],
    "common_pitfalls": [
      "Only collecting logs without metrics or traces, missing the full picture.",
      "Over-instrumenting, which creates noise and high storage costs without actionable insight.",
      "Ignoring correlation between telemetry types, so you can't link a metric spike to a specific trace.",
      "Treating observability as an afterthought instead of designing it into the system from the start."
    ],
    "related_topics": [
      "distributed-tracing",
      "monitoring",
      "logging",
      "metrics"
    ]
  },
  "operation-lifecycle": {
    "topic": "operation-lifecycle",
    "title": "Operation Lifecycle",
    "summary": "Operation lifecycle refers to the sequence of states an operation (like a database transaction, a job, or a request) goes through from creation to completion or failure. It includes states like pending, running, succeeded, failed, and possibly retrying. For example, an order processing job might be created, then run, then either succeed or fail, and if it fails, it might be retried before giving up.",
    "why_it_matters": "Engineers must understand operation lifecycles to design systems that handle failures, retries, and state transitions correctly, ensuring reliability and consistency.",
    "key_points": [
      "An operation typically starts in a pending state, then moves to running, and finally to a terminal state like succeeded or failed.",
      "Operations may have retry states, where a failed operation is re-executed, often with backoff or idempotency keys.",
      "State transitions must be explicit and atomic to avoid race conditions and partial updates.",
      "Persistence of operation state is crucial for recovery after crashes or restarts.",
      "Lifecycle design often includes timeouts and cancellation states to handle stuck or long-running operations."
    ],
    "common_pitfalls": [
      "Forgetting to persist operation state, so a crash loses track of what was happening.",
      "Not handling retries idempotently, causing duplicate side effects.",
      "Assuming operations always succeed, so no failure or rollback paths are designed.",
      "Mixing lifecycle state with business data, leading to inconsistent updates."
    ],
    "related_topics": [
      "distributed-transactions",
      "idempotency",
      "retry-patterns",
      "state-machine"
    ]
  },
  "optimistic-concurrency": {
    "topic": "optimistic-concurrency",
    "title": "Optimistic Concurrency Control",
    "summary": "Optimistic concurrency assumes conflicts are rare and allows multiple users to read and edit the same data without locking. When saving, the system checks if the data has changed since the user's last read; if so, it rejects the update. For example, in a wiki, two editors editing the same page see a conflict message when the second saves, because the version number has changed.",
    "why_it_matters": "Engineers must understand it to design systems that handle concurrent writes without sacrificing availability or causing lost updates, which is critical for user-facing collaborative features.",
    "key_points": [
      "Use a version number, timestamp, or checksum to detect changes since the last read.",
      "On update, include the original version in the condition (e.g., WHERE version = ?) to ensure atomicity.",
      "If the condition fails, the update is rejected and the client must resolve the conflict (e.g., by merging or notifying the user).",
      "Optimistic concurrency works best when conflicts are rare; under high contention, pessimistic locking may be better.",
      "It avoids holding database locks, improving scalability and reducing deadlock risks."
    ],
    "common_pitfalls": [
      "Forgetting to include the version check in the UPDATE statement, leading to lost updates.",
      "Using a timestamp with insufficient precision, causing false conflicts or missed conflicts.",
      "Assuming retries will succeed without handling the conflict response properly.",
      "Applying optimistic concurrency to long-running transactions where conflicts are likely, causing poor user experience."
    ],
    "related_topics": [
      "pessimistic-locking",
      "database-transactions",
      "distributed-systems",
      "last-write-wins"
    ]
  },
  "query-cost-control": {
    "topic": "query-cost-control",
    "title": "Query Cost Control",
    "summary": "Query-cost-control refers to strategies and mechanisms that limit the computational and financial expense of database queries, especially in cloud or multi-tenant systems. For example, a system might cap the number of rows scanned per query or reject queries above a cost threshold to prevent runaway costs. It balances query performance with resource usage to keep operations sustainable.",
    "why_it_matters": "Engineers must understand it to prevent accidental or malicious expensive queries from degrading system performance and causing unexpected cloud bills.",
    "key_points": [
      "Set per-query cost limits based on estimated execution time or rows scanned.",
      "Use query analyzers to estimate cost before execution and reject or queue expensive queries.",
      "Implement rate limiting and concurrency controls to prevent cost spikes from many simultaneous heavy queries.",
      "Cache frequent query results to reduce repeated expensive computations.",
      "Monitor query cost metrics and alert on anomalies to proactively manage spending."
    ],
    "common_pitfalls": [
      "Ignoring cost estimates and allowing any query to run, leading to slow performance and high bills.",
      "Setting limits too strictly, which blocks legitimate complex analytical queries.",
      "Focusing only on query time, not on resource consumption like I/O or CPU, which drives cost.",
      "Forgetting to update cost thresholds as data grows, making previously safe queries become expensive."
    ],
    "related_topics": [
      "database-indexing",
      "caching-strategies",
      "rate-limiting",
      "resource-governance"
    ]
  },
  "queues": {
    "topic": "queues",
    "title": "Queues",
    "summary": "A queue is a first-in, first-out (FIFO) data structure where messages or tasks are processed in the order they arrive. It decouples producers from consumers, allowing asynchronous processing. For example, a web server can enqueue image-processing jobs, and a worker pool processes them in the background.",
    "why_it_matters": "Queues are essential for building scalable, resilient systems by smoothing traffic spikes and preventing data loss during failures.",
    "key_points": [
      "Queues follow FIFO ordering, ensuring messages are processed in the order they were sent.",
      "They enable asynchronous communication between components, improving responsiveness and fault tolerance.",
      "Common implementations include in-memory queues, message brokers like RabbitMQ, and cloud services like SQS.",
      "Queues can buffer bursts of requests, preventing overload of downstream services.",
      "They support at-least-once or exactly-once delivery semantics, depending on the system."
    ],
    "common_pitfalls": [
      "Assuming messages are processed exactly once without understanding delivery guarantees.",
      "Not setting proper timeouts or retry policies, causing messages to be stuck or duplicated.",
      "Using a queue for synchronous request-response patterns, which adds unnecessary latency.",
      "Ignoring backpressure when the queue grows unboundedly, leading to memory or storage exhaustion."
    ],
    "related_topics": [
      "message-brokers",
      "event-driven-architecture",
      "load-leveling",
      "asynchronous-processing"
    ]
  },
  "quorum-commit": {
    "topic": "quorum-commit",
    "title": "Quorum Commit",
    "summary": "Quorum-commit is a consistency protocol where a write is considered durable only after a majority (or a configured quorum) of replicas acknowledge it. For example, in a 3-node database, a write must be acknowledged by at least 2 nodes before it is committed. This ensures that any subsequent read from a quorum will see the latest committed data.",
    "why_it_matters": "Engineers must understand quorum-commit because it directly impacts availability, consistency, and latency trade-offs in distributed systems.",
    "key_points": [
      "A quorum is typically a majority of replicas, but can be weighted or configured differently.",
      "Writes are acknowledged only after the quorum persists the data, preventing lost updates.",
      "Reads must also contact a quorum to ensure they see the most recent committed write.",
      "Quorum-commit is used in systems like etcd, ZooKeeper, and many distributed databases.",
      "It provides a balance between strong consistency and availability under partition."
    ],
    "common_pitfalls": [
      "Assuming that a quorum of writes guarantees linearizability without also using a quorum for reads.",
      "Choosing a quorum size less than half of the nodes, which can lead to split-brain scenarios.",
      "Ignoring the need for a quorum in failure scenarios, leading to stale reads.",
      "Confusing quorum-commit with leader-based replication, where the leader is a single point of failure."
    ],
    "related_topics": [
      "raft-consensus",
      "paxos",
      "linearizability",
      "replication"
    ]
  },
  "rate-limiting": {
    "topic": "rate-limiting",
    "title": "Rate Limiting",
    "summary": "Rate limiting controls how many requests a client can make to a service within a given time window, preventing overload and abuse. For example, an API might allow 100 requests per minute per user, returning HTTP 429 when exceeded. It is typically implemented using algorithms like token bucket or sliding window.",
    "why_it_matters": "Engineers must understand rate limiting to design scalable, resilient systems that protect backend resources and ensure fair usage among clients.",
    "key_points": [
      "Rate limiting defines a maximum number of requests per time window (e.g., 100 requests per minute).",
      "Common algorithms include token bucket, leaky bucket, fixed window, and sliding window log.",
      "Rate limits are often applied per user, IP address, or API key.",
      "Exceeding the limit typically returns HTTP 429 (Too Many Requests) with a Retry-After header.",
      "Rate limiting can be implemented at the API gateway, load balancer, or application layer."
    ],
    "common_pitfalls": [
      "Using a fixed window that allows bursty traffic at window boundaries (e.g., double requests in a short span).",
      "Not considering distributed environments where multiple servers need a shared counter (e.g., Redis).",
      "Setting limits too low, causing legitimate users to be blocked, or too high, failing to protect the system.",
      "Forgetting to return proper headers (e.g., X-RateLimit-Remaining) for client awareness."
    ],
    "related_topics": [
      "api-gateway",
      "load-balancing",
      "caching",
      "backpressure"
    ]
  },
  "read-after-write-consistency": {
    "topic": "read-after-write-consistency",
    "title": "Read-After-Write Consistency",
    "summary": "Read-after-write consistency guarantees that once a write completes, any subsequent read (by the same client or any client, depending on the system) will return that written value, not a stale one. For example, after a user updates their profile picture, a refresh immediately shows the new image, not the old one.",
    "why_it_matters": "Engineers must understand it to avoid user-visible anomalies like disappearing updates or inconsistent data in distributed systems.",
    "key_points": [
      "Read-after-write consistency ensures a write is visible to subsequent reads by the same client immediately.",
      "Stronger forms extend visibility to all clients, while weaker forms only guarantee it for the writer.",
      "It is often achieved via primary-based replication, where writes go to a single authoritative node.",
      "In distributed databases, this consistency level is a trade-off against availability and latency.",
      "Common implementations include using session consistency or quorum-based reads that include the primary."
    ],
    "common_pitfalls": [
      "Assuming that eventual consistency provides read-after-write guarantees, which it does not.",
      "Neglecting to handle client-side caching that may serve stale data after a write.",
      "Using asynchronous replication without ensuring the read is routed to the node that has the latest write.",
      "Overlooking the need to re-read from the primary after a write if using read replicas."
    ],
    "related_topics": [
      "eventual-consistency",
      "replication",
      "quorum",
      "caching"
    ]
  },
  "read-models": {
    "topic": "read-models",
    "title": "Read Models",
    "summary": "A read model is a specialized data structure or view optimized for fast, efficient querying, often derived from the write model or event log. It is a core part of CQRS, allowing reads to be shaped for specific UI or reporting needs without affecting write performance. For example, an e-commerce app might maintain a read model that pre-joins order and customer data for a dashboard, while the write model stores raw events.",
    "why_it_matters": "Engineers must understand read models to design scalable, low-latency systems that separate write and read workloads, especially in event-driven architectures.",
    "key_points": [
      "Read models are optimized for query patterns, not for write integrity or normalization.",
      "They are typically updated asynchronously via event handlers or projections from the write side.",
      "Read models can be stored in different databases or caches (e.g., Redis, Elasticsearch) than the primary write store.",
      "They enable high-performance reads by denormalizing data and precomputing aggregations.",
      "Read models are disposable and can be rebuilt from the event log if needed."
    ],
    "common_pitfalls": [
      "Assuming read models must always be in sync with writes, leading to complex transactional updates.",
      "Over-normalizing read models, which defeats their purpose of fast reads.",
      "Ignoring eventual consistency and not designing for stale data in the read model.",
      "Using the same schema for write and read, missing the benefit of separate optimization."
    ],
    "related_topics": [
      "cqrs",
      "event-sourcing",
      "eventual-consistency",
      "projection"
    ]
  },
  "read-modify-write-races": {
    "topic": "read-modify-write-races",
    "title": "Read-Modify-Write Races",
    "summary": "A read-modify-write race occurs when two or more threads or processes read a shared value, modify it locally, and then write back, leading to lost updates because the operations interleave. For example, two users incrementing a counter concurrently may both read 5, both write 6, and the final value is 6 instead of 7. It is a classic concurrency bug that can corrupt data in distributed systems or multi-threaded applications.",
    "why_it_matters": "Engineers must understand this to design correct concurrent systems, especially when using caches, databases, or distributed counters, because it causes subtle data loss and inconsistency.",
    "key_points": [
      "The race happens when the read, modify, and write steps are not atomic as a single unit.",
      "Atomic operations like compare-and-swap (CAS) or locks prevent this race by ensuring exclusive access.",
      "In distributed systems, optimistic concurrency control (e.g., version numbers) helps detect and retry on conflicts.",
      "Databases often use row-level locks or optimistic locking to avoid lost updates on read-modify-write operations.",
      "High-level abstractions like Redis INCR or SQL UPDATE with conditions are designed to avoid this race safely."
    ],
    "common_pitfalls": [
      "Assuming that a single read and write instruction is atomic without checking the underlying hardware or language guarantees.",
      "Using a non-atomic increment operation (like i++ in Java) without synchronization.",
      "Forgetting to handle retry logic when using optimistic locking, leading to silent failures.",
      "Applying a lock only on the write but not on the read, leaving a window for the race."
    ],
    "related_topics": [
      "atomic-operations",
      "optimistic-locking",
      "mutual-exclusion",
      "lost-update-problem"
    ]
  },
  "read-replication": {
    "topic": "read-replication",
    "title": "Read Replication Basics",
    "summary": "Read replication involves copying data from a primary database to one or more replica databases to handle read traffic. For example, a social media app can route profile views to replicas while writes go to the primary. It improves read scalability and availability but adds complexity in consistency.",
    "why_it_matters": "Engineers must understand it to design systems that scale read-heavy workloads without overloading a single database.",
    "key_points": [
      "Read replicas are asynchronous copies of the primary database, so they may lag behind the latest writes.",
      "Read queries are routed to replicas, while write queries go to the primary to reduce load on the source.",
      "Replication lag can cause stale reads, which is acceptable for some use cases but not for others.",
      "Replicas can be promoted to primary during failover, improving availability.",
      "Common implementations include MySQL replication, PostgreSQL streaming replication, and managed services like AWS RDS read replicas."
    ],
    "common_pitfalls": [
      "Assuming replicas are always up-to-date, leading to data inconsistency in user-facing features.",
      "Routing all reads to replicas without considering lag for critical data like account balances.",
      "Overlooking the need for connection management and routing logic, which adds application complexity.",
      "Forgetting to monitor replication lag, which can silently degrade system correctness."
    ],
    "related_topics": [
      "database-replication",
      "leader-follower",
      "eventual-consistency",
      "read-after-write-consistency"
    ]
  },
  "real-time": {
    "topic": "real-time",
    "title": "Real-Time Systems",
    "summary": "Real-time refers to systems that must process data and respond within a guaranteed time bound, often milliseconds or seconds. It does not mean 'fast' but 'predictable' and 'on time'. For example, a video conferencing app must deliver audio packets within 150ms to avoid perceptible lag.",
    "why_it_matters": "Engineers must understand real-time constraints to design systems that meet latency requirements and avoid catastrophic failures in time-sensitive applications.",
    "key_points": [
      "Real-time means meeting a deadline, not just being fast.",
      "Hard real-time systems have strict deadlines where missing one is a failure (e.g., airbag deployment).",
      "Soft real-time systems tolerate occasional deadline misses (e.g., video streaming).",
      "Latency, throughput, and jitter are key metrics in real-time design.",
      "Real-time often requires dedicated infrastructure like edge computing or specialized protocols."
    ],
    "common_pitfalls": [
      "Confusing real-time with high performance or low average latency.",
      "Ignoring worst-case latency and focusing only on average latency.",
      "Assuming that adding more servers reduces latency in a real-time system.",
      "Overlooking the impact of garbage collection or other non-deterministic operations."
    ],
    "related_topics": [
      "latency",
      "streaming",
      "event-driven-architecture",
      "edge-computing"
    ]
  },
  "replication-cost": {
    "topic": "replication-cost",
    "title": "Replication Cost",
    "summary": "Replication cost is the overhead incurred when data is copied across multiple nodes for redundancy, availability, or read scaling. It includes network bandwidth, storage, and computational resources, and grows with write frequency and replica count. For example, a database with 3 replicas pays 3x write amplification and network traffic for each write.",
    "why_it_matters": "Engineers must understand replication cost to balance durability and performance, as naive replication can degrade write latency and increase infrastructure expenses.",
    "key_points": [
      "Replication cost scales with the number of replicas and write volume, often leading to write amplification.",
      "Synchronous replication ensures consistency but adds latency because writes wait for all replicas to acknowledge.",
      "Asynchronous replication reduces write latency but risks data loss during a primary failure.",
      "Replication consumes network bandwidth and storage, which can become a bottleneck in high-throughput systems.",
      "Choosing the right replication factor is a trade-off between fault tolerance and operational cost."
    ],
    "common_pitfalls": [
      "Assuming more replicas always improve availability without considering the added write cost and network overhead.",
      "Using synchronous replication for high write throughput without accounting for increased latency.",
      "Ignoring the cost of replica catch-up after a network partition or node failure.",
      "Overlooking storage costs when replicating large datasets across many regions."
    ],
    "related_topics": [
      "consistency-models",
      "write-amplification",
      "quorum",
      "leader-follower-replication"
    ]
  },
  "replication-lag": {
    "topic": "replication-lag",
    "title": "Replication Lag",
    "summary": "Replication lag is the delay between when a write is applied to the primary database and when it is applied to a replica. For example, after a user updates their profile, a read from a replica might still return the old version for a few milliseconds. This can cause inconsistent reads in distributed systems.",
    "why_it_matters": "Engineers must understand replication lag to design systems that tolerate eventual consistency and avoid serving stale data to users.",
    "key_points": [
      "Replication lag is measured as the time difference between a write on the primary and its appearance on a replica.",
      "Lag can vary from milliseconds to seconds depending on network, load, and replication method.",
      "Read-your-writes consistency can be achieved by routing reads for a specific user to the primary until lag subsides.",
      "Monitoring replication lag is critical to detect failures or overloaded replicas.",
      "Choosing synchronous replication eliminates lag but reduces availability and throughput."
    ],
    "common_pitfalls": [
      "Assuming replicas are always up-to-date and reading from them for critical data.",
      "Ignoring lag spikes during high write traffic, leading to stale reads.",
      "Using synchronous replication everywhere, which can cause write latency and availability issues.",
      "Not implementing fallback logic when a replica is too far behind."
    ],
    "related_topics": [
      "eventual-consistency",
      "read-replicas",
      "database-replication",
      "consistency-models"
    ]
  },
  "resource-modeling": {
    "topic": "resource-modeling",
    "title": "Resource Modeling",
    "summary": "Resource modeling is the practice of defining the structure, relationships, and constraints of the core entities (resources) in a system, such as users, orders, or files. It involves deciding how these resources are represented in APIs, databases, and caches, and how they interact. For example, in a ride-sharing app, you model 'Driver', 'Rider', and 'Trip' resources with their fields and associations to support matching and fare calculation.",
    "why_it_matters": "Engineers must understand resource modeling because it directly shapes the system's scalability, maintainability, and API design, and poor modeling leads to rigid, hard-to-evolve systems.",
    "key_points": [
      "Resources are the core nouns of a system, and their attributes and relationships form the data contract between services and clients.",
      "Good resource modeling aligns with the API design, using RESTful conventions like plural nouns and standard HTTP methods for CRUD operations.",
      "Model resources based on usage patterns and access patterns, not just on how data is stored, to optimize for performance and scalability.",
      "Consider lifecycle and state transitions of resources, such as pending, active, or archived, to handle business rules and consistency.",
      "Use identifiers (like UUIDs) and versioning to allow resources to evolve without breaking clients."
    ],
    "common_pitfalls": [
      "Over-modeling with too many fine-grained resources that create chatty APIs and excessive network calls.",
      "Under-modeling by treating every database table as a resource, leading to leaky abstractions that expose internal storage details.",
      "Ignoring relationships and cardinality, resulting in inefficient queries or inconsistent data when resources are linked.",
      "Forgetting to account for resource size and growth, leading to payloads that are too large or unbounded collections."
    ],
    "related_topics": [
      "api-design",
      "data-modeling",
      "database-schema",
      "restful-apis"
    ]
  },
  "rest-resources": {
    "topic": "rest-resources",
    "title": "REST Resources",
    "summary": "REST resources are the key abstractions in a RESTful API, representing entities like users, orders, or products, each identified by a unique URI. For example, a resource for a specific user might be accessed via GET /users/123. They are manipulated using standard HTTP methods (GET, POST, PUT, DELETE) to perform CRUD operations.",
    "why_it_matters": "Understanding resources is essential for designing scalable, maintainable, and predictable APIs that clients can easily consume.",
    "key_points": [
      "A resource is a named object or entity, typically a noun, such as 'user' or 'invoice'.",
      "Each resource has a unique URI, like /users/123, that serves as its address.",
      "HTTP methods map to actions: GET reads, POST creates, PUT/PATCH updates, DELETE removes.",
      "Resources can have sub-resources, e.g., /users/123/orders for a user's orders.",
      "Resources are decoupled from their representation; the same resource can be returned as JSON, XML, etc."
    ],
    "common_pitfalls": [
      "Using verbs in resource URIs, like /getUser, instead of nouns and HTTP methods.",
      "Exposing internal database structures directly as resources without abstraction.",
      "Over-fetching or under-fetching data by not designing resource granularity appropriately.",
      "Ignoring status codes and using 200 for all responses, even on errors."
    ],
    "related_topics": [
      "http-methods",
      "restful-api-design",
      "uri-design",
      "crud-operations"
    ]
  },
  "row-locking": {
    "topic": "row-locking",
    "title": "Row Locking",
    "summary": "Row-locking is a database concurrency control technique where a transaction locks only the specific rows it needs to modify or read, allowing other transactions to access different rows concurrently. For example, in a banking system, two users can update their own account balances simultaneously without blocking each other, as long as they touch different rows. This reduces contention compared to locking entire tables or pages.",
    "why_it_matters": "Understanding row-locking is essential for designing scalable, high-throughput systems that must handle many concurrent transactions without performance degradation or data corruption.",
    "key_points": [
      "Row-level locks are acquired on individual rows, typically in SQL databases like MySQL InnoDB or PostgreSQL, to prevent conflicting writes.",
      "Lock modes include shared (read) locks and exclusive (write) locks, which follow compatibility rules to allow concurrent reads but block writes to the same row.",
      "Row-locking increases concurrency by allowing transactions on different rows to proceed in parallel, but it adds overhead for lock management and can lead to deadlocks if not handled carefully.",
      "In practice, row-locking is often implemented with multi-version concurrency control (MVCC) to let readers see a consistent snapshot without blocking writers.",
      "The scope of a row lock can be extended to gaps or index ranges, known as gap locks or next-key locks, to prevent phantom reads in certain isolation levels."
    ],
    "common_pitfalls": [
      "Assuming row-locking automatically prevents all concurrency issues, while ignoring isolation levels and lock escalation.",
      "Forgetting to release locks promptly, leading to long-held locks that reduce throughput and increase deadlock probability.",
      "Using row-locking in a distributed database where locks are not local, causing high network overhead or performance bottlenecks.",
      "Misunderstanding that row-locking does not protect against lost updates unless combined with explicit locking or optimistic concurrency control."
    ],
    "related_topics": [
      "multi-version-concurrency-control",
      "isolation-levels",
      "deadlock-detection",
      "lock-escalation"
    ]
  },
  "security": {
    "topic": "security",
    "title": "System Security",
    "summary": "Security in system design refers to protecting data, resources, and services from unauthorized access, attacks, and breaches. It involves authentication, authorization, encryption, and network-level controls. For example, a chat app uses TLS to encrypt messages in transit and OAuth for user login.",
    "why_it_matters": "Engineers must understand security to build systems that protect user data and maintain trust, as a single vulnerability can lead to data loss, legal liability, and reputational damage.",
    "key_points": [
      "Use defense in depth: layer multiple security controls (e.g., firewalls, encryption, access controls) so a single failure doesn't compromise the system.",
      "Authenticate users and services before granting access, and enforce least-privilege authorization for all actions.",
      "Encrypt data at rest and in transit using strong protocols like AES-256 and TLS 1.3.",
      "Apply security patches and updates regularly to mitigate known vulnerabilities.",
      "Design for threat modeling: identify potential attack vectors and mitigate them proactively."
    ],
    "common_pitfalls": [
      "Relying on security through obscurity, such as hiding endpoints instead of proper authentication.",
      "Storing passwords in plaintext or using weak hashing algorithms like MD5.",
      "Ignoring input validation, leading to SQL injection or XSS attacks.",
      "Assuming the network is safe and skipping encryption for internal communication."
    ],
    "related_topics": [
      "authentication",
      "authorization",
      "encryption",
      "api-gateway"
    ]
  },
  "serverless-cold-starts": {
    "topic": "serverless-cold-starts",
    "title": "Serverless Cold Starts",
    "summary": "A cold start is the delay that occurs when a serverless function is invoked after being idle, requiring the cloud provider to initialize the runtime and load your code before execution. For example, an AWS Lambda function that hasn't been called for 15 minutes may take an extra 1-2 seconds to respond, compared to a warm instance that responds in milliseconds. This latency can impact user experience, especially for synchronous APIs.",
    "why_it_matters": "Engineers must understand cold starts to design serverless systems that meet latency requirements and avoid unexpected performance degradation under variable traffic patterns.",
    "key_points": [
      "Cold starts happen when a new execution environment is created, including loading the runtime and initializing code outside the handler.",
      "Warm starts occur when an existing instance is reused, typically after a function has been invoked recently.",
      "Provisioned concurrency can pre-warm instances to eliminate cold starts but adds cost.",
      "Languages like Java and .NET have slower cold starts than Python or Node.js due to runtime initialization.",
      "Cold start duration varies by cloud provider, memory size, and package size; larger memory often reduces startup time."
    ],
    "common_pitfalls": [
      "Assuming all invocations have the same latency and not testing cold start behavior.",
      "Ignoring the effect of VPC configuration, which can add seconds to cold starts due to ENI creation.",
      "Over-optimizing for cold starts by keeping functions warm with pings, which can lead to unnecessary cost and complexity.",
      "Placing critical synchronous endpoints on serverless without considering cold start impact on user-facing latency."
    ],
    "related_topics": [
      "lambda-provisioned-concurrency",
      "serverless-architecture",
      "latency-optimization",
      "event-driven-design"
    ]
  },
  "shared-filesystems": {
    "topic": "shared-filesystems",
    "title": "Shared Filesystems",
    "summary": "A shared filesystem is a storage system that allows multiple servers or processes to access the same files concurrently over a network, providing a unified namespace. It abstracts the underlying storage and enables data consistency across nodes. For example, NFS (Network File System) lets multiple web servers read the same uploaded images from a central file server.",
    "why_it_matters": "Engineers must understand shared filesystems because they are a common building block in distributed systems for sharing state, configuration, or user-generated content, and they introduce trade-offs in performance, consistency, and availability.",
    "key_points": [
      "Shared filesystems provide a single namespace accessible by many clients over a network, hiding the distribution of data.",
      "They often use protocols like NFS, SMB, or Lustre, each with different performance and consistency characteristics.",
      "They can be implemented as network-attached storage (NAS) or as distributed filesystems like HDFS or CephFS.",
      "Consistency models vary: some offer strong consistency (e.g., NFS with locks) while others offer eventual consistency (e.g., S3-like object stores).",
      "They are often used for shared configuration, logs, or user uploads, but may become bottlenecks under heavy write workloads."
    ],
    "common_pitfalls": [
      "Assuming all shared filesystems provide strong consistency, leading to stale reads in eventually consistent systems.",
      "Ignoring network latency and bandwidth limits, causing performance degradation compared to local disks.",
      "Forgetting to handle file locking and concurrent writes, leading to data corruption or lost updates.",
      "Treating a shared filesystem as infinitely scalable without considering metadata server bottlenecks."
    ],
    "related_topics": [
      "distributed-storage",
      "network-protocols",
      "consistency-models",
      "nfs"
    ]
  },
  "single-point-of-failure": {
    "topic": "single-point-of-failure",
    "title": "Single Point of Failure",
    "summary": "A single point of failure (SPOF) is a component in a system whose failure causes the entire system to fail. For example, if a web application relies on one database server and that server crashes, the whole application becomes unavailable. Eliminating SPOFs involves adding redundancy and designing for fault tolerance.",
    "why_it_matters": "Engineers must identify and mitigate SPOFs to ensure high availability and reliability, as any unaddressed SPOF can lead to costly downtime and user-facing outages.",
    "key_points": [
      "A single point of failure is any component that, if it fails, brings down the entire system or a critical function.",
      "Common SPOFs include a single server, a single network link, a single database, or a single load balancer.",
      "Redundancy (e.g., multiple servers, active-passive or active-active setups) is the primary way to eliminate SPOFs.",
      "SPOFs can exist at any layer: hardware, software, network, or even human processes (e.g., a single person with critical knowledge).",
      "Designing for failure involves regular testing of failover mechanisms to ensure they actually work when needed."
    ],
    "common_pitfalls": [
      "Assuming that adding a second component automatically removes the SPOF without checking for shared dependencies (e.g., both servers on the same power source).",
      "Overlooking the SPOF in the failover mechanism itself, such as a single orchestration script that controls all redundancy.",
      "Ignoring the SPOF in the data path, like a single network switch or a single storage array.",
      "Failing to test failover scenarios, leading to a false sense of security until a real failure occurs."
    ],
    "related_topics": [
      "high-availability",
      "redundancy",
      "failover",
      "fault-tolerance"
    ]
  },
  "split-brain": {
    "topic": "split-brain",
    "title": "Split-Brain Syndrome",
    "summary": "Split-brain occurs when a distributed system's nodes lose communication with each other but continue operating independently, leading to conflicting states. For example, two database replicas accept writes during a network partition, resulting in divergent data. This can cause data loss, inconsistencies, and incorrect behavior when the partition heals.",
    "why_it_matters": "Engineers must understand split-brain to design systems that avoid data corruption and ensure consistency during network failures.",
    "key_points": [
      "Split-brain happens when a network partition isolates nodes into groups that each believe they are the primary.",
      "It leads to multiple nodes accepting writes or serving requests, causing conflicting updates and data divergence.",
      "Quorum-based consensus (e.g., majority voting) is a common technique to prevent split-brain by requiring a majority to elect a leader.",
      "Fencing tokens and generation numbers help ensure that stale leaders cannot continue to act after a partition.",
      "Split-brain can be mitigated with automatic recovery, but manual intervention may be required in severe cases."
    ],
    "common_pitfalls": [
      "Assuming that network partitions are rare and not designing for them.",
      "Using a simple 'ping' or timeout to determine if a peer is dead, which can be unreliable.",
      "Failing to implement a quorum or lease mechanism, allowing both sides to act as primary.",
      "Ignoring the need for a fencing mechanism to stop old leaders from writing after a new leader is elected."
    ],
    "related_topics": [
      "consensus-algorithms",
      "network-partition",
      "leader-election",
      "quorum"
    ]
  },
  "static-site-generation": {
    "topic": "static-site-generation",
    "title": "Static Site Generation",
    "summary": "Static site generation (SSG) is a technique that builds HTML pages at build time, producing a set of static files that can be served directly to users without server-side processing. For example, a blog built with Next.js or Gatsby pre-renders all posts into HTML files, which are then hosted on a CDN for fast delivery.",
    "why_it_matters": "Engineers must understand SSG because it offers superior performance, security, and scalability compared to dynamic rendering, and it's a key decision in modern web architecture.",
    "key_points": [
      "SSG pre-renders all pages at build time, so no server-side rendering is needed at request time.",
      "The output is a set of static files (HTML, CSS, JS) that can be cached and served from a CDN.",
      "SSG works best for content that doesn't change frequently, like blogs, documentation, and marketing sites.",
      "Build time increases with the number of pages, so large sites may need incremental builds or on-demand generation.",
      "SSG often pairs with headless CMSs and can be integrated with client-side data fetching for dynamic content."
    ],
    "common_pitfalls": [
      "Assuming SSG is suitable for highly personalized or real-time data without a fallback strategy.",
      "Forgetting to invalidate or rebuild static pages when content changes, leading to stale data.",
      "Overlooking build-time performance for large sites, causing slow deployments.",
      "Mixing dynamic routes incorrectly, resulting in pages not being generated at build time."
    ],
    "related_topics": [
      "cdn-caching",
      "server-side-rendering",
      "incremental-static-regeneration",
      "headless-cms"
    ]
  },
  "storage": {
    "topic": "storage",
    "title": "Storage Systems",
    "summary": "Storage refers to how data is persisted and retrieved in a system, ranging from local disks to distributed databases. It involves trade-offs between speed, durability, cost, and scalability. For example, a relational database like PostgreSQL stores structured data with ACID guarantees, while an object store like S3 handles large unstructured files.",
    "why_it_matters": "Engineers must understand storage because it directly impacts performance, reliability, and cost, and poor choices can lead to bottlenecks or data loss.",
    "key_points": [
      "Storage types include block, file, and object, each suited for different use cases.",
      "Databases can be relational (SQL) or non-relational (NoSQL), with different consistency and scaling models.",
      "Caching (e.g., Redis) improves read latency but adds consistency complexity.",
      "Replication and partitioning are key strategies for durability and scalability.",
      "Storage latency and throughput vary dramatically across tiers (e.g., SSD vs. HDD vs. network)."
    ],
    "common_pitfalls": [
      "Assuming all storage is equally fast and ignoring latency differences.",
      "Overusing a single database type for all workloads, leading to poor fit.",
      "Neglecting backup and durability requirements, risking data loss.",
      "Forgetting to plan for capacity growth and cost escalation."
    ],
    "related_topics": [
      "database",
      "caching",
      "replication",
      "sharding"
    ]
  },
  "thread-pools": {
    "topic": "thread-pools",
    "title": "Thread Pools",
    "summary": "A thread pool is a collection of pre-created worker threads that are reused to execute tasks from a queue. Instead of creating a new thread for each request, the pool assigns tasks to idle threads, which reduces overhead and improves responsiveness. For example, a web server uses a thread pool to handle incoming HTTP requests without spawning thousands of threads.",
    "why_it_matters": "Engineers must understand thread pools to design scalable, efficient concurrent systems that avoid resource exhaustion and latency spikes.",
    "key_points": [
      "Thread pools limit the number of concurrent threads, preventing system overload from unbounded thread creation.",
      "Tasks are submitted to a queue, and idle worker threads pick them up, reducing per-task thread creation overhead.",
      "Pool size should be tuned based on workload type: CPU-bound tasks benefit from smaller pools near core count, while I/O-bound tasks may need larger pools.",
      "Thread pools provide a way to manage thread lifecycle, including reuse, shutdown, and graceful termination.",
      "Common implementations include fixed, cached, and scheduled thread pools, each with different sizing and behavior."
    ],
    "common_pitfalls": [
      "Setting the pool size too large can cause excessive context switching and memory pressure.",
      "Blocking tasks inside a pool can starve other tasks if the pool is too small.",
      "Forgetting to shut down the pool can lead to resource leaks in long-running applications.",
      "Using a thread pool for very short tasks may add more overhead than benefit due to queueing."
    ],
    "related_topics": [
      "concurrency",
      "task-queue",
      "executor-service",
      "load-balancing"
    ]
  },
  "transaction-isolation": {
    "topic": "transaction-isolation",
    "title": "Transaction Isolation Levels",
    "summary": "Transaction isolation controls how concurrently running transactions see each other's uncommitted or committed changes. It balances data consistency against performance, with levels like Read Uncommitted, Read Committed, Repeatable Read, and Serializable. For example, under Read Committed, a transaction won't see another's uncommitted writes, but it may see different committed values across reads.",
    "why_it_matters": "Engineers must understand isolation to prevent anomalies like dirty reads, non-repeatable reads, and phantom reads, which can corrupt application logic in high-concurrency systems.",
    "key_points": [
      "Isolation levels define the degree to which one transaction is isolated from the effects of other concurrent transactions.",
      "Higher isolation levels (e.g., Serializable) provide stronger consistency but reduce concurrency and throughput.",
      "Lower isolation levels (e.g., Read Uncommitted) increase performance but risk data anomalies.",
      "Databases implement isolation using locking, multiversion concurrency control (MVCC), or a combination of both.",
      "The default isolation level varies by database; for example, PostgreSQL defaults to Read Committed, while MySQL InnoDB defaults to Repeatable Read."
    ],
    "common_pitfalls": [
      "Assuming that a higher isolation level is always better without considering performance trade-offs.",
      "Confusing isolation with atomicity, which is about all-or-nothing execution, not visibility of changes.",
      "Ignoring the difference between statement-level and transaction-level consistency, especially in long-running transactions.",
      "Not testing for anomalies like phantom reads when using Repeatable Read in databases that don't fully prevent them."
    ],
    "related_topics": [
      "acid-properties",
      "mvcc",
      "database-locking",
      "concurrency-control"
    ]
  },
  "vertical-scaling": {
    "topic": "vertical-scaling",
    "title": "Vertical Scaling",
    "summary": "Vertical scaling means adding more power (CPU, RAM, disk) to a single server to handle increased load. For example, upgrading a database server from 16GB to 64GB RAM to speed up queries. It is simpler than horizontal scaling but has hard physical limits and can become expensive.",
    "why_it_matters": "Engineers must understand vertical scaling because it's often the first step in handling growth, but knowing its limits helps decide when to move to distributed architectures.",
    "key_points": [
      "Vertical scaling increases the capacity of a single machine by adding resources like CPU, memory, or storage.",
      "It is typically easier to implement because no code changes are required for distribution.",
      "There is a maximum hardware limit per machine, so it cannot scale indefinitely.",
      "Cost grows non-linearly: doubling resources often costs more than double the price.",
      "It can create a single point of failure; if the server goes down, the entire system is affected."
    ],
    "common_pitfalls": [
      "Assuming vertical scaling can handle unlimited growth without considering hardware ceilings.",
      "Ignoring downtime during upgrades, as adding resources often requires restarting the server.",
      "Overlooking that vertical scaling does not improve fault tolerance or availability.",
      "Choosing vertical scaling for high-availability needs without a failover plan."
    ],
    "related_topics": [
      "horizontal-scaling",
      "load-balancing",
      "replication",
      "caching"
    ]
  },
  "webhook-callbacks": {
    "topic": "webhook-callbacks",
    "title": "Webhook Callbacks",
    "summary": "A webhook is an HTTP callback that one service sends to another in real-time when an event occurs, rather than the receiving service polling for updates. For example, a payment processor sends a POST request to your server's /payment-completed endpoint after a transaction succeeds, so you can update the order status immediately.",
    "why_it_matters": "Engineers must understand webhooks because they enable event-driven architectures, reduce latency and load compared to polling, and are a standard integration pattern across modern APIs.",
    "key_points": [
      "A webhook is an HTTP POST (or other method) sent from a provider to a consumer's registered URL when a specific event happens.",
      "The consumer must expose a publicly accessible endpoint to receive the webhook payload, typically in JSON or XML.",
      "Webhooks are asynchronous and push-based, meaning the provider initiates the request without the consumer asking.",
      "Reliability requires retry logic, idempotency handling, and signature verification to ensure delivery and security.",
      "Common use cases include payment notifications, CI/CD build status updates, and messaging app integrations."
    ],
    "common_pitfalls": [
      "Forgetting to verify the webhook signature, leading to accepting spoofed requests.",
      "Not implementing idempotency, so duplicate events cause duplicate side effects.",
      "Assuming the webhook will be delivered exactly once, but in practice it may be retried or arrive out of order.",
      "Failing to respond quickly (e.g., with a 200) to the webhook, causing the provider to retry unnecessarily."
    ],
    "related_topics": [
      "event-driven-architecture",
      "http-api-design",
      "idempotency",
      "message-queues"
    ]
  },
  "workload-skew": {
    "topic": "workload-skew",
    "title": "Workload Skew",
    "summary": "Workload skew occurs when a subset of keys or partitions receives a disproportionately large share of requests or data, causing uneven load across a distributed system. For example, in a social media app, a celebrity's profile might get millions of reads while most other profiles get few, overloading the node hosting that celebrity's data.",
    "why_it_matters": "Engineers must understand workload skew because it can lead to hot spots, performance degradation, and system failures if not anticipated and mitigated.",
    "key_points": [
      "Skew can be data skew (uneven data distribution) or access skew (uneven request rates).",
      "Consistent hashing helps distribute keys but does not solve skew if some keys are inherently hot.",
      "Mitigations include partitioning hot keys, using caching, or adding replication for hot data.",
      "Monitoring and dynamic rebalancing are essential to detect and handle skew in production.",
      "Skew is often the root cause of the thundering herd problem and system outages."
    ],
    "common_pitfalls": [
      "Assuming uniform key distribution without checking real access patterns.",
      "Using a simple hash function that maps hot keys to the same node.",
      "Ignoring skew until after a node fails due to overload.",
      "Over-provisioning all nodes to handle worst-case skew instead of designing for it."
    ],
    "related_topics": [
      "consistent-hashing",
      "hot-partition",
      "load-balancing",
      "data-partitioning"
    ]
  },
  "write-ordering": {
    "topic": "write-ordering",
    "title": "Write-Ordering Basics",
    "summary": "Write-ordering refers to the sequence in which write operations are applied to a storage system or database. It ensures that concurrent writes are applied in a consistent order, often using mechanisms like sequence numbers or timestamps. For example, in a distributed key-value store, if two clients update the same key, write-ordering ensures the last write (by logical clock) wins, preventing lost updates.",
    "why_it_matters": "Engineers must understand write-ordering to design systems that maintain data consistency and avoid race conditions, especially in distributed or replicated environments.",
    "key_points": [
      "Write-ordering defines the total order of write operations across replicas or nodes.",
      "It is often achieved using sequence numbers, timestamps, or version vectors.",
      "In distributed systems, write-ordering is crucial for conflict resolution and replication consistency.",
      "Stronger ordering (e.g., linearizability) comes at the cost of higher latency and lower availability.",
      "Write-ahead logs and consensus protocols (like Raft) rely on write-ordering to guarantee durability and consistency."
    ],
    "common_pitfalls": [
      "Assuming that network arrival order matches write order without explicit ordering mechanisms.",
      "Using wall-clock timestamps for ordering, which can be skewed across machines.",
      "Ignoring the need for ordering when implementing read-after-write consistency.",
      "Overusing strong ordering when eventual consistency would suffice, leading to performance bottlenecks."
    ],
    "related_topics": [
      "consistency-models",
      "distributed-transactions",
      "replication",
      "conflict-resolution"
    ]
  },
  "write-through-caching": {
    "topic": "write-through-caching",
    "title": "Write-Through Caching",
    "summary": "Write-through caching is a strategy where every write to the cache is synchronously written to the underlying data store before acknowledging success. This ensures the cache is always consistent with the database, but adds latency to write operations. For example, a user profile update would be written to both the Redis cache and the MySQL database before returning a success response.",
    "why_it_matters": "Engineers must understand write-through caching because it provides strong data consistency at the cost of write latency, making it a critical trade-off when designing systems that require both speed and reliability.",
    "key_points": [
      "In write-through caching, the cache is updated first, then the database, and the write is considered complete only after both succeed.",
      "This approach guarantees that the cache never holds stale data relative to the database, eliminating cache invalidation complexity.",
      "Write-through caching is best suited for read-heavy workloads where consistency is more important than write performance.",
      "Because every write incurs the full latency of a database write, write throughput is limited by the database's write speed.",
      "It is often combined with a read-through or cache-aside strategy to optimize read paths."
    ],
    "common_pitfalls": [
      "Assuming write-through caching improves write performance; it actually adds overhead compared to direct database writes.",
      "Forgetting that a failed database write after a cache write can leave the cache inconsistent if not handled transactionally.",
      "Using write-through caching for write-heavy workloads where the added latency is not acceptable.",
      "Not considering that the cache must be highly available, otherwise writes may fail if the cache goes down."
    ],
    "related_topics": [
      "cache-aside",
      "write-back-caching",
      "cache-invalidation",
      "eventual-consistency"
    ]
  }
};

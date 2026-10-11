# Ten architecture challenges

Ready-to-edit educational posts. These are authored marketing examples, not additions to the adaptive card catalog. Each answer depends on the stated constraints. Publish the scenario and choices first; reveal the explanation afterward.

## 1. Slow uploads

Processing takes 20 seconds; acknowledge accepted uploads within 300 ms and survive worker restarts.

- **A:** Process in the request.
- **B:** Store durably and enqueue a durable job.
- **C:** Start an in-memory task after responding.

**Answer: B.** Separate durable acceptance from processing. A misses the response budget; C can lose work on restart. Make job retries idempotent.

**Architecture:** Client → API → durable file + queue → worker → result.

**What changes the decision?** If processing is cheap and bounded, synchronous execution may be simpler.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_01). Free to start; no account required.

## 2. A hot product page

A public product catalog changes hourly. Global anonymous readers can tolerate 60 seconds of stale data.

- **A:** Cache public responses at the CDN with a 60-second TTL.
- **B:** Send every read to the origin database.
- **C:** Cache personalized responses under a shared URL.

**Answer: A.** Edge caching reduces origin traffic and distance. B wastes work on repeated reads; C risks exposing user-specific data. Only cache suitable public responses.

**Architecture:** Reader → CDN → origin on cache miss.

**What changes the decision?** Strictly fresh prices or personalized content need different cache rules.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_02). Free to start; no account required.

## 3. Read your own update

Users must immediately see their own profile edits. Database replicas can lag by two seconds; unrelated reads tolerate that lag.

- **A:** Send all reads to replicas.
- **B:** Use the primary for reads requiring read-after-write consistency.
- **C:** Add a longer browser cache TTL.

**Answer: B.** Route consistency-sensitive reads to the primary. A may show an old value; C can prolong staleness. Replica reads remain useful where lag is acceptable.

**Architecture:** Edit → primary; immediate profile read → primary.

**What changes the decision?** A replication-position mechanism can safely enable replica reads after catch-up.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_03). Free to start; no account required.

## 4. Repeated payment webhooks

A provider retries the same payment event. Crediting the account twice is unacceptable.

- **A:** Credit on every delivery.
- **B:** Ignore every event delivered after one second.
- **C:** Atomically record the event ID and credit once in one transaction.

**Answer: C.** Atomic deduplication and the credit share a transaction. A duplicates credits; B loses valid delayed events. Authenticate the webhook and retain IDs for the retry window.

**Architecture:** Webhook → authenticated handler → transaction: event ID + credit.

**What changes the decision?** Different event IDs for the same business action also require a business-level uniqueness rule.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_04). Free to start; no account required.

## 5. A burst of email jobs

Traffic bursts for one minute. Emails may arrive within five minutes; each accepted job must survive process restart.

- **A:** Use a durable queue and bounded workers.
- **B:** Spawn an unbounded thread for every email.
- **C:** Discard jobs when all workers are busy.

**Answer: A.** A queue buffers bursts while bounded concurrency protects downstream services. B can exhaust resources; C violates accepted-job durability. Monitor backlog and retry limits.

**Architecture:** API → durable queue → bounded workers → email provider.

**What changes the decision?** Sustained demand above service capacity still requires scaling or admission control.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_05). Free to start; no account required.

## 6. One noisy API client

One client can consume all API capacity. You need a per-client request budget enforced across multiple gateway instances.

- **A:** Keep independent counters on each instance.
- **B:** Coordinate per-client limits through an atomic shared counter or limiter.
- **C:** Apply one global limit with no client identity.

**Answer: B.** Shared atomic enforcement avoids multiplying a client’s budget across instances. A can exceed the intended budget; C lets one client consume everyone’s allowance.

**Architecture:** Client → gateway → shared limiter → API.

**What changes the decision?** Define behavior during limiter failure and choose a window or token-bucket policy.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_06). Free to start; no account required.

## 7. Objects or database blobs

An app stores 100 MB videos plus searchable metadata. Users download videos directly; the API queries metadata.

- **A:** Put all video bytes in SQL rows.
- **B:** Store videos in API process memory.
- **C:** Store bytes in object storage and metadata in a database.

**Answer: C.** Object storage suits large durable objects; the database supports metadata queries. A burdens database storage and backups; B is not durable. Authorize downloads appropriately.

**Architecture:** Client → authorized object upload; API → metadata database.

**What changes the decision?** Tiny transactional blobs may reasonably remain in a database.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_07). Free to start; no account required.

## 8. A celebrity’s partition

User-ID sharding works for ordinary accounts, but one celebrity account receives most reads.

- **A:** Add shards without changing the celebrity’s key placement.
- **B:** Cache hot reads and distribute or replicate their serving path.
- **C:** Make every read scan all shards.

**Answer: B.** A hot key remains hot after adding ordinary shards. Target its read traffic with caching and distribution; C amplifies work. Check freshness requirements before caching.

**Architecture:** Readers → distributed cache → celebrity shard on miss.

**What changes the decision?** Write-heavy hot keys need a different partitioning or coordination strategy.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_08). Free to start; no account required.

## 9. One regional outage

An acknowledged order must not be lost if the primary region fails immediately. Cross-region latency is acceptable.

- **A:** Acknowledge before asynchronously replicating.
- **B:** Commit to durable replicas in independent regions before acknowledging.
- **C:** Copy backups nightly.

**Answer: B.** Acknowledgment must follow the required cross-region durability. A has a loss window; C can lose a day of orders. Define the failure model, quorum, and unavailable-region behavior.

**Architecture:** Order → cross-region durable commit → acknowledgment.

**What changes the decision?** A weaker recovery-point objective can justify asynchronous replication.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_09). Free to start; no account required.

## 10. Live chat delivery

Connected chat users need low-latency incoming messages. Offline users must still see their messages later.

- **A:** Use WebSockets for delivery and a durable message store for history.
- **B:** Store messages only in each WebSocket server’s memory.
- **C:** Send a push notification and never persist the message.

**Answer: A.** A live connection delivers promptly while durable storage supports reconnects and history. B and C lose the authoritative record. Define ordering and reconnect cursors.

**Architecture:** Sender → durable message store → delivery service → WebSocket → recipient.

**What changes the decision?** Infrequent updates may work well with polling or server-sent events.

**Call to action:** Practice more architecture trade-offs with [Decked](https://decked.pages.dev/?utm_source=challenge&utm_medium=social&utm_campaign=first_learners&utm_content=challenge_10). Free to start; no account required.

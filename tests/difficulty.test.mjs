import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

import {
  countScenarioRequirements,
  difficultyFromScenario,
  requirementsLabel
} from '../functions/shared/requirement-count.js';
import { normalizeCard, validateGeneratedCard } from '../functions/api/generate.js';

/* Hand-computed requirement counts for every card in the corpus. Keeping
   these expectations explicit makes the classifier's rules auditable. */
const CORPUS = [
  {
    id: 'fallback-cache-001', topic: 'caching', difficulty: 3, count: 3,
    scenario: 'A news website serves articles to millions of daily readers. The most popular 100 articles generate 80% of traffic.'
  },
  {
    id: 'fallback-queue-001', topic: 'queues', difficulty: 2, count: 2,
    scenario: 'A payment service processes 500 charges per second. Each charge calls an external bank API that takes 1-5 seconds to respond.'
  },
  {
    id: 'fallback-db-001', topic: 'databases', difficulty: 2, count: 2,
    scenario: 'A social media app stores user posts. Users view their timeline (latest 50 posts) and a global trending feed. Writes spike 10x during events.'
  },
  {
    id: 'fallback-consensus-001', topic: 'consensus', difficulty: 2, count: 2,
    scenario: 'A distributed config service stores cluster membership for 5 nodes. All nodes must agree on who is in the cluster.'
  },
  {
    id: 'fallback-api-001', topic: 'api-design', difficulty: 1, count: 0,
    scenario: 'A ride-hailing API is used by third-party apps (airlines, hotels) to book rides on behalf of users.'
  },
  {
    id: 'caching-gen-1785292361000', topic: 'caching', difficulty: 4, count: 4,
    scenario: 'You are designing a product catalog API for an e-commerce flash-sale platform serving 15,000 QPS. Each product response (15 KB) includes price, inventory count, and description stored in Postgres. Prices and inventory change in real time during flash sales. The latency budget is 50 ms. The team must choose a caching strategy that balances freshness, latency, and operational cost.'
  },
  {
    id: 'queues-gen-1785292786255', topic: 'queues', difficulty: 5, count: 6,
    scenario: 'You are designing the booking engine for a concert ticketing platform. During on-sale events, 500,000 concurrent users submit 50,000 booking requests per second for 20,000 total seats. Each request must be processed in order per seat category and confirmed within 500 ms. Double-bookings are unacceptable. The team must choose a queuing architecture that balances ordering guarantees, throughput, and operational complexity.'
  },
  {
    id: 'api-design-gen-1785309798717', topic: 'api-design', difficulty: 4, count: 4,
    scenario: 'You are designing a REST API for a personalized content feed that serves 20,000 QPS with a p99 latency under 50ms. Each response is approximately 10KB. New content must appear in the feed within 500ms of publication. You must choose a caching strategy that balances latency, consistency, and cost.'
  },
  {
    id: 'api-design-gen-1785310091829', topic: 'api-design', difficulty: 4, count: 4,
    scenario: 'Design an API for a real-time news feed that must handle 10,000 QPS with peaks at 20,000 QPS. Each response is 50KB. Latency must be under 100ms. The system must trade off strong consistency for low latency due to high read volume.'
  },
  {
    id: 'caching-gen-1785307918737', topic: 'caching', difficulty: 5, count: 5,
    scenario: 'Design a caching layer for a social media feed API. The API handles 5,000 QPS for feed reads. Each feed request aggregates 50 posts from a database of 100 million posts, and the database response time is 150ms. The latency requirement is under 50ms. The trade-off is between serving slightly stale cached data to reduce latency and the high cost of scaling the database to meet latency demands.'
  },
  {
    id: 'caching-gen-1785308045999', topic: 'caching', difficulty: 5, count: 6,
    scenario: 'Your team is designing a caching layer for a social media feed system serving 10,000 requests per second (p99 < 200ms). Each feed is 50KB and generated from the latest posts from friends. There are 2,000 write requests per second for new posts. The feed must show recent content, and stale data is acceptable for up to 5 seconds. Your chief concern is minimizing caching infrastructure costs while meeting latency and freshness requirements.'
  },
  {
    id: 'consensus-gen-1785307992817', topic: 'consensus', difficulty: 5, count: 6,
    scenario: 'Design the consensus layer for a distributed payment system that must process 20,000 transactions per second with p99 latency under 50ms. Each transaction is 2KB and requires strict serializability. The system operates across three data centers within a region (max RTT 10ms). You must choose a consensus protocol that balances performance and strong consistency.'
  },
  {
    id: 'databases-gen-1785703513422', topic: 'databases', difficulty: 5, count: 5,
    scenario: 'Design the database layer for a ride-sharing platform with 1M drivers and 5M riders. Writes: 100K new bookings per day. Reads: 20,000 read-heavy requests per second. The system must keep read-after-write consistency for bookings. You must choose a database architecture that balances consistency and availability.'
  },
  {
    id: 'databases-gen-1785307990105', topic: 'databases', difficulty: 5, count: 8,
    scenario: 'Design a database backend for a social media feed service that handles 1M QPS reads, 10K QPS writes (post creation), with p99 latency <20ms. Total data size is 10TB growing 1TB/month. The service requires strong consistency for read-after-write for user\'s own posts but can tolerate eventual consistency for others.'
  },
  {
    id: 'observability-gen-1785703511340', topic: 'observability', difficulty: 5, count: 6,
    scenario: 'A Kubernetes-based ridesharing platform handles 10,000 req/s; each request emits 500B of logs and 200B of traces. The SRE team needs to query across services with sub-2s latency for the past 24 hours while minimizing cost. The system includes Istio, NGINX, Kafka, and PostgreSQL.'
  },
  {
    id: 'observability-gen-1785703525081', topic: 'observability', difficulty: 5, count: 6,
    scenario: 'A microservices checkout platform handles 50k requests/s at p99 100ms. Each request generates ~15 spans, so the tracing pipeline receives 750k spans/s. The team wants 30-day trace retention and sub-second trace queries, but the storage budget is only $10k/month. Design an observability pipeline that balances trace fidelity, query latency, and cost.'
  },
  {
    id: 'queues-gen-1785309937957', topic: 'queues', difficulty: 5, count: 7,
    scenario: 'Design a system to process 1,000 orders per second (each 1 KB) with at-least-once delivery and a maximum processing latency of 500 ms. Traffic spikes up to 2,000 QPS are expected. The system must avoid duplicate processing while keeping costs reasonable.'
  },
  {
    id: 'queues-gen-1785307791427', topic: 'queues', difficulty: 5, count: 5,
    scenario: 'Design a real-time order processing system for a food delivery app handling 10,000 orders/sec (5KB each). The system must deliver orders to restaurants in order per restaurant and ensure no duplicate orders. You have a 2-second SLA. Choose a queuing solution that balances throughput, ordering, and durability.'
  }
];

test('every corpus card classifies to its hand-computed requirement count', () => {
  for (const card of CORPUS) {
    const { count, requirements } = countScenarioRequirements(card.scenario);
    assert.equal(
      count,
      card.count,
      `${card.id}: expected ${card.count} requirements, classifier found ${count} (${JSON.stringify(requirements)})`
    );
  }
});

test('every corpus card difficulty equals its requirement-derived difficulty', () => {
  for (const card of CORPUS) {
    assert.equal(card.difficulty, difficultyFromScenario(card.scenario), card.id);
  }
});

test('difficulty clamps to the 1-5 scale', () => {
  assert.equal(difficultyFromScenario(''), 1);
  assert.equal(difficultyFromScenario('A ride-hailing API is used by third parties.'), 1);
  assert.equal(
    difficultyFromScenario('An API must serve 1,000 QPS. It must also serve 2,000 QPS. It must also serve 3,000 QPS. It must also serve 4,000 QPS. It must also serve 5,000 QPS. It must also serve 6,000 QPS.'),
    5
  );
});

test('directive clauses without numbers are not requirements', () => {
  const { count, requirements } = countScenarioRequirements(
    'You must choose a strategy that balances latency, consistency, and cost.'
  );
  assert.equal(count, 0);
  assert.deepEqual(requirements, []);
});

test('directive clauses carrying concrete numbers are counted', () => {
  const { count } = countScenarioRequirements(
    'Design an API that must handle 10,000 QPS with p99 latency under 50ms.'
  );
  assert.equal(count, 2);
});

test('requirementsLabel produces a readable breakdown', () => {
  const label = requirementsLabel(
    'An API serves 20,000 QPS with p99 latency under 50ms. New content must appear within 500ms of publication.'
  );
  assert.match(label, /20,000 QPS/);
  assert.match(label, /50ms/);
  assert.match(label, /500ms/);
});

test('client mirror in js/cards.js agrees with the server classifier', async () => {
  const source = await readFile(new URL('../js/cards.js', import.meta.url), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  for (const card of CORPUS) {
    assert.equal(
      ctx.countScenarioRequirements(card.scenario).count,
      countScenarioRequirements(card.scenario).count,
      `${card.id} client/server count mismatch`
    );
    assert.equal(ctx.difficultyFromScenario(card.scenario), difficultyFromScenario(card.scenario), card.id);
  }
  for (const seed of vm.runInContext('SEED_CARDS', ctx)) {
    assert.equal(
      seed.difficulty,
      difficultyFromScenario(seed.scenario),
      `seed card ${seed.id} difficulty does not match its requirement count`
    );
  }
});

test('normalizeCard stamps the requirement-derived difficulty, not the requested one', () => {
  const card = {
    id: 'x', topic: 'caching',
    scenario: 'An API serves 20,000 QPS with p99 latency under 50ms and must keep data fresh within 500ms.',
    options: []
  };
  const normalized = normalizeCard(card, 'caching', 2);
  assert.equal(normalized.difficulty, 3);
});

test('generation validation rejects scenarios with no concrete requirements', () => {
  assert.throws(
    () => validateGeneratedCard({
      id: 'x', topic: 'caching', difficulty: 2,
      prerequisiteTopics: [],
      scenario: 'Design a cache for a social feed.',
      nodes: ['a', 'b', 'c'],
      flows: [
        { from: 'a', to: 'b', verb: 'requests', kind: 'sync' },
        { from: 'b', to: 'c', verb: 'queries', kind: 'sync' }
      ],
      options: ['A', 'B', 'C', 'D'].map(id => ({ id, label: 'Option ' + id, prerequisiteTopics: ['a', 'b'] })),
      correct: 'A',
      explanation: 'This explanation is intentionally long enough to pass the minimum length check.'
    }, 'A'),
    /at least one concrete requirement/
  );
});

test('generation validation rejects flows that reference unknown nodes', () => {
  assert.throws(
    () => validateGeneratedCard({
      id: 'x', topic: 'caching', difficulty: 2,
      prerequisiteTopics: [],
      scenario: 'An API serves 20,000 QPS and must keep data fresh within 500ms.',
      nodes: ['a', 'b', 'c'],
      flows: [
        { from: 'a', to: 'ghost', verb: 'requests', kind: 'sync' },
        { from: 'ghost', to: 'c', verb: 'queries', kind: 'sync' }
      ],
      options: ['A', 'B', 'C', 'D'].map(id => ({ id, label: 'Option ' + id, prerequisiteTopics: ['a', 'b'] })),
      correct: 'A',
      explanation: 'This explanation is intentionally long enough to pass the minimum length check.'
    }, 'A'),
    /flows must reference distinct node names/
  );
});

test('generation validation rejects unlabeled base flows', () => {
  assert.throws(
    () => validateGeneratedCard({
      id: 'x', topic: 'caching', difficulty: 2,
      prerequisiteTopics: [],
      scenario: 'An API serves 20,000 QPS and must keep data fresh within 500ms.',
      nodes: ['a', 'b', 'c'],
      flows: [
        { from: 'a', to: 'b', verb: '', kind: 'sync' },
        { from: 'b', to: 'c', verb: 'queries', kind: 'sync' }
      ],
      options: ['A', 'B', 'C', 'D'].map(id => ({ id, label: 'Option ' + id, prerequisiteTopics: ['a', 'b'] })),
      correct: 'A',
      explanation: 'This explanation is intentionally long enough to pass the minimum length check.'
    }, 'A'),
    /flows must have non-empty labels/
  );
});

test('generation validation rejects flows that leave a node unconnected', () => {
  assert.throws(
    () => validateGeneratedCard({
      id: 'x', topic: 'caching', difficulty: 2,
      prerequisiteTopics: [],
      scenario: 'An API serves 20,000 QPS and must keep data fresh within 500ms.',
      nodes: ['a', 'b', 'c', 'd'],
      flows: [
        { from: 'a', to: 'b', verb: 'requests', kind: 'sync' },
        { from: 'b', to: 'c', verb: 'queries', kind: 'sync' },
        { from: 'c', to: 'b', verb: 'acks', kind: 'callback' }
      ],
      options: ['A', 'B', 'C', 'D'].map(id => ({ id, label: 'Option ' + id, prerequisiteTopics: ['a', 'b'] })),
      correct: 'A',
      explanation: 'This explanation is intentionally long enough to pass the minimum length check.'
    }, 'A'),
    /appears in no flow/
  );
});

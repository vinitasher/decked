import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest, onRequestPost, normalizeFeedback, buildIssue, buildIssueBody } from '../functions/api/feedback.js';
import { DEFAULT_REPOSITORY } from '../functions/shared/feedback-diagnostics.js';

const goodInput = {
  category: 'bug',
  title: 'Cache eviction card is wrong',
  details: 'The LRU/LFU explanation swaps the two policies and the example contradicts the text.',
  contact: 'user@example.com',
  pagePath: '/session',
  userId: 'dev-1234abcd'
};

function kvStore() {
  const store = new Map();
  return {
    get: async (key, type) => store.get(key)?.value ?? null,
    put: async (key, value, options) => { store.set(key, { value, options }); },
    store
  };
}

function env(overrides = {}) {
  return {
    CARD_CACHE: kvStore(),
    GITHUB_TOKEN: 'test-token',
    ...overrides
  };
}

function post(body, headerOverrides = {}, rawBody) {
  return new Request('https://example.com/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headerOverrides },
    body: rawBody ?? JSON.stringify(body)
  });
}

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = originalFetch; };
}

function githubOk(handler = () => {}) {
  return async (url, options) => {
    if (String(url).startsWith('https://api.github.com')) {
      handler(url, options);
      return Response.json({ html_url: 'https://github.com/vinitasher/decked/issues/7' }, { status: 201 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

test('feedback endpoint rejects non-POST methods', async () => {
  const response = await onRequest({
    request: new Request('https://example.com/api/feedback', { method: 'GET' }),
    env: env()
  });
  assert.equal(response.status, 405);
});

test('feedback endpoint rejects invalid JSON bodies', async () => {
  const response = await onRequestPost({
    request: post(null, {}, 'not json'),
    env: env()
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Request body must be valid JSON.');
});

test('feedback endpoint requires category, title, details, and userId', async () => {
  const response = await onRequestPost({
    request: post({ category: 'bug', details: 'x', userId: 'y' }),
    env: env()
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'Request body must include category, title, details, and userId.');
  assert.ok(body.missing.includes('title'));
});

test('normalizeFeedback trims input, caps lengths, and defaults pagePath', () => {
  const { value, missing } = normalizeFeedback({
    category: 'idea',
    title: `  ${'t'.repeat(500)}  `,
    details: '  Some details.  ',
    contact: 'c'.repeat(500),
    userId: 'dev-1'
  });
  assert.deepEqual(missing, []);
  assert.equal(value.title.length, 120);
  assert.equal(value.details, 'Some details.');
  assert.equal(value.contact.length, 120);
  assert.equal(value.pagePath, '/feedback');
  const unknownCategory = normalizeFeedback({ category: 'hack', title: 't', details: 'd', userId: 'u' });
  assert.equal(unknownCategory.value.category, null);
  assert.deepEqual(unknownCategory.missing, ['category']);
});

test('buildIssue prefixes the title and buildIssueBody attaches metadata', () => {
  const record = { category: 'bug', title: 'Broken explanation', details: 'The text contradicts itself.', contact: 'alice', pagePath: '/cards/caching', userId: 'dev-1' };
  const issue = buildIssue(record, DEFAULT_REPOSITORY);
  assert.equal(issue.repository, DEFAULT_REPOSITORY);
  assert.equal(issue.title, '[System Design Flashcards] Feedback (bug): Broken explanation');
  const body = buildIssueBody(record);
  assert.ok(body.includes('Category: bug'));
  assert.ok(body.includes('Page: /cards/caching'));
  assert.ok(body.includes('Browser ID: dev-1'));
  assert.ok(body.includes('Contact: alice'));
  assert.ok(body.includes('The text contradicts itself.'));
});

test('feedback endpoint stores the record and creates a GitHub issue', async () => {
  const store = kvStore();
  let requestSeen = null;
  const restore = mockFetch(githubOk((url, options) => { requestSeen = { url, options, body: JSON.parse(options.body) }; }));
  try {
    const response = await onRequestPost({ request: post(goodInput), env: env({ CARD_CACHE: store }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.issueStatus, 'created');
    assert.equal(body.issueUrl, 'https://github.com/vinitasher/decked/issues/7');
    assert.ok(body.feedbackId.startsWith('feedback-'));

    const recordKeys = [...store.store.keys()].filter(key => key.startsWith('feedback:'));
    assert.equal(recordKeys.length, 1, 'record persisted under feedback: prefix');
    const record = JSON.parse(store.store.get(recordKeys[0]).value);
    assert.equal(record.issueStatus, 'created', 'record updated with issue result');

    assert.equal(requestSeen.url, `https://api.github.com/repos/${DEFAULT_REPOSITORY}/issues`);
    assert.equal(requestSeen.options.headers.Authorization, 'Bearer test-token');
    assert.equal(requestSeen.options.headers['X-GitHub-Api-Version'], '2022-11-28');
    assert.equal(requestSeen.body.title, '[System Design Flashcards] Feedback (bug): Cache eviction card is wrong');
    assert.ok(requestSeen.body.body.includes('Browser ID: dev-1234abcd'));
    assert.equal(requestSeen.body.labels, undefined, 'no labels unless configured');
  } finally {
    restore();
  }
});

test('feedback endpoint applies configured issue labels', async () => {
  let requestSeen = null;
  const restore = mockFetch(githubOk((url, options) => { requestSeen = JSON.parse(options.body); }));
  try {
    await onRequestPost({
      request: post(goodInput),
      env: env({ GITHUB_ISSUE_LABELS: ' feedback , bug ' })
    });
    assert.deepEqual(requestSeen.labels, ['feedback', 'bug']);
  } finally {
    restore();
  }
});

test('feedback endpoint honors a GITHUB_REPOSITORY override', async () => {
  let requestSeen = null;
  const restore = mockFetch(githubOk((url, options) => { requestSeen = { url, options }; }));
  try {
    await onRequestPost({
      request: post(goodInput),
      env: env({ GITHUB_REPOSITORY: 'vinitasher/system-design-playground' })
    });
    assert.match(requestSeen.url, /repos\/vinitasher\/system-design-playground\/issues$/);
  } finally {
    restore();
  }
});

test('feedback endpoint rate-limits five submissions per ten-minute window per IP', async () => {
  const store = kvStore();
  const restore = mockFetch(githubOk());
  try {
    for (let i = 0; i < 5; i++) {
      const response = await onRequestPost({ request: post(goodInput), env: env({ CARD_CACHE: store }) });
      assert.equal(response.status, 200, `submission ${i + 1}`);
    }
    const blocked = await onRequestPost({ request: post(goodInput), env: env({ CARD_CACHE: store }) });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('Retry-After')) >= 1);
    const otherIp = await onRequestPost({
      request: post(goodInput, { 'CF-Connecting-IP': '198.51.100.9' }),
      env: env({ CARD_CACHE: store })
    });
    assert.equal(otherIp.status, 200, 'a different IP is not blocked');
    assert.ok([...store.store.keys()].some(key => /^feedback-rate:\d+:203\.0\.113\.7$/.test(key)));
  } finally {
    restore();
  }
});

test('feedback endpoint enforces Turnstile when a secret key is configured', async () => {
  const restore = mockFetch(async url => {
    if (String(url).startsWith('https://challenges.cloudflare.com')) {
      return Response.json({ success: true });
    }
    return Response.json({ html_url: 'https://github.com/vinitasher/decked/issues/9' }, { status: 201 });
  });
  try {
    const withoutToken = await onRequestPost({
      request: post(goodInput),
      env: env({ TURNSTILE_SECRET_KEY: 'secret' })
    });
    assert.equal(withoutToken.status, 403);
    assert.equal((await withoutToken.json()).error, 'Turnstile verification is required.');

    const withToken = await onRequestPost({
      request: post({ ...goodInput, turnstileToken: 'valid-token' }),
      env: env({ TURNSTILE_SECRET_KEY: 'secret' })
    });
    assert.equal(withToken.status, 200);
  } finally {
    restore();
  }
});

test('feedback endpoint stores the record and returns 200 even when issue creation is skipped', async () => {
  const store = kvStore();
  const response = await onRequestPost({
    request: post(goodInput),
    env: env({ GITHUB_TOKEN: undefined, CARD_CACHE: store })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.issueStatus, 'skipped');
  assert.equal(body.issueUrl, null);
  const record = [...store.store.values()].find(entry => entry.value.includes('"issueStatus"'));
  assert.ok(record, 'record still stored without a token');
});

test('feedback endpoint stores the record and reports a failed issue without dropping the 200', async () => {
  const restore = mockFetch(async () => new Response('Bad credentials', { status: 401 }));
  try {
    const response = await onRequestPost({ request: post(goodInput), env: env() });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.issueStatus, 'failed');
    assert.ok(body.issueError.includes('401'));
  } finally {
    restore();
  }
});

test('feedback endpoint fails clearly when the KV store binding is missing', async () => {
  const response = await onRequestPost({ request: post(goodInput), env: { GITHUB_TOKEN: 'x' } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'CARD_CACHE is not configured for this Pages deployment.');
});

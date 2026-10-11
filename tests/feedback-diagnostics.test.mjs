import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeedbackDiagnostics,
  parseLabels,
  parseRepository,
  DEFAULT_REPOSITORY
} from '../functions/shared/feedback-diagnostics.js';
import { FEEDBACK_RATE_LIMIT_MAX, FEEDBACK_RATE_LIMIT_WINDOW_SECONDS } from '../functions/shared/feedback-security.js';

test('diagnostics report ready when the GitHub token is configured', () => {
  const diagnostics = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token', CARD_CACHE: {} });
  assert.equal(diagnostics.githubIssueCreation.enabled, true);
  assert.equal(diagnostics.githubIssueCreation.status, 'ready');
  assert.equal(diagnostics.githubIssueCreation.reason, null);
  assert.equal(diagnostics.feedbackStorageConfigured, true);
});

test('diagnostics fall back to the default repository when none is configured', () => {
  const diagnostics = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token' });
  assert.equal(diagnostics.githubIssueCreation.enabled, true);
  assert.equal(diagnostics.githubIssueCreation.labelsConfigured, false);
});

test('diagnostics report missing_token without a GitHub token', () => {
  const diagnostics = buildFeedbackDiagnostics({});
  assert.equal(diagnostics.githubIssueCreation.enabled, false);
  assert.equal(diagnostics.githubIssueCreation.status, 'missing_token');
  assert.equal(diagnostics.githubIssueCreation.reason, 'GITHUB_TOKEN is not configured.');
  assert.equal(diagnostics.feedbackStorageConfigured, false);
});

test('diagnostics report invalid_repository for malformed owner/repo values', () => {
  const diagnostics = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token', GITHUB_REPOSITORY: 'not-a-repo' });
  assert.equal(diagnostics.githubIssueCreation.enabled, false);
  assert.equal(diagnostics.githubIssueCreation.status, 'invalid_repository');
  assert.match(diagnostics.githubIssueCreation.reason, /owner\/repo format/);
});

test('diagnostics parse comma-separated labels', () => {
  const diagnostics = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token', GITHUB_ISSUE_LABELS: ' feedback , bug, ' });
  assert.deepEqual(diagnostics.githubIssueCreation.labels, ['feedback', 'bug']);
  assert.equal(diagnostics.githubIssueCreation.labelsConfigured, true);
});

test('diagnostics report turnstile and rate limit configuration', () => {
  const withSecret = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token', TURNSTILE_SECRET_KEY: 'secret' });
  assert.equal(withSecret.turnstileProtection.enabled, true);
  assert.equal(withSecret.turnstileProtection.status, 'ready');

  const withoutSecret = buildFeedbackDiagnostics({ GITHUB_TOKEN: 'token' });
  assert.equal(withoutSecret.turnstileProtection.enabled, false);
  assert.equal(withoutSecret.turnstileProtection.status, 'missing_secret');

  assert.equal(withoutSecret.rateLimit.enabled, true);
  assert.equal(withoutSecret.rateLimit.maxSubmissions, FEEDBACK_RATE_LIMIT_MAX);
  assert.equal(withoutSecret.rateLimit.windowSeconds, FEEDBACK_RATE_LIMIT_WINDOW_SECONDS);
});

test('parseRepository validates owner/repo pairs', () => {
  assert.deepEqual(parseRepository('vinitasher/decked'), { owner: 'vinitasher', repo: 'decked', valid: true });
  assert.equal(parseRepository('').valid, false);
  assert.equal(parseRepository('vinitasher').valid, false);
  assert.equal(parseRepository('a/b/c').valid, false);
});

test('DEFAULT_REPOSITORY points at the flashcards home repository', () => {
  assert.equal(DEFAULT_REPOSITORY, 'vinitasher/decked');
});

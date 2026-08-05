/* Feedback configuration diagnostics — reports which pieces of the feedback
   pipeline are configured, mirroring the system-design playground's
   feedbackDiagnostics pattern. */

import { FEEDBACK_RATE_LIMIT_MAX, FEEDBACK_RATE_LIMIT_WINDOW_SECONDS } from './feedback-security.js';

export const DEFAULT_REPOSITORY = 'vinitasher/mamaLab';

export function buildFeedbackDiagnostics(env) {
  const token = env.GITHUB_TOKEN?.trim() ?? '';
  const repository = (env.GITHUB_REPOSITORY?.trim() ?? '') || DEFAULT_REPOSITORY;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim() ?? '';
  const labels = parseLabels(env.GITHUB_ISSUE_LABELS);
  const repositoryInfo = parseRepository(repository);

  let status = 'ready';
  let reason = null;
  if (!token) {
    status = 'missing_token';
    reason = 'GITHUB_TOKEN is not configured.';
  } else if (!repository) {
    status = 'missing_repository';
    reason = 'GITHUB_REPOSITORY is not configured.';
  } else if (!repositoryInfo.valid) {
    status = 'invalid_repository';
    reason = 'GITHUB_REPOSITORY must be in owner/repo format.';
  }

  return {
    feedbackStorageConfigured: Boolean(env.CARD_CACHE),
    githubIssueCreation: {
      enabled: status === 'ready',
      status,
      reason,
      labelsConfigured: labels.length > 0,
      labels
    },
    turnstileProtection: {
      enabled: Boolean(turnstileSecret),
      status: turnstileSecret ? 'ready' : 'missing_secret',
      reason: turnstileSecret ? null : 'TURNSTILE_SECRET_KEY is not configured.'
    },
    rateLimit: {
      enabled: true,
      maxSubmissions: FEEDBACK_RATE_LIMIT_MAX,
      windowSeconds: FEEDBACK_RATE_LIMIT_WINDOW_SECONDS
    }
  };
}

export function parseLabels(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function parseRepository(repository) {
  const [owner, repo, ...extra] = repository.split('/');
  return {
    owner,
    repo,
    valid: Boolean(owner && repo && extra.length === 0)
  };
}

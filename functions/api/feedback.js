/* Cloudflare Pages Function — file user feedback from the flashcard app as a
   GitHub issue. Mirrors the system-design playground's feedback flow: every
   submission is stored in KV, Turnstile and per-IP rate limiting protect the
   endpoint, and the issue is filed when GITHUB_TOKEN and GITHUB_REPOSITORY are
   configured. The response is always 200 once the submission is stored; issue
   creation failures are reported as issueStatus, never lost. */

import { buildFeedbackDiagnostics, parseLabels, parseRepository, DEFAULT_REPOSITORY } from '../shared/feedback-diagnostics.js';
import { enforceFeedbackRateLimit, getClientIp, verifyTurnstileToken } from '../shared/feedback-security.js';
import { createServerRequestContext, logServerEvent } from '../shared/server-logger.js';

const CATEGORIES = ['bug', 'idea', 'ux', 'content', 'other'];
const TITLE_MAX = 120;
const DETAILS_MAX = 10000;
const CONTACT_MAX = 120;
const PAGE_PATH_MAX = 256;
const USER_ID_MAX = 64;

export function normalizeFeedback(input) {
  const category = CATEGORIES.includes(input?.category) ? input.category : null;
  const title = normalizeText(input?.title, TITLE_MAX);
  const details = normalizeText(input?.details, DETAILS_MAX);
  const contact = normalizeText(input?.contact, CONTACT_MAX);
  const pagePath = normalizeText(input?.pagePath, PAGE_PATH_MAX) || '/feedback';
  const userId = normalizeText(input?.userId, USER_ID_MAX);
  const turnstileToken = normalizeText(input?.turnstileToken, 4096);
  const missing = [
    category ? null : 'category',
    title ? null : 'title',
    details ? null : 'details',
    userId ? null : 'userId'
  ].filter(Boolean);
  return { value: { category, title, details, contact, pagePath, userId, turnstileToken }, missing };
}

export function buildIssue(record, repository) {
  return {
    title: `[System Design Flashcards] Feedback (${record.category}): ${record.title}`,
    body: buildIssueBody(record),
    repository
  };
}

export function buildIssueBody(record) {
  return [
    `Category: ${record.category}`,
    `Page: ${record.pagePath}`,
    `Browser ID: ${record.userId}`,
    record.contact ? `Contact: ${record.contact}` : null,
    '',
    'Details:',
    record.details
  ]
    .filter(line => line !== null)
    .join('\n');
}

export function onRequest(context) {
  return jsonResponse(
    { error: 'Method not allowed' },
    405,
    createServerRequestContext('feedback', context.request),
    'request rejected',
    { reason: 'Method not allowed.' }
  );
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const log = createServerRequestContext('feedback', request);
  const store = env.CARD_CACHE;
  if (!store) {
    return jsonResponse(
      { error: 'CARD_CACHE is not configured for this Pages deployment.' },
      503,
      log,
      'request rejected',
      { reason: 'CARD_CACHE is not configured.' }
    );
  }

  logServerEvent(log, 'request received', {
    clientIp: getClientIp(request.headers),
    hasGithubToken: Boolean(env.GITHUB_TOKEN?.trim()),
    hasGithubRepository: Boolean(env.GITHUB_REPOSITORY?.trim()),
    turnstileConfigured: Boolean(env.TURNSTILE_SECRET_KEY?.trim())
  });

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, log, 'request rejected', { reason: 'Request body must be valid JSON.' });
  }

  if (!isRecord(body)) {
    return jsonResponse({ error: 'Request body must include feedback fields.' }, 400, log, 'request rejected', { reason: 'Request body must include feedback fields.' });
  }

  const { value, missing } = normalizeFeedback(body);
  if (missing.length > 0) {
    return jsonResponse(
      { error: 'Request body must include category, title, details, and userId.', missing },
      400,
      log,
      'request rejected',
      { reason: 'Missing required feedback fields.', missing }
    );
  }

  const rateLimit = await enforceFeedbackRateLimit(store, request.headers);
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: 'Too many feedback submissions from this IP. Please wait and try again.',
        retryAfterSeconds: rateLimit.retryAfterSeconds
      },
      429,
      log,
      'request rejected',
      { reason: 'Feedback rate limit exceeded.', currentCount: rateLimit.currentCount, retryAfterSeconds: rateLimit.retryAfterSeconds },
      { 'Retry-After': String(rateLimit.retryAfterSeconds) }
    );
  }

  logServerEvent(log, 'feedback rate limit accepted', {
    clientIp: getClientIp(request.headers),
    currentCount: rateLimit.currentCount
  });

  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? '';
  if (turnstileSecretKey) {
    const turnstileResult = await verifyTurnstileToken({
      secretKey: turnstileSecretKey,
      token: value.turnstileToken,
      headers: request.headers
    });

    if (!turnstileResult.allowed) {
      return jsonResponse(
        { error: turnstileResult.reason || 'Turnstile verification failed.' },
        403,
        log,
        'request rejected',
        { reason: turnstileResult.reason || 'Turnstile verification failed.', turnstileConfigured: true }
      );
    }

    logServerEvent(log, 'Turnstile verification accepted', { clientIp: getClientIp(request.headers) });
  } else {
    logServerEvent(log, 'Turnstile verification skipped', { reason: 'TURNSTILE_SECRET_KEY is not configured.' }, 'warn');
  }

  const createdAt = new Date().toISOString();
  const record = {
    id: `feedback-${createdAt.replace(/[:.]/g, '-')}-${randomId()}`,
    createdAt,
    ...value,
    issueStatus: 'skipped',
    issueUrl: null,
    issueError: null
  };

  await store.put(feedbackKey(record.id), JSON.stringify(record));
  logServerEvent(log, 'submission stored', { feedbackId: record.id, category: record.category, pagePath: record.pagePath });

  const issueResult = await maybeCreateGitHubIssue(env, record, log);
  record.issueStatus = issueResult.issueStatus;
  record.issueUrl = issueResult.issueUrl;
  record.issueError = issueResult.issueError;

  await store.put(feedbackKey(record.id), JSON.stringify(record));
  logServerEvent(log, 'issue creation result', {
    feedbackId: record.id,
    issueStatus: record.issueStatus,
    issueUrl: record.issueUrl,
    issueError: record.issueError
  });

  return jsonResponse(
    {
      ok: true,
      feedbackId: record.id,
      storedAt: record.createdAt,
      issueStatus: record.issueStatus,
      issueUrl: record.issueUrl,
      issueError: record.issueError
    },
    200,
    log,
    'request completed',
    { feedbackId: record.id, issueStatus: record.issueStatus }
  );
}

async function maybeCreateGitHubIssue(env, record, log) {
  const diagnostics = buildFeedbackDiagnostics(env);
  const token = env.GITHUB_TOKEN?.trim();
  if (!diagnostics.githubIssueCreation.enabled) {
    logServerEvent(
      log,
      'GitHub issue creation skipped',
      { feedbackId: record.id, status: diagnostics.githubIssueCreation.status, reason: diagnostics.githubIssueCreation.reason },
      'warn'
    );
    return { issueStatus: 'skipped', issueUrl: null, issueError: diagnostics.githubIssueCreation.reason };
  }

  const repository = env.GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const repositoryInfo = parseRepository(repository);
  if (!repositoryInfo.valid) {
    logServerEvent(log, 'GitHub repository format is invalid', { feedbackId: record.id, repository }, 'error');
    return { issueStatus: 'failed', issueUrl: null, issueError: 'GITHUB_REPOSITORY must be in owner/repo format.' };
  }

  try {
    const labels = parseLabels(env.GITHUB_ISSUE_LABELS);
    const { title, body } = buildIssue(record, repository);
    const response = await fetch(`https://api.github.com/repos/${repositoryInfo.owner}/${repositoryInfo.repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'system-design-flashcards',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        title,
        body,
        ...(labels.length ? { labels } : {})
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logServerEvent(
        log,
        'GitHub issue creation failed',
        { feedbackId: record.id, repository, status: response.status, statusText: response.statusText, errorText },
        'error'
      );
      return {
        issueStatus: 'failed',
        issueUrl: null,
        issueError: `GitHub issue creation failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
      };
    }

    const payload = await response.json().catch(() => null);
    logServerEvent(log, 'GitHub issue created', { feedbackId: record.id, repository, issueUrl: payload?.html_url ?? null });
    return { issueStatus: 'created', issueUrl: payload?.html_url ?? null, issueError: null };
  } catch (error) {
    logServerEvent(
      log,
      'GitHub issue creation threw',
      { feedbackId: record.id, repository, error: error instanceof Error ? error.message : String(error) },
      'error'
    );
    return { issueStatus: 'failed', issueUrl: null, issueError: error instanceof Error ? error.message : 'Unable to create GitHub issue.' };
  }
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function feedbackKey(feedbackId) {
  return `feedback:${feedbackId}`;
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

function jsonResponse(payload, status, log, event = 'response sent', details, headers) {
  if (log) {
    logServerEvent(log, event, { status, ...(details ?? {}) }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(headers ?? {})
    }
  });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

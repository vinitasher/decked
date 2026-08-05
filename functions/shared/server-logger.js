/* Structured request logging for Pages Functions — mirrors the system-design
   playground's serverLogger pattern so feedback diagnostics are greppable. */

export function createServerRequestContext(scope, request) {
  const url = new URL(request.url, 'http://localhost');
  return {
    scope,
    requestId: createRequestId(),
    method: request.method,
    path: `${url.pathname}${url.search}`,
    startedAt: Date.now()
  };
}

export function logServerEvent(context, event, details, level = 'info') {
  const payload = {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    elapsedMs: Date.now() - context.startedAt,
    ...(details ?? {})
  };
  console[level](`[${context.scope}] ${event}`, payload);
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

/* Cloudflare Pages Function — report which feedback pipeline pieces are
   configured, mirroring the system-design playground's feedback diagnostic
   endpoint. */

import { buildFeedbackDiagnostics } from '../../shared/feedback-diagnostics.js';
import { createServerRequestContext, logServerEvent } from '../../shared/server-logger.js';

export function onRequestGet(context) {
  const log = createServerRequestContext(
    'feedback-diagnostic',
    context.request ?? new Request('http://localhost/api/feedback/diagnostic', { method: 'GET' })
  );
  logServerEvent(log, 'request received');
  return jsonResponse(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      diagnostics: buildFeedbackDiagnostics(context.env)
    },
    200,
    log,
    'request completed'
  );
}

function jsonResponse(payload, status, log, event = 'response sent') {
  if (log) {
    logServerEvent(log, event, { status }, status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info');
  }
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

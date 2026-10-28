import { destroySession, portalPayload, sessionInfo } from './_lib/pilot-store.mjs';
import { clearSessionCookie, isSecureRequest } from './_lib/pilot-core.mjs';
import { fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    if (req.method === 'DELETE') {
      await destroySession(req);
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(isSecureRequest(req)) });
    }
    if (req.method !== 'GET') return fail('Method not allowed.', 405);
    const current = await sessionInfo(req);
    if (!current) return json({ role: null });
    if (current.session.role === 'admin') return json({ role: 'admin' });
    return json(portalPayload(current.pharmacy));
  } catch (error) {
    console.error('session lookup failed', error);
    return fail('Could not check your workspace session.', 503);
  }
}

export const config = { path: '/api/pilot/session' };

import { adminLogin } from './_lib/pilot-store.mjs';
import { clientIp, isSecureRequest, isToken, rateLimited, sessionCookie } from './_lib/pilot-core.mjs';
import { body, fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  if (rateLimited(`admin:${clientIp(req)}`, 20)) return fail('Too many attempts. Please wait a few minutes.', 429);
  let payload;
  try { payload = await body(req); } catch (error) { return fail(error.message, 400); }
  if (!isToken(payload?.token)) return fail('This admin link is invalid or has expired.', 404);
  try {
    const session = await adminLogin(payload.token);
    if (!session) return fail('This admin link is invalid, used, or has expired.', 404);
    return json({ role: 'admin' }, 200, { 'Set-Cookie': sessionCookie(session.id, session.maxAge, isSecureRequest(req)) });
  } catch (error) {
    console.error('admin login failed', error);
    return fail('Could not open the admin console. Please try again.', 503);
  }
}

export const config = { path: '/api/admin/login' };

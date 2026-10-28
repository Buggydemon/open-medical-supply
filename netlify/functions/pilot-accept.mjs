import { acceptInvite, portalPayload } from './_lib/pilot-store.mjs';
import { clientIp, isSecureRequest, isToken, rateLimited, sessionCookie } from './_lib/pilot-core.mjs';
import { body, fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  if (rateLimited(`accept:${clientIp(req)}`, 30)) return fail('Too many attempts. Please wait a few minutes.', 429);
  let payload;
  try { payload = await body(req); } catch (error) { return fail(error.message, 400); }
  if (!isToken(payload?.token)) return fail('This link is invalid or has expired. Ask Medstock for a new one.', 404);
  try {
    const result = await acceptInvite(payload.token);
    if (!result) return fail('This link is invalid or has expired. Ask Medstock for a new one.', 404);
    return json(
      { ...portalPayload(result.pharmacy), expiresAt: Date.now() + result.session.maxAge * 1000 },
      200,
      { 'Set-Cookie': sessionCookie(result.session.id, result.session.maxAge, isSecureRequest(req)) },
    );
  } catch (error) {
    console.error('invite accept failed', error);
    return fail('Could not open the workspace. Please try again.', 503);
  }
}

export const config = { path: '/api/pilot/accept' };

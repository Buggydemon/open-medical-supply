import { invitePreview } from './_lib/pilot-store.mjs';
import { isToken, clientIp, rateLimited } from './_lib/pilot-core.mjs';
import { fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'GET') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  if (rateLimited(`invite:${clientIp(req)}`, 40)) return fail('Too many attempts. Please wait a few minutes.', 429);
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!isToken(token)) return fail('This link is invalid or has expired. Ask Medstock for a new one.', 404);
  try {
    const preview = await invitePreview(token);
    return preview ? json(preview) : fail('This link is invalid or has expired. Ask Medstock for a new one.', 404);
  } catch (error) {
    console.error('invite preview failed', error);
    return fail('The workspace is temporarily unavailable. Please try again.', 503);
  }
}

export const config = { path: '/api/pilot/invite' };

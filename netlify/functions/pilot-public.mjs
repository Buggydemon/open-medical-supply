import { publicPayload } from './_lib/pilot-store.mjs';
import { fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'GET') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    return json(await publicPayload());
  } catch (error) {
    console.error('public payload failed', error);
    return fail('Pilot data is temporarily unavailable. Please try again.', 503);
  }
}

export const config = { path: '/api/pilot/public' };

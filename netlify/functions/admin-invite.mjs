import { createAdminInvite, sessionInfo } from './_lib/pilot-store.mjs';
import { fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'POST') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    const current = await sessionInfo(req);
    if (!current || current.session.role !== 'admin') return fail('Admin access required.', 401);
    return json(await createAdminInvite(), 201);
  } catch (error) {
    console.error('admin invite failed', error);
    return fail('Could not create a backup admin link.', 503);
  }
}

export const config = { path: '/api/admin/invite' };

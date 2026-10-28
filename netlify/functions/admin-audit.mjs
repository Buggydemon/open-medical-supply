import { auditEntries, sessionInfo } from './_lib/pilot-store.mjs';
import { fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (req.method !== 'GET') return fail('Method not allowed.', 405);
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    const current = await sessionInfo(req);
    if (!current || current.session.role !== 'admin') return fail('Admin access required.', 401);
    return json({ entries: await auditEntries() });
  } catch (error) {
    console.error('audit lookup failed', error);
    return fail('Could not load the audit log.', 503);
  }
}

export const config = { path: '/api/admin/audit' };

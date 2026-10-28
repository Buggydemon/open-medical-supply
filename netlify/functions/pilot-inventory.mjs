import { portalPayload, saveInventory, sessionInfo } from './_lib/pilot-store.mjs';
import { body, fail, json, sameOrigin } from './_lib/http.mjs';

export default async function handler(req) {
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    const current = await sessionInfo(req);
    if (!current || current.session.role !== 'pharmacy') return fail('Sign in with your pharmacy link first.', 401);
    if (req.method === 'GET') return json({ inventory: current.pharmacy.inventory || [] });
    if (req.method !== 'PUT') return fail('Method not allowed.', 405);
    let payload;
    try { payload = await body(req); } catch (error) { return fail(error.message, 400); }
    const result = await saveInventory(current.pharmacy, payload?.inventory);
    if (result.errors) return fail(result.errors[0], 422);
    return json(portalPayload(result.pharmacy));
  } catch (error) {
    console.error('inventory update failed', error);
    return fail('Could not save inventory. Please try again.', 503);
  }
}

export const config = { path: '/api/pilot/inventory' };

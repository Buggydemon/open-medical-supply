import { adminPayload, createPharmacy, deletePharmacy, newAccessLink, revokePharmacy, sessionInfo } from './_lib/pilot-store.mjs';
import { adminPharmacy } from './_lib/pilot-core.mjs';
import { body, fail, json, sameOrigin } from './_lib/http.mjs';

const ACTIONS = new Set(['new-link', 'revoke', 'delete']);

export default async function handler(req) {
  if (!sameOrigin(req)) return fail('Origin not allowed.', 403);
  try {
    const current = await sessionInfo(req);
    if (!current || current.session.role !== 'admin') return fail('Admin access required.', 401);

    if (req.method === 'GET') return json(await adminPayload());
    if (req.method === 'POST') {
      let payload;
      try { payload = await body(req); } catch (error) { return fail(error.message, 400); }
      const result = await createPharmacy(payload);
      if (result.errors) return fail(result.errors[0], 422);
      return json({ pharmacy: adminPharmacy(result.pharmacy), token: result.token }, 201);
    }
    if (req.method === 'PATCH') {
      let payload;
      try { payload = await body(req); } catch (error) { return fail(error.message, 400); }
      if (!/^[a-f0-9]{12}$/.test(payload?.id || '') || !ACTIONS.has(payload?.action)) return fail('Unknown pharmacy action.', 400);
      if (payload.action === 'new-link') {
        const result = await newAccessLink(payload.id);
        if (!result) return fail('Pharmacy not found.', 404);
        return json({ pharmacy: adminPharmacy(result.pharmacy), token: result.token });
      }
      if (payload.action === 'revoke') {
        const pharmacy = await revokePharmacy(payload.id);
        return pharmacy ? json({ pharmacy: adminPharmacy(pharmacy) }) : fail('Pharmacy not found.', 404);
      }
      const pharmacy = await deletePharmacy(payload.id);
      return pharmacy ? json({ deleted: payload.id }) : fail('Pharmacy not found.', 404);
    }
    return fail('Method not allowed.', 405);
  } catch (error) {
    console.error('admin pharmacies failed', error);
    return fail('Could not complete that admin action. Please try again.', 503);
  }
}

export const config = { path: '/api/admin/pharmacies' };

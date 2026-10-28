import { getStore } from '@netlify/blobs';
import { medicines } from '../../../src/data.js';
import {
  ADMIN_INVITE_DAYS, ADMIN_SESSION_DAYS, DAY_MS, INVITE_DAYS, PHARMACY_SESSION_DAYS, SESSION_COOKIE,
  adminPharmacy, isToken, lastConfirmedAt, newId, newToken, normalisePhone, portalPharmacy,
  publicPharmacy, readCookie, tokenHash, validateInventory, validatePharmacy,
} from './pilot-core.mjs';

const STORE = 'medstock-pilot';
const medicineIds = new Set(medicines.map(medicine => medicine.id));

function store() { return getStore({ name: STORE, consistency: 'strong' }); }
async function getJson(key) {
  try { return await store().get(key, { type: 'json' }); }
  catch (error) {
    if (error?.status === 404 || String(error?.message).includes('404')) return null;
    throw error;
  }
}
function setJson(key, value) { return store().setJSON(key, value); }
function remove(key) { return store().delete(key); }
async function keys(prefix) {
  const { blobs } = await store().list({ prefix });
  return blobs.map(blob => blob.key);
}
async function audit(action, targetId, summary, actor = 'admin') {
  const key = `audit/${String(Date.now()).padStart(14, '0')}-${newToken().slice(0, 8)}`;
  await setJson(key, { at: Date.now(), actor, action, targetId, summary });
}

function inviteRecord(pharmacy, token) {
  return store().setJSON(`invites/${tokenHash(token)}`, { pharmacyId: pharmacy.id, createdAt: Date.now(), expiresAt: pharmacy.inviteExpiresAt });
}

async function createSession(role, pharmacy = null) {
  const id = newToken();
  const days = role === 'admin' ? ADMIN_SESSION_DAYS : PHARMACY_SESSION_DAYS;
  await setJson(`sessions/${id}`, {
    id, role, pharmacyId: pharmacy?.id || null, version: pharmacy?.sessionVersion || null,
    createdAt: Date.now(), expiresAt: Date.now() + days * DAY_MS,
  });
  return { id, maxAge: days * 86400 };
}

export async function sessionInfo(req) {
  const id = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (!isToken(id)) return null;
  const session = await getJson(`sessions/${id}`);
  if (!session) return null;
  if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    await remove(`sessions/${id}`).catch(() => {});
    return null;
  }
  if (session.role === 'admin') return { session };
  const pharmacy = await getJson(`pharmacies/${session.pharmacyId}`);
  if (!pharmacy || pharmacy.status !== 'active' || pharmacy.sessionVersion !== session.version) {
    await remove(`sessions/${id}`).catch(() => {});
    return null;
  }
  return { session, pharmacy };
}

export async function destroySession(req) {
  const id = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (isToken(id)) await remove(`sessions/${id}`).catch(() => {});
}

export async function publicPayload() {
  const pharmacies = await Promise.all((await keys('pharmacies/')).map(getJson));
  return {
    serverTime: Date.now(),
    pharmacies: pharmacies.filter(Boolean)
      .filter(pharmacy => pharmacy.status === 'active')
      .map(publicPharmacy)
      .filter(pharmacy => pharmacy.inventory.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function invitePreview(token) {
  if (!isToken(token)) return null;
  const invite = await getJson(`invites/${tokenHash(token)}`);
  if (!invite || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= Date.now()) return null;
  const pharmacy = await getJson(`pharmacies/${invite.pharmacyId}`);
  if (!pharmacy || pharmacy.status === 'revoked') return null;
  return { name: pharmacy.name, city: pharmacy.city, area: pharmacy.area, expiresAt: invite.expiresAt };
}

export async function acceptInvite(token) {
  if (!isToken(token)) return null;
  const invite = await getJson(`invites/${tokenHash(token)}`);
  if (!invite || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= Date.now()) return null;
  const pharmacy = await getJson(`pharmacies/${invite.pharmacyId}`);
  if (!pharmacy || pharmacy.status === 'revoked') return null;
  const now = Date.now();
  const updated = pharmacy.status === 'active' ? pharmacy : { ...pharmacy, status: 'active', activatedAt: pharmacy.activatedAt || now, updatedAt: now };
  await setJson(`pharmacies/${pharmacy.id}`, updated);
  const session = await createSession('pharmacy', updated);
  await audit('pharmacy.open', pharmacy.id, `${pharmacy.name} opened the workspace`, 'pharmacy');
  return { session, pharmacy: updated };
}

export async function adminLogin(token) {
  if (!isToken(token)) return null;
  const key = `admin-invites/${tokenHash(token)}`;
  const invite = await getJson(key);
  if (!invite || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= Date.now()) return null;
  await remove(key);
  const session = await createSession('admin');
  await audit('admin.login', 'admin', 'Admin signed in');
  return session;
}

export async function createAdminInvite() {
  const token = newToken();
  const expiresAt = Date.now() + ADMIN_INVITE_DAYS * DAY_MS;
  await setJson(`admin-invites/${tokenHash(token)}`, { createdAt: Date.now(), expiresAt });
  await audit('admin.invite', 'admin', 'Backup admin sign-in link created');
  return { token, expiresAt };
}

export async function listPharmacies() {
  const pharmacies = await Promise.all((await keys('pharmacies/')).map(getJson));
  return pharmacies.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function adminPayload() {
  const pharmacies = await listPharmacies();
  return {
    serverTime: Date.now(),
    pharmacies: pharmacies.map(adminPharmacy),
    stats: {
      active: pharmacies.filter(p => p.status === 'active').length,
      invited: pharmacies.filter(p => p.status === 'invited').length,
      revoked: pharmacies.filter(p => p.status === 'revoked').length,
      listed: pharmacies.filter(p => p.status === 'active').reduce((sum, p) => sum + (p.inventory || []).filter(r => r.price > 0).length, 0),
    },
  };
}

export async function createPharmacy(input) {
  const { value, errors } = validatePharmacy(input);
  if (errors.length) return { errors };
  const now = Date.now();
  const token = newToken();
  const pharmacy = {
    ...value, id: newId(), status: 'invited', createdAt: now, updatedAt: now, activatedAt: null,
    licenceCheckedAt: now, licenceCheckedBy: 'admin', sessionVersion: 1,
    inviteHash: tokenHash(token), inviteExpiresAt: now + INVITE_DAYS * DAY_MS, inventory: [],
  };
  await setJson(`pharmacies/${pharmacy.id}`, pharmacy);
  await inviteRecord(pharmacy, token);
  await audit('pharmacy.create', pharmacy.id, `${pharmacy.name} created after licence check`);
  return { pharmacy, token };
}

export async function newAccessLink(id) {
  const pharmacy = await getJson(`pharmacies/${id}`);
  if (!pharmacy) return null;
  if (pharmacy.inviteHash) await remove(`invites/${pharmacy.inviteHash}`).catch(() => {});
  const token = newToken();
  const now = Date.now();
  const updated = {
    ...pharmacy, status: pharmacy.status === 'revoked' ? 'invited' : pharmacy.status,
    sessionVersion: (pharmacy.sessionVersion || 1) + 1, inviteHash: tokenHash(token),
    inviteExpiresAt: now + INVITE_DAYS * DAY_MS, updatedAt: now,
  };
  await setJson(`pharmacies/${id}`, updated);
  await inviteRecord(updated, token);
  await audit('pharmacy.invite', id, `New access link created for ${pharmacy.name}`);
  return { pharmacy: updated, token };
}

export async function revokePharmacy(id) {
  const pharmacy = await getJson(`pharmacies/${id}`);
  if (!pharmacy) return null;
  if (pharmacy.inviteHash) await remove(`invites/${pharmacy.inviteHash}`).catch(() => {});
  const updated = {
    ...pharmacy, status: 'revoked', sessionVersion: (pharmacy.sessionVersion || 1) + 1,
    inviteHash: null, inviteExpiresAt: null, updatedAt: Date.now(),
  };
  await setJson(`pharmacies/${id}`, updated);
  await audit('pharmacy.revoke', id, `${pharmacy.name} revoked from the pilot`);
  return updated;
}

export async function deletePharmacy(id) {
  const pharmacy = await getJson(`pharmacies/${id}`);
  if (!pharmacy) return null;
  if (pharmacy.inviteHash) await remove(`invites/${pharmacy.inviteHash}`).catch(() => {});
  const sessions = await Promise.all((await keys('sessions/')).map(getJson));
  await Promise.all(sessions.filter(session => session?.pharmacyId === id).map(session => remove(`sessions/${session.id}`)));
  await remove(`pharmacies/${id}`);
  await audit('pharmacy.delete', id, `${pharmacy.name} deleted`);
  return pharmacy;
}

export async function saveInventory(pharmacy, input) {
  const { errors, records } = validateInventory(input, medicineIds);
  if (errors.length) return { errors };
  const now = Date.now();
  const previous = new Map((pharmacy.inventory || []).map(row => [row.medicineId, row]));
  const inventory = records.map(record => {
    const old = previous.get(record.medicineId);
    const unchanged = old && old.quantity === record.quantity && old.price === record.price;
    return { ...record, updatedAt: unchanged ? old.updatedAt : now, confirmedAt: now };
  });
  const updated = { ...pharmacy, inventory, updatedAt: now };
  await setJson(`pharmacies/${pharmacy.id}`, updated);
  await audit('inventory.save', pharmacy.id, `${pharmacy.name}: ${inventory.length} medicines listed`, 'pharmacy');
  return { pharmacy: updated };
}

export async function auditEntries(limit = 60) {
  const entries = await Promise.all((await keys('audit/')).sort().reverse().slice(0, limit).map(getJson));
  return entries.filter(Boolean);
}

export function portalPayload(pharmacy) { return { role: 'pharmacy', pharmacy: portalPharmacy(pharmacy) }; }

export { lastConfirmedAt, normalisePhone };

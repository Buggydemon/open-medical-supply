import { createHash, randomBytes } from 'node:crypto';

export const CITIES = ['Lagos', 'Ibadan'];
export const SESSION_COOKIE = 'medstock_pilot';
export const DAY_MS = 86400000;
export const INVITE_DAYS = 30;
export const ADMIN_INVITE_DAYS = 7;
export const PHARMACY_SESSION_DAYS = 30;
export const ADMIN_SESSION_DAYS = 7;

export function newToken() { return randomBytes(32).toString('base64url'); }
export function tokenHash(value) { return createHash('sha256').update(String(value)).digest('hex'); }
export function isToken(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function newId() { return randomBytes(6).toString('hex'); }

export function clean(value, max) { return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max); }

export function normalisePhone(value, required = true) {
  const raw = clean(value, 30);
  if (!raw) return required ? null : '';
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

export function waNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

export function validatePharmacy(input) {
  const value = {
    name: clean(input?.name, 80),
    city: clean(input?.city, 20),
    area: clean(input?.area, 60),
    address: clean(input?.address, 160),
    phone: normalisePhone(input?.phone),
    whatsapp: normalisePhone(input?.whatsapp, false),
    licenceNumber: clean(input?.licenceNumber, 40).toUpperCase(),
    superintendent: clean(input?.superintendent, 80),
  };
  const errors = [];
  if (value.name.length < 2) errors.push('Enter the pharmacy name.');
  if (!CITIES.includes(value.city)) errors.push('Choose Lagos or Ibadan.');
  if (value.area.length < 2) errors.push('Enter the pharmacy area.');
  if (value.address.length < 5) errors.push('Enter the street address.');
  if (!value.phone) errors.push('Enter a valid phone number.');
  if (!value.whatsapp) value.whatsapp = value.phone || '';
  if (value.licenceNumber.length < 4) errors.push('Enter the PCN premises registration number.');
  if (value.superintendent.length < 2) errors.push('Enter the superintendent pharmacist name.');
  if (input?.licenceChecked !== true) errors.push('Confirm that the licence and superintendent were checked.');
  return { value, errors };
}

export function validateInventory(input, medicineIds) {
  if (!Array.isArray(input)) return { errors: ['Inventory must be a list.'] };
  if (input.length > medicineIds.size) return { errors: ['Too many inventory records.'] };
  const seen = new Set();
  const records = [];
  for (const row of input) {
    if (!row || typeof row !== 'object') return { errors: ['Invalid inventory record.'] };
    const medicineId = clean(row.medicineId, 60);
    if (!medicineIds.has(medicineId)) return { errors: ['Unknown medicine in inventory.'] };
    if (seen.has(medicineId)) return { errors: ['Duplicate medicine in inventory.'] };
    seen.add(medicineId);
    const quantity = Number(row.quantity);
    const price = Number(row.price);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return { errors: ['Quantity must be a whole number from 0 to 100,000.'] };
    if (!Number.isFinite(price) || price <= 0 || price > 1000000) return { errors: ['Price must be between ₦0.01 and ₦1,000,000 per pack.'] };
    records.push({ medicineId, quantity, price: Math.round(price * 100) / 100 });
  }
  return { errors: [], records };
}

export function lastConfirmedAt(inventory) {
  return (inventory || []).reduce((latest, row) => Math.max(latest, Number(row.confirmedAt) || Number(row.updatedAt) || 0), 0) || null;
}

export function publicPharmacy(pharmacy) {
  const inventory = (pharmacy.inventory || []).filter(row => row.price > 0).map(row => ({
    medicineId: row.medicineId, quantity: row.quantity, price: row.price,
    updatedAt: row.updatedAt, confirmedAt: row.confirmedAt,
  }));
  return {
    id: pharmacy.id, name: pharmacy.name, city: pharmacy.city, area: pharmacy.area,
    address: pharmacy.address, phone: pharmacy.phone, whatsapp: pharmacy.whatsapp,
    licenceCheckedAt: pharmacy.licenceCheckedAt, inventory,
    lastConfirmedAt: lastConfirmedAt(inventory), listedAt: pharmacy.activatedAt || pharmacy.createdAt,
  };
}

export function adminPharmacy(pharmacy) {
  return {
    id: pharmacy.id, name: pharmacy.name, city: pharmacy.city, area: pharmacy.area,
    address: pharmacy.address, phone: pharmacy.phone, whatsapp: pharmacy.whatsapp,
    licenceNumber: pharmacy.licenceNumber, superintendent: pharmacy.superintendent,
    licenceCheckedAt: pharmacy.licenceCheckedAt, status: pharmacy.status,
    createdAt: pharmacy.createdAt, activatedAt: pharmacy.activatedAt || null,
    updatedAt: pharmacy.updatedAt, inviteExpiresAt: pharmacy.inviteExpiresAt || null,
    inventoryCount: (pharmacy.inventory || []).filter(row => row.price > 0).length,
    lastConfirmedAt: lastConfirmedAt(pharmacy.inventory),
  };
}

export function portalPharmacy(pharmacy) {
  return {
    id: pharmacy.id, name: pharmacy.name, city: pharmacy.city, area: pharmacy.area,
    address: pharmacy.address, phone: pharmacy.phone, whatsapp: pharmacy.whatsapp,
    licenceCheckedAt: pharmacy.licenceCheckedAt, activatedAt: pharmacy.activatedAt || null,
    inventory: (pharmacy.inventory || []).map(row => ({
      medicineId: row.medicineId, quantity: row.quantity, price: row.price,
      updatedAt: row.updatedAt, confirmedAt: row.confirmedAt,
    })),
  };
}

export function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export function isSecureRequest(req) {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

export function sessionCookie(id, maxAgeSeconds, secure) {
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

const attempts = new Map();
export function rateLimited(key, limit = 20, windowMs = 600000) {
  const now = Date.now();
  const bucket = attempts.get(key);
  if (!bucket || bucket.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  bucket.count += 1;
  return bucket.count > limit;
}

export function clientIp(req) {
  return req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

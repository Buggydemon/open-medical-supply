import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPharmacy, clearSessionCookie, isSecureRequest, isToken, lastConfirmedAt, newId, newToken,
  normalisePhone, portalPharmacy, publicPharmacy, rateLimited, readCookie, sessionCookie, tokenHash,
  validateInventory, validatePharmacy, waNumber,
} from '../netlify/functions/_lib/pilot-core.mjs';
import { medicines } from '../src/data.js';

const medicineIds = new Set(medicines.map(medicine => medicine.id));
const validPharmacy = {
  name: 'Everwell Pharmacy',
  city: 'Lagos',
  area: 'Ikeja',
  address: '18 Example Way, Ikeja',
  phone: '0803 123 4567',
  whatsapp: '',
  licenceNumber: ' pcn-lag-001 ',
  superintendent: 'A. Pharmacist',
  licenceChecked: true,
};

test('tokens are url-safe, unique and hash deterministically', () => {
  const token = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isToken(token), true);
  assert.equal(isToken(`${token}x`), false);
  assert.equal(isToken('short'), false);
  assert.notEqual(newToken(), newToken());
  assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
  assert.equal(tokenHash(token), tokenHash(token));
  assert.match(newId(), /^[a-f0-9]{12}$/);
});

test('phone numbers normalise for links and WhatsApp', () => {
  assert.equal(normalisePhone('0803 123 4567'), '08031234567');
  assert.equal(normalisePhone('+234 803 123 4567'), '+2348031234567');
  assert.equal(normalisePhone(''), null);
  assert.equal(normalisePhone('', false), '');
  assert.equal(normalisePhone('12345'), null);
  assert.equal(waNumber('0803 123 4567'), '2348031234567');
  assert.equal(waNumber('+234 803 123 4567'), '2348031234567');
  assert.equal(waNumber('2348031234567'), '2348031234567');
  assert.equal(waNumber(''), '');
});

test('pharmacy validation accepts a checked Lagos pharmacy', () => {
  const { value, errors } = validatePharmacy(validPharmacy);
  assert.deepEqual(errors, []);
  assert.equal(value.licenceNumber, 'PCN-LAG-001');
  assert.equal(value.whatsapp, value.phone);
  assert.equal(value.name, 'Everwell Pharmacy');
});

test('pharmacy validation requires a manual licence check and known city', () => {
  assert.match(validatePharmacy({ ...validPharmacy, licenceChecked: false }).errors.join(' '), /Confirm/);
  assert.match(validatePharmacy({ ...validPharmacy, city: 'Abuja' }).errors.join(' '), /Lagos or Ibadan/);
  assert.match(validatePharmacy({ ...validPharmacy, phone: '12' }).errors.join(' '), /phone/);
  assert.match(validatePharmacy({ ...validPharmacy, licenceNumber: 'PC' }).errors.join(' '), /premises/);
  assert.match(validatePharmacy({ ...validPharmacy, superintendent: '' }).errors.join(' '), /superintendent/);
});

test('inventory validation normalises valid records', () => {
  const { errors, records } = validateInventory([
    { medicineId: 'metformin', quantity: '20', price: '2500.456' },
    { medicineId: 'insulin', quantity: 0, price: 14500 },
  ], medicineIds);
  assert.deepEqual(errors, []);
  assert.equal(records[0].quantity, 20);
  assert.equal(records[0].price, 2500.46);
  assert.equal(records[1].quantity, 0);
});

test('inventory validation rejects unsafe or malformed rows', () => {
  const bad = [
    [null],
    [{ medicineId: 'fake', quantity: 1, price: 100 }],
    [{ medicineId: 'metformin', quantity: 1.5, price: 100 }],
    [{ medicineId: 'metformin', quantity: -1, price: 100 }],
    [{ medicineId: 'metformin', quantity: 1, price: 0 }],
    [{ medicineId: 'metformin', quantity: 1, price: 1000001 }],
    [{ medicineId: 'metformin', quantity: 1, price: 1 }, { medicineId: 'metformin', quantity: 2, price: 2 }],
  ];
  for (const rows of bad) assert.ok(validateInventory(rows, medicineIds).errors.length > 0);
  assert.ok(validateInventory(Array.from({ length: 21 }, (_, index) => ({ medicineId: medicines[index % 20].id, quantity: 1, price: 1 })), medicineIds).errors.length > 0);
  assert.ok(validateInventory('nope', medicineIds).errors.length > 0);
});

test('confirmation timestamp uses the latest item record', () => {
  assert.equal(lastConfirmedAt([]), null);
  assert.equal(lastConfirmedAt([{ confirmedAt: 120 }, { updatedAt: 300 }]), 300);
  assert.equal(lastConfirmedAt([{ confirmedAt: 50 }, { updatedAt: 90 }]), 90);
});

test('public and portal payloads never expose licence details', () => {
  const pharmacy = {
    ...validPharmacy,
    id: 'abc123def456',
    licenceCheckedAt: 123,
    activatedAt: 456,
    status: 'active',
    inventory: [
      { medicineId: 'metformin', quantity: 10, price: 2500, updatedAt: 100, confirmedAt: 200 },
      { medicineId: 'insulin', quantity: 0, price: 0, updatedAt: 100 },
    ],
  };
  const publicRecord = publicPharmacy(pharmacy);
  assert.equal(publicRecord.inventory.length, 1);
  assert.equal(publicRecord.inventory[0].medicineId, 'metformin');
  assert.equal(publicRecord.lastConfirmedAt, 200);
  assert.equal(publicRecord.listedAt, 456);
  assert.equal('licenceNumber' in publicRecord, false);
  assert.equal('superintendent' in publicRecord, false);
  assert.equal('licenceNumber' in portalPharmacy(pharmacy), false);
  assert.equal(adminPharmacy(pharmacy).licenceNumber, ' pcn-lag-001 ');
  assert.equal(adminPharmacy(pharmacy).inventoryCount, 1);
});

test('cookies are read and written with hardened attributes', () => {
  assert.equal(readCookie('a=1; medstock_pilot=abc=def; b=2', 'medstock_pilot'), 'abc=def');
  assert.equal(readCookie('a=1', 'medstock_pilot'), '');
  assert.equal(readCookie(null, 'medstock_pilot'), '');
  const cookie = sessionCookie('token', 3600, true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=3600/);
  assert.doesNotMatch(sessionCookie('token', 3600, false), /Secure/);
  assert.match(clearSessionCookie(false), /Max-Age=0/);
});

test('secure request detection honours proxy headers', () => {
  assert.equal(isSecureRequest(new Request('https://example.com/api')), true);
  assert.equal(isSecureRequest(new Request('http://example.com/api')), false);
  assert.equal(isSecureRequest(new Request('http://example.com/api', { headers: { 'x-forwarded-proto': 'https' } })), true);
});

test('rate limiter trips after the configured limit', () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  for (let index = 0; index < 3; index++) assert.equal(rateLimited(key, 3), false);
  assert.equal(rateLimited(key, 3), true);
});

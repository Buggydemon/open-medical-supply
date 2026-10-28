export { medicines } from '../data.js';
export { money } from '../lib.js';

export const DAY_MS = 86400000;

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
  } catch {
    const error = new Error('You appear to be offline. Check your connection and try again.');
    error.status = 0;
    throw error;
  }
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error || `Something went wrong (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function ago(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return 'not yet';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function dateLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return 'not set';
  return new Date(timestamp).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isFresh(timestamp, now = Date.now()) {
  return Number.isFinite(timestamp) && now - timestamp < DAY_MS;
}

export function confirmedAt(item) {
  return item?.confirmedAt || item?.updatedAt || 0;
}

export function stockLabel(quantity) {
  if (!(quantity > 0)) return 'Out of stock';
  if (quantity < 10) return 'Low stock';
  return 'In stock';
}

export function waDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

export function waLink(phone, message) {
  const digits = waDigits(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : '';
}

export function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function initials(name) {
  return String(name || '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');
}

export function extractToken(value) {
  const text = String(value || '').trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(text)) return text;
  const match = text.match(/[?&]token=([A-Za-z0-9_-]{43})(?:[&#\s]|$)/);
  return match ? match[1] : '';
}

export function inviteUrl(token, route = 'join') {
  return `${location.origin}/pilot.html#/${route}?token=${encodeURIComponent(token)}`;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  window.prompt('Copy this private link:', text);
  return false;
}
